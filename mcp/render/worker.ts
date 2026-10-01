/**
 * The one part of the MCP server that needs a browser.
 *
 * Audio rendering is genuinely a browser capability here: the app's engine *is* Web Audio plus the GS-1 wasm
 * host, and re-implementing a second renderer in Node would produce a second sound — the exact failure this
 * codebase spends gates avoiding. So this starts the app's **dev** server (so no test hook ever ships in the
 * production bundle) and drives a headless Chromium page that imports the real `renderPatternOffline`, the same
 * route `scripts/measure_genre_loudness.mjs` and `scripts/analyze_export_audio.mjs` take.
 *
 * The cost is a browser process, so it is started **lazily** — only the two audio tools need it — and torn down
 * when the server exits. `GROOVE_MCP_NO_BROWSER=1` refuses instead, which is what a locked-down deployment wants.
 */
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import type { SequencerPattern } from "../../src/types/genre";
import { measureLoudness, truePeakDbChannels } from "../../src/test/helpers/loudness";
import { songSlug } from "../../src/utils/songSlug";
// The naming rule lives in `src/data` because it is pure: a criterion can hold it without starting a browser.
import { stemFilename } from "../../src/data/stemNaming";
import { fingerprintChannels } from "../../src/test/helpers/timbre";
import type { OfflineAudioLaneReport } from "../../src/audio/offlineAudioLanes";
import { isAudioLane } from "../../src/audio/offlineAudioLanes";
import {
  channelCorrelation,
  clickAnalysis,
  clippedSampleCount,
  finalPeakDb,
  samplePeakDb,
  sideToMidDb,
  tailRmsDb,
} from "../../src/test/helpers/audioMetrics";

export interface RenderOptions {
  format: "wav" | "mp3";
  bars?: number;
  bitrateKbps?: number;
  genreId?: string;
  /** Render rate: an analysis render can ask for 8000 and get fewer samples, not a relabelled file. */
  sampleRate?: number;
  /** 1 for a mono analysis render; the default stays the stereo the exporter has always produced. */
  channels?: 1 | 2;
  /**
   * Explicit master-bus trim, in dB, overriding whatever the genre's own trim would be.
   *
   * The offline graph has carried `loudnessTrimDb` all along (`masterGraph.ts:81`, `WavExporter.ts:74`), and `AudioEngine` applies the same
   * number live (`:384`) — but nothing on the MCP side could set it, so a caller that measured a track at −17 LUFS had no way to ask for
   * −14 except by hand-computing a gain and editing the pattern. This is the mechanism a loudness write tool needs; the tool is next.
   */
  loudnessTrimDb?: number;
  /**
   * A slug for the file name, from the caller's own song title.
   *
   * The server has never let model text name a file, and it still does not: this is whitelisted to `[a-z0-9-]`, lowercased, cut
   * to 40 characters, and joined to the genre and tempo rather than replacing them. What it buys is a file called
   * `neo-soul_my-ballad_80bpm.mp3` instead of `neo-soul_master_80bpm.mp3` for a caller that named its song.
   */
  nameSlug?: string;
  /**
   * Also render each track in isolation and report its peak.
   *
   * Off by default because it costs one extra render per track (eight on a full pattern) and most calls only
   * want a file. An agent asking "is the balance sane?" flips it on and gets the answer in one round trip.
   */
  trackPeaks?: boolean;
  /** Where to write; defaults to `GROOVE_MCP_OUT` or a fresh temp directory. */
  outputDir?: string;
  /**
   * How long a render may take before the page is declared stuck, in milliseconds. Default 15 minutes, chosen from measurement: a nine-movement piece rendered through this server took three to eight minutes per movement, so anything shorter would kill work that was progressing.
   */
  renderTimeoutMs?: number;
}

export interface RenderResult {
  path: string;
  filename: string;
  bytes: number;
  durationSec: number;
  sampleRate: number;
  channels: number;
  limiterKind: string;
  truePeakDb: number;
  integratedLufs: number;
  /**
   * Lanes whose own GS-1 patch code was refused, each naming the lane and the reason.
   *
   * Empty in every normal render. Non-empty means that lane was voiced by the native engine — a
   * different sound — and the reply says so rather than shipping a file that quietly disagrees with
   * the patch the caller asked for.
   */
  gs1PatchProblems: string[];
  /** Per-track peaks, so an agent can see the balance without a second call. */
  trackPeaksDb: Record<string, number>;
  /**
   * **What the audio lanes contributed, and what could not be mixed.** Always present, so a caller can tell "there were no audio lanes" (`lanes: []`)
   * from "the lane was dropped" (`problems`), which is the distinction the old `skippedLanes` list could not make.
   */
  audioLanes: OfflineAudioLaneReport;
  /**
   * What the renderer had to report about this render, in the plain-sentence shape the arrangement tools use for a
   * lane that could not be resolved.
   *
   * **This list and `audioLanes.problems` are two surfaces for two different causes, and neither replaces the
   * other.** `audioLanes.problems` names an audio *lane* that could not be mixed (including the transport diagnosis
   * for a sample whose fetch failed on a missing CORS header). This list is about the *render* as a whole, and its
   * one cause today is the audio host: a render can come back with the correct frame count and no samples in it
   * (`docs/HEADLESS_CORE_PLAN.md` §6). The renderer **throws** when every attempt is silent
   * (`src/audio/WavExporter.ts`), so a silent buffer is never a successful render here — what this list carries is
   * the *recovered* case, where a retry produced the audio and the caller is still told one was needed. That is the
   * difference between "the server retried and told me" and "the server retried and said nothing".
   */
  problems: string[];
}

interface RendererState {
  child: ChildProcess | null;
  browser: import("playwright").Browser | null;
  page: import("playwright").Page | null;
  port: number | null;
}

const state: RendererState = { child: null, browser: null, page: null, port: null };

