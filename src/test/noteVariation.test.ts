/**
 * P2.2 / A3 — per-note timbre variation.
 *
 * The defect is a loop that repeats the same stab twelve times a bar: the synth is deterministic, so those twelve
 * hits are *identical* and the loop reads as a machine. These cases pin the three properties that make the nudge
 * safe to ship — it is bounded, it is seeded (the same pattern renders the same file), and it actually differs
 * between consecutive steps.
 */
import { describe, it, expect } from "vitest";
import {
  NOTE_VARIATION_MAX_CUTOFF_SCALE,
  NOTE_VARIATION_MAX_DETUNE_CENTS,
  polyVoiceVariation,
  variationSeedFrom,
} from "../audio/noteVariation";

describe("P2.2 · per-note timbre variation", () => {
  it("is bounded, so it is a nudge and not a pitch bend or a filter sweep", () => {
    for (let step = 0; step < 64; step += 1) {
      const variation = polyVoiceVariation(1234, 2, step, 1);
      expect(Math.abs(variation.detuneCents)).toBeLessThanOrEqual(NOTE_VARIATION_MAX_DETUNE_CENTS);
      expect(variation.cutoffScale).toBeGreaterThanOrEqual(1 - NOTE_VARIATION_MAX_CUTOFF_SCALE);
      expect(variation.cutoffScale).toBeLessThanOrEqual(1 + NOTE_VARIATION_MAX_CUTOFF_SCALE);
    }
  });

  it("is deterministic: the same note gets the same nudge, every render", () => {
    const a = polyVoiceVariation(987654, 3, 7, 2);
    const b = polyVoiceVariation(987654, 3, 7, 2);
    expect(a).toEqual(b);
    // …and `variationSeedFrom` is a pure function of the seed string, which is what makes a render reproducible.
    expect(variationSeedFrom("chicago-house|124|128")).toBe(variationSeedFrom("chicago-house|124|128"));
    expect(variationSeedFrom("chicago-house|124|128")).not.toBe(variationSeedFrom("disco|120|128"));
  });

  it("moves between consecutive steps, which is the whole point", () => {
    // Four-on-the-floor: the same chord on steps 0, 4, 8 and 12. Without a seed-dependent nudge they are identical.
    const detunes = [0, 4, 8, 12].map((step) => polyVoiceVariation(555, 1, step).detuneCents);
    const cutoffs = [0, 4, 8, 12].map((step) => polyVoiceVariation(555, 1, step).cutoffScale);
    expect(new Set(detunes.map((v) => v.toFixed(4))).size).toBe(4);
    expect(new Set(cutoffs.map((v) => v.toFixed(4))).size).toBe(4);
  });

  it("gives the voices inside one stab different nudges, so a chord does not move as a block", () => {
    const voices = [0, 1, 2, 3].map((note) => polyVoiceVariation(42, 1, 4, note).detuneCents);
    expect(new Set(voices.map((v) => v.toFixed(4))).size).toBe(4);
  });

  it("separates tracks and patterns, so two lanes do not share a nudge pattern", () => {
    const trackA = polyVoiceVariation(9, 0, 4).detuneCents;
    const trackB = polyVoiceVariation(9, 1, 4).detuneCents;
    const otherPattern = polyVoiceVariation(10, 0, 4).detuneCents;
    expect(trackA).not.toBe(trackB);
    expect(trackA).not.toBe(otherPattern);
  });

  it("degrades to no variation for a non-finite seed instead of producing NaN", () => {
    const variation = polyVoiceVariation(Number.NaN, 0, 0);
    expect(Number.isFinite(variation.detuneCents)).toBe(true);
    expect(Number.isFinite(variation.cutoffScale)).toBe(true);
  });
});
