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

let saveTimer: any = null;

/**
 * Saves project state to localStorage with 500ms debounce
 */
export function debounceSaveProject(project: Omit<PersistedProject, "version" | "updatedAt">): void {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    saveProjectImmediate(project);
    saveTimer = null;
  }, 500);
}

import { getActiveProjectId, getProject, saveProject } from "./projectDb";
export * from "./projectDb";

/**
 * Saves project state immediately to localStorage and syncs to IndexedDB if active project exists
 */
export function saveProjectImmediate(project: Omit<PersistedProject, "version" | "updatedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedProject = {
      ...project,
      version: STORAGE_VERSION,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(payload));

    const activeId = getActiveProjectId();
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
    console.warn("[projectStorage] Failed to save project:", e);
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
