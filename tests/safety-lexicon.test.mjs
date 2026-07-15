import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { compileShot, createProjectFromBrief } from "../src/engine.mjs";
import {
  applySafetyLexiconSwap,
  createSafetyLexiconVersion,
  safetyLexicon,
  scanProjectSafety,
  scanSafetyLexicon,
} from "../src/safety-lexicon.mjs";

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();

test("safety lexicon entries remain bound to LF-normalized corpus workflow evidence", async () => {
  const bank = safetyLexicon();
  assert.equal(bank.schema, "auteur-safety-lexicon/v1");
  assert.equal(bank.policy.mode, "advisory");
  assert.equal(bank.policy.observedWorkflowEvidence, "CORPUS");
  assert.equal(bank.policy.rejectionEvidence, "UNKNOWN");
  assert.equal(bank.policy.providerClaims, "UNKNOWN");
  assert.ok(bank.entries.length > 0);
  for (const entry of bank.entries) {
    assert.ok(entry.term.trim());
    assert.ok(entry.replacement.trim());
    assert.ok(entry.compactReplacement.trim());
    assert.ok(entry.predicateReplacement.trim());
    assert.ok(entry.providers.length > 0);
    assert.equal(entry.observedWorkflowEvidence, "CORPUS");
    assert.equal(entry.rejectionEvidence, "UNKNOWN");
    assert.equal(entry.providerClaims, "UNKNOWN");
    assert.equal(entry.productLimits, "UNKNOWN");
    assert.ok(entry.evidence.length > 0);
    for (const evidence of entry.evidence) {
      assert.equal(sha256(evidence.exactPhrase), evidence.exactPhraseSha256);
      assert.ok(bank.sources.some((source) => source.file === evidence.sourceFile && source.sha256 === evidence.sourceSha256 && source.hashNormalization === "LF"));
    }
    assert.ok(entry.evidence.some((evidence) => evidence.role === "term" && evidence.exactPhrase.toLowerCase().includes(entry.term.toLowerCase())));
    assert.ok(entry.evidence.some((evidence) => evidence.role === "replacement" && evidence.exactPhrase.includes(entry.replacement)));
    assert.ok(entry.evidence.some((evidence) => evidence.role === "compactReplacement" && evidence.exactPhrase.includes(entry.compactReplacement)));
    assert.ok(entry.evidence.some((evidence) => evidence.role === "predicateReplacement" && evidence.exactPhrase.includes(entry.predicateReplacement)));
  }

  // The monorepo checkout carries the source KBs. Standalone auteur-os clones
  // still verify the immutable pins and quote hashes above without vendoring 40 MB.
  for (const source of bank.sources) {
    const sourceUrl = new URL(`../../../../../${source.file}`, import.meta.url);
    let bytes;
    try {
      bytes = await readFile(sourceUrl);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const canonical = bytes.toString("utf8").replace(/\r\n/g, "\n");
    assert.equal(sha256(canonical), source.sha256);
    for (const entry of bank.entries) {
      for (const evidence of entry.evidence.filter((item) => item.sourceFile === source.file)) {
        assert.ok(canonical.includes(evidence.exactPhrase), `${evidence.section} must retain its exact quote`);
      }
    }
  }
});

test("ignition is flagged for Veo only and compile attaches provider-aware findings", () => {
  const packet = {
    framePrompt: "A dashboard waits in darkness.",
    videoPrompt: "At ignition, the engine settles and the headlamps rise.",
    audioPrompt: "Ignition catches in sync with the start button.",
    negativePrompt: "No text.",
    qcGates: [],
  };
  const veoHits = scanSafetyLexicon(packet, "Veo 3.1 / Flow");
  assert.equal(veoHits.length, 2);
  assert.ok(veoHits.every((hit) => hit.entryId === "safety.veo.ignition"));
  assert.deepEqual(scanSafetyLexicon(packet, "Sora"), []);

  const project = createProjectFromBrief("A performance car wakes before dawn", { title: "Ignition test", route: "Automotive", provider: "Veo 3.1 / Flow" });
  const shot = { ...project.shots[0], description: "The engine ignition wakes the dark cockpit", action: "Ignition starts the engine" };
  const compiled = compileShot(project, shot);
  assert.ok(compiled.safetyHits.some((hit) => hit.term === "ignition"));
});

test("one-click swap creates a corpus-reworded immutable packet version with provenance", () => {
  const project = createProjectFromBrief("A performance car wakes before dawn", { title: "Version test", route: "Automotive", provider: "Veo 3.1 / Flow" });
  const shot = structuredClone(project.shots[0]);
  const original = {
    ...shot.versions[0],
    videoPrompt: "At ignition, the engine wakes.",
    audioPrompt: "Ignition catches at the visible button press.",
    negativePrompt: "No ignition artifacts.",
  };
  shot.versions = [original];
  shot.activeVersionId = original.id;
  const createdAt = "2026-07-14T18:00:00.000Z";
  const version = createSafetyLexiconVersion(shot, shot.provider, "safety.veo.ignition", createdAt);
  assert.ok(version);
  assert.equal(version.label, "v2");
  assert.equal(version.source, "safety-lexicon-swap");
  assert.match(version.notes, /Corpus wording swap: "ignition" -> "headlight\/DRL activation/);
  assert.match(version.notes, /rejection evidence: UNKNOWN/);
  assert.match(version.notes, /SHA256 984E5FEE/);
  assert.doesNotMatch(version.videoPrompt, /ignition/i);
  assert.match(version.videoPrompt, /headlight\/DRL activation/i);
  assert.equal(version.videoPrompt, "At engine fire-up, the engine wakes. Visible response: headlight/DRL activation, exhaust pulse with heat haze, gentle suspension response.");
  assert.equal(version.audioPrompt, "Engine fires at the visible button press.");
  assert.equal(version.negativePrompt, "No engine fire-up artifacts.");
  assert.doesNotMatch(version.negativePrompt, /Visible response:/i);
  assert.doesNotMatch(`${version.videoPrompt} ${version.audioPrompt}`, /response catches|response, the engine/i);
  assert.equal(original.videoPrompt, "At ignition, the engine wakes.");
  assert.deepEqual(scanSafetyLexicon(version, shot.provider), []);

  const noOp = applySafetyLexiconSwap(version, shot.provider, "safety.veo.ignition");
  assert.equal(noOp.changed, false);
});

test("pre-flight scanner stays below 100ms on a 50-shot project", () => {
  const base = createProjectFromBrief("A performance car ignition sequence", { title: "Benchmark", route: "Automotive", provider: "Veo 3.1 / Flow" });
  const source = base.shots[0];
  const version = { ...source.versions[0], videoPrompt: "Ignition reveals the vehicle through light and motion." };
  const shots = Array.from({ length: 50 }, (_, index) => ({
    ...source,
    id: `benchmark-shot-${index}`,
    title: `Benchmark shot ${index + 1}`,
    versions: [{ ...version, id: `benchmark-version-${index}` }],
    activeVersionId: `benchmark-version-${index}`,
  }));
  const project = { ...base, shots };
  scanProjectSafety(project);
  const started = performance.now();
  const findings = scanProjectSafety(project);
  const elapsed = performance.now() - started;
  assert.equal(findings.length, 50);
  assert.ok(elapsed < 100, `50-shot scan took ${elapsed.toFixed(2)}ms`);
});

test("Review exposes the advisory swap and production pre-flight rescans active versions", async () => {
  const source = await readFile(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
  assert.match(source, /scanProjectSafety\(useStudio\.getState\(\)\.project\)/);
  assert.match(source, /aria-label="Corpus safety pre-flight"/);
  assert.match(source, /applySafetySwap\(shot\.id, hit\.entryId\)/);
  assert.match(source, /Use corpus wording/);
});
