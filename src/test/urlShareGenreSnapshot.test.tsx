/**
 * ⭐ **A share link's `?genre=` decides which genre the studio opens in — it must not re-apply that
 * genre once the studio is up.**
 *
 * ## The loss this pins
 *
 * Measured in a real Chromium against this app's source (Playwright, dev server), with the same
 * seeded snapshot in both legs:
 *
 * ```
 *   snapshot                     genreId chicago-house, stepCount 32, swing 0, every lane 32 steps
 *   leg A  /studio                live studio: +1224 ms 32/0 … at rest localStorage 32/0   PRESERVED
 *   leg B  /studio?genre=chicago-house
 *                                 live studio: +1195 ms 32/0   ← the restored snapshot
 *                                              +1569 ms 128/15  ← the genre's defaults, 374 ms later
 *                                 at rest localStorage: 128/15 (totalSteps 128, swing 15)   CLOBBERED
 * ```
 *
 * The only difference between the legs is the query parameter, and the damage was done by this hook:
 * `App.tsx` already turns `route.genreId` into the genre `StudioView` is constructed with, and the
 * store's `createInitialSequencerState` is the thing that **restores the user's matching snapshot**.
 * The mount effect then dispatched `SET_GENRE` for the same URL parameter, and `SET_GENRE` replaces
 * both pattern slots with `patternFromGenre` (see `unsavedGuard.ts` for why that is intended when the
 * user *switches* genre, and `StudioView`'s guard for which actions rely on it). Nothing was asking
 * for a genre switch; the link was only naming the initial genre.
 *
 * ## How this criterion reads it
 *
 * The harness is the production chain in miniature, in the same order: the URL is parsed by the real
 * router, that genre seeds the real `useSequencerStore`, and the real `useUrlShareLoad` runs over it.
 * So these assertions are about the values a user's session would hold, not about a mock: the store's
 * `stepCount`, its `swing`, the lane length and an actual note. The second case is the positive half —
 * the URL's genre still decides the initial genre — and the third keeps the branch that *should*
 * replace a pattern (`?groove=`) from being swept away with the one that should not.
 */
import { useCallback, useRef } from "react";
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clonePattern, useSequencerStore, type SequencerAction } from "../features/sequencer/useSequencerStore";
import { useUrlShareLoad } from "../features/sequencer/hooks/useUrlShareLoad";
import { PROJECT_STORAGE_KEY } from "../features/sequencer/projectStorage";
import { parseUrlToRoute } from "../app/router";
import { GENRES_MAP } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import { encodeSharedSequencer } from "../audio/SequencerUrlShare";
import type { AudioEngine } from "../audio/AudioEngine";
import type { Genre, SequencerPattern } from "../types/genre";

/**
 * `useUrlShareLoad` resolves a shared payload's genre through the on-demand loader. The same data is
 * the `GENRES_MAP` the store's initializer reads, and mocking it keeps the case about *what is
 * dispatched* rather than about a dynamic import resolving inside a test.
 */
vi.mock("../data/index/loader", async () => {
  const { GENRES_MAP: MAP } = await import("../data/genres");
  return { loadGenre: async (id: string) => (MAP as Record<string, unknown>)[id] ?? null };
});

const CHICAGO = GENRES_MAP["chicago-house"] as Genre;
const DETROIT = GENRES_MAP["detroit-techno"] as Genre;

/**
 * The production chain, in miniature: `App.tsx`'s `route.genreId || "chicago-house"` resolution, the
 * studio's own store, and the URL-share mount effect over both.
 */
function useStudioAtUrl() {
  const route = parseUrlToRoute(window.location.pathname, window.location.search, "");
  const genre = (GENRES_MAP[route.genreId || "chicago-house"] ?? CHICAGO) as Genre;
  const store = useSequencerStore(genre);
  const engineRef = useRef<AudioEngine | null>(null);
  /** Every action the URL-share effect dispatched, so "it did nothing" is assertable. */
  const dispatched = useRef<string[]>([]);
  const commit = useCallback(
    (action: SequencerAction, recordHistory?: boolean) => {
      dispatched.current.push(action.type);
      store.commit(action, recordHistory);
    },
    [store.commit]
  );
  useUrlShareLoad({ commit, engineRef, currentGenre: store.state.currentGenre, showToast: () => {} });
  return { state: store.state, dispatched: dispatched.current };
}

