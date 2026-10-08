/**
 * The **Node Web Audio host**: the same `renderPatternOffline`, the same worklets and the same vendored GS-1 wasm,
 * running under `node-web-audio-api` instead of Vite + Chromium.
 *
 * ## Why this is not a second renderer
 *
 * `mcp/render/worker.ts` opens with the argument that audio rendering here is genuinely a browser capability, and
 * that a renderer *rewritten* in Node would be a second sound. That argument is about a rewrite, not about a second
 * **host**: `scripts/probe_headless_parity.ts` runs the app's own `renderPatternOffline` under
 * `node-web-audio-api@2.2.0` and measures the two hosts against each other. This project's own DSP is the same on both;
 * what remains is each host's **own** nodes, recorded in `docs/HEADLESS_CORE_PLAN.md` §8.13/§9.2 as readings
 * (1.03 dB in band 3, 1.04 dB in band 7, 1.612 LU of loudness) with each bound set at the ceiling of its reading, the
 * residual's two halves named, and the plan to remove the half this project owns. This module exists to make that
 * residual *available and labelled*, not to hide it.
 *
 * ## The one rule this module follows
 *
 * **It never falls back.** "Silent fallback" is the failure this line of work keeps paying for: a render that quietly
 * used the other engine, or a lane that quietly went silent, is worse than an error because it looks like an answer.
 * So a missing `node-web-audio-api` throws `headlessUnavailableMessage()`, naming the package and the install command,
 * and it says in the message that the browser path was not taken.
 *
 * ## What it does to the process
 *
 * It installs the Node host's globals — `OfflineAudioContext`, `AudioWorkletNode`, `AudioWorkletProcessor` and
 * `BaseAudioContext` — once, plus a `fetch` that serves the app's **root-relative** asset URLs (`/gs1/…`) from
 * `public/`, and an `addModule` wrapper that does the same for worklet modules. Those are exactly the seams the parity
 * probe established; anything else an absolute URL is delegated to the process's own `fetch`.
 *
 * The dependency is **optional and undeclared on purpose** (`docs/HEADLESS_CORE_PLAN.md`): it is a native addon, and a
 * checkout that has not installed it must still build and run this server.
 */
import path from "node:path";
import { createRequire } from "node:module";
import os from "node:os";
import { readFileSync } from "node:fs";
import { createFrameProgress } from "./progress";
import * as sampleCache from "./sampleCache";
import type { SequencerPattern } from "../../src/types/genre";
import type { OfflineAudioLaneReport } from "../../src/audio/offlineAudioLanes";
// Types only: `worker.ts` loads this module dynamically, so a value import back would be a cycle.
import type { AudioLaneCatalogueRead, RenderAudioPayload, RenderOptions } from "./worker";

/** The optional package, named in one place because the message, the probe and the document all quote it. */
export const HEADLESS_PACKAGE = "node-web-audio-api";

/**
 * What a caller sees when the headless host is asked for and cannot be loaded.
 *
 * It names the package, the install command, the document — and, in its own sentence, the thing that did **not**
 * happen. A caller that asked for the Node host must not receive a Chromium render; the whole point of this entry is
 * that the two hosts are distinguishable.
 */
export function headlessUnavailableMessage(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return (
    `headless rendering needs the optional package \`${HEADLESS_PACKAGE}\`, which is not installed here (${detail}). ` +
    `Install it with \`npm i -D ${HEADLESS_PACKAGE}\`, or render without \`headless\` and pay for Vite + Chromium. ` +
    `**No browser render was started instead** — see docs/HEADLESS_CORE_PLAN.md.`
  );
}

/**
 * What the caller has to tell the host, beyond the render options.
 *
 * `publicRoot` rather than an `appRoot` lookup of its own: `appRoot()` in `worker.ts` is the single definition of where
 * this server's files are, and a second one here would be free to disagree with it.
 */
export interface HeadlessRenderContext {
  /** The app's `public/` directory: where `/gs1/workletProcessor.js` and the two wasm cores actually live. */
  publicRoot: string;
  /** The sample mirror an audio lane's bytes come from — `sampleMirrorRoot()` in `worker.ts`, passed rather than re-derived. */
  sampleRoot: string;
}

/**
 * What an audition additionally needs: the manifest **text**, read by `worker.ts` from `sampleManifestPath()`.
 *
 * It is passed rather than re-read here so the manifest path and the mirror root keep their one definition each; the
 * audition is the only path that needs it unconditionally, which is why it is not on `HeadlessRenderContext`.
 */
