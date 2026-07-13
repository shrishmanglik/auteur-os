import type { CorpusGuidance } from "./types";
import type { Project, Shot } from "./types";
import { detectRoute, developBlueprint, extractBriefConstraints, ideateConcepts, routeToContentType } from "./director.mjs";
import type { DirectorConcept, DirectorInput } from "./director.mjs";
import { normalizeUniversalShotV2 } from "./universal-packet.mjs";
import type { AudioTrack, LightingGrade, Optics } from "./types";

const runtimeGlobals = globalThis as typeof globalThis & { __AUTEUR_OLLAMA_BASE__?: string };
const ollamaBase = runtimeGlobals.__AUTEUR_OLLAMA_BASE__ || "/ollama";
const TAGS_ENDPOINT = `${ollamaBase}/api/tags`;
const CHAT_ENDPOINT = `${ollamaBase}/api/chat`;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MODEL_PREFERENCES = ["gemma4:latest", "llama3.1:8b", "qwen2.5vl:3b", "qwen3"];
const STRING_ARRAY_SCHEMA = { type: "array", items: { type: "string" } } as const;
const OPTICS_SCHEMA = { type: "object", required: ["focalLengthMm", "tStop", "subjectDistanceMeters"], properties: {
  cameraBody: { type: "string" }, lensModel: { type: "string" }, focalLengthMm: { type: "number" }, tStop: { type: "number" }, subjectDistanceMeters: { type: "number" },
} } as const;
const LIGHTING_GRADE_SCHEMA = { type: "object", required: ["primarySource", "paletteBase", "isDesaturated", "isCrushedBlacks"], properties: {
  primarySource: { type: "string" }, paletteBase: { type: "string" }, isDesaturated: { type: "boolean" }, isCrushedBlacks: { type: "boolean" },
} } as const;
const AUDIO_TRACK_SCHEMA = { type: "object", required: ["soundDesignDirectives"], properties: {
  spokenText: { type: "string" }, soundDesignDirectives: STRING_ARRAY_SCHEMA,
} } as const;
const CONCEPT_SCHEMA = {
  type: "object",
  required: ["concepts"],
  properties: {
    concepts: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", required: ["lens", "name", "logline", "twist", "humor", "thesis", "tone", "mood"], properties: {
      lens: { type: "string" }, name: { type: "string" }, logline: { type: "string" }, twist: { type: "string" }, humor: { type: "string" }, thesis: { type: "string" }, tone: { type: "string" }, mood: { type: "string" },
    } } },
  },
} as const;
export const BLUEPRINT_SCHEMA = {
  type: "object",
  required: ["project", "styleBible", "storyBeats", "scenes", "assets"],
  properties: {
    project: { type: "object", required: ["title", "logline", "creativeThesis", "format", "aspect", "duration", "platform", "provider"], properties: {
      title: { type: "string" }, logline: { type: "string" }, creativeThesis: { type: "string" }, format: { type: "string" }, aspect: { type: "string" }, duration: { type: "number" }, platform: { type: "string" }, provider: { type: "string" },
    } },
    styleBible: { type: "object", required: ["visualTone", "lighting", "palette", "texture", "lensLanguage", "mood"], properties: {
      visualTone: { type: "string" }, lighting: { type: "string" }, palette: STRING_ARRAY_SCHEMA, texture: { type: "string" }, lensLanguage: { type: "string" }, mood: { type: "string" },
    } },
    storyBeats: STRING_ARRAY_SCHEMA,
    scenes: { type: "array", minItems: 1, items: { type: "object", required: ["id", "title", "slugline", "description", "intent", "duration", "shots"], properties: {
      id: { type: "string" }, title: { type: "string" }, slugline: { type: "string" }, description: { type: "string" }, intent: { type: "string" }, duration: { type: "number" },
      shots: { type: "array", minItems: 1, items: { type: "object", required: ["id", "title", "slugline", "description", "intent", "duration", "shotSize", "lens", "movement", "startState", "action", "endState", "continuityLocks", "referenceNeeds"], properties: {
        id: { type: "string" }, title: { type: "string" }, slugline: { type: "string" }, description: { type: "string" }, intent: { type: "string" }, duration: { type: "number" }, shotSize: { type: "string" }, lens: { type: "string" }, movement: { type: "string" }, startState: { type: "string" }, action: { type: "string" }, endState: { type: "string" }, dialogue: { type: "string" }, audioIntent: { type: "string" }, optics: OPTICS_SCHEMA, imperfectionAnchors: STRING_ARRAY_SCHEMA, lightingGrade: LIGHTING_GRADE_SCHEMA, audioTrack: AUDIO_TRACK_SCHEMA, continuityLocks: STRING_ARRAY_SCHEMA, referenceNeeds: STRING_ARRAY_SCHEMA,
      } } },
    } } },
    assets: { type: "array", items: { type: "object", required: ["id", "name", "type", "description", "continuityLocks", "referenceNeeds"], properties: {
      id: { type: "string" }, name: { type: "string" }, type: { type: "string" }, description: { type: "string" }, continuityLocks: STRING_ARRAY_SCHEMA, referenceNeeds: STRING_ARRAY_SCHEMA,
    } } },
  },
} as const;

