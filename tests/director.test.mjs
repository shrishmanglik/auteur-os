import assert from "node:assert/strict";
import { test } from "node:test";
import { DIRECTOR_FORMATS, detectRoute, developBlueprint, extractBriefConstraints, ideateConcepts, parseIdea, writeScreenplay } from "../src/director.mjs";
import { compileShot, createProjectFromBlueprint } from "../src/engine.mjs";

const INPUT = {
  idea: "A sommelier who can identify the exact vineyard from one sip, blind-tested by a skeptical robot",
  format: "Short film sequence",
  duration: 60,
  aspect: "2.39:1",
  audience: "film lovers",
  tone: "Deadpan",
  humor: "dry",
};

test("parseIdea extracts a usable subject", () => {
  const idea = parseIdea(INPUT.idea);
  assert.ok(idea.subject.length > 3);
  assert.ok(idea.keywords.length >= 3);
});

test("parseIdea removes duration and format noise instead of making it the subject", () => {
  const perfume = parseIdea("A 30 second luxury perfume ad for a fragrance called After Midnight. No dialogue.");
  assert.equal(perfume.subject, "After Midnight");
  assert.doesNotMatch(perfume.subject, /second|video|film|ad/i);
  const parking = parseIdea("A 75 second short film about a lonely parking attendant receiving voice notes from the moon");
  assert.match(parking.subject, /lonely|parking|attendant/i);
  assert.doesNotMatch(parking.subject, /second/i);
});

test("parseIdea honors explicit hero, setting, and object overrides", () => {
  const idea = parseIdea("A vague product story in a studio", { hero: "Mara Voss", setting: "an abandoned planetarium", object: "a cracked brass compass" });
  assert.equal(idea.subject, "Mara Voss");
  assert.equal(idea.world, "an abandoned planetarium");
  assert.equal(idea.anchor, "a cracked brass compass");
  const concepts = ideateConcepts({ ...INPUT, ideaOverrides: { hero: "Mara Voss", setting: "an abandoned planetarium", object: "a cracked brass compass" } }, 0);
  assert.ok(concepts.every((concept) => concept.groundingFramework), "every offline concept identifies its corpus framework");
  assert.ok(concepts.some((concept) => /Mara Voss|cracked brass compass|abandoned planetarium/i.test(`${concept.logline} ${concept.twist}`)));
  const screenplay = writeScreenplay({ ...INPUT, ideaOverrides: { hero: "Mara Voss", setting: "an abandoned planetarium", object: "a cracked brass compass" } }, concepts[0], 0);
  assert.ok(screenplay.cast.includes("MARA VOSS"));
  assert.ok(screenplay.scenes.every((scene) => /ABANDONED PLANETARIUM/.test(scene.slugline)));
});

test("brief constraints prevent forbidden speech and extra cast in the offline draft", () => {
  const input = { idea: "A 30 second perfume film called After Midnight. One actor, one location, no dialogue or voice-over.", format: "Commercial film", duration: 30, humor: "dry" };
  assert.deepEqual(extractBriefConstraints(input.idea), { noDialogue: true, noVoiceover: true, actorCount: 1, oneLocation: true, loopable: false, notSalesy: false, mustBeFunny: false });
  const concept = ideateConcepts(input, 0)[0];
  const screenplay = writeScreenplay(input, concept, 0);
  assert.equal(screenplay.cast.length, 1);
  assert.equal(screenplay.dialogueMode, "none");
  assert.ok(screenplay.scenes.every((scene) => scene.dialogue === ""));
  assert.equal(new Set(screenplay.scenes.map((scene) => scene.slugline)).size, 1);
});

test("a voice-over ban does not silence diegetic dialogue", () => {
  const banned = extractBriefConstraints("Two old friends argue in a diner. No voiceover.");
  assert.equal(banned.noVoiceover, true);
  assert.equal(banned.noDialogue, false, "'no voiceover' must not ban spoken dialogue");
  const silent = extractBriefConstraints("A silent film about a lighthouse keeper.");
  assert.equal(silent.noDialogue, true);
  assert.equal(silent.noVoiceover, true);
  const without = extractBriefConstraints("A launch trailer without voiceover, driven by sound design.");
  assert.equal(without.noVoiceover, true, "'without voiceover' bans narration");
  assert.equal(without.noDialogue, false);
  assert.equal(extractBriefConstraints("A montage without narration.").noVoiceover, true);
  assert.equal(extractBriefConstraints("A commercial with no voice over.").noVoiceover, true, "spaced 'voice over' counts");
  const usSpelling = extractBriefConstraints("A tense single scene, no dialog.");
  assert.equal(usSpelling.noDialogue, true, "US 'dialog' spelling counts");
  assert.equal(extractBriefConstraints("A short with no dialog or voice over.").noVoiceover, true, "spaced compound ban counts");
  const trailerInput = { ...INPUT, idea: "A heist movie launch trailer without voiceover.", format: "Trailer", duration: 40 };
  const trailerConcept = ideateConcepts(trailerInput, 0)[0];
  const trailer = writeScreenplay(trailerInput, trailerConcept, 0);
  assert.ok(trailer.scenes.every((scene) => !/V\.O\.:/.test(scene.dialogue)), "trailer emits no V.O. lines under a without-voiceover ban");
  const input = { ...INPUT, idea: "Two retired safecrackers argue over the last espresso. No voiceover.", format: "Short film sequence" };
  const concept = ideateConcepts(input, 0)[0];
  const screenplay = writeScreenplay(input, concept, 0);
  assert.equal(screenplay.dialogueMode, "dialogue");
  assert.ok(screenplay.scenes.some((scene) => scene.dialogue.includes(":")), "dialogue survives a VO-only ban");
});

