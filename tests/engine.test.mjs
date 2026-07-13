import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeCritique,
  compileShot,
  createProjectFromBlueprint,
  createProjectFromBrief,
  createRepairVersion,
  deriveCorpusGuidance,
  deriveReviewStatus,
  detectProjectRoute,
  embedPacketMedia,
  exportPacket,
  formatTimecode,
  moveItem,
  resolveAutoStrategy,
  syncProjectTiming,
  validateProjectForExport,
} from "../src/engine.mjs";

const sampleIntelligence = {
  generated_at: "2026-07-10T00:00:00.000Z",
  batch_delta_files: 55,
  render_records: 4822,
  coverage: { records_reviewed: 2750 },
  prompt_generation_logic: [{ key: "automotive-motion-contract", count: 4, examples: [{ rule: "Name measurable wheel rotation and road displacement.", why_it_matters: "Static vehicle plates failed as video." }], evidence_gen_ids: ["gen-prompt"] }],
  storyboarding_logic: [{ key: "automotive-performance-ladder", count: 3, examples: [{ pattern: "Automotive performance ladder", beats: ["design promise", "contact proof", "resolved arrival"] }], evidence_gen_ids: ["gen-story"] }],
  style_and_design_systems: [{ key: "alpine-automotive-premium", count: 2, examples: [{ style: "Alpine automotive premium", visual_tokens: ["wet road", "clean silhouette"], lighting_tokens: ["golden rim"], camera_tokens: ["low tracking"] }], evidence_gen_ids: ["gen-style"] }],
  sound_audio_frameworks: [{ key: "action-proof-sync", count: 2, examples: [{ audio_pattern: "Action proof sync", visual_sync_rule: "Bind tire contact and acceleration to visible motion." }], evidence_gen_ids: ["gen-audio"] }],
  failure_rules_and_repairs: [{ key: "static-frame", count: 10, examples: [{ repair_prompt_guard: "Require visible progress at opening, midpoint, and final frame." }], evidence_gen_ids: ["gen-failure"] }],
  content_type_domain_playbooks: [{ key: "automotive-premium", count: 4, examples: [{ content_type: "automotive", domain: "premium vehicle", default_framework: "Identity-locked vehicle journey with wheel-contact proof." }], evidence_gen_ids: ["gen-playbook"] }],
};

test("creates a coherent project graph with stable addressable objects", () => {
  const project = createProjectFromBrief("A performance sedan earns the open road", { title: "APEX" });
  assert.equal(project.scenes.length, 3);
  assert.equal(project.shots.length, 6);
  assert.equal(project.deliverables.length, 3);
  assert.equal(new Set(project.shots.map((shot) => shot.id)).size, 6);
  for (const scene of project.scenes) {
    assert.equal(scene.shots.length, 2);
    for (const shotId of scene.shots) assert.ok(project.shots.some((shot) => shot.id === shotId));
  }
});

test("routes briefs into distinct production playbooks and matching boards", () => {
  const cases = [
    ["A supercar crosses a mountain road", "automotive", "/media/apex/"],
    ["A mechanical watch reveals its movement", "product", "/media/product/"],
    ["A chef plates a tasting menu", "food", "/media/food/"],
    ["A singer performs a fashion-led music film", "editorial", "/media/character/"],
    ["A giant appears beyond a coastal town", "vfx", "/media/vfx/"],
    ["A doctor makes a difficult choice", "character", "/media/character/"],
  ];
  for (const [brief, route, media] of cases) {
    assert.equal(detectProjectRoute(brief), route);
    const project = createProjectFromBrief(brief, { duration: 17 });
    assert.ok(project.shots.every((shot) => shot.image.startsWith(media)));
    assert.equal(project.shots.reduce((sum, shot) => sum + shot.duration, 0), 17);
  }
  assert.equal(detectProjectRoute("An ambiguous campaign", { route: "Product ad" }), "product");
  assert.deepEqual(resolveAutoStrategy("A singer performs", { format: "Music video", platform: "Instagram / TikTok", aspect: "Auto", provider: "Auto route" }), { route: "editorial", aspect: "9:16", provider: "Runway" });
});

