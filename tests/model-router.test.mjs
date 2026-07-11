import assert from "node:assert/strict";
import test from "node:test";
import { describeOllamaModel, discoverOllamaModels, routeOllamaModels } from "../scripts/model-router.mjs";

const models = [
  { name: "llama3.1:8b", size: 4_900_000_000, details: { family: "llama", parameter_size: "8.0B", quantization_level: "Q4_K_M" } },
  { name: "gemma4:31b", size: 19_800_000_000, details: { family: "gemma4", parameter_size: "31.3B", quantization_level: "Q4_K_M" } },
  { name: "qwen3-coder:30b", size: 18_500_000_000, details: { family: "qwen3moe", parameter_size: "30.5B", quantization_level: "Q4_K_M" } },
  { name: "qwen2.5vl:3b", size: 3_200_000_000, details: { family: "qwen25vl", parameter_size: "3.8B", quantization_level: "Q4_K_M" } },
  { name: "glm-5.2:cloud", size: 338, details: { family: "glm", parameter_size: "756B" } },
];

test("model metadata recognizes parameters, quantization, vision, and cloud state", () => {
  assert.deepEqual(describeOllamaModel(models[3]), { name: "qwen2.5vl:3b", family: "qwen25vl", parametersB: 3.8, quantization: "Q4_K_M", sizeBytes: 3_200_000_000, local: true, vision: true, codeSpecialized: false });
  assert.equal(describeOllamaModel(models[4]).local, false);
});

test("role router maps 8B language models to screenplay and larger general models to prompt packets", () => {
  const result = routeOllamaModels({ models });
  assert.equal(result.roles.screenplay.selected, "llama3.1:8b");
  assert.equal(result.roles.promptPacket.selected, "gemma4:31b");
  assert.equal(result.roles.creativeDirector.selected, "gemma4:31b");
  assert.equal(result.roles.vision.selected, "qwen2.5vl:3b");
  assert.equal(result.models.find((model) => model.name.endsWith(":cloud")).local, false);
  assert.equal(result.roles.promptPacket.candidates.includes("glm-5.2:cloud"), false);
});

test("discovery preserves an unavailable state instead of inventing routes", async () => {
  const result = await discoverOllamaModels({ fetcher: async () => { throw new Error("offline"); }, timeoutMs: 50 });
  assert.equal(result.available, false);
  assert.equal(result.roles.screenplay.selected, null);
  assert.match(result.error, /offline/);
});
