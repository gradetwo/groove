/**
 * E-14 — per-preset filter envelope, resonance compensation and the optional 24 dB slope.
 *
 * The defect: the filter envelope was a hardcoded `cutoff · 2.5` sweep tied to the amp's
 * attack/decay, so a pad bloomed like a pluck and a 303 could not snap. And nothing compensated
 * for the fact that a resonant biquad's peak rises with Q — turning resonance up was heard
 * mostly as "louder", which is the wrong control.
 *
 * These tests keep the two promises that matter:
 *   1. a preset that does not opt in renders **exactly** as before (the loudness and timbre
 *      baselines describe 159 genres; a house-wide change to every preset would silently
 *      invalidate them), and
 *   2. the new controls do what they say — depth, timing, compensation direction, and a real
 *      second filter stage with the resonance moved to it rather than stacked.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SYNTH_PRESETS,
  playPolySynthNote,
  resonanceCompensationGainDb,
  type SynthPreset,
} from "../audio/PolySynth";
import {
  FakeOfflineAudioContext,
  installFakeOfflineAudioContext,
  type FakeFilterNode,
  type FakeGainNode,
} from "./helpers/fakeAudio";

const AT = 1.0;
const DUR = 0.5;

/** Play one note through the fake context and hand back every node the voice built. */
function voice(preset: Partial<SynthPreset> = {}) {
  const restore = installFakeOfflineAudioContext();
  try {
    const ctx = new FakeOfflineAudioContext(1, 4096, 44100);
    playPolySynthNote(
      ctx as unknown as BaseAudioContext,
      ctx.createGain() as unknown as AudioNode,
      60,
      AT,
      DUR,
      1,
      { ...DEFAULT_SYNTH_PRESETS.warmPad, ...preset } as SynthPreset
    );
    return {
      ctx,
      filters: ctx.createdFilters,
      gains: ctx.createdGains,
    };
  } finally {
    restore();
  }
}

/** Every scheduled value on a param, as plain numbers. */
const valuesOf = (param: { events: Array<{ value: number }> }): number[] => param.events.map((e) => e.value);

describe("E-14 filter envelope — per preset, with the historical default intact", () => {
  it("keeps the historical 2.5x sweep when a preset says nothing", () => {
    const unannotated = { ...DEFAULT_SYNTH_PRESETS.warmPad, filterEnvOctaves: undefined };
    const { filters } = voice(unannotated);
    const filter = filters[0];
    const cutoff = DEFAULT_SYNTH_PRESETS.warmPad.filterCutoff;
    // `setValueAtTime(cutoff)` then the attack peak, then the return to cutoff.
    const events = valuesOf(filter.frequency);
    expect(events[0]).toBeCloseTo(cutoff, 4);
    expect(events[1]).toBeCloseTo(Math.min(cutoff * 2.5, 18000), 2);
    expect(events[2]).toBeCloseTo(cutoff, 4);
  });

  it("honours a per-preset depth", () => {
    const { filters } = voice({ filterEnvOctaves: 1 }); // 2x
    const cutoff = DEFAULT_SYNTH_PRESETS.warmPad.filterCutoff;
    expect(valuesOf(filters[0].frequency)[1]).toBeCloseTo(cutoff * 2, 2);
  });

  it("treats a depth of zero as 'no sweep' and schedules none", () => {
    const { filters } = voice({ filterEnvOctaves: 0 });
    // Only the base cutoff is scheduled: no peak ramp, no return.
    expect(valuesOf(filters[0].frequency)).toHaveLength(1);
  });

  it("scales the sweep's attack and decay independently of the amp envelope", () => {
    const base = voice({ filterEnvOctaves: 1, filterEnvAttackScale: 1, filterEnvDecayScale: 1 });
    const slow = voice({ filterEnvOctaves: 1, filterEnvAttackScale: 3, filterEnvDecayScale: 0.5 });
    const attackTimes = (f: FakeFilterNode) =>
      f.frequency.events
        .filter((e: { type: string }) => e.type === "exponentialRampToValueAtTime")
        .map((e: { time: number }) => e.time);
    const baseTimes = attackTimes(base.filters[0]);
    const slowTimes = attackTimes(slow.filters[0]);
    expect(baseTimes).toHaveLength(2);
    expect(slowTimes).toHaveLength(2);
    // The peak moves later…
    expect(slowTimes[0] - AT).toBeGreaterThan((baseTimes[0] - AT) * 2.5);
    // …and the return comes earlier relative to the peak.
    expect(slowTimes[1] - slowTimes[0]).toBeLessThan((baseTimes[1] - baseTimes[0]) * 0.6);
  });
});

