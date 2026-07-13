import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Inspector exposes normalized optics controls and a live compiled packet preview", async () => {
  const source = await readFile(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
  assert.match(source, /normalizeUniversalShotV2\(shot\)\.optics/);
  assert.match(source, /shotOpticsLabel\(shot\)/);
  assert.doesNotMatch(source, /<span>Lens language<\/span><input value=\{shot\.lens\}/);
  assert.match(source, /aria-label="Focal length"/);
  assert.match(source, /aria-label="T-stop"/);
  assert.match(source, /aria-label="Subject distance"/);
  assert.match(source, /aria-label="Subject distance" type="range" min="0\.3" max="20" step="0\.05"/);
  assert.match(source, /compileShot\(project, shot, renderRules, osIntelligence\)/);
  assert.match(source, /aria-label="Live video prompt">\{livePacket\.videoPrompt\}/);
});
