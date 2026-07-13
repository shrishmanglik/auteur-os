import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeProductionBrief,
  BLUEPRINT_SCHEMA,
  evaluateBlueprintAgainstBrief,
  parseProductionBlueprintResponse,
  refineShotDirection,
  type IntelligenceStage,
} from "../src/intelligence";
import type { CorpusGuidance } from "../src/types";
import { createProjectFromBrief } from "../src/engine.mjs";

const guidance: CorpusGuidance = {
  available: true,
  route: "product",
  promptRule: "Show one observable action and a held end state.",
  promptReason: "Render evidence favors verifiable temporal beats.",
  storyPattern: "Promise, proof, resolution",
  storyBeats: ["promise", "proof", "resolution"],
  styleSystem: "restrained product realism",
  styleTokens: ["motivated side light", "neutral palette", "controlled depth"],
  audioFramework: "visible-source sound",
  audioRule: "Bind sound to visible sources.",
  domainPlaybook: "product reveal",
  failureRepairs: ["hold the end state"],
  evidenceGenIds: ["gen-1"],
  provenance: { renderRecords: 50, reviewedRecords: 50, batchDeltas: 1, generatedAt: null },
};

function rawBlueprint(sceneShotCounts = [1, 3]) {
  return {
    project: {
      title: "  Glass / Light  ",
      logline: "A bottle catches a changing horizon.",
      creativeThesis: "Make material change the story.",
      format: "Commercial film",
      aspect: "9:16",
      duration: 18,
      platform: "Social",
      provider: "Local plan",
    },
    styleBible: {
      visualTone: "Tactile realism",
      lighting: "Raking sunrise",
      palette: [" amber ", "graphite", "amber"],
      texture: "Fine glass detail",
      lensLanguage: "Macro to portrait",
      mood: "Quiet anticipation",
    },
    storyBeats: [" arrival ", "transformation", "resolve"],
    scenes: sceneShotCounts.map((shotCount, sceneIndex) => ({
      id: `scene-${sceneIndex + 1}`,
      title: `Scene ${sceneIndex + 1}`,
      slugline: "INT. STUDIO - DAWN",
      description: `Scene description ${sceneIndex + 1}`,
      intent: `Scene intent ${sceneIndex + 1}`,
      duration: 9,
      shots: Array.from({ length: shotCount }, (_, shotIndex) => ({
        id: `shot-${sceneIndex + 1}-${shotIndex + 1}`,
        title: `Shot ${shotIndex + 1}`,
        slugline: "INT. STUDIO - CONTINUOUS",
        description: "Light moves across the bottle.",
        intent: "Reveal one material change.",
        duration: shotIndex === 0 ? "3" : 2,
        shotSize: "Macro",
        lens: "100mm macro",
        movement: "Measured slide",
        startState: "Bottle in shadow",
        action: "Light crosses the glass",
        endState: "Label edge resolves",
        audioIntent: "Glass resonance",
        continuityLocks: [" bottle geometry ", "bottle geometry", 42],
        referenceNeeds: ["hero bottle"],
      })),
    })),
    assets: [{
      id: "asset-bottle",
      name: "Hero bottle",
      type: "object",
      description: "Clear glass bottle",
      continuityLocks: ["geometry"],
      referenceNeeds: ["turnaround"],
    }],
  };
}

test("creative QC rejects generic, constraint-breaking blueprints", () => {
  const blueprint = parseProductionBlueprintResponse(JSON.stringify(rawBlueprint([1])));
  blueprint.assets.push({ id: "actor-2", name: "Second actor", type: "character", description: "Extra cast", continuityLocks: [], referenceNeeds: [] });
  blueprint.assets.push({ id: "actor-3", name: "Third actor", type: "character", description: "Extra cast", continuityLocks: [], referenceNeeds: [] });
  blueprint.scenes[0].shots[0].dialogue = "V.O.: Buy it now.";
  blueprint.scenes[0].shots[0].action = "One defining action occurs.";
  const report = evaluateBlueprintAgainstBrief(blueprint, "A 15 second perfume film called After Midnight. One actor, one location, no dialogue.");
  assert.equal(report.passed, false);
  assert.ok(report.issues.some((issue) => /forbids dialogue/i.test(issue)));
  assert.ok(report.issues.some((issue) => /exactly 1 visible actor/i.test(issue)));
  assert.ok(report.issues.some((issue) => /template language/i.test(issue)));
});

test("no-voiceover QC catches every narration marker but keeps diegetic dialogue", () => {
  const brief = "Two actors argue in a diner. No voiceover.";
  const flaggedForms = ["NARRATOR: They were never really arguing.", "VOICEOVER: Somewhere, a kettle boiled.", "MARA (V.O.): I never told him.", "VO: The city kept moving."];
  for (const line of flaggedForms) {
    const blueprint = parseProductionBlueprintResponse(JSON.stringify(rawBlueprint([1])));
    blueprint.scenes[0].shots[0].dialogue = line;
    const report = evaluateBlueprintAgainstBrief(blueprint, brief);
    assert.ok(report.issues.some((issue) => /voice-over narration/i.test(issue)), `flags: ${line}`);
  }
  const diegetic = parseProductionBlueprintResponse(JSON.stringify(rawBlueprint([1])));
  diegetic.scenes[0].shots[0].dialogue = "MARA: You always order for me.\nBRAVO: Somebody has to.";
  const report = evaluateBlueprintAgainstBrief(diegetic, brief);
  assert.ok(!report.issues.some((issue) => /voice-over/i.test(issue)), "diegetic dialogue (even a speaker named BRAVO) stays legal");
});