function appRoot(): string {
  // `dist-mcp/groove-mcp.mjs` sits next to the repo root it was built from.
  return process.env.GROOVE_MCP_ROOT || process.cwd();
}

/**
 * **A port nobody is using**, asked of the operating system rather than fixed.
 *
 * Muse's report, from a nine-movement piece: a render failed, and every render after it failed too, because port 5411 was held by a **zombie LISTEN socket with no owning process**. The worker asked for a fixed port with `--strictPort`, so Vite refused to start, and the failure looked like "the render hangs" rather than "the port is taken".
 *
 * `GROOVE_MCP_PORT` still wins when a caller sets it — a person debugging wants to know the URL they can open — but the default is a port the OS says is free, which removes the whole class of collision.
 */
export async function aFreePort(): Promise<number> {
  const forced = Number(process.env.GROOVE_MCP_PORT ?? "");
  if (Number.isFinite(forced) && forced > 0) return forced;
  const net = await import("node:net");
  return new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error("could not find a free port"))));
    });
  });
}

/**
 * The sentence a caller sees when a render outlives its budget.
 *
 * It names **what** was being rendered and **how long** it had, because "the render timed out" leaves a person unable to tell a slow piece from a stuck page — which is exactly the position Muse was in while four movements of a piece would not render and nothing said whether work was happening.
 */
export function renderTimeoutMessage(what: string, seconds: number): string {
  return `the render of ${what} did not answer within ${seconds}s — the page may be stuck, and the renderer has been reset so the next call starts a fresh one`;
}

/**
 * **A render that stops answering is reported, and the renderer is reset so the next call can work.**
 *
 * Muse, rendering a nine-movement piece through this server, described the worst version of this problem: four movements hung with **no CPU progress and no message**, so the only way to tell a stuck page from a slow piece was to give up on it. A page that has stopped answering cannot be asked anything more, and keeping it would make every later render fail the same way — which is what "worked once, then never again" was.
 *
 * The default budget is fifteen minutes: the same agent's nine-movement renders took three to eight minutes each, so a shorter one would have killed work that was progressing normally.
 */
async function withRenderTimeout<T>(work: Promise<T>, what: string, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(renderTimeoutMessage(what, Math.round(timeoutMs / 1000)))), timeoutMs);
      }),
    ]);
  } catch (error) {
    // A page that did not answer is not a page to keep using.
    await resetRenderer();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function ensurePage(): Promise<import("playwright").Page> {
  if (state.page) return state.page;

  const root = appRoot();
  const port = await aFreePort();
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) {
    throw new Error(`cannot render: ${viteBin} not found. Run the server from the repository root, or set GROOVE_MCP_ROOT.`);
  }

  state.child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      let output = "";
      const onData = (chunk: Buffer) => {
        output += chunk.toString();
        if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve();
      };
      state.child?.stdout?.on("data", onData);
      state.child?.stderr?.on("data", onData);
      state.child?.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
      setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60000);
    });

    const { chromium } = await import("playwright");
    state.browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await state.browser.newPage();
    state.page = page;
    state.port = port;
    /**
     * ⭐ **A page that is still loading is retried, not reported as a failed render.**
     *
     * Vite reports itself ready when it *can* serve the app, which is not when the app has finished loading: this is a large application, and under
     * load it takes tens of seconds before the module graph and `index.html` reach `domcontentloaded`. Playwright's default navigation budget is
     * **30 s**, so a busy machine produced `page.goto: Timeout 30000ms exceeded` from a renderer whose server was healthy — measured twice in one
     * session on a host running parallel worktrees at a load average of 11, with Vite answering `200 text/html` to a plain request throughout. The
     * page had fetched every module; it simply had not finished.
     *
     * So the navigation gets a longer budget and **one retry**: a timeout here leaves a page in an unknown state, and a second attempt costs less
     * than the render it would otherwise lose. This is the startup half of the rule the render budget already follows — a slow page is not a stuck one.
     */
    try {
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    } catch {
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    }
    return page;
  } catch (error) {
    /**
     * ⭐ **A failed start is cleaned up before it is reported.**
     *
     * `state.child` used to be left set when the server or the browser failed, so the next call saw a non-null `child` with a null `page`, started nothing, and waited on a promise that had already rejected — the renderer "degraded" rather than retried, which is what Muse described as renders that worked once and then never again.
     */
    await resetRenderer();
    throw error;
  }
}

/**
 * Drop the child, the browser and the page, leaving the next call to start a fresh one.
 *
 * The same work as `stopRenderer` — a reset *is* a shutdown, and having two near-identical teardown routines was how
 * the original exit-only path came to differ from the reset path in the first place.
 */
async function resetRenderer(): Promise<void> {
  await stopRenderer();
}

/**
 * Tear the browser and dev server down; called on the shutdown paths below and by `stopRenderer()`.
 *
 * Idempotent on purpose: a signal, a client disconnect and an explicit call can land together, and `close()` on an
 * already-closed browser is fine but a second `kill` of a dead child is worth avoiding. The state is cleared **before**
 * the awaits so a re-entrant call sees nothing to do.
 */
export async function stopRenderer(): Promise<void> {
  const browser = state.browser;
  const child = state.child;
  state.browser = null;
  state.page = null;
  state.child = null;
  state.port = null;
  try {
    await browser?.close();
  } catch {
    /* already gone */
  }
  if (child && !child.killed) child.kill("SIGTERM");
}

