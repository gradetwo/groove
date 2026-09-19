/**
 * Wavetables for the drawbar organs (appendix E.5 item 2: "波表 `createPeriodicWave`").
 *
 * A Hammond's tone is a sum of *pure* partials at chosen footages. Neither organ preset could be
 * anything but an approximation before this existed, so both were a square plus a sine — a square's
 * partials fall off as 1/n, which is both too dark and the wrong series, and the sine was there to
 * suggest the upper drawbars it could not actually produce. Measured on the presets: the whole
 * point of a drawbar instrument is that its harmonic content is *chosen*, not implied by a waveform.
 *
 * The no-op guarantee matters as much as the feature: 49 other presets must render bit-for-bit as
 * before, or both committed baselines stop describing the library.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SYNTH_PRESETS,
  periodicWaveCoefficients,
  playPolySynthNote,
} from "../audio/PolySynth";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

const presets = Object.entries(DEFAULT_SYNTH_PRESETS);

/** Play one note and hand back the context, so the oscillator graph can be inspected. */
const voice = (preset: (typeof DEFAULT_SYNTH_PRESETS)[string]) => {
  const restore = installFakeOfflineAudioContext();
  try {
    const ctx = new FakeOfflineAudioContext(1, 4096, 44100);
    playPolySynthNote(
      ctx as unknown as BaseAudioContext,
      ctx.createGain() as unknown as AudioNode,
      60,
      1,
      0.4,
      0.9,
      preset
    );
    return ctx;
  } finally {
    restore();
  }
};

describe("periodicWaveCoefficients", () => {
  it("is null for a stack that would make no sound", () => {
    // A caller must be able to fall back to `osc1Type` rather than build a silent oscillator.
    expect(periodicWaveCoefficients(undefined)).toBeNull();
    expect(periodicWaveCoefficients([])).toBeNull();
    expect(periodicWaveCoefficients([0, 0, 0])).toBeNull();
    expect(periodicWaveCoefficients([Number.NaN, -1, 0])).toBeNull();
  });

  it("keeps the DC term at zero and puts the partials in the sine series", () => {
    const w = periodicWaveCoefficients([1, 0.5])!;
    // Index 0 is DC. A non-zero DC term is a constant offset, i.e. a click on every note.
    expect(w.real[0]).toBe(0);
    expect(w.imag[0]).toBe(0);
    // The fundamental is index 1, the second partial index 2 — not 0 and 1.
    expect(w.imag[1]).toBeGreaterThan(0);
    expect(w.imag[2]).toBeGreaterThan(0);
    expect([...w.real].every((v) => v === 0)).toBe(true);
  });

  it("normalises by the amplitude sum, so it can never exceed unity", () => {
    for (const stack of [[1], [1, 1, 1, 1], [1, 0.5, 0.25], Array(16).fill(0.3)]) {
      const w = periodicWaveCoefficients(stack)!;
      const total = [...w.imag].reduce((a, b) => a + Math.abs(b), 0);
      // The sum of the partial amplitudes is a strict upper bound on the waveform's peak, so
      // normalising by it is what guarantees no clipping — whatever the partials are.
      expect(total, `sum for ${stack.length} partials`).toBeCloseTo(1, 6);
    }
  });

  it("preserves the ratios between partials", () => {
    // The whole point is that the *shape* is authored. Normalisation must not touch it.
    const w = periodicWaveCoefficients([1, 0, 0.5, 0.25])!;
    expect(w.imag[3] / w.imag[1]).toBeCloseTo(0.5, 6);
    expect(w.imag[4] / w.imag[1]).toBeCloseTo(0.25, 6);
  });

  it("is deterministic, so the live engine and the exporter agree by construction", () => {
    const a = periodicWaveCoefficients([1, 0, 0.42, 0.36]);
    const b = periodicWaveCoefficients([1, 0, 0.42, 0.36]);
    expect([...a!.imag]).toEqual([...b!.imag]);
  });

  it("drops negatives and non-finite values rather than producing NaN coefficients", () => {
    const w = periodicWaveCoefficients([1, -5, Number.NaN, 0.5])!;
    expect(w.imag[2]).toBe(0);
    expect(w.imag[3]).toBe(0);
    expect([...w.imag].every(Number.isFinite)).toBe(true);
  });
});

