/**
 * **The render budget, in one place, because it is quoted in six.**
 *
 * `render_audio`, `render_song`, `render_arrangement`, `render_arrangement_stems`, `render_preview_clip` and
 * `docs/MCP.md` all have to state how long a render may take, and the worker is the thing that actually enforces
 * it. Six copies of "900" is the defect this repository treats as its worst: the doc and the code drift, and the
 * caller plans against a number nothing enforces.
 *
 * So the numbers live in `budget.json` — plain JSON, because `scripts/check_mcp.mjs` is a Node script that speaks
 * JSON-RPC to the built bundle and cannot import TypeScript. It reads the same file this module does, so the gate
 * and the descriptions cannot disagree, and the worker's timeout cannot either.
 *
 * Everything here is a **measured** figure or a budget. Nothing is a guess, and a number without a measurement
 * behind it does not get added.
 *
 * **It also holds the one copy of the `headless` parameter's text** (`headlessParameterDescription()`), for the same
 * reason: every render tool that offers the choice now quotes the same three measured host-node residual numbers and the
 * bound each one sets, and a copy per tool would drift.
 */
import budget from "./budget.json";

/**
 * How long the server waits for one render before it reports the render as unanswered and resets the renderer.
 *
 * Fifteen minutes, and the reason is a session rather than a taste: an agent rendering a nine-movement piece saw
 * each movement take three to eight minutes, so a shorter budget killed work that was progressing normally.
 */
export const RENDER_BUDGET_MS = budget.renderBudgetMs;

/**
 * How long the **Node host** is given for one render, from the same default the browser path uses.
 *
 * It is the same number because two ceilings for one render would be the drift this file exists to prevent, and
 * {@link RENDER_BUDGET_MS}'s own sentence already tells a caller that its client timeout is the other ceiling. What this adds is
 * a process-level override — `GROOVE_MCP_RENDER_TIMEOUT_MS` — because the default is fifteen minutes and the two callers who need
 * it shorter cannot get it from the tool schema: a **criterion** proving "an in-process render answers inside its ceiling rather
 * than hanging" cannot wait 900 s to observe it, and an operator capping a batch render wants the cap in the environment rather
 * than in every request.
 *
 * A malformed value is ignored rather than fatal: a typo must not make every render refuse.
 */
export function resolveRenderBudgetMs(): number {
  const raw = process.env.GROOVE_MCP_RENDER_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return RENDER_BUDGET_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : RENDER_BUDGET_MS;
}

/**
 * How long Playwright is given to load the app's page before the navigation is attempted once more.
 *
 * Not part of the render. Measured cause: Vite answers "ready" before the module graph has finished, and a busy
 * host produced `page.goto: Timeout 30000ms exceeded` from a healthy server. It is a floor under the render
 * budget (0.24× of it), never an addition to it.
 */
export const NAVIGATION_BUDGET_MS = budget.navigationBudgetMs;

/**
 * How often a render that cannot report its own progress says "still working".
 *
 * `OfflineAudioContext.startRendering()` is one uninterruptible call — measured at 96-99.9% of a render's wall
 * clock in `docs/RENDER_PROFILE.md` — so a per-bar number does not exist to be sent. This is the cadence at which
 * the server can honestly say the page is still inside that call.
 */
export const RENDER_PROGRESS_HEARTBEAT_MS = budget.progressHeartbeatMs;

/** The measured costs the tool descriptions quote, so the prose and the table cannot drift apart. */
export const MEASURED_RENDER_COST = budget.measured;

/**
 * The sentence every rendering tool carries, with `{seconds}`, `{minutes}`, `{navSeconds}` and `{progress}`
 * substituted by the caller.
 *
 * The clauses are the facts a caller needs and cannot derive:
 *
 * * **what this server will wait for the render** (ours to set, and the only thing `RENDER_BUDGET_MS` governs);
 * * **that loading the page is a second, smaller allowance on top of it** — the navigation budget plus one retry, spent
 *   *before* the render budget starts. A sentence that folded the two together would be shorter than what the code
 *   actually allows, which is the drift this file exists to prevent;
 * * **that the caller's own timeout is the other ceiling, and is not ours** (the mismatch this file exists to state).
 *
 * The signature clause at the end is a hook rather than a promise: a client that sends a `progressToken` gets
 * `notifications/progress` while the render runs, and a token-less call gets nothing at all, so the sentence has to say
 * which case the caller is in. `renderBudgetSentence()` is the same text with the defaults filled in.
 */
