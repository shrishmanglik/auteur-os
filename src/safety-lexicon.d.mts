export interface SafetyLexiconEvidence {
  class: "PROMPT_CORPUS_OBSERVED_WORKFLOW";
  role: "term" | "replacement" | "compactReplacement" | "predicateReplacement";
  sourceFile: string;
  sourceSha256: string;
  section: string;
  exactPhrase: string;
  exactPhraseSha256: string;
}

export interface SafetyLexiconEntry {
  id: string;
  term: string;
  providers: string[];
  replacement: string;
  compactReplacement: string;
  predicateReplacement: string;
  note: string;
  observedWorkflowEvidence: "CORPUS";
  rejectionEvidence: "UNKNOWN";
  providerClaims: "UNKNOWN";
  productLimits: "UNKNOWN";
  evidence: SafetyLexiconEvidence[];
}

export interface SafetyLexiconFinding {
  id: string;
  entryId: string;
  term: string;
  replacement: string;
  note: string;
  provider: string;
  field: string;
  occurrences: number;
  evidence: SafetyLexiconEvidence[];
  shotId?: string;
  shotTitle?: string;
  versionId?: string;
}

export interface SafetyPacket {
  framePrompt: string;
  videoPrompt: string;
  audioPrompt: string;
  negativePrompt: string;
  qcGates: string[];
  intelligenceSignature: string;
  safetyHits?: SafetyLexiconFinding[];
}

export interface VersionedSafetyPacket extends SafetyPacket {
  id: string;
  label: string;
  createdAt: string;
  source: string;
  notes: string;
}

export function safetyLexicon(): {
  schema: string;
  generatedAt: string;
  policy: { mode: "advisory"; observedWorkflowEvidence: "CORPUS"; rejectionEvidence: "UNKNOWN"; providerClaims: "UNKNOWN"; productLimits: "UNKNOWN"; rule: string };
  sources: Array<{ file: string; sha256: string; hashNormalization: "LF"; label: string }>;
  entries: SafetyLexiconEntry[];
};
export function scanSafetyLexicon(packet: object, provider?: string): SafetyLexiconFinding[];
export function scanProjectSafety(project: object): SafetyLexiconFinding[];
export function applySafetyLexiconSwap<T extends object>(packet: T, provider: string | undefined, entryId: string): { packet: T & { safetyHits?: SafetyLexiconFinding[] }; changed: boolean; entry: SafetyLexiconEntry | null; findings: SafetyLexiconFinding[] };
export function createSafetyLexiconVersion(shot: { id: string; versions: VersionedSafetyPacket[]; activeVersionId: string | null }, provider: string | undefined, entryId: string, createdAt?: string, basePacket?: SafetyPacket): VersionedSafetyPacket | null;
