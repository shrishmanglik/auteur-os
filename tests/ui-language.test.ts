import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { noticePresentation } from "../src/ui-language";

const uiFiles = ["AppV2.tsx", "App.tsx", "production-flow.ts", "store.ts"];

test("rendered UI strings contain no retired production terminology", async () => {
  const source = (
    await Promise.all(
      uiFiles.map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8")),
    )
  ).join("\n");

  assert.doesNotMatch(source, /Bundled Intelligence/i);
  assert.doesNotMatch(source, /Provider Execution Handoff/i);
  assert.doesNotMatch(source, /Screenplay Scene Plan/i);
  assert.doesNotMatch(source, /Prompt Pack\b/i);
  assert.doesNotMatch(source, /Prompt Packet\b/i);
  assert.match(source, /Production Intelligence/);
  assert.match(source, /Prompt Package/);
  assert.match(source, /Shot List & Camera Angles/);
});

test("every representative error notice snapshot names the problem and offers one action", () => {
  const snapshots = [
    noticePresentation("Ollama is still offline. Start Ollama, then check the connection again."),
    noticePresentation("Prompt Package export failed. Compile the affected shot, then try again."),
    noticePresentation("Provider evidence exceeds the 100 MB review limit."),
    noticePresentation("Production development failed. Review the brief and try again."),
  ];

  assert.deepEqual(snapshots, [
    { kind: "error", message: "Ollama is still offline. Start Ollama, then check the connection again.", actionLabel: "View model status", recovery: "model" },
    { kind: "error", message: "Prompt Package export failed. Compile the affected shot, then try again.", actionLabel: "Open Prompt Package", recovery: "prompts" },
    { kind: "error", message: "Provider evidence exceeds the 100 MB review limit.", actionLabel: "Choose smaller file", recovery: "review-upload" },
    { kind: "error", message: "Production development failed. Review the brief and try again.", actionLabel: "Keep editing", recovery: "dismiss" },
  ]);
  for (const snapshot of snapshots) {
    assert.equal(snapshot.kind, "error");
    assert.ok(snapshot.message.trim(), "error must name the problem");
    assert.ok(snapshot.actionLabel?.trim(), "error must provide exactly one action");
  }
});

test("help and local-first transparency language remains available", async () => {
  const source = await readFile(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
  assert.match(source, /HelpTooltip label="Prompt Package"/);
  assert.match(source, /HelpTooltip label="Continuity"/);
  assert.match(source, /HelpTooltip label="Pre-flight"/);
  assert.match(source, /Local-First Processing Active/);
});
