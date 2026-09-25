/**
 * P2.2 / A3 — per-note timbre variation.
 *
 * The defect is a loop that repeats the same stab twelve times a bar: the synth is deterministic, so those twelve
 * hits are *identical* and the loop reads as a machine. These cases pin the three properties that make the nudge
 * safe to ship — it is bounded, it is seeded (the same pattern renders the same file), and it actually differs
 * between consecutive steps.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderPatternOffline } from "../audio/WavExporter";
import { resolveInstrumentPreset } from "../audio/instrumentPresets";
import { setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";
import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
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

/**
 * The wiring, not the arithmetic: the nudge has to reach a *render*.
 *
 * jsdom's Web Audio double returns an empty buffer, so the comparison is made where the change actually happens —
 * the scheduled `detune` and filter values. `noteVariation: false` is A3's control (and the escape hatch for anyone
 * comparing two renders byte for byte), so both branches are pinned: the default one must move the values off the
 * preset's own number, and the control must reproduce it exactly.
 */
describe("P2.2 · the variation reaches a render, and the control does not", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  /** A chord lane on the *native* synth path: GS-1 has no per-note timbre parameters (see the plan's A3 note). */
  const chordPattern = (): SequencerPattern =>
    ({
      genre_id: "chicago-house",
      bpm: 124,
      swing: 0,
      scale: "C minor",
      totalSteps: 16,
      tracks: [
        {
          track_id: "chords",
          name: "Chords",
          instrument: "warm_pad",
          steps: new Array(16).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)),
          velocity: new Array(16).fill(100),
          volume: 0.8,
          pan: 0,
          sendA: 0,
          sendB: 0,
        },
      ],
    }) as unknown as SequencerPattern;

  it("moves the scheduled detune by default and reproduces it exactly with the variation off", async () => {
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(false);

    /**
     * Only the oscillators that *schedule* a detune: a preset's first oscillator has none (it plays at the note's
     * own pitch) and reading it as a value produced `NaN` — which the first version of this test compared happily.
     */
    const scheduledDetunes = () =>
      FakeOfflineAudioContext.lastInstance!.createdOscillators
        .map((osc) => osc.detune.events[0]?.value)
        .filter((value): value is number => typeof value === "number");

    await renderPatternOffline(chordPattern(), { bars: 1 });
    const withVariation = scheduledDetunes();

    await renderPatternOffline(chordPattern(), { bars: 1, noteVariation: false });
    const without = scheduledDetunes();

    expect(withVariation.length).toBeGreaterThan(0);
    // The control is the preset's own number, note for note…
    const preset = resolveInstrumentPreset("warm_pad", "chords");
    for (const value of without) expect(value).toBe(preset.osc2DetuneCents);
    // …and the default is not, because each stab carries its own nudge.
    expect(withVariation.some((value) => value !== preset.osc2DetuneCents)).toBe(true);
    for (const value of withVariation) {
      expect(Math.abs(value - preset.osc2DetuneCents)).toBeLessThanOrEqual(NOTE_VARIATION_MAX_DETUNE_CENTS);
    }
  });
});


/**
 * The offline GS-1 capability probe renders a throwaway context of its own; these cases inspect the *app's* render
 * (hosts, strips, buffers) and would otherwise find the probe's instead. Declared satisfied at module scope here; the
 * probe has its own file, and `probe_engine_parity.mjs` is its acceptance test.
 */
setGs1OfflineCapability("usable");
