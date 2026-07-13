import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { compileShot, createProjectFromBrief } from "../src/engine.mjs";
import {
  canonicalImperfectionAnchorOverrides,
  candidateImperfectionAnchors,
  compatibleImperfectionAnchorOverrides,
  imperfectionAnchorBank,
  resolveImperfectionAnchors,
  toggleImperfectionAnchorOverride,
} from "../src/imperfection-anchors.mjs";

function valueAtJsonPath(root, path) {
  let value = root;
  for (const match of path.matchAll(/\.([^.[\]]+)|\[(\d+)\]/g)) {
    value = value?.[match[1] ?? Number(match[2])];
  }
  return value;
}

test("anchor bank keeps every phrase bound to immutable corpus evidence", async () => {
  const bank = imperfectionAnchorBank();
  const sources = new Map();
  assert.equal(bank.schema, "auteur-imperfection-anchor-bank/v1");
  assert.ok(bank.entries.length >= 12);
  for (const source of bank.sources) {
    const bytes = await readFile(new URL(`../${source.file}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex").toUpperCase(), source.sha256);
    sources.set(source.file, JSON.parse(bytes.toString("utf8")));
  }
  for (const entry of bank.entries) {
    assert.ok(entry.anchorText.trim());
    assert.ok(entry.contentTypes.length > 0);
    assert.ok(entry.contextTags.length > 0);
    assert.equal(entry.providerClaims, "UNKNOWN");
    assert.equal(entry.productLimits, "UNKNOWN");
    assert.ok(entry.evidence.length > 0);
    for (const evidence of entry.evidence) {
      assert.match(evidence.sourceSha256, /^[A-F0-9]{64}$/);
      assert.match(evidence.jsonPath, /^\$\./);
      assert.ok(evidence.exactPhrase.trim());
      assert.ok(bank.sources.some((source) => source.file === evidence.sourceFile && source.sha256 === evidence.sourceSha256));
      const citedValue = valueAtJsonPath(sources.get(evidence.sourceFile), evidence.jsonPath);
      assert.ok(citedValue !== undefined, `${evidence.jsonPath} must resolve`);
      assert.ok(JSON.stringify(citedValue).includes(evidence.exactPhrase), `${entry.id} must quote its source verbatim`);
    }
  }
});

test("selector chooses two to four unique route and context matches", () => {
  const automotive = createProjectFromBrief("A performance sedan crosses wet asphalt in hard rain", { title: "Road" });
  const automotiveShot = automotive.shots[0];
  const anchors = resolveImperfectionAnchors(automotive, automotiveShot, "automotive");
  assert.equal(anchors.length, 3);
  assert.equal(new Set(anchors.map((value) => value.toLowerCase())).size, anchors.length);
  assert.ok(anchors.includes("wet asphalt"));
  assert.ok(anchors.includes("water spray"));
  assert.ok(candidateImperfectionAnchors(automotive, automotiveShot, "automotive").every((entry) => entry.contentTypes.includes("automotive")));

  const product = createProjectFromBrief("A machined watch reveals brushed metal in workshop light", { title: "Watch", route: "Product ad" });
  const productAnchors = resolveImperfectionAnchors(product, product.shots[0], "product");
  assert.equal(productAnchors.length, 3);
  assert.ok(productAnchors.includes("brushed metal"));
  assert.ok(productAnchors.includes("dust motes in light"));

  const portrait = createProjectFromBrief("An intimate portrait monologue studies a performer's face and hands", { title: "Portrait" });
  const portraitAnchors = resolveImperfectionAnchors(portrait, portrait.shots[0], "character");
  assert.equal(portraitAnchors.length, 3);
  assert.ok(portraitAnchors.includes("real pores, peach-fuzz, uneven tone"));

  const routeCases = [
    ["A singer performs a fashion film", "editorial"],
    ["A colossal figure walks through foggy city mist", "vfx"],
    ["A dew-covered leaf reveals a hidden forest", "nature"],
  ];
  for (const [brief, route] of routeCases) {
    const routed = createProjectFromBrief(brief, { title: route });
    const routedAnchors = resolveImperfectionAnchors(routed, routed.shots[0], route);
    assert.ok(routedAnchors.length >= 2 && routedAnchors.length <= 4, `${route} should resolve 2-4 anchors`);
  }
});

test("manual shot overrides accept cited bank entries only and deduplicate canonically", () => {
  const project = createProjectFromBrief("A pastry campaign", { title: "Pastry", route: "Food ad" });
  const shot = {
    ...project.shots[0],
    imperfectionAnchors: ["steam rising", "STEAM RISING", "natural textures of food", "realistic textures of croissant layers", "invented surface claim"],
  };
  assert.deepEqual(resolveImperfectionAnchors(project, shot, "food"), [
    "steam rising",
    "natural textures of food",
    "realistic textures of croissant layers",
  ]);
});

test("four invalid stored anchors cannot freeze the cited override controls", () => {
  const project = createProjectFromBrief("A machined watch in workshop light", { title: "Recovery", route: "Product ad" });
  const shot = { ...project.shots[0], imperfectionAnchors: ["invented one", "invented two", "invented three", "invented four"] };
  assert.deepEqual(canonicalImperfectionAnchorOverrides(shot.imperfectionAnchors), []);
  const auto = resolveImperfectionAnchors(project, shot, "product");
  const next = toggleImperfectionAnchorOverride(project, shot, "product", auto[0]);
  assert.equal(next.length, 2);
  assert.ok(!next.includes(auto[0]));
  assert.ok(next.every((value) => imperfectionAnchorBank().entries.some((entry) => entry.anchorText === value)));
});

test("four cited but wrong-route anchors cannot leak into or freeze a shot", () => {
  const project = createProjectFromBrief("A machined watch in workshop light", { title: "Route recovery", route: "Product ad" });
  const shot = {
    ...project.shots[0],
    imperfectionAnchors: ["steam rising", "natural textures of food", "realistic textures of croissant layers", "wet asphalt"],
  };
  assert.deepEqual(compatibleImperfectionAnchorOverrides(project, shot, "product"), []);
  const auto = resolveImperfectionAnchors(project, shot, "product");
  assert.equal(auto.length, 3);
  assert.ok(auto.every((value) => !shot.imperfectionAnchors.includes(value)));
  const next = toggleImperfectionAnchorOverride(project, shot, "product", auto[0]);
  assert.equal(next.length, 2);
  assert.ok(!next.includes(auto[0]));
  const packet = compileShot(project, shot);
  assert.doesNotMatch(packet.videoPrompt, /steam rising|natural textures of food|croissant layers|wet asphalt/i);
  assert.match(packet.videoPrompt, /dust motes in light|brushed metal|realistic shading and reflections/i);
});

test("compiler injects matched anchors into both visual prompts and rejects synthetic polish", () => {
  const project = createProjectFromBrief("A machined watch in a workshop", { title: "Truth", route: "Product ad" });
  const packet = compileShot(project, project.shots[0]);
  assert.match(packet.framePrompt, /Physical imperfection anchors: .*brushed metal/i);
  assert.match(packet.videoPrompt, /Physical imperfection anchors: .*brushed metal/i);
  assert.match(packet.negativePrompt, /waxy or plastic skin/i);
  assert.match(packet.negativePrompt, /stock-footage look/i);
});

test("Inspector exposes a per-shot 2-4 anchor override and live packet update path", async () => {
  const source = await readFile(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
  assert.match(source, /aria-label="Physical imperfection anchors"/);
  assert.match(source, /Shot override · select 2–4/);
  assert.match(source, /toggleImperfectionAnchorOverride\(project, shot, route, anchorText\)/);
  assert.match(source, /updateShot\(shot\.id, \{ imperfectionAnchors: \[\] \}\)/);
  assert.match(source, /aria-label="Live video prompt">\{livePacket\.videoPrompt\}/);
});
