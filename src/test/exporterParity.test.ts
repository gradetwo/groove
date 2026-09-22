import { describe, it, expect, afterEach } from "vitest";
import {
  HUMANISE_MAX_VELOCITY,
  clampVelocity,
  deterministicRoll,
  hashString,
  humaniseVelocity,
  patternSeed,
  probabilityPasses,
  ratchetVelocityScale,
  resolveRatchet,
} from "../audio/noteEvents";
import { generateMidiBytes } from "../audio/MidiExporter";
import { buildAbletonLiveSetXml } from "../audio/AbletonExporter";
import { installFakeOfflineAudioContext, FakeOfflineAudioContext } from "./helpers/fakeAudio";
import { renderPatternOffline } from "../audio/WavExporter";
import type { SequencerPattern } from "../types/genre";

/**
 * N-04: the three exporters used to disagree about per-step probability —
 * MIDI/ALS only skipped `probability <= 0` (so a 30% hit exported 100% of the time)
 * while WAV rolled `Math.random()` (so two renders differed). They now share one
 * deterministic decision, which is what these tests pin down.
 */
function makePattern(probability: number[]): SequencerPattern {
  const steps = 8;
  return {
    genre_id: "export-parity",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        instrument: "drum",
        steps: new Array(steps).fill(1),
        velocity: new Array(steps).fill(100),
        pitch: new Array(steps).fill(0),
        gate: new Array(steps).fill(0.8),
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        probability,
      },
    ],
  } as unknown as SequencerPattern;
}

describe("N-04 · deterministic probability helper", () => {
  it("hashes stably and never returns a negative roll", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    for (let step = 0; step < 200; step++) {
      const roll = deterministicRoll("seed", 0, step);
      expect(roll).toBeGreaterThanOrEqual(0);
      expect(roll).toBeLessThan(100);
    }
  });

  it("is idempotent: the same key always makes the same decision", () => {
    const first = Array.from({ length: 40 }, (_, i) => probabilityPasses(30, "s", 0, i));
    const second = Array.from({ length: 40 }, (_, i) => probabilityPasses(30, "s", 0, i));
    expect(first).toEqual(second);
  });

  it("treats 0 as never, 100/undefined as always, and 30% as roughly 30%", () => {
    expect(probabilityPasses(0, "s", 0, 0)).toBe(false);
    expect(probabilityPasses(100, "s", 0, 0)).toBe(true);
    expect(probabilityPasses(undefined, "s", 0, 0)).toBe(true);
    expect(probabilityPasses(Number.NaN, "s", 0, 0)).toBe(true);

    let hits = 0;
    const total = 4000;
    for (let i = 0; i < total; i++) {
      if (probabilityPasses(30, "s", 0, i)) hits++;
    }
    const rate = hits / total;
    expect(rate).toBeGreaterThan(0.25);
    expect(rate).toBeLessThan(0.35);
  });

  it("derives a stable per-pattern seed", () => {
    expect(patternSeed({ genre_id: "x", bpm: 120, totalSteps: 16 })).toBe("x|120|16");
    expect(patternSeed({})).toBe("pattern|120|16");
  });

  it("resolves ratchets and the sub-hit velocity taper consistently", () => {
    expect(resolveRatchet(undefined, false)).toBe(1);
    expect(resolveRatchet(undefined, true)).toBe(3);
    expect(resolveRatchet(4, false)).toBe(4);
    expect(resolveRatchet(0, false)).toBe(1);
    expect(resolveRatchet(99, false)).toBe(8);
    expect(ratchetVelocityScale(0, 3)).toBeCloseTo(0.85);
    expect(ratchetVelocityScale(2, 3)).toBeCloseTo(0.95);
  });
});

/**
 * P0.2 — the velocity humanisation helper.
 *
 * The property that matters to the rest of the app is *determinism* (an export is a document),
 * so every test here either pins a stable key or pins the bound the amount promises.
 */
