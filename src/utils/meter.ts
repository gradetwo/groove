/**
 * Pure sequencer meter helpers (E-02).
 *
 * These functions are extracted verbatim from `src/views/StudioView.tsx` so the
 * shipped math can be unit-tested directly instead of being re-implemented
 * inside a test file.
 *
 * KNOWN DEFECT — preserved as-is by this extraction:
 * `calculateStepsPerBar` divides by the time-signature denominator only and
 * ignores the numerator, so it actually returns steps per beat. v1.3.5 shipped
 * `timeNum * (stepsPerWholeNote / timeDenom)`; the v1.11.0 StudioView refactor
 * dropped `timeNum`. Restoring the numerator would change shipped behaviour and
 * is therefore out of scope for this test-hardening change.
 */

export type StepResolution = "1/8" | "1/16" | "1/32";

/** Steps contained in one whole note for a given sequencer resolution. */
export function stepsPerWholeNote(resolution: StepResolution): number {
  return resolution === "1/32" ? 32 : resolution === "1/8" ? 8 : 16;
}

/** Numeric denominator of a `"numerator/denominator"` time signature string. */
export function getTimeSignatureDenominator(timeSignature: string): number {
  const parts = timeSignature.split("/");
  return parseInt(parts[1], 10) || 4;
}

/** Number of steps per visual group (StudioView's `groupSize`). */
export function calculateGroupSize(resolution: StepResolution): number {
  if (resolution === "1/8") return 4;
  if (resolution === "1/32") return 8;
  return 4;
}

/**
 * Steps per bar as currently computed by StudioView.
 *
 * The time-signature numerator is intentionally NOT part of this formula so the
 * extracted function behaves exactly like the shipped inline code — see the
 * file header for the known defect this preserves.
 */
export function calculateStepsPerBar(
  timeSignature: string,
  resolution: StepResolution = "1/16"
): number {
  return Math.max(
    1,
    Math.round(stepsPerWholeNote(resolution) / getTimeSignatureDenominator(timeSignature))
  );
}