test("detectRoute matches whole words, never substrings", () => {
  assert.notEqual(detectRoute("she carries the box carefully to the door"), "automotive", "'carries' is not a car");
  assert.notEqual(detectRoute("a card trick at a birthday party"), "automotive", "'card' is not a car");
  assert.equal(detectRoute("a supercar on a coastal road at dawn"), "automotive");
});

test("ideateConcepts returns 3 distinct, stable concepts; reroll changes them", () => {
  const first = ideateConcepts(INPUT, 0);
  const again = ideateConcepts(INPUT, 0);
  const rerolled = ideateConcepts(INPUT, 1);
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map((concept) => concept.lens)).size, 3);
  assert.deepEqual(first.map((concept) => concept.lens), again.map((concept) => concept.lens));
  assert.notDeepEqual(first.map((concept) => concept.lens), rerolled.map((concept) => concept.lens));
  for (const concept of first) {
    assert.ok(concept.logline.length > 20, "logline is substantive");
    assert.ok(concept.twist.length > 20, "twist is substantive");
  }
});

test("writeScreenplay: short film carries dialogue; durations sum near target", () => {
  const concept = ideateConcepts(INPUT, 0)[0];
  const screenplay = writeScreenplay(INPUT, concept, 0);
  assert.equal(screenplay.dialogueMode, "dialogue");
  assert.equal(screenplay.cast.length, 2);
  const total = screenplay.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  assert.ok(Math.abs(total - 60) <= 5, `scripted ${total}s should be near 60s`);
  assert.ok(screenplay.scenes.some((scene) => scene.dialogue.includes(":")), "at least one scene has spoken lines");
});

test("writeScreenplay: A-roll monologue speaks to camera in every scene", () => {
  const input = { ...INPUT, format: "A-roll monologue", duration: 45 };
  const concept = ideateConcepts(input, 0)[0];
  const screenplay = writeScreenplay(input, concept, 0);
  assert.equal(screenplay.dialogueMode, "monologue");
  for (const scene of screenplay.scenes) assert.ok(scene.dialogue.startsWith("TO CAMERA:"), `${scene.beat} speaks to camera`);
});

test("developBlueprint produces a valid blueprint with dialogue on shots", () => {
  const concept = ideateConcepts(INPUT, 0)[0];
  const blueprint = developBlueprint(INPUT, concept, null, 0);
  assert.equal(blueprint.source, "director-deterministic");
  assert.ok(blueprint.scenes.length >= 4);
  assert.ok(blueprint.scenes.every((scene) => scene.shots.length >= 1));
  const spoken = blueprint.scenes.flatMap((scene) => scene.shots).filter((shot) => shot.dialogue);
  assert.ok(spoken.length >= 1, "dialogue reaches shots");
  assert.ok(blueprint.assets.some((asset) => asset.type === "character"), "cast becomes assets");
});

test("deterministic Director derives sensible optics from each shot grammar", () => {
  const concept = ideateConcepts(INPUT, 0)[0];
  const blueprint = developBlueprint(INPUT, concept, null, 0);
  const shots = blueprint.scenes.flatMap((scene) => scene.shots);
  assert.ok(shots.length > 0);
  for (const shot of shots) {
    assert.ok(shot.optics.focalLengthMm > 0);
    assert.ok(shot.optics.tStop > 0);
    assert.ok(shot.optics.subjectDistanceMeters > 0);
    assert.equal(shot.optics.cameraBody, "ARRI Alexa 35");
  }
});

