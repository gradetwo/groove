/**
 * **Automation: a parameter that changes over time, as data plus one pure reading of it.**
 *
 * The arrangement model carried no automation at all, which is the gap `docs/DAW_GAP_ARRANGEMENT.md` §8 ranks fourth
 * ("先做『一条轨一个参数』的连续包络"): a fade had to be faked by splitting the part, or simply not done. This module is
 * the model and the arithmetic only — where a curve is drawn, how it is edited, and how a compiled pattern carries it
 * to the engine are separate concerns, and keeping them out of here is what lets the reading be tested on its own.
 *
 * ## The three decisions worth stating
 *
 * 1. **Points are in beats, and the value is the parameter's own unit.** `TrackV2.gainDb` is decibels, so an envelope
 *    point stores decibels. Normalising to 0–1 here would put a second conversion beside `gainDbToLinear` and the two
 *    would eventually disagree about what "unity" means.
 * 2. **A reading outside the points is flat, not extrapolated.** Before the first point the curve holds its value and
 *    after the last it holds its value. Extrapolating a line past its end is how a fade-out turns into silence below
 *    zero and then into a negative gain.
 * 3. **The line between two points is straight, in the parameter's unit.** That is what makes a two-point fade the
 *    same shape the mixer's own fader draws; an exponential curve is a different feature, not a rounding detail.
 *
 * This file holds no React, no DOM and no audio node: it answers "what is this parameter at beat X", which is the whole
 * question both a lane view and a renderer need to ask.
 */

/** One point on an envelope: a position in beats, and the value there in the parameter's own unit. */
export interface AutomationPoint {
  /** Beats from the arrangement's beginning. Fractional positions are the point — a fade does not land on a grid. */
  atBeats: number;
  /** The value at that position, in the parameter's unit (decibels for a gain lane). */
  value: number;
}

/**
 * ⭐ **The fields a lane may automate, and nothing else.**
 *
 * Each name is a field the arrangement model already carries on a track (`gainDb`, `pan`, `sendA`, `sendB`) — a lane adds
 * a curve to a value that exists rather than inventing a target. Widening this union is what makes a new lane type
 * automatable, and the compile maps each one through the **same conversion its static field uses**, so a lane's first
 * point cannot disagree with the mixer's own value.
 */
export type AutomationParameter = "gainDb" | "pan" | "sendA" | "sendB";

/** A track's envelope for one parameter. Tracks are the scope: one curve per parameter per track. */
export interface AutomationLane {
  parameter: AutomationParameter;
  points: AutomationPoint[];
}

/** The value a parameter keeps where its lane has nothing to say. */
export const AUTOMATION_DEFAULT_VALUE = 0;

/**
 * The mixer's own ceiling, in dB — `gainDbToLinear` in `arrangementCompile` and the offline lane mixer both clamp at
 * +6 dB, and an envelope must not be the one way to exceed it.
 */
export const AUTOMATION_MAX_DB = 6;
export const AUTOMATION_MIN_DB = -60;

/** Points sorted by position, with the later of two points at the same beat winning (the curve cannot turn twice there). */
function normalised(points: readonly AutomationPoint[]): AutomationPoint[] {
  const usable = points.filter((point) => Number.isFinite(point.atBeats) && Number.isFinite(point.value));
  const sorted = [...usable].sort((a, b) => a.atBeats - b.atBeats);
  const out: AutomationPoint[] = [];
  for (const point of sorted) {
    const last = out[out.length - 1];
    if (last && last.atBeats === point.atBeats) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

/**
 * The value of an envelope at `atBeats`.
 *
 * A lane with no points answers {@link AUTOMATION_DEFAULT_VALUE} — "this parameter is not automated", which is what a
 * reader wants rather than an error, because a track without automation is the normal case.
 */
export function valueAt(points: readonly AutomationPoint[], atBeats: number): number {
  const sorted = normalised(points);
  if (sorted.length === 0) return AUTOMATION_DEFAULT_VALUE;
  const first = sorted[0]!;
  if (atBeats <= first.atBeats) return first.value;
  const last = sorted[sorted.length - 1]!;
  if (atBeats >= last.atBeats) return last.value;

  for (let i = 1; i < sorted.length; i++) {
    const right = sorted[i]!;
    if (atBeats > right.atBeats) continue;
    const left = sorted[i - 1]!;
    const span = right.atBeats - left.atBeats;
    // Two points at the same beat were folded above, so `span` is positive; the guard is for a caller's own array.
    if (span <= 0) return right.value;
    const t = (atBeats - left.atBeats) / span;
    return left.value + (right.value - left.value) * t;
  }
  return last.value;
}

/** Whether a lane has any curve in it, i.e. whether a view should draw one. */
export function isAutomated(lane: AutomationLane | undefined): boolean {
  return (lane?.points?.length ?? 0) > 0;
}

/**
 * The lane's value at each of `stepCount` steps, for a renderer that consumes values per step.
 *
 * `beatsPerStep` is the caller's own grid — the arrangement's steps are not always sixteenths — and it is passed rather
 * than assumed so this stays a reading of the curve and not a second opinion about the grid.
 */
export function samplePerStep(points: readonly AutomationPoint[], stepCount: number, beatsPerStep: number): number[] {
  const out: number[] = [];
  for (let step = 0; step < stepCount; step++) out.push(valueAt(points, step * beatsPerStep));
  return out;
}

/** Clamp a gain envelope's value to the range the mixer itself honours, which both writers and readers go through. */
export function clampGainDb(value: number): number {
  return Math.min(AUTOMATION_MAX_DB, Math.max(AUTOMATION_MIN_DB, value));
}

/**
 * ⭐ **The range each automatable parameter may travel**, so one writer can clamp any lane without asking which it is.
 *
 * These are the fields' own ranges as the mixer and the renderer honour them: a level in dB, a pan on the −1…1 scale the
 * strips use, and the two sends as 0…1 gains. Nothing here is invented — each pair is what the corresponding static
 * setter already clamps to, which is why a lane and a fader cannot disagree about a value.
 */
export const AUTOMATION_RANGES: Record<AutomationParameter, { min: number; max: number; step: number }> = {
  // `step` is the keyboard nudge's own unit, so one press is a round number in the parameter's terms: a dB is a dB, and a
  // pan that jumped by 0.1 would be a fifth of the travel in one press.
  gainDb: { min: AUTOMATION_MIN_DB, max: AUTOMATION_MAX_DB, step: 1 },
  pan: { min: -1, max: 1, step: 0.05 },
  sendA: { min: 0, max: 1, step: 0.05 },
  sendB: { min: 0, max: 1, step: 0.05 },
};

/** Clamp any lane's value to the range its own parameter honours. */
export function clampForParameter(parameter: AutomationParameter, value: number): number {
  const range = AUTOMATION_RANGES[parameter];
  return Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : range.min;
}
