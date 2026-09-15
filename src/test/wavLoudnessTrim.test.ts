import { describe, it, expect, afterEach } from "vitest";
import { renderPatternOffline } from "../audio/WavExporter";
import { getGenreLoudnessTrimDb } from "../data/genreMix";
import {
  FakeGainNode,
  FakeNode,
  FakeOfflineAudioContext,
  installFakeOfflineAudioContext,
} from "./helpers/fakeAudio";
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

    expect(masterGain.gain.value).toBeCloseTo(0.85, 10);
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
    expect(
      (FakeOfflineAudioContext.lastInstance!.createdGains[1] as FakeGainNode).gain.value
    ).toBeCloseTo(gainOf(6), 10);
  });

  it("uses unity gain for a custom/unknown genre", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern("custom-loudness-export"));
    expect(
      (FakeOfflineAudioContext.lastInstance!.createdGains[1] as FakeGainNode).gain.value
    ).toBeCloseTo(1, 10);
  });

  it("places the trim between the fader and the limiter (same order as the live engine)", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern("punk-rock"));
    const ctx = FakeOfflineAudioContext.lastInstance!;
    const masterGain = ctx.createdGains[0] as FakeGainNode;
    const trim = ctx.createdGains[1] as FakeGainNode;
    // `connect` records the source on the destination, so walking `incoming` proves
    // the exact order: masterGain -> trim -> limiter -> destination.
    const limiter = ctx.destination.incoming[0] as FakeNode;
    expect(trim.incoming).toContain(masterGain);
    expect(limiter.incoming).toContain(trim);
    expect(ctx.destination.incoming).toContain(limiter);
    expect(limiter).not.toBe(trim);
  });
});
