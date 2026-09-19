/**
 * Groove Project Storage Service (P3-04)
 * Handles debounced persistence and migration of active project state to localStorage.
 */

import { SequencerPattern, Genre } from "../../types/genre";

export const PROJECT_STORAGE_KEY = "groove_project_v1";
export const STORAGE_VERSION = 1;

export interface PersistedProject {
  version: number;
  updatedAt: number;
  /**
   * F-06: which Project-Hub record this scratch snapshot belongs to.
   * `null` means "no active project yet" (legacy single-draft mode).
   */
  projectId?: string | null;
  genreId: string;
  bpm: number;
  swing: number;
  timeSignature: string;
  resolution: "1/8" | "1/16" | "1/32";
  stepCount: number;
  patterns: {
    A: SequencerPattern;
    B: SequencerPattern;
  };
  activeSlot: "A" | "B";
  songMode: boolean;
  songChain: ("A" | "B")[];
  loopRange: [number, number] | null;
  isMetronome: boolean;
  isCountIn: boolean;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * What the auto-save is doing, as something a surface can subscribe to.
 *
 * The studio writes the project to localStorage 500 ms after every change and never said so, while
 * the genre maker has shown a `● unsaved` badge all along — so the studio's users could not tell
 * whether their work was safe (U8). This is the *only* honest place to read that from: the module
 * that does the writing. `saving` means a change is debounced, not that bytes are in flight (a
 * localStorage write is synchronous), and it is reported as such rather than pretending to be
 * progress.
 *
 * The snapshot object is cached and replaced only on change, because `useSyncExternalStore` compares
 * snapshots by identity — returning a fresh object per call would loop forever.
 */
export type SaveStatus = "idle" | "saving" | "saved" | "failed";

export interface SaveStatusSnapshot {
  status: SaveStatus;
  /** When the last successful write landed, or null before the first one. */
  savedAt: number | null;
}

let saveStatusSnapshot: SaveStatusSnapshot = { status: "idle", savedAt: null };
const saveStatusListeners = new Set<() => void>();

function setSaveStatus(status: SaveStatus): void {
  if (saveStatusSnapshot.status === status) return;
  saveStatusSnapshot = {
    status,
    savedAt: status === "saved" ? Date.now() : saveStatusSnapshot.savedAt,
  };
  for (const listener of saveStatusListeners) listener();
}

export function subscribeSaveStatus(listener: () => void): () => void {
  saveStatusListeners.add(listener);
  return () => {
    saveStatusListeners.delete(listener);
  };
}

export function getSaveStatusSnapshot(): SaveStatusSnapshot {
  return saveStatusSnapshot;
}

/** Test helper: put the indicator back to "nothing has happened yet". */
export function resetSaveStatus(): void {
  saveStatusSnapshot = { status: "idle", savedAt: null };
  for (const listener of saveStatusListeners) listener();
}

/** Pending payload of the debounced write, so it can be flushed on page hide. */
let pendingProject: Omit<PersistedProject, "version" | "updatedAt"> | null = null;
let flushRegistered = false;

/**
 * Saves project state to localStorage with 500ms debounce
 */
export function debounceSaveProject(project: Omit<PersistedProject, "version" | "updatedAt">): void {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  pendingProject = project;
  // A change is now waiting on the debounce; say so rather than leaving the user guessing.
  setSaveStatus("saving");

  // F-07 (companion): a debounce that is only ever reset silently loses the tail of
  // a session (tab close / app switch right after an edit). Flush on page hide.
  if (!flushRegistered) {
    flushRegistered = true;
    window.addEventListener("pagehide", flushPendingProject);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushPendingProject();
      });
    }
  }

  saveTimer = setTimeout(() => {
    saveProjectImmediate(project);
    saveTimer = null;
    pendingProject = null;
  }, 500);
}

/** Writes any debounced-but-unsaved snapshot right now. */
export function flushPendingProject(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingProject) {
    saveProjectImmediate(pendingProject);
    pendingProject = null;
  }
}

import { getActiveProjectId, getProject, saveProject } from "./projectDb";
export * from "./projectDb";

/**
 * Saves project state immediately to localStorage and syncs to IndexedDB if active project exists
 */
export function saveProjectImmediate(project: Omit<PersistedProject, "version" | "updatedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const activeId = getActiveProjectId();
    const payload: PersistedProject = {
      ...project,
      projectId: activeId,
      version: STORAGE_VERSION,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(payload));
    setSaveStatus("saved");

    if (activeId) {
      getProject(activeId).then((existing) => {
        if (existing) {
          saveProject({
            ...existing,
            genreId: project.genreId,
            bpm: project.bpm,
            swing: project.swing,
            timeSignature: project.timeSignature,
            resolution: project.resolution,
            stepCount: project.stepCount,
            patterns: project.patterns,
            activeSlot: project.activeSlot,
            songMode: project.songMode,
            songChain: project.songChain,
            loopRange: project.loopRange,
            isMetronome: project.isMetronome,
            isCountIn: project.isCountIn,
            updatedAt: payload.updatedAt,
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  } catch (e) {
    /**
     * A refused write must not read as "saving" for ever.
     *
     * localStorage throws when it is full or disabled, and the old code only logged it — so a user
     * whose storage was full had no way to learn that their work was *not* safe. Saying so is the
     * whole point of this indicator.
     */
    console.warn("[projectStorage] Failed to save project:", e);
    setSaveStatus("failed");
  }
}

/**
 * Loads project state from localStorage with version migration safety
 */
export function loadSavedProject(): PersistedProject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;

    // Version migration if needed
    if (data.version === 1) {
      if (!data.patterns || !data.patterns.A) return null;

      // F-06: the scratch snapshot belongs to exactly one Project-Hub record.
      // Restoring it into a different active project used to resurrect project A's
      // pattern and then autosave it INTO project B.
      const activeId = getActiveProjectId();
      const snapshotId = data.projectId ?? null;
      if (activeId !== snapshotId) {
        return null;
      }

      return data as PersistedProject;
    }

    return null;
  } catch (e) {
    console.warn("[projectStorage] Failed to parse saved project:", e);
    return null;
  }
}

/**
 * Clears saved project from localStorage
 */
export function clearSavedProject(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROJECT_STORAGE_KEY);
  } catch (e) {
    console.warn("[projectStorage] Failed to clear project:", e);
  }
}

/**
 * Checks if a valid saved project exists
 */
export function hasSavedProject(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(PROJECT_STORAGE_KEY));
}
