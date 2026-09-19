/**
 * Genre switching asks before it destroys unsaved work (item ⑧, the "similar scenarios" audit).
 *
 * Gating the genre rail alone was not enough. There are three ways in — the rail, the dice/random
 * button, and **navigation** (Explore, search or a random genre sending the user to the studio) —
 * and the navigation path used to `commit({ type: "SET_GENRE" })` directly: it discarded edits
 * with no question *and* skipped the genre's own drum kit and FX defaults, so arriving from
 * Explore left the previous genre's kit and rack in place.
 *
 * These tests pin the choke point: every path goes through `switchGenre`, which asks the caller's
 * guard, and nothing is committed unless the guard runs the action.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGenreSwitching } from "../features/sequencer/hooks/useGenreSwitching";
import { DEFAULT_GS1_ROUTING_ENABLED, setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import type { Genre } from "../types/genre";
import type { SequencerAction } from "../features/sequencer/useSequencerStore";
import { ALL_GENRES } from "../data/genres";

/**
 * Real catalog entries, not stubs: the switch path consults the genre's own metadata (accent
 * colour, drum kit, FX defaults), and a hand-written stub drifts out of shape the moment that
 * metadata grows a field.
 */
const genre = (id: string): Genre => {
  const found = (ALL_GENRES as unknown as Genre[]).find((g) => g.id === id);
  if (!found) throw new Error(`test genre not in the catalog: ${id}`);
  return found;
};

function setup(options: { guard?: (genre: Genre, run: () => void) => void; isPlaying?: boolean } = {}) {
  const commits: SequencerAction[] = [];
  const engine = {
    setPattern: vi.fn(),
    setDrumKit: vi.fn(),
    setDrumsOnly: vi.fn(),
    setBpm: vi.fn(),
    setSwing: vi.fn(),
    setTimeSignature: vi.fn(),
    setResolution: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    getIsPlaying: vi.fn(() => options.isPlaying ?? false),
  };
  const current = genre("chicago-house");
  const clearPlayhead = vi.fn();
  const setIsPlaying = vi.fn();
  const rendered = renderHook(() =>
    useGenreSwitching({
      currentGenre: current,
      onSelectGenre: vi.fn(),
      engineRef: { current: engine } as never,
      isPlaying: options.isPlaying ?? false,
      setIsPlaying,
      isDrumsOnly: false,
      setDrumKit: vi.fn(),
      setEffectsRackState: vi.fn(),
      clearPlayhead,
      commit: (action) => commits.push(action),
      requestGenreGuard: options.guard,
    })
  );
  return { ...rendered, commits, engine, current, clearPlayhead, setIsPlaying };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
});

describe("genre switching · the unsaved-changes choke point", () => {
  it("asks the guard before switching, and does nothing if the guard does not proceed", () => {
    const asked: string[] = [];
    const { result, commits } = setup({
      guard: (g, run) => {
        asked.push(g.id);
        // Cancel: the guard never calls `run`.
        void run;
      },
    });

    act(() => {
      result.current.switchGenre(genre("boom-bap"));
    });

    expect(asked).toEqual(["boom-bap"]);
    // Nothing happened: no pattern replacement, no engine call.
    expect(commits).toHaveLength(0);
  });

  it("switches when the guard proceeds", () => {
    const { result, commits, engine } = setup({ guard: (_g, run) => run() });

    act(() => {
      result.current.switchGenre(genre("boom-bap"));
    });

    expect(commits.map((a) => a.type)).toEqual(["SET_GENRE"]);
    expect(engine.setPattern).toHaveBeenCalledTimes(1);
  });

  it("switches without a guard at all (the hook stays usable in isolation)", () => {
    const { result, commits } = setup();
    act(() => {
      result.current.switchGenre(genre("boom-bap"));
    });
    expect(commits.map((a) => a.type)).toEqual(["SET_GENRE"]);
  });

  it("routes re-clicking the active genre to nothing, so edits are never reset by an idle tap", async () => {
    const { result, commits } = setup({ guard: (_g, run) => run() });
    await act(async () => {
      await result.current.switchGenreById("chicago-house");
    });
    expect(commits).toHaveLength(0);
  });

  it("guards the rail path through the same choke point", async () => {
    const asked: string[] = [];
    const { result, commits } = setup({
      guard: (g, run) => {
        asked.push(g.id);
        run();
      },
    });
    await act(async () => {
      result.current.handleSelectGenreFromRail("boom-bap");
    });
    expect(asked).toContain("boom-bap");
    expect(commits.map((a) => a.type)).toEqual(["SET_GENRE"]);
  });

  it("restarts playback from the beginning and syncs playing state when switching genres during playback", () => {
    const { result, commits, engine, clearPlayhead, setIsPlaying } = setup({ isPlaying: true });

    act(() => {
      result.current.switchGenre(genre("boom-bap"));
    });

    expect(commits.map((a) => a.type)).toEqual(["SET_GENRE"]);
    expect(engine.setPattern).toHaveBeenCalledTimes(1);
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(clearPlayhead).toHaveBeenCalledTimes(1);
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(setIsPlaying).toHaveBeenCalledWith(true);
  });

  it("keeps playback stopped and clears playhead when switching genres while stopped", () => {
    const { result, commits, engine, clearPlayhead } = setup({ isPlaying: false });

    act(() => {
      result.current.switchGenre(genre("boom-bap"));
    });

    expect(commits.map((a) => a.type)).toEqual(["SET_GENRE"]);
    expect(engine.setPattern).toHaveBeenCalledTimes(1);
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(clearPlayhead).toHaveBeenCalledTimes(1);
    expect(engine.play).not.toHaveBeenCalled();
  });
});