test("compiles image, video, and audio prompts from project and shot state", () => {
  const project = createProjectFromBrief("A quiet automotive film", { title: "Road" });
  const shot = project.shots[0];
  const packet = compileShot(project, shot, [{ fix: "hold temporal consistency", count: 10 }]);
  assert.match(packet.framePrompt, /Continuity locks/i);
  assert.match(packet.videoPrompt, /Start state:/);
  assert.match(packet.videoPrompt, /Resolved end state:/);
  assert.match(packet.videoPrompt, /hold temporal consistency/);
  assert.match(packet.videoPrompt, /quality target:/i);
  assert.match(packet.audioPrompt, /remain UNKNOWN/i);
  assert.match(packet.negativePrompt, /No identity drift/i);
  assert.ok(packet.qcGates.some((gate) => /held resolved end state/i.test(gate)));
});

test("compiles normalized optics before movement direction", () => {
  const project = createProjectFromBrief("A quiet automotive film", { title: "Optics" });
  const shot = project.shots[0];
  shot.optics = {
    cameraBody: "ARRI Alexa 35",
    lensModel: "Signature Prime",
    focalLengthMm: 85,
    tStop: 1.4,
    subjectDistanceMeters: 1.2,
  };
  shot.movement = "a deliberate lateral track";
  const packet = compileShot(project, shot);
  const opticsIndex = packet.videoPrompt.indexOf("Shot on ARRI Alexa 35 with 85mm Signature Prime at T1.4");
  const movementIndex = packet.videoPrompt.indexOf("Movement: a deliberate lateral track");
  assert.ok(opticsIndex >= 0);
  assert.ok(movementIndex > opticsIndex);
  assert.match(packet.videoPrompt, /shallow depth of field with pronounced subject separation/i);
});

test("selects project-aware corpus intelligence and compiles it through every packet layer", () => {
  const project = createProjectFromBrief("A performance sedan crosses a wet alpine road", { title: "Road" });
  const guidance = deriveCorpusGuidance(project, sampleIntelligence);
  assert.equal(guidance.route, "automotive");
  assert.equal(guidance.storyPattern, "Automotive performance ladder");
  assert.equal(guidance.provenance.renderRecords, 4822);
  assert.deepEqual(guidance.storyBeats, ["design promise", "contact proof", "resolved arrival"]);
  const packet = compileShot(project, project.shots[0], [], sampleIntelligence);
  assert.match(packet.framePrompt, /Alpine automotive premium/);
  assert.match(packet.videoPrompt, /Automotive performance ladder/);
  assert.match(packet.videoPrompt, /Name measurable wheel rotation/);
  assert.match(packet.audioPrompt, /Action proof sync/);
  assert.ok(packet.qcGates.some((gate) => /opening, midpoint, and final frame/i.test(gate)));
});

test("prefers route-compatible intelligence over higher-count conflicting domains", () => {
  const competing = structuredClone(sampleIntelligence);
  competing.prompt_generation_logic = [
    { key: "luxury-product-macro", count: 100, examples: [{ rule: "Rotate the product bottle through a macro packshot." }] },
    { key: "automotive-road-contact", count: 1, examples: [{ rule: "Track the vehicle through visible wheel and road contact." }] },
  ];
  const automotive = createProjectFromBrief("A performance car crosses a mountain road", { title: "Route" });
  assert.match(deriveCorpusGuidance(automotive, competing).promptRule, /vehicle.*wheel.*road/i);

  const product = createProjectFromBrief("A perfume bottle packshot", { title: "Object", route: "Product ad" });
  assert.match(deriveCorpusGuidance(product, competing).promptRule, /product bottle.*macro packshot/i);
});

