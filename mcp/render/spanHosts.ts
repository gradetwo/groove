/**
 * ⭐ **One span per process, K at a time — the MCP road's parallel render.**
 *
 * Measured before it was written: four MCP server processes each rendering a 16-bar span at 44.1 kHz stereo did
 * **3.90×** the work of one in the same wall clock (`scratch/node-host-scaling.mjs`), because the renderer is a Node
 * Web Audio host **inside the process** and its parallel unit is therefore a process, not a page or a worker. Against
 * the 753 s single-pass baseline of the five-minute piece that projects to ≈193 s.
 *
 * The parent's whole job is bookkeeping the merge must get right: where each span's music starts on the absolute
 * timeline (`atFrame`), how much warm-up each child rendered (`preRollFrames`, stated rather than inferred — the
 * renderer is given `preRollSec` explicitly so the two sides agree), and where each span's own audio stops. The
 * arithmetic lives in `src/audio/parallelRender.ts` (`planRenderSpans` + `mergeRenderedChunks`) and is unit-tested
 * without a browser or a child.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SequencerPattern } from "../../src/types/genre";
import type { AudioLaneCatalogueRead, RenderOptions } from "./worker";
import type { HeadlessRenderContext } from "./headless";
import { mergeRenderedChunks, planRenderSpans, type MergeableChunk, type MergeReport } from "../../src/audio/parallelRender";
import { beatsPerBar, STEPS_PER_BAR } from "../../src/data/noteEvents";
import type { OfflineAudioLaneReport } from "../../src/audio/offlineAudioLanes";
import type { SpanJob, SpanSidecar } from "./spanRunner";

/** The renderer's own default is one reverb impulse; stated here so `preRollFrames` is arithmetic, not a guess. */
export const SPAN_PRE_ROLL_SEC = 2;

export interface SpanRenderOutcome {
  buffer: AudioBuffer;
  report: MergeReport;
  spanMs: number[];
  audioLanes: OfflineAudioLaneReport;
  limiterKind: string;
  gs1PatchProblems: string[];
  problems: string[];
}

const barsOf = (pattern: SequencerPattern, options: RenderOptions): number => {
  const steps = Number((pattern as { totalSteps?: number }).totalSteps ?? 0);
  const stated = Number(options.bars ?? 0);
  if (stated > 1) return stated;
  return Math.max(1, Math.round(steps / STEPS_PER_BAR));
};

