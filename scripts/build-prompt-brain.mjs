// Distill the 4,175-prompt corpus brain (auteur-brain/) into a compact app payload.
// Output: public/data/auteur-prompt-brain.json — per-type conventions + verbiage,
// gold exemplar excerpts (the "goated" reference prompts), and top craft techniques.
// Deterministic; re-run whenever auteur-brain/ regenerates.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRAIN_DIR = path.join(__dirname, "..", "..", "auteur-brain");
const OUT = path.join(__dirname, "..", "public", "data", "auteur-prompt-brain.json");

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(BRAIN_DIR, name), "utf8"));
const brain = readJson("auteur-os-brain.json");

const clean = (value, max = 160) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanList = (values, count, max = 110) => [...new Set((values || []).map((item) => clean(typeof item === "string" ? item : item?.phrase, max)).filter(Boolean))].slice(0, count);

const contentTypes = {};
for (const [type, playbook] of Object.entries(brain.content_type_playbooks || {})) {
  contentTypes[type] = {
    winning_structure: clean(playbook.winning_structure, 40) || "nl",
    camera: cleanList(playbook.camera_conventions, 8),
    lighting: cleanList(playbook.lighting_conventions, 8),
    physics: cleanList(playbook.material_physics_patterns, 8),
    audio: cleanList(playbook.audio_conventions, 6),
    negatives: cleanList(playbook.negatives, 8),
    verbiage: cleanList(playbook.verbiage_bank, 14),
  };
}

const goldLines = fs.readFileSync(path.join(BRAIN_DIR, "gold-exemplars.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const goldByType = {};
for (const record of goldLines) {
  const type = clean(record.content_type, 30) || "other";
  (goldByType[type] ||= []).push(record);
}
const goldExemplars = Object.entries(goldByType).flatMap(([type, records]) => records.slice(0, 4).map((record) => ({
  content_type: type,
  framework: clean(record.framework_kind, 30),
  why_gold: clean(record.why_gold, 220),
  excerpt: clean(record.text, 700),
})));

const techniques = (brain.craft_techniques || [])
  .map((item) => ({ technique: clean(item.technique, 70), evidence: (item.evidence_uids || []).length }))
  .filter((item) => item.technique && item.evidence >= 8)
  .sort((a, b) => b.evidence - a.evidence)
  .slice(0, 80);

const workflows = (brain.workflows || []).slice(0, 40).map((item) => ({
  workflow: clean(item.workflow, 60),
  content_type: clean(item.content_type, 30),
  steps: cleanList(item.steps, 6, 70),
}));

const architectures = (brain.architectures || []).slice(0, 24).map((item) => ({
  architecture: clean(item.architecture, 60),
  format: clean(item.format, 20),
  sections: cleanList(item.sections, 8, 40),
  usage: Number(item.usage_count) || 0,
}));

const payload = {
  generated_at: new Date().toISOString(),
  source: "auteur-brain 4,175-prompt distillation",
  corpus_total: brain.corpus_total || 4175,
  content_types: contentTypes,
  gold_exemplars: goldExemplars,
  techniques,
  workflows,
  architectures,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload), "utf8");
console.log(`prompt-brain: ${goldExemplars.length} gold exemplars, ${Object.keys(contentTypes).length} type playbooks, ${techniques.length} techniques -> ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
