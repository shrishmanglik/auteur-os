import type { Project, WorkspaceMode } from "./types";
import { isProject, useStudio } from "./store";

const DB_NAME = "auteur-studio";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "active-session";

export interface WorkspaceSnapshot {
  mode: WorkspaceMode;
  selectedShotId: string;
  selectedSceneId: string;
  inspectorOpen: boolean;
  inspectorTab: "direction" | "camera" | "motion" | "prompt" | "versions";
  promptTab: "frame" | "video" | "audio" | "negative";
  command: string;
  previewing: boolean;
  playhead: number;
}

export interface StudioSnapshot {
  version: 1;
  savedAt: string;
  project: Project;
  workspace: WorkspaceSnapshot;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

async function database(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw new Error("IndexedDB unavailable.");
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
  return requestResult(request);
}

export function isStudioSnapshot(value: unknown): value is StudioSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<StudioSnapshot>;
  const workspace = snapshot.workspace as Partial<WorkspaceSnapshot> | undefined;
  return snapshot.version === 1 && typeof snapshot.savedAt === "string" && isProject(snapshot.project)
    && Boolean(workspace && typeof workspace.mode === "string" && typeof workspace.selectedShotId === "string" && typeof workspace.selectedSceneId === "string");
}

export function createStudioSnapshot(state = useStudio.getState(), savedAt = new Date().toISOString()): StudioSnapshot {
  return {
    version: 1,
    savedAt,
    project: structuredClone(state.project),
    workspace: {
      mode: state.mode,
      selectedShotId: state.selectedShotId,
      selectedSceneId: state.selectedSceneId,
      inspectorOpen: state.inspectorOpen,
      inspectorTab: state.inspectorTab,
      promptTab: state.promptTab,
      command: state.command,
      previewing: state.previewing,
      playhead: state.playhead,
    },
  };
}

export function chooseNewestSnapshot(...values: unknown[]): StudioSnapshot | null {
  return values.filter(isStudioSnapshot).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0] || null;
}

export function workspacePatch(snapshot: StudioSnapshot) {
  const shot = snapshot.project.shots.find((item) => item.id === snapshot.workspace.selectedShotId) || snapshot.project.shots[0];
  const scene = snapshot.project.scenes.find((item) => item.id === snapshot.workspace.selectedSceneId)
    || snapshot.project.scenes.find((item) => item.id === shot.sceneId) || snapshot.project.scenes[0];
  return {
    project: snapshot.project,
    mode: snapshot.workspace.mode,
    selectedShotId: shot.id,
    selectedSceneId: scene.id,
    inspectorOpen: Boolean(snapshot.workspace.inspectorOpen),
    inspectorTab: snapshot.workspace.inspectorTab || "direction",
    promptTab: snapshot.workspace.promptTab || "video",
    command: snapshot.workspace.command || "",
    previewing: Boolean(snapshot.workspace.previewing),
    playhead: Math.max(0, Math.min(snapshot.project.duration, Number(snapshot.workspace.playhead) || 0)),
    persistenceStatus: "saved" as const,
  };
}

export async function readIndexedSnapshot(): Promise<StudioSnapshot | null> {
  try {
    const db = await database();
    const result = await requestResult(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(SNAPSHOT_KEY));
    db.close();
    return isStudioSnapshot(result) ? result : null;
  } catch {
    return null;
  }
}

export async function writeIndexedSnapshot(snapshot: StudioSnapshot): Promise<boolean> {
  try {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export interface BackendSnapshotResult {
  available: boolean;
  snapshot: StudioSnapshot | null;
}

export async function readBackendSnapshot(): Promise<BackendSnapshotResult> {
  try {
    const response = await fetch("/api/state/snapshot", { headers: { Accept: "application/json" }, cache: "no-store" });
    const available = response.headers.get("X-Auteur-State-Vault") === "1";
    if (!response.ok || !available) return { available, snapshot: null };
    const value: unknown = await response.json();
    return { available: true, snapshot: isStudioSnapshot(value) ? value : null };
  } catch {
    return { available: false, snapshot: null };
  }
}

export async function writeBackendSnapshot(snapshot: StudioSnapshot): Promise<boolean> {
  try {
    const response = await fetch("/api/state/snapshot", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
    return response.ok;
  } catch {
    return false;
  }
}