export const RENDER_BUDGET_TEMPLATE =
  "Budget: this server waits up to {seconds} s ({minutes} min) for the render itself, then reports it unanswered and resets the renderer; {minutes} min is measured as nine movements of 3-8 min. Loading the page is separate and smaller: up to {navSeconds} s per navigation, with one retry. The budget is not a promise of a duration — the caller's own client timeout must be at least as long, because it is the other ceiling and not this server's to set. Send a progressToken in the request _meta for notifications/progress while it runs; without one this renders in silence by design.";

/** How the sentence names the client's side of the two ceilings; also the substring the gate looks for. */
export const CLIENT_TIMEOUT_CLAUSE = "the caller's own client timeout must be at least as long";

/**
 * The budget sentence for a tool description, derived from `RENDER_BUDGET_MS` and `NAVIGATION_BUDGET_MS`.
 *
 * Nothing else in the surface may spell the numbers out: a description with `900` typed into it is exactly the second
 * copy the criterion forbids, and `budgetHonesty.test.ts` and `check:mcp` assert this function's output — not a literal —
 * against what the tools and the built bundle actually serve.
 */
export function renderBudgetSentence(): string {
  const minutes = Math.round(RENDER_BUDGET_MS / 60_000);
  // A global regex rather than `replaceAll`, which the project's ES2020 lib does not have.
  return RENDER_BUDGET_TEMPLATE.replace(/\{seconds\}/g, String(Math.round(RENDER_BUDGET_MS / 1000)))
    .replace(/\{minutes\}/g, String(minutes))
    .replace(/\{navSeconds\}/g, String(Math.round(NAVIGATION_BUDGET_MS / 1000)));
}

/**
 * What drives wall clock, from the measurements, as a sentence a caller can plan with.
 *
 * It quotes **one bar** (17.18 s of audio in 17.95-24.25 s, the 0.7× realtime median) and **eight bars** (125.56 s
 * of audio in 445.71-511.28 s) rather than extrapolating a single ratio, because the measurement says the cost is
 * **not** linear: 7.3× the audio took 18-28× the wall clock. A rule of thumb that ignored that would under-quote
 * the only render long enough to need the budget.
 */
export function renderCostSentence(): string {
  const m = MEASURED_RENDER_COST;
  return (
    `Measured on this server: 1 bar is ${m.oneBarAudioSec} s of audio in ${m.oneBarWallSec[0]}-${m.oneBarWallSec[1]} s ` +
    `(${m.fullRateRatio}× realtime at 44.1 kHz stereo); 8 bars is ${m.eightBarAudioSec} s of audio in ` +
    `${m.eightBarWallSec[0]}-${m.eightBarWallSec[1]} s, because cost grows faster than duration. Bars and sample rate drive it: the 8 kHz mono preview ` +
    `path measures ${m.previewAudioSec} s of audio in ${m.previewWallSec} s (${Math.round(m.previewAudioSec / m.previewWallSec)}× realtime)`
  );
}

/** The clause that follows `renderCostSentence()` on the preview tool, where the low-rate default is the point. */
export const PREVIEW_DEFAULT_CLAUSE = "Which is why render_preview_clip defaults to 8 kHz mono.";