/**
 * Regression: a genre switch must happen ONCE per request, no matter how often React re-renders.
 *
 * The bug (found in a browser trace on 2026-09-16, worse on Safari): the external-sync effect
 * listed `performSwitch` and `requestGenreGuard` as dependencies, and `performSwitch` closes over
 * `onSelectGenre` — which `App` passed as an inline arrow, i.e. a new function on every render. A
 * single click therefore produced: switch → `onSelectGenre` → `navigate` → App re-render → new
 * callback identity → effect runs again → switch again… Measured with the transport running, one
 * click caused **5, 11 and 13 `pushState` calls** and up to **9 pattern flips** on successive
 * clicks: "the two genres keep swapping and the display flickers", with broken sound, because each
 * round-trip re-applied `SET_GENRE` + `engine.setPattern(..., resetStates = true)` + the genre's
 * drum kit and FX defaults.
 *
 * These tests hand the hook *fresh callback identities on every render* and require exactly one
 * switch. Before the fix this failed with many commits; that is the whole point of the assertion.
 */
describe("genre sync · one switch per request, whatever React re-renders", () => {
  const A = genre("chicago-house");
  const B = genre("boom-bap");
  const C = genre("uk-drill");

  const renderSync = (initial: Genre) =>
    renderHook(
      ({ target, tick }: { target: Genre; tick: number }) =>
        useGenreSwitching({
          currentGenre: A,
          initialGenre: target,
          // Deliberately new identities on every render, exactly like an inline arrow prop.
          onSelectGenre: () => {
            void tick;
          },
          engineRef: { current: null } as never,
          isPlaying: false,
          setIsPlaying: vi.fn(),
          isDrumsOnly: false,
          setDrumKit: vi.fn(),
          setEffectsRackState: vi.fn(),
          clearPlayhead: vi.fn(),
          commit: (action: SequencerAction) => commits.push(action),
          requestGenreGuard: (_g, run) => run(),
        }),
      { initialProps: { target: initial, tick: 0 } }
    );

  let commits: SequencerAction[] = [];
  beforeEach(() => {
    commits = [];
  });

  it("applies a navigation request once even when every render allocates new callbacks", () => {
    const { rerender } = renderSync(B);
    // Re-render repeatedly with new callback identities, as App does on each route/state update.
    for (let tick = 1; tick <= 6; tick++) rerender({ target: B, tick });

    const applied = commits.filter((a) => a.type === "SET_GENRE");
    expect(applied, `SET_GENRE applied ${applied.length} times for one request`).toHaveLength(1);
    expect((applied[0] as { genre: Genre }).genre.id).toBe("boom-bap");
  });

  it("still honours a genuinely new request after the first one lands", () => {
    const { rerender } = renderSync(B);
    for (let tick = 1; tick <= 3; tick++) rerender({ target: B, tick });
    // A different navigation target is a new request and must be applied.
    rerender({ target: C, tick: 4 });
    const ids = commits.filter((a) => a.type === "SET_GENRE").map((a) => (a as { genre: Genre }).genre.id);
    expect(ids).toEqual(["boom-bap", "uk-drill"]);
  });

  it("asks the guard for a routed navigation, not for one it has already satisfied", () => {
    const asked: string[] = [];
    const { rerender } = renderHook(
      ({ target, tick }: { target: Genre; tick: number }) =>
        useGenreSwitching({
          currentGenre: A,
          initialGenre: target,
          onSelectGenre: () => {
            void tick;
          },
          engineRef: { current: null } as never,
          isPlaying: false,
          setIsPlaying: vi.fn(),
          isDrumsOnly: false,
          setDrumKit: vi.fn(),
          setEffectsRackState: vi.fn(),
          clearPlayhead: vi.fn(),
          commit: (action: SequencerAction) => commits.push(action),
          requestGenreGuard: (g, run) => {
            asked.push(g.id);
            run();
          },
        }),
      { initialProps: { target: B, tick: 0 } }
    );
    for (let tick = 1; tick <= 4; tick++) rerender({ target: B, tick });
    expect(asked).toEqual(["boom-bap"]);
  });
});
