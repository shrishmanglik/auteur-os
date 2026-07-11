import { create } from "zustand";
import type { OSIntelligence, Project, RenderRule, RepairProposal, Scene, Shot, WorkspaceMode } from "./types";
import { analyzeCritique, compileShot, createProjectFromBlueprint, createProjectFromBrief, createRepairVersion, deriveReviewStatus, moveItem, syncProjectTiming } from "./engine.mjs";

const STORAGE_KEY = "auteur-studio-project-v6";
type PersistenceStorage = Pick<Storage, "setItem" | "removeItem">;

function getPersistenceStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function detectPersistenceStatus(storage?: PersistenceStorage | null): "saved" | "unavailable" {
  const probe = `${STORAGE_KEY}-probe`;
  const target = storage === undefined ? getPersistenceStorage() : storage;
  if (!target) return "unavailable";
  try {
    target.setItem(probe, "1");
    target.removeItem(probe);
    return "saved";
  } catch {
    return "unavailable";
  }
}

function safeProject(project: Project): Project {
  const clone = structuredClone(project);
  clone.assets = clone.assets.filter((asset) => !asset.url.startsWith("data:"));
  const persistentAssetIds = new Set(clone.assets.map((asset) => asset.id));
  clone.shots.forEach((shot) => {
    const referenceCount = shot.continuityRefs.length;
    shot.continuityRefs = shot.continuityRefs.filter((id) => persistentAssetIds.has(id));
    if (shot.continuityRefs.length !== referenceCount) shot.packetDirty = true;
    if (shot.image.startsWith("data:")) { shot.image = clone.assets[0]?.url || ""; shot.packetDirty = true; }
    if (shot.startFrame?.startsWith("data:")) { shot.startFrame = ""; shot.packetDirty = true; }
    if (shot.endFrame?.startsWith("data:")) { shot.endFrame = ""; shot.packetDirty = true; }
    if (shot.review.renderUrl.startsWith("data:")) shot.review = { renderUrl: "", critique: "", proposals: [], temporalPass: null, continuityPass: null, status: "unreviewed" };
  });
  return clone;
}

export function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<Project>;
  if (!Array.isArray(project.scenes) || !Array.isArray(project.shots) || !Array.isArray(project.assets) || !Array.isArray(project.deliverables)) return false;
  if (!project.scenes.length || !project.shots.length) return false;
  if (!project.shots.every((shot) => Boolean(shot?.id && shot.sceneId && shot.review && Array.isArray(shot.versions) && shot.versions.length && shot.activeVersionId && shot.versions.some((version) => version.id === shot.activeVersionId)))
    || !project.scenes.every((scene) => Boolean(scene?.id && Array.isArray(scene.shots)))) return false;
  const shotIds = new Set(project.shots.map((shot) => shot.id));
  if (shotIds.size !== project.shots.length) return false;
  const sceneShotIds = project.scenes.flatMap((scene) => scene.shots);
  const sceneCounts = sceneShotIds.reduce((counts, id) => counts.set(id, (counts.get(id) || 0) + 1), new Map<string, number>());
  if (project.shots.some((shot) => sceneCounts.get(shot.id) !== 1) || sceneShotIds.some((id) => !shotIds.has(id))) return false;
  return project.deliverables.every((deliverable) => Array.isArray(deliverable.shotIds) && deliverable.shotIds.every((id) => shotIds.has(id)));
}

function normalizeProject(project: Project): Project {
  const next: Project = {
    ...project,
    mood: project.mood || "Restrained confidence",
    realism: project.realism || "Photoreal",
    quality: project.quality || "Campaign master",
    audience: project.audience || "General premium audience",
  };
  next.shots = next.shots.map((shot) => {
    const packet = compileShot(next, shot, []);
    return {
      ...shot,
      packetDirty: Boolean(shot.packetDirty),
      review: { ...shot.review, status: deriveReviewStatus(shot.review) },
      versions: shot.versions.map((version) => ({
        ...version,
        negativePrompt: version.negativePrompt || packet.negativePrompt,
        qcGates: Array.isArray(version.qcGates) ? version.qcGates : packet.qcGates,
        intelligenceSignature: version.intelligenceSignature || packet.intelligenceSignature,
      })),
    };
  });
  return next;
}