test("preserves unavailable corpus provenance as UNKNOWN-compatible nulls", () => {
  const project = createProjectFromBrief("A production without a loaded corpus", { title: "Unknown" });
  const guidance = deriveCorpusGuidance(project, null);
  assert.equal(guidance.available, false);
  assert.equal(guidance.provenance.renderRecords, null);
  assert.equal(guidance.provenance.reviewedRecords, null);
  assert.equal(guidance.provenance.batchDeltas, null);
  assert.equal(exportPacket(project, null).intelligence.provenance.renderRecords, null);

  const incompleteSuccess = { storyboarding_logic: [{ key: "loaded-pattern", examples: [{ pattern: "Loaded pattern" }] }] };
  const loadedGuidance = deriveCorpusGuidance(project, incompleteSuccess);
  assert.equal(loadedGuidance.available, true);
  assert.equal(loadedGuidance.storyPattern, "Loaded pattern");
  assert.equal(loadedGuidance.provenance.renderRecords, null);
  assert.equal(loadedGuidance.provenance.reviewedRecords, null);
  assert.equal(loadedGuidance.provenance.batchDeltas, null);
});

test("QC analysis previews repairs without mutating the shot", () => {
  const project = createProjectFromBrief("A character scene", { title: "Scene" });
  const shot = project.shots[0];
  const before = JSON.stringify(shot);
  const proposals = analyzeCritique("The face and wardrobe drift, the final beat is missing, and the logo is gibberish");
  assert.ok(proposals.some((proposal) => proposal.key === "continuity"));
  assert.ok(proposals.some((proposal) => proposal.key === "temporal"));
  assert.ok(proposals.some((proposal) => proposal.key === "text"));
  assert.equal(JSON.stringify(shot), before);
});

test("accepted QC creates a new repair version with stable source lineage", () => {
  const project = createProjectFromBrief("A physical product demonstration", { title: "Proof" });
  const shot = project.shots[0];
  const proposals = analyzeCritique("The object floats and the contact physics fail");
  const version = createRepairVersion(project, shot, proposals);
  assert.equal(version.label, "v2");
  assert.equal(version.source, "reviewed-qc");
  assert.match(version.videoPrompt, /Active repairs:/);
});

test("reordering is immutable and preserves item identities", () => {
  const original = ["a", "b", "c"];
  const moved = moveItem(original, 0, 2);
  assert.deepEqual(original, ["a", "b", "c"]);
  assert.deepEqual(moved, ["b", "c", "a"]);
  assert.deepEqual(moveItem(original, -1, 2), original);
});

test("exports a complete generation packet without claiming provider mutation", () => {
  const project = createProjectFromBrief("A six-shot launch film", { title: "Launch" });
  const packet = exportPacket(project);
  assert.equal(packet.schema, "auteur-generation-packet/v1");
  assert.equal(packet.providerState, "not-mutated");
  assert.equal(packet.shots.length, 6);
  assert.equal(packet.deliveryLayers.length, 4);
  assert.equal(packet.deliveryLayers[1].state, "deterministic-post");
  assert.ok(packet.shots.every((shot) => shot.version.videoPrompt.length > 80));
  assert.ok(packet.shots.every((shot) => shot.version.negativePrompt.includes("No identity drift")));
  assert.ok(packet.shots.every((shot) => shot.version.qcGates.length >= 6));
  assert.ok(packet.shots.every((shot) => shot.identityLock.invariants.length >= 4));
  assert.ok(packet.shots.every((shot) => shot.requiredBeat.entryState && shot.requiredBeat.exitState));
});

test("exports corpus decisions with evidence provenance without changing provider state", () => {
  const project = createProjectFromBrief("A performance sedan crosses a wet alpine road", { title: "Evidence" });
  const packet = exportPacket(project, sampleIntelligence);
  assert.equal(packet.intelligence.provenance.reviewedRecords, 2750);
  assert.equal(packet.intelligence.provenance.batchDeltas, 55);
  assert.equal(packet.intelligence.storyPattern, "Automotive performance ladder");
  assert.ok(packet.intelligence.evidenceGenIds.includes("gen-story"));
  assert.equal(packet.providerState, "not-mutated");
});

