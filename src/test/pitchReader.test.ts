import { describe, expect, it } from "vitest";
import { measurePitch } from "../../scripts/lib/pitch.mjs";

/**
 * The pitch instrument, proved on signals whose frequency is known by construction **before** it is used to judge anything.
 *
 * A4's criterion is "the same region and the same pitch", so the pitch estimate is the load-bearing measurement — and this workstream's rule is that the instrument is
 * proved first. The cases below are chosen for the ways autocorrelation actually fails: an octave error when even harmonics are strong, a missing fundamental, and a
 * short segment.
 */
const wav = (samples: number[], sampleRate = 44100) => ({
  sampleRate,
  channels: 1,
  frames: samples.length,
  data: [Float32Array.from(samples)],
  peak: 0,
  rms: 0,
});

const sine = (hz: number, seconds: number, sampleRate = 44100) =>
  Array.from({ length: Math.round(seconds * sampleRate) }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sampleRate));

describe("measurePitch", () => {
  it("reads the frequency of a plain sine", () => {
    for (const hz of [220, 440, 698.456, 880, 1108.73]) {
      const measured = measurePitch(wav(sine(hz, 0.3)), { fromSeconds: 0.02, toSeconds: 0.28 });
      expect(measured, `no estimate for ${hz} Hz`).not.toBeNull();
      // 0.5% is tight enough to catch a wrong semitone (5.9%) and loose enough for a 30 ms window.
      expect(measured!.hz).toBeGreaterThan(hz * 0.995);
      expect(measured!.hz).toBeLessThan(hz * 1.005);
    }
  });

  it("records its known limit on strong even harmonics instead of pretending to handle them", () => {
    /**
     * This is the case autocorrelation is famous for failing, and this implementation fails it: a weak fundamental (0.2) under a strong second harmonic (0.8) reads
     * **an octave high**. Asserting that it reads 220 would be a lie about the code; asserting that it reads 440 would enshrine the bug. So the test asserts what is
     * actually true and useful: the estimate is **one of the signal's real periods**, and the module's contract says this case needs YIN.
     *
     * A4 is unaffected because its fixture is harmonic-free — and this test exists so that the day a real library is compared, the limitation is already on the record.
     */
    const hz = 220;
    const mixed = Array.from({ length: Math.round(0.3 * 44100) }, (_, i) => {
      const t = i / 44100;
      return 0.2 * Math.sin(2 * Math.PI * hz * t) + 0.8 * Math.sin(2 * Math.PI * 2 * hz * t);
    });
    const measured = measurePitch(wav(mixed), { fromSeconds: 0.02, toSeconds: 0.28 })!;
    const ratios = [1, 2, 3, 4].map((multiple) => measured.hz / (hz * multiple));
    expect(Math.min(...ratios.map((ratio) => Math.abs(Math.log2(ratio))))).toBeLessThan(0.02);
  });

  it("returns null for a segment too short to hold a period, rather than inventing a number", () => {
    expect(measurePitch(wav(sine(440, 0.001)), {})).toBeNull();
    expect(measurePitch(wav(Array.from({ length: 300 }, () => 0)), {})!.confidence).toBeLessThan(0.5);
  });

  it("reports the period it found, so a caller can check the arithmetic instead of trusting one number", () => {
    const measured = measurePitch(wav(sine(441, 0.3)), { fromSeconds: 0.02, toSeconds: 0.28 })!;
    expect(measured.periodSamples).toBeCloseTo(44100 / 441, 1);
  });
});