export interface HeadlessAuditionContext extends HeadlessRenderContext {
  manifestText: string;
}

/** The claim side of a note, in the same shape `worker.ts` returns from either path. */
export interface HeadlessNoteResolution {
  samplePath: string;
  ratio: number;
  rootKey?: number;
  group?: number;
  offBy?: number;
  oneShot?: boolean;
  notePolyphony?: number;
  /**
   * ⭐ **The articulation the file's own keyswitch selected, and its name in the file's words.**
   *
   * `loadNote` has returned both since `1efe6ba` (`src/audio/sfz/regionPlayback.ts` sets them from the region that
   * answered, and `src/audio/sampleLoader.ts` carries them into `noteInfo`), and the MCP surface dropped them: the
   * reply summarised the sample file and the ratio but never said *which articulation* that file was. That is the one
   * fact a keyswitch library exists to communicate — a `-KS` program sounds six different things depending on the
   * switch — so a caller could see that a note resolved and not which take it resolved to. Carried here, and in the
   * page path's own copy of this builder, so neither host can be the one that forgets.
   */
  switchState?: number;
  switchLabel?: string;
}

/**
 * **The claim side of a note, built once for this host** — the headless twin of the page's own inline builder.
 *
 * It is a function rather than an object literal so a criterion can hand it a `loadNote` result and read what comes
 * out (`src/test/mcpHeadlessNoteResolution.test.ts`): the fields that reach the reply are then a thing that can be
 * asserted rather than a thing that has to be diffed against `sampleLoader`'s return type by eye. The two hosts keep
 * two copies of this deliberately — one of them is serialised into a browser and cannot call this module — and the
 * shared `RenderAudioPayload`/`HeadlessNoteResolution` types are what make a divergence a type error.
 */
export function headlessNoteResolution(loaded: {
  samplePath: string;
  ratio: number;
  rootKey?: number;
  group?: number;
  offBy?: number;
  oneShot?: boolean;
  notePolyphony?: number;
  switchState?: number;
  switchLabel?: string;
}): HeadlessNoteResolution {
  return {
    samplePath: loaded.samplePath,
    ratio: loaded.ratio,
    ...(loaded.rootKey === undefined ? {} : { rootKey: loaded.rootKey }),
    ...(loaded.group === undefined ? {} : { group: loaded.group }),
    ...(loaded.offBy === undefined ? {} : { offBy: loaded.offBy }),
    ...(loaded.oneShot === undefined ? {} : { oneShot: loaded.oneShot }),
    ...(loaded.notePolyphony === undefined ? {} : { notePolyphony: loaded.notePolyphony }),
    ...(loaded.switchState === undefined ? {} : { switchState: loaded.switchState }),
    ...(loaded.switchLabel === undefined ? {} : { switchLabel: loaded.switchLabel }),
  };
}

/**
 * What the Node audition returns: the page's own union, so `worker.ts` reads it with the same three branches.
 *
 * `error` is a **result**, not a thrown failure: a library that cannot resolve the note is the answer to the question
 * the tool asks, and the page path has always reported it that way.
 */
export type HeadlessAuditionPayload =
  | { error: string }
  | { resolved: HeadlessNoteResolution; resolvedOnly: true }
  | {
      base64: string;
      durationSec: number;
      sampleRate: number;
      channels: number;
      truePeakDb: number;
      resolved: HeadlessNoteResolution;
    };

/** Whether the host's globals have been installed. The audio stack does not change between renders. */
let hostInstalled = false;

/** The process's own `fetch`, kept so the shim can delegate every URL that is not one of the app's assets. */
let originalFetch: typeof globalThis.fetch | null = null;

/**
 * Install the Node host. Idempotent, and the only place that touches process globals.
 *
 * `require` rather than a static `import`: a static specifier sends esbuild looking for the native addon at build time,
 * and the pack must build on a checkout where it is not installed. `createRequire(import.meta.url)` resolves it at the
 * moment a caller actually asks for a headless render, which is also when the error message is useful.
 */
