import { describe, it, expect } from "vitest";
import {
  DEFAULT_SYNTH_PRESETS,
  playPolySynthNote,
  velocityCurve,
  VELOCITY_CURVE_EXPONENT,
  SynthPreset,
} from "../audio/PolySynth";
import { safeGain } from "../audio/dspGuards";
import { FakeAudioContext, FakeGainNode, FakeFilterNode } from "./helpers/fakeAudio";

/**
 * E-13 · velocity → timbre.
 *
 * The old voice used velocity for exactly one thing — a *linear* amplitude scale — so a
 * hard note and a soft note were the same timbre at different volumes. These tests pin
 * the replacement: a bounded, monotonic velocity curve, plus an opt-in per-preset
 * response that moves the filter cutoff, the filter-envelope depth and the amp
 * attack/decay. The overriding invariants are:
 *
 *   1. every response is a no-op at full velocity, so annotating a preset cannot move
 *      the library's measured loudness baseline, and
 *   2. a preset with the response *stripped* schedules exactly the automation the pre-E-13 code
 *      did at every velocity (its level still follows the global curve, its timbre does not).
 *
 * Every preset in the library is annotated now — velocity reaching only amplitude is the
 * "programmed, not played" defect, so the default became "responsive" and the tests that used to
 * rely on a population of velocity-deaf presets build one by stripping the fields instead. That
 * keeps the short-circuit guarantee testable without needing presets that exhibit the defect.
 */

const TIME = 0.5;

/** Every preset, which is now every one of them — see the header. */
const ANNOTATED_KEYS = [
  "pianoLead",
  "rhodesEp",
  "walkingUpright",
  "fingerBass",
  "slapBass",
  "pickBass",
  "saxLead",
  "trumpetLead",
  "mutedTrumpet",
  "fluteLead",
  "stringsLead",
  "vibraphone",
  "marimbaLead",
  "bellLead",
  "pluckString",
  "sitarLead",
  "accordionLead",
  "harmonicaLead",
  "organLead",
  "guitarLead",
  "distortedGuitar",
];

const ALL_KEYS = Object.keys(DEFAULT_SYNTH_PRESETS);
/**
 * Keys used for the short-circuit tests. They are no longer "the presets we did not annotate"
 * (there are none); each test strips the response off the preset it is checking, which tests the
 * same guarantee without depending on the library containing a defect.
 */
const UNANNOTATED_KEYS = ANNOTATED_KEYS;

function play(preset: SynthPreset, velocity: number, dur = 0.3, midi = 60) {
  const ctx = new FakeAudioContext();
  const dest = ctx.createGain();
  const voice = playPolySynthNote(
    ctx as unknown as BaseAudioContext,
    dest as unknown as AudioNode,
    midi,
    TIME,
    dur,
    velocity,
    preset
  );
  const filter = ctx.createdFilters[0] as FakeFilterNode;
  // The amp envelope is the last gain pushed (a noise preset pushes its noise gain first).
  const amp = voice.gains[voice.gains.length - 1] as unknown as FakeGainNode;
  return { filter, amp };
}

type ParamEvent = { type: string; value: number; time: number };

function filterEvents(preset: SynthPreset, velocity: number, dur = 0.3): ParamEvent[] {
  return play(preset, velocity, dur).filter.frequency.events.map((e) => ({ ...e }));
}

/** The value the filter settles on at the end of the sweep (the note's steady cutoff). */
function baseCutoff(events: ParamEvent[]): number {
  const ramps = events.filter((e) => e.type === "exponentialRampToValueAtTime");
  return ramps[ramps.length - 1].value;
}

/** The brightest point of the filter sweep. */
function peakCutoff(events: ParamEvent[]): number {
  return Math.max(...events.map((e) => e.value));
}

/** A copy of a preset with no velocity response at all — the pre-E-13 voice. */
function withoutVelocityResponse(preset: SynthPreset): SynthPreset {
  const clone: SynthPreset = { ...preset };
  delete clone.velocityToCutoff;
  delete clone.velocityToFilterEnv;
  delete clone.velocityToAttack;
  delete clone.velocityToDecay;
  return clone;
}

