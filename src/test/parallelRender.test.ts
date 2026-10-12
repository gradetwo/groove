import { describe, expect, it } from "vitest";
import { ChunkMergeError, mergeRenderedChunks, planRenderSpans, renderChunksConcurrently, type MergeableChunk } from "../audio/parallelRender";

/**
 * ⭐ **The merge is where a chunked render becomes the same music again.**
 *
 * A seam error is a click or a stutter: inaudible in a twenty-minute probe unless you are listening for it, obvious in
 * arithmetic. So these cases work on a reference signal the "chunks" are cuts of, and the claim is exact — outside the
 * crossfade the merged audio is the reference **sample for sample**, and with the pre-roll removed the merge
 * *cannot* be, which is what makes the pre-roll a measured requirement rather than a belief.
 */
class FakeBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly data: Float32Array[];
  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    return this.data[channel]!;
  }
  copyToChannel(source: Float32Array, channel: number): void {
    this.data[channel]!.set(source.subarray(0, this.length));
  }
}

/** A reference signal that is not periodic at the chunk length, so a wrong cut shows up as a difference. */
const reference = (frames: number, channels = 2) => {
  const buffer = new FakeBuffer(channels, frames, 48000);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < frames; i += 1) data[i] = Math.sin((i / 97) * (1 + channel)) * 0.6 + Math.sin(i / 13) * 0.2;
  }
  return buffer;
};

/**
 * Cut the reference into chunks the way the renderer does: each chunk holds `preRoll` frames of the audio **before**
 * its bar (or zero, the deliberate mistake) followed by its own range.
 */
const chunkOf = (
  ref: FakeBuffer,
  atFrame: number,
  lengthFrames: number,
  preRoll: number,
  last = false
): MergeableChunk => {
  const from = atFrame - preRoll;
  const buffer = new FakeBuffer(ref.numberOfChannels, preRoll + lengthFrames, ref.sampleRate);
  for (let channel = 0; channel < ref.numberOfChannels; channel += 1) {
    const src = ref.getChannelData(channel);
    const dst = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i += 1) dst[i] = from + i >= 0 ? (src[from + i] ?? 0) : 0;
  }
  return { buffer, atFrame, preRollFrames: preRoll, chunkEndFrame: preRoll + lengthFrames, ...(last ? { last: true } : {}) };
};

const maxDiff = (a: { getChannelData: (c: number) => Float32Array; numberOfChannels: number }, b: { getChannelData: (c: number) => Float32Array }, from: number, to: number) => {
  let worst = 0;
  for (let channel = 0; channel < a.numberOfChannels; channel += 1) {
    const x = a.getChannelData(channel);
    const y = b.getChannelData(channel);
    for (let i = from; i < to; i += 1) worst = Math.max(worst, Math.abs((x[i] ?? 0) - (y[i] ?? 0)));
  }
  return worst;
};