describe("the organ presets are real drawbar registrations", () => {
  it("declares harmonics for both organs and for nothing else that should not have them", () => {
    expect(DEFAULT_SYNTH_PRESETS.m1Organ.harmonics, "m1_organ").toBeTruthy();
    expect(DEFAULT_SYNTH_PRESETS.organLead.harmonics, "organ_lead").toBeTruthy();
    // A registration is a deliberate choice per preset; this is not a default to spread around.
    const withHarmonics = presets.filter(([, p]) => p.harmonics).map(([name]) => name);
    expect(withHarmonics.sort()).toEqual(["m1Organ", "organLead"]);
  });

  it("gives the two organs different registrations, or they are one sound with two filters", () => {
    const a = DEFAULT_SYNTH_PRESETS.m1Organ.harmonics!;
    const b = DEFAULT_SYNTH_PRESETS.organLead.harmonics!;
    expect(a).not.toEqual(b);
  });

  it("puts energy on the drawbar footages, not on every harmonic", () => {
    /**
     * The array is **0-based**: index 0 is the fundamental. Harmonic \`n\` is footage 8′ / 2^(n-1), so
     * index `i` is footage `8′ / 2^i` and the drawbars land on:
     *   0 → 8′, 1 → 4′, 2 → 5⅓′, 3 → 2′, 4 → 1⅗′, 5 → 2⅔′, 7 → 1′, 12 → ½′.
     *
     * Spelling that table out is the point of this test. Two earlier versions of it were wrong in
     * opposite directions — one read it as 1-based, the next forgot which way the correction went —
     * which is exactly the mistake a reader makes, and the reason the labels name the arithmetic and
     * not just the footage.
     */
    const h = DEFAULT_SYNTH_PRESETS.m1Organ.harmonics!;
    expect(h[0], "8′ fundamental").toBeGreaterThan(0);
    expect(h[2], "5⅓′ twelfth").toBeGreaterThan(0);
    expect(h[3], "2′ octave").toBeGreaterThan(0);
    expect(h[5], "2⅔′ seventeenth").toBeGreaterThan(0);
    expect(h[7], "1′ twenty-second").toBeGreaterThan(0);
    expect(h[12], "½′ twenty-sixth").toBeGreaterThan(0);
    // Footages this registration leaves out stay silent — including the 4′ octave, which a "full
    // drawbars" setting on some consoles includes and this one does not.
    expect(h[1], "4′ is not in this registration").toBe(0);
    expect(h[4], "1⅗′ is not in this registration").toBe(0);
  });
});

describe("the wavetable reaches the oscillator, and nothing else changes", () => {
  it("switches osc1 to a periodic wave when the preset declares one", () => {
    const ctx = voice(DEFAULT_SYNTH_PRESETS.m1Organ);
    expect(ctx.createdOscillators[0].periodicWave).not.toBeNull();
    // And it is the preset's own stack, not a placeholder.
    const expected = periodicWaveCoefficients(DEFAULT_SYNTH_PRESETS.m1Organ.harmonics)!;
    expect([...ctx.createdOscillators[0].periodicWave!.imag]).toEqual([...expected.imag]);
  });

  it("leaves osc2 as the plain waveform, so the two oscillators still differ", () => {
    const ctx = voice(DEFAULT_SYNTH_PRESETS.m1Organ);
    expect(ctx.createdOscillators[1].periodicWave).toBeNull();
    expect(ctx.createdOscillators[1].type).toBe(DEFAULT_SYNTH_PRESETS.m1Organ.osc2Type);
  });

  it("builds no periodic wave at all for a preset without harmonics", () => {
    /**
     * The no-op guarantee, as a count rather than as an `if`. If the wavetable path were made
     * unconditional, 49 presets would silently change timbre and both committed baselines would
     * stop describing the library.
     */
    for (const [name, preset] of presets) {
      if (preset.harmonics) continue;
      const ctx = voice(preset);
      expect(ctx.createdOscillators[0].periodicWave, `${name} must not be a wavetable`).toBeNull();
      expect(ctx.createdOscillators[0].type, `${name} keeps its own waveform`).toBe(preset.osc1Type);
    }
  });

  it("still starts and stops every oscillator of a wavetable voice", () => {
    const ctx = voice(DEFAULT_SYNTH_PRESETS.organLead);
    for (const osc of ctx.createdOscillators) {
      expect(osc.started).toBe(true);
      expect(osc.stoppedAt.length).toBeGreaterThan(0);
    }
  });
});
