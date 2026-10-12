/**
 * ⭐ **Merging rendered chunks back into one piece of audio.**
 *
 * The renderer can already render a bar range on its own (`RenderWavOptions.fromBar` + `preRollSec`, and
 * `renderPatternChunkOffline` hands back the timeline a merge needs), and `planRenderChunks` can cut a song into
 * ranges that cover it once, in order, with no gap. What was missing is the step between them: **putting the pieces
 * back together**. That is this module, and it is pure on purpose — a seam error is a click or a stutter that a
 * twenty-minute probe tells you about only if you are listening for it, while here it is arithmetic a criterion can
 * check.
 *
 * **Why a chunk is not its own file.** Each chunk is rendered with `preRollFrames` of warm-up in front of the bar it
 * was asked for: the reverb and the limiter are already doing at the boundary what the whole render had them doing
 * there. Those frames are *the previous chunk's audio* (rendered again), so they are dropped and — over the first
 * `crossfadeFrames` of each chunk after the first — blended with the tail of the chunk before it rather than cut
 * against it. The blend is what makes a seam inaudible when the two renders differ by more than float noise (a
 * different voice phase, a sample that decoded a frame differently), and it costs one multiply per frame.
 *
 * **What this deliberately does not do.** It does not touch the last chunk's tail: a file must not stop while the
 * reverb is still sounding, and `RenderedChunk` already states where the music stops (`chunkEndFrame`) so a caller
 * that wants the loop-only shape can trim it itself.
 */

/** One rendered chunk, placed on the absolute timeline the merge writes into. */
export interface MergeableChunk {
  /**
   * The chunk's audio: `preRollFrames` of warm-up, then the music from its `atFrame`.
   *
   * `AudioBuffer` in the browser; the offline suite passes a double with the same four members, which is why this
   * module never constructs one itself.
   */
  buffer: {
    numberOfChannels: number;
    length: number;
    sampleRate: number;
    /** Present on a real `AudioBuffer`; a merge-time object may state it so a reply can quote a duration. */
    duration?: number;
    getChannelData: (channel: number) => Float32Array;
  };
  /** The absolute frame where this chunk's **music** begins (its first requested bar). */
  atFrame: number;
  /** Frames of `buffer` that precede that music — dropped, not written. */
  preRollFrames: number;
  /**
   * Where the chunk's own audio ends, in its buffer's frames. Bytes after it are the renderer's tail; the merge keeps
   * them for the last chunk only.
   */
  chunkEndFrame: number;
  /** True for the chunk that carries the piece's end, whose tail is part of the file. */
  last?: boolean;
}

export interface MergeChunkOptions {
  /** Total frames of the merged audio. Derived from the chunks when omitted. */
  totalFrames?: number;
  /**
   * Frames at the head of each chunk after the first that are blended with what is already there instead of written
   * over it. Zero is the deliberate mistake the criterion exists to catch.
   */
  crossfadeFrames?: number;
}

/** A rectangle of the timeline that the merge did not get from exactly one chunk — reported, not hidden. */
export interface MergeReport {
  frames: number;
  channels: number;
  crossfaded: Array<{ atFrame: number; frames: number }>;
  /** True when a chunk's own audio ran past `totalFrames` and was cut. */
  clipped: boolean;
  /** True when the stated length is longer than the chunks' own audio, so the end is silence. */
  padded: boolean;
}

export class ChunkMergeError extends Error {}

/**
 * Put the chunks back together, in absolute-frame space.
 *
 * The caller states where each chunk's music begins (`atFrame`) rather than this module deriving it from bars and a
 * tempo: a tempo map makes "bar 40" a different number of frames in two places, and a merge that guessed would be
 * wrong exactly where a piece changes speed.
 */
