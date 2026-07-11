import type { CorpusGuidance, OSIntelligence, Project, RenderRule, RepairProposal, Shot, ShotVersion } from "./types";

export interface CompiledShot {
  framePrompt: string;
  videoPrompt: string;
  audioPrompt: string;
  negativePrompt: string;
  qcGates: string[];
  intelligenceSignature: string;
}

export interface ExportedPacket {
  schema: "auteur-generation-packet/v1";
  exportedAt: string;
  project: Pick<Project, "id" | "title" | "brief" | "format" | "aspect" | "duration" | "platform" | "style" | "mood" | "realism" | "quality" | "audience" | "continuity" | "audio">;
  assets: Array<Pick<Project["assets"][number], "id" | "name" | "type" | "locked" | "url"> & { persistence: string }>;
  scenes: Project["scenes"];
  shots: Array<{
    id: string;
    sceneId: string;
    title: string;
    duration: number;
    provider: string;
    storyboardImage: string;
    continuityRefs: string[];
    identityLock: { references: string[]; invariants: string[]; allowedChange: string; forbid: string[] };
    requiredBeat: { entryState: string; action: string; exitState: string; minimumVisibility: string };
    version: ShotVersion;
    qc: { status: Shot["review"]["status"]; critique: string | null; findings: RepairProposal[]; appliedRepairs: RepairProposal[]; evidenceUrl: string | null };
  }>;
  deliverables: Project["deliverables"];
  deliveryLayers: Array<{ id: string; label: string; state: string; evidence: string }>;
  intelligence: {
    route: string;
    promptRule: string;
    storyPattern: string;
    storyBeats: string[];
    styleSystem: string;
    styleTokens: string[];
    audioFramework: string;
    domainPlaybook: string;
    failureRepairs: string[];
    evidenceGenIds: string[];
    provenance: CorpusGuidance["provenance"];
  };
  providerState: "not-mutated";
}

export function analyzeCritique(text: string): RepairProposal[];
export function deriveCorpusGuidance(project: Project, intelligence?: OSIntelligence | null): CorpusGuidance;
export function compileShot(project: Project, shot: Shot, renderRules?: RenderRule[], intelligence?: OSIntelligence | null): CompiledShot;
export function createRepairVersion(project: Project, shot: Shot, proposals: RepairProposal[], renderRules?: RenderRule[], intelligence?: OSIntelligence | null): ShotVersion;
export function detectProjectRoute(brief: string, options?: Record<string, string | number>): "automotive" | "product" | "food" | "character" | "editorial" | "vfx";
export function resolveAutoStrategy(brief: string, options?: Record<string, string | number>): { route: "automotive" | "product" | "food" | "character" | "editorial" | "vfx"; aspect: string; provider: string };
export function createProjectFromBrief(brief: string, options?: Record<string, string | number>): Project;
export function createProjectFromBlueprint(blueprint: Record<string, any>, options?: Record<string, string | number>): Project;
export function moveItem<T>(list: T[], from: number, to: number): T[];
export function syncProjectTiming(project: Project): Project;
export function deriveReviewStatus(review: Shot["review"]): Shot["review"]["status"];
export function formatTimecode(seconds: number): string;
export function validateProjectForExport(project: Project): string[];
export function getDeliveryLayers(): Array<{ id: string; label: string; state: string; evidence: string }>;
export function exportPacket(project: Project, intelligence?: OSIntelligence | null): ExportedPacket;
export function embedPacketMedia(packet: ExportedPacket, loader: (url: string) => Promise<string>): Promise<ExportedPacket>;