export function loadHeadlessHost(publicRoot: string): unknown {
  let wa: any;
  try {
    wa = createRequire(import.meta.url)(HEADLESS_PACKAGE);
  } catch (error) {
    throw new Error(headlessUnavailableMessage(error));
  }
  if (hostInstalled) return wa;
  hostInstalled = true;
  /**
   * ⭐ **How many times the host was really installed, on `globalThis` rather than in a module variable** — because the
   * question is whether the *bundle* holds more than one copy of this module. Two installs wrap `OfflineAudioContext`
   * twice, and a windowed render's time offset applied twice would move a span's music while leaving a whole render
   * (offset 0) untouched, which is exactly the pattern the span tests measured.
   */
  (globalThis as unknown as { __grooveHostInstalls?: number }).__grooveHostInstalls =
    ((globalThis as unknown as { __grooveHostInstalls?: number }).__grooveHostInstalls ?? 0) + 1;

  /**
   * The wrapper the probe established: **worklet modules are fetched by URL**, and the app asks for them at
   * `/gs1/workletProcessor.js` — a root-relative path the Node host would try to open as a filesystem path.
   */
  const RealOfflineAudioContext = wa.OfflineAudioContext;
  function HostOfflineAudioContext(this: unknown, channels: number, frames: number, sampleRate: number) {
    const context = new RealOfflineAudioContext(channels, frames, sampleRate);
    const worklet = context.audioWorklet;
    const addModule = worklet.addModule.bind(worklet);
    worklet.addModule = (url: string) =>
      addModule(url.startsWith("/") ? path.join(publicRoot, url.slice(1)) : url);
    return context;
  }
  (globalThis as any).OfflineAudioContext = HostOfflineAudioContext;
  (globalThis as any).AudioWorkletNode = wa.AudioWorkletNode;
  (globalThis as any).AudioWorkletProcessor = wa.AudioWorkletProcessor;
  (globalThis as any).BaseAudioContext = wa.BaseAudioContext;

  /**
   * The wasm cores arrive through `fetch("/gs1/synth_core.wasm")` (`src/audio/gs1/Gs1Host.ts:253`), so the shim serves
   * root-relative URLs from disk and delegates everything else. It is installed once and never restored: a render can
   * start at any moment in this server, and an absolute URL was never this shim's business.
   */
  originalFetch = originalFetch ?? globalThis.fetch;
  const delegate = originalFetch;
  (globalThis as any).fetch = async (url: unknown, init?: unknown) => {
    const target = String(url);
    if (target.startsWith("/")) {
      const bytes = readFileSync(path.join(publicRoot, target));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    }
    return (delegate as any)(url, init);
  };
  return wa;
}

/**
 * Render one pattern on the Node host and return **the same payload the browser page returns**.
 *
 * The duplication with the `page.evaluate` body in `worker.ts` is deliberate and structural: that body is serialised
 * into a browser and cannot call a Node module, so the two cannot be one function. What keeps them from drifting is
 * `RenderAudioPayload` — the shared type they must both satisfy — and the criterion that renders through this path and
 * reads the reply (`src/test/mcpHeadlessRender.test.ts`). Every option here is copied from the page's call, including
 * the solo-render shape, so a difference between the hosts stays a difference of *host* and never of *arguments*.
 */
