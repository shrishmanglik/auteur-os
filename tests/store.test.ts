import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });

const { detectPersistenceStatus, isProject, normalizeProject, useStudio } = await import("../src/store");
const { createProjectFromBrief, exportPacket } = await import("../src/engine.mjs");

function resetStore() {
  const project = createProjectFromBrief("A clean automotive production", { title: "Reset" });
  useStudio.setState({
    project,
    selectedShotId: project.shots[0].id,
    selectedSceneId: project.scenes[0].id,
    renderRules: [],
    osIntelligence: null,
    intelligenceStatus: "loading",
    notice: "",
  });
  return project;
}

test("shot edits synchronize timing, block stale export, and compile all packets", () => {
  const initial = useStudio.getState();
  const shot = initial.project.shots[0];
  initial.updateShot(shot.id, { duration: 9 });
  const dirty = useStudio.getState();
  assert.equal(dirty.project.shots[0].packetDirty, true);
  assert.equal(dirty.project.duration, dirty.project.shots.reduce((sum, item) => sum + item.duration, 0));
  assert.throws(() => exportPacket(dirty.project), /Packet is not ready/);

  dirty.compileAllShots();
  const compiled = useStudio.getState();
  assert.equal(compiled.project.shots.some((item) => item.packetDirty), false);
  assert.doesNotThrow(() => exportPacket(compiled.project));
});

test("QC requires attached evidence and reaches pass only when both gates pass", () => {
  const shotId = useStudio.getState().project.shots[0].id;
  useStudio.getState().analyzeReview(shotId);
  assert.match(useStudio.getState().notice, /Attach provider render evidence/i);

  useStudio.getState().attachRender(shotId, "data:image/png;base64,evidence");
  useStudio.getState().updateReview(shotId, { temporalPass: true });
  useStudio.getState().updateReview(shotId, { continuityPass: true });
  const review = useStudio.getState().project.shots[0].review;
  assert.equal(review.status, "pass");
});

test("unlocking a reference dirties packets and removes it after recompilation", () => {
  const state = useStudio.getState();
  const asset = state.project.assets.find((item) => item.locked)!;
  state.toggleAssetLock(asset.id);
  assert.equal(useStudio.getState().project.shots.every((shot) => shot.packetDirty), true);
  useStudio.getState().compileAllShots();
  const current = useStudio.getState().project;
  const first = current.shots[0];
  const version = first.versions.find((item) => item.id === first.activeVersionId)!;
  assert.doesNotMatch(version.framePrompt, new RegExp(asset.name));
});

test("storage availability is probed instead of assumed", () => {
  assert.equal(detectPersistenceStatus(localStorage), "saved");
  assert.equal(detectPersistenceStatus(null), "unavailable");
  assert.equal(detectPersistenceStatus({
    setItem() { throw new Error("blocked"); },
    removeItem() {},
  }), "unavailable");
});

test("v1 projects hydrate with UniversalPacket v2 defaults", () => {
  const v1 = createProjectFromBrief("A legacy product film", { title: "Legacy" });
  for (const shot of v1.shots) {
    delete shot.optics;
    delete shot.imperfectionAnchors;
    delete shot.lightingGrade;
  }

  assert.equal(isProject(v1), true);
  const hydrated = normalizeProject(v1);
  for (const shot of hydrated.shots) {
    assert.ok(shot.optics && shot.optics.focalLengthMm > 0);
    assert.deepEqual(shot.imperfectionAnchors, []);
    assert.ok(shot.lightingGrade?.primarySource);
    assert.equal("audioTrack" in shot, false);
  }
});

test("transport audio is canonicalized at the shot write boundary", () => {
  const state = useStudio.getState();
  const shot = state.project.shots[0];
  state.updateShot(shot.id, {
    audioTrack: {
      spokenText: "MARA: Keep rolling.",
      soundDesignDirectives: ["cloth movement", "room tone"],
    },
  } as unknown as Parameters<typeof state.updateShot>[1]);

  const saved = useStudio.getState().project.shots[0] as unknown as Record<string, unknown>;
  assert.equal(saved.dialogue, "MARA: Keep rolling.");
  assert.equal(saved.audioIntent, "cloth movement; room tone");
  assert.equal("audioTrack" in saved, false, "transport audio never persists beside canonical audio");
});