test("exports shots in canonical scene order after board reordering", () => {
  const project = createProjectFromBrief("A reordered launch film", { title: "Ordered" });
  const scene = project.scenes[0];
  scene.shots = [scene.shots[1], scene.shots[0]];
  const canonical = project.scenes.flatMap((item) => item.shots);
  project.deliverables = project.deliverables.map((deliverable) => ({ ...deliverable, shotIds: [...deliverable.shotIds].sort((a, b) => canonical.indexOf(a) - canonical.indexOf(b)) }));
  const packet = exportPacket(project);
  assert.deepEqual(packet.shots.slice(0, 2).map((shot) => shot.id), scene.shots);
});

test("blocks stale exports and synchronizes all timing authorities", () => {
  const project = createProjectFromBrief("A timed commercial", { duration: 24 });
  project.shots[0].duration = 9;
  project.shots[0].packetDirty = true;
  const synchronized = syncProjectTiming(project);
  assert.equal(synchronized.duration, 29);
  assert.equal(synchronized.deliverables[0].duration, 29);
  assert.match(synchronized.deliverables[0].name, /^29s /);
  assert.ok(validateProjectForExport(synchronized).some((error) => /uncompiled changes/i.test(error)));
  assert.throws(() => exportPacket(synchronized), /Packet is not ready/);
});

test("exports evidence-bound QC and embeds every local packet image", async () => {
  const project = createProjectFromBrief("A portable campaign packet", { title: "Portable" });
  project.shots[0].startFrame = "/media/start.jpg";
  project.shots[0].endFrame = "/media/end.jpg";
  project.assets[0].locked = false;
  project.shots[0].review.status = "pass";
  const packet = exportPacket(project);
  assert.equal(packet.shots[0].qc.status, "unreviewed");
  assert.equal(packet.shots[0].qc.evidenceUrl, null);
  assert.ok(!packet.shots[0].identityLock.references.includes(project.assets[0].id));

  const portable = await embedPacketMedia(packet, async (url) => `data:image/jpeg;base64,${Buffer.from(url).toString("base64")}`);
  assert.ok(portable.assets.every((asset) => asset.url.startsWith("data:") && asset.persistence === "embedded"));
  assert.ok(portable.shots.every((shot) => shot.storyboardImage.startsWith("data:")));
  assert.ok(portable.shots[0].startFrame.startsWith("data:"));
  assert.ok(portable.shots[0].endFrame.startsWith("data:"));
});

test("keeps unresolved critique evidence in repair state and formats long timecodes", () => {
  const project = createProjectFromBrief("A reviewed campaign", { title: "Reviewed" });
  project.shots[0].review = {
    renderUrl: "evidence.png",
    critique: "The exposure flickers badly",
    proposals: [],
    temporalPass: true,
    continuityPass: true,
    status: "reviewing",
  };
  const packet = exportPacket(project);
  assert.equal(packet.shots[0].qc.status, "repair");
  assert.equal(packet.shots[0].qc.critique, "The exposure flickers badly");
  assert.deepEqual(packet.shots[0].qc.findings, []);
  assert.equal(formatTimecode(7.5), "00:07.5");
  assert.equal(formatTimecode(60), "01:00");
  assert.equal(formatTimecode(125.2), "02:05.2");
});

test("rejects shots missing from deliverables and stale delivery order", () => {
  const project = createProjectFromBrief("A delivery map", { title: "Delivery" });
  const missing = structuredClone(project);
  missing.deliverables = missing.deliverables.map((deliverable) => ({ ...deliverable, shotIds: deliverable.shotIds.filter((id) => id !== missing.shots[0].id) }));
  assert.ok(validateProjectForExport(syncProjectTiming(missing)).some((error) => /missing from every deliverable/i.test(error)));

  const reordered = structuredClone(project);
  reordered.deliverables[0].shotIds = [reordered.deliverables[0].shotIds[1], reordered.deliverables[0].shotIds[0], ...reordered.deliverables[0].shotIds.slice(2)];
  assert.ok(validateProjectForExport(reordered).some((error) => /shot order is stale/i.test(error)));
});