export type IntelligenceStage =
  | "probing"
  | "connecting"
  | "analyzing"
  | "parsing"
  | "complete"
  | "fallback";

export type IntelligenceStatusCallback = (stage: IntelligenceStage, detail: string) => void;

export interface ProductionBriefInput {
  brief: string;
  title?: string;
  format?: string;
  aspect?: string;
  duration?: number;
  platform?: string;
  provider?: string;
  model?: string;
  audience?: string;
  tone?: string;
  humor?: string;
  concept?: Record<string, string>;
  screenplay?: unknown;
  promptBrain?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: IntelligenceStatusCallback;
}

export interface AnalyzeProductionOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: IntelligenceStatusCallback;
}

export interface ProbeLocalBrainOptions {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  preferredModel?: string;
}

export interface LocalBrainProbe {
  available: boolean;
  models: string[];
  model: string | null;
  error: string | null;
}

export interface ModelRoleDiscovery extends LocalBrainProbe {
  roles: Record<string, { purpose: string; selected: string | null; candidates: string[] }>;
}

export interface ConceptIdeationResult {
  source: "ollama" | "deterministic-fallback";
  model: string | null;
  concepts: DirectorConcept[];
  fallbackReason: string | null;
}

export interface BlueprintProject {
  title: string;
  logline: string;
  creativeThesis: string;
  format: string;
  aspect: string;
  duration: number;
  platform: string;
  provider: string;
}

export interface StyleBible {
  visualTone: string;
  lighting: string;
  palette: string[];
  texture: string;
  lensLanguage: string;
  mood: string;
}

export interface BlueprintShot {
  id: string;
  title: string;
  slugline: string;
  description: string;
  intent: string;
  duration: number;
  shotSize: string;
  lens: string;
  movement: string;
  startState: string;
  action: string;
  endState: string;
  dialogue: string;
  audioIntent: string;
  optics?: Optics;
  imperfectionAnchors?: string[];
  lightingGrade?: LightingGrade;
  audioTrack?: AudioTrack;
  continuityLocks: string[];
  referenceNeeds: string[];
}

export interface BlueprintScene {
  id: string;
  title: string;
  slugline: string;
  description: string;
  intent: string;
  duration: number;
  shots: BlueprintShot[];
}

export interface BlueprintAsset {
  id: string;
  name: string;
  type: string;
  description: string;
  continuityLocks: string[];
  referenceNeeds: string[];
}

export interface ProductionBlueprint {
  source: "ollama" | "deterministic-fallback" | "director-deterministic";
  project: BlueprintProject;
  styleBible: StyleBible;
  storyBeats: string[];
  scenes: BlueprintScene[];
  assets: BlueprintAsset[];
  model?: string;
  concept?: Record<string, string>;
  screenplay?: unknown;
  qualityReport?: { score: number; issues: string[]; passed: boolean };
}

interface NormalizationDefaults {
  title?: string;
  brief?: string;
  format?: string;
  aspect?: string;
  duration?: number;
  platform?: string;
  provider?: string;
}

interface RequestContext {
  signal: AbortSignal;
  dispose: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function stringList(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => cleanString(item, ""))
    .filter(Boolean);
  return [...new Set(values)];
}

function positiveNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 10) / 10 : fallback;
}

function slug(value: string, prefix: string, index: number): string {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return clean ? `${prefix}-${index + 1}-${clean}` : `${prefix}-${index + 1}`;
}

function requiredArray(parent: Record<string, unknown>, key: string): unknown[] {
  const value = parent[key];
  if (!Array.isArray(value)) throw new Error(`Invalid production blueprint: ${key} must be an array.`);
  return value;
}

function findBalancedObject(text: string): string | null {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(start, index + 1);
      }
    }
  }
  return null;
}

function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1]);
  for (const candidate of [...fenced, text]) {
    const objectText = findBalancedObject(candidate);
    if (!objectText) continue;
    try {
      return JSON.parse(objectText) as unknown;
    } catch {
      // Continue because a response may contain prose with braces before the real JSON payload.
    }
  }
  throw new Error("Ollama response did not contain a valid JSON object.");
}

