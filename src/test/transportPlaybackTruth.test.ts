/**
 * Playback must not claim success it cannot observe.
 *
 * The bug this pins: `handleTogglePlay` called the engine's async `play()` without awaiting it and
 * then set `isPlaying` unconditionally. `play()` awaits `ctx.resume()`, which rejects or simply
 * leaves the context suspended on iOS with the silent switch on, and on any browser that wants a
 * fresh user gesture. The result was a transport that lit up, a playhead that advanced, and no
 * sound — with the rejection unhandled, so nothing reported it either. Reported as "the app looks
 * like it is playing but there is no sound", which is the most damaging first impression a music
 * app can make.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTransportControls } from "../features/sequencer/hooks/useTransportControls";
import { LanguageProvider } from "../i18n/LanguageContext";
import { announcer } from "../platform/announcer";
import { AudioEngine } from "../audio/AudioEngine";
import { installFakeAudioContext } from "./helpers/fakeAudio";
import React from "react";

interface FakeEngine {
  play: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  /**
   * ⭐ **The transport's other half.** The Play/Pause button is painted Pause while it runs, so the press that ends a
   * run reaches `pause` — a double with only `stop` is a double that cannot answer the button a user is looking at.
   */
  pause: ReturnType<typeof vi.fn>;
  /**
   * ⭐ **Whether a stop would return the transport somewhere** — the fact the Stop control's disabled state reports.
   * The hook asks the engine after every transport action, so a double without it throws inside the handler.
   */
  canReturnToStart: ReturnType<typeof vi.fn<() => boolean>>;
  isAudioBlocked: ReturnType<typeof vi.fn>;
  /**
   * The transport writes these, so the double has to accept them.
   *
   * A missing one throws *inside* a handler, which reads as a failing assertion about the thing
   * under test rather than about the fake — the same shape of confusion a missing `isAudioBlocked`
   * caused (it was found while porting the phone's bottom control bar, whose criterion went with the
   * phone shell).
   */
  setBpm: ReturnType<typeof vi.fn>;
  setPattern: ReturnType<typeof vi.fn>;
  setSwing: ReturnType<typeof vi.fn>;
  setTimeSignature: ReturnType<typeof vi.fn>;
  setResolution: ReturnType<typeof vi.fn>;
  setDrumsOnly: ReturnType<typeof vi.fn>;
}

/**
 * A **complete** `FakeEngine`.
 *
 * Every method the transport writes has to exist here. A missing one throws *inside* a handler,
 * which surfaces as a failing assertion about the code under test rather than about the double —
 * the same shape of confusion a missing `isAudioBlocked` caused originally and a missing
 * `setPreviewScope` caused in the phone's bottom control bar before it was cut. Three harnesses in
 * this file used to build their own partial object; they now share this one so they cannot drift
 * apart again.
 */
function makeEngine(over: { blocked?: boolean; rejects?: boolean } = {}): FakeEngine {
  /**
   * The three transport facts the double has to keep consistent, because the behaviour under test is exactly their
   * relationship: `pause` keeps a position, `stop` throws it away, and `canReturnToStart` is the question the Stop
   * button's enabled state asks.
   */
  let running = false;
  let held = false;
  return {
    play: vi.fn(async () => {
      if (over.rejects) throw new Error("NotAllowedError: play() failed");
      running = true;
    }),
    stop: vi.fn(() => {
      running = false;
      held = false;
    }),
    pause: vi.fn(() => {
      running = false;
      held = true;
    }),
    canReturnToStart: vi.fn(() => running || held),
    isAudioBlocked: vi.fn(() => over.blocked ?? false),
    setBpm: vi.fn(),
    setPattern: vi.fn(),
    setSwing: vi.fn(),
    setTimeSignature: vi.fn(),
    setResolution: vi.fn(),
    setDrumsOnly: vi.fn(),
  };
}

const makeHarness = (over: { blocked?: boolean; rejects?: boolean } = {}) => {
  const engine = makeEngine(over);
  const setIsPlaying = vi.fn();
  const clearPlayhead = vi.fn();
  const showToast = vi.fn();
  const releasePreviewScope = vi.fn();
  const commit = vi.fn();
  /** Mutable: a test flips a mode between two calls to see both edges of a toggle. */
  const seqState = {
    current: { isMetronome: false, isCountIn: false, songMode: false, blindTestMode: false } as never,
  };

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(LanguageProvider, null, children);

  const { result } = renderHook(
    () =>
      useTransportControls({
        engineRef: { current: engine as never },
        seqStateRef: seqState,
        isPlaying: false,
        setIsPlaying,
        setIsDrumsOnly: vi.fn(),
        clearPlayhead,
        commit,
        undo: vi.fn(() => null),
        redo: vi.fn(() => null),
        isZh: false,
        showToast,
        releasePreviewScope,
      }),
    { wrapper }
  );
  return {
    engine,
    setIsPlaying,
    clearPlayhead,
    showToast,
    releasePreviewScope,
    commit,
    seqState,
    result,
  };
};

