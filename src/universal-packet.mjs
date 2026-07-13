import { z } from "zod";

const cleanOptionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
  z.string().optional(),
);

const positiveNumber = (fallback) => z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  },
  z.number().positive(),
);

const normalizedStringList = z.preprocess(
  (value) => Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [],
  z.array(z.string()),
);

export const opticsSchema = z.object({
  cameraBody: cleanOptionalString,
  lensModel: cleanOptionalString,
  focalLengthMm: positiveNumber(50),
  tStop: positiveNumber(2.8),
  subjectDistanceMeters: positiveNumber(2.5),
});

export const lightingGradeSchema = z.object({
  primarySource: z.preprocess(
    (value) => typeof value === "string" && value.trim() ? value.trim() : "Motivated practical key",
    z.string(),
  ),
  paletteBase: z.preprocess(
    (value) => typeof value === "string" && value.trim() ? value.trim() : "Natural neutrals",
    z.string(),
  ),
  isDesaturated: z.preprocess((value) => typeof value === "boolean" ? value : false, z.boolean()),
  isCrushedBlacks: z.preprocess((value) => typeof value === "boolean" ? value : false, z.boolean()),
});

export const audioTrackSchema = z.object({
  spokenText: cleanOptionalString,
  soundDesignDirectives: normalizedStringList,
});

const optionalObject = (schema) => z.preprocess(
  (value) => value && typeof value === "object" && !Array.isArray(value) ? value : undefined,
  schema.optional(),
);

export const universalShotV2Schema = z.object({
  optics: optionalObject(opticsSchema),
  imperfectionAnchors: normalizedStringList.optional(),
  lightingGrade: optionalObject(lightingGradeSchema),
  audioTrack: optionalObject(audioTrackSchema),
}).passthrough();

function cleanText(value) {
  return typeof value === "string" ? value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "";
}

function cleanLensModel(value) {
  return cleanText(value)
    .replace(/\b\d{1,3}(?:\.\d+)?\s*mm\b/gi, " ")
    .replace(/^[\s,;/\-]+|[\s,;/\-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim() || "Cinema prime";
}

function inferOpticsDefaults(shot) {
  const grammar = `${shot?.shotSize || ""} ${shot?.lens || ""}`.toLowerCase();
  const explicitFocal = grammar.match(/\b(\d{2,3})\s*mm\b/);
  let defaults = { focalLengthMm: 50, tStop: 2.8, subjectDistanceMeters: 2.5 };
  if (/extreme macro|probe macro|\bmacro\b/.test(grammar)) defaults = { focalLengthMm: 100, tStop: 2.8, subjectDistanceMeters: 0.45 };
  else if (/extreme close|close-up|close up|\bclose\b/.test(grammar)) defaults = { focalLengthMm: 85, tStop: 2, subjectDistanceMeters: 1.2 };
  else if (/establish|aerial|ultra[ -]?wide|\bwide\b/.test(grammar)) defaults = { focalLengthMm: 24, tStop: 5.6, subjectDistanceMeters: 6 };
  else if (/full body|full-body|\bfull\b/.test(grammar)) defaults = { focalLengthMm: 35, tStop: 4, subjectDistanceMeters: 4 };
  else if (/hero/.test(grammar)) defaults = { focalLengthMm: 65, tStop: 2.8, subjectDistanceMeters: 2.8 };
  else if (/medium/.test(grammar)) defaults = { focalLengthMm: 50, tStop: 2.8, subjectDistanceMeters: 2.2 };
  if (explicitFocal) defaults.focalLengthMm = Number(explicitFocal[1]);
  return {
    cameraBody: "ARRI Alexa 35",
    lensModel: cleanLensModel(shot?.lens),
    ...defaults,
  };
}

export function inferOpticsFromShotGrammar(shot) {
  return opticsSchema.parse(inferOpticsDefaults(shot));
}

function formatOpticsNumber(value) {
  return Number(value.toFixed(2)).toString();
}

function depthOfFieldCharacter({ focalLengthMm, tStop, subjectDistanceMeters }) {
  const circleOfConfusionMm = 0.03;
  const subjectDistanceMm = subjectDistanceMeters * 1_000;
  const hyperfocalMm = (focalLengthMm ** 2) / (tStop * circleOfConfusionMm) + focalLengthMm;
  const nearLimitMm = (hyperfocalMm * subjectDistanceMm)
    / (hyperfocalMm + subjectDistanceMm - focalLengthMm);
  const farLimitMm = subjectDistanceMm >= hyperfocalMm
    ? Number.POSITIVE_INFINITY
    : (hyperfocalMm * subjectDistanceMm) / (hyperfocalMm - subjectDistanceMm + focalLengthMm);
  const depthMeters = Number.isFinite(farLimitMm) ? (farLimitMm - nearLimitMm) / 1_000 : Number.POSITIVE_INFINITY;
  const depthRatio = depthMeters / subjectDistanceMeters;

  if (!Number.isFinite(depthMeters) || depthRatio >= 1.5) {
    return "deep focus with broad foreground-to-background clarity";
  }
  if (depthMeters <= 0.25 || depthRatio <= 0.25) {
    return "shallow depth of field with pronounced subject separation";
  }
  return "moderate depth of field with controlled background separation";
}

export function opticsToProse(optics) {
  const normalized = opticsSchema.parse(optics);
  const focalLength = formatOpticsNumber(normalized.focalLengthMm);
  const lens = `${focalLength}mm ${cleanLensModel(normalized.lensModel)}`;
  return `Shot on ${normalized.cameraBody || "a cinema camera"} with ${lens} at T${formatOpticsNumber(normalized.tStop)}, camera ${formatOpticsNumber(normalized.subjectDistanceMeters)}m from subject; ${depthOfFieldCharacter(normalized)}.`;
}

export function normalizeUniversalShotV2(shot, defaults = {}) {
  const source = shot && typeof shot === "object" ? shot : {};
  const parsed = universalShotV2Schema.parse(source);
  const inferredOptics = inferOpticsDefaults(source);
  const rawOptics = source.optics && typeof source.optics === "object" ? source.optics : {};
  const rawLensModel = cleanText(rawOptics.lensModel);
  const validPositive = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  };
  const optics = opticsSchema.parse({
    cameraBody: cleanText(rawOptics.cameraBody) || inferredOptics.cameraBody,
    lensModel: cleanLensModel(rawLensModel || inferredOptics.lensModel),
    focalLengthMm: validPositive(rawOptics.focalLengthMm, inferredOptics.focalLengthMm),
    tStop: validPositive(rawOptics.tStop, inferredOptics.tStop),
    subjectDistanceMeters: validPositive(rawOptics.subjectDistanceMeters, inferredOptics.subjectDistanceMeters),
  });
  const lightingGrade = lightingGradeSchema.parse({
    primarySource: defaults.primarySource,
    paletteBase: defaults.paletteBase,
    ...(parsed.lightingGrade || {}),
  });
  const dialogue = cleanText(source.dialogue) || cleanText(parsed.audioTrack?.spokenText);
  const audioIntent = cleanText(source.audioIntent)
    || (parsed.audioTrack?.soundDesignDirectives || []).join("; ")
    || cleanText(defaults.audioIntent)
    || "UNKNOWN pending playable audio evidence.";
  const { audioTrack: _transportAudioTrack, ...withoutTransportAudio } = parsed;
  void _transportAudioTrack;
  return {
    ...withoutTransportAudio,
    dialogue,
    audioIntent,
    optics,
    imperfectionAnchors: parsed.imperfectionAnchors || [],
    lightingGrade,
  };
}
