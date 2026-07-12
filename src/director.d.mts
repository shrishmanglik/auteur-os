export interface DirectorFormat {
  key: string;
  label: string;
  dialogueMode: "none" | "vo" | "dialogue" | "monologue";
  defaultDuration: number;
  defaultAspect: string;
  unit?: "seconds" | "frames";
}

export interface DirectorConcept {
  id: string;
  lens: string;
  name: string;
  logline: string;
  twist: string;
  humor: string;
  thesis: string;
  tone: string;
  mood: string;
  [key: string]: string;
}

export interface DirectorInput {
  idea: string;
  title?: string;
  format?: string;
  aspect?: string;
  duration?: number;
  platform?: string;
  provider?: string;
  audience?: string;
  tone?: string;
  humor?: string;
  ideaOverrides?: { hero?: string; setting?: string; object?: string };
  screenplay?: DirectorScreenplay | unknown;
}

export interface ScreenplayScene {
  beat: string;
  slugline: string;
  intent: string;
  action: string;
  dialogue: string;
  duration: number;
  shots: Array<{ size: string; movement: string }>;
}

export interface DirectorScreenplay {
  concept: DirectorConcept;
  dialogueMode: "none" | "vo" | "dialogue" | "monologue";
  cast: string[];
  duration: number;
  scenes: ScreenplayScene[];
}

export interface ParsedIdea {
  clean: string;
  subject: string;
  anchor: string;
  world: string;
  keywords: string[];
}

export declare const DIRECTOR_FORMATS: DirectorFormat[];
export declare function isImageFormat(format: string | undefined): boolean;
export declare function detectRoute(text: string): "automotive" | "food" | "product" | "vfx" | "editorial" | "nature" | "character";
export declare const routeToContentType: Record<string, string>;
export declare function parseIdea(idea: string, overrides?: { hero?: string; setting?: string; object?: string }): ParsedIdea;
export declare function extractBriefConstraints(idea: string): { noDialogue: boolean; noVoiceover: boolean; actorCount: number | null; oneLocation: boolean; loopable: boolean; notSalesy: boolean; mustBeFunny: boolean };
export declare function ideateConcepts(input: DirectorInput, seed?: number): DirectorConcept[];
export declare function writeScreenplay(input: DirectorInput, concept: DirectorConcept, seed?: number): DirectorScreenplay;
export declare function developBlueprint(input: DirectorInput, concept: DirectorConcept, promptBrain?: unknown, seed?: number): Record<string, unknown>;
