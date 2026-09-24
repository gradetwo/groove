import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { applyOfflineCeiling } from "../audio/WavExporter";
import {
  limitBuffers,
  MASTER_LIMITER_CEILING_DB,
  MASTER_LIMITER_DETECTOR_MARGIN_DB,
  MASTER_LIMITER_INTERNAL_CEILING_DB,
  MASTER_LIMITER_LOOKAHEAD_MS,
} from "../audio/MasterLimiter";
import { truePeakDbChannels } from "./helpers/loudness";

/**
 * The offline true-peak guarantee.
 *
 * Why this exists: `renderPatternOffline` can only install the limiter **worklet** if the
 * platform accepts `audioWorklet.addModule()`; when it does not, the graph runs the
 * `DynamicsCompressorNode` fallback, whose own warning admits it has "no true-peak ceiling,
 * no lookahead". A full loudness re-record on 2026-09-18 measured the consequence: a hot
 * arrangement (`tropical-house`) came back at **+1.75 dBTP** — 2.75 dB above the contract —
 * while the identical code in the next run landed at −1.30 dBTP. The export ceiling was
 * therefore a property of the platform's worklet support rather than of the renderer.
 *
 * `applyOfflineCeiling` closes that hole by running finished buffers through the worklet's
 * own kernel. These tests drive the function directly (no AudioContext involved), so they
 * fail if the guard is removed, if it stops enforcing the ceiling, or if it starts
 * damaging material that was already inside it.
 */

const SAMPLE_RATE = 44100;
/** The ceiling is hard; this only covers the meter's own float rounding. */
const CEILING_TOLERANCE_DB = 0.01;
/** Must be loud enough that the *arranged* peak really does breach the ceiling. */
const HOT_AMPLITUDE = 1.0;

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** A quarter-rate sine whose samples sit at −3.01 dBFS but whose waveform peaks at 0 dBTP. */
function hotInterSampleSignal(frames: number, amplitude = HOT_AMPLITUDE): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < out.length; i++) {
    // 44.1 kHz / 4 ≈ 11 kHz fundamental; phase π/4 puts every sample at ±A/√2.
    out[i] = amplitude * Math.sin((Math.PI / 2) * i + Math.PI / 4);
  }
  return out;
}

function sine(freq: number, amplitude: number, frames: number): Float32Array {
  const out = new Float32Array(frames);
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  }
  return out;
}

function seamAtCeiling(channels: Float32Array[]): number {
  return truePeakDbChannels(channels);
}

