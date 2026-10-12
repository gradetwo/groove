import { describe, expect, it } from "vitest";

/**
 * The section-boundary fade, as arithmetic.
 *
 * `flattenSong` returns the step each section starts at; the render path fades there, because a section's hard mute or velocity
 * jump is an audio boundary and the arrangement's *data* must not be edited to express a playback concern
 * (`docs/DAW_MCP_REFACTOR.md`, stage 3). This pins the shape of the fade on a synthetic buffer — a triangle centred on the
 * boundary, nothing at boundary zero, and nothing outside the fade's own window.
 */
const fade = (data: Float32Array, boundaries: number[], stepSec: number, sampleRate: number, fadeMs: number) => {
  // The real code guards on `> 0` before it does anything; the helper has to as well, or "disabled" would still fade one sample.
  if (!(fadeMs > 0)) return;
  const half = Math.max(1, Math.round((fadeMs / 1000 / 2) * sampleRate));
  for (const boundary of boundaries) {
    if (boundary <= 0) continue;
    const at = Math.round(boundary * stepSec * sampleRate);
    if (at <= 0 || at >= data.length) continue;
    const from = Math.max(0, at - half);
    const to = Math.min(data.length, at + half);
    for (let i = from; i < to; i += 1) {
      const distance = Math.abs(i - at) / half;
      data[i] *= Math.max(0, Math.min(1, distance));
    }
  }
};

describe("the section-boundary fade", () => {
  const sampleRate = 48000;
  const stepSec = 0.125; // 120 bpm, sixteenths

  it("is silent at the boundary and untouched outside it", () => {
    const data = new Float32Array(sampleRate * 2); // two seconds of ones
    data.fill(1);
    fade(data, [8], stepSec, sampleRate, 8);
    const at = Math.round(8 * stepSec * sampleRate); // 0.5 s
    expect(data[at]).toBe(0);
    // A 8 ms fade is 192 samples per side at 48 kHz; well outside that the signal is exactly as it was.
    expect(data[at - 500]).toBe(1);
    expect(data[at + 500]).toBe(1);
    // …and inside it, monotonically rising away from the boundary.
    expect(data[at - 100]).toBeGreaterThan(0);
    expect(data[at - 100]).toBeLessThan(1);
    // It rises away from the boundary: closer to `at` is quieter, which is what makes the two sides join.
    expect(data[at - 20]).toBeLessThan(data[at - 100]);
  });

  it("leaves the start of a song alone, because there is nothing before it to fade from", () => {
    const data = new Float32Array(sampleRate * 2).fill(1);
    fade(data, [0], stepSec, sampleRate, 8);
    expect(data[0]).toBe(1);
    expect(Array.from(data).every((value) => value === 1)).toBe(true);
  });

  it("does nothing when the fade is disabled", () => {
    const data = new Float32Array(sampleRate * 2).fill(1);
    fade(data, [8], stepSec, sampleRate, 0);
    expect(Array.from(data).every((value) => value === 1)).toBe(true);
  });
});
