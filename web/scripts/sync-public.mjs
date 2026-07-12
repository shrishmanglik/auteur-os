import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Public web deploy: media is copied verbatim, but the distilled corpus brains
// are REDACTED before they become public static assets. The full brains (raw
// gold-exemplar prompts, per-rule corpus evidence, synthesized deltas) are the
// product's moat; they stay in the private repo and the local offline build,
// never on the public URL. The app degrades gracefully on the lean data:
// content-type conventions and counts remain; corpus-grounded packet injection
// falls back to the built-in route guidance defaults.

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(webRoot, "..", "public");
const targetRoot = resolve(webRoot, "public");
const sourceData = resolve(sourceRoot, "data");
const targetData = resolve(targetRoot, "data");

async function readJson(name) {
  try {
    return JSON.parse(await readFile(resolve(sourceData, name), "utf8"));
  } catch {
    return null;
  }
}

// Collapse a distilled logic array to public-safe {key, count}: the Intelligence
// view reads only key + count, and dropping `examples`/`evidence_gen_ids` removes
// both the raw corpus references and the material that would ground packet prompts.
function leanLogic(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({ key: String(item?.key ?? ""), count: Number(item?.count) || (Array.isArray(item?.evidence_gen_ids) ? item.evidence_gen_ids.length : 0) }));
}

function redactPromptBrain(brain) {
  if (!brain) return null;
  const goldCount = Array.isArray(brain.gold_exemplars) ? brain.gold_exemplars.length : 0;
  return {
    generated_at: brain.generated_at ?? null,
    source: brain.source ?? null,
    corpus_total: brain.corpus_total ?? null,
    // Conventions are the "lean brain": craft language, not raw prompts. Keep.
    content_types: brain.content_types ?? {},
    // Technique names + evidence weight only (already prose-free). Keep.
    techniques: Array.isArray(brain.techniques) ? brain.techniques.map((t) => ({ technique: String(t?.technique ?? ""), evidence: Number(t?.evidence) || 0 })) : [],
    // Crown jewels removed: full-text gold prompts, why-gold prose, workflow /
    // architecture bodies. Counts preserved for honest provenance.
    gold_exemplars: [],
    gold_exemplars_redacted: goldCount,
    workflows_redacted: Array.isArray(brain.workflows) ? brain.workflows.length : 0,
    architectures_redacted: Array.isArray(brain.architectures) ? brain.architectures.length : 0,
    redacted: true,
  };
}

function redactRenderBrain(brain) {
  if (!brain) return null;
  return {
    generated_at: brain.generated_at ?? null,
    source: brain.source ?? null,
    videos_analyzed: brain.videos_analyzed ?? null,
    coverage: brain.coverage ?? null,
    // Keep the QC rule (flag/trigger/fix/count) — a rule of thumb, not corpus.
    // Drop evidence_gen_ids + raw_examples (corpus references and raw prompt text).
    failure_rules: Array.isArray(brain.failure_rules) ? brain.failure_rules.map((rule) => ({
      flag: rule?.flag ?? "", count: Number(rule?.count) || 0, trigger: rule?.trigger ?? "", fix: rule?.fix ?? "", owner_seat: rule?.owner_seat ?? "",
    })) : [],
    redacted: true,
  };
}

function redactDeltas(deltas) {
  if (!deltas) return null;
  const logicKeys = [
    "prompt_generation_logic", "storyboarding_logic", "style_and_design_systems",
    "framework_architecture_updates", "sound_audio_frameworks", "failure_rules_and_repairs",
    "content_type_domain_playbooks", "ui_ux_functionality_candidates",
  ];
  const out = {
    generated_at: deltas.generated_at ?? null,
    source: deltas.source ?? null,
    batch_delta_files: deltas.batch_delta_files ?? (Array.isArray(deltas.batches) ? deltas.batches.length : null),
    coverage: deltas.coverage ?? null,
    gold_exemplars: [],
    gold_exemplars_redacted: Array.isArray(deltas.gold_exemplars) ? deltas.gold_exemplars.length : 0,
    open_questions_redacted: Array.isArray(deltas.open_questions) ? deltas.open_questions.length : 0,
    redacted: true,
  };
  for (const key of logicKeys) out[key] = leanLogic(deltas[key]);
  return out;
}

async function main() {
  await mkdir(targetRoot, { recursive: true });

  // Media: copy verbatim (proxy imagery, not proprietary corpus).
  await rm(resolve(targetRoot, "media"), { recursive: true, force: true });
  await cp(resolve(sourceRoot, "media"), resolve(targetRoot, "media"), { recursive: true });

  // Data: rebuild the dir with REDACTED brains only. Never copy the full JSONs.
  await rm(targetData, { recursive: true, force: true });
  await mkdir(targetData, { recursive: true });

  const [promptBrain, renderBrain, deltas] = await Promise.all([
    readJson("auteur-prompt-brain.json"),
    readJson("auteur-render-brain.json"),
    readJson("auteur-render-os-deltas.json"),
  ]);

  const writes = [];
  const leanPrompt = redactPromptBrain(promptBrain);
  const leanRender = redactRenderBrain(renderBrain);
  const leanDeltas = redactDeltas(deltas);
  if (leanPrompt) writes.push(writeFile(resolve(targetData, "auteur-prompt-brain.json"), JSON.stringify(leanPrompt)));
  if (leanRender) writes.push(writeFile(resolve(targetData, "auteur-render-brain.json"), JSON.stringify(leanRender)));
  if (leanDeltas) writes.push(writeFile(resolve(targetData, "auteur-render-os-deltas.json"), JSON.stringify(leanDeltas)));
  await Promise.all(writes);

  console.log(JSON.stringify({
    synced: "media + REDACTED brains",
    promptBrainGoldRedacted: leanPrompt?.gold_exemplars_redacted ?? 0,
    renderFailureRules: leanRender?.failure_rules?.length ?? 0,
    deltaGoldRedacted: leanDeltas?.gold_exemplars_redacted ?? 0,
  }));
}

await main();
