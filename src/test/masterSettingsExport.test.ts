/**
 * ⭐ **An export has to master the way the project says, not the way the graph's constants say.**
 *
 * The live engine was sorted out first (`masterSettingsEngine.test.ts`), and the same defect existed in the file: the
 * exporter passed `masterBusCompThresholdDb` and its neighbours straight from its own options, so those nine values
 * came from the graph's build-time constants unless a diagnostic named one. A project could therefore sound one way in
 * the room and another in the file it exported — the loudness-mismatch class of bug the exporter's own comments record.
 *
 * **Why this reads the builder's options rather than the samples.** The first attempt at a sample-level criterion
 * rendered a real `node-web-audio-api` context through `buildMasterGraph` and measured the peak: it was exactly
 * `0.00000` with **zero** non-zero samples of 220 500, at ceilings of −1, −12 and −20 dB and over five seconds, while
 * the same context rendered a bare oscillator at 0.5. So the graph's output is silent under this harness for a reason
 * that is not the setting — a finding worth writing down rather than working around — and a criterion that measured
 * samples would be measuring that silence. What is asserted instead is the option object the exporter hands the builder,
 * which is the whole of the plumbing this change adds and is read from the real call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";

const { buildMasterGraphSpy } = vi.hoisted(() => ({ buildMasterGraphSpy: vi.fn() }));

vi.mock("../audio/masterGraph", async () => {
  const actual = await vi.importActual<typeof import("../audio/masterGraph")>("../audio/masterGraph");
  return {
    ...actual,
    buildMasterGraph: (ctx: unknown, options: unknown) => {
      buildMasterGraphSpy(options);
      return (actual.buildMasterGraph as unknown as (c: unknown, o: unknown) => unknown)(ctx, options);
    },
  };
});

const { renderPatternOffline } = await import("../audio/WavExporter");
const { MASTER_DEFAULTS } = await import("../data/masterSettings");

/** One kick on every step of one bar, which is all this criterion needs from a pattern. */
function pattern(): SequencerPattern {
  const steps = new Array(16).fill(1);
  return {
    genre_id: "master-settings-export",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: 16,
    tracks: [
      { track_id: "kick", name: "Kick", instrument: "drum", steps, velocity: new Array(16).fill(100), pitch: new Array(16).fill(0) },
    ],
  } as unknown as SequencerPattern;
}

let restore: (() => void) | null = null;
beforeEach(() => {
  buildMasterGraphSpy.mockClear();
  restore = installFakeOfflineAudioContext();
});
afterEach(() => {
  restore?.();
  restore = null;
});

function optionsUsed(): Record<string, unknown> {
  expect(buildMasterGraphSpy, "the offline renderer built a master graph").toHaveBeenCalled();
  return buildMasterGraphSpy.mock.calls.at(-1)![0] as Record<string, unknown>;
}

describe("an export's mastering settings", () => {
  it("⭐ masters the file with the project's values, so the export matches what was heard", async () => {
    await renderPatternOffline(pattern(), {
      masterSettings: {
        busComp: { enabled: false, thresholdDb: -30, kneeDb: 14, ratio: 6, releaseSec: 0.6, makeupDb: -3 },
        limiter: { ceilingDb: -4, releaseFastMs: 90, releaseSlowMs: 700 },
      },
    });
    const used = optionsUsed();
    expect(used.masterBusCompThresholdDb, "the project's threshold, not MASTER_BUS_COMP_THRESHOLD_DB").toBe(-30);
    expect(used.masterBusCompKneeDb).toBe(14);
    expect(used.masterBusCompRatio).toBe(6);
    expect(used.masterBusCompReleaseSec).toBe(0.6);
    expect(used.masterMakeupDb).toBe(-3);
    expect(used.masterBusCompEnabled).toBe(false);
    expect(used.limiterCeilingDb, "the ceiling the project set, not the limiter's own constant").toBe(-4);
    expect(used.limiterReleaseFastMs).toBe(90);
    expect(used.limiterReleaseSlowMs).toBe(700);
  });

  it("⭐ lets a single-value diagnostic still win, so the settings block stays additive", async () => {
    await renderPatternOffline(pattern(), {
      limiterCeilingDb: -9,
      masterSettings: { limiter: { ceilingDb: -4 } },
    });
    // The named option is the more specific request, so it beats the block rather than being silently overridden.
    expect(optionsUsed().limiterCeilingDb).toBe(-9);
  });

  it("⭐ states nothing when the project says nothing, so an old export is byte-for-byte what it was", async () => {
    // ⭐ **Additivity is the property.** This option must not inject defaults: the exporter reads nine individual
    // options, and a caller that passes no settings has to behave exactly as before. A criterion caught the first
    // version doing the opposite (`limiterReleaseOptions.test.ts`: a release time that stayed `undefined`, so the
    // processor kept its own default, became the block's 60 ms). The defaults still reach the graph — from the graph's
    // own constants — so an untouched project renders as it always did.
    await renderPatternOffline(pattern());
    const used = optionsUsed();
    expect(used.limiterCeilingDb, "absent means the graph decides, not this option").toBeUndefined();
    expect(used.masterBusCompThresholdDb).toBeUndefined();
    expect(MASTER_DEFAULTS.busComp.thresholdDb, "and the graph's constants are still the defaults, pinned elsewhere").toBe(-16);
  });

  it("⭐ clamps a hand-edited project on the way in, so a file cannot ask for more than the DSP honours", async () => {
    await renderPatternOffline(pattern(), { masterSettings: { limiter: { ceilingDb: 12 } } });
    // A ceiling above 0 dBTP would clip, which is the one thing the ceiling exists to prevent. The clamp happens in
    // `statedMasterSettings`, which is where a file's values are read, and it is visible in what the graph is handed.
    expect(optionsUsed().limiterCeilingDb).toBe(0);
  });
});