beforeEach(() => vi.clearAllMocks());

describe("transport playback truthfulness", () => {
  it("awaits play() before reporting playback as started", async () => {
    const { engine, setIsPlaying, result } = makeHarness();
    await act(async () => {
      await result.current.handleTogglePlay();
    });
    expect(engine.play).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(setIsPlaying).toHaveBeenCalledWith(true));
  });

  it("releases a leftover piano-roll lane scope before the arrangement starts", async () => {
    // The audio half of this is `AudioEngine.play()` clearing the scope (pinned in
    // `pianoRollPreview.test.ts`). This pins the other half: the roll's own preview state has to be
    // released in the same breath, or its toggle stays lit over a scope that no longer exists.
    const { releasePreviewScope, result } = makeHarness();
    expect(releasePreviewScope).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.handleTogglePlay();
    });
    expect(releasePreviewScope).toHaveBeenCalledTimes(1);
  });

  it("stops and reports instead of showing playback when audio is blocked", async () => {
    // The silent-switch case: `play()` resolves, the schedulers start, nothing is audible.
    const { engine, setIsPlaying, clearPlayhead, showToast, result } = makeHarness({ blocked: true });
    await act(async () => {
      await result.current.handleTogglePlay();
    });
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    // Never claims to be playing...
    expect(setIsPlaying).not.toHaveBeenCalledWith(true);
    // ...stops the scheduler that would otherwise run silently...
    expect(engine.stop).toHaveBeenCalled();
    expect(clearPlayhead).toHaveBeenCalled();
    // ...and the message is a real one, not an empty string.
    const message = showToast.mock.calls[0][0] as string;
    expect(message.length).toBeGreaterThan(10);
  });

  it("survives a rejected play() without reporting playback", async () => {
    const { setIsPlaying, clearPlayhead, engine, result } = makeHarness({ rejects: true, blocked: true });
    await act(async () => {
      await result.current.handleTogglePlay();
    });
    // The rejection is caught (no unhandled rejection) and the honest blocked path runs.
    await waitFor(() => expect(engine.stop).toHaveBeenCalled());
    expect(setIsPlaying).not.toHaveBeenCalledWith(true);
    expect(clearPlayhead).toHaveBeenCalled();
  });

  /**
   * ⭐ **The owner's report, at the hook that acts on the press.**
   *
   * The button is labelled Pause while the transport runs. This press used to call `engine.stop()` and
   * `clearPlayhead()`, so the transport went back to bar one under a button that had promised a pause — reported as
   * "it becomes Pause while playing, but pressing Pause is a stop and the playhead returns to the top". It reaches
   * `pause` now, and the playhead is deliberately **not** cleared: it is the picture of the position being kept.
   */
  it("pauses cleanly when toggled off, and holds the playhead", async () => {
    const engine = makeEngine();
    const setIsPlaying = vi.fn();
    const clearPlayhead = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(LanguageProvider, null, children);
    const { result } = renderHook(
      () =>
        useTransportControls({
          engineRef: { current: engine as never },
          seqStateRef: { current: { isMetronome: false, isCountIn: false } as never },
          isPlaying: true,
          setIsPlaying,
          setIsDrumsOnly: vi.fn(),
          clearPlayhead,
          commit: vi.fn(),
          undo: vi.fn(() => null),
          redo: vi.fn(() => null),
          isZh: false,
          showToast: vi.fn(),
        }),
      { wrapper }
    );
    await act(async () => {
      await result.current.handleTogglePlay();
    });
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(engine.stop).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
    expect(setIsPlaying).toHaveBeenCalledWith(false);
    // The position is the thing a pause keeps, so nothing may rewind it.
    expect(clearPlayhead).not.toHaveBeenCalled();
  });

  it("says the engine is not ready instead of staying silent", async () => {
    // U7: this used to return without a word, so the first Play press looked like a dead button.
    const setIsPlaying = vi.fn();
    const showToast = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(LanguageProvider, null, children);
    const { result } = renderHook(
      () =>
        useTransportControls({
          engineRef: { current: null },
          seqStateRef: { current: { isMetronome: false, isCountIn: false } as never },
          isPlaying: false,
          setIsPlaying,
          setIsDrumsOnly: vi.fn(),
          clearPlayhead: vi.fn(),
          commit: vi.fn(),
          undo: vi.fn(() => null),
          redo: vi.fn(() => null),
          isZh: false,
          showToast,
        }),
      { wrapper }
    );
    await act(async () => {
      await result.current.handleTogglePlay();
    });
    expect(setIsPlaying).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(String(showToast.mock.calls[0][0]).length).toBeGreaterThan(10);
  });
});

