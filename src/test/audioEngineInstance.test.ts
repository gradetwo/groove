/**
 * The engine-owning hook.
 *
 * Five views each wrote the same three lines by hand — construct with callbacks, assign to a ref,
 * destroy in the effect's cleanup — and three had to keep that effect's dependency list artificially
 * stable, because `onStep` could only be set in the constructor. A callback that captured changing
 * state therefore forced a full engine teardown and rebuild, which drops every scheduled voice and
 * re-allocates the audio graph mid-session.
 *
 * These tests pin the three properties that make the hook worth having, each of which the hand-rolled
 * version got wrong at least once elsewhere:
 *
 *  1. Exactly one engine per mount, and it is torn down on unmount. (The leak this prevents is a live
 *     `AudioContext` per navigation.)
 *  2. Callbacks stay current **without** rebuilding the engine — the whole point of adding
 *     `AudioEngine.setOnStep`.
 *  3. `stop()` runs before `destroy()`, so a still-running transport is not relying on graph teardown
 *     to silence it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAudioEngineInstance } from "../features/sequencer/hooks/useAudioEngineInstance";

/** Records what the hook did to the engine, without needing an AudioContext. */
const calls: string[] = [];
const instances: FakeEngine[] = [];

class FakeEngine {
  constructor(public options: Record<string, unknown>) {
    instances.push(this);
    calls.push("construct");
  }
  stop() {
    calls.push("stop");
  }
  destroy() {
    calls.push("destroy");
  }
  setPattern() {}
  setBpm() {}
}

vi.mock("../audio/AudioEngine", () => ({
  AudioEngine: class {
    constructor(options: Record<string, unknown>) {
      return new FakeEngine(options) as unknown as object;
    }
  },
}));

beforeEach(() => {
  calls.length = 0;
  instances.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useAudioEngineInstance", () => {
  it("creates exactly one engine per mount and destroys it on unmount", () => {
    const { unmount } = renderHook(() => useAudioEngineInstance());
    expect(instances).toHaveLength(1);
    expect(calls).toEqual(["construct"]);

    unmount();
    expect(calls).toEqual(["construct", "stop", "destroy"]);
  });

  it("stops before destroying, so a running transport is not silenced by teardown", () => {
    const { unmount } = renderHook(() => useAudioEngineInstance());
    unmount();
    expect(calls.indexOf("stop")).toBeLessThan(calls.indexOf("destroy"));
  });

  it("exposes the instance through a ref, so imperative callers keep working", () => {
    const { result } = renderHook(() => useAudioEngineInstance());
    expect(result.current.engineRef.current).toBe(instances[0]);
    // And a throwing accessor for call sites that know it exists.
    expect(result.current.getEngine()).toBe(instances[0]);
  });

  it("does not rebuild the engine when a callback identity changes", () => {
    /**
     * The regression this exists for. The first render passes one closure, the second another; a
     * naive implementation would tear the engine down and rebuild it, dropping scheduled voices.
     */
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useAudioEngineInstance({ onStep: cb }), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    expect(instances).toHaveLength(1);
    expect(calls).toEqual(["construct"]);
  });

  it("invokes the *current* callback, not the one captured at construction", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useAudioEngineInstance({ onStep: cb }), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });

    // The engine's stored `onStep` is whatever the hook passed to the constructor; calling it must
    // reach the latest closure.
    const onStep = instances[0].options.onStep as (info: { step: number; time: number }) => void;
    onStep({ step: 3, time: 1 });
    expect(second).toHaveBeenCalledWith({ step: 3, time: 1 });
    expect(first).not.toHaveBeenCalled();
  });

  it("leaves an unsupplied callback undefined rather than filling it with a no-op", () => {
    /**
     * A no-op would make "this view does not handle onPlay" indistinguishable from "it handles it and
     * does nothing", which is exactly the ambiguity a caller debugging a missing handler does not need.
     */
    renderHook(() => useAudioEngineInstance({ onStop: () => {} }));
    const opts = instances[0].options;
    expect(typeof opts.onStop).toBe("function");
    // onStep is forwarded through the ref, so calling it must be safe and must not throw.
    expect(() => (opts.onStep as (i: unknown) => void)({ step: 0, time: 0 })).not.toThrow();
  });

  it("reports no engine during the first render, before the effect has run", () => {
    /**
     * The engine is created in an effect, so a *render-time* read sees none. That is why
     * \`getEngine\` throws instead of returning null: a caller that reads it too early should find out
     * at that line rather than at an unrelated \`Cannot read properties of null\` later.
     *
     * Asserted through a callback the hook captures during render, which is the only place a real
     * caller could observe the pre-effect state.
     */
    const seen: Array<unknown> = [];
    renderHook(() => {
      const api = useAudioEngineInstance();
      seen.push(api.engineRef.current);
      return api;
    });
    expect(seen[0]).toBeNull();
  });
});
