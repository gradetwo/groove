import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  PROJECT_STORAGE_KEY,
  loadSavedProject,
  saveProjectImmediate,
  debounceSaveProject,
  flushPendingProject,
  clearSavedProject,
} from "../features/sequencer/projectStorage";
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  saveProject,
  deleteProject,
  generateProjectId,
  getProjectsStorageStatus,
} from "../features/sequencer/projectDb";
import type { SequencerPattern } from "../types/genre";

function makePattern(steps = 16): SequencerPattern {
  return {
    bpm: 120,
    swing: 0,
    totalSteps: steps,
    scale: "minor-pentatonic",
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        instrument: "drum",
        steps: Array.from({ length: steps }, (_, i) => (i % 4 === 0 ? 1 : 0)),
        velocity: new Array(steps).fill(100),
        pitch: new Array(steps).fill(0),
        gate: new Array(steps).fill(0.8),
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
      },
    ],
  } as unknown as SequencerPattern;
}

function makeSnapshotPayload() {
  const pattern = makePattern();
  return {
    genreId: "chicago-house",
    bpm: 124,
    swing: 0,
    timeSignature: "4/4",
    resolution: "1/16" as const,
    stepCount: 16,
    patterns: { A: pattern, B: pattern },
    activeSlot: "A" as const,
    songMode: false,
    songChain: ["A", "B"] as Array<"A" | "B">,
    loopRange: null,
    isMetronome: false,
    isCountIn: false,
  };
}

describe("F-06 · scratch snapshot is scoped to the active project", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("refuses to restore a snapshot that belongs to a different project", () => {
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, "proj_B");
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({ version: 1, projectId: "proj_A", ...makeSnapshotPayload() })
    );

    // Project A's pattern must NOT be handed to project B.
    expect(loadSavedProject()).toBeNull();
  });

  it("restores the snapshot when it belongs to the active project", () => {
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, "proj_A");
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      JSON.stringify({ version: 1, projectId: "proj_A", ...makeSnapshotPayload() })
    );

    const restored = loadSavedProject();
    expect(restored).not.toBeNull();
    expect(restored?.genreId).toBe("chicago-house");
  });

  it("still restores legacy single-draft snapshots when no project is active", () => {
    localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({ version: 1, ...makeSnapshotPayload() }));

    expect(loadSavedProject()).not.toBeNull();
  });

  it("stamps the active project id when persisting", () => {
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, "proj_C");
    saveProjectImmediate(makeSnapshotPayload());

    const raw = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY)!);
    expect(raw.projectId).toBe("proj_C");
  });

  it("flushes the debounced snapshot synchronously on demand", () => {
    localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, "proj_D");
    debounceSaveProject(makeSnapshotPayload());
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBeNull();

    flushPendingProject();
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).not.toBeNull();
    clearSavedProject();
    flushPendingProject();
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBeNull();
  });
});

describe("F-07 · IndexedDB failures surface instead of pretending to succeed", () => {
  const originalIndexedDB = globalThis.indexedDB;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      value: originalIndexedDB,
      writable: true,
      configurable: true,
    });
  });

  it("rejects a save when the transaction aborts (e.g. quota exceeded)", async () => {
    // A minimal IndexedDB that opens fine and then aborts every write transaction.
    const fakeRequest: any = {};
    const fakeDb: any = {
      objectStoreNames: { contains: () => true },
      close: () => {},
      transaction: () => {
        const tx: any = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          error: new Error("QuotaExceededError"),
          objectStore: () => ({
            put: () => {
              setTimeout(() => tx.onabort?.(), 0);
              return {};
            },
            delete: () => {
              setTimeout(() => tx.onabort?.(), 0);
              return {};
            },
          }),
        };
        return tx;
      },
    };
    Object.defineProperty(globalThis, "indexedDB", {
      value: {
        open: () => {
          setTimeout(() => {
            fakeRequest.result = fakeDb;
            fakeRequest.onsuccess?.();
          }, 0);
          return fakeRequest;
        },
      },
      writable: true,
      configurable: true,
    });

    const project: any = {
      id: generateProjectId(),
      name: "Aborted",
      genreId: "chicago-house",
      genreName: "Chicago House",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bpm: 120,
      swing: 0,
      timeSignature: "4/4",
      resolution: "1/16",
      stepCount: 16,
      patterns: { A: makePattern(), B: makePattern() },
      activeSlot: "A",
      songMode: false,
      songChain: ["A", "B"],
      loopRange: null,
      isMetronome: false,
      isCountIn: false,
      effectsRack: {},
      drumKit: "808",
      isFavorite: false,
      tags: [],
    };

    await expect(saveProject(project)).rejects.toThrow(/QuotaExceeded|abort/i);
    expect(getProjectsStorageStatus().mode).toBe("memory");
    expect(getProjectsStorageStatus().lastError).toBeTruthy();

    await expect(deleteProject(project.id)).rejects.toThrow(/QuotaExceeded|abort/i);
  });
});
