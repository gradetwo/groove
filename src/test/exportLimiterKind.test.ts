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
import { setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";

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

/**
 * A GS-1 voice that cannot load must not change the render *silently*.
 *
 * `createGs1Host` fetches the WASM core over the network and loads a worklet module, so its failure
 * is transient by nature — and it used to be a bare `catch` that left the track on the native synth
 * for that render only. Measured on `chicago-house` (3 bars, fingerprint delta against a clean
 * render): one GS-1 host failing moves the sound by **0.71 dB** in band 6 for the chords track and
 * **3.66 dB** in band 9 for the lead, which is the magnitude and the genre-dependent spread of the
 * rare repeat-render outliers in appendix G.14. The export's sound depended on whether a fetch won a
 * race, and said nothing.
 *
 * This environment cannot load a GS-1 host at all — there is no WASM core to fetch and no real
 * worklet — so these two tests are the *reported* half of the contract: a render whose GS-1 voices
 * could not load says how many, and a render that never routed anything says zero. The retry count
 * itself is pinned in `gs1HostRetry.test.ts`, where the host is mocked so attempts can be counted.
 */
describe("a GS-1 voice that could not load is reported", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
    setGs1RoutingEnabled(true);
  });

  /** A genre whose tracks really are GS-1-routed, so the failure path is reachable at all. */
  const GS1_PATTERN: DrumPattern = {
    genre_id: "chicago-house",
    bpm: 124,
    swing: 0,
    scale: "minorPentatonic",
    tracks: [
      { name: "Chords", track_id: "chords", instrument: "m1_organ", steps: [1, 0, 0, 0], volume: 0.8, pan: 0 },
      { name: "Lead", track_id: "lead", instrument: "saw_lead", steps: [1, 0, 0, 0], volume: 0.8, pan: 0 },
    ],
  };

  it("counts every routed track whose host could not load", async () => {
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(true);
    const result = await exportMasterWav(GS1_PATTERN, "chicago-house", { bpm: 124 });
    // Both tracks are GS-1-routed and neither host can load here.
    expect(result.gs1HostFailures).toBe(2);
  });

  it("reports nothing when GS-1 routing is off, because then nothing is lost", async () => {
    /**
     * The counterpart assertion, and the reason the count is not simply "the number of routed
     * tracks": with routing off, `gs1PatchFor` returns null for everything, nothing is attempted, and
     * nothing is degraded — so a hard-coded count would be wrong here.
     */
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(false);
    const result = await exportMasterWav(GS1_PATTERN, "chicago-house", { bpm: 124 });
    expect(result.gs1HostFailures).toBe(0);
  });
});
