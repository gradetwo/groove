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
