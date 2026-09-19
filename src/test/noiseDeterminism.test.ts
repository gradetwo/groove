/**
 * V-01 — determinism of the noise bed (AUDIO_QUALITY_AND_SYNTH_PLAN.md §4.4).
 *
 * Before this work the drum noise buffer, the reverb impulse and the offline
 * renderer's noise bed were all built from `Math.random()`. Two consequences:
 *
 *   1. An exported WAV could never be guaranteed to match the audition it was rendered
 *      from — the project's "exporter parity" rule was silently violated.
 *   2. No sample-level regression gate was possible: repeated renders of the same
 *      pattern disagreed, which is why the loudness baseline had to carry a tolerance.
 *
 * These tests pin the seeded behaviour *and* guard against a regression back to
 * `Math.random()`, because that regression is invisible at the type level and would
 * only show up as a flaky measurement months later.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_NOISE_SEED,
  fillWhiteNoise,
  createSeededNoiseBuffer,
  noiseOffsetForHit,
  hashSeed,
} from "../audio/noise";
import { FakeAudioContext } from "./helpers/fakeAudio";

describe("fillWhiteNoise", () => {
  it("is reproducible for the same seed", () => {
    const a = new Float32Array(1024);
    const b = new Float32Array(1024);
    fillWhiteNoise(a, DEFAULT_NOISE_SEED);
    fillWhiteNoise(b, DEFAULT_NOISE_SEED);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("produces different noise for different seeds", () => {
    const a = new Float32Array(1024);
    const b = new Float32Array(1024);
    fillWhiteNoise(a, 1);
    fillWhiteNoise(b, 2);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("stays inside [-1, 1]", () => {
    const data = new Float32Array(8192);
    fillWhiteNoise(data, DEFAULT_NOISE_SEED);
    for (const v of data) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is not silent and not DC-offset", () => {
    const data = new Float32Array(4096);
    fillWhiteNoise(data, DEFAULT_NOISE_SEED);
    const mean = data.reduce((s, v) => s + v, 0) / data.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(data.some((v) => Math.abs(v) > 0.1)).toBe(true);
  });

  it("returns the advanced state so a stream can continue", () => {
    const first = new Float32Array(64);
    const next = fillWhiteNoise(first, DEFAULT_NOISE_SEED);
    const continued = new Float32Array(64);
    fillWhiteNoise(continued, next);

    // Continuing the stream must equal one longer draw.
    const whole = new Float32Array(128);
    fillWhiteNoise(whole, DEFAULT_NOISE_SEED);
    expect(Array.from(continued)).toEqual(Array.from(whole.slice(64)));
  });
});

describe("createSeededNoiseBuffer", () => {
  it("produces identical data on two independent contexts", () => {
    // This is the property exporter parity depends on: the live engine and the offline
    // renderer are different contexts, and they must still agree sample for sample.
    const live = new FakeAudioContext() as unknown as BaseAudioContext;
    const offline = new FakeAudioContext() as unknown as BaseAudioContext;

    const a = createSeededNoiseBuffer(live, 2);
    const b = createSeededNoiseBuffer(offline, 2);

    expect(a.length).toBe(b.length);
    expect(Array.from(a.getChannelData(0))).toEqual(Array.from(b.getChannelData(0)));
  });

  it("honours the requested duration and sample rate", () => {
    const ctx = new FakeAudioContext() as unknown as BaseAudioContext;
    const buf = createSeededNoiseBuffer(ctx, 2);
    expect(buf.sampleRate).toBe(44100);
    expect(buf.length).toBe(88200);
    expect(buf.numberOfChannels).toBe(1);
  });
});

describe("noiseOffsetForHit", () => {
  it("is deterministic", () => {
    expect(noiseOffsetForHit(7, 88200, 4096)).toBe(noiseOffsetForHit(7, 88200, 4096));
  });

  it("always leaves the requested headroom so start() cannot read past the end", () => {
    const bufferLength = 88200;
    const needed = 8000;
    for (let position = 0; position < 512; position++) {
      const offset = noiseOffsetForHit(position, bufferLength, needed);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset + needed).toBeLessThanOrEqual(bufferLength);
    }
  });

  it("decorrelates neighbouring hits instead of repeating one slice", () => {
    // The defect this prevents: every hit read from sample 0, so a 16th-note hat
    // pattern was the same 60 ms of samples repeated byte-for-byte.
    const offsets = new Set<number>();
    for (let position = 0; position < 64; position++) {
      offsets.add(noiseOffsetForHit(position, 88200, 4096));
    }
    // A handful of collisions is expected from hashing; "all the same" is the bug.
    expect(offsets.size).toBeGreaterThan(50);
  });

  it("does not collapse to 0 when the buffer barely fits", () => {
    expect(noiseOffsetForHit(3, 100, 100)).toBe(0);
    expect(noiseOffsetForHit(3, 0, 10)).toBe(0);
  });
});

describe("hashSeed", () => {
  it("is stable and spreads small integers", () => {
    expect(hashSeed(0)).toBe(hashSeed(0));
    const seen = new Set<number>();
    for (let i = 0; i < 256; i++) seen.add(hashSeed(i));
    expect(seen.size).toBe(256);
  });
});

/**
 * The regression guard. A future edit that reaches back for `Math.random()` in any of
 * these generators would silently un-do V-01 and make every sample-level gate flaky, so
 * it is caught at test time rather than months later in a measurement.
 */
describe("no unseeded randomness in the render paths", () => {
  const root = process.cwd();
  /**
   * Comments are stripped first: the fixes deliberately *document* the old
   * `Math.random()` behaviour, and a naive text match would flag the explanation
   * rather than a call.
   */
  const readCode = (p: string) =>
    fs
      .readFileSync(path.join(root, p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  it("the shared noise module never uses Math.random", () => {
    expect(readCode("src/audio/noise.ts")).not.toMatch(/Math\.random/);
  });

  it("the live engine builds its noise bed without Math.random", () => {
    const src = readCode("src/audio/AudioEngine.ts");
    // Scope the check to the generator itself rather than the whole file, so an unrelated
    // future use elsewhere is not a false positive.
    const start = src.indexOf("private createNoiseBuffer");
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf("private ", start + 10);
    expect(end).toBeGreaterThan(start);
    expect(src.slice(start, end)).not.toMatch(/Math\.random/);
  });

  it("the reverb bus generates its impulse without Math.random (E-09)", () => {
    // The impulse generator moved out of `AudioEngine` into `ReverbBus` when the send bus
    // was rewritten, so the guard has to follow it — otherwise the regression it exists to
    // catch would be invisible in the new home.
    expect(readCode("src/audio/ReverbBus.ts")).not.toMatch(/Math\.random/);
  });

  it("the offline exporter builds its noise bed without Math.random", () => {
    expect(readCode("src/audio/WavExporter.ts")).not.toMatch(/Math\.random/);
  });
});
