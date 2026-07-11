import assert from "node:assert/strict";
import test from "node:test";
import { chooseNewestSnapshot, createStudioSnapshot, isStudioSnapshot, workspacePatch } from "../src/persistence";
import { useStudio } from "../src/store";

test("studio snapshots include project and workspace recovery state", () => {
  const state = useStudio.getState();
  useStudio.setState({ mode: "storyboard", selectedShotId: state.project.shots.at(-1)!.id, selectedSceneId: state.project.scenes.at(-1)!.id, playhead: 7, previewing: true, command: "Hold the final frame" });
  const snapshot = createStudioSnapshot(useStudio.getState(), "2026-07-11T12:00:00.000Z");
  assert.equal(snapshot.workspace.mode, "storyboard");
  assert.equal(snapshot.workspace.playhead, 7);
  assert.equal(snapshot.workspace.command, "Hold the final frame");
  assert.equal(isStudioSnapshot(snapshot), true);
});

test("newest valid snapshot wins and invalid records are ignored", () => {
  const older = createStudioSnapshot(useStudio.getState(), "2026-07-11T10:00:00.000Z");
  const newer = createStudioSnapshot(useStudio.getState(), "2026-07-11T11:00:00.000Z");
  assert.equal(chooseNewestSnapshot({ broken: true }, older, newer)?.savedAt, newer.savedAt);
});

test("rehydration repairs stale scene and shot selections and clamps playhead", () => {
  const snapshot = createStudioSnapshot(useStudio.getState());
  snapshot.workspace.selectedShotId = "missing-shot";
  snapshot.workspace.selectedSceneId = "missing-scene";
  snapshot.workspace.playhead = snapshot.project.duration + 100;
  const patch = workspacePatch(snapshot);
  assert.equal(patch.selectedShotId, snapshot.project.shots[0].id);
  assert.equal(patch.selectedSceneId, snapshot.project.scenes[0].id);
  assert.equal(patch.playhead, snapshot.project.duration);
});