test("rejects orphaned scene graph shots and resynchronizes fractional duration labels", () => {
  const project = createProjectFromBrief("A guarded scene graph", { title: "Graph" });
  const orphaned = structuredClone(project);
  const source = orphaned.shots[0];
  const orphan = structuredClone(source);
  orphan.id = "orphan-shot";
  orphan.versions = orphan.versions.map((version) => ({ ...version, id: `orphan-${version.id}` }));
  orphan.activeVersionId = orphan.versions[0].id;
  orphaned.shots.push(orphan);
  orphaned.deliverables[0].shotIds.push(orphan.id);
  const synchronizedOrphan = syncProjectTiming(orphaned);
  assert.ok(validateProjectForExport(synchronizedOrphan).some((error) => /exactly once in the scene graph/i.test(error)));
  assert.throws(() => exportPacket(synchronizedOrphan), /scene graph/i);

  const fractional = structuredClone(project);
  fractional.shots[0].duration = 4.5;
  const firstSync = syncProjectTiming(fractional);
  assert.match(firstSync.deliverables[0].name, /^24.5s /);
  firstSync.shots[0].duration = 5;
  const secondSync = syncProjectTiming(firstSync);
  assert.match(secondSync.deliverables[0].name, /^25s /);
  assert.doesNotMatch(secondSync.deliverables[0].name, /^24.5s /);
});

test("derives evidence-bound QC pass and creates image-sequence deliverables", () => {
  assert.equal(deriveReviewStatus({ renderUrl: "evidence.png", critique: "", proposals: [], temporalPass: true, continuityPass: true, status: "reviewing" }), "pass");
  const project = createProjectFromBrief("A product image set", { format: "Image sequence", aspect: "Auto", platform: "Instagram / TikTok", duration: 7.5 });
  assert.equal(project.provider, "Image model");
  assert.equal(project.duration, 6);
  assert.ok(project.deliverables.every((deliverable) => deliverable.unit === "frames"));
  assert.equal(project.deliverables[0].duration, 6);
});

test("builds arbitrary scene graphs from analyzed blueprints", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Variable Graph", logline: "A product crosses three material states.", format: "Commercial film", aspect: "2.39:1", provider: "Veo 3.1 / Flow" },
    styleBible: { visualTone: "Tactile realism", palette: ["black", "silver"] },
    storyBeats: ["context", "change", "resolve"],
    scenes: [
      { id: "scene-a", title: "Context", shots: [{ id: "shot-a", title: "Wide", duration: 3 }] },
      { id: "scene-b", title: "Change", shots: [{ id: "shot-b", title: "Macro", duration: 2 }, { id: "shot-c", title: "Contact", duration: 4 }, { id: "shot-d", title: "Reveal", duration: 3 }] },
      { id: "scene-c", title: "Resolve", shots: [{ id: "shot-e", title: "Hero", duration: 6 }] },
    ],
    assets: [{ id: "hero", name: "Hero object", type: "object" }],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "A black perfume bottle emerges from marble." });
  assert.equal(project.scenes.length, 3);
  assert.deepEqual(project.scenes.map((scene) => scene.shots.length), [1, 3, 1]);
  assert.equal(project.shots.length, 5);
  assert.equal(project.duration, 18);
  assert.equal(project.intelligenceSource, "ollama");
  assert.ok(project.shots.every((shot) => shot.visualSource === "reference-proxy"));
  assert.doesNotThrow(() => exportPacket(project));
});

test("honors the requested production duration instead of model-authored shot totals", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Timed", duration: 12, format: "Social campaign", platform: "Instagram / TikTok", aspect: "9:16", provider: "Runway" },
    scenes: [{ title: "Launch", shots: [{ title: "One", duration: 2 }, { title: "Two", duration: 2 }, { title: "Three", duration: 2 }] }],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "A twelve second launch film." });
  assert.equal(project.duration, 12);
  assert.equal(project.shots.reduce((sum, shot) => sum + shot.duration, 0), 12);
  assert.equal(project.platform, "Instagram / TikTok");
  assert.equal(project.aspect, "9:16");
});

