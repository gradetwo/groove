/**
 * Stopping the transport has to stop the **clock**, not just the sound.
 *
 * `pause()`/`stop()` both reach `stopScheduler()` (`AudioEngine.ts:2017`), the one place the engine tears
 * its timing down: `workletClock.stop()` releases the AudioWorklet bridge (or, here, its Worker→timer
 * fallback) and `clearInterval(this.scheduleTimerId)` kills the 40 ms watchdog armed by `startScheduler()`
 * (`:2011`). Leave either running and the audio chain keeps scheduling after the user pressed stop — a
 * battery and "why is it still going" bug on a phone, and one the UI cannot show, because `isPlaying` is
 * false either way.
 *
 * No criterion pinned it: before this file, a search of `src/test/` for `stopScheduler`,
 * `scheduleTimerId` and `workletClock.stop` returned nothing. The teardown was correct when this file was
 * written; the file exists so a later edit cannot quietly drop half of it.
 *
 * Deterministic by construction: it counts calls and reads state, never wall-clock. The engine is built on
 * the existing fake-AudioContext seam (`installFakeAudioContext`), whose context has no `audioWorklet`, so
 * the clock takes the real Worker→`setInterval` fallback path jsdom can actually drive.
 *
 * Not covered here: whether the worklet/worker stops emitting ticks (there is no audio thread in jsdom),
 * and `destroy()`'s further teardown (`:3236`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { AudioWorkletClock } from "../audio/AudioWorkletClock";
import { installFakeAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";

/** Minimal deterministic pattern: 120 BPM, 16 steps, one kick onset every 4th step. */
function makePattern(): SequencerPattern {
  const steps = 16;
  return {
    genre_id: "scheduler-teardown",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
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

describe("transport teardown · stop() kills the clock and the watchdog", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    restore = installFakeAudioContext();
  });

  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  it("stop() stops the worklet clock and clears the scheduling interval", async () => {
    const clockStop = vi.spyOn(AudioWorkletClock.prototype, "stop");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const engine = new AudioEngine();
    try {
      engine.setPattern(makePattern());
      await engine.play();

      // `play()` armed the watchdog and remembered its id; nothing has stopped it yet.
      const timerId = (engine as unknown as { scheduleTimerId: unknown }).scheduleTimerId;
      expect(timerId).toBeTruthy();
      const startedIds: unknown[] = setIntervalSpy.mock.results.map((r) => r.value as unknown);
      expect(startedIds).toContain(timerId);

      engine.stop();

      // 1. The clock bridge was told to stop — this is what releases the worklet/worker/timer fallback.
      expect(clockStop).toHaveBeenCalled();
      // 2. The exact interval `play()` armed was cleared, and the engine dropped the handle.
      expect(clearIntervalSpy).toHaveBeenCalledWith(timerId);
      expect((engine as unknown as { scheduleTimerId: unknown }).scheduleTimerId).toBeNull();
      // 3. No interval started during the run is still live — caught the clock's own fallback timer too.
      const clearedIds = clearIntervalSpy.mock.calls.map((c) => c[0] as unknown);
      const liveIds = startedIds.filter((id) => !clearedIds.includes(id));
      expect(liveIds).toEqual([]);
    } finally {
      engine.destroy();
    }
  });
});