/**
 * **Nothing was reaping the browser, so finished renders leaked whole Chromium trees.**
 *
 * Measured: retiring worktrees left **50 processes** whose `/proc/<pid>/cwd` pointed at a deleted directory, including a
 * Chromium that had been running **three hours** after its MCP server's agent finished (`docs/WORKLET_AVAILABILITY.md`,
 * appendix). The server itself was the survivor: an agent ending closes the child's stdin, and this process never
 * reacted to that — the Vite child and the browser connection kept the event loop alive, so the server, and its browser,
 * outlived the client. Neither a signal nor the worktree being removed reaps it either, and the running agent had no
 * reason to notice.
 *
 * **What is registered, and why each one:**
 *
 *   · **stdin `end`/`close`** — what an agent finishing actually does. This is the one path that was missing entirely,
 *     and the one the measured three-hour leak went through. Closing the browser here is awaited, which is only possible
 *     because this is an event callback and not an exit handler;
 *   · **`SIGINT`/`SIGTERM`** — the polite kill. `browser.close()` is asynchronous, so the handler is `async` and the
 *     process exits only after the close returns. This is deliberately **not** a `process.on("exit")`-only path: an
 *     `exit` handler cannot await, so a browser closed there would be killed rather than shut down;
 *   · **`process.on("exit")`** — a synchronous last resort, and only for the Vite child. The browser connection is
 *     Playwright's own pipe: when this process dies the pipe closes and the browser exits on its own (measured — a
 *     `SIGKILL`ed parent left zero Chromium processes), so the exit handler does not try to close the browser. What it
 *     does do is kill the Vite child, which nothing else would reclaim on a `SIGKILL`.
 *
 * Registration is explicit (called from `mcp/server.ts`) rather than a side effect of importing this module, so a test
 * that imports `aFreePort` does not install signal handlers on the test process.
 */
export function installRendererLifecycle(): void {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;

  let shuttingDown = false;
  const shutdown = (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void (async () => {
      await stopRenderer();
      // stderr, never stdout: stdout is the MCP protocol channel. The reason is printed so a person who sees the
      // server vanish can tell which path closed it.
      console.error(`groove-lab MCP server shutting down (${reason})`);
      process.exit(0);
    })();
  };

  // An MCP client that exits closes this process's stdin. Before this, only the signals were handled, so the server
  // kept the browser and the dev server alive indefinitely.
  process.stdin.on("end", () => shutdown("client closed stdin"));
  process.stdin.on("close", () => shutdown("client closed stdin"));

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  /**
   * The synchronous last resort. `exit` cannot await, so this only does what is synchronous — signal the Vite child.
   * The browser needs nothing here: Playwright's pipe closes with this process (measured), and the graceful paths above
   * close it properly before reaching here.
   */
  process.on("exit", () => {
    try {
      if (state.child && !state.child.killed) state.child.kill("SIGKILL");
    } catch {
      /* nothing left to kill */
    }
  });
}

/** One registration per process, however many times `installRendererLifecycle` is called. */
let lifecycleInstalled = false;