describe("E-13 · velocity curve", () => {
  it("is monotonic non-decreasing and bounded to [0, 1]", () => {
    let previous = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = i / 100;
      const c = velocityCurve(v);
      expect(Number.isFinite(c), `curve(${v}) finite`).toBe(true);
      expect(c, `curve(${v}) lower bound`).toBeGreaterThanOrEqual(0);
      expect(c, `curve(${v}) upper bound`).toBeLessThanOrEqual(1);
      expect(c, `curve(${v}) monotonic`).toBeGreaterThanOrEqual(previous);
      previous = c;
    }
  });

  it("is the identity at full velocity and exactly zero at the floor", () => {
    expect(velocityCurve(1)).toBe(1);
    expect(velocityCurve(0)).toBe(0);
    // The exponent is exposed so the shape itself is pinned, not just the endpoints.
    expect(velocityCurve(0.5)).toBeCloseTo(Math.pow(0.5, VELOCITY_CURVE_EXPONENT), 12);
    // A squared law really does expand the dynamics: MIDI 64 is -12 dB, not -6 dB.
    expect(20 * Math.log10(velocityCurve(0.5))).toBeCloseTo(-12.04, 1);
    expect(velocityCurve(0.5)).toBeLessThan(0.5);
  });

  it("clamps out-of-range input and never leaks NaN", () => {
    expect(velocityCurve(-5)).toBe(0);
    expect(velocityCurve(2)).toBe(1);
    expect(velocityCurve(Infinity)).toBe(1);
    expect(velocityCurve(-Infinity)).toBe(0);
    expect(velocityCurve(NaN)).toBe(0);
  });
});

/**
 * The sweep peak a preset declares: the historical `·2.5` unless the preset states a depth of its
 * own (E-14 gave presets that control), in which case the preset's number wins.
 */
const expectedPeakCutoff = (preset: SynthPreset): number =>
  Math.min(preset.filterCutoff * 2 ** (preset.filterEnvOctaves ?? Math.log2(2.5)), 18000);

