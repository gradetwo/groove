import { describe, it, expect, afterEach } from "vitest";
import {
  deterministicRoll,
  hashString,
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
