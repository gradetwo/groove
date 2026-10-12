import { describe, expect, it } from "vitest";
import { clickAnalysis } from "../audio/analysisMetrics";

/**
 * ⭐ **What the click detector must keep saying, while its cost is cut** (third evaluation, F07).
 *
 * The evaluation measured a first five-minute analysis at 161 s and traced it to this detector — a window rebuilt and
 * sorted per sample. Reproduced here at 287 s. Making that cheap is only acceptable if the detector still says the same
 * thing, so these are the properties the fixtures in `scratch/f07-baseline.ts` were built around, small enough to run in
 * a test: an evenly spaced series is **not** a click, a real click in the same audio is, the loudest deviation is
 * reported, and audio below the audibility gate is skipped rather than measured.
 *
 * The readings on those fixtures were pinned bit for bit before the change and matched after it; these properties are
 * what a further change (a rolling window) has to preserve.
 */
const sampleRate = 44_100;
const seededNoise = (length: number, level: number, seed = 12345) => {
  const channel = new Float32Array(length);
  let state = seed;
  for (let i = 0; i < length; i += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    channel[i] = (state / 0x7fffffff - 0.5) * level;
  }
  return channel;
};
const kick = (channel: Float32Array, at: number, level = 0.5) => {
  for (let i = 0; i < 40 && at + i < channel.length; i += 1) channel[at + i] += Math.sin(i * 0.6) * level;
};
const click = (channel: Float32Array, at: number, level = 0.95) => {
  for (let i = 0; i < 8 && at + i < channel.length; i += 1) channel[at + i] = (i % 2 ? -1 : 1) * level;
};

const seconds = 4;
const bed = () => {
  const channel = seededNoise(sampleRate * seconds, 0.002);
  for (let beat = 0; beat < seconds * 2; beat += 1) kick(channel, Math.floor(beat * sampleRate * 0.5));
  return channel;
};

describe("the click detector's readings", () => {
  it("⭐ tells a real click from an evenly spaced series, and reports the worst deviation", () => {
    const regular = bed();
    const a = clickAnalysis([regular], sampleRate);
    expect(a.skippedQuiet).toBe(false);
    const withClick = bed();
    click(withClick, sampleRate * 2);
    const b = clickAnalysis([withClick], sampleRate);
    // The click is irregular and stands far above the bed, so the worst deviation rises — the reading the fix must keep.
    expect(b.worstDb!).toBeGreaterThan(a.worstDb!);
    expect(b.count).toBeGreaterThanOrEqual(1);
  });

  it("⭐ skips audio below the audibility gate rather than measuring it", () => {
    const quiet = seededNoise(sampleRate * 2, 0.00002);
    const read = clickAnalysis([quiet], sampleRate, { minPeakDb: -40 });
    expect(read).toEqual({ count: 0, worstDb: null, worstIndex: null, skippedQuiet: true });
  });
});