export function mergeRenderedChunks(
  chunks: readonly MergeableChunk[],
  options: MergeChunkOptions = {}
): { buffer: { numberOfChannels: number; length: number; sampleRate: number; getChannelData: (c: number) => Float32Array }; report: MergeReport } {
  if (chunks.length === 0) throw new ChunkMergeError("no chunks to merge");
  const sampleRate = chunks[0]!.buffer.sampleRate;
  const channels = chunks[0]!.buffer.numberOfChannels;
  for (const [index, chunk] of chunks.entries()) {
    if (chunk.buffer.sampleRate !== sampleRate) {
      throw new ChunkMergeError(`chunk ${index} is ${chunk.buffer.sampleRate} Hz against the first chunk's ${sampleRate} Hz`);
    }
    if (chunk.buffer.numberOfChannels !== channels) {
      throw new ChunkMergeError(`chunk ${index} has ${chunk.buffer.numberOfChannels} channel(s) against the first chunk's ${channels}`);
    }
    if (chunk.atFrame < 0 || chunk.preRollFrames < 0 || chunk.chunkEndFrame < chunk.preRollFrames) {
      throw new ChunkMergeError(`chunk ${index} has an impossible window (at ${chunk.atFrame}, pre-roll ${chunk.preRollFrames}, end ${chunk.chunkEndFrame})`);
    }
  }

  const sorted = [...chunks].sort((a, b) => a.atFrame - b.atFrame);
  /**
   * The length: the last chunk's own end, or the caller's `totalFrames` when it asked for one (a fixed-length
   * deliverable, e.g. a loop). Derived rather than summed, because the chunks overlap by construction — the pre-roll
   * of each is the previous chunk's audio — and a sum would count those frames twice.
   */
  const last = sorted[sorted.length - 1]!;
  const derived = last.atFrame + Math.max(0, (last.last === true ? last.buffer.length : last.chunkEndFrame) - last.preRollFrames);
  /**
   * ⭐ **A stated length is the caller's decision, not a floor.** A loop asset is pinned to its own length (shorter
   * than the render, whose tail is folded in elsewhere), and a deliverable padded to a fixed duration is longer than
   * what the chunks hold. The first version took `max(derived, stated)`, which silently ignored both — the criterion
   * caught it, and the report now says which way the difference went.
   */
  const totalFrames = options.totalFrames === undefined ? derived : Math.max(0, Math.floor(options.totalFrames));
  const padded = totalFrames > derived;
  const crossfade = Math.max(0, Math.floor(options.crossfadeFrames ?? 0));

  const data: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(totalFrames));
  const crossfaded: Array<{ atFrame: number; frames: number }> = [];
  let clipped = false;

  sorted.forEach((chunk, index) => {
    const source = chunk.buffer;
    const start = chunk.atFrame;
    const first = Math.max(0, chunk.preRollFrames);
    const lastFrame = chunk.last === true ? source.length : Math.min(source.length, chunk.chunkEndFrame);
    const available = Math.max(0, lastFrame - first);
    const wanted = Math.max(0, totalFrames - start);
    const frames = Math.min(available, wanted);
    if (available > wanted) clipped = true;
    if (frames === 0) return;
    const fade = index === 0 ? 0 : Math.min(crossfade, frames);
    if (fade > 0) crossfaded.push({ atFrame: start, frames: fade });
    for (let channel = 0; channel < channels; channel += 1) {
      const from = source.getChannelData(channel);
      const to = data[channel]!;
      // ⭐ Every chunk after the first is blended in over its head rather than written over the tail before it: a
      // hard cut is where a click lives, and the two renders differ by more than float noise at a voice's phase.
      for (let i = 0; i < fade; i += 1) {
        const w = (i + 1) / (fade + 1);
        to[start + i] = to[start + i]! * (1 - w) + (from[first + i] ?? 0) * w;
      }
      for (let i = fade; i < frames; i += 1) to[start + i] = from[first + i] ?? 0;
    }
  });

  return { buffer: { numberOfChannels: channels, length: totalFrames, sampleRate, getChannelData: (c: number) => data[c]! }, report: { frames: totalFrames, channels, crossfaded, clipped, padded } };
}

/** One span to render, and where its music lands on the absolute timeline. */
export interface RenderSpan {
  fromBar: number;
  /** Exclusive. */
  toBar: number;
  /** The absolute frame this span's music starts at. */
  atFrame: number;
  /** True for the span that carries the piece's end (its tail is part of the file). */
  last: boolean;
}