function outputDirectory(options: RenderOptions): string {
  const dir = options.outputDir || process.env.GROOVE_MCP_OUT || mkdtempSync(path.join(os.tmpdir(), "groove-mcp-"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * **Where the sample manifest is, and where an audio lane's bytes come from** — one definition for every render path.
 *
 * A render and an audition must resolve `sample.assetId` against the *same* catalogue and the *same* mirror, or one of them finds an instrument the other calls
 * missing. Both read this, and the mirror root keeps the audition's default (`GROOVE_SAMPLE_ROOT`, else the project mirror) for the same reason.
 */
export function sampleManifestPath(): string {
  return path.join(appRoot(), "public", "samples", "manifest.json");
}

export function sampleMirrorRoot(): string {
  return process.env.GROOVE_SAMPLE_ROOT ?? "https://r2mirror.groove.wangda.today";
}

/** True when a pattern carries an audio lane at all — the gate that keeps a 1.6 MB manifest read off every synthesised render. */
export function hasAudioLane(pattern: SequencerPattern): boolean {
  return (pattern.tracks ?? []).some((track) => isAudioLane(track));
}

/** What a render needs to know about the sample catalogue before it starts the browser. */
export interface AudioLaneCatalogueRead {
  /** The manifest text, or `null` when there is nothing to read. */
  text: string | null;
  /**
   * Why the manifest could not be read, naming the path — `null` when the pattern has no audio lane (nothing was needed) or the read succeeded.
   *
   * **This is the difference between "no lanes" and "lanes dropped".** A render whose catalogue is unreadable still plans every lane as unresolvable, and this
   * string carries the real reason into the report instead of the render returning `{}` and leaving the lane both silent and unexplained.
   */
  problem: string | null;
}

/**
 * Read the catalogue a render resolves audio lanes against — **only when a pattern has an audio lane**.
 *
 * A failure is a value, not a throw: a caller running outside a checkout has no manifest, and the render should still run and say so. The path is in the message
 * because "no sample X" and "the manifest is not at /…/manifest.json" are different facts.
 */
export function readAudioLaneCatalogue(pattern: SequencerPattern): AudioLaneCatalogueRead {
  if (!hasAudioLane(pattern)) return { text: null, problem: null };
  const manifest = sampleManifestPath();
  try {
    return { text: readFileSync(manifest, "utf8"), problem: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { text: null, problem: `the sample manifest could not be read at ${manifest} (${reason}), so no audio lane can be resolved` };
  }
}

/**
 * Render a pattern (or a genre's default pattern) and measure it in the same pass.
 *
 * Returning the measurements alongside the file is deliberate: "here is a 4-bar WAV" is far less useful to an
 * agent than "here is a 4-bar WAV, 8.1 s, -1.3 dBTP, -14.2 LUFS, and the hi-hat is 12 dB above the chords".
 */
export async function renderAudio(pattern: SequencerPattern, options: RenderOptions): Promise<RenderResult> {
  if (process.env.GROOVE_MCP_NO_BROWSER === "1") {
    throw new Error("audio rendering is disabled (GROOVE_MCP_NO_BROWSER=1); the library, pattern, MIDI and share tools do not need a browser");
  }
  const page = await ensurePage();
  const what = `${Math.max(1, Math.min(64, options.bars ?? 1))} bar(s) of ${options.genreId ?? pattern.genre_id ?? "a pattern"}`;
  /**
   * The catalogue an audio lane resolves against, read and passed in **before** the page starts.
   *
   * It travels as the manifest text, exactly as the audition path passes it, so the page parses it with the same `catalogueFromManifestText` and the two cannot
   * disagree about an asset id. `null` when the pattern has no audio lane, which keeps a 1.6 MB read off every synthesised render.
   */
  const catalogueRead = readAudioLaneCatalogue(pattern);
  const sampleRoot = sampleMirrorRoot();
  const result = await withRenderTimeout(page.evaluate(
    async ({
      pattern: patternArg,
      format,
      bars,
      bitrateKbps,
      trackPeaks,
      sampleRate,
      channels: channelCount,
      loudnessTrimDb,
      manifestText: manifest,
      sampleRoot: mirrorRoot,
      catalogueProblem,
    }) => {
      /**
       * These specifiers are resolved by the *browser* (the app's dev server), not by Node, so they are built
       * from variables: a literal would send `tsc` looking for `/src/...` on the filesystem and fail.
       */
      const specifier = (path: string) => path;
      const [wav, mp3, loudness, metrics, catalogue] = await Promise.all([
        import(/* @vite-ignore */ specifier("/src/audio/WavExporter.ts")),
        import(/* @vite-ignore */ specifier("/src/audio/Mp3Exporter.ts")),
        import(/* @vite-ignore */ specifier("/src/test/helpers/loudness.ts")),
        import(/* @vite-ignore */ specifier("/src/test/helpers/audioMetrics.ts")),
        import(/* @vite-ignore */ specifier("/src/data/sampleCatalogue.ts")),
      ]);
      const audioCatalogue = manifest ? catalogue.catalogueFromManifestText(manifest, mirrorRoot).assets : [];
      /** The lane report, filled by the renderer rather than re-derived here: what reached the mix is the renderer's answer, not a second guess. */
      let audioLanes: OfflineAudioLaneReport = { lanes: [], events: 0, problems: [] };
      const barsArg = Math.max(1, Math.min(64, bars ?? 1));
      let limiterKind = "fallback";
      /** Lanes whose own GS-1 patch code was refused; see `RenderResult.gs1PatchProblems`. */
      let gs1PatchProblems: string[] = [];
      /**
       * What the renderer reported about this render as a whole, carried out to the reply.
       *
       * `renderPatternOffline` throws when it cannot get audio at all, so a silent buffer never reaches this line.
       * What can reach it is the recovered case — the host returned silence, the renderer retried and succeeded — and
       * that has to be visible, because a caller comparing two renders should know one of them needed a second
       * attempt (see `docs/HEADLESS_CORE_PLAN.md` §6).
       */
      const renderProblems: string[] = [];
      const buffer = await wav.renderPatternOffline(patternArg as never, {
        bars: barsArg,
        /**
         * The analysis lever, and it is honest on both sides: `WavExporter` builds its context with this rate
         * (`src/audio/WavExporter.ts:320` — `new OfflineContextClass(2, lengthInSamples, sampleRate)`), so a lower rate really does
         * render fewer samples rather than relabelling a 44.1 kHz file. An energy curve or a spectrum does not need 44.1 kHz, and at
         * 8 kHz a three-minute song is about a fifth of the work. The channel count is still the exporter's two: mono needs that
         * parameter thread through as well, and it is not done yet.
         */
        ...(sampleRate ? { sampleRate } : {}),
        ...(channelCount ? { channels: channelCount } : {}),
        ...(Number.isFinite(loudnessTrimDb) ? { loudnessTrimDb } : {}),
        /**
         * ⭐ **The callback is passed unconditionally, catalogue or not.**
         *
         * It used to be attached only when the parsed catalogue was non-empty, so an unreadable manifest produced a renderer that planned every lane as
         * unresolvable, called a callback nobody had passed, and returned `{}` — the lane silent *and* unreported. The catalogue and the callback are therefore
         * separate arguments: the first may be empty, the second is what stops the answer being lost.
         */
        audioLaneCatalogue: audioCatalogue,
        onAudioLanes: (report: OfflineAudioLaneReport) => {
          audioLanes = report;
        },
        ...(catalogueProblem ? { audioLaneCatalogueProblem: catalogueProblem } : {}),
        onLimiterKind: (kind: string) => {
          limiterKind = kind;
        },
        /**
         * A lane that named a GS-1 patch which cannot be read is reported, never absorbed into the
         * same silence as an unrouted instrument.
         */
        onGs1PatchProblems: (problems: readonly string[]) => {
          gs1PatchProblems = [...problems];
        },
        /**
         * The host's own failures, kept separate from the lane list above: these are about the render as a whole
         * (see `RenderResult.problems`), where the lane problems name a track.
         */
        onProblems: (problems: readonly string[]) => {
          renderProblems.push(...problems);
        },
      });
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));

      /**
       * Per-track peaks: one isolated render per track, only when asked.
       *
       * `btoa` needs a binary string, and building one character at a time for eight renders is slower than the
       * renders themselves, so the conversion is chunked.
       */
      const trackPeaksDb: Record<string, number> = {};
      if (trackPeaks) {
        const tracksArg = (patternArg as unknown as { tracks: Array<Record<string, unknown>> }).tracks;
        for (let soloIdx = 0; soloIdx < tracksArg.length; soloIdx += 1) {
          const track = tracksArg[soloIdx]!;
          const solo = {
            ...(patternArg as unknown as Record<string, unknown>),
            /**
             * **A solo render plays one track, and an audio lane has no steps to zero.** Zeroing every other lane's steps leaves their samples untouched, so
             * every "solo" would have carried every audio lane in the arrangement; the sample reference is dropped instead, which the lane planner reports as a
             * problem rather than sounding. The catalogue travels too, so the lane being soloed really is measured.
             */
            tracks: tracksArg.map((candidate, idx) =>
              idx === soloIdx
                ? candidate
                : {
                    ...candidate,
                    steps: (candidate.steps as number[]).map(() => 0),
                    velocity: undefined,
                    ...(String(candidate.track_id).toLowerCase() === "audio" ? { sample: undefined } : {}),
                  }
            ),
          };
          try {
            const soloBuffer = await wav.renderPatternOffline(solo as never, {
              bars: barsArg,
              ...(audioCatalogue.length ? { audioLaneCatalogue: audioCatalogue } : {}),
            });
            const soloChannels: Float32Array[] = [];
            for (let c = 0; c < soloBuffer.numberOfChannels; c += 1) soloChannels.push(soloBuffer.getChannelData(c));
            trackPeaksDb[String(track.track_id)] = metrics.samplePeakDb(soloChannels);
          } catch {
            trackPeaksDb[String(track.track_id)] = Number.NEGATIVE_INFINITY;
          }
        }
      }

      /** Bytes as base64: a `number[]` of 788,000 entries is megabytes of JSON to serialise and parse. */
      const toBase64 = (bytes: Uint8Array): string => {
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
        }
        return btoa(binary);
      };
      const wavBytes = new Uint8Array(wav.encodeAudioBufferToWav(buffer));
      if (format === "mp3") {
        const encoded = await mp3.encodeAudioBufferToMp3(buffer, { bitrateKbps: bitrateKbps ?? 192 });
        const mp3Bytes = new Uint8Array(await encoded.blob.arrayBuffer());
        return {
          base64: toBase64(mp3Bytes),
          durationSec: buffer.duration,
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
      return {
        base64: toBase64(wavBytes),
        durationSec: buffer.duration,
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
    },
    {
      pattern,
      format: options.format,
      bars: options.bars,
      bitrateKbps: options.bitrateKbps,
      trackPeaks: options.trackPeaks === true,
      sampleRate: options.sampleRate,
      channels: options.channels,
      loudnessTrimDb: options.loudnessTrimDb,
      manifestText: catalogueRead.text,
      sampleRoot,
      catalogueProblem: catalogueRead.problem,
    }
    ),
    what,
    options.renderTimeoutMs ?? 900_000
  );

  const dir = outputDirectory(options);
  const bpm = pattern.bpm ?? 120;
  /**
   * `genre_master_<bpm>bpm` by default, and `genre_<slug>_<bpm>bpm` when the caller's song has a name.
   *
   * The slug comes from the *caller's title*, never from model prose: it is whitelisted to `[a-z0-9-]` (so nothing can escape the
   * output directory, no separators, no dots, no unicode surprises), lowercased, collapsed and cut to 40 characters, and an
   * empty result falls back to the previous `master` form. The genre and the tempo are always present, so the file still says
   * what it is even if the title is nonsense.
   */
  // `songSlug` keeps an ASCII name byte-identical, gives a non-ASCII title a stable token of its own instead of collapsing it to `master` (which
  // made two differently-named songs share one path and overwrite), and leaves an unnamed song on its historical default.
  const middle = songSlug(options.nameSlug);
  const filename = `${options.genreId ?? pattern.genre_id ?? "groove"}_${middle}_${bpm}bpm.${options.format}`;
  const file = path.join(dir, filename.replace(/[^a-z0-9_.-]/gi, "_"));
  const written = Buffer.from(result.base64, "base64");
  writeFileSync(file, written);

  return {
    path: file,
    filename: path.basename(file),
    bytes: written.length,
    durationSec: result.durationSec,
    sampleRate: result.sampleRate,
    channels: result.channels,
    limiterKind: result.limiterKind,
    truePeakDb: result.truePeakDb,
    integratedLufs: result.integratedLufs,
    gs1PatchProblems: result.gs1PatchProblems ?? [],
    trackPeaksDb: result.trackPeaksDb,
    /**
     * Always present, and **the catalogue problem is attached here in Node as well as in the page**.
     *
     * Belt and braces on purpose: the page already carries it through `audioLaneCatalogueProblem`, but attaching it from the Node-side read means an unreadable
     * manifest can never produce an empty reply even if the page's callback were ever lost again. "The lane is silent and nothing says why" is the exact state this
     * field exists to make impossible.
     */
    audioLanes:
      catalogueRead.problem && !result.audioLanes?.catalogueProblem
        ? { ...(result.audioLanes ?? { lanes: [], events: 0, problems: [] }), catalogueProblem: catalogueRead.problem }
        : result.audioLanes ?? { lanes: [], events: 0, problems: [] },
    problems: result.problems,
  };
}

/**
 * Analyse a WAV this server produced, with no browser.
 *
 * Only the metrics are returned — never the PCM — because the caller is a model: a 10-second stereo float array
 * would be four million numbers of context for a result that is eight.
 */
/**
 * The energy curve an agent can reason about, at one value per second.
 *
 * This is the cheap half of the evaluation's proposal: it needs no new render path, because the WAV it reads is already decoded — and
 * a curve is the measurement a closed loop actually uses ("the build should rise into the drop"), where a single LUFS figure cannot
 * say whether anything moved. One second is deliberately bpm-free: the caller may not know the tempo, and a second is coarse enough to
 * be stable and fine enough to show a build over eight bars.
 */
export function energyCurveDb(channels: Float32Array[], sampleRate: number): { curve: number[]; spreadDb: number } {
  const perWindow = Math.max(1, Math.floor(sampleRate));
  const total = channels[0]?.length ?? 0;
  const windows: number[] = [];
  for (let start = 0; start + perWindow <= total; start += perWindow) {
    let sum = 0;
    let count = 0;
    for (const channel of channels) {
      for (let i = start; i < start + perWindow; i += 1) {
        const value = channel[i];
        sum += value * value;
        count += 1;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    windows.push(Number((20 * Math.log10(Math.max(rms, 1e-6))).toFixed(2)));
  }
  // The spread is the plainest statement of "something happened across this song": the loudest window minus the quietest.
  const spread = windows.length ? Math.max(...windows) - Math.min(...windows) : 0;
  return { curve: windows, spreadDb: Number(spread.toFixed(2)) };
}

export function analyseWavFile(filePath: string): Record<string, unknown> {
  const { channels, sampleRate } = decodeWav(readFileSync(filePath));
  return {
    filePath,
    sampleRate,
    channels: channels.length,
    durationSec: channels[0].length / sampleRate,
    ...measure(channels, sampleRate),
    /**
     * The curve lives with the metrics rather than behind its own tool: an agent that has rendered a song already has the WAV, and
     * one more call to read a curve it could have had for free would be the token economy this project keeps refusing to waste.
     */
    ...(() => {
      const { curve, spreadDb } = energyCurveDb(channels, sampleRate);
      return { energyCurveDb: curve, energySpreadDb: spreadDb };
    })(),
  };
}

/** 16-bit PCM RIFF/WAVE — the only format the app's own exporter writes. */
export function decodeWav(buffer: Buffer): { channels: Float32Array[]; sampleRate: number } {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let offset = 12;
  let format = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataStart = 0;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = buffer.readUInt16LE(body);
      channelCount = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bits = buffer.readUInt16LE(body + 14);
    } else if (id === "data") {
      dataStart = body;
      dataLength = size;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (format !== 1 || bits !== 16) throw new Error("only 16-bit PCM WAV is supported (what the exporter writes)");
  const frames = Math.floor(dataLength / (channelCount * 2));
  const channels: Float32Array[] = Array.from({ length: channelCount }, () => new Float32Array(frames));
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      channels[channel][frame] = buffer.readInt16LE(dataStart + (frame * channelCount + channel) * 2) / 32768;
    }
  }
  return { channels, sampleRate };
}

/** The shared measurement set: the same helpers the export audit and the loudness gate use. */
export function measure(channels: Float32Array[], sampleRate: number): Record<string, unknown> {
  const clicks = clickAnalysis(channels, sampleRate);
  const fingerprint = fingerprintChannels(channels, sampleRate);
  return {
    truePeakDb: truePeakDbChannels(channels),
    samplePeakDb: samplePeakDb(channels),
    integratedLufs: measureLoudness(channels, sampleRate).integratedLufs,
    pinnedSamples: clippedSampleCount(channels),
    discontinuities: clicks.count,
    worstDiscontinuityDb: clicks.worstDb,
    /**
     * Where the worst one is, in seconds — the position a count cannot give.
     *
     * A composer asked for exactly this: `discontinuities` fell from 2406 to 2013 on a song with real clip switches, and a single
     * number cannot say whether the remainder are splice clicks at section boundaries or the music's own transients. The counter
     * has always computed the index (`worstIndex`); this is the same number expressed where the caller can look at it. Aggregating
     * by section boundary is the next step and needs the boundary list, which `flattenSong` already returns.
     */
    worstDiscontinuitySec: clicks.worstIndex === null ? null : Number((clicks.worstIndex / sampleRate).toFixed(4)),
    correlation: channels.length > 1 ? channelCorrelation(channels[0], channels[1]) : 1,
    sideToMidDb: sideToMidDb(channels),
    tailRmsDb: tailRmsDb(channels, sampleRate, 50),
    finalPeakDb: finalPeakDb(channels, sampleRate, 5),
    centroidHz: fingerprint.centroidHz,
    bandDb: fingerprint.bandDb,
  };
}

/**
 * **Per-track stems, written one at a time.**
 *
 * The app has had this in the browser for a while (`exportStemsWav`, behind the sequencer's export menu) and the MCP surface had no way to ask for it: an agent could render the whole mix and not the parts, which is the difference between hearing a balance problem and fixing one.
 *
 * **One stem per evaluation, and the bytes are written before the next render starts.** The browser-side packer learned that lesson already — its own comment records that a `Promise.all` over every stem materialises all of them at once, and eight stereo stems of a three-minute song is not something to hold in a page — so the same shape is used here: render one, hand its bytes to Node, write it, drop it.
 *
 * **The name is decided here rather than in the page**, which makes it one testable rule instead of two: `songSlug` already sanitises a name for a filename, and the track index keeps two identically-named tracks from overwriting each other.
 */
/**
 * The whole-render problems of a stems call, accumulated across stems without repeats.
 *
 * A stems render runs the renderer once per track, and a whole-render problem — the host handing back a
 * silent buffer and the retry recovering it, or the page having no worklets at all — is a fact about the
 * **call**, not about any one stem. The same sentence repeated once per track is not four facts, so the
 * order is kept and the repeats are dropped.
 */
export function mergeRenderProblems(existing: readonly string[], incoming: readonly string[]): string[] {
  const merged = [...existing];
  for (const problem of incoming) if (!merged.includes(problem)) merged.push(problem);
  return merged;
}

export interface StemResult {
  path: string;
  filename: string;
  trackName: string;
  trackIdx: number;
  bytes: number;
  /** Measured from the rendered buffer, not estimated from the pattern. */
  durationSec: number;
  sampleRate: number;
  channels: number;
  truePeakDb: number;
  /** True when the stem rendered to silence, which is a fact worth reporting rather than a file nobody can hear. */
  silent: boolean;
}

export async function renderStems(
  pattern: SequencerPattern,
  options: RenderOptions
): Promise<{ dir: string; stems: StemResult[]; sampleRate: number; bpm: number; audioLanes: OfflineAudioLaneReport; problems: string[] }> {
  if (process.env.GROOVE_MCP_NO_BROWSER === "1") {
    throw new Error("audio rendering is disabled (GROOVE_MCP_NO_BROWSER=1); stems are rendered through the same offline engine as everything else");
  }
  const page = await ensurePage();
  const dir = outputDirectory(options);
  const bpm = pattern.bpm || 120;
  const stems: StemResult[] = [];
  let sampleRate = options.sampleRate ?? 44100;
  /** The audio lane of whichever stem has one — a stem render is one lane, so the reports never overlap. */
  const laneLanes: OfflineAudioLaneReport["lanes"] = [];
  const laneProblems: OfflineAudioLaneReport["problems"] = [];
  let laneEvents = 0;
  let laneCatalogueProblem: string | undefined;
  /** Whole-render problems, deduplicated across stems: one fact, not one per track. */
  let renderProblems: string[] = [];
  const catalogueRead = readAudioLaneCatalogue(pattern);
  const sampleRoot = sampleMirrorRoot();

  for (let index = 0; index < pattern.tracks.length; index += 1) {
    const track = pattern.tracks[index]!;
    const rendered = await page.evaluate(
      async ({ pattern: patternArg, stemTrackIdx, bars, sampleRate: rate, channels: channelCount, manifestText: manifest, sampleRoot: mirrorRoot, catalogueProblem }) => {
        const specifier = (path: string) => path;
        const [wav, loudness, catalogue] = await Promise.all([
          import(/* @vite-ignore */ specifier("/src/audio/WavExporter.ts")),
          import(/* @vite-ignore */ specifier("/src/test/helpers/loudness.ts")),
          import(/* @vite-ignore */ specifier("/src/data/sampleCatalogue.ts")),
        ]);
        const audioCatalogue = manifest ? catalogue.catalogueFromManifestText(manifest, mirrorRoot).assets : [];
        let audioLanes: OfflineAudioLaneReport = { lanes: [], events: 0, problems: [] };
        /** What the renderer reported about this stem's render; the same shape `renderAudio` carries out. */
        const renderProblems: string[] = [];
        const buffer = await wav.renderPatternOffline(patternArg as never, {
          bars: Math.max(1, Math.min(64, bars ?? 1)),
          stemTrackIdx,
          ...(rate ? { sampleRate: rate } : {}),
          ...(channelCount ? { channels: channelCount } : {}),
          // Unconditional, for the same reason as in `renderAudio`: an unreadable catalogue must not discard the whole lane report.
          audioLaneCatalogue: audioCatalogue,
          onAudioLanes: (report: OfflineAudioLaneReport) => {
            audioLanes = report;
          },
          onProblems: (list: readonly string[]) => {
            renderProblems.push(...list);
          },
          ...(catalogueProblem ? { audioLaneCatalogueProblem: catalogueProblem } : {}),
        });
        const channelsOut: Float32Array[] = [];
        for (let c = 0; c < buffer.numberOfChannels; c += 1) channelsOut.push(buffer.getChannelData(c));
        const bytes = wav.encodeAudioBufferToWav(buffer);
        let binary = "";
        const view = new Uint8Array(bytes);
        const chunk = 0x8000;
        for (let i = 0; i < view.length; i += chunk) {
          binary += String.fromCharCode(...view.subarray(i, i + chunk));
        }
        return {
          base64: btoa(binary),
          durationSec: buffer.duration,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          truePeakDb: loudness.truePeakDbChannels(channelsOut),
          audioLanes,
          problems: renderProblems,
        };
      },
      {
        pattern,
        stemTrackIdx: index,
        bars: options.bars,
        sampleRate: options.sampleRate,
        channels: options.channels,
        manifestText: catalogueRead.text,
        sampleRoot,
        catalogueProblem: catalogueRead.problem,
      }
    );

    const bytes = Buffer.from(rendered.base64, "base64");
    const filename = stemFilename(track.name || track.track_id || `track_${index + 1}`, index, bpm);
    const target = path.join(dir, filename);
    writeFileSync(target, bytes);
    sampleRate = rendered.sampleRate;
    laneLanes.push(...(rendered.audioLanes?.lanes ?? []));
    laneProblems.push(...(rendered.audioLanes?.problems ?? []));
    laneEvents += rendered.audioLanes?.events ?? 0;
    laneCatalogueProblem = laneCatalogueProblem ?? rendered.audioLanes?.catalogueProblem;
    renderProblems = mergeRenderProblems(renderProblems, rendered.problems ?? []);
    stems.push({
      path: target,
      filename,
      trackName: track.name || track.track_id || `track_${index + 1}`,
      trackIdx: index,
      bytes: bytes.length,
      durationSec: Number(rendered.durationSec.toFixed(3)),
      sampleRate: rendered.sampleRate,
      channels: rendered.channels,
      truePeakDb: Number(rendered.truePeakDb.toFixed(2)),
      // −120 dB is the floor below which a float render is silence for any practical purpose.
      silent: rendered.truePeakDb <= -120,
    });
  }

  const catalogueProblem = laneCatalogueProblem ?? catalogueRead.problem;
  return {
    dir,
    stems,
    sampleRate,
    bpm,
    /** Whole-render facts (a recovered silent render, a page without worklets), deduplicated across stems. */
    problems: renderProblems,
    audioLanes: {
      lanes: laneLanes,
      events: laneEvents,
      problems: laneProblems,
      ...(catalogueProblem ? { catalogueProblem } : {}),
    },
  };
}

/**
 * **One instrument note, rendered so it can be listened to and measured.**
 *
 * This is the question the whole SFZ layer exists to answer — *which sample does this library use for this note, at what rate, and what does the file say about it* — and until now only a CI probe could ask it. The agent surface could render a whole arrangement and not a single drum hit.
 *
 * It works the way the end-to-end probe works, because that path is the one already proven in this environment: the page imports the app's own catalogue, loader and graph modules, resolves the note through the same `loadNote` the app plays with, starts it in an `OfflineAudioContext`, and renders. Nothing here re-implements resolution.
 *
 * **The resolved fields come back with the audio**, and that is the point rather than a nicety: `samplePath`, `ratio`, `rootKey`, `group`, `offBy`, `oneShot` and `notePolyphony` are what tell a caller whether the library did what the file asked. A silent note with `samplePath` set is a gain problem; a silent note with no `samplePath` is a library that did not resolve.
 */
export interface AuditionResult {
  path: string;
  filename: string;
  assetId: string;
  midi: number;
  bytes: number;
  durationSec: number;
  sampleRate: number;
  channels: number;
  truePeakDb: number;
  /** True when the render carries no signal at all, which is a result rather than a failure. */
  silent: boolean;
  resolved: {
    samplePath: string;
    ratio: number;
    rootKey?: number;
    group?: number;
    offBy?: number;
    oneShot?: boolean;
    notePolyphony?: number;
  };
}

/**
 * `virtuosity-drums-basic_note38.wav`: the instrument, then the note, so two auditions of one library never overwrite each other. `songSlug` handles the sanitising — a multi-instrument library's id contains a colon and a path (`vcsl:Idiophones/Struck`), and that is not a filename anywhere.
 */
export function auditionFilename(assetId: string, midi: number): string {
  return `${songSlug(assetId) || "instrument"}_note${midi}.wav`;
}

export async function auditionInstrumentNote(
  assetId: string,
  midi: number,
  options: RenderOptions & { seconds?: number; gainDb?: number } = { format: "wav" }
): Promise<AuditionResult> {
  if (process.env.GROOVE_MCP_NO_BROWSER === "1") {
    throw new Error("audio rendering is disabled (GROOVE_MCP_NO_BROWSER=1); auditioning renders through the same offline engine as the other audio tools");
  }
  const page = await ensurePage();
  const dir = outputDirectory(options);
  const manifestText = readFileSync(sampleManifestPath(), "utf8");
  const root = sampleMirrorRoot();
  const seconds = Math.min(10, Math.max(0.1, options.seconds ?? 2));

  const rendered = await page.evaluate(
    async ({ manifestText: text, root: sampleRoot, assetId: id, midi: note, seconds: length, sampleRate: rate, gainDb }) => {
      const specifier = (path: string) => path;
      const [catalogue, loaderModule, graph, loudness, exporter] = await Promise.all([
        import(/* @vite-ignore */ specifier("/src/data/sampleCatalogue.ts")),
        import(/* @vite-ignore */ specifier("/src/audio/sampleLoader.ts")),
        import(/* @vite-ignore */ specifier("/src/audio/browserSampleGraph.ts")),
        import(/* @vite-ignore */ specifier("/src/test/helpers/loudness.ts")),
        // The encoder lives in `WavExporter`. The first version of this guessed between two other modules that do not export it — a fallback that would have thrown on the very first audition.
        import(/* @vite-ignore */ specifier("/src/audio/WavExporter.ts")),
      ]);
      const { assets } = catalogue.catalogueFromManifestText(text, sampleRoot);
      const sampleRateValue = rate ?? 44100;
      const frames = Math.ceil(sampleRateValue * length);
      const context = new OfflineAudioContext(1, frames, sampleRateValue);
      const loader = loaderModule.createSampleLoader(graph.browserSampleDecoder(context), assets);
      // A refusal from the loader is the answer to the question, so it is returned rather than thrown.
      let loaded;
      try {
        loaded = await loader.loadNote(id, note);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
      const source = context.createBufferSource();
      source.buffer = loaded.buffer;
      source.playbackRate.value = loaded.ratio;
      const gain = context.createGain();
      gain.gain.value = Math.pow(10, (gainDb ?? 0) / 20);
      source.connect(gain).connect(context.destination);
      source.start(0);
      const buffer = await context.startRendering();
      const channel = buffer.getChannelData(0);
      const bytes = exporter.encodeAudioBufferToWav(buffer);
      let binary = "";
      const view = new Uint8Array(bytes);
      const chunkSize = 0x8000;
      for (let i = 0; i < view.length; i += chunkSize) binary += String.fromCharCode(...view.subarray(i, i + chunkSize));
      return {
        base64: btoa(binary),
        durationSec: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        truePeakDb: loudness.truePeakDbChannels([channel]),
        resolved: {
          samplePath: loaded.samplePath,
          ratio: loaded.ratio,
          ...(loaded.rootKey === undefined ? {} : { rootKey: loaded.rootKey }),
          ...(loaded.group === undefined ? {} : { group: loaded.group }),
          ...(loaded.offBy === undefined ? {} : { offBy: loaded.offBy }),
          ...(loaded.oneShot === undefined ? {} : { oneShot: loaded.oneShot }),
          ...(loaded.notePolyphony === undefined ? {} : { notePolyphony: loaded.notePolyphony }),
        },
      };
    },
    { manifestText, root, assetId, midi, seconds, sampleRate: options.sampleRate, gainDb: options.gainDb }
  );

  if ("error" in rendered) throw new Error(rendered.error);
  const bytes = Buffer.from(rendered.base64, "base64");
  const filename = auditionFilename(assetId, midi);
  const target = path.join(dir, filename);
  writeFileSync(target, bytes);
  return {
    path: target,
    filename,
    assetId,
    midi,
    bytes: bytes.length,
    durationSec: Number(rendered.durationSec.toFixed(3)),
    sampleRate: rendered.sampleRate,
    channels: rendered.channels,
    truePeakDb: Number(rendered.truePeakDb.toFixed(2)),
    silent: rendered.truePeakDb <= -120,
    resolved: rendered.resolved,
  };
}
