import anchorBank from "../public/data/auteur-imperfection-anchor-bank.json" with { type: "json" };

const ROUTE_ALIASES = {
  product_ad: "product",
  food_ad: "food",
  character_scene: "character",
  music_fashion: "editorial",
};

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedList(values) {
  const unique = new Map();
  for (const item of Array.isArray(values) ? values : []) {
    const value = String(item || "").trim();
    const key = normalized(value);
    if (key && !unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()];
}

function routeKeys(route, contentType) {
  const keys = [route, contentType]
    .map(normalized)
    .filter(Boolean)
    .flatMap((key) => [key, ROUTE_ALIASES[key]])
    .filter(Boolean);
  return new Set(keys);
}

function searchableText(project, shot) {
  return normalized([
    project?.brief,
    project?.format,
    project?.style,
    project?.mood,
    project?.worldRule,
    shot?.title,
    shot?.description,
    shot?.intent,
    shot?.action,
    shot?.endState,
    shot?.shotSize,
    shot?.movement,
    shot?.dialogue,
    shot?.audioIntent,
    ...(shot?.continuityLocks || []),
  ].filter(Boolean).join(" "));
}

function scoreEntry(entry, project, shot, route) {
  const keys = routeKeys(route, shot?.contentType);
  const contentMatches = entry.contentTypes.filter((type) => keys.has(normalized(type))).length;
  if (!contentMatches) return -1;
  const text = searchableText(project, shot);
  const tagMatches = entry.contextTags.filter((tag) => text.includes(normalized(tag))).length;
  const renderedEvidence = entry.evidence.some((item) => item.class.startsWith("RENDER_")) ? 1 : 0;
  const highConfidence = entry.confidence === "HIGH" ? 1 : 0;
  return (contentMatches * 100) + (tagMatches * 10) + (renderedEvidence * 2) + highConfidence;
}

export function candidateImperfectionAnchors(project, shot, route, limit = 6) {
  return anchorBank.entries
    .map((entry, index) => ({ entry, index, score: scoreEntry(entry, project, shot, route) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ entry }) => entry);
}

export function canonicalImperfectionAnchorOverrides(values) {
  const canonicalByText = new Map(anchorBank.entries.map((entry) => [normalized(entry.anchorText), entry.anchorText]));
  return normalizedList(values)
    .map((value) => canonicalByText.get(normalized(value)))
    .filter(Boolean)
    .slice(0, anchorBank.selectionPolicy.maximum);
}

export function compatibleImperfectionAnchorOverrides(project, shot, route) {
  const allowed = new Set(candidateImperfectionAnchors(project, shot, route, anchorBank.entries.length)
    .map((entry) => normalized(entry.anchorText)));
  return canonicalImperfectionAnchorOverrides(shot?.imperfectionAnchors)
    .filter((value) => allowed.has(normalized(value)));
}

export function resolveImperfectionAnchors(project, shot, route) {
  const manual = compatibleImperfectionAnchorOverrides(project, shot, route);
  if (manual.length >= anchorBank.selectionPolicy.minimum) {
    return manual;
  }
  return candidateImperfectionAnchors(project, shot, route, anchorBank.selectionPolicy.default)
    .map((entry) => entry.anchorText);
}

export function toggleImperfectionAnchorOverride(project, shot, route, anchorText) {
  const manual = compatibleImperfectionAnchorOverrides(project, shot, route);
  const selected = manual.length >= anchorBank.selectionPolicy.minimum
    ? [...manual]
    : [...resolveImperfectionAnchors(project, shot, route)];
  const canonical = canonicalImperfectionAnchorOverrides([anchorText])[0];
  if (!canonical) return selected;
  const index = selected.findIndex((value) => normalized(value) === normalized(canonical));
  if (index >= 0) {
    if (selected.length <= anchorBank.selectionPolicy.minimum) return selected;
    selected.splice(index, 1);
  } else {
    if (selected.length >= anchorBank.selectionPolicy.maximum) return selected;
    selected.push(canonical);
  }
  return selected;
}

export function imperfectionAnchorBank() {
  return anchorBank;
}