export interface ConcurrentRenderOptions {
  /** How many spans may be in flight at once. Four is where the measured curve flattens on an eight-core machine. */
  concurrency?: number;
  crossfadeFrames?: number;
  totalFrames?: number;
  /** Called as each span lands, for a progress line — the reason the export can now say something (W7). */
  onSpanDone?: (done: number, total: number, span: RenderSpan) => void;
}

/**
 * ⭐ **Render the spans at the same time, then merge them.**
 *
 * The measurement that decided this shape (`scratch/parallel-render-probe.mjs`): K `OfflineAudioContext`s rendering at
 * once reach ≈2.8× the throughput at K=4 and ≈3.3× at K=8, and **K contexts in one page are as good as K pages** —
 * so no worker or page orchestration is needed, only a bound on how many renders are in flight. The bound is the
 * important half: starting every span at once makes the last ones queue behind the first and wastes the pre-roll
 * work the renderer has already done.
 */
export async function renderChunksConcurrently(
  spans: readonly RenderSpan[],
  renderOne: (span: RenderSpan) => Promise<Omit<MergeableChunk, "atFrame" | "preRollFrames" | "chunkEndFrame" | "last"> & { preRollFrames: number; chunkEndFrame: number }>,
  options: ConcurrentRenderOptions = {}
): Promise<{ buffer: ReturnType<typeof mergeRenderedChunks>["buffer"]; report: MergeReport; spanMs: number[] }> {
  if (spans.length === 0) throw new ChunkMergeError("nothing to render");
  const limit = Math.max(1, Math.floor(options.concurrency ?? 4));
  const chunks: MergeableChunk[] = new Array(spans.length) as MergeableChunk[];
  const spanMs: number[] = new Array(spans.length).fill(0) as number[];
  let next = 0;
  let done = 0;

  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      const span = spans[index];
      if (span === undefined) return;
      const started = Date.now();
      const rendered = await renderOne(span);
      spanMs[index] = Date.now() - started;
      chunks[index] = {
        buffer: rendered.buffer,
        atFrame: span.atFrame,
        preRollFrames: rendered.preRollFrames,
        chunkEndFrame: rendered.chunkEndFrame,
        ...(span.last ? { last: true } : {}),
      };
      done += 1;
      options.onSpanDone?.(done, spans.length, span);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, spans.length) }, worker));
  const merged = mergeRenderedChunks(chunks, {
    ...(options.crossfadeFrames === undefined ? {} : { crossfadeFrames: options.crossfadeFrames }),
    ...(options.totalFrames === undefined ? {} : { totalFrames: options.totalFrames }),
  });
  return { ...merged, spanMs };
}

/**
 * ⭐ **Cut a length into the spans the reactor renders, in absolute frames.**
 *
 * The bars are split evenly (`ceil(totalBars / chunks)` each) rather than at section boundaries: a section boundary is
 * a preference for *music*, and the renderer's own boundary support is the pre-roll, which makes any bar line safe.
 * `planRenderChunks` in `mcp/render/chunks.ts` remains the section-aware planner for the progress-shaped cuts on that
 * road; this is the arithmetic the merge needs, and it is here so it can be checked without a browser.
 *
 * `framesPerBar` comes from the caller because a tempo map makes a bar a different number of frames in different
 * places — this module will not guess a tempo.
 */
export function planRenderSpans(input: {
  totalBars: number;
  chunks: number;
  framesPerBar: number;
}): RenderSpan[] {
  const totalBars = Math.max(0, Math.floor(input.totalBars));
  const perBar = Math.max(1, Math.floor(input.framesPerBar));
  if (totalBars === 0) return [];
  const wanted = Math.max(1, Math.min(Math.floor(input.chunks), totalBars));
  const size = Math.ceil(totalBars / wanted);
  const spans: RenderSpan[] = [];
  for (let from = 0; from < totalBars; from += size) {
    const to = Math.min(totalBars, from + size);
    spans.push({ fromBar: from, toBar: to, atFrame: from * perBar, last: to === totalBars });
  }
  return spans;
}