export async function renderPatternHeadless(
  pattern: SequencerPattern,
  /**
   * ⭐ `RenderOptions` plus the two span fields and the chunk count. Widened **here** rather than in the pinned
   * `mcp/render/worker.ts` (1652/1653 lines, held by `fileSizeBudget`): a field added to that interface would spend
   * the file's last line, and `renderAudio` already forwards its options object whole, so an extra field travels.
   */
  options: RenderOptions & { chunks?: number; fromBar?: number; preRollSec?: number; windowBars?: number },
  catalogueRead: AudioLaneCatalogueRead,
  context: HeadlessRenderContext
): Promise<RenderAudioPayload> {
  loadHeadlessHost(context.publicRoot);

  /**
   * Imported **after** the globals exist, as the probe does: these modules reach for `OfflineAudioContext` when they
   * build a graph, and one of them may do it while it is being evaluated.
   */
  const [wav, mp3, loudness, metrics, catalogue, graph] = await Promise.all([
    import("../../src/audio/WavExporter"),
    import("../../src/audio/Mp3Exporter"),
    import("../../src/test/helpers/loudness"),
    import("../../src/test/helpers/audioMetrics"),
    import("../../src/data/sampleCatalogue"),
    /**
     * The bytes→buffer half of the app's own decoder, so the cache in front of it decodes through exactly the code the
     * uncached path uses — including the `smpl`-chunk read that has to happen before `decodeAudioData` detaches the buffer.
     */
    import("../../src/audio/browserSampleGraph"),
  ]);
  const { audioCatalogue, cacheWiring } = laneWiringFrom(context, catalogueRead, { catalogue });
  const bars = Math.max(1, Math.min(64, options.bars ?? 1));

  /**
   * **The headless path narrates itself now, in frames rather than in budget milliseconds.**
   *
   * It was silent on progress because the reasoning belonged to the page: "there is no page to start or poll". That is
   * still true — and it is no longer the whole story, because `OfflineAudioContext.suspend` is a real seam inside the
   * one `startRendering()` call and this host supports it. So the cold start is announced before it is waited on, and
   * `WavExporter` calls back at each 10% of the render; `createFrameProgress` throttles those to the same
   * `RENDER_PROGRESS_HEARTBEAT_MS` cadence the page heartbeat uses. `progress` is present only when the caller sent a
   * `progressToken` (`createRenderProgress` returns nothing otherwise), so a token-less call stays silent by the same
   * construction as the browser path. The unit is frames and the total is the render's own length: this path is **not**
   * under `RENDER_BUDGET_MS`, so a budget-denominated progress bar would be a number that means nothing.
   */
  const progress = options.progress;
  const what = `${bars} bar(s) of ${pattern.genre_id ?? "a pattern"}`;
  progress?.reportOf(0, undefined, `starting the Node Web Audio host — ${what}`);
  const reportRenderedFrames = createFrameProgress(
    progress,
    (frames, total) => `rendering ${what}: ${Math.round((frames / total) * 100)}% (${frames} of ${total} frames rendered)`
  );

  /** The lane report, filled by the renderer rather than re-derived here — the same rule as the page's. */
  let audioLanes: OfflineAudioLaneReport = { lanes: [], events: 0, problems: [] };
  let limiterKind = "fallback";
  let gs1PatchProblems: string[] = [];
  const renderProblems: string[] = [];

  /**
   * ⭐ **The process's sample cache, as this render's decoder and text fetcher.**
   *
   * One object per render and one byte store per process: the store is what survives the render (and the server restart), and
   * the decoder is built on the `AudioContext` this render creates. See `mcp/render/sampleCache.ts`.
   */

  /**
   * The render's own length in frames, for the one progress value this host does not get from the renderer: the warm-up. Same
   * rate and the same bar count the renderer will use, so the two numbers agree about the shape of the render.
   */
  const renderFramesEstimate = Math.ceil(
    ((options.sampleRate ?? 44100) * bars * 4 * 60) / Math.max(20, Math.min(300, pattern.bpm ?? 120))
  );

  /**
   * ⭐ **K spans in K processes, when the caller asks for them.** The renderer is this process, so the parallel unit is
   * a process (measured 3.90× at K=4 — `scratch/node-host-scaling.mjs`); `options.chunks > 1` is the whole switch, and
   * an absent or 1 value leaves this function byte-for-byte the path it always was.
   */
  /**
   * ⭐ **Spans only where they are provably the same music.** `spanSafety` refuses a pattern whose sample lane has no
   * notes (its one-shot would land at each window's start); the refusal is reported rather than silently absorbed, and
   * the render falls back to the single pass.
   */
  /**
   * ⭐ **The count is decided here when the caller did not decide it** (owner's decision, 2026-10-08): a long piece is
   * chunked by default, because the measurement says a five-minute bounce takes 753 s in one pass and 297 s in eight —
   * and a caller who says nothing should get the fast road without knowing the machinery exists. `defaultChunksFor` is
   * a function of the piece's length and the machine's cores; an explicit `chunks` always wins, and 1 still means "one
   * pass" exactly as before.
   */
  const spans = await import("./spanHosts");
  const autoChunks = options.chunks ?? spans.defaultChunksFor(Math.max(1, Math.round(Number((pattern as { totalSteps?: number }).totalSteps ?? 16) / 16)), os.cpus().length);
  const spanVerdict = autoChunks > 1 ? spans.spanSafety(pattern) : null;
  if (spanVerdict && !spanVerdict.ok && spanVerdict.reason) renderProblems.push(spanVerdict.reason);
  const spanOutcome =
    spanVerdict?.ok === true
      ? await (await import("./spanHosts"))
          .renderPatternInSpans(
            pattern,
            /**
             * ⭐ **A chunked render narrates itself per span.** The progress channel is the one thing a caller has while a
             * long render runs — the page path's frame heartbeat exists for the same reason — and a span boundary is a
             * real milestone rather than a guess: "rendered 2 of 4 spans" is true when it is said. The counter is
             * monotonic, which is what `reportOf` requires.
             */
            {
              ...options,
              chunks: autoChunks,
              ...(progress
                ? {
                    /**
                     * ⚠️ **The span count has to be scaled into the render's own frames, or it is silently dropped.**
                     *
                     * `reportOf` keeps one monotonic counter per request and drops a value that is not increasing; the
                     * child's frame progress has already reported *hundreds of thousands*, so a span counter of 1, 2, 3
                     * was dropped every time — the narration was written and never arrived (measured: the smoke's
                     * `span messages` stayed empty while frame-level notifications arrived). Same lesson as the
                     * recordings counter, which was scaled into frames for exactly this reason.
                     */
                    onSpanDone: (done: number, total: number) =>
                      progress.reportOf(Math.round((done / Math.max(1, total)) * renderFramesEstimate), renderFramesEstimate, `rendered ${done} of ${total} spans`),
                  }
                : {}),
            },
            catalogueRead,
            context
          )
          .then((outcome) => {
          audioLanes = outcome.audioLanes;
          limiterKind = outcome.limiterKind;
          gs1PatchProblems = outcome.gs1PatchProblems;
          renderProblems.push(...outcome.problems);
          return outcome;
        })
      : null;
  /**
   * ⭐ **A span render goes through the renderer's chunk entry point, and the timeline it hands back is used, not
   * assumed.** `renderPatternChunkOffline` says where the music starts (`preRollFrames`) and where the span's own audio
   * stops (`chunkEndFrame`) — and the pre-roll is **not** always the requested `preRollSec`: asking for bars *before the
   * first bar* buys nothing, so the first span's pre-roll is zero. The first version of the parent assumed the requested
   * value for every span, trimmed 2 s of music off the head of span 0, and the null test found it: −1.3 dBFS across
   * **both** spans, including the one with no seam at all.
   */
  let spanTimeline: { preRollFrames: number; chunkEndFrame: number } | null = null;
  /**
   * ⭐ **One options object, three entry points.** A span render needs the renderer's chunk call (for the window it
   * reports), an ordinary render the whole-pattern call, and both take the same options — building that literal twice
   * is what the duplication budget caught on this change, and it was right: two copies of a fifteen-line option block
   * are two places for a field to be forgotten.
   */
  const renderArgs: Parameters<typeof wav.renderPatternOffline>[1] = {
    bars,
    /**
     * ⭐ **The span window, passed straight through.** `RenderWavOptions.fromBar`/`preRollSec` are the renderer's own
     * chunking entry points ("the entry point chunking needs"), and this host is where the MCP road can use them: one
     * child process per span, K of them at once, merged by `mcp/render/spanHosts.ts`. Absent means "the whole thing",
     * which is every existing caller.
     */
    ...(options.fromBar === undefined ? {} : { fromBar: options.fromBar }),
    ...(options.preRollSec === undefined ? {} : { preRollSec: options.preRollSec }),
    /**
     * ⭐ **The span length travels beside `fromBar`, not through `bars`** — on this path `bars` is the repeat count, and
     * the first span of a chunked render is exactly the case where a window has to be asked for explicitly.
     */
    ...(options.windowBars === undefined ? {} : { windowBars: options.windowBars }),
    /**
     * ⭐ **The bytes come from the process's disk cache, and this render fetches every recording before it starts.**
     *
     * This argument is the owner's requirement on the render path. It builds the render's decoder **on the context the
     * renderer creates** — the same `decodeAudioData` this host already used, behind `mcp/render/sampleCache.ts` — so a second
     * render, and every track of a stem render, find the bytes on disk rather than downloading them again. `fetchSfzBytes` is
     * the same store for the program and `#include` text, which on this repository's manifest is most of the requests. The
     * warm-up itself lives inside `renderPatternOffline` (`prepareOfflineAudioLanes`), because that is where the plan and the
     * loader are.
     */
    sampleDecoder: (context) => cacheWiring.decoderFor(context, graph.browserBytesDecoder(context)),
    fetchSfzBytes: cacheWiring.fetchSfzBytes,
    /**
     * ⭐ **The warm-up narrates itself, in the same channel and the same shape as smplr's `onLoadProgress`** — *"`total` is
     * known before loading starts, so you can display a determinate progress bar"*
     * (<https://raw.githubusercontent.com/danigb/smplr/main/README.md>). It goes out through `reportOf` rather than `report`
     * because its unit is recordings, not budget milliseconds, and it is sent **before** `reportRenderedFrames` ever fires, so a
     * caller sees "fetching, 12 of 40" and then "rendering, 30 %".
     */
    onAudioLanePreparation: (preparation) => {
      const message =
        `recordings ready: ${preparation.loaded} of ${preparation.total}` +
        (preparation.problems.length ? ` (${preparation.problems.length} could not be resolved)` : "");
      /**
       * ⭐ **Expressed in the render's own frames, because that is the unit the rest of this path reports in.**
       *
       * `reportOf` keeps one monotonic counter per request and drops a value that is not increasing. The frame reports start at
       * 10 % of the render, so a preparation that reported *recordings* (0…40) would be below the first frame count
       * (hundreds of thousands) and every one of them would be silently dropped — a narration that looks like it worked and
       * never reaches the client. Scaling the count into frames keeps one unit for the whole path: the warm-up fills the first
       * tenth, `startRendering()` fills the rest.
       *
       * A preparation with nothing to warm reports nothing; there is genuinely nothing to say about it.
       */
      if (preparation.total > 0) {
        const reached = Math.round((preparation.loaded / preparation.total) * (renderFramesEstimate / 10));
        progress?.reportOf(reached, renderFramesEstimate, message);
      }
    },
    /**
     * ⭐ **The stems argument, forwarded rather than re-implemented.**
     *
     * `renderPatternOffline` has accepted `stemTrackIdx` from the start (`src/audio/WavExporter.ts:131`, applied at
     * `:1212` and `:1362`) and threads it into the audio-lane planner (`src/audio/offlineAudioLanes.ts:249`). The
     * browser path passes it; this host now passes the same value, so "which track" is an argument and not a
     * difference between the engines.
     */
    ...(options.stemTrackIdx === undefined ? {} : { stemTrackIdx: options.stemTrackIdx }),
    ...(options.sampleRate ? { sampleRate: options.sampleRate } : {}),
    ...(options.channels ? { channels: options.channels } : {}),
    ...(Number.isFinite(options.loudnessTrimDb) ? { loudnessTrimDb: options.loudnessTrimDb } : {}),
    audioLaneCatalogue: audioCatalogue,
    onAudioLanes: (report: OfflineAudioLaneReport) => {
      audioLanes = report;
    },
    onLimiterKind: (kind: string) => {
      limiterKind = kind;
    },
    onGs1PatchProblems: (problems: readonly string[]) => {
      gs1PatchProblems = [...problems];
    },
    onProblems: (problems: readonly string[]) => {
      renderProblems.push(...problems);
    },
    ...(catalogueRead.problem ? { audioLaneCatalogueProblem: catalogueRead.problem } : {}),
    // Only the main render reports frames: the per-track solo renders below are separate renders, and their frame
    // counts would make the progress stream look like it restarted.
    ...(progress ? { onRenderProgress: reportRenderedFrames } : {}),
  };
  let buffer: AudioBuffer;
  if (spanOutcome) {
    buffer = spanOutcome.buffer;
  } else if (options.fromBar === undefined && options.preRollSec === undefined) {
    buffer = await wav.renderPatternOffline(pattern, renderArgs);
  } else {
    const chunk = await wav.renderPatternChunkOffline(pattern, renderArgs);
    buffer = chunk.buffer;
    spanTimeline = { preRollFrames: chunk.preRollFrames, chunkEndFrame: chunk.chunkEndFrame };
  }
  progress?.reportOf(buffer.length, buffer.length, "render finished; writing the file");

  const channels: Float32Array[] = [];
  for (let index = 0; index < buffer.numberOfChannels; index += 1) channels.push(buffer.getChannelData(index));

  /**
   * Per-track peaks, when asked: the same isolated-render shape the page uses, including its argument set — the page
   * does not pass the sample rate to a solo render, and a second definition here would be a second behaviour.
   */
  const trackPeaksDb: Record<string, number> = {};
  if (options.trackPeaks === true) {
    for (let soloIndex = 0; soloIndex < pattern.tracks.length; soloIndex += 1) {
      const track = pattern.tracks[soloIndex]!;
      const solo = {
        ...(pattern as unknown as Record<string, unknown>),
        tracks: pattern.tracks.map((candidate, index) =>
          index === soloIndex
            ? candidate
            : {
                ...candidate,
                steps: candidate.steps.map(() => 0),
                velocity: undefined,
                ...(String(candidate.track_id).toLowerCase() === "audio" ? { sample: undefined } : {}),
              }
        ),
      };
      try {
        const soloBuffer = await wav.renderPatternOffline(solo as never, {
          bars,
          ...(audioCatalogue.length ? { audioLaneCatalogue: audioCatalogue } : {}),
        });
        const soloChannels: Float32Array[] = [];
        for (let index = 0; index < soloBuffer.numberOfChannels; index += 1) soloChannels.push(soloBuffer.getChannelData(index));
        trackPeaksDb[String(track.track_id)] = metrics.samplePeakDb(soloChannels);
      } catch {
        trackPeaksDb[String(track.track_id)] = Number.NEGATIVE_INFINITY;
      }
    }
  }

  const base64 =
    options.format === "mp3"
      ? Buffer.from(
          await (
            await mp3.encodeAudioBufferToMp3(buffer, { bitrateKbps: options.bitrateKbps ?? 192 })
          ).blob.arrayBuffer()
        ).toString("base64")
      : Buffer.from(new Uint8Array(wav.encodeAudioBufferToWav(buffer))).toString("base64");

  return {
    base64,
    durationSec: buffer.duration,
    /** ⭐ Present for a span render: where the music starts and where the span's own audio stops (see above). */
    ...(spanTimeline ? { spanTimeline } : {}),
    ...sampleCache.sampleCacheStats(),
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    limiterKind,
    truePeakDb: loudness.truePeakDbChannels(channels),
    integratedLufs: loudness.measureLoudness(channels, buffer.sampleRate).integratedLufs,
    gs1PatchProblems,
    trackPeaksDb,
    audioLanes,
    problems: renderProblems,
  };
}