test("extracts a production blueprint from fenced response text", () => {
  const response = `Model preface\n\`\`\`json\n${JSON.stringify(rawBlueprint())}\n\`\`\`\nDone.`;
  const blueprint = parseProductionBlueprintResponse(response);
  assert.equal(blueprint.source, "ollama");
  assert.equal(blueprint.project.title, "Glass / Light");
  assert.equal(blueprint.scenes[1].shots[2].id, "shot-2-3");
});

test("preserves variable scene and per-scene shot counts", () => {
  const blueprint = parseProductionBlueprintResponse(JSON.stringify(rawBlueprint([2, 1, 4])));
  assert.equal(blueprint.scenes.length, 3);
  assert.deepEqual(blueprint.scenes.map((scene) => scene.shots.length), [2, 1, 4]);
});

test("normalizes strings, durations, lists, and missing identifiers", () => {
  const raw = rawBlueprint([1]);
  raw.scenes[0].shots[0].id = "";
  raw.project.duration = 0;
  const blueprint = parseProductionBlueprintResponse(JSON.stringify(raw), { duration: 12 });
  assert.equal(blueprint.project.title, "Glass / Light");
  assert.equal(blueprint.project.duration, 12);
  assert.equal(blueprint.scenes[0].shots[0].duration, 3);
  assert.match(blueprint.scenes[0].shots[0].id, /^shot-1-1-/);
  assert.deepEqual(blueprint.styleBible.palette, ["amber", "graphite"]);
  assert.deepEqual(blueprint.scenes[0].shots[0].continuityLocks, ["bottle geometry"]);
});

test("normalizes junk model optics and folds audioTrack into canonical audio fields", () => {
  const raw = rawBlueprint([1]);
  const shot = raw.scenes[0].shots[0] as Record<string, unknown>;
  delete shot.dialogue;
  delete shot.audioIntent;
  shot.optics = { cameraBody: "  Alexa 35  ", lensModel: " ", focalLengthMm: "not-a-number", tStop: -1, subjectDistanceMeters: null };
  shot.imperfectionAnchors = ["skin texture", " skin texture ", null];
  shot.lightingGrade = { primarySource: " ", paletteBase: "graphite", isDesaturated: "yes", isCrushedBlacks: true };
  shot.audioTrack = { spokenText: "  MARA: Keep rolling.  ", soundDesignDirectives: ["cloth movement", " room tone "] };

  const blueprint = parseProductionBlueprintResponse(JSON.stringify(raw));
  const normalized = blueprint.scenes[0].shots[0];
  assert.deepEqual(normalized.optics, {
    cameraBody: "Alexa 35",
    lensModel: "macro",
    focalLengthMm: 100,
    tStop: 2.8,
    subjectDistanceMeters: 0.45,
  });
  assert.deepEqual(normalized.imperfectionAnchors, ["skin texture"]);
  assert.deepEqual(normalized.lightingGrade, {
    primarySource: "Motivated practical key",
    paletteBase: "graphite",
    isDesaturated: false,
    isCrushedBlacks: true,
  });
  assert.equal(normalized.dialogue, "MARA: Keep rolling.");
  assert.equal(normalized.audioIntent, "cloth movement; room tone");
  assert.equal("audioTrack" in normalized, false, "transport audio must not duplicate canonical audio state");
});

test("Ollama blueprint schema exposes every optional UniversalPacket v2 shot field", () => {
  const schema = BLUEPRINT_SCHEMA as unknown as { properties: { scenes: { items: { properties: { shots: { items: { required: string[]; properties: Record<string, unknown> } } } } } } };
  const shotSchema = schema.properties.scenes.items.properties.shots.items;
  for (const field of ["optics", "imperfectionAnchors", "lightingGrade", "audioTrack"]) {
    assert.ok(field in shotSchema.properties, `${field} is exposed to Ollama JSON mode`);
    assert.equal(shotSchema.required.includes(field), false, `${field} remains optional for v1 compatibility`);
  }
});

test("uses a clearly marked deterministic fallback and reports staged status", async () => {
  const stages: IntelligenceStage[] = [];
  const fetcher: typeof fetch = async () => new Response("offline", { status: 503 });
  const blueprint = await analyzeProductionBrief(
    { brief: "A watch wakes as dawn reaches the dial", duration: 17 },
    guidance,
    { fetcher, onStatus: (stage) => stages.push(stage), timeoutMs: 50 },
  );

  assert.equal(blueprint.source, "deterministic-fallback");
  assert.ok(blueprint.scenes.length > 0);
  assert.equal(stages[0], "probing");
  assert.equal(stages.at(-1), "fallback");
});

test("re-directs a shot with a structured local-model patch", async () => {
  const project = createProjectFromBrief("A perfume bottle emerges from marble", { title: "Stone", route: "Product ad" });
  const shot = project.shots[0];
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return Response.json({ models: [{ name: "test-model" }] });
    return Response.json({ message: { content: JSON.stringify({ shotSize: "Extreme macro", movement: "Measured push-in", action: "The chisel parts marble dust around the bottle edge", endState: "The first black-glass glint holds", continuityLocks: ["bottle geometry", "dawn light"] }) } });
  };
  const result = await refineShotDirection(project, shot, "Make the reveal tactile and end on the first glint", { model: "test-model", fetcher, timeoutMs: 500 });
  assert.equal(result.source, "ollama");
  assert.equal(result.model, "test-model");
  assert.equal(result.patch.shotSize, "Extreme macro");
  assert.equal(result.patch.endState, "The first black-glass glint holds");
  assert.deepEqual(result.patch.continuityLocks, ["bottle geometry", "dawn light"]);
});