describe("E-14 resonance compensation", () => {
  it("is zero at Q = 1 and grows with Q", () => {
    expect(resonanceCompensationGainDb(1)).toBe(0);
    expect(resonanceCompensationGainDb(2)).toBeLessThan(0);
    expect(resonanceCompensationGainDb(4)).toBeLessThan(resonanceCompensationGainDb(2));
  });

  it("is capped so an extreme Q cannot make a preset inaudible", () => {
    expect(resonanceCompensationGainDb(40)).toBe(-6);
    expect(resonanceCompensationGainDb(1000)).toBe(-6);
  });

  it("can be switched off per preset, and survives nonsense input", () => {
    expect(resonanceCompensationGainDb(20, 0)).toBe(0);
    expect(resonanceCompensationGainDb(Number.NaN)).toBe(0);
    expect(resonanceCompensationGainDb(0.5)).toBe(0);
  });

  it("adds a compensation node only when there is something to compensate", () => {
    // Node count is the robust wiring check: the compensation is one extra gain, and it must be
    // absent both when Q is 1 (nothing to correct) and when the preset opts out.
    const atUnity = voice({ filterQ: 1, filterEnvOctaves: 0 }).gains.length;
    const optedOut = voice({ filterQ: 6.5, filterEnvOctaves: 0, resonanceCompDbPerQ: 0 }).gains.length;
    const compensated = voice({ filterQ: 6.5, filterEnvOctaves: 0 }).gains.length;
    expect(optedOut).toBe(atUnity);
    expect(compensated).toBe(atUnity + 1);
  });

  it("puts the correction before the filter, not after it", () => {
    const { filters, gains } = voice({ filterQ: 6.5, filterEnvOctaves: 0 });
    const filter = filters[0];
    // The node that feeds the filter is the compensation gain, and its value is the dB→linear
    // conversion of the documented correction.
    const feeder = gains.find((g) => filter.incoming.includes(g));
    expect(feeder, "no gain feeds the filter").toBeTruthy();
    const expected = Math.pow(10, resonanceCompensationGainDb(6.5) / 20);
    expect(Number((feeder as FakeGainNode).gain.value)).toBeCloseTo(expected, 6);
  });
});

describe("E-14 optional 24 dB slope", () => {
  it("adds exactly one more filter when the preset opts in", () => {
    const twoPole = voice({ filterEnvOctaves: 0 }).filters.length;
    const fourPole = voice({ filterEnvOctaves: 0, filterSlope24: true }).filters.length;
    expect(fourPole).toBe(twoPole + 1);
  });

  it("cascades them, and moves the resonance to the second stage rather than stacking it", () => {
    const { filters } = voice({ filterEnvOctaves: 0, filterQ: 6, filterSlope24: true });
    const [first, second] = filters;
    expect(first.Q.value).toBeCloseTo(3, 4); // halved resonance on the first stage
    expect(second.Q.value).toBeCloseTo(1, 4); // flat second stage: no double peak
    // Series, not parallel: the first stage feeds the second.
    expect(second.incoming).toContain(first);
  });

  it("defaults to 12 dB, so an un-annotated preset keeps one stage", () => {
    expect(voice({ filterEnvOctaves: 0 }).filters).toHaveLength(1);
  });

  it("leaves the amplitude envelope connected to the last stage", () => {
    const { filters, gains } = voice({ filterEnvOctaves: 0, filterSlope24: true });
    const last = filters[filters.length - 1];
    const amp = gains.find((g) => (g as unknown as { incoming: unknown[] }).incoming.includes(last));
    expect(amp, "no gain node takes its input from the final filter stage").toBeTruthy();
  });
});

describe("E-14 shipped presets", () => {
  it("annotates the presets whose character depends on it, and only those", () => {
    const annotated = Object.entries(DEFAULT_SYNTH_PRESETS)
      .filter(([, p]) => p.filterEnvOctaves !== undefined || p.filterSlope24 || p.filterEnvAttackScale)
      .map(([name]) => name)
      .sort();
    expect(annotated).toEqual(["acidBass", "brassSynth", "supersaw", "warmPad"]);
  });

  it("gives the 303 a 24 dB ladder and a fast, deep envelope", () => {
    const acid = DEFAULT_SYNTH_PRESETS.acidBass;
    expect(acid.filterSlope24).toBe(true);
    expect(acid.filterEnvOctaves).toBeGreaterThan(2);
    expect(acid.filterEnvAttackScale).toBeLessThan(0.5);
    expect(acid.filterEnvDecayScale).toBeLessThan(0.6);
  });

  it("makes the pad shallow and the supersaw static", () => {
    expect(DEFAULT_SYNTH_PRESETS.warmPad.filterEnvOctaves).toBeLessThan(1);
    expect(DEFAULT_SYNTH_PRESETS.supersaw.filterEnvOctaves).toBeLessThan(1);
    // A pad opens slowly with the amp; that is what makes it a pad.
    expect(DEFAULT_SYNTH_PRESETS.warmPad.filterEnvAttackScale).toBeGreaterThan(1);
  });

  it("gives brass a bloom: a filter that opens slower than the amp attack", () => {
    expect(DEFAULT_SYNTH_PRESETS.brassSynth.filterEnvAttackScale).toBeGreaterThan(2);
  });
});