describe("E-13 · per-preset velocity → timbre response", () => {
  it("annotates exactly the acoustic/emulative presets the task names", () => {
    expect(ANNOTATED_KEYS).toHaveLength(21);
    for (const key of ANNOTATED_KEYS) {
      const preset = DEFAULT_SYNTH_PRESETS[key];
      expect(preset, key).toBeTruthy();
      expect(preset.velocityToCutoff, `${key} velocityToCutoff`).toBeGreaterThan(0);
      expect(preset.velocityToFilterEnv, `${key} velocityToFilterEnv`).toBeGreaterThan(0);
      expect(preset.velocityToAttack, `${key} velocityToAttack`).toBeGreaterThanOrEqual(0);
      expect(preset.velocityToDecay, `${key} velocityToDecay`).toBeGreaterThanOrEqual(0);
    }
    // Sanity: the short-circuit half of these tests still covers a real population.
    expect(UNANNOTATED_KEYS.length).toBeGreaterThan(20);
  });

  for (const key of ANNOTATED_KEYS) {
    it(`${key}: at the same velocity the cutoff now differs from the pre-E-13 voice, at full velocity it does not`, () => {
      const preset = DEFAULT_SYNTH_PRESETS[key];
      const baseline = withoutVelocityResponse(preset);
      const nominal = preset.filterCutoff;

      // At a sub-unity velocity the opt-in response moves the settled cutoff down.
      const soft = filterEvents(preset, 0.8);
      const softBaseline = filterEvents(baseline, 0.8);
      expect(baseCutoff(soft), `${key} soft base`).toBeLessThan(nominal);
      expect(JSON.stringify(soft)).not.toBe(JSON.stringify(softBaseline));

      // At full velocity every new field is an exact no-op: the annotated preset must
      // schedule byte-for-byte the automation of its stripped self (and therefore of the
      // pre-change code path, which the stripped preset still takes unchanged).
      expect(filterEvents(preset, 1)).toEqual(filterEvents(baseline, 1));
    });

    it(`${key}: a soft note is measurably darker than a hard note`, () => {
      const preset = DEFAULT_SYNTH_PRESETS[key];
      const soft = filterEvents(preset, 0.25);
      const hard = filterEvents(preset, 1);

      // The core claim: both the steady cutoff and the sweep peak fall with velocity.
      expect(baseCutoff(soft), `${key} base`).toBeLessThan(baseCutoff(hard));
      expect(baseCutoff(soft), `${key} base margin`).toBeLessThan(baseCutoff(hard) * 0.9);
      expect(peakCutoff(soft), `${key} peak`).toBeLessThanOrEqual(peakCutoff(hard));

      // Full velocity still lands on the preset's own cutoff and its declared sweep peak.
      expect(baseCutoff(hard)).toBe(preset.filterCutoff);
      expect(peakCutoff(hard)).toBeCloseTo(expectedPeakCutoff(preset), 9);
    });
  }

  for (const key of UNANNOTATED_KEYS) {
    it(`${key}: a stripped preset is timbre-identical at every velocity`, () => {
      // Stripped, not "un-annotated by omission": the library no longer ships a velocity-deaf
      // preset, so the short-circuit is tested against the fields being absent.
      const preset = withoutVelocityResponse(DEFAULT_SYNTH_PRESETS[key]);
      const reference = filterEvents(preset, 1);
      for (const velocity of [0.05, 0.25, 0.5, 0.8, 1]) {
        const events = filterEvents(preset, velocity);
        // Same events, same values, same times — the mapping genuinely short-circuits.
        expect(events, `${key}@${velocity}`).toEqual(reference);
        expect(baseCutoff(events), `${key}@${velocity} base`).toBe(preset.filterCutoff);
        // The *velocity* mapping short-circuits; the preset's own envelope depth (if it declares
        // one) is part of its voicing, not part of the velocity response.
        expect(peakCutoff(events), `${key}@${velocity} peak`).toBeCloseTo(expectedPeakCutoff(preset), 9);
      }
    });
  }

  it("stretches an annotated preset's attack and decay only below full velocity", () => {
    // A hard strike is the shortest attack / most percussive decay; a soft one is slower
    // and rings longer. The note is long enough that the gate cuts neither ramp.
    const SOFT_VEL = 0.25;
    const curve = velocityCurve(SOFT_VEL);
    let attacksStretched = 0;
    let decaysStretched = 0;

    for (const key of ANNOTATED_KEYS) {
      const preset = DEFAULT_SYNTH_PRESETS[key];
      const attackScale = 1 + (preset.velocityToAttack ?? 0) * (1 - curve);
      const decayScale = 1 + (preset.velocityToDecay ?? 0) * (1 - curve);

      // The amp attack is clamped to the envelope's 2 ms floor, exactly as before E-13.
      const hardAttackEnd = TIME + Math.max(0.002, preset.adsr.attack);
      const softAttackEnd = TIME + Math.max(0.002, preset.adsr.attack * attackScale);
      const hardDecayEnd = hardAttackEnd + Math.max(0.01, preset.adsr.decay);
      const softDecayEnd = softAttackEnd + Math.max(0.01, preset.adsr.decay * decayScale);

      const expRamps = (velocity: number) =>
        play(preset, velocity, 4.0).amp.gain.events.filter(
          (e) => e.type === "exponentialRampToValueAtTime"
        );
      const hard = expRamps(1);
      const soft = expRamps(SOFT_VEL);

      expect(hard[0].time, `${key} ff attack`).toBeCloseTo(hardAttackEnd, 9);
      expect(soft[0].time, `${key} soft attack`).toBeCloseTo(softAttackEnd, 9);
      expect(hard[1].time, `${key} ff decay`).toBeCloseTo(hardDecayEnd, 9);
      expect(soft[1].time, `${key} soft decay`).toBeCloseTo(softDecayEnd, 9);

      if (softAttackEnd > hardAttackEnd) attacksStretched++;
      if (softDecayEnd > hardDecayEnd) decaysStretched++;
    }

    // The two 1 ms-attack presets (marimba, bell) already sit on the 2 ms envelope
    // floor, so their attack response is masked; every other annotated preset stretches.
    expect(attacksStretched).toBeGreaterThanOrEqual(ANNOTATED_KEYS.length - 2);
    expect(decaysStretched).toBe(ANNOTATED_KEYS.length);
  });

  it("keeps the global velocity curve out of the un-annotated timbre path", () => {
    // The curve still scales the amp level of every preset (that is the E-13 amplitude
    // fix), but it must not move an un-annotated voice's filter or envelope *timing*.
    for (const key of UNANNOTATED_KEYS) {
      // Stripped, because every shipped preset is annotated now (see the header): the guarantee
      // under test is that *without* the response nothing but level moves.
      const preset = withoutVelocityResponse(DEFAULT_SYNTH_PRESETS[key]);
      const timesAt = (velocity: number) => {
        const { amp } = play(preset, velocity, 1.0);
        return amp.gain.events.map((e) => e.time);
      };
      expect(timesAt(0.2), `${key} envelope timing`).toEqual(timesAt(1));

      // A long-enough note so every preset's attack completes and the loudest scheduled
      // value really is the attack peak (no gate-cut attack value).
      const { amp } = play(preset, 0.5, 2.0);
      const peak = Math.max(...amp.gain.events.map((e) => e.value));
      expect(peak, `${key} level follows the curve`).toBeCloseTo(
        Math.max(0.001, safeGain(velocityCurve(0.5) * 0.8, 0.001)),
        9
      );
    }
  });
});