function loadProject(): Project {
  try {
    const storage = getPersistenceStorage();
    if (!storage) throw new Error("Browser storage unavailable");
    const stored = storage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isProject(parsed)) return normalizeProject(parsed);
      storage.removeItem(STORAGE_KEY);
    }
  } catch {
    // The default project keeps the studio usable when browser storage is unavailable.
  }
  return createProjectFromBlueprint({
    source: "deterministic-fallback",
    model: "starter project",
    title: "Seconds in Black",
    logline: "A precision timepiece emerges from darkness as light reveals the mechanism, finish, and human ritual behind it.",
    creativeThesis: "Make precision feel emotional by moving from hidden mechanism to a composed, wearable object.",
    format: "Luxury product film",
    aspect: "2.39:1",
    provider: "Veo 3.1 / Flow",
    styleBible: { visualTone: "Monochrome precision", lighting: "Narrow controlled highlights on black", palette: "Polished steel, optical black, warm skin", texture: "Brushed metal, sapphire glass, machined edges", lensLanguage: "100mm macro into compressed hero portrait", mood: "Quiet authority" },
    storyBeats: [
      { title: "Inside precision", summary: "Open inside the mechanism before naming the object." },
      { title: "Form resolves", summary: "Translate engineering detail into a complete silhouette." },
      { title: "Human measure", summary: "Land the product on the wrist in a held campaign image." },
    ],
    scenes: [
      { title: "Inside precision", intent: "Build desire from real mechanical detail.", shots: [
        { title: "Mechanical pulse", slugline: "INT. MECHANISM - TIMELESS", description: "Interlocking steel components move in a controlled macro field.", duration: 4, shotSize: "Extreme macro", lens: "120mm probe macro", movement: "Measured lateral slide", action: "The balance and gear train complete one readable cycle", endState: "The central bridge holds in perfect alignment", continuityLocks: ["mechanism geometry", "steel finish", "motion direction"] },
        { title: "Brushed signature", slugline: "TABLETOP - BLACK", description: "A narrow highlight travels across the bracelet and engraved clasp.", duration: 4, shotSize: "Material detail", lens: "100mm macro", movement: "Locked light sweep", action: "The highlight reveals brushing, polish, and engraving", endState: "The clasp edge settles into black", continuityLocks: ["bracelet geometry", "engraving reserved for post", "light direction"] },
      ] },
      { title: "Form resolves", intent: "Reveal the complete object without losing material credibility.", shots: [
        { title: "Black dial hero", slugline: "TABLETOP - BLACK", description: "The complete black-dial watch resolves from negative space.", duration: 5, shotSize: "Hero packshot", lens: "85mm compressed hero", movement: "Slow pedestal rise", action: "Edge light reveals bezel, dial, crown, and bracelet", endState: "The full silhouette holds front-on", continuityLocks: ["case geometry", "hand position", "crown placement", "dial typography reserved for post"] },
        { title: "Crown and case", slugline: "TABLETOP - BLACK", description: "The crown, case flank, and polished chamfer define the construction.", duration: 4, shotSize: "Extreme detail", lens: "120mm macro", movement: "Micro parallax", action: "Focus travels from crown teeth to the polished case edge", endState: "The chamfer holds clean and distortion-free", continuityLocks: ["crown geometry", "case finish", "reflection map"] },
      ] },
      { title: "Human measure", intent: "Turn precision into a credible wearable ritual.", shots: [
        { title: "Wrist ritual", slugline: "INT. DARK WARDROBE - DAWN", description: "A hand settles the timepiece against a tailored sleeve.", duration: 5, shotSize: "Intimate close-up", lens: "65mm close focus", movement: "Restrained follow", action: "Fingers secure the clasp and release", endState: "The watch rests naturally on the wrist", continuityLocks: ["watch identity", "hand anatomy", "sleeve texture", "wrist scale"] },
        { title: "Final measure", slugline: "INT. DARK WARDROBE - DAWN", description: "The finished watch catches one warm line of first light.", duration: 5, shotSize: "Campaign hero", lens: "80mm portrait", movement: "Slow release and hold", action: "The wrist turns once until the dial becomes legible", endState: "A stable three-quarter hero frame holds for the edit", continuityLocks: ["watch identity", "hand position", "warm light angle", "clean background"] },
      ] },
    ],
    assets: [
      { name: "Hero timepiece", type: "object", role: "Primary product", description: "Black dial, polished steel case, integrated bracelet" },
      { name: "Mechanism", type: "object", role: "Engineering reference", description: "Stable gear train and bridge geometry" },
      { name: "Material light", type: "style", role: "Lighting reference", description: "Narrow controlled highlights on optical black" },
      { name: "Wrist styling", type: "style", role: "Human-scale reference", description: "Tailored black sleeve and warm skin" },
    ],
    audioPlan: "Microscopic ticks, clasp contact, quiet room tone, and a restrained low-frequency score that leaves space for mechanism detail.",
  }, { brief: "A luxury mechanical watch film moving from mechanism detail to a final wrist hero image." }) as Project;
}