function cleanMultiline(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeShot(value: unknown, sceneIndex: number, shotIndex: number): BlueprintShot {
  if (!isRecord(value)) throw new Error(`Invalid production blueprint: scenes[${sceneIndex}].shots[${shotIndex}] must be an object.`);
  const title = cleanString(value.title, `Shot ${shotIndex + 1}`);
  const normalized = normalizeUniversalShotV2(value, {
    primarySource: "Motivated practical key",
    paletteBase: "Natural neutrals",
    audioIntent: "UNKNOWN pending playable audio evidence.",
  });
  return {
    id: cleanString(value.id, slug(title, `shot-${sceneIndex + 1}`, shotIndex)),
    title,
    slugline: cleanString(value.slugline, "INT./EXT. PRODUCTION SPACE - CONTINUOUS"),
    description: cleanString(value.description, title),
    intent: cleanString(value.intent, "Advance the production with one observable beat."),
    duration: positiveNumber(value.duration, 3),
    shotSize: cleanString(value.shotSize, "Medium shot"),
    lens: cleanString(value.lens, "Natural perspective"),
    movement: cleanString(value.movement, "Locked frame"),
    startState: cleanString(value.startState, "The prior state is held and readable."),
    action: cleanString(value.action, "One defining action occurs."),
    endState: cleanString(value.endState, "The action resolves into a stable cut point."),
    dialogue: cleanMultiline(normalized.dialogue),
    audioIntent: cleanString(normalized.audioIntent, "UNKNOWN pending playable audio evidence."),
    optics: normalized.optics,
    imperfectionAnchors: normalized.imperfectionAnchors,
    lightingGrade: normalized.lightingGrade,
    continuityLocks: stringList(value.continuityLocks, ["subject identity", "world geometry", "screen direction"]),
    referenceNeeds: stringList(value.referenceNeeds),
  };
}

function normalizeAsset(value: unknown, index: number): BlueprintAsset {
  if (!isRecord(value)) throw new Error(`Invalid production blueprint: assets[${index}] must be an object.`);
  const name = cleanString(value.name, `Asset ${index + 1}`);
  return {
    id: cleanString(value.id, slug(name, "asset", index)),
    name,
    type: cleanString(value.type, "reference"),
    description: cleanString(value.description, `${name} production reference.`),
    continuityLocks: stringList(value.continuityLocks),
    referenceNeeds: stringList(value.referenceNeeds),
  };
}

export function parseProductionBlueprintResponse(
  responseText: string,
  defaults: NormalizationDefaults = {},
): ProductionBlueprint {
  const parsed = extractJson(responseText);
  if (!isRecord(parsed)) throw new Error("Invalid production blueprint: root must be an object.");

  const projectValue = isRecord(parsed.project) ? parsed.project : parsed;
  const styleValue = isRecord(parsed.styleBible) ? parsed.styleBible : {};
  const rawStoryBeats = Array.isArray(parsed.storyBeats) ? parsed.storyBeats : [];
  const rawScenes = requiredArray(parsed, "scenes");
  const rawAssets = Array.isArray(parsed.assets) ? parsed.assets : [];
  if (rawScenes.length === 0) throw new Error("Invalid production blueprint: scenes cannot be empty.");

  const scenes = rawScenes.map((sceneValue, sceneIndex) => {
    if (!isRecord(sceneValue)) throw new Error(`Invalid production blueprint: scenes[${sceneIndex}] must be an object.`);
    const rawShots = requiredArray(sceneValue, "shots");
    if (rawShots.length === 0) throw new Error(`Invalid production blueprint: scenes[${sceneIndex}].shots cannot be empty.`);
    const shots = rawShots.map((shot, shotIndex) => normalizeShot(shot, sceneIndex, shotIndex));
    const title = cleanString(sceneValue.title, `Scene ${sceneIndex + 1}`);
    return {
      id: cleanString(sceneValue.id, slug(title, "scene", sceneIndex)),
      title,
      slugline: cleanString(sceneValue.slugline, "INT./EXT. PRODUCTION SPACE - CONTINUOUS"),
      description: cleanString(sceneValue.description, title),
      intent: cleanString(sceneValue.intent, "Deliver a distinct story beat."),
      duration: positiveNumber(sceneValue.duration, shots.reduce((sum, shot) => sum + shot.duration, 0)),
      shots,
    };
  });

  const brief = cleanString(defaults.brief, "Untitled production");
  const sceneDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
  return {
    source: "ollama",
    project: {
      title: cleanString(projectValue.title, cleanString(defaults.title, brief.split(" ").slice(0, 6).join(" "))),
      logline: cleanString(projectValue.logline, brief),
      creativeThesis: cleanString(projectValue.creativeThesis, "Build meaning through observable action and resolved visual states."),
      format: cleanString(projectValue.format, cleanString(defaults.format, "Cinematic production")),
      aspect: cleanString(projectValue.aspect, cleanString(defaults.aspect, "16:9")),
      duration: positiveNumber(projectValue.duration, positiveNumber(defaults.duration, sceneDuration)),
      platform: cleanString(projectValue.platform, cleanString(defaults.platform, "Web")),
      provider: cleanString(projectValue.provider, cleanString(defaults.provider, "Local planning only")),
    },
    styleBible: {
      visualTone: cleanString(styleValue.visualTone, "Cinematic realism"),
      lighting: cleanString(styleValue.lighting, "Motivated practical light"),
      palette: stringList(styleValue.palette, ["neutral", "controlled accent"]),
      texture: cleanString(styleValue.texture, "Credible material detail"),
      lensLanguage: cleanString(styleValue.lensLanguage, "Consistent natural perspective"),
      mood: cleanString(styleValue.mood, "Purposeful restraint"),
    },
    storyBeats: stringList(rawStoryBeats, scenes.map((scene) => scene.intent)),
    scenes,
    assets: rawAssets.map(normalizeAsset),
  };
}

function requestContext(timeoutMs: number, externalSignal?: AbortSignal): RequestContext {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(new Error("Ollama request timed out.")), timeoutMs);
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const context = requestContext(timeoutMs, signal);
  try {
    return await fetcher(url, { ...init, signal: context.signal });
  } finally {
    context.dispose();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function selectModel(models: string[], preferred?: string): string | null {
  if (preferred) {
    const exact = models.find((model) => model === preferred);
    if (exact) return exact;
    const family = models.find((model) => model.startsWith(`${preferred}:`));
    if (family) return family;
  }
  for (const family of DEFAULT_MODEL_PREFERENCES) {
    const match = models.find((model) => model.toLowerCase().startsWith(family));
    if (match) return match;
  }
  return models[0] ?? null;
}

export async function probeLocalBrain(options: ProbeLocalBrainOptions = {}): Promise<LocalBrainProbe> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  try {
    const response = await fetchWithTimeout(
      fetcher,
      TAGS_ENDPOINT,
      { method: "GET", headers: { Accept: "application/json" } },
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      options.signal,
    );
    if (!response.ok) throw new Error(`Ollama model probe failed with HTTP ${response.status}.`);
    const body = await response.json() as unknown;
    if (!isRecord(body) || !Array.isArray(body.models)) throw new Error("Ollama model probe returned an invalid payload.");
    const models = body.models
      .map((model) => isRecord(model) ? cleanString(model.name, "") : "")
      .filter(Boolean);
    const model = selectModel(models, options.preferredModel);
    return { available: Boolean(model), models, model, error: model ? null : "No local Ollama models are installed." };
  } catch (error) {
    return { available: false, models: [], model: null, error: errorMessage(error) };
  }
}

export async function discoverLocalModelRoles(options: ProbeLocalBrainOptions = {}): Promise<ModelRoleDiscovery> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  try {
    const response = await fetchWithTimeout(fetcher, "/api/models/roles", { method: "GET", headers: { Accept: "application/json" } }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.signal);
    if (!response.ok) throw new Error(`Model role discovery failed with HTTP ${response.status}.`);
    const body = await response.json() as unknown;
    if (!isRecord(body) || !Array.isArray(body.models) || !isRecord(body.roles)) throw new Error("Model role discovery returned an invalid payload.");
    const models = body.models.map((model) => isRecord(model) ? cleanString(model.name, "") : "").filter(Boolean);
    const roles = Object.fromEntries(Object.entries(body.roles).map(([role, value]) => {
      const entry = isRecord(value) ? value : {};
      return [role, { purpose: cleanString(entry.purpose, role), selected: typeof entry.selected === "string" ? entry.selected : null, candidates: stringList(entry.candidates, []) }];
    }));
    const selected = roles.creativeDirector?.selected || roles.screenplay?.selected || models[0] || null;
    return { available: Boolean(selected), models, model: selected, roles, error: typeof body.error === "string" ? body.error : null };
  } catch {
    const fallback = await probeLocalBrain(options);
    return { ...fallback, roles: {} };
  }
}

