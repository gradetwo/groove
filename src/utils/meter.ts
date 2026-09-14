/**
 * Pure sequencer meter helpers (E-02, F-11).
 *
 * These functions used to live inline in `src/views/StudioView.tsx`, where they
 * could only be "tested" by re-implementing them inside the test file. They are
 * extracted here so the shipped math is directly unit-testable.
 *
 * F-11 history: v1.3.5 computed `numerator * (stepsPerWholeNote / denominator)`.
 * A later refactor dropped the numerator, which silently turned "steps per bar"
 * into "steps per beat": 4/4 at 1/16 returned 4 instead of 16 (so a 16-step
 * pattern rendered as 4 bars), 3/4 returned 4 instead of 12, and 7/8 returned 2
 * instead of 14. Restored here.
 */

export type StepResolution = "1/8" | "1/16" | "1/32";

/** Steps contained in one whole note for a given sequencer resolution. */
export function stepsPerWholeNote(resolution: StepResolution): number {
  return resolution === "1/32" ? 32 : resolution === "1/8" ? 8 : 16;
}

/** Numeric numerator of a `"numerator/denominator"` time signature string. */
export function getTimeSignatureNumerator(timeSignature: string): number {
  const parts = String(timeSignature).split("/");
  return parseInt(parts[0], 10) || 4;
}

/** Numeric denominator of a `"numerator/denominator"` time signature string. */
export function getTimeSignatureDenominator(timeSignature: string): number {
  const parts = String(timeSignature).split("/");
  return parseInt(parts[1], 10) || 4;
}

/** Number of steps per visual group (StudioView's `groupSize`). */
export function calculateGroupSize(resolution: StepResolution): number {
  if (resolution === "1/8") return 4;
  if (resolution === "1/32") return 8;
  return 4;
}

/**
 * Steps in one bar of the given time signature at the given resolution.
 *
 *   stepsPerBar = numerator × (stepsPerWholeNote / denominator)
 *
 * 4/4 @1/16 → 16, 3/4 @1/16 → 12, 7/8 @1/16 → 14, 4/4 @1/8 → 8.
 */
export function calculateStepsPerBar(
  timeSignature: string,
  resolution: StepResolution = "1/16"
): number {
  const perBeat = stepsPerWholeNote(resolution) / getTimeSignatureDenominator(timeSignature);
  return Math.max(1, Math.round(getTimeSignatureNumerator(timeSignature) * perBeat));
}
