/**
 * **Saying "still working" while a render is the one thing that cannot say it.**
 *
 * The measured shape of a render (`docs/RENDER_PROFILE.md`, phase split) is that `OfflineAudioContext.startRendering()`
 * is **96-99.9% of the wall clock in one uninterruptible call**. There is no per-bar number to send, so the honest
 * thing a server can send is not a bar counter: it is a heartbeat that says the page is still inside that call.
 *
 * Two rules are wired here rather than left to each caller:
 *
 * 1. **A token-less request is silent.** MCP's `progressToken` is the caller's opt-in (`_meta.progressToken`, and the
 *    SDK hands the handler `_meta`); a server that emitted progress nobody asked for would be inventing a
 *    conversation. `createRenderProgress` returns `undefined` when there is no token, and every emit site is inside
 *    `if (reporter)`, so "no token" and "no notifications" are the same code path rather than a promise.
 * 2. **Progress is monotonic, and the unit is milliseconds of the budget.** `progress` is checked by clients for
 *    non-decreasing values in practice, so the counter is shared between the phase events and the heartbeats and
 *    `notify` ignores an out-of-order call instead of emitting one. The headless host is the one path whose unit is not
 *    the budget — it counts rendered frames — so `reportOf` carries its own counter and never mixes with `report`.
 */
import { RENDER_BUDGET_MS, RENDER_PROGRESS_HEARTBEAT_MS } from "./budget";

/** What a render reports through. Implemented by `mcp/server.ts` over MCP's `notifications/progress`. */
export interface ProgressReporter {
  /** Announce a phase. `progressMs` is elapsed budget, so a client can draw a bar against `RENDER_BUDGET_MS`. */
  report(progressMs: number, message: string): void;
  /**
   * Progress against a **total this render owns**, for the one path the server's budget does not govern.
   *
   * The headless host counts the frames it has rendered (`OfflineAudioContext.suspend` in `src/audio/WavExporter.ts`),
   * so its natural unit is samples and its natural total is the render's own length; reporting those against
   * `RENDER_BUDGET_MS` would be a number that means nothing. `total` is omitted when the length is not known yet — a
   * cold start, before a context exists — which MCP allows. It keeps its own monotonic counter, because mixing two
   * units inside one request would make progress appear to run backwards to a client that checks.
   */
  reportOf(progress: number, total: number | undefined, message: string): void;
}

/**
 * The sink a tool handler receives from the server when — and only when — the caller sent a `progressToken`.
 *
 * `token` is echoed into every notification as MCP requires; `notify` is the transport's own send, so this module
 * never imports the SDK and stays unit-testable.
 */
export type ProgressSink = (token: string | number, progress: number, total: number | undefined, message: string) => void;

/**
 * `notifications/progress` for one request, or nothing at all.
 *
 * ⭐ **The token check is here, once.** Every rendering tool goes through this function, so "does a token-less call
 * emit anything" has a single answer to test, and the answer is `undefined` — not a reporter that checks its own
 * token, which is one `if` away from emitting into the void.
 */
export function createRenderProgress(token: string | number | undefined, notify: ProgressSink): ProgressReporter | undefined {
  if (token === undefined) return undefined;
  let last = -1;
  let lastOwn = -1;
  /** ⭐ The last message sent on this channel, so a new stage at the same progress is not mistaken for a repeat. */
  let lastMessage: string | undefined;
  const send = (progress: number, total: number | undefined, message: string): void => {
    try {
      notify(token, progress, total, message);
    } catch {
      // The client hung up or the transport is gone; a render must not fail because it could not narrate itself.
    }
  };
  return {
    report(progressMs, message) {
      // A decreasing value would be a client's reason to discard the stream; skipping it is cheaper than a guarantee
      // that every caller remembers to count upward.
      if (!Number.isFinite(progressMs) || progressMs <= last) return;
      last = progressMs;
      send(Math.round(progressMs), RENDER_BUDGET_MS, message);
    },
    reportOf(progress, total, message) {
      if (!Number.isFinite(progress)) return;
      // A total below the progress already reported is a caller's arithmetic error, not a number to send; MCP requires
      // `total` to be an upper bound on `progress`.
      if (total !== undefined && (!Number.isFinite(total) || total < progress)) return;
      /**
       * ⭐ **A new stage at the same progress is news, not a repeat** (third evaluation, section 6: stage progress).
       *
       * The rule was "drop anything not strictly increasing", which is right for a counter and wrong for a stage: the MP3
       * encode begins exactly where "render finished; writing the file" left off, so its announcement arrived at an equal
       * progress and was silently swallowed — the one stage a caller most needs to see (F07 measured it at 480.5 ms per
       * 5 s of audio) was the one stage nobody could hear. Progress still never decreases; an identical message at the
       * same progress is still dropped.
       */
      if (progress < lastOwn || (progress === lastOwn && message === lastMessage)) return;
      lastOwn = progress;
      lastMessage = message;
      send(progress, total, message);
    },
  };
}

/**
 * **The frame-counted channel, at the same cadence as the page's heartbeat.**
 *
 * The headless host has progress the browser path does not: it can suspend at known frames, so it reports *frames
 * rendered* rather than only "still working". The cadence is still `RENDER_PROGRESS_HEARTBEAT_MS`, because a caller must
 * not receive one density from one engine and another from the other — and a notification per suspension point would be
 * reporting the renderer's speed as if it were the client's news. `now` is injected so the cadence is a criterion rather
 * than a comment (`src/test/budgetHonesty.test.ts`).
 */
export function createFrameProgress(
  reporter: ProgressReporter | undefined,
  message: (frames: number, total: number) => string,
  now: () => number = Date.now
): (frames: number, total: number) => void {
  let lastAt = Number.NEGATIVE_INFINITY;
  return (frames, total) => {
    if (!reporter) return;
    if (!Number.isFinite(frames) || !Number.isFinite(total) || total <= 0) return;
    const at = now();
    if (at - lastAt < RENDER_PROGRESS_HEARTBEAT_MS) return;
    lastAt = at;
    const bounded = Math.max(0, Math.min(frames, total));
    reporter.reportOf(bounded, total, message(bounded, total));
  };
}

/**
 * A phase message, with the budget still counting underneath.
 *
 * `runWithProgress` is the shape every long step takes: announce the phase, keep the heartbeat going for as long as
 * the work takes, and stop the timer on **both** paths — a render that throws has to stop heartbeating exactly as
 * one that returns does, or the interval outlives the request.
 */
export async function runWithProgress<T>(
  reporter: ProgressReporter | undefined,
  phase: string,
  work: () => Promise<T>
): Promise<T> {
  if (!reporter) return work();
  const startedAt = Date.now();
  reporter.report(0, phase);
  const timer = setInterval(() => {
    reporter.report(Date.now() - startedAt, `${phase} — still working`);
  }, RENDER_PROGRESS_HEARTBEAT_MS);
  // Never a reason for the process to stay alive: a render's own promise is what the caller is waiting on.
  timer.unref?.();
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}