function parseConceptResponse(responseText: string): DirectorConcept[] {
  const parsed = extractJson(responseText);
  if (!isRecord(parsed) || !Array.isArray(parsed.concepts) || parsed.concepts.length !== 3) throw new Error("Local concept response must contain exactly three concepts.");
  return parsed.concepts.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Local concept ${index + 1} is not an object.`);
    const required = ["lens", "name", "logline", "twist", "humor", "thesis", "tone", "mood"] as const;
    const fields = Object.fromEntries(required.map((field) => [field, cleanString(value[field], "")])) as Record<typeof required[number], string>;
    if (required.some((field) => !fields[field])) throw new Error(`Local concept ${index + 1} is missing required creative fields.`);
    return { id: `concept-model-${index + 1}`, ...fields } as DirectorConcept;
  });
}

export async function ideateProductionConcepts(
  input: DirectorInput & { model?: string },
  options: AnalyzeProductionOptions & { seed?: number } = {},
): Promise<ConceptIdeationResult> {
  const seed = options.seed ?? 0;
  const deterministic = () => ideateConcepts(input, seed) as DirectorConcept[];
  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let activeModel: string | null = null;
  const fallback = (reason: string): ConceptIdeationResult => ({ source: "deterministic-fallback", model: activeModel, concepts: deterministic(), fallbackReason: reason });
  try {
    status(options.onStatus, "probing", "Checking the local writer's room.");
    const probe = await probeLocalBrain({ fetcher, timeoutMs, signal: options.signal, preferredModel: input.model });
    if (!probe.available || !probe.model) return fallback(probe.error || "No local Ollama model is available.");
    activeModel = probe.model;
    status(options.onStatus, "analyzing", `Developing three original directions with ${probe.model}.`);
    const response = await fetchWithTimeout(fetcher, CHAT_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: probe.model,
        stream: false,
        format: CONCEPT_SCHEMA,
        options: { temperature: 0.88, top_p: 0.92, repeat_penalty: 1.08, num_predict: 1800, num_ctx: 8192 },
        messages: [
          { role: "system", content: "You are AUTEUR's local creative director. Return valid JSON only. Create exactly three distinct, filmable concepts without imitating a living filmmaker." },
          { role: "user", content: [
            `Production request: ${JSON.stringify(input)}`,
            "Each concept needs a distinct narrative lens, causal twist, visual thesis, humor register, tone, and mood.",
            "Use concrete people, objects, settings, and consequences. Ban generic inspiration language and ad-speak.",
          ].join("\n") },
        ],
      }),
    }, timeoutMs, options.signal);
    if (!response.ok) throw new Error(`Local concept generation failed with HTTP ${response.status}.`);
    const body = await response.json() as unknown;
    if (!isRecord(body) || !isRecord(body.message) || typeof body.message.content !== "string") throw new Error("Local concept generation returned an invalid chat payload.");
    status(options.onStatus, "parsing", "Validating the three creative directions.");
    const concepts = parseConceptResponse(body.message.content);
    status(options.onStatus, "complete", "Three local-model directions are ready.");
    return { source: "ollama", model: probe.model, concepts, fallbackReason: null };
  } catch (error) {
    const reason = errorMessage(error);
    status(options.onStatus, "fallback", reason);
    return fallback(reason);
  }
}

interface PromptBrainPayload {
  content_types?: Record<string, { camera?: string[]; lighting?: string[]; physics?: string[]; verbiage?: string[]; negatives?: string[] }>;
  gold_exemplars?: Array<{ content_type?: string; why_gold?: string; excerpt?: string }>;
  techniques?: Array<{ technique?: string }>;
}

function craftExcerpt(input: ProductionBriefInput): string[] {
  const brain = isRecord(input.promptBrain) ? (input.promptBrain as PromptBrainPayload) : null;
  if (!brain) return [];
  // Shared word-boundary route detector — substring matching here classified
  // "carries"/"card" briefs as automotive and contaminated the craft excerpts.
  const type = routeToContentType[detectRoute(`${input.brief} ${input.format || ""}`)] || "human";
  const conventions = brain.content_types?.[type];
  const gold = (brain.gold_exemplars || []).find((item) => item.content_type === type) || (brain.gold_exemplars || [])[0];
  const techniques = (brain.techniques || []).slice(0, 8).map((item) => item.technique).filter(Boolean);
  return [
    conventions ? `Corpus craft for ${type} (from 4,175 studied prompts) — camera: ${(conventions.camera || []).slice(0, 3).join("; ")}. Lighting: ${(conventions.lighting || []).slice(0, 2).join("; ")}. Physics language: ${(conventions.physics || []).slice(0, 3).join("; ")}. Proven verbiage: ${(conventions.verbiage || []).slice(0, 5).join("; ")}. Never: ${(conventions.negatives || []).slice(0, 3).join("; ")}.` : "",
    techniques.length ? `Signature techniques observed across the corpus: ${techniques.join("; ")}.` : "",
    gold?.excerpt ? `GOLD REFERENCE PROMPT (study its density, physicality, and specificity — this is the quality bar): "${gold.excerpt}" Why it is gold: ${gold.why_gold || "evidenced excellence"}.` : "",
  ].filter(Boolean);
}

function promptFor(input: ProductionBriefInput, corpusGuidance: CorpusGuidance): string {
  const humor = input.humor && input.humor !== "none" ? input.humor : "";
  return [
    "Return valid JSON only. Do not wrap it in Markdown and do not include commentary.",
    "You are AUTEUR's director and head writer — the standard is work that would make Tarantino or Nolan lean forward. You never settle for generic.",
    "Create one production blueprint from the brief, chosen concept, and draft screenplay below.",
    "Deliver original, festival- and campaign-grade work without imitating any living filmmaker.",
    "CREATIVE CONTRACT:",
    "- The chosen concept's angle and twist are the spine. Sharpen them; never flatten them into something ordinary.",
    "- First extract every explicit brief constraint (cast count, location count, dialogue or voice-over bans, product name, tone, audience, duration, and loop requirement). Obey all of them exactly.",
    "- Treat the draft screenplay as a scaffold to ELEVATE, not obey: keep its structure and timing, rewrite its language, dialogue, and imagery to be sharper, more specific, more human.",
    "- Dialogue must have subtext and rhythm. No exposition dumps, no ad-speak, no 'in a world'. People interrupt, deflect, and say less than they mean.",
    humor ? `- Humor register: ${humor}. The comedy lives in staging and timing, delivered straight-faced — never winking at camera.` : "- Played straight: wit lives in staging and juxtaposition, not gags.",
    "- Every shot must earn its place with one observable action, physical world logic (weight, contact, light), and a held end state.",
    "- Every shot must be causally different from the previous shot. Never repeat scene intent as shot action. Name the subject, place, behavior, material, and consequence actually visible.",
    "- The screenplay needs a specific want, obstacle, turn, and irreversible final image. Ads dramatize a product truth instead of decorating a pack shot. A-roll makes one defensible argument with concrete proof.",
    "- If the brief requests no dialogue (or is explicitly silent), every dialogue field must be empty. If it bans only voice-over, write no narration or V.O. lines but keep diegetic spoken dialogue between characters. If it requests one actor, create exactly one character asset and no second visible character.",
    "- Describe matter and light the way the gold reference does: physically, specifically, 'more real than real'. Ban filler adjectives (beautiful, stunning, amazing, epic).",
    "- Do not use a fixed, preset, default, minimum, or maximum scene count or shot count. Infer structure from the story.",
    "- For each shot, author optics with focalLengthMm, tStop, and subjectDistanceMeters; imperfectionAnchors; and a lightingGrade grounded in the visible setup.",
    "- audioTrack is a transport shape only: spokenText maps to canonical dialogue and soundDesignDirectives map to canonical audioIntent. Do not repeat identical audio text in both representations.",
    "Follow the enforced JSON response schema. Keep prose concise but concrete so the full production fits in one response.",
    `Production brief: ${JSON.stringify({ brief: input.brief, title: input.title, format: input.format, aspect: input.aspect, duration: input.duration, platform: input.platform, provider: input.provider, audience: input.audience, tone: input.tone, humor: input.humor })}`,
    input.concept ? `Chosen creative concept: ${JSON.stringify(input.concept)}` : "",
    input.screenplay ? `Draft screenplay scaffold (elevate, keep structure and timing): ${JSON.stringify(input.screenplay)}` : "",
    ...craftExcerpt(input),
    `Render-evidence guidance: ${JSON.stringify(corpusGuidance)}`,
  ].filter(Boolean).join("\n");
}

export function evaluateBlueprintAgainstBrief(blueprint: ProductionBlueprint, brief: string): { score: number; issues: string[]; passed: boolean } {
  const constraints = extractBriefConstraints(brief) as { noDialogue?: boolean; noVoiceover?: boolean; actorCount?: number | null; oneLocation?: boolean; loopable?: boolean };
  const issues: string[] = [];
  const shots = blueprint.scenes.flatMap((scene) => scene.shots);
  const characterAssets = blueprint.assets.filter((asset) => /character|cast|person/i.test(asset.type));
  if (constraints.noDialogue && shots.some((shot) => shot.dialogue.trim())) issues.push("The brief forbids dialogue, but spoken lines were authored.");
  // Matches any speaker label carrying a narration marker: "V.O.:", "VO:", "VOICEOVER:",
  // "NARRATOR:", "NARRATION:", and character-attributed forms like "MARA (V.O.):".
  const voiceOverLine = /(?:^|\n)\s*(?:[A-Z][A-Z .'-]{0,40}[\s(])?\(?\s*(?:V\.?\s?O\.?|VOICE[ -]?OVER|NARRATOR|NARRATION)\s*\)?\s*:/i;
  if (!constraints.noDialogue && constraints.noVoiceover && shots.some((shot) => voiceOverLine.test(shot.dialogue))) issues.push("The brief forbids voice-over narration, but V.O./narrator lines were authored.");
  if (constraints.actorCount && characterAssets.length !== constraints.actorCount) issues.push(`The brief requires exactly ${constraints.actorCount} visible actor(s); the blueprint defines ${characterAssets.length}.`);
  if (constraints.oneLocation) {
    const locations = new Set(blueprint.scenes.map((scene) => scene.slugline.replace(/\s+-\s+(DAY|NIGHT|CONTINUOUS|DUSK|DAWN).*$/i, "").trim()));
    if (locations.size > 1) issues.push("The brief requires one location, but multiple scene locations were authored.");
  }
  if (constraints.loopable && shots.length && !/loop|return|same|match|repeat|opening/i.test(`${shots.at(-1)?.endState} ${shots.at(-1)?.action}`)) issues.push("The brief requires a loop, but the final state does not reconnect to the opening state.");
  const generic = /one defining action|advance the (?:story|scene|production)|beat resolves|stable handoff|prior state is held|world is composed and readable|hero behavior rendered|show the world straining/i;
  const genericShots = shots.filter((shot) => generic.test(`${shot.description} ${shot.action} ${shot.startState} ${shot.endState}`));
  if (genericShots.length) issues.push(`${genericShots.length} shot(s) use template language instead of specific visible direction.`);
  const actionKeys = shots.map((shot) => shot.action.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  if (new Set(actionKeys).size < actionKeys.length) issues.push("Two or more shots repeat the same defining action.");
  const briefTerms = [...new Set(brief.toLowerCase().match(/[a-z][a-z'-]{4,}/g) || [])]
    .filter((term) => !/second|video|film|story|scene|short|where|about|should|could|would|whatever/.test(term));
  const blueprintText = JSON.stringify(blueprint).toLowerCase();
  const coveredTerms = briefTerms.filter((term) => blueprintText.includes(term));
  if (briefTerms.length >= 4 && coveredTerms.length < Math.min(4, Math.ceil(briefTerms.length / 3))) issues.push("The treatment loses too many concrete nouns or requirements from the brief.");
  if (shots.length < 2 && !/single (?:image|shot|scene)/i.test(brief)) issues.push("The production has too little shot development for the requested format.");
  if (shots.some((shot) => !shot.action || !shot.startState || !shot.endState || !shot.shotSize || !shot.lens || !shot.audioIntent)) issues.push("One or more shots are missing generation-critical direction fields.");
  const score = Math.max(0, 100 - issues.length * 14);
  return { score, issues, passed: issues.length === 0 };
}

function deterministicFallback(input: ProductionBriefInput, guidance: CorpusGuidance): ProductionBlueprint {
  // The AUTEUR Director authors a real production offline: concept -> screenplay
  // (with dialogue) -> blueprint, grounded in the distilled prompt corpus.
  const directorInput = {
    idea: input.brief,
    title: input.title,
    format: input.format,
    aspect: input.aspect,
    duration: input.duration,
    platform: input.platform,
    provider: input.provider,
    audience: input.audience,
    tone: input.tone,
    humor: input.humor,
    screenplay: input.screenplay,
  };
  const concept = (input.concept ?? ideateConcepts(directorInput, 0)[0]) as Parameters<typeof developBlueprint>[1];
  const blueprint = developBlueprint(directorInput, concept, input.promptBrain ?? null, 0) as unknown as ProductionBlueprint;
  void guidance;
  const fallbackBlueprint = { ...blueprint, source: "deterministic-fallback", model: "AUTEUR Director (corpus-grounded draft)" } as ProductionBlueprint;
  fallbackBlueprint.qualityReport = evaluateBlueprintAgainstBrief(fallbackBlueprint, input.brief);
  return fallbackBlueprint;
}

function normalizeInput(input: ProductionBriefInput | string): ProductionBriefInput {
  return typeof input === "string" ? { brief: input } : input;
}

function status(callback: IntelligenceStatusCallback | undefined, stage: IntelligenceStage, detail: string): void {
  try {
    callback?.(stage, detail);
  } catch {
    // Status reporting must not interrupt analysis or fallback behavior.
  }
}

export async function analyzeProductionBrief(
  rawInput: ProductionBriefInput | string,
  corpusGuidance: CorpusGuidance,
  options: AnalyzeProductionOptions = {},
): Promise<ProductionBlueprint> {
  const input = normalizeInput(rawInput);
  const onStatus = options.onStatus ?? input.onStatus;
  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const signal = options.signal ?? input.signal;
  const fallback = (reason: string) => {
    status(onStatus, "fallback", reason);
    return deterministicFallback(input, corpusGuidance);
  };

  if (!cleanString(input.brief, "")) return fallback("The production brief is empty; using deterministic planning defaults.");

  try {
    status(onStatus, "probing", "Checking the local Ollama model registry.");
    const probe = await probeLocalBrain({ fetcher, timeoutMs, signal, preferredModel: input.model });
    if (!probe.available || !probe.model) return fallback(probe.error || "No local Ollama model is available.");

    status(onStatus, "connecting", `Connecting to local model ${probe.model}.`);
    status(onStatus, "analyzing", "Building a production blueprint from the brief and corpus guidance.");
    const response = await fetchWithTimeout(fetcher, CHAT_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: probe.model,
        stream: false,
        format: BLUEPRINT_SCHEMA,
        options: { temperature: 0.72, top_p: 0.9, repeat_penalty: 1.08, num_predict: 6000, num_ctx: 16384 },
        messages: [
          { role: "system", content: "You are AUTEUR's local production intelligence planner. Return valid JSON only and never invent provider execution evidence." },
          { role: "user", content: promptFor(input, corpusGuidance) },
        ],
      }),
    }, timeoutMs, signal);
    if (!response.ok) throw new Error(`Ollama analysis failed with HTTP ${response.status}.`);
    const body = await response.json() as unknown;
    if (!isRecord(body) || !isRecord(body.message) || typeof body.message.content !== "string") {
      throw new Error("Ollama analysis returned an invalid chat payload.");
    }

    status(onStatus, "parsing", "Validating and normalizing the local model response.");
    let blueprint = parseProductionBlueprintResponse(body.message.content, input);
    let qualityReport = evaluateBlueprintAgainstBrief(blueprint, input.brief);
    if (!qualityReport.passed) {
      status(onStatus, "analyzing", "Creative QC found weak or non-compliant choices. Rewriting the production once.");
      const repairResponse = await fetchWithTimeout(fetcher, CHAT_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: probe.model,
          stream: false,
          format: BLUEPRINT_SCHEMA,
          options: { temperature: 0.64, top_p: 0.88, repeat_penalty: 1.1, num_predict: 6000, num_ctx: 16384 },
          messages: [
            { role: "system", content: "You are AUTEUR's uncompromising creative director and continuity supervisor. Return valid JSON only." },
            { role: "user", content: `${promptFor(input, corpusGuidance)}\n\nREJECTED DRAFT:\n${JSON.stringify(blueprint)}\n\nMANDATORY CREATIVE QC FIXES:\n- ${qualityReport.issues.join("\n- ")}\nRewrite the entire blueprint. Keep only choices that are specific, causal, filmable, and faithful to the brief.` },
          ],
        }),
      }, timeoutMs, signal);
      if (!repairResponse.ok) throw new Error(`Ollama creative QC rewrite failed with HTTP ${repairResponse.status}.`);
      const repairBody = await repairResponse.json() as unknown;
      if (!isRecord(repairBody) || !isRecord(repairBody.message) || typeof repairBody.message.content !== "string") throw new Error("Ollama creative QC returned an invalid chat payload.");
      blueprint = parseProductionBlueprintResponse(repairBody.message.content, input);
      qualityReport = evaluateBlueprintAgainstBrief(blueprint, input.brief);
    }
    blueprint.qualityReport = qualityReport;
    status(onStatus, "complete", `Production blueprint ready with ${blueprint.scenes.length} scenes.`);
    return blueprint;
  } catch (error) {
    return fallback(errorMessage(error));
  }
}

export interface ShotDirectionResult {
  source: "ollama" | "deterministic-fallback";
  model: string | null;
  patch: Partial<Pick<Shot, "title" | "description" | "intent" | "shotSize" | "lens" | "movement" | "startState" | "action" | "endState" | "audioIntent" | "continuityLocks" | "referenceNeeds">>;
}

export async function refineShotDirection(
  project: Project,
  shot: Shot,
  direction: string,
  options: { model?: string; timeoutMs?: number; signal?: AbortSignal; onStatus?: IntelligenceStatusCallback; fetcher?: typeof fetch } = {},
): Promise<ShotDirectionResult> {
  const instruction = cleanString(direction, "");
  if (!instruction) throw new Error("A director command is required.");
  const fetcher = options.fetcher ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 90_000;
  try {
    status(options.onStatus, "probing", "Checking the local director model.");
    const probe = await probeLocalBrain({ fetcher, timeoutMs, signal: options.signal, preferredModel: options.model });
    if (!probe.available || !probe.model) throw new Error(probe.error || "Local brain unavailable.");
    status(options.onStatus, "analyzing", `Re-directing ${shot.title} with ${probe.model}.`);
    const orderedShots = project.scenes.flatMap((scene) => scene.shots.map((id) => project.shots.find((item) => item.id === id)).filter((item): item is Shot => Boolean(item)));
    const shotIndex = orderedShots.findIndex((item) => item.id === shot.id);
    const scene = project.scenes.find((item) => item.id === shot.sceneId);
    const continuityAssets = project.assets.filter((asset) => shot.continuityRefs.includes(asset.id)).map(({ id, name, type, role, description, locked }) => ({ id, name, type, role, description, locked }));
    const editorialContext = {
      scene: scene ? { title: scene.title, intent: scene.intent, order: scene.order } : null,
      previousShot: shotIndex > 0 ? { title: orderedShots[shotIndex - 1].title, endState: orderedShots[shotIndex - 1].endState } : null,
      nextShot: shotIndex >= 0 && shotIndex < orderedShots.length - 1 ? { title: orderedShots[shotIndex + 1].title, startState: orderedShots[shotIndex + 1].startState } : null,
      continuityAssets,
      hasStartFrame: Boolean(shot.startFrame),
      hasEndFrame: Boolean(shot.endFrame),
    };
    const response = await fetchWithTimeout(fetcher, CHAT_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: probe.model,
        stream: false,
        format: "json",
        options: { temperature: 0.25 },
        messages: [
          { role: "system", content: "You are AUTEUR's shot-level directing intelligence. Return valid JSON only. Preserve continuity and change only what the director requested." },
          { role: "user", content: [
            `Project: ${JSON.stringify({ title: project.title, logline: project.logline, creativeThesis: project.creativeThesis, styleBible: project.styleBible, worldRule: project.worldRule })}`,
            `Editorial and continuity context: ${JSON.stringify(editorialContext)}`,
            `Current shot: ${JSON.stringify({ title: shot.title, description: shot.description, intent: shot.intent, shotSize: shot.shotSize, lens: shot.lens, movement: shot.movement, startState: shot.startState, action: shot.action, endState: shot.endState, audioIntent: shot.audioIntent, continuityLocks: shot.continuityLocks, referenceNeeds: shot.referenceNeeds })}`,
            `Director command: ${instruction}`,
            "Return exactly one JSON object with any changed fields from: title, description, intent, shotSize, lens, movement, startState, action, endState, audioIntent, continuityLocks, referenceNeeds.",
          ].join("\n") },
        ],
      }),
    }, timeoutMs, options.signal);
    if (!response.ok) throw new Error(`Ollama shot direction failed with HTTP ${response.status}.`);
    const body = await response.json() as unknown;
    if (!isRecord(body) || !isRecord(body.message) || typeof body.message.content !== "string") throw new Error("Local brain returned an invalid shot payload.");
    const parsed = extractJson(body.message.content);
    if (!isRecord(parsed)) throw new Error("Shot revision must be a JSON object.");
    const allowedStrings = ["title", "description", "intent", "shotSize", "lens", "movement", "startState", "action", "endState", "audioIntent"] as const;
    const patch: ShotDirectionResult["patch"] = {};
    for (const key of allowedStrings) if (typeof parsed[key] === "string" && cleanString(parsed[key], "")) patch[key] = cleanString(parsed[key], "");
    if (Array.isArray(parsed.continuityLocks)) patch.continuityLocks = stringList(parsed.continuityLocks, shot.continuityLocks);
    if (Array.isArray(parsed.referenceNeeds)) patch.referenceNeeds = stringList(parsed.referenceNeeds, shot.referenceNeeds || []);
    if (!Object.keys(patch).length) throw new Error("Local brain returned no usable shot changes.");
    status(options.onStatus, "complete", "Shot revision ready for review and compilation.");
    return { source: "ollama", model: probe.model, patch };
  } catch {
    status(options.onStatus, "fallback", "Local shot direction unavailable; preserving the command as an explicit draft note.");
    return { source: "deterministic-fallback", model: null, patch: { description: `${shot.description}. Director command: ${instruction}` } };
  }
}
