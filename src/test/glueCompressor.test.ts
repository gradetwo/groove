/**
 * The glue compressor's kernel, and the one property A2 needs it for.
 *
 * The bug this exists to fix was measured, not guessed: a `DynamicsCompressorNode` in the bus takes the *median*
 * sidechain dip in the file to **zero** (mean −4.41 → −1.98, median −4.37 → 0) because its detector sees the ducked
 * programme, and no setting explains it (release, threshold and ratio all refuted by measurement) and no amount of
 * lane-side depth pays for it (a ×3 duck moved the file's median only to −0.35 dB).
 *
 * So the kernel takes a **second input**: the programme to scale and a detector to follow. These cases pin the
 * difference directly — with the detector held steady, a dip in the programme survives; with the programme detecting
 * itself, the dip is refilled — because that difference *is* the fix.
 */
import { describe, it, expect } from "vitest";
import {
  GLUE_COMP_ATTACK_SEC,
  GLUE_COMP_KNEE_DB,
  GLUE_COMP_RATIO,
  GLUE_COMP_RELEASE_SEC,
  GLUE_COMP_THRESHOLD_DB,
  GlueCompressorKernel,
  glueCompressorReductionDb,
  resolveGlueCompressorOptions,
} from "../audio/GlueCompressor";

const SAMPLE_RATE = 44100;
const LOUD = 0.8;
const QUIET = 0.2;

/**
 * How much of a dip survives: the output's quiet/loud ratio over the input's.
 *
 * 1 means the dip passed through untouched; > 1 means the compressor gave part of it back. Below 1 would mean the
 * compressor *deepened* it, which nothing here should do.
 */
const survival = (separateDetector: boolean): number => {
  const kernel = new GlueCompressorKernel({ sampleRate: SAMPLE_RATE });
  const detect = separateDetector ? LOUD : null;
  // Settle first: a compressor's first samples are its attack, and measuring them reports the transient.
  for (let i = 0; i < Math.round(SAMPLE_RATE * 0.3); i += 1) kernel.processSample(LOUD, detect);

  // The loud reference: the steady-state gain the programme is under before anything is ducked.
  const loudN = Math.round(SAMPLE_RATE * 0.05);
  let loudSum = 0;
  for (let i = 0; i < loudN; i += 1) loudSum += kernel.processSample(LOUD, detect);

  /**
   * The dip, measured at its **end** — after a self-detecting compressor has had the whole dip to release. A dip
   * shorter than the release would flatter it, and an interleaved sample-by-sample loop (the first version of this
   * test) is not a dip at all: it is a 22 kHz square wave, and both modes smooth it the same way.
   */
  const dipN = Math.round(SAMPLE_RATE * 0.4);
  const tailN = Math.round(SAMPLE_RATE * 0.02);
  let tailSum = 0;
  for (let i = 0; i < dipN; i += 1) {
    const value = kernel.processSample(QUIET, detect);
    if (i >= dipN - tailN) tailSum += value;
  }

  // Gain applied during the dip over gain applied before it: 1 means the dip passed through untouched.
  return tailSum / tailN / QUIET / (loudSum / loudN / LOUD);
};

describe("GLUE — the bus compressor follows a detector of its own", () => {
  it("keeps a dip that the programme's own detector would have refilled", () => {
    const withDetector = survival(true);
    const selfDetected = survival(false);
    /**
     * Measured here: **≈1.00** with a steady detector (the dip passes through untouched) against **≈1.76** when the
     * programme detects itself — over a 0.4 s dip the gain releases most of the way back, which is the refill in its
     * pure form. The node this replaces gives back *more* than this kernel does (it zeroes the median dip), but the
     * difference these cases pin is the one the fix is about: a detector the duck cannot move, versus one it can.
     */
    expect(withDetector).toBeLessThan(1.02);
    expect(selfDetected).toBeGreaterThan(1.5);
  });

  it("computes a soft knee that is continuous at both corners", () => {
    const options = resolveGlueCompressorOptions({ sampleRate: SAMPLE_RATE });
    const slope = 1 - 1 / GLUE_COMP_RATIO;
    // Below the knee: nothing.
    expect(glueCompressorReductionDb(GLUE_COMP_THRESHOLD_DB - GLUE_COMP_KNEE_DB / 2 - 0.01, options)).toBe(0);
    // At the top corner it meets the straight line exactly, which is what stops the knee from clicking.
    const top = GLUE_COMP_THRESHOLD_DB + GLUE_COMP_KNEE_DB / 2;
    expect(glueCompressorReductionDb(top, options)).toBeCloseTo((GLUE_COMP_KNEE_DB / 2) * slope, 9);
    // …and beyond it follows `over × (1 − 1/ratio)`.
    expect(glueCompressorReductionDb(top + 10, options)).toBeCloseTo((GLUE_COMP_KNEE_DB / 2 + 10) * slope, 9);
  });

  it("defaults to the stage it replaces, and clamps what it cannot use", () => {
    const options = resolveGlueCompressorOptions({});
    expect(options.thresholdDb).toBe(GLUE_COMP_THRESHOLD_DB);
    expect(options.kneeDb).toBe(GLUE_COMP_KNEE_DB);
    expect(options.ratio).toBe(GLUE_COMP_RATIO);
    expect(options.attackSec).toBe(GLUE_COMP_ATTACK_SEC);
    expect(options.releaseSec).toBe(GLUE_COMP_RELEASE_SEC);
    // A ratio below 1 would be an expander and a negative time constant would be nonsense; both clamp, and an
    // unreadable number falls back rather than propagating `NaN` into every sample.
    expect(resolveGlueCompressorOptions({ ratio: 0.2 }).ratio).toBe(1);
    expect(resolveGlueCompressorOptions({ attackSec: -1 }).attackSec).toBe(0);
    expect(resolveGlueCompressorOptions({ thresholdDb: Number.NaN }).thresholdDb).toBe(GLUE_COMP_THRESHOLD_DB);
  });

  it("reports the reduction it is applying, and reset clears it", () => {
    const kernel = new GlueCompressorKernel({ sampleRate: SAMPLE_RATE });
    for (let i = 0; i < 8000; i += 1) kernel.processSample(LOUD, LOUD);
    expect(kernel.gainReductionDb).toBeGreaterThan(0);
    kernel.reset();
    expect(kernel.gainReductionDb).toBe(0);
  });
});