test("blueprint flows into a project and dialogue reaches the compiled video prompt", () => {
  const concept = ideateConcepts(INPUT, 0)[0];
  const blueprint = developBlueprint(INPUT, concept, null, 0);
  const project = createProjectFromBlueprint(blueprint, { brief: INPUT.idea });
  assert.ok(project.shots.length >= 5);
  const spokenShot = project.shots.find((shot) => shot.dialogue);
  assert.ok(spokenShot, "a project shot carries dialogue");
  const packet = compileShot(project, spokenShot, []);
  assert.match(packet.videoPrompt, /Spoken performance \(verbatim/, "video prompt embeds verbatim dialogue");
  assert.match(packet.audioPrompt, /Authored dialogue/, "audio prompt declares authored dialogue");
});

test("prompt-brain conventions reach the blueprint lens language", () => {
  const promptBrain = { content_types: { human: { camera: ["85mm portrait prime", "40mm at T1.8"], lighting: ["single motivated window key"], physics: ["skin shows real pores"], verbiage: ["captured-not-composed"] } } };
  const concept = ideateConcepts(INPUT, 0)[0];
  const blueprint = developBlueprint(INPUT, concept, promptBrain, 0);
  assert.match(blueprint.scenes[0].shots[0].lens, /85mm portrait prime/);
  assert.equal(blueprint.styleBible.lighting, "single motivated window key");
});

test("image campaign builds frame-based packets on the image provider", () => {
  const input = { ...INPUT, format: "Image campaign", duration: 6, aspect: "4:5", provider: "" };
  const concept = ideateConcepts(input, 0)[0];
  const screenplay = writeScreenplay(input, concept, 0);
  assert.equal(screenplay.dialogueMode, "none");
  assert.ok(screenplay.scenes.every((scene) => scene.duration === 1 && !scene.dialogue), "each scene is one silent frame");
  const blueprint = developBlueprint(input, concept, null, 0);
  assert.equal(blueprint.project.provider, "Image model");
  const project = createProjectFromBlueprint(blueprint, { brief: input.idea, format: "Image campaign" });
  assert.ok(project.shots.length >= 6, "six campaign frames");
  assert.ok(project.shots.every((shot) => shot.duration === 1), "frames carry unit duration");
  assert.ok(project.deliverables.every((deliverable) => deliverable.unit === "frames"), "deliverables are frame-based, not second-based");
  assert.equal(project.provider, "Image model");
  const packet = compileShot(project, project.shots[0], []);
  assert.match(packet.videoPrompt, /still campaign frame/, "active prompt is a still-frame handoff");
  assert.doesNotMatch(packet.videoPrompt, /-second/, "no video-duration wording in a still packet");
  assert.match(packet.audioPrompt, /no audio layer/, "audio layer is honestly not-applicable");
  assert.match(packet.qcGates[0], /single still frame/, "QC gates check a still, not seconds");
});

test("honors sub-8 second duration targets by trimming to the strongest beats", () => {
  const input = { ...INPUT, format: "Commercial film", duration: 4 };
  const concept = ideateConcepts(input, 0)[0];
  const screenplay = writeScreenplay(input, concept, 0);
  assert.equal(screenplay.duration, 4, "the requested 4s target is kept, not clamped to 8");
  assert.equal(screenplay.scenes.reduce((sum, scene) => sum + scene.duration, 0), 4, "scripted seconds sum to the target");
  assert.ok(screenplay.scenes.length <= 2, "short targets keep only the highest-share beats");
  assert.ok(screenplay.scenes.every((scene) => scene.duration >= 2), "every kept beat is playable");
  const blueprint = developBlueprint(input, concept, null, 0);
  const project = createProjectFromBlueprint(blueprint, { brief: input.idea });
  assert.equal(project.duration, 4, "the built production delivers the 4s bumper");
});

test("image campaign honors the requested frame count", () => {
  const input = { ...INPUT, format: "Image campaign", duration: 9, aspect: "4:5", provider: "" };
  const concept = ideateConcepts(input, 0)[0];
  const screenplay = writeScreenplay(input, concept, 0);
  assert.equal(screenplay.scenes.length, 9, "nine requested frames yield nine scenes");
  assert.equal(new Set(screenplay.scenes.map((scene) => scene.beat)).size, 9, "repeated arc passes get distinct beat names");
  const blueprint = developBlueprint(input, concept, null, 0);
  const project = createProjectFromBlueprint(blueprint, { brief: input.idea, format: "Image campaign" });
  assert.equal(project.shots.length, 9);
  assert.equal(project.deliverables[0].duration, 9);
  assert.equal(project.deliverables[0].unit, "frames");
});

test("single scene builds one scene with spoken dialogue", () => {
  const input = { ...INPUT, format: "Single scene", duration: 20 };
  const concept = ideateConcepts(input, 0)[0];
  const screenplay = writeScreenplay(input, concept, 0);
  assert.equal(screenplay.scenes.length, 1, "single scene stays a single dramatic unit");
  assert.equal(screenplay.dialogueMode, "dialogue");
  assert.ok(screenplay.scenes[0].dialogue.includes(":"), "the one scene carries spoken lines");
  const blueprint = developBlueprint(input, concept, null, 0);
  assert.equal(blueprint.scenes.length, 1);
  const project = createProjectFromBlueprint(blueprint, { brief: input.idea });
  assert.ok(project.shots.length >= 2, "the scene still receives shot coverage");
});

test("every director format has an arc and produces a buildable blueprint", () => {
  for (const format of DIRECTOR_FORMATS) {
    const input = { ...INPUT, format: format.key, duration: format.defaultDuration };
    const concept = ideateConcepts(input, 0)[0];
    const blueprint = developBlueprint(input, concept, null, 0);
    const project = createProjectFromBlueprint(blueprint, { brief: input.idea });
    assert.ok(project.shots.length >= 3, `${format.key} produces shots`);
    assert.ok(project.shots.every((shot) => shot.versions.length === 1), `${format.key} compiles v1 packets`);
  }
});