interface StudioState {
  project: Project;
  mode: WorkspaceMode;
  selectedShotId: string;
  selectedSceneId: string;
  inspectorOpen: boolean;
  inspectorTab: "direction" | "camera" | "motion" | "prompt" | "versions";
  promptTab: "frame" | "video" | "audio" | "negative";
  command: string;
  renderRules: RenderRule[];
  osIntelligence: OSIntelligence | null;
  intelligenceStatus: "loading" | "ready" | "unavailable";
  brainStatus: "checking" | "ready" | "offline" | "analyzing" | "error";
  brainModel: string;
  brainModels: string[];
  analysisStage: string;
  notice: string;
  newProjectOpen: boolean;
  newProjectPreset: { format?: string; aspect?: string; brief?: string; duration?: number; platform?: string } | null;
  previewing: boolean;
  playhead: number;
  persistenceStatus: "saved" | "metadata-only" | "unavailable";
  setMode: (mode: WorkspaceMode) => void;
  selectShot: (shotId: string) => void;
  selectScene: (sceneId: string) => void;
  setInspectorOpen: (open: boolean) => void;
  setInspectorTab: (tab: StudioState["inspectorTab"]) => void;
  setPromptTab: (tab: StudioState["promptTab"]) => void;
  setCommand: (command: string) => void;
  setNotice: (notice: string) => void;
  setNewProjectOpen: (open: boolean) => void;
  openNewProject: (preset?: { format?: string; aspect?: string; brief?: string; duration?: number; platform?: string }) => void;
  setPreviewing: (previewing: boolean) => void;
  setPlayhead: (playhead: number | ((current: number) => number)) => void;
  setRenderRules: (rules: RenderRule[]) => void;
  setCorpusIntelligence: (rules: RenderRule[], intelligence: OSIntelligence) => void;
  setIntelligenceStatus: (status: StudioState["intelligenceStatus"]) => void;
  setBrainState: (patch: Partial<Pick<StudioState, "brainStatus" | "brainModel" | "brainModels" | "analysisStage">>) => void;
  setProjectFromBlueprint: (blueprint: Record<string, unknown>, brief: string, references?: Array<{ name: string; url: string }>) => void;
  updateShot: (shotId: string, patch: Partial<Shot>) => void;
  updateProject: (patch: Partial<Project>) => void;
  updateScene: (sceneId: string, patch: Partial<Scene>) => void;
  toggleAssetLock: (assetId: string) => void;
  moveShot: (shotId: string, delta: number) => void;
  duplicateShot: (shotId: string) => void;
  deleteShot: (shotId: string) => void;
  runDirectorCommand: () => void;
  compileSelectedShot: () => void;
  compileAllShots: () => void;
  createProject: (brief: string, options: Record<string, string | number>, references?: Array<{ name: string; url: string }>) => void;
  attachRender: (shotId: string, url: string) => void;
  updateReview: (shotId: string, patch: Partial<Shot["review"]>) => void;
  analyzeReview: (shotId: string) => void;
  toggleProposal: (shotId: string, proposalId: string) => void;
  applyRepairs: (shotId: string) => void;
  setActiveVersion: (shotId: string, versionId: string) => void;
}