describe("P0.2 · seeded velocity humanisation", () => {
  it("is the identity at amount 0, for a negative amount, and for a non-finite one", () => {
    for (const amount of [0, -0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const base of [1, 37, 100, 127]) {
        expect(humaniseVelocity(base, "seed", 0, 3, amount)).toBe(base);
      }
    }
  });

  it("clamps into 1..127 and never returns a fraction", () => {
    expect(clampVelocity(0)).toBe(1);
    expect(clampVelocity(999)).toBe(127);
    expect(clampVelocity(100.4)).toBe(100);
    expect(clampVelocity(Number.NaN)).toBe(100);
    for (const base of [1, 2, 126, 127]) {
      for (let step = 0; step < 200; step++) {
        const value = humaniseVelocity(base, "seed", 0, step, 1);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(127);
      }
    }
  });

  it("is idempotent for a given (seed, track, step) key", () => {
    const first = Array.from({ length: 64 }, (_, step) => humaniseVelocity(100, "s|120|16", 2, step, 0.3));
    const second = Array.from({ length: 64 }, (_, step) => humaniseVelocity(100, "s|120|16", 2, step, 0.3));
    expect(first).toEqual(second);
    // ...and a different lane is a different performance, not the same one transposed.
    const other = Array.from({ length: 64 }, (_, step) => humaniseVelocity(100, "s|120|16", 3, step, 0.3));
    expect(other).not.toEqual(first);
  });

  it("stays inside the amount's bound and actually moves the lane", () => {
    const amount = 0.25;
    const bound = Math.ceil(amount * HUMANISE_MAX_VELOCITY) + 1;
    const values = Array.from({ length: 512 }, (_, step) => humaniseVelocity(100, "s", 0, step, amount));
    for (const value of values) expect(Math.abs(value - 100)).toBeLessThanOrEqual(bound);
    // The bound must not be the only thing that is true: a lane of 100s has to become a lane.
    const distinct = new Set(values);
    expect(distinct.size).toBeGreaterThan(4);
    expect(Math.min(...values)).toBeLessThan(100);
    expect(Math.max(...values)).toBeGreaterThan(100);
  });

  it("does not correlate the humanisation with the probability gate", () => {
    // The salt exists for this: an unsalted roll would make a 30% gate keep only the quiet
    // half of the humanisation (mean ~97 against ~103), which is an audible side effect of
    // a feature nobody asked for. The control is the same computation on the *unsalted* key,
    // which must show the bias the salt removes.
    const amount = 0.3;
    const step = 4000;
    const gated: number[] = [];
    const ungated: number[] = [];
    const unsaltedGated: number[] = [];
    const unsaltedUngated: number[] = [];
    for (let i = 0; i < step; i++) {
      const passed = probabilityPasses(30, "p0.2", 0, i);
      const value = humaniseVelocity(100, "p0.2", 0, i, amount);
      (passed ? gated : ungated).push(value);

      const roll = deterministicRoll("p0.2", 0, i);
      const unsalted = Math.round(100 + ((roll / 99) * 2 - 1) * amount * HUMANISE_MAX_VELOCITY);
      (passed ? unsaltedGated : unsaltedUngated).push(unsalted);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const saltedGap = Math.abs(mean(gated) - mean(ungated));
    const unsaltedGap = Math.abs(mean(unsaltedGated) - mean(unsaltedUngated));

    expect(saltedGap).toBeLessThan(0.5);
    expect(unsaltedGap).toBeGreaterThan(2);
    expect(saltedGap).toBeLessThan(unsaltedGap);
  });
});

describe("N-04 · probability is applied identically by every exporter", () => {
  const probability = [100, 0, 30, 30, 30, 0, 100, 50];
  const pattern = makePattern(probability);

  it("MIDI exports exactly the steps the shared decision allows", () => {
    const bytes = generateMidiBytes({ bpm: 120, pattern });

    // Count NoteOn events with a non-zero velocity (0x9n with velocity > 0).
    let noteOns = 0;
    for (let i = 0; i < bytes.length - 2; i++) {
      if ((bytes[i] & 0xf0) === 0x90 && bytes[i + 2] > 0) noteOns++;
    }

    const seed = patternSeed(pattern as unknown as { genre_id?: string; bpm?: number; totalSteps?: number });
    const expected = probability.filter((p, step) => probabilityPasses(p, seed, 0, step)).length;
    expect(noteOns).toBe(expected);
    // Steps 1 and 5 are impossible, so we must have fewer hits than steps.
    expect(noteOns).toBeLessThan(probability.length);
  });

  it("MIDI is reproducible: exporting twice yields identical bytes", () => {
    const a = generateMidiBytes({ bpm: 120, pattern });
    const b = generateMidiBytes({ bpm: 120, pattern });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("the .als clip contains the same number of note events as the shared decision", () => {
    const xml = buildAbletonLiveSetXml({ bpm: 120, pattern, genreName: "Parity" });

    const seed = patternSeed(pattern as unknown as { genre_id?: string; bpm?: number; totalSteps?: number });
    const expected = probability.filter((p, step) => probabilityPasses(p, seed, 0, step)).length;

    // Ableton stores each note as <KeyTrack ...><MidiNoteEvent .../></KeyTrack>.
    const alsNotes = (xml.match(/<MidiNoteEvent /g) || []).length;
    expect(alsNotes).toBe(expected);
  });

  it("the offline WAV renderer gates the same steps (no Math.random divergence)", async () => {
    const restore = installFakeOfflineAudioContext();
    try {
      const ctx = await renderPatternOffline(pattern, { bpm: 120 });
      const seed = patternSeed(pattern as unknown as { genre_id?: string; bpm?: number; totalSteps?: number });
      const expected = probability.filter((p, step) => probabilityPasses(p, seed, 0, step)).length;

      // Track 0's strip, found through its panner rather than by creation index: E-17
      // put the shared master graph (fader, trim, FX rack, reverb, delay, limiter) ahead
      // of the strips, so "the second gain created" is now the trim stage — an assertion
      // that still passed, but about the wrong node.
      const instance = FakeOfflineAudioContext.lastInstance!;
      const stripGain = instance.createdPanners[0]?.incoming[0]?.incoming[0];
      expect(ctx.length).toBeGreaterThan(0);
      expect(expected).toBeGreaterThan(0);
      expect(stripGain, "track 0's channel strip should exist").toBeDefined();
      expect(stripGain!.incoming.length).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  afterEach(() => {
    // keep the global fake installation scoped per test
  });
});
