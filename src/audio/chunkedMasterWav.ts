/**
 * ⭐ **The chunked master export: the same music, rendered in K spans at once, then merged.**
 *
 * Measured (2026-10-07): one `OfflineAudioContext` renders 5:03 of arrangement audio in **753 s** — 0.40× realtime
 * on **one** core of eight. K concurrent contexts raise the throughput to ≈2.8× at K=4 and ≈3.3× at K=8, and **K
 * contexts in one page are as good as K pages** (`scratch/parallel-render-probe.mjs`), so the parallelism costs no
 * worker or page orchestration. This module is the wiring: plan the spans, render them with the renderer's own
 * `fromBar`/`preRollSec` entry point, merge them, encode.
 *
 * **Why a new module rather than a branch in `exportMasterWav`.** `src/audio/WavExporter.ts` is pinned by
 * `fileSizeBudget.test.ts` at its measured length, deliberately: the twelve largest files may not grow. The chunked
 * road therefore lives here, built from the exporter's exported parts, and `exportMasterWav` is left byte-for-byte the
 * path it always was — which is also what makes it the reference the equivalence test compares against.
 *
 * **What it does not change.** The renderer's options travel unchanged into every span, so a chunk is the same music
 * the whole render puts at those bars (the renderer keys everything that varies on the **absolute** step), and the
 * per-chunk callbacks are collected into the same reply shape `exportMasterWav` returns. The pre-roll default is the
 * renderer's own (one reverb impulse); `preRollSec: 0` stays expressible, which is what the deletion test uses.
 */
import {
  WORKLETS_UNAVAILABLE_PROBLEM,
  encodeAudioBufferToWav,
  renderPatternChunkOffline,
  type ExportedWav,
  type RenderWavOptions,
} from "./WavExporter";
import { mergeRenderedChunks, planRenderSpans, renderChunksConcurrently, type MergeReport } from "./parallelRender";
import { beatsPerBar, STEPS_PER_BAR } from "../data/noteEvents";
import type { DrumPattern } from "../types/genre";
import type { MasterLimiterKind } from "./MasterLimiter";

/** Four: where the measured throughput curve flattens on an eight-core machine (2.8× of a possible ~3.3×). */
export const DEFAULT_EXPORT_CHUNKS = 4;

/** Seconds of blend at each seam. Long enough to hide a voice's phase, far shorter than any bar. */
export const DEFAULT_SEAM_CROSSFADE_SEC = 0.05;

export interface ChunkedWavOptions extends RenderWavOptions {
  /** How many spans to render at once. Defaults to {@link DEFAULT_EXPORT_CHUNKS}. */
  chunks?: number;
  /** Bars per span; wins over `chunks` when given. */
  chunkBars?: number;
  /** Seconds of crossfade at each seam. Defaults to {@link DEFAULT_SEAM_CROSSFADE_SEC}. */
  crossfadeSec?: number;
  /** Called as each span lands — the export's progress, which is what a nine-minute wait is missing (W7). */
  onSpanDone?: (done: number, total: number) => void;
}

export interface ChunkedWavResult extends ExportedWav {
  /** The seams that were blended, the length, and whether a span was clipped or the end padded. */
  chunkReport: MergeReport;
  /** Wall clock per span, in span order — kept beside the audio so a slow span is visible. */
  spanMs: number[];
}

/** Frames one bar occupies at this tempo — the caller states the tempo, this does not guess it. */
export function framesPerBarFor(pattern: DrumPattern, sampleRate: number, bpm: number): number {
  const beats = beatsPerBar((pattern as { timeSignature?: string }).timeSignature);
  const resolvedBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  return Math.max(1, Math.round((60 / resolvedBpm) * beats * sampleRate));
}

export function barsOf(pattern: DrumPattern): number {
  const steps = Number((pattern as { totalSteps?: number }).totalSteps ?? 0);
  return Math.max(1, Math.round(steps / STEPS_PER_BAR));
}

export async function exportMasterWavChunked(
  pattern: DrumPattern,
  genreId = "groove",
  options: ChunkedWavOptions = {}
): Promise<ChunkedWavResult> {
  const sampleRate = options.sampleRate ?? 44100;
  const bpm = options.bpm ?? pattern.bpm ?? 120;
  const totalBars = barsOf(pattern);
  const chunks = options.chunkBars
    ? Math.max(1, Math.ceil(totalBars / Math.max(1, Math.floor(options.chunkBars))))
    : Math.max(1, Math.floor(options.chunks ?? DEFAULT_EXPORT_CHUNKS));
  const crossfadeFrames = Math.max(0, Math.round((options.crossfadeSec ?? DEFAULT_SEAM_CROSSFADE_SEC) * sampleRate));

  /** Collected from every span, exactly as the single-pass exporter collects them from its one render. */
  let limiterKind: MasterLimiterKind = "fallback";
  let gs1HostFailures = 0;
  let gs1PatchProblems: string[] = [];
  let workletsUnavailable = false;
  let spanIndex = 0;

  const spans = planRenderSpans({ totalBars, chunks, framesPerBar: framesPerBarFor(pattern, sampleRate, bpm) });
  const merged = await renderChunksConcurrently(
    spans,
    async (span) => {
      spanIndex += 1;
      const chunk = await renderPatternChunkOffline(pattern, {
        ...options,
        fromBar: span.fromBar,
        bars: span.toBar - span.fromBar,
        onLimiterKind: (kind) => {
          limiterKind = kind as MasterLimiterKind;
          options.onLimiterKind?.(kind);
        },
        onGs1HostFailures: (count) => {
          gs1HostFailures += count;
          options.onGs1HostFailures?.(count);
        },
        onGs1PatchProblems: (problems) => {
          gs1PatchProblems = [...new Set([...gs1PatchProblems, ...problems])];
          options.onGs1PatchProblems?.(problems);
        },
        onProblems: (problems) => {
          if (problems.includes(WORKLETS_UNAVAILABLE_PROBLEM)) workletsUnavailable = true;
          options.onProblems?.(problems);
        },
      });
      return { buffer: chunk.buffer, preRollFrames: chunk.preRollFrames, chunkEndFrame: chunk.chunkEndFrame };
    },
    {
      concurrency: chunks,
      crossfadeFrames,
      onSpanDone: (done, total) => options.onSpanDone?.(done, total),
    }
  );

  const mergedBuffer = merged.buffer as unknown as AudioBuffer;
  const wavArrayBuffer = encodeAudioBufferToWav(mergedBuffer);
  const blob = new Blob([wavArrayBuffer], { type: "audio/wav" });
  const sanitizedGenre = (genreId || "groove").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  return {
    blob,
    filename: `${sanitizedGenre}_master_${bpm}bpm.wav`,
    durationSec: mergedBuffer.length / sampleRate,
    limiterKind,
    gs1HostFailures,
    gs1PatchProblems,
    workletsUnavailable,
    chunkReport: merged.report,
    spanMs: merged.spanMs,
  };
}
