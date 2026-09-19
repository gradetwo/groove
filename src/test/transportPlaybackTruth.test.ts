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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTransportControls } from "../features/sequencer/hooks/useTransportControls";
import { LanguageProvider } from "../i18n/LanguageContext";
import { AudioEngine } from "../audio/AudioEngine";
import { installFakeAudioContext } from "./helpers/fakeAudio";
import React from "react";

interface FakeEngine {
  play: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  isAudioBlocked: ReturnType<typeof vi.fn>;
}

const makeHarness = (over: { blocked?: boolean; rejects?: boolean } = {}) => {
  const engine: FakeEngine = {
    play: vi.fn(async () => {
      if (over.rejects) throw new Error("NotAllowedError: play() failed");
    }),
    stop: vi.fn(),
    isAudioBlocked: vi.fn(() => over.blocked ?? false),
  };
  const setIsPlaying = vi.fn();
  const clearPlayhead = vi.fn();
  const showToast = vi.fn();
  const releasePreviewScope = vi.fn();

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(LanguageProvider, null, children);

  const { result } = renderHook(
    () =>
      useTransportControls({
        engineRef: { current: engine as never },
        seqStateRef: { current: { isMetronome: false, isCountIn: false } as never },
        isPlaying: false,
        setIsPlaying,
        setIsDrumsOnly: vi.fn(),
        clearPlayhead,
        commit: vi.fn(),
        undo: vi.fn(() => null),
        redo: vi.fn(() => null),
        isZh: false,
        showToast,
        releasePreviewScope,
      }),
    { wrapper }
  );
  return { engine, setIsPlaying, clearPlayhead, showToast, releasePreviewScope, result };
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

  it("still stops cleanly when toggled off", async () => {
    const engine: FakeEngine = { play: vi.fn(), stop: vi.fn(), isAudioBlocked: vi.fn(() => false) };
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
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(engine.play).not.toHaveBeenCalled();
    expect(setIsPlaying).toHaveBeenCalledWith(false);
    expect(clearPlayhead).toHaveBeenCalled();
  });

  it("does nothing when the engine is not ready", async () => {
    const setIsPlaying = vi.fn();
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
          showToast: vi.fn(),
        }),
      { wrapper }
    );
    await act(async () => {
      await result.current.handleTogglePlay();
    });
    expect(setIsPlaying).not.toHaveBeenCalled();
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