/** The `OfflineAudioContext` the app itself would pick, so the audition asks the same question on either host. */
function offlineContextClass(): new (channels: number, frames: number, sampleRate: number) => OfflineAudioContext {
  const fromWindow =
    typeof window !== "undefined"
      ? ((window as unknown as { OfflineAudioContext?: unknown; webkitOfflineAudioContext?: unknown }).OfflineAudioContext ??
        (window as unknown as { webkitOfflineAudioContext?: unknown }).webkitOfflineAudioContext)
      : undefined;
  const resolved = fromWindow ?? (globalThis as unknown as { OfflineAudioContext?: unknown }).OfflineAudioContext;
  if (typeof resolved !== "function") throw new Error("OfflineAudioContext is not supported in this environment");
  return resolved as new (channels: number, frames: number, sampleRate: number) => OfflineAudioContext;
}

/**
 * **One instrument note on the Node host** — the same four steps the page performs, with no page.
 *
 * The page's audition body is short and this is deliberately the same body: parse the catalogue, build the app's own
 * loader over the host's `decodeAudioData`, resolve the note through `loadNote` (the one place a note becomes a sample
 * plus a ratio), start it at that ratio in an offline context, render and measure. Nothing here re-implements
 * resolution, and the modules it imports are the ones `renderPatternOffline` already drives on this host
 * (`src/audio/WavExporter.ts:1727` builds `browserSampleLoader(ctx, audioCatalogue)` from the same two modules).
 *
 * `resolveOnly` returns before any audio exists, so the pitch inspector's source half costs a manifest parse rather
 * than a render — the same shortcut the page path takes.
 */
