import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { productionActionFor, productionModes } from "../src/production-flow";

test("every production view resolves exactly one enabled next action", () => {
  assert.ok(productionModes.length >= 9);
  for (const mode of productionModes) {
    const action = productionActionFor(mode);
    assert.ok(action, `${mode} must resolve a primary action`);
    assert.ok(action.label.trim(), `${mode} action needs a label`);
    assert.ok(action.detail.trim(), `${mode} action needs context`);
  }
});

test("production actions are independent of model availability", () => {
  assert.equal(productionActionFor.length, 1, "model state must never enter the action policy");
  assert.deepEqual(productionActionFor("storyboard"), {
    label: "Run pre-flight",
    detail: "Compile current changes and inspect the generation package.",
    kind: "preflight",
    target: "prompts",
  });
});

test("production tabs never derive disabled state from brain status", async () => {
  const source = await readFile(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
  const tabs = source.slice(source.indexOf("function ProjectTabs"), source.indexOf("function ProductionActionBar"));
  assert.doesNotMatch(tabs, /disabled/);
  assert.doesNotMatch(tabs, /brainStatus/);
  assert.match(source, /Corpus Draft/);
  assert.match(source, /No production tab is disabled/);
  assert.doesNotMatch(source.slice(source.indexOf("function TopBar"), source.indexOf("function SideNav")), /v2-export/);
  assert.match(source.slice(source.indexOf("function Workspace"), source.indexOf("function NewProductionDialog")), /DraftModelAssist/);
});