/**
 * U7: **a control that does nothing must say so.**
 *
 * Four mode toggles changed state without a word, the first tap of a two-tap tempo reading was
 * silent, and an empty undo history was indistinguishable from a broken button — all reported as
 * "点了没反应". Each of these handlers now reports what it did through `showToast` *and* the
 * screen-reader `announcer`, which is the same pair the drums-only toggle already used.
 *
 * The assertions are language-independent on purpose: the suite runs under whichever language the
 * environment resolves, so what is pinned is that a message exists, that the two edges of a toggle
 * differ, and that the store action carries the right payload.
 */
describe("transport feedback · a control that does nothing still says something", () => {
  let announced: string[] = [];
  beforeEach(() => {
    announced = [];
    announcer.setListener((message) => announced.push(message));
  });
  afterEach(() => announcer.clearListener());

  it("asks for a second tap on the first tap of tap tempo, and reports the tempo on the second", () => {
    const { result, showToast, commit } = makeHarness();

    act(() => result.current.handleTapTempo());
    expect(commit).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(announced).toHaveLength(1);

    act(() => result.current.handleTapTempo());
    expect(commit).toHaveBeenCalledWith({ type: "SET_BPM", bpm: expect.any(Number) });
    expect(showToast).toHaveBeenCalledTimes(2);
    // The second message carries the measured value; the first asked for another tap.
    expect(String(showToast.mock.calls[1][0])).toMatch(/\d/);
    expect(String(showToast.mock.calls[0][0])).not.toBe(String(showToast.mock.calls[1][0]));
    expect(announced).toHaveLength(2);
  });

  it("says there is nothing to undo, and nothing to redo", () => {
    const { result, showToast } = makeHarness();
    act(() => result.current.handleUndo());
    act(() => result.current.handleRedo());
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(String(showToast.mock.calls[0][0])).not.toBe(String(showToast.mock.calls[1][0]));
    expect(announced).toHaveLength(2);
  });

  it("reports the metronome's new state on both edges", () => {
    const { result, showToast, commit, seqState } = makeHarness();
    act(() => result.current.handleToggleMetronome());
    expect(commit).toHaveBeenLastCalledWith({ type: "SET_METRONOME", enabled: true });

    seqState.current = { ...(seqState.current as object), isMetronome: true } as never;
    act(() => result.current.handleToggleMetronome());
    expect(commit).toHaveBeenLastCalledWith({ type: "SET_METRONOME", enabled: false });

    expect(showToast).toHaveBeenCalledTimes(2);
    expect(String(showToast.mock.calls[0][0])).not.toBe(String(showToast.mock.calls[1][0]));
    expect(announced).toHaveLength(2);
  });

  it("reports the count-in's new state on both edges", () => {
    const { result, showToast, commit, seqState } = makeHarness();
    act(() => result.current.handleToggleCountIn());
    expect(commit).toHaveBeenLastCalledWith({ type: "SET_COUNT_IN", enabled: true });
    seqState.current = { ...(seqState.current as object), isCountIn: true } as never;
    act(() => result.current.handleToggleCountIn());
    expect(commit).toHaveBeenLastCalledWith({ type: "SET_COUNT_IN", enabled: false });
    expect(String(showToast.mock.calls[0][0])).not.toBe(String(showToast.mock.calls[1][0]));
    expect(announced).toHaveLength(2);
  });

  it("reports song mode's new state on both edges", () => {
    const { result, showToast, commit, seqState } = makeHarness();
    act(() => result.current.handleToggleSongMode());
    expect(commit).toHaveBeenLastCalledWith({ type: "TOGGLE_SONG_MODE" });
    seqState.current = { ...(seqState.current as object), songMode: true } as never;
    act(() => result.current.handleToggleSongMode());
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(String(showToast.mock.calls[0][0])).not.toBe(String(showToast.mock.calls[1][0]));
    expect(announced).toHaveLength(2);
  });

  it("reports blind compare's new state on both edges", () => {
    const { result, showToast, commit, seqState } = makeHarness();
    act(() => result.current.handleToggleBlindCompare());
    expect(commit).toHaveBeenLastCalledWith({ type: "TOGGLE_BLIND_TEST" });
    seqState.current = { ...(seqState.current as object), blindTestMode: true } as never;
    act(() => result.current.handleToggleBlindCompare());
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(String(showToast.mock.calls[0][0])).not.toBe(String(showToast.mock.calls[1][0]));
    expect(announced).toHaveLength(2);
  });
});

