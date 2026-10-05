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
 *
 * ## And, opt-in, the same renderer under a Node host
 *
 * `options.headless` (see `mcp/render/headless.ts`) runs the *same* `renderPatternOffline`, worklets and GS-1 wasm
 * under `node-web-audio-api` with no browser at all. It is deliberately **off by default and honest about why**: the
 * parity probe measures the two hosts still differing by three sentences (1.03 dB band 3, 1.04 dB band 7, 1.612 LU),
 * recorded in `docs/HEADLESS_CORE_PLAN.md` §8.13. What the flag buys today is an entry — a deployment with no browser
 * can render and the caller is told which host produced the file — and what it is not is a claim that the two sounds
 * have converged. The branch never falls back: if the optional package is missing the call errors and says so.
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
import { isSampledLane } from "../../src/data/sampledInstruments";
/**
 * The budgets and the measured costs, from `budget.json` — read by the tool descriptions and by
 * `scripts/check_mcp.mjs` as well as by the timeouts below, so there is one number rather than six.
 */
import { NAVIGATION_BUDGET_MS, RENDER_BUDGET_MS, resolveRenderBudgetMs } from "./budget";
import { createRenderProgress, runWithProgress, type ProgressReporter } from "./progress";
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
   * How long a render may take before the page is declared stuck, in milliseconds. Default `RENDER_BUDGET_MS` (15
   * minutes), chosen from measurement: a nine-movement piece rendered through this server took three to eight
   * minutes per movement, so anything shorter would kill work that was progressing.
   */
  renderTimeoutMs?: number;
  /**
   * Where a render narrates itself — present **only** when the caller sent an MCP `progressToken`.
   *
   * It is an argument rather than a module-level reporter so that "a token-less call is silent" is a property of
   * the call, not of global state a second render could satisfy by accident.
   */
  progress?: ProgressReporter;
  /**
   * Render on the **Node Web Audio host** instead of Vite + Chromium (`mcp/render/headless.ts`).
   *
   * Opt-in and explicit, because the residual between the two hosts is real and is bounded rather than hidden:
   * `scripts/probe_headless_parity.ts` measures 1.03 dB in band 3, 1.04 dB in band 7 and 1.612 LU of loudness on its own
   * fixture, sets each bound at the ceiling of those readings, and prints the measurement behind every bound.
   * `docs/HEADLESS_CORE_PLAN.md` §8.13 names the residual's two halves: this project's own DSP is the same on both hosts
   * (its limiter, bus and strip compressors are its own worklets), while each host's **own** nodes differ — the group bus
   * still runs three host compressors (`drumGlue`/`drumParallel`/`musicGlue`, the removable half) and the two hosts'
   * implementations differ from each other (the half no bound can align). The flag exists so a caller can *choose* that
   * host — a deployment with no browser, or a cheaper cold start — with the residual recorded rather than smoothed over.
   *
   * The branch does **not** fall back: a missing `node-web-audio-api` throws the message from
   * `headlessUnavailableMessage()` and no browser render is started. It is also deliberately **not** wrapped in
   * `withRenderTimeout`: that budget resets a stuck *page*, and an in-process render has no page to reset. It **does**
   * narrate itself now: `options.progress` reaches `renderPatternHeadless`, which reports frames rendered out of the
   * render's own frame count at the same cadence the page heartbeat uses.
   */
  headless?: boolean;
  /**
   * Render **one track** of the pattern, not the mix — the argument `render_arrangement_stems` has always used.
   *
   * It is not a headless-only switch: it is carried here because the browser path built it inline inside its own
   * `page.evaluate`, and the Node host had no way to be told the same thing. `renderPatternOffline` has accepted
   * `stemTrackIdx` all along (`src/audio/WavExporter.ts:131`, applied at `:1212` and `:1362`, and threaded to the
   * audio-lane planner at `src/audio/offlineAudioLanes.ts:249`), so passing it through is a forwarded argument rather
   * than a second renderer. `undefined` renders the whole pattern, which is what every other tool wants.
   */
  stemTrackIdx?: number;
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
  /**
   * **Which Web Audio host produced this file**, so "headless" is never something a caller has to infer.
   *
   * `browser` is the Vite + Chromium page every render has always used; `node-web-audio-api` is the opt-in headless
   * host. The field is in every reply on purpose: the failure this line of work keeps meeting is a *silent* fallback,
   * and a reply that names its own engine cannot be one.
   */
  engine: "browser" | "node-web-audio-api";
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
export function renderTimeoutMessage(
  what: string,
  seconds: number,
  clause = "the page may be stuck, and the renderer has been reset so the next call starts a fresh one"
): string {
  return `the render of ${what} did not answer within ${seconds}s — ${clause}`;
}