test("deterministic-by-choice builds keep a ready brain status; real fallback marks offline", () => {
  const makeBlueprint = (source: string) => ({
    source,
    model: "AUTEUR Director (corpus-grounded)",
    project: { title: "Status", duration: 8, format: "Social campaign", aspect: "9:16", provider: "Runway" },
    scenes: [{ title: "One", shots: [{ title: "A", duration: 4 }, { title: "B", duration: 4 }] }],
  });
  useStudio.setState({ brainStatus: "ready", brainModel: "qwen3.6:latest" });
  useStudio.getState().setProjectFromBlueprint(makeBlueprint("director-deterministic"), "chosen deterministic build");
  assert.equal(useStudio.getState().brainStatus, "ready", "opting out of the writer's room does not mark the model offline");
  assert.equal(useStudio.getState().brainModel, "qwen3.6:latest", "the detected Ollama model is not replaced by the Director provenance label");
  useStudio.getState().setProjectFromBlueprint(makeBlueprint("deterministic-fallback"), "model actually failed");
  assert.equal(useStudio.getState().brainStatus, "offline", "a real fallback still reads offline");
});

test("quota fallback strips continuity start/end frames to reach metadata-only", () => {
  const project = resetStore();
  const shotId = project.shots[0].id;
  useStudio.getState().updateShot(shotId, { startFrame: "data:image/png;base64,AAA", endFrame: "data:image/png;base64,BBB" });
  const storage = globalThis.localStorage as unknown as { setItem: (key: string, value: string) => void };
  const originalSetItem = storage.setItem.bind(storage);
  let persistedPayload = "";
  storage.setItem = (key: string, value: string) => {
    if (value.includes("data:")) throw new Error("quota exceeded");
    persistedPayload = value;
    originalSetItem(key, value);
  };
  try {
    useStudio.getState().updateShot(shotId, { title: "Trigger a save over quota" });
  } finally {
    storage.setItem = originalSetItem;
  }
  assert.equal(useStudio.getState().persistenceStatus, "metadata-only");
  const persisted = JSON.parse(persistedPayload);
  assert.equal(persisted.shots[0].startFrame, "");
  assert.equal(persisted.shots[0].endFrame, "");
  assert.equal(persisted.shots[0].packetDirty, true);
});

test("render intelligence creates lineage and never approves dirty edits", () => {
  const project = resetStore();
  const shotId = project.shots[0].id;
  const initialVersions = project.shots[0].versions.length;
  useStudio.getState().setRenderRules([{ fix: "Hold a measurable temporal delta", count: 12 }]);
  const synchronized = useStudio.getState().project.shots[0];
  assert.equal(synchronized.versions.length, initialVersions + 1);
  assert.equal(synchronized.versions.at(-1)?.source, "corpus-intelligence-sync");

  useStudio.getState().updateShot(shotId, { description: "An uncompiled edit" });
  const beforeRules = useStudio.getState().project.shots[0].versions.length;
  useStudio.getState().setRenderRules([{ fix: "A different corpus rule", count: 13 }]);
  const dirty = useStudio.getState().project.shots[0];
  assert.equal(dirty.packetDirty, true);
  assert.equal(dirty.versions.length, beforeRules);
});

test("removing render intelligence creates a clean lineage version without stale rule text", () => {
  resetStore();
  useStudio.getState().setRenderRules([{ fix: "UNIQUE RULE MARKER", count: 1 }]);
  const withRule = useStudio.getState().project.shots[0];
  assert.match(withRule.versions.at(-1)!.videoPrompt, /UNIQUE RULE MARKER/);
  const versionCount = withRule.versions.length;
  useStudio.getState().setRenderRules([]);
  const withoutRule = useStudio.getState().project.shots[0];
  assert.equal(withoutRule.versions.length, versionCount + 1);
  assert.doesNotMatch(withoutRule.versions.at(-1)!.videoPrompt, /UNIQUE RULE MARKER/);
  assert.equal(withoutRule.packetDirty, false);
});

test("synchronizes OS intelligence atomically and preserves dirty director work", () => {
  const project = resetStore();
  const intelligence = {
    batch_delta_files: 1,
    render_records: 50,
    coverage: { records_reviewed: 50 },
    storyboarding_logic: [{ key: "automotive PROVEN STORY PATTERN", examples: [{ pattern: "automotive PROVEN STORY PATTERN", beats: ["setup", "proof", "resolve"] }] }],
  };
  useStudio.getState().setCorpusIntelligence([], intelligence);
  const synchronized = useStudio.getState().project.shots[0];
  assert.match(synchronized.versions.at(-1)!.videoPrompt, /PROVEN STORY PATTERN/);
  assert.equal(synchronized.versions.at(-1)!.source, "corpus-intelligence-sync");

  useStudio.getState().updateShot(project.shots[0].id, { action: "Uncompiled director action" });
  const versionsBefore = useStudio.getState().project.shots[0].versions.length;
  useStudio.getState().setCorpusIntelligence([], { ...intelligence, batch_delta_files: 2 });
  const dirty = useStudio.getState().project.shots[0];
  assert.equal(dirty.packetDirty, true);
  assert.equal(dirty.versions.length, versionsBefore);
});

