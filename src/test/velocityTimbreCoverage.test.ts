/**
 * Played dynamics: every preset must respond to velocity in *timbre*, not only in level.
 *
 * Velocity used to reach amplitude and nothing else for 30 of the 51 presets — a soft piano note
 * and a hard one differed only in loudness, which is the most recognisable "programmed, not played"
 * tell there is. The shipped genre patterns use twelve distinct velocity values (50…120, measured
 * across `src/data/genres/**`), so the mapping is audible rather than theoretical.
 *
 * The mapping is a *no-op at full velocity* by construction — every field's factor contains
 * `(velCurve - 1)` or `(1 - velCurve)`, which is 0 at `velCurve === 1`. That property is what lets
 * the annotations be added without making any preset louder or quieter at its loudest, and this
 * file asserts it rather than trusting the arithmetic to stay that way.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SYNTH_PRESETS,
  velocityCurve,
  velocityScaledCutoff,
  keyTrackedCutoff,
  playPolySynthNote,
} from "../audio/PolySynth";

const presets = Object.entries(DEFAULT_SYNTH_PRESETS);

/** Peak of the filter envelope the voice actually schedules, read from a fake context. */
const scheduledPeakCutoff = (
  preset: (typeof DEFAULT_SYNTH_PRESETS)[string],
  velocity: number
): number => {
  const param = (initial = 0) => ({
    value: initial,
    events: [] as Array<{ kind: string; value: number }>,
    setValueAtTime(v: number) {
      this.events.push({ kind: "set", value: v });
      this.value = v;
      return this;
    },
    linearRampToValueAtTime(v: number) {
      this.events.push({ kind: "lin", value: v });
      this.value = v;
      return this;
    },
    exponentialRampToValueAtTime(v: number) {
      this.events.push({ kind: "exp", value: v });
      this.value = v;
      return this;
    },
    setTargetAtTime(v: number) {
      this.value = v;
      return this;
    },
    cancelScheduledValues() {
      return this;
    },
  });
  const filters: Array<{ frequency: { events: Array<{ value: number }> } }> = [];
  const ctx: Record<string, unknown> = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => ({ gain: param(1), connect: () => {}, disconnect: () => {} }),
    createOscillator: () => ({
      type: "sine",
      frequency: param(440),
      detune: param(0),
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    }),
    createBiquadFilter: () => {
      const f = {
        type: "lowpass",
        frequency: param(350),
        Q: param(1),
        gain: param(0),
        connect: () => {},
        disconnect: () => {},
      };
      filters.push(f as never);
      return f;
    },
    createBufferSource: () => ({
      buffer: null,
      loop: false,
      playbackRate: param(1),
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    }),
    createBuffer: (c: number, l: number, sr: number) => ({
      numberOfChannels: c,
      length: l,
      sampleRate: sr,
      getChannelData: () => new Float32Array(l),
    }),
    createWaveShaper: () => ({ curve: null, oversample: "none", connect: () => {}, disconnect: () => {} }),
  };
  const dest = (ctx.createGain as () => unknown)();
  playPolySynthNote(ctx as never, dest as never, 60, 0, 0.5, velocity, preset);
  const events = filters[0].frequency.events;
  // The envelope's peak is the largest scheduled value; the note already settles onto the
  // velocity-scaled base before it, which is why the peak — not events[0] — is the brightness
  // a hard note is heard with.
  return events.reduce((m, e) => Math.max(m, e.value), 0);
};

describe("velocity reaches timbre for every preset", () => {
  it("annotates all 51 presets", () => {
    const missing = presets
      .filter(([, p]) => p.velocityToCutoff === undefined && p.velocityToFilterEnv === undefined)
      .map(([name]) => name);
    // A preset that responds only in amplitude is the defect this exists to prevent; adding a new
    // preset without dynamics should fail here, not ship.
    expect(missing).toEqual([]);
  });

  it("keeps a documented, non-zero depth on every one of them", () => {
    for (const [name, p] of presets) {
      const depth = (p.velocityToCutoff ?? 0) + (p.velocityToFilterEnv ?? 0);
      expect(depth, `${name} must have a real velocity→timbre depth`).toBeGreaterThan(0);
    }
  });

  it("is a no-op at full velocity, so no preset changes at its loudest", () => {
    // `velocityCurve(1) === 1`, and every factor is built from `(velCurve - 1)` / `(1 - velCurve)`.
    expect(velocityCurve(1)).toBe(1);
    for (const [name, p] of presets) {
      // At full velocity the settled cutoff is the authored value (C4 is the key-tracking anchor),
      // and the scheduled peak is the authored envelope sweep above it.
      expect(velocityScaledCutoff(p, 60, 1), `${name} settled at full velocity`).toBeCloseTo(
        p.filterCutoff,
        3
      );
      /**
       * The peak is the authored sweep, capped at 18 kHz.
       *
       * The cap is deliberate (it keeps a high-Q resonant sweep from opening into the
       * near-ultrasonic), so the assertion states it rather than expecting the raw product — the
       * first version of this test expected 22.5 kHz and failed on `reverseCymbal`, which is the
       * cap working, not a bug.
       */
      const uncapped = keyTrackedCutoff(p, 60) * Math.pow(2, p.filterEnvOctaves ?? Math.log2(2.5));
      expect(scheduledPeakCutoff(p, 1), `${name} peak at full velocity`).toBeCloseTo(
        Math.min(uncapped, 18000),
        2
      );
    }
  });

  it("opens further for harder notes on a dynamic preset", () => {
    // `deepPluck` is a struck patch, so the difference must be substantial, not nominal.
    const soft = velocityScaledCutoff(DEFAULT_SYNTH_PRESETS.deepPluck, 60, 0.4);
    const hard = velocityScaledCutoff(DEFAULT_SYNTH_PRESETS.deepPluck, 60, 1);
    expect(hard).toBeGreaterThan(soft);
    // A real difference in octaves: at least a third.
    expect(Math.log2(hard / soft)).toBeGreaterThan(0.33);
    // ...and the scheduled peak follows, which is what is actually heard.
    expect(Math.log2(scheduledPeakCutoff(DEFAULT_SYNTH_PRESETS.deepPluck, 1) / scheduledPeakCutoff(DEFAULT_SYNTH_PRESETS.deepPluck, 0.4)))
      .toBeGreaterThan(0.3);
  });

  it("keeps a pad's response gentler than a struck patch's", () => {
    // The depths are meant to be *instrument-appropriate*: a pad has no acoustic reason to
    // brighten as sharply as a plucked string does, so the ordering has to survive.
    const padDepth = DEFAULT_SYNTH_PRESETS.warmPad.velocityToCutoff ?? 0;
    const pluckDepth = DEFAULT_SYNTH_PRESETS.deepPluck.velocityToCutoff ?? 0;
    expect(pluckDepth).toBeGreaterThan(padDepth);
  });
});
