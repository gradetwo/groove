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