/**
 * What the **Node host's** timeout says instead of the page sentence, because there is no page: the render really is still
 * running, and the caller needs the levers rather than a renderer reset that will not happen.
 */
export const NODE_HOST_BUDGET_CLAUSE =
  "the Node host render did not finish in that time; render fewer bars, a lower `sampleRate`, mono `channels`, a `startBar`/`endBar` span, or raise your own client timeout — which is the other ceiling and not this server's to set";

/**
 * ⭐ **The render named by how much audio it is, because "bars" means two different things to the two callers.**
 *
 * `render_arrangement`'s `bars` is a pass count over a pattern that is `bars` measures long, while `render_song` passes `bars: 1`
 * and hands over a pattern that is the **whole song** — and a song's sections are counted in *passes of their clip*, a clip being
 * eight measures for `chicago-house` (`mcp/song.ts`'s own note: *"a section's `bars` counts passes of its clip"*). So the step
 * count cannot be divided by sixteen and called measures: measured on the owner's own reproduction, a three-**measure** song
 * (`add_section {slot:"A", bars:2}` on the seeded one-bar section, 49.75 s of audio) has `totalSteps: 384`, and `384/16` is the
 * **24 bars** an earlier version of this sentence printed. A timeout that names the wrong length sends the reader to the wrong
 * lever, so this names the **seconds of audio** instead — from the step count at sixteenth notes and the pattern's own tempo,
 * which is the arithmetic `secondsEstimate` already uses — and leaves "how many bars that is" to the pattern's own model.
 */
function renderLengthFor(what: string, pattern: Pick<SequencerPattern, "totalSteps" | "bpm">, options: RenderOptions): string {
  const passes = Math.max(1, options.bars ?? 1);
  const steps = pattern.totalSteps ?? 0;
  const bpm = Math.max(20, Math.min(300, pattern.bpm ?? 120));
  if (!(steps > 0)) return `${what} (${passes} pass(es))`;
  const seconds = steps * passes * (60 / bpm / 4);
  return `${what} — ${seconds.toFixed(1)}s of audio, ${passes} pass(es) of a ${steps}-step pattern at ${bpm} bpm —`;
}

/**
 * **What a caller sees when the default path's worker cannot start at all** — the mirror of
 * `headlessUnavailableMessage()`, and written for the same reason.
 *
 * The default path needs Vite + Chromium and says so in every tool description; what it did **not** have was an
 * answer in this repository's own words when the browser was not there. Measured on this checkout by pointing
 * `PLAYWRIGHT_BROWSERS_PATH` at a directory that does not exist: the render failed in **1.2 s**, which is the fast
 * refusal the shape calls for — and the message was Playwright's raw
 * `browserType.launch: Executable doesn't exist at …` block, whose advice is **`pnpm exec playwright install`** in a
 * repository that installs with **npm** and whose own CI, `DEPLOY.md` and README all say
 * `npx playwright install --with-deps chromium`. It also could not mention the one alternative that needs no browser
 * at all, because the worker does not know the tool schema.
 *
 * So this names: what could not start, the reason, **both** executable next steps (install the browser, or ask for
 * `headless: true`), and — in its own sentence, like the headless message — the thing that did **not** happen. A
 * caller that did not ask for the Node host must not receive one; the whole point of the flag is that the two engines
 * are distinguishable, and quietly substituting the other one is the silent fallback this file's header is about.
 *
 * Exported so the sentence can be judged without a browser: `src/test/mcpRenderNoBrowser.test.ts` drives the real
 * start path with an empty `PLAYWRIGHT_BROWSERS_PATH`, asserts the message carries both steps, and asserts the call
 * takes seconds rather than minutes.
 */
export function browserUnavailableMessage(reason: unknown): string {
  const raw = reason instanceof Error ? reason.message : String(reason);
  /**
   * ⭐ **The detail is kept and the advice is dropped.**
   *
   * A Playwright launch failure arrives as one diagnostic line followed by a boxed "please run `pnpm exec playwright
   * install`" block. The diagnostic is the useful half — it names the executable path or the closed target — and the
   * block is the half this repository must not pass on, because a caller following it in an npm checkout gets a
   * command that is not installed. Filtering the pnpm line and the box characters rather than taking only the first
   * line keeps a multi-line cause intact.
   */
  const detail =
    raw
      .split("\n")
      .filter((line) => !/pnpm/.test(line) && !/^\s*[╔║╚═]/.test(line))
      .join("\n")
      .trim() || raw.trim();
  return (
    `the default render path runs the app's own engine in Vite + Chromium, and the browser could not be started here (${detail}). ` +
    `Install Playwright's browser with \`npx playwright install --with-deps chromium\` — this repository installs with npm — or, if the \`playwright\` package itself is missing, restore it with \`npm ci\`. ` +
    `Alternatively ask for \`headless: true\`, which renders the same engine on the Node Web Audio host with no browser; the two hosts differ by a measured residual, recorded in docs/HEADLESS_CORE_PLAN.md. ` +
    `**No headless render was started instead** — a caller that did not ask for the Node host does not get it.`
  );
}

