import { describe, it, expect } from "vitest";
import { measureLoudnessRange } from "./helpers/loudness";

/**
 * The loudness-range helper's contract, pinned on signals whose range is known by construction.
 *
 * It exists because a listening review reported this master's range as **0.6 LU** ("mechanical") while the
 * repository's own dynamics claim read 0 offenders — and that claim measures the *pattern's* velocity spread, not the
 * master. A number that settles an argument has to be checkable, so these are cases whose answers are arithmetic.
 */
const SAMPLE_RATE = 44100;

/** `seconds` of a sine at `amplitude`. */
const tone = (amplitude: number, seconds: number): Float32Array => {
  const frames = Math.round(SAMPLE_RATE * seconds);
  const signal = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) signal[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE);
  return signal;
};

describe("measureLoudnessRange · EBU R128 LRA", () => {
  it("reads about zero for a signal that never moves", () => {
    // 12 s of steady tone: 3 s blocks, 1 s step, every block the same loudness.
    expect(measureLoudnessRange([tone(0.5, 12)], SAMPLE_RATE)).toBeLessThan(0.5);
  });

  it("reads a programmed 6 dB step as about 6 LU", () => {
    const quiet = tone(0.25, 6);
    const loud = tone(0.5, 6);
    const joined = new Float32Array(quiet.length + loud.length);
    joined.set(quiet, 0);
    joined.set(loud, quiet.length);
    const lra = measureLoudnessRange([joined], SAMPLE_RATE);
    expect(lra).toBeGreaterThan(4);
    expect(lra).toBeLessThan(7);
  });

  it("returns 0 rather than NaN for a clip shorter than one block", () => {
    expect(measureLoudnessRange([tone(0.5, 1)], SAMPLE_RATE)).toBe(0);
    expect(measureLoudnessRange([], SAMPLE_RATE)).toBe(0);
  });
});
