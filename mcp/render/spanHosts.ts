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
  /** ⭐ The plan actually rendered: each span's window and the frames the renderer reported for it. */
  spanPlan: Array<{ fromBar: number; toBar: number; atFrame: number; last: boolean; preRollFrames: number; chunkEndFrame: number }>;
  /** ⭐ Where the span children wrote their raw PCM — kept when `GROOVE_KEEP_SPANS=1`, for exactly the comparison that
   * tells a child-side bug from a merge-side one (the smoke test reads these). */
  spanScratchDir: string;
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
  /**
   * ⭐ **The child entry is the bundle, and it can be named.** `process.argv[1]` is the bundle when the server runs
   * normally, but under a probe runner (`vite-node`) it is the runner's own entry, and a child started with it answers
   * "No files specified". `GROOVE_SPAN_BUNDLE` lets a probe point at `dist-mcp/groove-mcp.mjs` explicitly.
   */
  const bundle = process.env.GROOVE_SPAN_BUNDLE ?? process.argv[1];
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
    /**
     * ⚠️ **The first span renders the whole pattern, and that is the remaining cost problem.**
     *
     * `computeRenderWindow` returns `null` for `fromBar <= 0`, so span 0 has no window and its child renders everything;
     * with K=4 the real 126-bar piece therefore spent one process on all of the work and blew the 900 s budget.
     *
     * The obvious workaround — hand the child a **truncated copy** whose `totalSteps` is the span's own steps — was tried
     * and **rejected by the gate**: −21.6 dBFS outside the crossfade, both with the span's repeat count and with `1`, so
     * truncating a pattern is not the same music as windowing it (the length feeds more than the schedule). The honest fix
     * is in the renderer (`computeRenderWindow` must treat "from bar 0, this many bars" as a window rather than as the
     * whole pattern), which is a pinned file and needs its own budget conversation.
     */
    const job: SpanJob = {
      pattern,
      /**
       * ⚠️ **`chunks` must not travel into the child.** The child runs the same `renderPatternHeadless`, which switches
       * to this module when `options.chunks > 1` — so a forwarded `chunks` makes every child spawn its own children, and
       * the first smoke test was killed by resource exhaustion instead of reporting a number. The child renders **one
       * span**; that is exactly `chunks: 1`.
       */
      /**
       * ⚠️ **`windowBars` is deliberately NOT passed here.** It exists (the renderer accepts it and the gate can drive it),
       * and it would make the first span cost a span instead of the whole piece — but measured through the gate it is
       * **not equivalent**: −1.4 dBFS outside the crossfade on the template fixture, against −inf without it. A cheaper
       * span 0 that renders different music is not a trade this project takes, so the first span keeps rendering the whole
       * pattern and the cost problem stays open (see the note in the caller and `docs/OPEN_WORK.md`).
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
        /**
         * ⭐ The child's measured window, not this function's assumption: a span that starts at bar 0 gets **no**
         * pre-roll, because there is nothing before bar 0 to warm the reverb with.
         */
        preRollFrames: sidecar.preRollFrames,
        chunkEndFrame: sidecar.chunkEndFrame,
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
  /**
   * ⭐ **A debugging seam, not a feature.** `GROOVE_KEEP_SPANS=1` leaves the span children's raw PCM and a `plan.json`
   * on disk, which is the only way to tell "the child rendered different music" from "the merge put the right music in
   * the wrong place" without threading debug fields through an interface that lives in the pinned `worker.ts`.
   */
  if (process.env.GROOVE_KEEP_SPANS) {
    /**
     * ⭐ **The path is recorded where a reader can find it.** The first version left only a randomly named directory in
     * `/tmp`, and the probe picked the wrong one — a debugging seam that cannot be located is not a seam.
     */
    const marker = process.env.GROOVE_KEEP_SPANS === "1" ? path.join(os.tmpdir(), "groove-spans-latest") : process.env.GROOVE_KEEP_SPANS;
    await fs.writeFile(marker, scratch);
    await fs.writeFile(
      path.join(scratch, "plan.json"),
      JSON.stringify({ framesPerBar, preRollFrames, spans: spans.map((span, index) => ({ ...span, preRollFrames: outcomes[index]?.result.preRollFrames, chunkEndFrame: outcomes[index]?.result.chunkEndFrame })) }, null, 1)
    );
  } else {
    await fs.rm(scratch, { recursive: true, force: true });
  }
  return {
    spanScratchDir: scratch,
    buffer: merged.buffer as unknown as AudioBuffer,
    report: merged.report,
    spanPlan: spans.map((span, index) => ({ ...span, preRollFrames: outcomes[index]?.result.preRollFrames ?? 0, chunkEndFrame: outcomes[index]?.result.chunkEndFrame ?? 0 })),
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

/**
 * ⭐ **Can this pattern be rendered in spans at all?**
 *
 * Measured: a template arrangement comes out **sample-identical** through the whole span path (K=2, cross-process,
 * pre-roll + crossfade + merge), while the blank-sampler fixture — a **sampler lane that carries no notes** — differs by
 * **−1.3 dBFS** from the single pass. The renderer's documented rule is why: *"a lane with a sample and no notes is
 * played once at the arrangement's start"*, and inside a windowed render "the start" is the **window's** start, so the
 * one-shot fires again in every span while the single pass plays it once.
 *
 * Until that one-shot is keyed on the **absolute** start (the follow-up, with the measurement above as its criterion),
 * the honest answer is to refuse spans for such a pattern rather than to ship a render that is subtly wrong: the caller
 * gets the single pass, and the reason travels in the reply's problems.
 */
export function spanSafety(pattern: SequencerPattern): { ok: boolean; reason?: string } {
  /**
   * ⭐ **Deliberately conservative, and crude on purpose.** The first version looked for `tracks[].assetId` beside a
   * `notes[laneId]` map; the compiled pattern uses neither, so it never fired and the one shape known to differ went
   * straight through (−1.3 dBFS, measured through the tool). Rather than guess a fourth shape, this asks the pattern's
   * own serialised form whether it carries a **sampler/audio lane at all**: a synth-only pattern is the case that is
   * proved sample-identical, and anything holding a sample reference is refused until the renderer's one-shot is keyed on
   * the arrangement's absolute start rather than the window's.
   */
  const serialised = JSON.stringify(pattern) ?? "";
  const sampleLane = /"(assetId|asset_id|sampleId|sfz|samplePath|kit)"|"(sampler|audio)"\s*:\s*(true|"?(sampler|audio)"?)/.exec(serialised);
  if (sampleLane) {
    return {
      ok: false,
      reason: `this arrangement carries a sample/audio lane (${sampleLane[1] ?? sampleLane[2]}), whose one-shot plays at the start of whatever is rendered — a span would not be the same music as the whole (measured −1.3 dBFS); rendering in one pass`,
    };
  }
  return { ok: true };
}