/**
 * **A render that stops answering is reported, and the renderer is reset so the next call can work.**
 *
 * Muse, rendering a nine-movement piece through this server, described the worst version of this problem: four movements hung with **no CPU progress and no message**, so the only way to tell a stuck page from a slow piece was to give up on it. A page that has stopped answering cannot be asked anything more, and keeping it would make every later render fail the same way — which is what "worked once, then never again" was.
 *
 * The default budget is fifteen minutes: the same agent's nine-movement renders took three to eight minutes each, so a shorter one would have killed work that was progressing normally.
 *
 * Exported so the behaviour itself can be judged without a browser (`src/test/renderWorkerResilience.test.ts`): the sentence was already pinned, and the race that produces it was not. A stuck call must **reject** with that sentence rather than stay pending — the difference between a loud failure and the silent stall the report is about.
 */
export async function withRenderTimeout<T>(work: Promise<T>, what: string, timeoutMs: number): Promise<T> {
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

/**
 * ⭐ **The same ceiling for the Node host, where there is no page to reset and therefore nothing that may hang in silence.**
 *
 * `withRenderTimeout` above was written for a stuck *page*: it rejects **and resets the renderer**, which is the right pair for
 * a browser and meaningless for an in-process render. That was read as "an in-process render needs no ceiling", and the owner's
 * measurement is what that costs: `render_song {headless: true}` on a two-bar `chicago-house` song **outlives a 60 s and a 300 s
 * client timeout with no result and no WAV**, because the render is slow — measured on this checkout, **135.9 s of wall clock for
 * 49.75 s of audio**, 2.7× realtime — and nothing in the server was counting. A caller cannot tell that from a hang, and §27's
 * rule is that a failure has to be visible rather than silent.
 *
 * So this path gets the same `RENDER_BUDGET_MS` ceiling as the browser path — **the same number**, because two ceilings for one
 * render would be the drift `budget.json` exists to prevent — and **no `resetRenderer()`**, since there is no renderer to reset.
 * Nothing can stop a `startRendering()` already under way; what this guarantees is that the **call** answers, with a sentence
 * naming what was rendering, how long it had, and the levers that make it cheaper.
 */
export async function withNodeHostBudget<T>(work: Promise<T>, what: string, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(renderTimeoutMessage(what, Math.round(timeoutMs / 1000), NODE_HOST_BUDGET_CLAUSE))), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * ⭐ **A dev server that never started is an answer, not an uncaught exception.**
 *
 * `spawn` reports a failure to *start* — a binary that is not there, a working directory that has gone, ENOENT, a
 * resource limit that refuses the fork — as an `error` **event** on the child rather than through `exit`. An `error`
 * on an emitter with no listener is an uncaught exception: the same mechanism that let a closed stdio pipe kill the
 * server (`mcp/stdioChannel.ts`), except here it killed the render worker *and the process with it* before any
 * promise could reject, so a caller got a dead server instead of a failed render.
 *
 * The listener turns it into the rejection this promise already carries out: `ensurePage`'s catch calls
 * `resetRenderer()`, the tool returns `failure(...)` naming the cause, and the next render starts a fresh dev
 * server. The `existsSync` check above lowers the chance of this and cannot remove it — it cannot cover the window
 * between the check and the spawn, a cwd that disappears in between, or the fork being refused.
 *
 * Extracted and exported so the criterion can drive it (`src/test/renderWorkerSpawnError.test.ts`) with a binary
 * that does not exist, which is the only way to produce a real spawn `error` without breaking a checkout. It also
 * clears its timer on the first settle, which the inline version did not: a resolved start used to leave a 60 s
 * timer behind that could only ever reject an already-settled promise.
 */
export function awaitRendererStart(child: ChildProcess, timeoutMs = 60_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let output = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (/Local:\s+http/.test(output) || /ready in/.test(output)) finish();
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => finish(new Error(`vite exited early (${code}):\n${output}`)));
    // The listener whose absence was the crash: a start failure is reported, never thrown.
    child.on("error", (error) => finish(new Error(`could not start the dev server: ${(error as Error).message}\n${output}`)));
    timer = setTimeout(() => finish(new Error(`vite did not become ready in ${Math.round(timeoutMs / 1000)}s:\n${output}`)), timeoutMs);
  });
}