export const useStudio = create<StudioState>((set, get) => {
  const project = loadProject();
  const firstShot = project.shots[0];
  return {
    project,
    mode: "home",
    selectedShotId: firstShot.id,
    selectedSceneId: firstShot.sceneId,
    inspectorOpen: true,
    inspectorTab: "direction",
    promptTab: "video",
    command: "",
    renderRules: [],
    osIntelligence: null,
    intelligenceStatus: "loading",
    brainStatus: "checking",
    brainModel: "",
    brainModels: [],
    analysisStage: "Checking local intelligence",
    notice: "",
    newProjectOpen: false,
    newProjectPreset: null,
    previewing: false,
    playhead: 0,
    persistenceStatus: detectPersistenceStatus(),
    setMode: (mode) => set((state) => ({ mode, previewing: mode === "storyboard" ? state.previewing : false })),
    selectShot: (selectedShotId) => {
      const shot = get().project.shots.find((item) => item.id === selectedShotId);
      if (shot) set({ selectedShotId, selectedSceneId: shot.sceneId, inspectorOpen: true });
    },
    selectScene: (selectedSceneId) => {
      const shot = get().project.shots.find((item) => item.sceneId === selectedSceneId);
      set({ selectedSceneId, selectedShotId: shot?.id || get().selectedShotId });
    },
    setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
    setInspectorTab: (inspectorTab) => set({ inspectorTab }),
    setPromptTab: (promptTab) => set({ promptTab }),
    setCommand: (command) => set({ command }),
    setNotice: (notice) => set({ notice }),
    setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen, ...(!newProjectOpen ? { newProjectPreset: null } : {}) }),
    openNewProject: (newProjectPreset = {}) => set({ newProjectOpen: true, newProjectPreset }),
    setPreviewing: (previewing) => set({ previewing }),
    setPlayhead: (playhead) => set((state) => ({ playhead: typeof playhead === "function" ? playhead(state.playhead) : playhead })),
    setIntelligenceStatus: (intelligenceStatus) => set({ intelligenceStatus }),
    setBrainState: (patch) => set(patch),
    setRenderRules: (renderRules) => set((state) => {
      let changed = false;
      const shots = state.project.shots.map((shot) => {
        if (shot.packetDirty) return shot;
        const packet = compileShot(state.project, shot, renderRules, state.osIntelligence);
        const active = shot.versions.find((version) => version.id === shot.activeVersionId);
        const current = active && active.framePrompt === packet.framePrompt && active.videoPrompt === packet.videoPrompt
          && active.audioPrompt === packet.audioPrompt && active.negativePrompt === packet.negativePrompt
          && JSON.stringify(active.qcGates) === JSON.stringify(packet.qcGates)
          && active.intelligenceSignature === packet.intelligenceSignature;
        if (current) return shot;
        changed = true;
        const id = `${shot.id}-v${shot.versions.length + 1}-${Date.now().toString(36)}`;
        const version = { id, label: `v${shot.versions.length + 1}`, createdAt: new Date().toISOString(), source: "corpus-intelligence-sync", notes: "Render-derived guard set synchronized without rewriting prior versions", ...packet };
        return { ...shot, versions: [...shot.versions, version], activeVersionId: id, packetDirty: false };
      });
      return { renderRules, project: changed ? { ...state.project, shots, updatedAt: new Date().toISOString() } : state.project };
    }),
    setCorpusIntelligence: (renderRules, osIntelligence) => set((state) => {
      let changed = false;
      const shots = state.project.shots.map((shot) => {
        if (shot.packetDirty) return shot;
        const packet = compileShot(state.project, shot, renderRules, osIntelligence);
        const active = shot.versions.find((version) => version.id === shot.activeVersionId);
        const current = active && active.framePrompt === packet.framePrompt && active.videoPrompt === packet.videoPrompt
          && active.audioPrompt === packet.audioPrompt && active.negativePrompt === packet.negativePrompt
          && JSON.stringify(active.qcGates) === JSON.stringify(packet.qcGates)
          && active.intelligenceSignature === packet.intelligenceSignature;
        if (current) return shot;
        changed = true;
        const id = `${shot.id}-v${shot.versions.length + 1}-${Date.now().toString(36)}`;
        const version = { id, label: `v${shot.versions.length + 1}`, createdAt: new Date().toISOString(), source: "corpus-intelligence-sync", notes: "Project-aware render intelligence synchronized without rewriting prior versions", ...packet };
        return { ...shot, versions: [...shot.versions, version], activeVersionId: id, packetDirty: false };
      });
      return { renderRules, osIntelligence, intelligenceStatus: "ready", project: changed ? { ...state.project, shots, updatedAt: new Date().toISOString() } : state.project };
    }),
    setProjectFromBlueprint: (blueprint, brief, references = []) => {
      const project = createProjectFromBlueprint(blueprint, { brief }) as Project;
      const addedAssets = references.map((reference, index) => ({ id: `reference-${Date.now().toString(36)}-${index}`, name: reference.name, type: "style", role: "Uploaded reference", description: "Creator-supplied visual reference", url: reference.url, locked: true }));
      project.assets = [...project.assets, ...addedAssets];
      if (addedAssets.length) {
        const ids = addedAssets.map((asset) => asset.id);
        project.shots = project.shots.map((shot) => ({ ...shot, continuityRefs: [...shot.continuityRefs, ...ids], packetDirty: true }));
      }
      project.shots = project.shots.map((shot) => {
        const packet = compileShot(project, shot, get().renderRules, get().osIntelligence);
        const active = shot.versions.find((version) => version.id === shot.activeVersionId)!;
        return { ...shot, packetDirty: false, versions: shot.versions.map((version) => version.id === active.id ? { ...version, ...packet } : version) };
      });
      const developed = project.creativeStatus === "developed" && project.qualityReport?.passed !== false;
      // "director-deterministic" means the user chose the deterministic Director while the
      // local model may still be ready — only an actual fallback/unavailable marks offline.
      const brainStatus = blueprint.source === "ollama" ? "ready" : blueprint.source === "director-deterministic" ? get().brainStatus : "offline";
      set({ project, selectedShotId: project.shots[0].id, selectedSceneId: project.scenes[0].id, mode: "overview", newProjectOpen: false, newProjectPreset: null, previewing: false, playhead: 0, brainStatus, brainModel: String(blueprint.model || get().brainModel), analysisStage: developed ? "Production passed creative QC" : "Draft requires creative intelligence", notice: developed ? "Production developed: treatment, script, storyboard, continuity, sound, and prompt pack passed creative QC." : "Local creative intelligence was unavailable. A corpus-grounded draft was saved, but it is not marked production-ready." });
    },
    updateShot: (shotId, patch) => set((state) => {
      const project = { ...state.project, shots: state.project.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch, packetDirty: true } : shot), updatedAt: new Date().toISOString() };
      return { project: syncProjectTiming(project) };
    }),
    updateProject: (patch) => set((state) => ({ project: { ...state.project, ...patch, shots: state.project.shots.map((shot) => ({ ...shot, packetDirty: true })), updatedAt: new Date().toISOString() } })),
    updateScene: (sceneId, patch) => set((state) => ({ project: { ...state.project, scenes: state.project.scenes.map((scene) => scene.id === sceneId ? { ...scene, ...patch } : scene), updatedAt: new Date().toISOString() } })),
    toggleAssetLock: (assetId) => set((state) => ({
      project: { ...state.project, assets: state.project.assets.map((asset) => asset.id === assetId ? { ...asset, locked: !asset.locked } : asset), shots: state.project.shots.map((shot) => ({ ...shot, packetDirty: true })), updatedAt: new Date().toISOString() },
    })),
    moveShot: (shotId, delta) => set((state) => {
      const shot = state.project.shots.find((item) => item.id === shotId);
      if (!shot) return state;
      const scene = state.project.scenes.find((item) => item.id === shot.sceneId);
      if (!scene) return state;
      const from = scene.shots.indexOf(shotId);
      const to = Math.max(0, Math.min(scene.shots.length - 1, from + delta));
      const nextSceneShots = moveItem(scene.shots, from, to);
      const scenes = state.project.scenes.map((item) => item.id === scene.id ? { ...item, shots: nextSceneShots } : item);
      const byId = new Map(state.project.shots.map((item) => [item.id, item]));
      const shots = scenes.flatMap((item) => item.shots.map((id) => byId.get(id)).filter(Boolean) as Shot[]);
      const order = new Map(shots.map((item, index) => [item.id, index]));
      const deliverables = state.project.deliverables.map((deliverable) => ({ ...deliverable, shotIds: [...deliverable.shotIds].sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER)) }));
      return { project: syncProjectTiming({ ...state.project, scenes, shots, deliverables, updatedAt: new Date().toISOString() }) };
    }),
    duplicateShot: (shotId) => set((state) => {
      const source = state.project.shots.find((shot) => shot.id === shotId);
      if (!source) return state;
      const id = `shot-${Date.now().toString(36)}`;
      const copy: Shot = structuredClone(source);
      const activeIndex = source.versions.findIndex((version) => version.id === source.activeVersionId);
      copy.id = id;
      copy.title = `${source.title} alternate`;
      copy.versions = copy.versions.map((version, index) => ({ ...version, id: `${id}-v${index + 1}` }));
      copy.activeVersionId = copy.versions[Math.max(0, activeIndex)]?.id || copy.versions[0]?.id || null;
      copy.packetDirty = true;
      copy.review = { renderUrl: "", critique: "", proposals: [], temporalPass: null, continuityPass: null, status: "unreviewed" };
      const scene = state.project.scenes.find((item) => item.id === source.sceneId)!;
      const at = scene.shots.indexOf(source.id) + 1;
      const nextSceneShots = [...scene.shots];
      nextSceneShots.splice(at, 0, id);
      const shots = [...state.project.shots];
      shots.splice(shots.indexOf(source) + 1, 0, copy);
      const deliverables = state.project.deliverables.map((deliverable) => {
        const sourceIndex = deliverable.shotIds.indexOf(source.id);
        if (sourceIndex < 0) return deliverable;
        const shotIds = [...deliverable.shotIds];
        shotIds.splice(sourceIndex + 1, 0, id);
        return { ...deliverable, shotIds };
      });
      const project = { ...state.project, shots, deliverables, scenes: state.project.scenes.map((item) => item.id === scene.id ? { ...item, shots: nextSceneShots } : item), updatedAt: new Date().toISOString() };
      return { project: syncProjectTiming(project), selectedShotId: id };
    }),
    deleteShot: (shotId) => set((state) => {
      if (state.project.shots.length <= 1) return { notice: "A project needs at least one shot." };
      const shot = state.project.shots.find((item) => item.id === shotId);
      if (!shot) return state;
      const shots = state.project.shots.filter((item) => item.id !== shotId);
      const scenes = state.project.scenes.map((scene) => ({ ...scene, shots: scene.shots.filter((id) => id !== shotId) }));
      const deliverables = state.project.deliverables.map((deliverable) => ({ ...deliverable, shotIds: deliverable.shotIds.filter((id) => id !== shotId) }));
      return { project: syncProjectTiming({ ...state.project, shots, scenes, deliverables, updatedAt: new Date().toISOString() }), selectedShotId: shots[0].id, selectedSceneId: shots[0].sceneId, notice: "Shot removed from the production and delivery maps." };
    }),
    runDirectorCommand: () => {
      const command = get().command.trim();
      if (!command) return set({ notice: "Write a direction first." });
      const shot = get().project.shots.find((item) => item.id === get().selectedShotId);
      if (!shot) return;
      const note = `Director note: ${command}`;
      get().updateShot(shot.id, { description: `${shot.description}. ${note}` });
      set({ command: "", notice: "Direction applied to the selected shot." });
    },
    compileSelectedShot: () => set((state) => {
      const shot = state.project.shots.find((item) => item.id === state.selectedShotId);
      if (!shot) return state;
      if (!shot.packetDirty) return { mode: "prompts", notice: "The selected shot packet is already current." };
      const packet = compileShot(state.project, shot, state.renderRules, state.osIntelligence);
      const id = `${shot.id}-v${shot.versions.length + 1}-${Date.now().toString(36)}`;
      const version = { id, label: `v${shot.versions.length + 1}`, createdAt: new Date().toISOString(), source: "director-edit", notes: "Compiled from current project and shot state", ...packet };
      return { project: { ...state.project, shots: state.project.shots.map((item) => item.id === shot.id ? { ...shot, versions: [...shot.versions, version], activeVersionId: id, packetDirty: false } : item), updatedAt: new Date().toISOString() }, mode: "prompts", notice: `${version.label} compiled from current direction and render guards.` };
    }),
    compileAllShots: () => set((state) => {
      const dirtyCount = state.project.shots.filter((shot) => shot.packetDirty).length;
      if (!dirtyCount) return { notice: "All shot packets are current." };
      const shots = state.project.shots.map((shot) => {
        if (!shot.packetDirty) return shot;
        const packet = compileShot(state.project, shot, state.renderRules, state.osIntelligence);
        const id = `${shot.id}-v${shot.versions.length + 1}-${Date.now().toString(36)}`;
        const version = { id, label: `v${shot.versions.length + 1}`, createdAt: new Date().toISOString(), source: "project-compile", notes: "Compiled from synchronized project state", ...packet };
        return { ...shot, versions: [...shot.versions, version], activeVersionId: id, packetDirty: false };
      });
      return { project: { ...state.project, shots, updatedAt: new Date().toISOString() }, notice: `${dirtyCount} shot packet${dirtyCount === 1 ? "" : "s"} compiled.` };
    }),
    createProject: (brief, options, references = []) => {
      const project = createProjectFromBrief(brief, options) as Project;
      const addedAssets = references.map((reference, index) => ({ id: `reference-${Date.now().toString(36)}-${index}`, name: reference.name, type: "style", url: reference.url, locked: true }));
      project.assets = [...project.assets, ...addedAssets];
      if (addedAssets.length) {
        const ids = addedAssets.map((asset) => asset.id);
        project.shots = project.shots.map((shot) => ({ ...shot, continuityRefs: [...shot.continuityRefs, ...ids] }));
      }
      project.shots = project.shots.map((shot) => {
        const packet = compileShot(project, shot, get().renderRules, get().osIntelligence);
        return { ...shot, packetDirty: false, versions: shot.versions.map((version) => version.id === shot.activeVersionId ? { ...version, ...packet } : version) };
      });
      const synchronized = syncProjectTiming(project);
      set({ project: synchronized, selectedShotId: synchronized.shots[0].id, selectedSceneId: synchronized.scenes[0].id, mode: "story", newProjectOpen: false, newProjectPreset: null, previewing: false, playhead: 0, notice: "New production created." });
    },
    attachRender: (shotId, renderUrl) => set((state) => ({
      project: { ...state.project, shots: state.project.shots.map((shot) => shot.id === shotId ? { ...shot, review: { renderUrl, critique: "", proposals: [], temporalPass: null, continuityPass: null, status: "reviewing" } } : shot) },
    })),
    updateReview: (shotId, patch) => set((state) => ({
      project: { ...state.project, shots: state.project.shots.map((shot) => {
        if (shot.id !== shotId) return shot;
        const critiqueChanged = Object.hasOwn(patch, "critique") && patch.critique !== shot.review.critique;
        const review = { ...shot.review, ...patch, proposals: critiqueChanged ? [] : shot.review.proposals };
        return { ...shot, review: { ...review, status: deriveReviewStatus(review) } };
      }) },
    })),
    analyzeReview: (shotId) => set((state) => {
      const target = state.project.shots.find((shot) => shot.id === shotId);
      if (!target?.review.renderUrl) return { notice: "Attach provider render evidence before analyzing a critique." };
      const proposals = analyzeCritique(target.review.critique) as RepairProposal[];
      if (!proposals.length) return { notice: "No known repair rule matched this evidence. Keep the critique as an open finding." };
      return {
        project: { ...state.project, shots: state.project.shots.map((shot) => shot.id === shotId ? { ...shot, review: { ...shot.review, proposals, status: "repair" } } : shot) },
        notice: "Repair proposals are ready for review. Nothing has been applied yet.",
      };
    }),
    toggleProposal: (shotId, proposalId) => set((state) => ({
      project: { ...state.project, shots: state.project.shots.map((shot) => shot.id === shotId ? { ...shot, review: { ...shot.review, proposals: shot.review.proposals.map((proposal) => proposal.id === proposalId ? { ...proposal, selected: !proposal.selected } : proposal) } } : shot) },
    })),
    applyRepairs: (shotId) => set((state) => {
      const shot = state.project.shots.find((item) => item.id === shotId);
      if (!shot) return state;
      const selected = shot.review.proposals.filter((proposal) => proposal.selected);
      if (!selected.length) return { notice: "Select at least one repair." };
      const version = createRepairVersion(state.project, shot, selected, state.renderRules, state.osIntelligence);
      const appliedIds = new Set(shot.activeRepairs.map((repair) => repair.id));
      const nextShot = { ...shot, activeRepairs: [...shot.activeRepairs, ...selected.filter((repair) => !appliedIds.has(repair.id))], versions: [...shot.versions, version], activeVersionId: version.id, packetDirty: false, review: { ...shot.review, proposals: shot.review.proposals.map((proposal) => ({ ...proposal, selected: false })), status: "repair" as const } };
      return { project: { ...state.project, shots: state.project.shots.map((item) => item.id === shot.id ? nextShot : item) }, mode: "prompts", notice: `${version.label} repair packet compiled from reviewed QC.` };
    }),
    setActiveVersion: (shotId, versionId) => set((state) => ({
      project: { ...state.project, shots: state.project.shots.map((shot) => shot.id === shotId && shot.versions.some((version) => version.id === versionId) ? { ...shot, activeVersionId: versionId, packetDirty: true } : shot) },
      notice: "Historical version selected. Recompile before export to bind current shot metadata.",
    })),
  };
});

let persistedProject = useStudio.getState().project;

useStudio.subscribe((state) => {
  if (state.project === persistedProject) return;
  persistedProject = state.project;
  const storage = getPersistenceStorage();
  if (!storage) {
    useStudio.setState({ persistenceStatus: "unavailable" });
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state.project));
    useStudio.setState({ persistenceStatus: "saved" });
  } catch {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(safeProject(state.project)));
      useStudio.setState({ persistenceStatus: "metadata-only" });
    } catch {
      useStudio.setState({ persistenceStatus: "unavailable" });
    }
  }
});
