/**
 * Pure scheduler math, extracted from AudioEngine so it can be unit tested
 * without an AudioContext (F-02).
 */

export interface CatchUpInput {
  /** Step index the scheduler is currently on. */
  currentStep: number;
  /** Absolute AudioContext time the next step is scheduled for. */
  nextStepTime: number;
  /** Current AudioContext time. */
  now: number;
  /** Duration of one step in seconds. */
  stepDur: number;
  /** Total steps of the pattern (used when no loop range is set). */
  stepsCount: number;
  /** Optional loop window [start, end). */
  loopRange?: [number, number] | null;
}

export interface CatchUpResult {
  /** Step index after skipping the missed steps. */
  currentStep: number;
  /** Re-aligned next step time (never behind `now`). */
  nextStepTime: number;
  /** How many steps were skipped. 0 means the grid was already in phase. */
  droppedSteps: number;
}

/**
 * Re-aligns the scheduling grid after a stall.
 *
 * Before this existed, `schedulerLoop` clamped every overdue step to `currentTime`,
 * so a 5 s stall at 300 BPM / 1-32 fired ~200 voices on the same instant.
 * We resume *in phase* by advancing the musical grid instead of replaying it.
 */
export function computeCatchUp(input: CatchUpInput): CatchUpResult {
  const { now, stepDur, stepsCount, loopRange } = input;
  let { currentStep, nextStepTime } = input;

  if (!Number.isFinite(stepDur) || stepDur <= 0) {
    return { currentStep, nextStepTime: now, droppedSteps: 0 };
  }

  // Only a full step (or more) behind counts as a stall; sub-step lateness is normal jitter.
  if (nextStepTime >= now - stepDur) {
    return { currentStep, nextStepTime, droppedSteps: 0 };
  }

  const droppedSteps = Math.max(1, Math.floor((now - nextStepTime) / stepDur));

  if (loopRange) {
    const [lStart, lEnd] = loopRange;
    const loopLen = Math.max(1, lEnd - lStart);
    currentStep = lStart + ((currentStep - lStart + droppedSteps) % loopLen);
  } else {
    const span = stepsCount > 0 ? stepsCount : 16;
    currentStep = (currentStep + droppedSteps) % span;
  }

  nextStepTime += droppedSteps * stepDur;
  // Guard against float drift leaving us marginally behind `now`.
  if (nextStepTime < now) nextStepTime = now;

  return { currentStep, nextStepTime, droppedSteps };
}

export interface VisualLeadInput {
  /** `AudioContext.outputLatency` / `baseLatency` in seconds, whichever the browser exposes. */
  outputLatencySec: number;
  /** Lookahead the master true-peak limiter adds, in seconds. */
  limiterLatencySec: number;
  /** The user's manual A/V alignment trim, in milliseconds (can be negative). */
  compensationMs: number;
  /** Duration of one step in seconds; the visual lead is capped against it. */
  stepDur: number;
}

/** Never delay the playhead by more than this fraction of a step. */
export const MAX_VISUAL_LEAD_STEP_FRACTION = 0.5;

/**
 * How far behind `AudioContext.currentTime` the visual playhead should be drawn.
 *
 * Returns a **negative** number of seconds (a lead into the past), because everything the
 * scheduler does works in one timeline while the listener hears another:
 *
 * - A voice scheduled at `t` is *rendered* at `t`, but it reaches the speakers at
 *   `t + outputLatency`. `currentTime` is already inside the buffered window, so a playhead
 *   that advances the moment `stepQueue[0].time <= currentTime` fires runs ahead of what is
 *   audible — the classic "the playhead is early" report.
 * - The master limiter adds its own lookahead on top (E-12).
 * - `compensationMs` is the user's own trim for the rest of the chain (Bluetooth, a TV, a
 *   slow interface).
 *
 * Capped at half a step so a pathological latency (or a large manual trim) can never make the
 * playhead show the *previous* step. In tests and in a browser that exposes no latency at all
 * this is exactly 0, which is the old behaviour.
 */
export function visualLeadSeconds(input: VisualLeadInput): number {
  const { outputLatencySec, limiterLatencySec, compensationMs, stepDur } = input;
  // NaN terms are dropped rather than poisoning the sum into a broken transform string.
  // An `Infinity` is deliberately *kept*: it means "at least this much", and the cap below
  // turns it into the largest lead that is still musically meaningful.
  const real = (v: number) => (Number.isNaN(v) ? 0 : v);
  const sum = real(outputLatencySec) + real(limiterLatencySec) + real(compensationMs) / 1000;
  if (!(sum > 0)) return 0;
  const cap = Number.isFinite(stepDur) && stepDur > 0 ? stepDur * MAX_VISUAL_LEAD_STEP_FRACTION : sum;
  return -Math.min(sum, cap);
}