/**
 * ⭐ **The wiring a lane question needs, built the same way the render builds it.**
 *
 * Three modules, the audio catalogue from the manifest text and the sample root, and the on-disk cache. A validation
 * caller that skipped any of these would answer about no samples at all.
 */
function laneWiringFrom(
  context: HeadlessRenderContext,
  catalogueRead: AudioLaneCatalogueRead,
  deps: { catalogue: typeof import("../../src/data/sampleCatalogue") }
) {
  const audioCatalogue = catalogueRead.text
    ? deps.catalogue.catalogueFromManifestText(catalogueRead.text, context.sampleRoot).assets
    : [];
  const cacheWiring = sampleCache.renderSampleCacheWiring();
  return { audioCatalogue, cacheWiring };
}

/**
 * ⭐ **Answer whether an arrangement's audio lanes would resolve, without rendering it.**
 *
 * A full pass costs about two minutes per track, and the field test paid that cost three times only to learn an
 * instrument's range. This stops after the recordings resolve and returns that answer.
 */
export async function validateArrangementHeadless(
  pattern: SequencerPattern,
  options: RenderOptions,
  catalogueRead: AudioLaneCatalogueRead,
  context: HeadlessRenderContext
): Promise<import("../../src/audio/WavExporter").ArrangementLaneReport> {
  loadHeadlessHost(context.publicRoot);
  const [wav, catalogue, graph] = await Promise.all([
    import("../../src/audio/WavExporter"),
    import("../../src/data/sampleCatalogue"),
    import("../../src/audio/browserSampleGraph"),
  ]);
  const { audioCatalogue, cacheWiring } = laneWiringFrom(context, catalogueRead, { catalogue });
  const bars = Math.max(1, Math.min(64, options.bars ?? 1));
  /**
   * ⭐ **The catalogue travels into the preflight, which is the whole of finding F01.**
   *
   * The render path passes `audioLaneCatalogue` (line 513 above) and this one did not: the preflight built the
   * `audioCatalogue` and then asked `preparePatternAudioLanes` to resolve recordings **without** it, so every sampler lane
   * resolved to nothing and a valid six-track project came back `empty/ready=false, loaded=0` — while the very next
   * `render_arrangement` on the same project succeeded with all 1,624 events and no sample problems (the third
   * evaluation's F01). The two paths now answer from the same wiring, so "is this playable" and "did it play" cannot
   * disagree about the same file.
   */
  return wav.preparePatternAudioLanes(pattern, {
    bars,
    ...(audioCatalogue.length ? { audioLaneCatalogue: audioCatalogue } : {}),
    sampleDecoder: (ctx: BaseAudioContext) => cacheWiring.decoderFor(ctx, graph.browserBytesDecoder(ctx)),
    fetchSfzBytes: cacheWiring.fetchSfzBytes,
    ...(options.sampleRate === undefined ? {} : { sampleRate: options.sampleRate }),
    ...(options.channels === undefined ? {} : { channels: options.channels }),
  });
}