async function ensurePage(): Promise<import("playwright").Page> {
  /**
   * ⭐ **A dead page is not a live one, and until this check existed the renderer could not tell.**
   *
   * The cached page was returned unconditionally. A browser process runs out of GS-1 budget after
   * roughly forty to a hundred and twenty renders and disappears — measured, `docs/RENDER_PROFILE.md` —
   * and when it went, `page.evaluate` failed with *"Target page, context or browser has been closed"*
   * for **every later render in that session**: no rebuild, no recovery. `scripts/probe_browser_death_recovery.mjs`
   * is the one-command criterion, and it was red.
   *
   * The recovery path already existed (`resetRenderer`, called on other error paths); what was missing
   * was asking whether the page is still alive before handing it back. A closed page or a disconnected
   * browser now takes that path, and a healthy one costs a liveness query.
   */
  if (state.page) {
    const alive = !state.page.isClosed() && (state.browser?.isConnected() ?? false);
    if (alive) return state.page;
    await resetRenderer();
  } else if (state.browser && !state.browser.isConnected()) {
    // The page went with the browser; clear the remainder of the state before rebuilding.
    await resetRenderer();
  }

  const root = appRoot();
  const port = await aFreePort();
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) {
    throw new Error(`cannot render: ${viteBin} not found. Run the server from the repository root, or set GROOVE_MCP_ROOT.`);
  }

  const child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  state.child = child;
  try {
    await awaitRendererStart(child);

    const { chromium } = await import("playwright");
    /**
     * ⭐ **The browser's own failure is translated here, and only here.**
     *
     * This is the one startup failure whose message is not this repository's: `chromium.launch()` reports what
     * Playwright knows (a missing executable, a missing package, a refused sandbox) and its advice is written for a
     * pnpm checkout. `browserUnavailableMessage()` turns it into this project's sentence — the install command this
     * repository actually documents, and the `headless: true` alternative — while the catch below still does the
     * cleanup, so a failed launch leaves no half-built renderer behind.
     */
    let browser: import("playwright").Browser;
    try {
      browser = await chromium.launch({ args: ["--no-sandbox"] });
    } catch (error) {
      throw new Error(browserUnavailableMessage(error));
    }
    state.browser = browser;
    const page = await browser.newPage();
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
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_BUDGET_MS });
    } catch {
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_BUDGET_MS });
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
  /**
   * ⭐ **Widened: a lane whose instrument names a recorded instrument needs the catalogue too.**
   *
   * The gate exists so a synthesised render does not read a 1.6 MB manifest. It keyed on `track_id === "audio"`, which
   * was the only shape a recorded lane had — and once the written table made a genre's `piano_lead` chords lane a
   * Salamander lane, a pattern of nothing but mapped genre lanes read **no catalogue at all**, so every mapped lane fell
   * back to its synthesiser while the table and the report both said it was a recording. The predicate is the same
   * question `sampledStandDownIndexes` asks, so the two cannot disagree about which patterns need a manifest.
   */
  return (pattern.tracks ?? []).some((track) => isAudioLane(track) || isSampledLane(track));
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

/** What the *page* returns for one render: the audio, the measurements, and the renderer's own problem list. */
export interface RenderAudioPayload {
  base64: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  limiterKind: string;
  truePeakDb: number;
  integratedLufs: number;
  gs1PatchProblems?: string[];
  trackPeaksDb?: Record<string, number>;
  audioLanes?: OfflineAudioLaneReport;
  problems?: string[];
}

/**
 * Render a pattern (or a genre's default pattern) and measure it in the same pass.
 *
 * Returning the measurements alongside the file is deliberate: "here is a 4-bar WAV" is far less useful to an
 * agent than "here is a 4-bar WAV, 8.1 s, -1.3 dBTP, -14.2 LUFS, and the hi-hat is 12 dB above the chords".
 */
