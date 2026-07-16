import lexicon from "../public/data/auteur-safety-lexicon.json" with { type: "json" };

const PACKET_FIELDS = ["framePrompt", "videoPrompt", "audioPrompt", "negativePrompt"];

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(term) {
  return new RegExp(`\\b${escaped(term)}\\b`, "giu");
}

function providerKeys(provider) {
  const value = normalized(provider);
  const keys = new Set(value.split(/[^a-z0-9]+/).filter(Boolean));
  if (value.includes("veo") || value.includes("flow")) keys.add("veo");
  if (value.includes("sora")) keys.add("sora");
  if (value.includes("runway")) keys.add("runway");
  if (value.includes("image")) keys.add("image");
  return keys;
}

function appliesToProvider(entry, provider) {
  const keys = providerKeys(provider);
  return entry.providers.some((candidate) => keys.has(normalized(candidate)));
}

function packetTextFields(packet) {
  const fields = PACKET_FIELDS
    .filter((field) => typeof packet?.[field] === "string")
    .map((field) => [field, packet[field]]);
  if (Array.isArray(packet?.qcGates)) {
    packet.qcGates.forEach((value, index) => {
      if (typeof value === "string") fields.push([`qcGates[${index}]`, value]);
    });
  }
  return fields;
}

function replacementForCase(match, replacement) {
  if (match === match.toUpperCase()) return replacement.toUpperCase();
  if (match[0] === match[0].toUpperCase()) return `${replacement[0].toUpperCase()}${replacement.slice(1)}`;
  return replacement;
}

function replaceTerm(value, entry, appendVisibleResponse = false) {
  const source = String(value || "");
  const predicatePattern = new RegExp(`\\b${escaped(entry.term)}\\s+catches\\b`, "giu");
  let rewritten = source.replace(predicatePattern, (match) => replacementForCase(match, entry.predicateReplacement));
  rewritten = rewritten.replace(termPattern(entry.term), (match) => replacementForCase(match, entry.compactReplacement));
  if (!appendVisibleResponse || rewritten === source || rewritten.toLowerCase().includes(entry.replacement.toLowerCase())) return rewritten;
  const separator = /[.!?;]\s*$/u.test(rewritten) ? " " : ". ";
  return `${rewritten}${separator}Visible response: ${entry.replacement}.`;
}

export function safetyLexicon() {
  return lexicon;
}

export function scanSafetyLexicon(packet, provider) {
  const findings = [];
  for (const entry of lexicon.entries) {
    if (!appliesToProvider(entry, provider)) continue;
    for (const [field, value] of packetTextFields(packet)) {
      const matches = [...value.matchAll(termPattern(entry.term))];
      if (!matches.length) continue;
      findings.push({
        id: `${entry.id}:${field}`,
        entryId: entry.id,
        term: entry.term,
        replacement: entry.replacement,
        note: entry.note,
        provider: normalized(provider),
        field,
        occurrences: matches.length,
        evidence: entry.evidence,
      });
    }
  }
  return findings;
}

export function scanProjectSafety(project) {
  return (project?.shots || []).flatMap((shot) => {
    const version = (shot.versions || []).find((item) => item.id === shot.activeVersionId) || shot.versions?.[0];
    if (!version) return [];
    return scanSafetyLexicon(version, shot.provider || project.provider).map((finding) => ({
      ...finding,
      shotId: shot.id,
      shotTitle: shot.title,
      versionId: version.id,
    }));
  });
}

export function applySafetyLexiconSwap(packet, provider, entryId) {
  const entry = lexicon.entries.find((candidate) => candidate.id === entryId && appliesToProvider(candidate, provider));
  if (!entry) return { packet: { ...packet }, changed: false, entry: null, findings: scanSafetyLexicon(packet, provider) };
  const next = { ...packet };
  for (const field of PACKET_FIELDS) {
    if (typeof next[field] === "string") next[field] = replaceTerm(next[field], entry, field === "framePrompt" || field === "videoPrompt");
  }
  if (Array.isArray(next.qcGates)) {
    next.qcGates = next.qcGates.map((value) => replaceTerm(value, entry));
  }
  const changed = PACKET_FIELDS.some((field) => next[field] !== packet[field])
    || JSON.stringify(next.qcGates) !== JSON.stringify(packet.qcGates);
  const findings = scanSafetyLexicon(next, provider);
  return { packet: { ...next, safetyHits: findings }, changed, entry, findings };
}

export function createSafetyLexiconVersion(shot, provider, entryId, createdAt = new Date().toISOString(), basePacket = null) {
  const active = (shot.versions || []).find((version) => version.id === shot.activeVersionId) || shot.versions?.[0];
  if (!active) return null;
  const result = applySafetyLexiconSwap(basePacket ? { ...active, ...basePacket } : active, provider, entryId);
  if (!result.changed || !result.entry) return null;
  const evidence = result.entry.evidence[0];
  const number = shot.versions.length + 1;
  return {
    ...active,
    ...result.packet,
    id: `${shot.id}-v${number}-safety-${Date.parse(createdAt).toString(36)}`,
    label: `v${number}`,
    createdAt,
    source: "safety-lexicon-swap",
    notes: `Corpus wording swap: "${result.entry.term}" -> "${result.entry.replacement}". Observed workflow: CORPUS; rejection evidence: UNKNOWN. ${evidence.sourceFile} / ${evidence.section} / SHA256 ${evidence.sourceSha256}.`,
  };
}