describe("E-13 · amp envelope continuity is preserved", () => {
  const FLOOR = 0.0001;

  function envelopeValueAt(events: ParamEvent[], t: number): number {
    if (events.length === 0) return NaN;
    if (t <= events[0].time) return events[0].value;
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const next = events[i];
      if (t > next.time) continue;
      if (next.type === "setValueAtTime") return t < next.time ? prev.value : next.value;
      const frac = next.time === prev.time ? 1 : (t - prev.time) / (next.time - prev.time);
      return prev.value * Math.pow(next.value / prev.value, frac);
    }
    return events[events.length - 1].value;
  }

  it("has no step at the gate and returns to the floor for long-decay presets on a short note", () => {
    // rhodesEp (0.9 s), pianoLead (1.2 s) and vibraphone (1.6 s) are the long-decay
    // annotated presets; a 1/16 gate lands inside their decay, which is exactly where the
    // old unconditional `setValueAtTime(sustain)` produced a click.
    const longDecay = ["rhodesEp", "pianoLead", "vibraphone", "bellLead"];
    const SHORT_NOTE = 0.1;

    for (const key of longDecay) {
      const preset = DEFAULT_SYNTH_PRESETS[key];
      for (const velocity of [0.15, 0.5, 1]) {
        const { amp } = play(preset, velocity, SHORT_NOTE, 36);
        const events = [...amp.gain.events].sort((a, b) => a.time - b.time);
        const release = TIME + Math.max(0.05, SHORT_NOTE);
        const end = release + Math.max(0.01, preset.adsr.release);

        const before = envelopeValueAt(events, release - 1e-9);
        const at = envelopeValueAt(events, release);
        expect(Math.abs(at - before), `${key}@${velocity} jump at gate`).toBeLessThan(1e-6);

        const last = events[events.length - 1];
        expect(last.time, `${key}@${velocity} note end`).toBeCloseTo(end, 9);
        expect(last.value, `${key}@${velocity} floor`).toBeCloseTo(FLOOR, 9);
        expect(envelopeValueAt(events, end), `${key}@${velocity} floor value`).toBeCloseTo(FLOOR, 9);
      }
    }
  });

  it("never schedules a non-positive exponential target at any velocity", () => {
    for (const key of ALL_KEYS) {
      const preset = DEFAULT_SYNTH_PRESETS[key];
      for (const velocity of [0, NaN, 0.05, 0.5, 1, 2]) {
        const { filter, amp } = play(preset, velocity, 0.1);
        for (const e of [...filter.frequency.events, ...amp.gain.events]) {
          if (e.type !== "exponentialRampToValueAtTime") continue;
          expect(Number.isFinite(e.value), `${key}@${velocity} finite`).toBe(true);
          expect(e.value, `${key}@${velocity} positive`).toBeGreaterThan(0);
        }
      }
    }
  });
});
