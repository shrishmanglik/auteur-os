import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DIRECTOR_FORMATS } from "../src/director.mjs";
import { createProjectFromBlueprint, createProjectFromBrief } from "../src/engine.mjs";
import { classifyIntakeFiles, elevationInputForProject, preserveAuthoredScriptInBlueprint } from "../src/intake";

test("intake routes supported text and image files without confusing other assets", () => {
  const files = [
    new File(["INT. ROOM - NIGHT"], "script.fountain", { type: "text/plain" }),
    new File(["notes"], "brief.md", { type: "text/markdown" }),
    new File([new Uint8Array([1, 2, 3])], "frame.png", { type: "image/png" }),
    new File(["binary"], "archive.zip", { type: "application/zip" }),
  ];
  const result = classifyIntakeFiles(files);
  assert.deepEqual(result.text.map((file) => file.name), ["script.fountain", "brief.md"]);
  assert.deepEqual(result.images.map((file) => file.name), ["frame.png"]);
  assert.deepEqual(result.rejected.map((file) => file.name), ["archive.zip"]);
});

test("post-edit elevation passes the current screenplay and dialogue as its scaffold", () => {
  const project = createProjectFromBrief("A founder admits the expensive mistake that changed the company", { title: "The Admission" });
  const scene = project.scenes[0];
  const shot = project.shots.find((item) => item.sceneId === scene.id)!;
  scene.title = "The director's rewritten opening";
  scene.intent = "Hold on the discomfort before the confession.";
  shot.action = "She closes the laptop, leaves both hands visible, and chooses not to hide.";
  shot.dialogue = "TO CAMERA: \"I spent our runway on certainty.\"";

  const input = elevationInputForProject(project, "qwen-test", { corpus: true });
  const screenplay = input.screenplay as { scenes: Array<{ beat: string; intent: string; action: string; dialogue: string }> };

  assert.equal(screenplay.scenes[0].beat, "The director's rewritten opening");
  assert.equal(screenplay.scenes[0].intent, "Hold on the discomfort before the confession.");
  assert.match(screenplay.scenes[0].action, /closes the laptop/);
  assert.match(screenplay.scenes[0].dialogue, /spent our runway on certainty/);
  assert.equal(input.model, "qwen-test");
  assert.deepEqual(input.promptBrain, { corpus: true });

  const conflictingModelBlueprint = {
    source: "ollama",
    model: "qwen-test",
    project: { title: project.title, logline: "Model replacement", format: project.format, aspect: project.aspect, duration: project.duration, platform: project.platform, provider: project.provider },
    scenes: [{ title: "Model scene", intent: "Replace the edit", shots: [{ title: "Model shot", description: "Generic replacement", intent: "Replace", duration: 4, action: "The laptop disappears.", dialogue: "MODEL: \"This edit is gone.\"" }] }],
    assets: [],
  };
  const protectedBlueprint = preserveAuthoredScriptInBlueprint(conflictingModelBlueprint, project);
  const elevatedProject = createProjectFromBlueprint(protectedBlueprint, { brief: project.brief });
  const elevatedShot = elevatedProject.shots.find((item) => item.sceneId === elevatedProject.scenes[0].id)!;
  assert.equal(elevatedProject.scenes.length, project.scenes.length, "authored scene structure survives elevation");
  assert.equal(elevatedProject.scenes[0].title, "The director's rewritten opening");
  assert.equal(elevatedShot.action, "She closes the laptop, leaves both hands visible, and chooses not to hide.");
  assert.equal(elevatedShot.dialogue, "TO CAMERA: \"I spent our runway on certainty.\"");
});

test("Screen 1 renders every Director format and never model-gates development", async () => {
  const source = await readFile(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
  const home = source.slice(source.indexOf("function HomeWorkspace"), source.indexOf("function ProjectsWorkspace"));
  for (const format of DIRECTOR_FORMATS) assert.match(home, /DIRECTOR_FORMATS\.map/, `${format.key} must come from the canonical format map`);
  assert.match(home, /data-format-key=\{item\.key\}/);
  assert.match(home, /className="v4-develop" disabled=\{!brief\.trim\(\)\}/);
  assert.doesNotMatch(home, /className="v4-develop"[^>]+brainStatus/);
  assert.match(home, /Fine-tune/);
  assert.match(home, /event\.dataTransfer\.files/);
});

test("DraftModelAssist uses the authored-project elevation payload", async () => {
  const source = await readFile(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
  const assist = source.slice(source.indexOf("function DraftModelAssist"), source.indexOf("function StorySpine"));
  assert.match(assist, /elevationInputForProject\(project, brainModel/);
  assert.match(assist, /analyzeProductionBrief\(input,/);
  assert.match(assist, /preserveAuthoredScriptInBlueprint\(/);
  assert.doesNotMatch(assist, /analyzeProductionBrief\(\{ brief, title:/);
});

test("model status reserves the degraded-mode notice for genuine offline state", async () => {
  const source = await readFile(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
  const status = source.slice(source.indexOf("function BrainStatus"), source.indexOf("function TopBar"));
  assert.match(status, /brainStatus === "analyzing"/);
  assert.match(status, /brainStatus === "checking"/);
  assert.match(status, /brainStatus === "error"/);
  assert.equal(status.match(/AUTEUR switches to corpus-grounded deterministic compilation/g)?.length, 1);
});
