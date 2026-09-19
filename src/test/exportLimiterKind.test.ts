/**
 * The export reports which master limiter it actually used.
 *
 * `createMasterLimiter` prefers an `AudioWorkletNode` and silently falls back to a
 * `DynamicsCompressor` when the module cannot load. Silent is the problem: forcing the fallback
 * measures the export **2.36 dB louder overall and 4.83 dB off in one band** (appendix G.14), so an
 * export that took that path is not the file the user just auditioned.
 *
 * These tests pin the *report*, not the fallback: the fallback itself is a deliberate safety net
 * (audio must never be un-ceilinged), and what this project forbids is claiming success the caller
 * cannot observe. `exportMasterWav` therefore has to carry the kind out, and the sequencer's export
 * action has to say something when it is `"fallback"`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { exportMasterWav, renderPatternOffline } from "../audio/WavExporter";
import type { DrumPattern } from "../types/genre";
import { installFakeOfflineAudioContext } from "./helpers/fakeAudio";

const PATTERN: DrumPattern = {
  genre_id: "deep-house",
  bpm: 124,
  swing: 0,
  scale: "minorPentatonic",
  tracks: [
    { name: "Kick", track_id: "kick", instrument: "kick", steps: [1, 0, 0, 0], volume: 0.9, pan: 0 },
    { name: "Snare", track_id: "snare", instrument: "snare", steps: [0, 0, 1, 0], volume: 0.8, pan: 0 },
  ],
};

describe("the export reports its master limiter", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("reports a kind at all, and reports the one the graph got", async () => {
    restore = installFakeOfflineAudioContext();

    /**
     * `AudioWorkletNode` does not exist in this environment, so `audioWorkletAvailable` is false and
     * every limiter here is the compressor fallback. That is exactly the state the report exists to
     * expose — and it is the state this environment can produce deterministically, unlike the
     * worklet path.
     */
    const result = await exportMasterWav(PATTERN, "deep-house", { bpm: 124 });
    expect(result.limiterKind).toBe("fallback");

    // The low-level option is what carries it, so it has to agree with the convenience wrapper.
    let reported: string | null = null;
    await renderPatternOffline(PATTERN, {
      bpm: 124,
      onLimiterKind: (kind) => {
        reported = kind;
      },
    });
    expect(reported).toBe("fallback");
  });

  it("still returns a usable file when the limiter is degraded", async () => {
    // The report must not turn a degradation into a failure: the WAV is valid and the user keeps it.
    restore = installFakeOfflineAudioContext();
    const result = await exportMasterWav(PATTERN, "deep-house", { bpm: 124 });
    expect(result.blob).toBeTruthy();
    // Hyphens are explicitly allowed by the filename sanitiser, so the genre id keeps its own.
    expect(result.filename).toBe("deep-house_master_124bpm.wav");
    expect(result.durationSec).toBeGreaterThan(0);
  });
});