export async function renderPatternInSpans(
  pattern: SequencerPattern,
  options: RenderOptions & { chunks?: number; preRollSec?: number },
  catalogueRead: AudioLaneCatalogueRead,
  context: HeadlessRenderContext
): Promise<SpanRenderOutcome> {
  const bundle = process.argv[1];
  if (!bundle) throw new Error("the renderer cannot find its own bundle path, so it cannot start a span process");
  const sampleRate = options.sampleRate ?? 44100;
  const bpm = pattern.bpm ?? 120;
  const beats = beatsPerBar((pattern as { timeSignature?: string }).timeSignature);
  const framesPerBar = Math.max(1, Math.round((60 / bpm) * beats * sampleRate));
  const totalBars = barsOf(pattern, options);
  const wanted = Math.max(1, Math.floor(options.chunks ?? 4));
  const preRollSec = options.preRollSec ?? SPAN_PRE_ROLL_SEC;
  const preRollFrames = Math.max(0, Math.round(preRollSec * sampleRate));
  const spans = planRenderSpans({ totalBars, chunks: wanted, framesPerBar });
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "groove-spans-"));

  /**
   * ⚠️ **The chunk count must be gone from what the child is told** — not merely undeclared. A spread would carry it,
   * the child runs the same `renderPatternHeadless`, and the first smoke test was killed by resource exhaustion because
   * every span process spawned its own spans. Destructured out here so it cannot travel by accident.
   */
  const { chunks: _parentChunks, ...parentOptions } = options;

  const run = async (index: number, span: { fromBar: number; toBar: number }): Promise<{ result: MergeableChunk; sidecar: SpanSidecar; ms: number }> => {
    const outStem = path.join(scratch, `span-${index}`);
    const job: SpanJob = {
      pattern,
      /**
       * ⚠️ **`chunks` must not travel into the child.** The child runs the same `renderPatternHeadless`, which switches
       * to this module when `options.chunks > 1` — so a forwarded `chunks` makes every child spawn its own children, and
       * the first smoke test was killed by resource exhaustion instead of reporting a number. The child renders **one
       * span**; that is exactly `chunks: 1`.
       */
      options: { ...parentOptions, headless: true },
      catalogueRead,
      context,
      fromBar: span.fromBar,
      bars: span.toBar - span.fromBar,
      preRollSec,
      outStem,
    };
    const jobPath = `${outStem}.job.json`;
    await fs.writeFile(jobPath, JSON.stringify(job));
    const started = Date.now();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [bundle], { env: { ...process.env, GROOVE_SPAN_JOB: jobPath }, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`span ${index} (bars ${span.fromBar}-${span.toBar}) exited ${code}: ${stderr.trim().slice(0, 400)}`))));
    });
    const ms = Date.now() - started;
    const sidecar = JSON.parse(await fs.readFile(`${outStem}.json`, "utf8")) as SpanSidecar;
    const raw = await fs.readFile(`${outStem}.f32`);
    const perChannel = new Float32Array(sidecar.frames);
    const channels: Float32Array[] = [];
    for (let channel = 0; channel < sidecar.channels; channel += 1) {
      const view = new Float32Array(raw.buffer, raw.byteOffset + channel * perChannel.byteLength, sidecar.frames);
      channels.push(view);
    }
    return {
      ms,
      sidecar,
      result: {
        /**
         * ⭐ `duration` is stated because the single-pass renderer's `AudioBuffer` has it and the reply quotes it
         * (`durationSec`): a plain channel-data object would silently drop the field from the chunked answer, which is
         * how a caller tells a five-minute file from a four-minute one.
         */
        buffer: {
          numberOfChannels: sidecar.channels,
          length: sidecar.frames,
          sampleRate: sidecar.sampleRate,
          duration: sidecar.frames / sidecar.sampleRate,
          getChannelData: (c: number) => channels[c]!,
        },
        atFrame: span.fromBar * framesPerBar,
        preRollFrames,
        chunkEndFrame: Math.min(sidecar.frames, preRollFrames + (span.toBar - span.fromBar) * framesPerBar),
        /**
         * ⚠️ **The end of the piece keeps its tail.** Without this flag the merge cuts at `chunkEndFrame`, dropping the
         * reverb's decay — the first smoke test rendered 9.6 s of a 10.2 s piece, and the 0.6 s that went missing is
         * exactly the tail. A file must not stop while the reverb is still sounding.
         */
        ...(span.toBar === totalBars ? { last: true } : {}),
      },
    };
  };

  /** Bounded, in span order, so the first span's music is never written after a later one's. */
  const outcomes: Array<Awaited<ReturnType<typeof run>>> = new Array(spans.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next;
      next += 1;
      const span = spans[index];
      if (!span) return;
      outcomes[index] = await run(index, span);
    }
  };
  await Promise.all(Array.from({ length: Math.min(wanted, spans.length) }, worker));

  const merged = mergeRenderedChunks(
    outcomes.map((outcome) => outcome.result),
    { crossfadeFrames: Math.max(0, Math.round(0.05 * sampleRate)) }
  );
  await fs.rm(scratch, { recursive: true, force: true });
  return {
    buffer: merged.buffer as unknown as AudioBuffer,
    report: merged.report,
    spanMs: outcomes.map((outcome) => outcome.ms),
    /**
     * ⭐ **One lane entry per track, events summed.** Each span covers a disjoint stretch of the timeline, so the events
     * across spans add up to the render's own count; the *lane list* does not, because every span reports the tracks it
     * saw — the first smoke test listed "Sampler" twice and counted 42 events for a 28-note render.
     */
    audioLanes: {
      lanes: [
        ...new Map(outcomes.flatMap((outcome) => outcome.sidecar.audioLanes.lanes).map((lane) => [(lane as { trackIndex?: number }).trackIndex, lane])).values(),
      ] as OfflineAudioLaneReport["lanes"],
      events: outcomes.reduce((sum, outcome) => sum + outcome.sidecar.audioLanes.events, 0),
      problems: [
        ...new Map(
          outcomes
            .flatMap((outcome) => outcome.sidecar.audioLanes.problems)
            .map((problem) => [
              `${(problem as { trackIndex?: number }).trackIndex}:${(problem as { reason?: string }).reason ?? ""}`,
              problem,
            ])
        ).values(),
      ] as OfflineAudioLaneReport["problems"],
    },
    limiterKind: outcomes[0]?.sidecar.limiterKind ?? "fallback",
    gs1PatchProblems: [...new Set(outcomes.flatMap((outcome) => outcome.sidecar.gs1PatchProblems))],
    problems: [...new Set(outcomes.flatMap((outcome) => outcome.sidecar.problems))],
  };
}
