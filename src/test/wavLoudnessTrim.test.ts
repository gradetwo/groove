import { describe, it, expect, afterEach } from "vitest";
import { renderPatternOffline } from "../audio/WavExporter";
import { getGenreLoudnessTrimDb, LOUDNESS_TRIM_MAX_DB } from "../data/genreMix";
import {
  FakeGainNode,
  FakeNode,
  FakeOfflineAudioContext,
  installFakeOfflineAudioContext,
} from "./helpers/fakeAudio";
import { MASTER_FADER_DEFAULT } from "../audio/masterGraph";
import type { SequencerPattern } from "../types/genre";

/**
 * Exporter parity for the genre loudness trim: a bounced master must sit at the same
 * level as the audition the user just heard, so the offline chain applies the same
 * gain in the same relative position (fader -> trim -> limiter -> out).
 */
function makePattern(genreId = "chicago-house"): SequencerPattern {
  const steps = new Array(16).fill(0);
  steps[0] = 1;
  return {
    genre_id: genreId,
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: 16,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        instrument: "drum",
        steps: [...steps],
        velocity: new Array(16).fill(100),
        pitch: new Array(16).fill(0),
        gate: new Array(16).fill(0.8),
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
      },
    ],
  } as unknown as SequencerPattern;
}

const gainOf = (db: number) => Math.pow(10, db / 20);

describe("offline renderer · genre loudness trim", () => {
  let restore: () => void;

  afterEach(() => {
    restore?.();
  });

  it("derives the genre's trim when the caller does not pass one", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern("chicago-house"));
    const ctx = FakeOfflineAudioContext.lastInstance!;
    const masterGain = ctx.createdGains[0] as FakeGainNode;
    const trim = ctx.createdGains[1] as FakeGainNode;

    // E-17 / N-16: the exporter used to run its own 0.85 fader while playback used 0.8 —
    // an unrelated ~0.5 dB offset between what the user heard and what they downloaded.
    // Both now come from the shared graph's `MASTER_FADER_DEFAULT`.
    expect(masterGain.gain.value).toBeCloseTo(MASTER_FADER_DEFAULT, 10);
    expect(trim.gain.value).toBeCloseTo(gainOf(getGenreLoudnessTrimDb("chicago-house")), 10);
  });

  it("honours an explicit trim option and clamps it to the documented range", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern("chicago-house"), { loudnessTrimDb: -6 });
    expect((FakeOfflineAudioContext.lastInstance!.createdGains[1] as FakeGainNode).gain.value).toBeCloseTo(
      gainOf(-6),
      10
    );

    restore();
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern("chicago-house"), { loudnessTrimDb: 99 });
    // Derived from the constant rather than hard-coded: the ceiling moved from +6 to +9
    // when the per-genre FX work widened the library's extremes, and a literal here would
    // have to be remembered every time.
    expect(
      (FakeOfflineAudioContext.lastInstance!.createdGains[1] as FakeGainNode).gain.value
    ).toBeCloseTo(gainOf(LOUDNESS_TRIM_MAX_DB), 10);
  });

  it("uses unity gain for a custom/unknown genre", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern("custom-loudness-export"));
    expect(
      (FakeOfflineAudioContext.lastInstance!.createdGains[1] as FakeGainNode).gain.value
    ).toBeCloseTo(1, 10);
  });

  it("places the trim after the FX rack and before the limiter (same order as the live engine)", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern("punk-rock"));
    const ctx = FakeOfflineAudioContext.lastInstance!;
    const masterGain = ctx.createdGains[0] as FakeGainNode;
    const trim = ctx.createdGains[1] as FakeGainNode;

    // `connect` records the source on each destination, so the order is provable
    // structurally rather than by array index.
    const consumersOf = (node: FakeNode): FakeNode[] =>
      (ctx.createdGains as unknown as FakeNode[]).filter((g) => g.incoming.includes(node));

    // The fader feeds the FX rack, *not* the trim: the trim is the last linear stage and
    // must sit after the rack, or the rack's saturation absorbs the loudness correction
    // (measured: a +7.07 dB request produced +1.74 dB of integrated loudness).
    // Q12: the master DC blocker (a highpass biquad) sits between the two, so the fader's
    // consumer is that filter rather than a gain node.
    const faderFilterConsumers = (ctx.createdFilters as unknown as FakeNode[]).filter((f) =>
      f.incoming.includes(masterGain)
    );
    expect(faderFilterConsumers.length).toBe(1);
    const faderConsumers = consumersOf(masterGain);
    expect(faderConsumers).not.toContain(trim);

    // The rack feeds the trim: its only consumer among gain nodes is the trim stage.
    expect(consumersOf(trim)).not.toContain(ctx.destination as unknown as FakeNode);
    expect(trim.incoming.length).toBeGreaterThan(0);
    expect(trim.incoming).not.toContain(masterGain);

    // And everything the trim feeds is upstream of the destination.
    const ancestorsOfDestination = new Set<FakeNode>();
    const walk = (node: FakeNode) => {
      for (const source of node.incoming) {
        if (!ancestorsOfDestination.has(source)) {
          ancestorsOfDestination.add(source);
          walk(source);
        }
      }
    };
    walk(ctx.destination as unknown as FakeNode);
    expect(ancestorsOfDestination.has(masterGain)).toBe(true);
    expect(ancestorsOfDestination.has(trim)).toBe(true);
    // The trim is a distinct stage from the fader — they must not be the same node.
    expect(trim).not.toBe(masterGain);
  });
});