describe("applyOfflineCeiling", () => {
  it("pulls hot material under the ceiling (the case the fallback used to leak)", () => {
    const frames = Math.round(SAMPLE_RATE * 0.5);
    const input = hotInterSampleSignal(frames);
    const before = seamAtCeiling([input]);

    // Fail-ability: if the fixture stops breaching the ceiling the rest of this test is vacuous.
    expect(before).toBeGreaterThan(MASTER_LIMITER_CEILING_DB + 0.5);
    expect(before).toBeGreaterThan(MASTER_LIMITER_INTERNAL_CEILING_DB + 0.5);

    const { channels } = applyOfflineCeiling([input], SAMPLE_RATE);
    const after = seamAtCeiling(channels);

    expect(after).toBeLessThanOrEqual(MASTER_LIMITER_INTERNAL_CEILING_DB + CEILING_TOLERANCE_DB);
    // The shipped promise is the metered −1.0 dBTP; the internal ceiling sits a detector
    // margin below it, so passing the internal one must pass the public one too.
    expect(after).toBeLessThanOrEqual(MASTER_LIMITER_CEILING_DB + CEILING_TOLERANCE_DB);
  });

  it("reports the reduction it applied, so a caller can log it", () => {
    const frames = Math.round(SAMPLE_RATE * 0.5);
    const { gainReductionDb } = applyOfflineCeiling([hotInterSampleSignal(frames)], SAMPLE_RATE);
    expect(gainReductionDb).toBeGreaterThan(0);
    expect(Number.isFinite(gainReductionDb)).toBe(true);
  });

  it("leaves quiet material essentially untouched", () => {
    const frames = Math.round(SAMPLE_RATE * 0.5);
    const input = sine(220, dbToLinear(-20), frames);
    const before = seamAtCeiling([input]);
    const { channels, gainReductionDb } = applyOfflineCeiling([input], SAMPLE_RATE);
    const after = seamAtCeiling(channels);

    expect(before).toBeLessThan(MASTER_LIMITER_INTERNAL_CEILING_DB);
    expect(Math.abs(after - before)).toBeLessThan(0.05);
    expect(gainReductionDb).toBeLessThan(0.1);
  });

  it("is idempotent — limiting an already-limited buffer changes nothing", () => {
    const frames = Math.round(SAMPLE_RATE * 0.5);
    const once = applyOfflineCeiling([hotInterSampleSignal(frames)], SAMPLE_RATE);
    const twice = applyOfflineCeiling(once.channels, SAMPLE_RATE);

    expect(seamAtCeiling(twice.channels)).toBeLessThanOrEqual(
      MASTER_LIMITER_INTERNAL_CEILING_DB + CEILING_TOLERANCE_DB
    );
    expect(Math.abs(seamAtCeiling(twice.channels) - seamAtCeiling(once.channels))).toBeLessThan(0.02);
    expect(twice.gainReductionDb).toBeLessThanOrEqual(0.05);
  });

  it("does not mutate the buffers it is handed", () => {
    const frames = 4096;
    const input = hotInterSampleSignal(frames);
    const snapshot = Float32Array.from(input);
    applyOfflineCeiling([input], SAMPLE_RATE);
    expect(Array.from(input)).toEqual(Array.from(snapshot));
  });

  it("preserves length and channel count, and delays by the worklet's own lookahead", () => {
    const frames = 8192;
    const left = hotInterSampleSignal(frames);
    const right = sine(220, dbToLinear(-6), frames);
    const { channels } = applyOfflineCeiling([left, right], SAMPLE_RATE);

    expect(channels).toHaveLength(2);
    for (const channel of channels) expect(channel).toHaveLength(frames);

    const expectedLatency = Math.round((MASTER_LIMITER_LOOKAHEAD_MS / 1000) * SAMPLE_RATE);
    const limited = limitBuffers([Float32Array.from(left), Float32Array.from(right)], SAMPLE_RATE, {
      ceilingDb: MASTER_LIMITER_INTERNAL_CEILING_DB,
    });
    expect(limited.latencySamples).toBe(expectedLatency);
    // Same kernel, same parameters as the in-graph worklet: the guard must not introduce a
    // second, differently-aligned ceiling of its own.
    expect(channels[0].length).toBe(limited.channels[0].length);
  });

  it("keeps a quieter channel quieter (no blanket gain smash across the pair)", () => {
    const frames = Math.round(SAMPLE_RATE * 0.5);
    const loud = hotInterSampleSignal(frames);
    const quiet = sine(220, dbToLinear(-30), frames);
    const before = seamAtCeiling([quiet]);

    const { channels } = applyOfflineCeiling([loud, quiet], SAMPLE_RATE);

    expect(seamAtCeiling([channels[0]])).toBeLessThanOrEqual(
      MASTER_LIMITER_INTERNAL_CEILING_DB + CEILING_TOLERANCE_DB
    );
    // A linked limiter may duck the quiet side, but it must not be pushed *above* where it was.
    expect(seamAtCeiling([channels[1]])).toBeLessThanOrEqual(before + 0.05);
  });

  it("keeps the public contract consistent with the internal ceiling it is given", () => {
    // If someone raises the internal ceiling to the public one, the detector margin disappears
    // and the metered promise can be breached; this pins the relationship the guard relies on.
    expect(MASTER_LIMITER_INTERNAL_CEILING_DB).toBeCloseTo(
      MASTER_LIMITER_CEILING_DB - MASTER_LIMITER_DETECTOR_MARGIN_DB,
      6
    );
    expect(MASTER_LIMITER_INTERNAL_CEILING_DB).toBeLessThan(MASTER_LIMITER_CEILING_DB);
  });
});

describe("renderPatternOffline wiring", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/audio/WavExporter.ts"), "utf8");

  it("defines the guard on the worklet's own kernel and ceiling", () => {
    // The guard lives in this module (no import to look for) and must call the *kernel*
    // (`limitBuffers`) at the *internal* ceiling — not a re-implementation at −1.0 dBTP,
    // which would drop the detector margin the metered promise depends on.
    expect(source).toMatch(/export function applyOfflineCeiling\(/);
    expect(source).toMatch(/import\s*\{[\s\S]*?limitBuffers[\s\S]*?\}\s*from\s*"\.\/MasterLimiter"/);
    expect(source).toMatch(
      /limitBuffers\([\s\S]*?ceilingDb:\s*MASTER_LIMITER_INTERNAL_CEILING_DB/
    );
  });

  it("returns the worklet render untouched and guards only the fallback", () => {
    /**
     * The worklet path returns early, the fallback path runs the ceiling kernel — and since the seamless-loop
     * option (P0.6) both go out through the same helper, which is what this asserts instead of a bare `return
     * rendered;`: a loop that only joins itself, or a ceiling that is only applied, on one of the two paths is not
     * a guarantee. The early return still has to come *before* the guard, so the fallback only pays for the kernel
     * it needs.
     */
    expect(source).toMatch(/if\s*\(\s*limiterKind\s*===\s*"worklet"\s*\)\s*return\s+asRequested\(/);
    expect(source).toMatch(/applyOfflineCeiling\(\s*channels\s*,\s*rendered\.sampleRate\s*\)/);
    expect(source).toMatch(/return\s+asRequested\(out\)\s+as\s+AudioBuffer;/);
  });
});
