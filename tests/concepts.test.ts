import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ideateProductionConcepts, type IntelligenceStage } from "../src/intelligence";

const input = {
  idea: "A locksmith discovers every key opens the same childhood kitchen.",
  format: "Short film sequence",
  duration: 45,
  model: "test-director",
  ideaOverrides: { hero: "Nadia", setting: "a rain-soaked key shop", object: "a blue enamel key" },
};

function modelConcept(index: number) {
  return {
    lens: `model-lens-${index}`,
    name: `Direction ${index}`,
    logline: `Nadia follows the blue enamel key through a distinct consequence ${index}.`,
    twist: `The rain-soaked key shop changes meaning when consequence ${index} is revealed.`,
    humor: "Dry visual misdirection.",
    thesis: "A physical choice reveals the emotional cost.",
    tone: "Tactile and restrained.",
    mood: "Uneasy recognition.",
  };
}

test("online concept ideation returns three validated model concepts", async () => {
  const fetcher: typeof fetch = async (request) => {
    const url = String(request);
    if (url.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "test-director" }] }), { status: 200 });
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ concepts: [modelConcept(1), modelConcept(2), modelConcept(3)] }) } }), { status: 200 });
  };
  const result = await ideateProductionConcepts(input, { fetcher, timeoutMs: 100 });
  assert.equal(result.source, "ollama");
  assert.equal(result.model, "test-director");
  assert.equal(result.concepts.length, 3);
  assert.equal(result.fallbackReason, null);
});

test("parse failure falls back inline to three deterministic Corpus Blueprints", async () => {
  const stages: IntelligenceStage[] = [];
  const fetcher: typeof fetch = async (request) => {
    const url = String(request);
    if (url.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "test-director" }] }), { status: 200 });
    return new Response(JSON.stringify({ message: { content: "not valid concept JSON" } }), { status: 200 });
  };
  const result = await ideateProductionConcepts(input, { fetcher, timeoutMs: 100, onStatus: (stage) => stages.push(stage) });
  assert.equal(result.source, "deterministic-fallback");
  assert.equal(result.model, "test-director", "a parse failure does not falsely mark a successfully probed model offline");
  assert.equal(result.concepts.length, 3);
  assert.ok(result.concepts.every((concept) => concept.groundingFramework));
  assert.match(result.fallbackReason || "", /JSON|concept/i);
  assert.equal(stages.at(-1), "fallback");
  assert.ok(result.concepts.some((concept) => /Nadia|blue enamel key|rain-soaked key shop/i.test(`${concept.logline} ${concept.twist}`)), "brief overrides survive fallback");
});

test("concept inference timeout falls back without losing deterministic output", async () => {
  const fetcher: typeof fetch = async (request, init) => {
    const url = String(request);
    if (url.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "test-director" }] }), { status: 200 });
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason || new Error("aborted")), { once: true });
    });
  };
  const result = await ideateProductionConcepts(input, { fetcher, timeoutMs: 5 });
  assert.equal(result.source, "deterministic-fallback");
  assert.equal(result.model, "test-director");
  assert.equal(result.concepts.length, 3);
  assert.match(result.fallbackReason || "", /timed out|abort/i);
});

test("concept UI exposes offline provenance, quick slots, and brief-preserving fallback copy", async () => {
  const source = await readFile(new URL("../src/AppV2.tsx", import.meta.url), "utf8");
  const wizard = source.slice(source.indexOf("function NewProductionDialog"), source.indexOf("function Notice"));
  assert.match(wizard, /Corpus Blueprint/);
  assert.match(wizard, /concept\.groundingFramework/);
  assert.match(wizard, /Blueprint hero name/);
  assert.match(wizard, /Blueprint setting/);
  assert.match(wizard, /Blueprint key object/);
  assert.match(wizard, /your brief was preserved/);
  assert.match(wizard, /ideateProductionConcepts/);
});