test("creates new lineage when corpus provenance changes without prompt text changes", () => {
  resetStore();
  const oldIntelligence = {
    generated_at: "2026-07-10T00:00:00.000Z",
    batch_delta_files: 1,
    render_records: 50,
    coverage: { records_reviewed: 50 },
    storyboarding_logic: [{ key: "stable-pattern", examples: [{ pattern: "Stable pattern" }], evidence_gen_ids: ["gen-old"] }],
  };
  useStudio.getState().setCorpusIntelligence([], oldIntelligence);
  const before = useStudio.getState().project.shots[0];
  const beforeCount = before.versions.length;
  const beforeSignature = before.versions.at(-1)!.intelligenceSignature;

  useStudio.getState().setCorpusIntelligence([], {
    ...oldIntelligence,
    generated_at: "2026-07-10T01:00:00.000Z",
    batch_delta_files: 2,
    render_records: 100,
    coverage: { records_reviewed: 100 },
    storyboarding_logic: [{ key: "stable-pattern", examples: [{ pattern: "Stable pattern" }], evidence_gen_ids: ["gen-new"] }],
  });
  const after = useStudio.getState().project.shots[0];
  assert.equal(after.versions.length, beforeCount + 1);
  assert.notEqual(after.versions.at(-1)!.intelligenceSignature, beforeSignature);
  assert.equal(useStudio.getState().osIntelligence?.render_records, 100);
});

test("hydration rejects missing scene and deliverable references", () => {
  const project = createProjectFromBrief("A persisted project", { title: "Persisted" });
  const brokenDeliverable = structuredClone(project);
  brokenDeliverable.deliverables[0].shotIds.push("missing-shot");
  assert.equal(isProject(brokenDeliverable), false);

  const orphaned = structuredClone(project);
  orphaned.scenes[0].shots = orphaned.scenes[0].shots.slice(1);
  assert.equal(isProject(orphaned), false);
});

test("duplicate and reorder operations synchronize deliverable membership and order", () => {
  const project = resetStore();
  const sourceId = project.scenes[0].shots[0];
  useStudio.getState().duplicateShot(sourceId);
  const duplicated = useStudio.getState();
  const copyId = duplicated.selectedShotId;
  for (const deliverable of duplicated.project.deliverables.filter((item) => item.shotIds.includes(sourceId))) {
    assert.equal(deliverable.shotIds[deliverable.shotIds.indexOf(sourceId) + 1], copyId);
  }
  duplicated.moveShot(copyId, 1);
  const moved = useStudio.getState().project;
  const canonical = moved.scenes.flatMap((scene) => scene.shots);
  for (const deliverable of moved.deliverables) {
    const indexes = deliverable.shotIds.map((id) => canonical.indexOf(id));
    assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
  }
  useStudio.getState().compileAllShots();
  assert.doesNotThrow(() => exportPacket(useStudio.getState().project));
});

test("changing a critique clears stale proposals and cannot export as pass", () => {
  const project = resetStore();
  const shotId = project.shots[0].id;
  useStudio.getState().attachRender(shotId, "data:image/png;base64,evidence");
  useStudio.getState().updateReview(shotId, { critique: "The face drifts and the logo is gibberish" });
  useStudio.getState().analyzeReview(shotId);
  assert.ok(useStudio.getState().project.shots[0].review.proposals.length > 0);
  useStudio.getState().updateReview(shotId, { critique: "The exposure flickers badly", temporalPass: true, continuityPass: true });
  const review = useStudio.getState().project.shots[0].review;
  assert.equal(review.proposals.length, 0);
  assert.equal(review.status, "repair");
  const packet = exportPacket(useStudio.getState().project);
  assert.equal(packet.shots[0].qc.status, "repair");
  assert.equal(packet.shots[0].qc.critique, "The exposure flickers badly");
});

test("clean packet compilation and repair application are idempotent", () => {
  const project = resetStore();
  const shotId = project.shots[0].id;
  const initialVersions = project.shots[0].versions.length;
  useStudio.getState().compileSelectedShot();
  assert.equal(useStudio.getState().project.shots[0].versions.length, initialVersions);

  useStudio.getState().attachRender(shotId, "data:image/png;base64,evidence");
  useStudio.getState().updateReview(shotId, { critique: "The face drifts after contact" });
  useStudio.getState().analyzeReview(shotId);
  const proposal = useStudio.getState().project.shots[0].review.proposals[0];
  useStudio.getState().toggleProposal(shotId, proposal.id);
  useStudio.getState().applyRepairs(shotId);
  const afterFirst = useStudio.getState().project.shots[0];
  useStudio.getState().applyRepairs(shotId);
  const afterSecond = useStudio.getState().project.shots[0];
  assert.equal(afterSecond.versions.length, afterFirst.versions.length);
  assert.equal(afterSecond.activeRepairs.length, afterFirst.activeRepairs.length);
  assert.match(useStudio.getState().notice, /Select at least one repair/i);
});