/** The snapshot the browser reproduction seeded: 32 steps, no swing, one unmistakable note. */
function userPattern(genre: Genre, noteStep: number): SequencerPattern {
  const pattern = clonePattern(patternFromGenre(genre));
  pattern.totalSteps = 32;
  pattern.swing = 0;
  pattern.tracks = pattern.tracks.map((track) => ({
    ...track,
    steps: Array.from({ length: 32 }, (_, index) => (index === noteStep ? 1 : 0)),
    velocity: new Array(32).fill(100),
    pitch: new Array(32).fill(60),
  }));
  return pattern;
}

function seedRestoredSnapshot(genre: Genre, noteStep: number): SequencerPattern {
  const pattern = userPattern(genre, noteStep);
  window.localStorage.setItem(
    PROJECT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      projectId: null,
      genreId: genre.id,
      bpm: 121,
      swing: 0,
      timeSignature: "4/4",
      resolution: "1/16",
      stepCount: 32,
      patterns: { A: pattern, B: clonePattern(pattern) },
      activeSlot: "A",
      songMode: false,
      songChain: ["A", "B"],
      sections: [],
      loopRange: null,
      isMetronome: false,
      isCountIn: false,
    })
  );
  return pattern;
}

/** Nothing in the effect should be left pending: one macrotask settles the mocked loader. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("the share link's genre is an initial genre, not a second dispatch", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/studio");
  });

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/studio");
  });

  it("⭐ keeps the restored snapshot when the URL names the genre it belongs to", async () => {
    /**
     * The same controlled pair the browser reproduction ran, so the criterion carries its own
     * control: leg A proves the store really does restore this snapshot, and only then does leg B
     * add the `?genre=` parameter.
     */
    seedRestoredSnapshot(CHICAGO, 31);
    window.history.replaceState({}, "", "/studio");
    const plain = renderHook(() => useStudioAtUrl());
    await settle();
    expect(plain.result.current.state.stepCount).toBe(32);
    expect(plain.result.current.state.swing).toBe(0);
    expect(plain.result.current.state.pattern.tracks[0]!.steps).toHaveLength(32);
    expect(plain.result.current.state.pattern.tracks[0]!.steps[31]).toBe(1);
    plain.unmount();

    // The genre's own defaults, for contrast, are a different length and carry swing.
    expect(patternFromGenre(CHICAGO).tracks[0]!.steps.length).toBe(128);
    expect(patternFromGenre(CHICAGO).swing).toBe(15);

    seedRestoredSnapshot(CHICAGO, 31);
    window.history.replaceState({}, "", `/studio?genre=${CHICAGO.id}`);
    const named = renderHook(() => useStudioAtUrl());
    await settle();

    // ⭐ The user's work is still what the studio holds, value for value.
    expect(named.result.current.state.stepCount).toBe(32);
    expect(named.result.current.state.swing).toBe(0);
    expect(named.result.current.state.pattern.tracks[0]!.steps).toHaveLength(32);
    expect(named.result.current.state.pattern.tracks[0]!.steps[31]).toBe(1);

    // And the effect did not silently re-apply the genre on its way past.
    expect(named.result.current.dispatched).not.toContain("SET_GENRE");
  });

  it("still opens in the genre the URL names when there is nothing to restore", async () => {
    window.history.replaceState({}, "", `/studio?genre=${DETROIT.id}`);

    const { result } = renderHook(() => useStudioAtUrl());
    await settle();

    expect(result.current.state.currentGenre.id).toBe("detroit-techno");
    expect(result.current.state.currentGenre.id).not.toBe(CHICAGO.id);
    expect(result.current.state.stepCount).toBe(patternFromGenre(DETROIT).tracks[0]!.steps.length);
    expect(result.current.state.bpm).toBe(DETROIT.default_bpm ?? result.current.state.bpm);
  });

  it("still loads a `?groove=` payload, which genuinely replaces the pattern", async () => {
    const shared = encodeSharedSequencer({
      genreId: CHICAGO.id,
      bpm: 128,
      swing: 42,
      resolution: "1/16",
      totalSteps: 16,
      tracks: [
        {
          track_id: "kick",
          name: "Kick",
          instrument: "kick",
          steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          velocity: new Array(16).fill(100),
        },
      ],
    } as never);
    expect(shared).not.toBe("");
    window.history.replaceState({}, "", `/studio?groove=${shared}`);

    const { result } = renderHook(() => useStudioAtUrl());
    await settle();

    expect(result.current.dispatched).toContain("COMMIT_PATTERN");
    expect(result.current.state.pattern.tracks[0]!.steps).toHaveLength(16);
    expect(result.current.state.pattern.tracks[0]!.steps[0]).toBe(1);
    expect(result.current.state.bpm).toBe(128);
    expect(result.current.state.swing).toBe(42);
  });
});
