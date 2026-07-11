const ROLE_DEFINITIONS = {
  fastDraft: "Low-latency ideation and alternate directions",
  screenplay: "Dialogue, treatments, and screenplay development",
  promptPacket: "Dense structured prompt-packet generation",
  creativeDirector: "Highest-quality general production reasoning",
  vision: "Reference-image and storyboard-frame analysis",
};

function parameterBillions(model) {
  const raw = String(model?.details?.parameter_size || model?.name || "");
  const match = raw.match(/(\d+(?:\.\d+)?)\s*([bm])/i);
  if (!match) return null;
  return Number(match[1]) * (match[2].toLowerCase() === "m" ? 0.001 : 1);
}

function isVisionModel(model) {
  return /(?:qwen[^\s]*vl|llava|vision)/i.test(`${model.name} ${model.details?.family || ""}`);
}

function isCloudModel(model) {
  return /:cloud$/i.test(String(model.name || "")) || Number(model.size || 0) < 1024 * 1024;
}

function isCodeModel(model) {
  return /coder|code(?:$|[-_.:\d])/i.test(`${model.name} ${model.details?.family || ""}`);
}

export function describeOllamaModel(model) {
  const parametersB = parameterBillions(model);
  return {
    name: String(model.name || model.model || ""),
    family: String(model.details?.family || "unknown"),
    parametersB,
    quantization: String(model.details?.quantization_level || "unknown"),
    sizeBytes: Number(model.size || 0),
    local: !isCloudModel(model),
    vision: isVisionModel(model),
    codeSpecialized: isCodeModel(model),
  };
}

function score(model, role) {
  const size = model.parametersB || 0;
  const generalPenalty = model.codeSpecialized ? 35 : 0;
  const familyBonus = /gemma|llama|qwen/i.test(model.family) ? 5 : 0;
  if (!model.local) return -Infinity;
  if (role === "vision") return model.vision ? 100 + size : -Infinity;
  if (model.vision) return -20;
  if (role === "fastDraft") return 100 - Math.abs(size - 8) * 5 - generalPenalty + familyBonus;
  if (role === "screenplay") return 120 - Math.abs(size - 8) * 3 - generalPenalty + familyBonus + (/gemma|llama/i.test(model.family) ? 8 : 0);
  if (role === "promptPacket") return Math.min(size, 70) * 2 - generalPenalty + familyBonus + (/gemma/i.test(model.family) ? 12 : 0);
  return Math.min(size, 70) * 1.7 - generalPenalty + familyBonus + (/gemma/i.test(model.family) ? 10 : 0);
}

export function routeOllamaModels(payload) {
  const rawModels = Array.isArray(payload?.models) ? payload.models : [];
  const models = rawModels.map(describeOllamaModel).filter((model) => model.name);
  const roles = Object.fromEntries(Object.entries(ROLE_DEFINITIONS).map(([role, purpose]) => {
    const candidates = models
      .map((model) => ({ model, score: score(model, role) }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score || a.model.name.localeCompare(b.model.name))
      .map((entry) => entry.model.name);
    return [role, { purpose, selected: candidates[0] || null, candidates }];
  }));
  return {
    discoveredAt: new Date().toISOString(),
    available: models.some((model) => model.local),
    models,
    roles,
    policy: { localOnly: true, cloudModelsExcluded: true, manualOverride: true },
  };
}

export async function discoverOllamaModels({ fetcher = globalThis.fetch, endpoint = "http://127.0.0.1:11434/api/tags", timeoutMs = 8_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Ollama discovery timed out.")), timeoutMs);
  try {
    const response = await fetcher(endpoint, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`Ollama discovery failed with HTTP ${response.status}.`);
    return { ...routeOllamaModels(await response.json()), error: null };
  } catch (error) {
    return { ...routeOllamaModels({ models: [] }), error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export function createModelRouter(initial, discover = discoverOllamaModels) {
  let state = initial;
  return {
    get: () => state,
    refresh: async () => { state = await discover(); return state; },
  };
}
