export interface ImperfectionAnchorEvidence {
  class: "PROMPT_CORPUS" | "RENDER_OBSERVATION" | "RENDER_REPAIR" | "RENDER_GOLD";
  sourceFile: string;
  sourceSha256: string;
  jsonPath: string;
  exactPhrase: string;
  recordIds: string[];
  observedCount: number | null;
}

export interface ImperfectionAnchorEntry {
  id: string;
  anchorText: string;
  contentTypes: string[];
  contextTags: string[];
  evidence: ImperfectionAnchorEvidence[];
  confidence: "MEDIUM" | "HIGH";
  providerClaims: "UNKNOWN";
  productLimits: "UNKNOWN";
}

export function candidateImperfectionAnchors(project: object, shot: object, route?: string, limit?: number): ImperfectionAnchorEntry[];
export function canonicalImperfectionAnchorOverrides(values: unknown): string[];
export function compatibleImperfectionAnchorOverrides(project: object, shot: object, route?: string): string[];
export function resolveImperfectionAnchors(project: object, shot: object, route?: string): string[];
export function toggleImperfectionAnchorOverride(project: object, shot: object, route: string | undefined, anchorText: string): string[];
export function imperfectionAnchorBank(): {
  schema: string;
  generatedAt: string;
  selectionPolicy: { minimum: number; default: number; maximum: number; providerClaims: "UNKNOWN"; productLimits: "UNKNOWN" };
  sources: Array<{ file: string; sha256: string }>;
  entries: ImperfectionAnchorEntry[];
};
