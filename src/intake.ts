import type { DirectorConcept, DirectorScreenplay, ScreenplayScene } from "./director.mjs";
import type { ProductionBriefInput } from "./intelligence";
import type { Project, Shot } from "./types";

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "fountain", "fdx"]);

export interface IntakeFiles {
  text: File[];
  images: File[];
  rejected: File[];
}

export function classifyIntakeFiles(files: Iterable<File>): IntakeFiles {
  const result: IntakeFiles = { text: [], images: [], rejected: [] };
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (file.type.startsWith("image/")) result.images.push(file);
    else if (file.type.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) result.text.push(file);
    else result.rejected.push(file);
  }
  return result;
}

function sceneShots(project: Project, ids: string[]): Shot[] {
  const byId = new Map(project.shots.map((shot) => [shot.id, shot]));
  return ids.map((id) => byId.get(id)).filter((shot): shot is Shot => Boolean(shot));
}

function conceptFromProject(project: Project): DirectorConcept {
  return {
    id: `project-${project.id}`,
    lens: "Current authored production",
    name: project.title,
    logline: project.logline,
    twist: project.creativeThesis || project.worldRule || project.logline,
    humor: "Preserve the authored register unless the director explicitly changes it.",
    thesis: project.creativeThesis || project.logline,
    tone: project.style || project.mood || "Cinematic",
    mood: project.mood || project.style || "Authored",
  };
}

export function screenplayScaffoldFromProject(project: Project): DirectorScreenplay {
  const scenes: ScreenplayScene[] = project.scenes.map((scene) => {
    const shots = sceneShots(project, scene.shots);
    const action = shots.map((shot) => shot.action || shot.description).filter(Boolean).join(" ");
    const dialogue = shots.map((shot) => shot.dialogue?.trim()).filter(Boolean).join("\n");
    return {
      beat: scene.title,
      slugline: shots.find((shot) => shot.slugline)?.slugline || scene.title,
      intent: scene.intent,
      action: action || scene.summary || scene.intent,
      dialogue,
      duration: shots.reduce((total, shot) => total + (Number(shot.duration) || 0), 0),
      shots: shots.map((shot) => ({ size: shot.shotSize, movement: shot.movement })),
    };
  });
  const cast = project.assets
    .filter((asset) => asset.type === "character")
    .map((asset) => asset.name);
  const dialogueMode = scenes.some((scene) => scene.dialogue)
    ? project.format === "A-roll monologue" ? "monologue" : "dialogue"
    : "none";
  return {
    concept: conceptFromProject(project),
    dialogueMode,
    cast,
    duration: scenes.reduce((total, scene) => total + scene.duration, 0) || project.duration,
    scenes,
  };
}

export function elevationInputForProject(project: Project, model?: string, promptBrain?: unknown): ProductionBriefInput {
  return {
    brief: project.brief || `${project.logline}\nCreative thesis: ${project.creativeThesis || project.worldRule || ""}`,
    title: project.title,
    format: project.format,
    aspect: project.aspect,
    duration: project.duration,
    platform: project.platform,
    provider: project.provider,
    model,
    concept: conceptFromProject(project),
    screenplay: screenplayScaffoldFromProject(project),
    promptBrain,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function preserveAuthoredScriptInBlueprint(blueprint: Record<string, unknown>, project: Project): Record<string, unknown> {
  const modelScenes = Array.isArray(blueprint.scenes) ? blueprint.scenes : [];
  const shotsById = new Map(project.shots.map((shot) => [shot.id, shot]));
  const scenes = project.scenes.map((scene, sceneIndex) => {
    const modelScene = record(modelScenes[sceneIndex]);
    const modelShots = Array.isArray(modelScene.shots) ? modelScene.shots : [];
    const authoredShots = scene.shots.map((id) => shotsById.get(id)).filter((shot): shot is Shot => Boolean(shot));
    return {
      ...modelScene,
      id: modelScene.id || scene.id,
      title: scene.title,
      intent: scene.intent,
      summary: scene.summary || scene.intent,
      slugline: authoredShots.find((shot) => shot.slugline)?.slugline || modelScene.slugline || scene.title,
      shots: authoredShots.map((shot, shotIndex) => ({
        ...record(modelShots[shotIndex]),
        id: record(modelShots[shotIndex]).id || shot.id,
        title: shot.title,
        slugline: shot.slugline || record(modelShots[shotIndex]).slugline,
        description: shot.description,
        intent: shot.intent,
        duration: shot.duration,
        action: shot.action,
        dialogue: shot.dialogue || "",
      })),
    };
  });
  return { ...blueprint, scenes };
}