test("regenerates duplicate model-supplied shot and scene ids", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Dup", duration: 8, format: "Social campaign", aspect: "9:16", provider: "Runway" },
    scenes: [
      { id: "scene-1", title: "One", shots: [{ id: "shot-1", title: "A" }, { id: "shot-1", title: "B" }] },
      { id: "scene-1", title: "Two", shots: [{ id: "shot-1", title: "C" }] },
    ],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "A blueprint with colliding ids." });
  assert.equal(new Set(project.shots.map((shot) => shot.id)).size, 3, "every shot gets a unique id");
  assert.equal(new Set(project.scenes.map((scene) => scene.id)).size, 2, "every scene gets a unique id");
  const shotIds = new Set(project.shots.map((shot) => shot.id));
  assert.ok(project.scenes.every((scene) => scene.shots.every((id) => shotIds.has(id))), "scene lists reference the regenerated ids");
  assert.ok(project.shots.every((shot) => project.scenes.some((scene) => scene.id === shot.sceneId)), "shots point at real scenes");
  assert.doesNotThrow(() => exportPacket(project), "the production exports instead of being blocked on duplicate ids");
});

test("image frame targets are capped so runaway values cannot pad unbounded packets", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Runaway frames", duration: 1800, format: "Image campaign", aspect: "4:5", provider: "Image model" },
    scenes: [{ title: "Set", shots: [{ title: "A" }, { title: "B" }] }],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "A campaign with an accidental huge frame count." });
  assert.equal(project.shots.length, 24, "frame padding caps at the director bound");
  assert.equal(project.deliverables[0].duration, 24);
});

test("regenerates duplicate model-supplied asset ids", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Dup assets", duration: 8, format: "Social campaign", aspect: "9:16", provider: "Runway" },
    scenes: [{ title: "One", shots: [{ title: "A", duration: 4 }, { title: "B", duration: 4 }] }],
    assets: [
      { id: "asset-1", name: "Hero", type: "object" },
      { id: "asset-1", name: "World", type: "location" },
      { id: "asset-1", name: "Lead", type: "character" },
    ],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "A blueprint with colliding asset ids." });
  assert.equal(project.assets.length, 3, "all assets survive");
  assert.equal(new Set(project.assets.map((asset) => asset.id)).size, 3, "every asset gets a unique id");
  assert.ok(project.shots.every((shot) => new Set(shot.continuityRefs).size === shot.continuityRefs.length), "continuity refs stay unambiguous");
});

test("preserves a short target when the model over-authors shots", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Short", duration: 4, format: "Social campaign", aspect: "9:16", provider: "Runway" },
    scenes: [{ title: "Run", shots: Array.from({ length: 6 }, (_, index) => ({ title: `S${index + 1}`, duration: 3 })) }],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "A four second cut from six model shots." });
  assert.equal(project.duration, 4, "the 4s request survives a 6-shot blueprint");
  assert.ok(project.shots.every((shot) => shot.duration > 0.5), "shots share the budget with sub-second precision");
});

test("padded image frames keep canonical scene order and stay exportable", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Pad order", duration: 4, format: "Image campaign", aspect: "4:5", provider: "Image model" },
    scenes: [
      { title: "One", shots: [{ title: "A" }] },
      { title: "Two", shots: [{ title: "B" }] },
    ],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "Four frames padded across two scenes." });
  assert.equal(project.shots.length, 4);
  const canonical = project.scenes.flatMap((scene) => scene.shots);
  assert.deepEqual(project.shots.map((shot) => shot.id), canonical, "flat shot list matches canonical scene order");
  assert.doesNotThrow(() => exportPacket(project), "padded multi-scene campaign exports cleanly");
});

