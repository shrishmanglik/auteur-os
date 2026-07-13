export type WorkspaceMode = "home" | "projects" | "intelligence" | "overview" | "story" | "cast" | "world" | "scenes" | "storyboard" | "assets" | "prompts" | "review" | "board" | "deliverables";

export interface StyleBible {
  visualTone: string;
  lighting: string;
  palette: string;
  texture: string;
  lensLanguage: string;
  mood: string;
}

export interface StoryBeat {
  id: string;
  title: string;
  summary: string;
  sceneId?: string;
}

export interface RepairProposal {
  id: string;
  key: string;
  label: string;
  fix: string;
  selected: boolean;
}

export interface ShotVersion {
  id: string;
  label: string;
  createdAt: string;
  source: string;
  notes: string;
  framePrompt: string;
  videoPrompt: string;
  audioPrompt: string;
  negativePrompt: string;
  qcGates: string[];
  intelligenceSignature: string;
}

export interface ShotReview {
  renderUrl: string;
  critique: string;
  proposals: RepairProposal[];
  temporalPass: boolean | null;
  continuityPass: boolean | null;
  status: "unreviewed" | "reviewing" | "pass" | "repair";
}

export interface Optics {
  cameraBody?: string;
  lensModel?: string;
  focalLengthMm: number;
  tStop: number;
  subjectDistanceMeters: number;
}

export interface LightingGrade {
  primarySource: string;
  paletteBase: string;
  isDesaturated: boolean;
  isCrushedBlacks: boolean;
}

export interface AudioTrack {
  spokenText?: string;
  soundDesignDirectives: string[];
}

export interface Shot {
  id: string;
  sceneId: string;
  order: number;
  title: string;
  description: string;
  intent: string;
  duration: number;
  image: string;
  shotSize: string;
  lens: string;
  movement: string;
  contentType: string;
  provider: string;
  startState: string;
  action: string;
  endState: string;
  dialogue?: string;
  audioIntent: string;
  optics?: Optics;
  imperfectionAnchors?: string[];
  lightingGrade?: LightingGrade;
  continuityRefs: string[];
  continuityLocks: string[];
  activeRepairs: RepairProposal[];
  versions: ShotVersion[];
  activeVersionId: string | null;
  packetDirty: boolean;
  review: ShotReview;
  slugline?: string;
  referenceNeeds?: string[];
  visualSource?: "reference-proxy" | "uploaded" | "generated" | "missing";
  startFrame?: string;
  endFrame?: string;
}

export interface Scene {
  id: string;
  title: string;
  intent: string;
  shots: string[];
  order: number;
  summary?: string;
}

export interface Asset {
  id: string;
  name: string;
  type: "character" | "object" | "location" | "style" | string;
  url: string;
  locked: boolean;
  role?: string;
  description?: string;
}

export interface Deliverable {
  id: string;
  name: string;
  aspect: string;
  duration: number;
  unit?: "seconds" | "frames";
  shotIds: string[];
}

export interface Project {
  id: string;
  title: string;
  brief: string;
  logline: string;
  format: string;
  aspect: string;
  duration: number;
  platform: string;
  provider: string;
  style: string;
  mood: string;
  realism: string;
  quality: string;
  audience: string;
  continuity: string;
  audio: string;
  worldRule: string;
  scenes: Scene[];
  shots: Shot[];
  assets: Asset[];
  deliverables: Deliverable[];
  updatedAt: string;
  creativeThesis?: string;
  storyBeats?: StoryBeat[];
  styleBible?: StyleBible;
  intelligenceSource?: "ollama" | "deterministic-fallback" | "legacy";
  intelligenceModel?: string;
  analysisNotes?: string[];
  creativeStatus?: "developed" | "draft" | "blocked";
  qualityReport?: { score: number; issues: string[]; passed: boolean };
}

export interface RenderRule {
  flag?: string;
  trigger?: string;
  contentType?: string;
  rule?: string;
  fix?: string;
  count?: number;
}

export interface IntelligenceItem {
  key: string;
  count?: number;
  examples?: Array<Record<string, unknown>>;
  evidence_gen_ids?: string[];
}

export interface OSIntelligence {
  generated_at?: string;
  batch_delta_files?: number;
  render_records?: number;
  coverage?: { records_reviewed?: number };
  prompt_generation_logic?: IntelligenceItem[];
  storyboarding_logic?: IntelligenceItem[];
  style_and_design_systems?: IntelligenceItem[];
  sound_audio_frameworks?: IntelligenceItem[];
  failure_rules_and_repairs?: IntelligenceItem[];
  content_type_domain_playbooks?: IntelligenceItem[];
  prompt_brain?: Record<string, unknown>;
}

export interface CorpusGuidance {
  available: boolean;
  route: string;
  promptRule: string;
  promptReason: string;
  storyPattern: string;
  storyBeats: string[];
  styleSystem: string;
  styleTokens: string[];
  audioFramework: string;
  audioRule: string;
  domainPlaybook: string;
  failureRepairs: string[];
  evidenceGenIds: string[];
  provenance: {
    renderRecords: number | null;
    reviewedRecords: number | null;
    batchDeltas: number | null;
    generatedAt: string | null;
  };
}
