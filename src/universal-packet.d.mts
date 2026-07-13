import type { AudioTrack, LightingGrade, Optics } from "./types";

export interface UniversalShotV2Input {
  dialogue?: string;
  audioIntent?: string;
  shotSize?: string;
  lens?: string;
  optics?: Partial<Optics>;
  imperfectionAnchors?: unknown;
  lightingGrade?: Partial<LightingGrade>;
  audioTrack?: Partial<AudioTrack>;
}

export interface UniversalShotV2Defaults {
  primarySource?: string;
  paletteBase?: string;
  audioIntent?: string;
}

export interface RuntimeSchema<T> {
  parse(value: unknown): T;
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
}

export const opticsSchema: RuntimeSchema<Optics>;
export const lightingGradeSchema: RuntimeSchema<LightingGrade>;
export const audioTrackSchema: RuntimeSchema<AudioTrack>;
export const universalShotV2Schema: RuntimeSchema<UniversalShotV2Input>;
export function inferOpticsFromShotGrammar(shot: Pick<UniversalShotV2Input, "shotSize" | "lens">): Optics;
export function opticsToProse(optics: Partial<Optics>): string;
export function normalizeUniversalShotV2<T extends object>(shot: T & UniversalShotV2Input, defaults?: UniversalShotV2Defaults): Omit<T, "audioTrack"> & {
  dialogue: string;
  audioIntent: string;
  optics: Optics;
  imperfectionAnchors: string[];
  lightingGrade: LightingGrade;
};