test("runaway blueprints trim instead of allocating negative durations", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Runaway", duration: 4, format: "Social campaign", aspect: "9:16", provider: "Runway" },
    scenes: [{ title: "Flood", shots: Array.from({ length: 40 }, (_, index) => ({ title: `S${index + 1}`, duration: 3 })) }],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "Four seconds from a forty shot blueprint." });
  assert.equal(project.shots.length, 16, "40 shots trim to 16 (0.25s minimum per shot of a 4s target)");
  assert.equal(project.duration, 4, "the requested target is preserved");
  assert.ok(project.shots.every((shot) => shot.duration >= 0.25), "no zero or negative durations");
  assert.match(project.analysisNotes.join(" "), /trimmed to 16/, "the trim is recorded honestly");
  assert.doesNotThrow(() => exportPacket(project));
});

test("image projects keep duration tied to frame count through timing sync", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Frames sync", duration: 3, format: "Image campaign", aspect: "4:5", provider: "Image model" },
    scenes: [{ title: "Set", shots: [{ title: "A" }, { title: "B" }, { title: "C" }] }],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "A three frame campaign." });
  const edited = { ...project, shots: project.shots.map((shot, index) => (index === 0 ? { ...shot, duration: 2 } : shot)) };
  const synced = syncProjectTiming(edited);
  assert.equal(synced.duration, 3, "project duration stays the frame count, not summed seconds");
  assert.ok(synced.shots.every((shot) => shot.duration === 1), "per-shot second edits normalize back to one frame");
  assert.ok(synced.deliverables.every((deliverable) => deliverable.unit === "frames"), "deliverables stay frame-based");
  assert.doesNotThrow(() => exportPacket(synced), "synced image project exports with agreeing metadata");
});

test("retimed short blueprints stay exportable despite float dust", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Dust", duration: 4, format: "Social campaign", aspect: "9:16", provider: "Runway" },
    scenes: [{ title: "Run", shots: Array.from({ length: 7 }, (_, index) => ({ title: `S${index + 1}`, duration: 2 })) }],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "Four seconds from seven model shots." });
  assert.equal(project.duration, 4, "seven sub-second allocations still read as the 4s target");
  assert.doesNotThrow(() => exportPacket(project), "float dust does not block export");
});

test("model-authored image campaigns honor the requested frame target", () => {
  const base = {
    source: "ollama",
    model: "test-model",
    project: { title: "Frames", duration: 9, format: "Image campaign", aspect: "4:5", provider: "Image model" },
    scenes: [{ title: "Set", shots: [{ title: "A" }, { title: "B" }, { title: "C" }] }],
  };
  const padded = createProjectFromBlueprint(base, { brief: "A nine frame campaign." });
  assert.equal(padded.shots.length, 9, "3 authored shots pad to the 9-frame request");
  assert.equal(padded.deliverables[0].duration, 9);
  assert.ok(padded.shots.every((shot) => shot.duration === 1));
  assert.ok(padded.shots.some((shot) => / \/ alt /.test(shot.title)), "padded frames are labeled as alternates");
  assert.match(padded.analysisNotes.join(" "), /adjusted to the requested 9 frames/);
  assert.ok(padded.shots.every((shot) => shot.versions.length === 1), "alternates compile their own packets");
  const trimmed = createProjectFromBlueprint({ ...base, project: { ...base.project, duration: 2 } }, { brief: "A two frame campaign." });
  assert.equal(trimmed.shots.length, 2, "extra authored shots trim to the 2-frame request");
  assert.equal(trimmed.deliverables[0].duration, 2);
});

test("caps skewed model durations so the requested target is preserved", () => {
  const blueprint = {
    source: "ollama",
    model: "test-model",
    project: { title: "Skewed", duration: 5, format: "Social campaign", aspect: "9:16", provider: "Runway" },
    scenes: [{ title: "Run", shots: [100, 1, 1, 1, 1].map((duration, index) => ({ title: `Shot ${index + 1}`, duration })) }],
  };
  const project = createProjectFromBlueprint(blueprint, { brief: "A five second cut with one runaway shot." });
  assert.equal(project.duration, 5, "skewed allocations cannot exceed the requested duration");
  assert.ok(project.shots.every((shot) => shot.duration >= 1), "every shot keeps at least one second");
});