/**
 * **The `headless` parameter's description, in one place because seven tools now carry it.**
 *
 * `render_arrangement` was the first tool to expose the Node host (`84638d0`); `render_song`, `render_audio` and
 * `render_preview_clip` run through the same `renderAudio` and gained the same parameter. `normalize_loudness`,
 * `render_instrument_note` and `render_arrangement_stems` followed through the same host — the first through
 * `renderAudio` once per pass, the second through the same loader the Node renderer already builds, the third through
 * the same `stemTrackIdx` argument the page path passes. A copy of the three measured host-node residual readings and the
 * bound each one sets, per tool, is the drift this file exists to prevent — and the numbers are measurements, which is
 * this module's own admission rule.
 *
 * What the sentence has to carry, and why each part is not decoration:
 *
 * * **which host, and how to get it** — `node-web-audio-api`, and that it works with the browser forbidden;
 * * **what is the same and what is not** — this project's own DSP is the same on both hosts (its limiter, master bus
 *   compressor and track-strip compressors are its own worklets on both, and the fixture's biquads agree to −0.00 dB),
 *   while each host's **own** nodes are a different implementation. On the parity probe's own fixture the residual is
 *   1.03 dB in band 3, 1.04 dB in band 7 and 1.612 LU of integrated loudness; the probe's bounds are the **ceiling of
 *   those readings** (1.1 dB / 1.7 LU), so a regression fails. The document names the residual's two halves: the three
 *   group-bus `createDynamicsCompressor()` nodes `src/audio/masterGraph.ts` still carries (`drumGlue`,
 *   `drumParallel`, `musicGlue`; makeup 6.0/18.2/4.9 dB) are removable, and the hosts' own nodes differing from each
 *   other (0.67 dB on one sine, level-dependent) are not. A caller choosing an engine has to be able to read that
 *   **before** choosing, at `tools/list`, without opening a document;
 * * **`engine` in the reply** — so "which host rendered this" is read, never inferred;
 * * **never falls back** — a missing optional package errors and names it; the failure this line keeps meeting is a
 *   render that quietly used the other engine;
 * * **the budget does not apply, but progress does** — `withRenderTimeout` resets a stuck *page*, and an in-process
 *   render has no page, so a caller that needs a ceiling owns it. Progress is no longer silent here: the Node host can
 *   suspend inside the one `startRendering()` call, so a `progressToken` gets **frames rendered out of the render's own
 *   frame count**, at the same 15 s cadence as the page's heartbeat. That is the unit on every tool that renders one
 *   file, and on `render_arrangement_stems` per stem with `track i/N` in the message; `normalize_loudness` and
 *   `render_instrument_note` send none on either host. In particular a stem's frames are **not** budget milliseconds —
 *   this path has no budget to measure against.
 *
 * **One tool deliberately does not use this text.** `get_pitch_report` takes the same flag on a path that resolves a
 * note's source and renders nothing (`resolveOnly`), so quoting a band/loudness gap there would be a true sentence
 * about work the call never does; that tool's parameter says what it buys instead. The count above is the number of
 * tools that quote *this* text.
 */
export function headlessParameterDescription(): string {
  return (
    "render through the **Node Web Audio host** (`node-web-audio-api`) instead of Vite + Chromium — no browser process, and it also works under GROOVE_MCP_NO_BROWSER=1. " +
    "**What is the same, and what is not.** This project's own DSP is the same on both hosts: the limiter, the master bus compressor and every track strip's compressor are its own worklets on both, and the biquad filters the fixture builds agree to −0.00 dB over 11 filters × 12 points. The two hosts' **own** nodes are different implementations, so a residual remains and it belongs to them. On the parity probe's own fixture, measured against the browser render, it is **1.03 dB in band 3** (GS-1 on) and **1.04 dB in band 7** (GS-1 off) in the 13-band fingerprint, with a **1.612 LU** integrated-loudness gap; the probe's bounds are the ceiling of those readings (**1.1 dB / 1.7 LU**), so a regression fails rather than a tolerance being stretched. Two halves are named in the document: the three group-bus `createDynamicsCompressor()` nodes still in `src/audio/masterGraph.ts` (`drumGlue`, `drumParallel`, `musicGlue`; static makeup calibrated at 6.0/18.2/4.9 dB) are the **removable** half, and the two hosts' own nodes differing from each other (the same sine at the same settings, 0.67 dB and growing with level) are the half no bound can align. " +
    "The numbers, the substitutions already landed and the plan to converge are in **docs/HEADLESS_CORE_PLAN.md** (§8.13 and §9.2); the reply's `engine` field says which host actually rendered. " +
    "**This never falls back**: if the optional package is missing the call errors and names it, rather than quietly rendering through Chromium. The server's render budget is **not** applied to this path (it resets a stuck page, and an in-process render has no page to reset), so a client that needs a ceiling owns it. **Progress works here too, in frames**: the Node host suspends inside the one `startRendering()` call, so on the tools that render one file a `progressToken` receives the frames rendered out of the render's own frame count — at the same 15 s cadence as the browser heartbeat, ending at 100%. `render_arrangement_stems` reports the same way **per stem**, with `track i/N` in the message, so the count never restarts; `normalize_loudness` and `render_instrument_note` send no progress on either host. A frame is not a budget millisecond: this path has no budget to measure against."
  );
}

/**
 * The one-sentence pointer a tool *description* carries (not the parameter), so `tools/list` shows an engine choice
 * exists before a model opens the schema. Deliberately short: the measured numbers live in the parameter.
 */
export const HEADLESS_POINTER_SENTENCE =
  " Pass `headless: true` to render through the Node Web Audio host instead of Chromium — the parameter carries the measured host-node residual and the measurement each bound is taken from.";