/**
 * The blocked state has to be *detectable*, not inferred.
 *
 * `play()` resolving is not evidence that sound is coming out: on iOS with the silent switch on it
 * resolves while the context stays suspended. These assertions pin the signal the transport reads
 * before it is allowed to say "playing".
 */
describe("AudioEngine.isAudioBlocked", () => {
  it("reports blocked before audio has ever been initialised", () => {
    const engine = new AudioEngine();
    expect(engine.isAudioBlocked()).toBe(true);
  });

  it("reports not blocked while the context is running", () => {
    const restore = installFakeAudioContext();
    try {
      const engine = new AudioEngine();
      (engine as unknown as { initAudioContext: () => void }).initAudioContext();
      const ctx = (engine as unknown as { ctx: AudioContext }).ctx;
      ctx.resume();
      expect(ctx.state).toBe("running");
      expect(engine.isAudioBlocked()).toBe(false);
    } finally {
      restore();
    }
  });

  it("reports blocked while the context is suspended, which is the silent-switch case", () => {
    const restore = installFakeAudioContext();
    try {
      const engine = new AudioEngine();
      (engine as unknown as { initAudioContext: () => void }).initAudioContext();
      const ctx = (engine as unknown as { ctx: AudioContext }).ctx;
      // A context that refuses to resume — exactly what the silent switch / missing gesture does.
      ctx.suspend();
      expect(ctx.state).toBe("suspended");
      expect(engine.isAudioBlocked()).toBe(true);
    } finally {
      restore();
    }
  });
});

/**
 * ⭐ **The control a real Pause made necessary.**
 *
 * While Pause was secretly a stop, "return to the top" was reachable from the Play/Pause button — under the wrong name
 * and with the wrong meaning. Once that press became a genuine pause (it keeps the step, and the next Play continues
 * from it), the studio had no control that rewound at all: a toggle has no second press that can do it. Stop is that
 * control, and these are its two obligations — it does the rewind, and it is dead when there is nothing to rewind.
 */
describe("the studio's Stop control", () => {
  it("has nothing to do on a fresh transport, and is live once the transport is running", async () => {
    const { engine, result } = makeHarness();
    // A transport at the top with nothing held: a live Stop here is exactly the button U7 forbids.
    expect(result.current.canStop).toBe(false);

    await act(async () => {
      await result.current.handleTogglePlay();
    });
    expect(engine.play).toHaveBeenCalledTimes(1);
    // Running: a stop would return to the top, so the control is live.
    expect(result.current.canStop).toBe(true);
  });

  it("stays live across a pause — the held position is what it returns from — and goes dead after it stops", async () => {
    const engine = makeEngine();
    const setIsPlaying = vi.fn();
    const clearPlayhead = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(LanguageProvider, null, children);
    const { result } = renderHook(
      () =>
        useTransportControls({
          engineRef: { current: engine as never },
          seqStateRef: { current: { isMetronome: false, isCountIn: false } as never },
          // The transport is running, which is what the second press of the toggle means.
          isPlaying: true,
          setIsPlaying,
          setIsDrumsOnly: vi.fn(),
          clearPlayhead,
          commit: vi.fn(),
          undo: vi.fn(() => null),
          redo: vi.fn(() => null),
          isZh: false,
          showToast: vi.fn(),
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleTogglePlay();
    });
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(engine.stop).not.toHaveBeenCalled();
    // ⭐ A pause leaves a position behind, so Stop is *still* meaningful — this is the state the reported build could
    // not express, because its pause was a stop and the transport was already back at the top.
    expect(result.current.canStop).toBe(true);

    act(() => {
      result.current.handleStop();
    });
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(setIsPlaying).toHaveBeenCalledWith(false);
    // Clearing the playhead belongs *here* — Stop is the control that rewinds, which is why it was wrong on pause.
    expect(clearPlayhead).toHaveBeenCalled();
    expect(result.current.canStop).toBe(false);
  });
});