describe("merging rendered chunks", () => {
  const FRAMES = 4000;
  const CHUNK = 1000;
  const PRE_ROLL = 240;

  it("⭐ rebuilds the reference exactly outside the crossfade, and blends only at the seams", () => {
    const ref = reference(FRAMES);
    const chunks = [0, 1, 2, 3].map((k) => chunkOf(ref, k * CHUNK, CHUNK, PRE_ROLL, k === 3));
    const { buffer, report } = mergeRenderedChunks(chunks, { crossfadeFrames: 32 });

    expect(report.frames).toBe(FRAMES);
    expect(report.clipped).toBe(false);
    // Three seams (chunks 1..3), each blended over the stated window.
    expect(report.crossfaded.map((s) => s.atFrame)).toEqual([1000, 2000, 3000]);
    expect(report.crossfaded.every((s) => s.frames === 32)).toBe(true);

    // ⭐ The claim: outside the crossfade windows the merge is the reference sample for sample.
    const windows = report.crossfaded.map((s) => [s.atFrame, s.atFrame + s.frames] as const);
    let outside = 0;
    let cursor = 0;
    for (const [from, to] of windows) {
      outside = Math.max(outside, maxDiff(buffer, ref, cursor, from));
      cursor = to;
    }
    outside = Math.max(outside, maxDiff(buffer, ref, cursor, FRAMES));
    expect(outside).toBe(0);
  });

  it("⭐ without the pre-roll the same cut cannot be the reference — which is what makes the pre-roll a requirement", () => {
    const ref = reference(FRAMES);
    const chunks = [0, 1, 2, 3].map((k) => chunkOf(ref, k * CHUNK, CHUNK, 0, k === 3));
    const { buffer } = mergeRenderedChunks(chunks, { crossfadeFrames: 32 });
    // With nothing before each bar, the reverb's state and every sounding voice are missing at the seam; the merge is
    // a hard cut of the music. The difference is not float noise, and that is the point of the pre-roll.
    expect(maxDiff(buffer, ref, 0, FRAMES)).toBeGreaterThan(0);
  });

  it("refuses chunks that do not agree on rate or channels, and places them by `atFrame`, not by order", () => {
    const ref = reference(FRAMES);
    const a = chunkOf(ref, 0, CHUNK, PRE_ROLL);
    const mismatched = { ...chunkOf(ref, CHUNK, CHUNK, PRE_ROLL), buffer: new FakeBuffer(2, PRE_ROLL + CHUNK, 44100) };
    expect(() => mergeRenderedChunks([a, mismatched])).toThrow(ChunkMergeError);
    const mono = { ...chunkOf(ref, CHUNK, CHUNK, PRE_ROLL), buffer: new FakeBuffer(1, PRE_ROLL + CHUNK, 48000) };
    expect(() => mergeRenderedChunks([a, mono])).toThrow(/channel/);

    // Given the chunks out of order, the merge still writes them where their `atFrame` says.
    const outOfOrder = [chunkOf(ref, CHUNK, CHUNK, PRE_ROLL, true), chunkOf(ref, 0, CHUNK, PRE_ROLL)];
    const { buffer } = mergeRenderedChunks(outOfOrder, { crossfadeFrames: 0 });
    expect(maxDiff(buffer, ref, 0, 2 * CHUNK)).toBe(0);
  });

  it("keeps the last chunk's tail, and lets the caller pin the total length", () => {
    const ref = reference(FRAMES + 500);
    // The last chunk carries 500 frames of reverb tail past its own end.
    const chunks = [chunkOf(ref, 0, CHUNK, 0), { ...chunkOf(ref, CHUNK, CHUNK, 0), last: true, chunkEndFrame: CHUNK, buffer: (() => {
      const b = new FakeBuffer(2, CHUNK + 500, 48000);
      for (let channel = 0; channel < 2; channel += 1) {
        const src = ref.getChannelData(channel);
        b.getChannelData(channel).set(src.subarray(CHUNK, CHUNK + CHUNK + 500));
      }
      return b;
    })() }];
    const { buffer, report } = mergeRenderedChunks(chunks);
    expect(report.frames).toBe(CHUNK + CHUNK + 500);
    expect(maxDiff(buffer, ref, 0, CHUNK + CHUNK + 500)).toBe(0);

    const pinned = mergeRenderedChunks(chunks, { totalFrames: 1500 });
    expect(pinned.report.frames).toBe(1500);
    expect(pinned.report.clipped).toBe(true);
    expect(pinned.report.padded).toBe(false);
    // A stated length longer than the chunks hold is the caller asking for silence at the end, and it is reported.
    const padded = mergeRenderedChunks(chunks, { totalFrames: 3000 });
    expect(padded.report.frames).toBe(3000);
    expect(padded.report.padded).toBe(true);
  });
});