export async function renderAudio(pattern: SequencerPattern, options: RenderOptions): Promise<RenderResult> {
  /**
   * ⭐ **The headless branch is first, it is explicit, and it does not fall through.**
   *
   * The order matters: it sits **above** the `GROOVE_MCP_NO_BROWSER` refusal because the Node host needs no browser, and
   * it `return`s rather than assigning a variable, so there is no path from here into `ensurePage` — a caller that asked
   * for the Node host either gets it or gets an error naming the missing package. That is the whole point of the
   * criterion in `src/test/mcpHeadlessRender.test.ts`.
   */
  if (options.headless === true) {
    const catalogueRead = readAudioLaneCatalogue(pattern);
    const { renderPatternHeadless } = await import("./headless");
    /**
     * ⭐ **The ceiling the owner's report asks for.**
     *
     * The Node host used to run without one, on the reasoning that `withRenderTimeout` exists to reset a stuck page. Measured:
     * two bars of `chicago-house` at full rate is **135.9 s**, so a caller with a shorter client timeout sees "no result and no
     * WAV" rather than an answer. `withNodeHostBudget` gives this path the same budget as the browser path and keeps the
     * call from hanging in silence (`mcp/render/worker.ts:renderTimeoutMessage`).
     */
    const what = renderLengthFor(options.genreId ?? pattern.genre_id ?? "a pattern", pattern, options);
    const payload = await withNodeHostBudget(
      renderPatternHeadless(pattern, options, catalogueRead, {
        publicRoot: path.join(appRoot(), "public"),
        sampleRoot: sampleMirrorRoot(),
      }),
      what,
      options.renderTimeoutMs ?? resolveRenderBudgetMs()
    );
    return finishRenderAudio(payload, pattern, options, catalogueRead, "node-web-audio-api");
  }
  if (process.env.GROOVE_MCP_NO_BROWSER === "1") {
    throw new Error("audio rendering is disabled (GROOVE_MCP_NO_BROWSER=1); the library, pattern, MIDI and share tools do not need a browser");
  }
  const progress = options.progress;
  /**
   * ⭐ **A cold start is announced before it is waited on.**
   *
   * `ensurePage` can spend the navigation budget twice before any audio exists, and that happens *before* the render
   * budget below even starts. Without this phase a caller watching for progress sees nothing for the whole startup,
   * which is the state this work exists to end.
   */
  const page = await runWithProgress(progress, "starting the renderer (Vite + Chromium)", ensurePage);
  const what = `${Math.max(1, Math.min(64, options.bars ?? 1))} bar(s) of ${options.genreId ?? pattern.genre_id ?? "a pattern"}`;
  /**
   * The catalogue an audio lane resolves against, read and passed in **before** the page starts.
   *
   * It travels as the manifest text, exactly as the audition path passes it, so the page parses it with the same `catalogueFromManifestText` and the two cannot
   * disagree about an asset id. `null` when the pattern has no audio lane, which keeps a 1.6 MB read off every synthesised render.
   */
  const catalogueRead = readAudioLaneCatalogue(pattern);
  const sampleRoot = sampleMirrorRoot();
  /**
   * The render itself, under the budget, with a heartbeat for the part that cannot report.
   *
   * The heartbeat is the *only* honest progress available here: `startRendering()` is 96-99.9% of the wall clock in
   * one call (measured in `docs/RENDER_PROFILE.md`), so there is no per-bar boundary to hook. What the client gets
   * is "still working" every `RENDER_PROGRESS_HEARTBEAT_MS`, which is what distinguishes a slow render from a hang.
   */
  let result: Awaited<ReturnType<typeof renderAudioInPage>>;
  try {
    result = await runWithProgress(progress, `rendering ${what}`, () =>
      withRenderTimeout(
        renderAudioInPage(page, pattern, options, catalogueRead, sampleRoot),
        what,
        options.renderTimeoutMs ?? RENDER_BUDGET_MS
      )
    );
  } catch (error) {
    // The last thing the caller hears is why, not silence — including the timeout sentence `withRenderTimeout` built.
    progress?.report(RENDER_BUDGET_MS, `render failed: ${(error as Error).message}`);
    throw error;
  }
  progress?.report(RENDER_BUDGET_MS, "render finished; writing the file");

  return finishRenderAudio(result, pattern, options, catalogueRead, "browser");
}

/**
 * **The render, in the page, as a function of its own.**
 *
 * It is extracted rather than inlined for one reason: the Node side has to be able to wrap it in the budget *and* the
 * progress heartbeat (`runWithProgress`), and a `page.evaluate(...)` inlined in an `await` chain cannot be handed to a
 * timer. The body is unchanged — same evaluate, same arguments — so this is a move, not a second render path.
 */
function renderAudioInPage(
  page: import("playwright").Page,
  pattern: SequencerPattern,
  options: RenderOptions,
  catalogueRead: AudioLaneCatalogueRead,
  sampleRoot: string
): Promise<RenderAudioPayload> {
  return page.evaluate(
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
  );
}

/**
 * The Node half of a render: turn the page's answer into a file and a measurement.
 *
 * Split out so that `renderAudio` reads as the budget-and-progress story and this reads as the file story. It carries
 * the same catalogue fallback as before — the Node-side read is attached here as well as in the page, so an unreadable
 * manifest cannot produce an empty lane report.
 */