export async function renderInstrumentNoteHeadless(
  assetId: string,
  midi: number,
  options: RenderOptions & { seconds?: number; gainDb?: number; resolveOnly?: boolean },
  context: HeadlessAuditionContext
): Promise<HeadlessAuditionPayload> {
  loadHeadlessHost(context.publicRoot);

  const [catalogue, loaderModule, graph, loudness, exporter] = await Promise.all([
    import("../../src/data/sampleCatalogue"),
    import("../../src/audio/sampleLoader"),
    import("../../src/audio/browserSampleGraph"),
    import("../../src/test/helpers/loudness"),
    import("../../src/audio/WavExporter"),
  ]);
  const { assets } = catalogue.catalogueFromManifestText(context.manifestText, context.sampleRoot);
  const sampleRateValue = options.sampleRate ?? 44100;
  const seconds = Math.min(10, Math.max(0.1, options.seconds ?? 2));
  const frames = Math.ceil(sampleRateValue * seconds);
  const OfflineContext = offlineContextClass();
  const hostContext = new OfflineContext(1, frames, sampleRateValue);
  /**
   * ⭐ **The same on-disk cache as the render path**, for the same reason: an audition of a library that was just rendered — or
   * of a second note of the same instrument — must not download the program and the sample again. The decoder is bound to this
   * audition's own context, which is the only part that cannot be shared.
   */
  const cacheWiring = sampleCache.renderSampleCacheWiring();
  const loader = loaderModule.createSampleLoader(
    cacheWiring.decoderFor(hostContext, graph.browserBytesDecoder(hostContext)),
    assets,
    undefined,
    undefined,
    undefined,
    cacheWiring.fetchSfzBytes
  );

  let loaded: Awaited<ReturnType<typeof loader.loadNote>>;
  try {
    loaded = await loader.loadNote(assetId, midi);
  } catch (error) {
    // A refusal from the loader is the answer to the question, so it is returned rather than thrown — as in the page.
    return { error: error instanceof Error ? error.message : String(error) };
  }
  const resolved: HeadlessNoteResolution = headlessNoteResolution(loaded);
  if (options.resolveOnly === true) return { resolved, resolvedOnly: true };

  const source = hostContext.createBufferSource();
  source.buffer = loaded.buffer;
  source.playbackRate.value = loaded.ratio;
  const gain = hostContext.createGain();
  gain.gain.value = Math.pow(10, (options.gainDb ?? 0) / 20);
  source.connect(gain).connect(hostContext.destination);
  source.start(0);
  const buffer = await hostContext.startRendering();
  const channel = buffer.getChannelData(0);
  return {
    base64: Buffer.from(new Uint8Array(exporter.encodeAudioBufferToWav(buffer))).toString("base64"),
    durationSec: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    truePeakDb: loudness.truePeakDbChannels([channel]),
    resolved,
  };
}