/**
 * ⭐ **The orchestration: bounded concurrency, progress per span, and the merge at the end.**
 *
 * The bound is not decoration: the measured curve (`scratch/parallel-render-probe.mjs`) has K `OfflineAudioContext`s
 * at ≈2.8× throughput at K=4, and starting every span at once makes later ones queue behind the first — while the
 * pre-roll each of them renders is work already done. So the claim is "at most `concurrency` renders in flight", and
 * it is checked by counting, not by timing.
 */
describe("rendering spans concurrently", () => {
  const FRAMES = 4000;
  const CHUNK = 1000;
  const PRE_ROLL = 240;

  it("⭐ never runs more than `concurrency` spans at once, reports each one, and returns the merged audio", async () => {
    const ref = reference(FRAMES);
    let inFlight = 0;
    let peak = 0;
    const order: number[] = [];
    const spans = [0, 1, 2, 3].map((k) => ({ fromBar: k, toBar: k + 1, atFrame: k * CHUNK, last: k === 3 }));
    const result = await renderChunksConcurrently(
      spans,
      async (span) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        const chunk = chunkOf(ref, span.atFrame, CHUNK, PRE_ROLL, span.last);
        inFlight -= 1;
        order.push(span.fromBar);
        return { buffer: chunk.buffer, preRollFrames: PRE_ROLL, chunkEndFrame: PRE_ROLL + CHUNK };
      },
      { concurrency: 2, crossfadeFrames: 0, onSpanDone: (done, total) => expect(total).toBe(4) }
    );

    expect(peak).toBeLessThanOrEqual(2);
    expect(order.sort()).toEqual([0, 1, 2, 3]);
    expect(result.report.frames).toBe(FRAMES);
    // With no crossfade the merge is the reference everywhere, which is the same claim the merge cases make.
    expect(maxDiff(result.buffer, ref, 0, FRAMES)).toBe(0);
    expect(result.spanMs).toHaveLength(4);
  });

  it("refuses an empty plan rather than returning silence", async () => {
    await expect(renderChunksConcurrently([], async () => ({ buffer: new FakeBuffer(2, 1, 48000), preRollFrames: 0, chunkEndFrame: 1 }))).rejects.toThrow(ChunkMergeError);
  });
});

/**
 * ⭐ **The span plan: every bar once, in order, and the music placed where the merge expects it.**
 *
 * A missing bar is silence and a repeated bar is a stutter, and neither is attributable by ear in a long render — so
 * the plan is checked as arithmetic, the way `planRenderChunks`' own criterion does it on the other road.
 */
describe("planning render spans", () => {
  it("⭐ covers every bar once, in order, with the last span carrying the end", () => {
    for (const [totalBars, chunks] of [[126, 4], [126, 3], [8, 4], [5, 8], [1, 4]] as const) {
      const spans = planRenderSpans({ totalBars, chunks, framesPerBar: 1000 });
      expect(spans[0]!.fromBar).toBe(0);
      expect(spans.at(-1)!.toBar).toBe(totalBars);
      for (let i = 1; i < spans.length; i += 1) expect(spans[i]!.fromBar).toBe(spans[i - 1]!.toBar);
      expect(spans.filter((s) => s.last)).toHaveLength(1);
      expect(spans.at(-1)!.last).toBe(true);
      // The absolute frame is the bar's own, so two spans can never claim the same music.
      for (const span of spans) expect(span.atFrame).toBe(span.fromBar * 1000);
    }
    // 126 bars in four spans is 32/32/32/30 — the last one shorter, never a gap.
    expect(planRenderSpans({ totalBars: 126, chunks: 4, framesPerBar: 1000 }).map((s) => s.toBar - s.fromBar)).toEqual([32, 32, 32, 30]);
    // More chunks than bars is clamped: one bar each, and no empty span at the end.
    expect(planRenderSpans({ totalBars: 5, chunks: 8, framesPerBar: 10 })).toHaveLength(5);
    expect(planRenderSpans({ totalBars: 0, chunks: 4, framesPerBar: 10 })).toEqual([]);
  });
});