function finishRenderAudio(
  result: RenderAudioPayload,
  pattern: SequencerPattern,
  options: RenderOptions,
  catalogueRead: AudioLaneCatalogueRead,
  /** Which host produced `result`; carried into the reply so a caller can never be told the wrong engine. */
  engine: RenderResult["engine"]
): RenderResult {
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
    trackPeaksDb: result.trackPeaksDb ?? {},
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
    problems: result.problems ?? [],
    engine,
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

import { analyseWavFile } from "./analysis";
export { analyseWavFile };

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

/**
 * **The page's half of a stem render, as a function of its own.**
 *
 * Extracted for the same reason `renderAudioInPage` is extracted from `renderAudio`: the Node branch has to be
 * able to skip the page, and a `page.evaluate` inlined in a ternary cannot be skipped. The body is unchanged —
 * same evaluate, same arguments, same per-stem budget — so this is a move, not a second render path.
 */
function renderStemInPage(
  page: import("playwright").Page,
  pattern: SequencerPattern,
  options: RenderOptions,
  index: number,
  catalogueRead: AudioLaneCatalogueRead,
  sampleRoot: string
) {
  return withRenderTimeout(
    page.evaluate(
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
    ),
    `stem ${index + 1} of ${pattern.tracks.length}`,
    options.renderTimeoutMs ?? RENDER_BUDGET_MS
  );
}

export async function renderStems(
  pattern: SequencerPattern,
  options: RenderOptions
): Promise<{ dir: string; stems: StemResult[]; sampleRate: number; bpm: number; audioLanes: OfflineAudioLaneReport; problems: string[]; engine: "browser" | "node-web-audio-api" }> {
  /**
   * ⭐ **The Node host branch is decided before the browser is considered**, the same order `renderAudio` uses: the
   * guard below would otherwise refuse a stems call that needs no browser at all.
   *
   * The claim that this needed *new renderer code* was wrong: `renderPatternOffline` has taken `stemTrackIdx` from the
   * start (`src/audio/WavExporter.ts:131`), so this is the same wiring with one more forwarded argument. What the Node
   * module genuinely did not accept was the argument, not the render — `RenderOptions.stemTrackIdx` is that gap.
   */
  const headless = options.headless === true;
  if (!headless && process.env.GROOVE_MCP_NO_BROWSER === "1") {
    throw new Error(
      "audio rendering is disabled (GROOVE_MCP_NO_BROWSER=1); stems are rendered through the same offline engine as everything else, or ask for `headless: true` to render on the Node Web Audio host"
    );
  }
  /** A page exists only on the browser path; starting one for a Node render is the silent fallback this branch prevents. */
  const page = headless ? null : await runWithProgress(options.progress, "starting the renderer (Vite + Chromium)", ensurePage);
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
  /**
   * The Node host, loaded only when asked for — dynamically, like every other entry in this file, so the bundle still
   * builds on a checkout without the optional native addon. The context is the same one `renderAudio` builds, so
   * `publicRoot` and `sampleRoot` keep their single definitions.
   */
  const renderPatternHeadless = headless ? (await import("./headless")).renderPatternHeadless : null;
  const headlessContext = { publicRoot: path.join(appRoot(), "public"), sampleRoot };

  /**
   * A stems render **can** count tracks where a whole-song render cannot: it is one render per track, so the natural
   * unit is the track. **The unit is the host's**: the browser path is under `RENDER_BUDGET_MS` per stem, so it reports
   * a fraction of that budget; the Node path has no budget to measure against, so it reports **frames** — a budget
   * denominator there would be a number shaped like a lie. Both carry the track in the message.
   */
  const totalTracks = Math.max(1, pattern.tracks.length);
  /**
   * Frames already reported in this request. The Node renderer's own counter is **per request**, so a stem that
   * restarted it at zero would have every frame after the first stem silently dropped; offsetting each stem by the
   * frames before it keeps the stream monotone and each stem's percentage honest.
   */
  let framesRendered = 0;
  /**
   * One stem's view of the request's reporter, in frames and with the track named.
   *
   * It forwards `report` unchanged (the browser path's unit) and translates `reportOf` upward: `framesBefore + frames`
   * is the request's cumulative count, and `framesBefore + total` is the upper bound that belongs with it, so the
   * monotone guard sees one upward stream rather than a reset per track.
   */
  const stemProgress = (index: number, framesBefore: number): ProgressReporter | undefined => {
    const outer = options.progress;
    if (!outer) return undefined;
    return {
      report: (progressMs, message) => outer.report(progressMs, message),
      reportOf: (frames, total, message) =>
        outer.reportOf(
          framesBefore + frames,
          total === undefined ? undefined : framesBefore + total,
          `track ${index + 1}/${totalTracks}: ${message}`
        ),
    };
  };
  for (let index = 0; index < pattern.tracks.length; index += 1) {
    const track = pattern.tracks[index]!;
    const trackName = track.name || track.track_id || `track_${index + 1}`;
    if (headless) {
      // Announced before the host's own cold start, in the unit this path uses.
      options.progress?.reportOf(framesRendered, undefined, `rendering stem ${index + 1} of ${totalTracks}: ${trackName}`);
    } else {
      options.progress?.report(((index + 1) / totalTracks) * RENDER_BUDGET_MS, `rendering stem ${index + 1} of ${totalTracks}: ${trackName}`);
    }
    /**
     * ⭐ **Every stem is under the same budget as a whole render.**
     *
     * The timeout used to wrap only `renderAudio`, so the one render path that runs N times was the one path with no
     * ceiling at all: a page stuck on the third of eight stems would have hung the call with no message, which is the
     * failure `withRenderTimeout` exists to name. The budget is per stem, so `RENDER_BUDGET_MS` is a ceiling on each
     * render rather than on the whole call — that is what the tool description states, and it is what the code does.
     *
     * ⭐ **One track per call, on whichever host was asked for.** The Node branch is **not** wrapped in that budget,
     * exactly as `renderAudio` documents — the budget resets a stuck *page* and an in-process render has no page to
     * reset. The arguments are otherwise the same set, `stemTrackIdx` included, so a difference between the engines
     * stays a difference of *host* and never of *arguments*.
     */
    const rendered = headless
      ? await withNodeHostBudget(
          renderPatternHeadless!(
            pattern,
            { ...options, bars: options.bars ?? 1, stemTrackIdx: index, progress: stemProgress(index, framesRendered) },
            catalogueRead,
            headlessContext
          ),
          `stem ${index + 1} of ${pattern.tracks.length} (${trackName})`,
          options.renderTimeoutMs ?? resolveRenderBudgetMs()
        )
      : await renderStemInPage(page!, pattern, options, index, catalogueRead, sampleRoot);
    // The stem's own length, so the next stem's frames continue this request's count instead of restarting it.
    framesRendered += Math.round(rendered.durationSec * rendered.sampleRate);
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
  /**
   * The browser path's closing message. On the Node host the last stem's own report already reaches the request's
   * cumulative frame count, and a message at that same value would be dropped by the monotone guard — so there the
   * per-stem `track N/N: render finished` is the closing message.
   */
  if (!headless) options.progress?.report(RENDER_BUDGET_MS, `all ${stems.length} stem(s) rendered`);
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
    /** Same rule as every other render reply: the host that produced these files is read, never inferred. */
    engine: headless ? "node-web-audio-api" : "browser",
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
/**
 * ⭐ **The claim side of a note, without the audio.**
 *
 * `auditionInstrumentNote` already returns `resolved` beside the render, and its own docstring says why: those
 * fields are "what tell a caller whether the library did what the file asked". A caller who only wants to know
 * *which sample a note lands on and what ratio it will be played at* should not have to pay for a render to
 * find out, and the pitch inspector needs that half without the other. This is the same resolution, returned on
 * its own.
 *
 * What it is not: a statement that the sample's pitch is right. `rootKey` is what the sample **claims**, and
 * only a render plus a measurement can check the claim — which is what the census in `docs/PITCH_TRUTH.md`
 * does, and why this shape carries no verdict field.
 */
export interface InstrumentNoteResolution {
  assetId: string;
  midi: number;
  /**
   * Which Web Audio host resolved the note — `browser` or `node-web-audio-api`, the same two values as
   * `RenderResult.engine`. It is here for the same reason: a caller reading `samplePath` and `ratio` should not have
   * to infer which loader answered, and `get_pitch_report` surfaces this field when an `assetId` was given.
   */
  engine: "browser" | "node-web-audio-api";
  resolved: AuditionResult["resolved"];
}

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
  /**
   * Which Web Audio host produced the file — `browser` or `node-web-audio-api`, the same rule and the same two values
   * as `RenderResult.engine`. A note render that cannot say which engine answered is the silent-fallback shape this
   * line of work keeps meeting, and it is answerable here for one field.
   */
  engine: "browser" | "node-web-audio-api";
  resolved: {
    samplePath: string;
    ratio: number;
    rootKey?: number;
    group?: number;
    offBy?: number;
    oneShot?: boolean;
    notePolyphony?: number;
    /**
     * ⭐ **Which articulation the file's keyswitch selected, and its name in the file's own words.**
     *
     * `loadNote` has returned both since `1efe6ba` (`src/audio/sfz/regionPlayback.ts:90`), and this reply dropped
     * them: a caller could see the sample file that answered and not which take of a `-KS` program it was, which is
     * the one fact a keyswitch library exists to state. The headless builder carries the same two fields
     * (`headlessNoteResolution` in `mcp/render/headless.ts`), so a criterion on either host covers both.
     */
    switchState?: number;
    switchLabel?: string;
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
  options: RenderOptions & { seconds?: number; gainDb?: number; resolveOnly?: boolean } = { format: "wav" }
): Promise<AuditionResult | InstrumentNoteResolution> {
  /**
   * ⭐ **The Node host branch is first and it does not fall through**, the same order and the same reason as
   * `renderAudio`: the environment's browser refusal sits below it, so a call that asked for the Node host either gets
   * it or gets the missing-package error — never a Chromium render it did not ask for.
   *
   * The claim that "the Node host has no implementation of this path at all" was wrong in the part that matters: the
   * page's whole body is `createSampleLoader(browserSampleDecoder(context)) → loadNote → createBufferSource → render`,
   * and every one of those modules already runs under `node-web-audio-api` — it is the same `browserSampleLoader` that
   * `renderPatternOffline` uses on this host (`src/audio/WavExporter.ts:1727`). What was missing was the wiring, not
   * an engine.
   */
  const headless = options.headless === true;
  if (!headless && process.env.GROOVE_MCP_NO_BROWSER === "1") {
    throw new Error(
      "audio rendering is disabled (GROOVE_MCP_NO_BROWSER=1); auditioning renders through the same offline engine as the other audio tools, or ask for `headless: true` to render on the Node Web Audio host"
    );
  }
  const dir = outputDirectory(options);
  const manifestText = readFileSync(sampleManifestPath(), "utf8");
  const root = sampleMirrorRoot();
  const seconds = Math.min(10, Math.max(0.1, options.seconds ?? 2));

  if (headless) {
    const { renderInstrumentNoteHeadless } = await import("./headless");
    const payload = await renderInstrumentNoteHeadless(assetId, midi, { ...options, seconds }, {
      publicRoot: path.join(appRoot(), "public"),
      sampleRoot: root,
      manifestText,
    });
    // A refusal from the loader is the answer to the question, so it is thrown as the message the page path throws.
    if ("error" in payload) throw new Error(payload.error);
    // Resolve-only returns before a byte of audio exists, exactly as the page path does.
    if ("resolvedOnly" in payload) return { assetId, midi, resolved: payload.resolved, engine: "node-web-audio-api" };
    const bytes = Buffer.from(payload.base64, "base64");
    const filename = auditionFilename(assetId, midi);
    const target = path.join(dir, filename);
    writeFileSync(target, bytes);
    return {
      path: target,
      filename,
      assetId,
      midi,
      bytes: bytes.length,
      durationSec: Number(payload.durationSec.toFixed(3)),
      sampleRate: payload.sampleRate,
      channels: payload.channels,
      truePeakDb: Number(payload.truePeakDb.toFixed(2)),
      silent: payload.truePeakDb <= -120,
      engine: "node-web-audio-api",
      resolved: payload.resolved,
    };
  }

  const page = await ensurePage();

  const rendered = await page.evaluate(
    async ({ manifestText: text, root: sampleRoot, assetId: id, midi: note, seconds: length, sampleRate: rate, gainDb, resolveOnly }) => {
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
      /**
       * ⭐ **The claim side of a note, built once and shared by both paths.**
       *
       * This is what the sound source *says* about the note: which sample file it picked, that file's declared
       * root key, and the ratio the note will be played at. Note what is **not** here — the sample's *actual*
       * pitch. Only a render and a measurement can say that, which is why the census in `docs/PITCH_TRUTH.md`
       * exists and why this function returns the claim rather than an assurance.
       */
      const resolved = {
        samplePath: loaded.samplePath,
        ratio: loaded.ratio,
        ...(loaded.rootKey === undefined ? {} : { rootKey: loaded.rootKey }),
        ...(loaded.group === undefined ? {} : { group: loaded.group }),
        ...(loaded.offBy === undefined ? {} : { offBy: loaded.offBy }),
        ...(loaded.oneShot === undefined ? {} : { oneShot: loaded.oneShot }),
        ...(loaded.notePolyphony === undefined ? {} : { notePolyphony: loaded.notePolyphony }),
        // The keyswitch's answer — see the note on `AuditionResult["resolved"]`: the loader has carried these since
        // `1efe6ba` and this builder is where they were lost.
        ...(loaded.switchState === undefined ? {} : { switchState: loaded.switchState }),
        ...(loaded.switchLabel === undefined ? {} : { switchLabel: loaded.switchLabel }),
      };
      // Resolving without rendering: the pitch inspector's source half, and nothing else.
      if (resolveOnly) return { resolved, resolvedOnly: true };
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
        resolved,
      };
    },
    { manifestText, root, assetId, midi, seconds, sampleRate: options.sampleRate, gainDb: options.gainDb, resolveOnly: options.resolveOnly === true }
  );

  if ("error" in rendered) throw new Error(rendered.error);
  // ⭐ Resolve-only returns here, before a single byte of audio is produced. The page has already done the work
  // that matters — `loadNote` is the same call the app plays with — so this costs a page call, not a render.
  if ("resolvedOnly" in rendered) {
    return { assetId, midi, resolved: rendered.resolved, engine: "browser" };
  }
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
    engine: "browser",
    resolved: rendered.resolved,
  };
}
