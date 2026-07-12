import type { WorkspaceMode } from "./types";

export type ProductionActionKind = "navigate" | "preflight" | "export";

export interface ProductionAction {
  label: string;
  detail: string;
  kind: ProductionActionKind;
  target?: WorkspaceMode;
}

const actions: Partial<Record<WorkspaceMode, ProductionAction>> = {
  overview: { label: "Open treatment", detail: "Review the story spine and dramatic intent.", kind: "navigate", target: "story" },
  story: { label: "Refine script", detail: "Move from treatment beats into the authored scene sequence.", kind: "navigate", target: "scenes" },
  scenes: { label: "Build storyboard", detail: "Turn the script into scene-by-scene, shot-by-shot visual direction.", kind: "navigate", target: "storyboard" },
  storyboard: { label: "Run pre-flight", detail: "Compile current changes and inspect the generation package.", kind: "preflight", target: "prompts" },
  cast: { label: "Build storyboard", detail: "Carry locked cast references into the shot plan.", kind: "navigate", target: "storyboard" },
  assets: { label: "Build storyboard", detail: "Carry locked assets and references into the shot plan.", kind: "navigate", target: "storyboard" },
  world: { label: "Build storyboard", detail: "Apply the visual system across the shot plan.", kind: "navigate", target: "storyboard" },
  prompts: { label: "Export prompt pack", detail: "Compile current changes and export the complete offline package.", kind: "export" },
  review: { label: "Export prompt pack", detail: "Export the latest package with its current QC evidence state.", kind: "export" },
  board: { label: "Run pre-flight", detail: "Compile current changes and inspect the generation package.", kind: "preflight", target: "prompts" },
  deliverables: { label: "Export prompt pack", detail: "Compile current changes and export the complete offline package.", kind: "export" },
};

export const productionModes = Object.freeze(Object.keys(actions) as WorkspaceMode[]);

export function productionActionFor(mode: WorkspaceMode): ProductionAction | null {
  return actions[mode] ?? null;
}