test("rejects conflicting corpus domains instead of leaking them into product packets", () => {
  const product = createProjectFromBrief("A black perfume bottle emerges from marble", { title: "Stone", route: "Product ad" });
  const guidance = deriveCorpusGuidance(product, sampleIntelligence);
  assert.equal(guidance.route, "product");
  assert.match(guidance.storyPattern, /tactile context/i);
  assert.match(guidance.domainPlaybook, /material detail/i);
  assert.doesNotMatch(guidance.storyPattern, /automotive|vehicle/i);
  assert.doesNotMatch(guidance.domainPlaybook, /automotive|vehicle|wheel/i);
});

test("rejects unrelated product subdomains instead of contaminating a new brief", () => {
  const intelligence = {
    ...sampleIntelligence,
    storyboarding_logic: [{ key: "office-product-explainer", count: 99, examples: [{ pattern: "stable office setup", beats: ["show the professional in a stable office setup", "cut to a product packshot"] }] }],
    style_and_design_systems: [{ key: "golden-kitchen-packshot", count: 99, examples: [{ style: "Golden kitchen packshot", visual_tokens: ["restaurant counter", "warm kitchen light"] }] }],
  };
  const shoe = { brief: "A carbon-plated running shoe strikes wet pavement at dawn", format: "Social campaign", style: "", mood: "" };
  const guidance = deriveCorpusGuidance(shoe, intelligence);
  assert.doesNotMatch(guidance.storyPattern, /office/i);
  assert.doesNotMatch(guidance.styleSystem, /kitchen/i);
  assert.match(guidance.storyPattern, /tactile context/i);
});

test("does not route ordinary words containing car into automotive", () => {
  assert.equal(detectProjectRoute("A sculptor carries a perfume bottle into first light"), "product");
  assert.equal(detectProjectRoute("A performer carries a letter into the theatre"), "editorial");
});

test("auto-router recognizes the Director's product vocabulary", () => {
  assert.equal(detectProjectRoute("A sneaker drop shot on wet asphalt"), "product");
  assert.equal(detectProjectRoute("A vitamin serum campaign in morning light"), "product");
  assert.equal(detectProjectRoute("A single-malt whisky pour by firelight"), "food");
});

test("nature briefs route to the nature playbook instead of character", () => {
  assert.equal(detectProjectRoute("A mountain wildlife film at dawn"), "nature");
  assert.equal(detectProjectRoute("A desert landscape image campaign"), "nature");
  const project = createProjectFromBrief("A mountain wildlife film at dawn", { title: "Ridge" });
  assert.equal(project.shots[0].contentType, "nature");
  assert.ok(project.shots.length >= 3, "nature playbook builds a full production");
  const guidance = deriveCorpusGuidance(project, null);
  assert.match(guidance.storyPattern, /vast establishment/i, "nature guidance defaults apply");
});

test("corpus route hits match whole tokens, not substrings", () => {
  const intelligence = {
    prompt_generation_logic: [
      { key: "business-card-layout-rule", count: 40, examples: [{ rule: "CARD RULE: flat lay the card stationery." }] },
      { key: "automotive-hero-move", count: 3, examples: [{ rule: "AUTO RULE: prove tire contact under load." }] },
    ],
  };
  const project = createProjectFromBrief("A supercar launch film on a coastal road", { title: "Apex" });
  const guidance = deriveCorpusGuidance(project, intelligence);
  assert.doesNotMatch(guidance.promptRule, /CARD RULE/, "'business-card-layout' is not a car hit");
});

test("unlocked references are excluded from compiled continuity", () => {
  const project = createProjectFromBrief("A product film", { route: "Product ad" });
  const shot = project.shots[0];
  const asset = project.assets[0];
  assert.match(compileShot(project, shot).framePrompt, new RegExp(asset.name));
  asset.locked = false;
  assert.doesNotMatch(compileShot(project, shot).framePrompt, new RegExp(asset.name));
});
