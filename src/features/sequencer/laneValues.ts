/**
 * One scale per lane dimension (U10).
 *
 * The parameter lane draws four different things in the same fader column: velocity (1..127),
 * length/gate (0.1..2.0 steps), probability (0..100 %) and ratchet (1, 2, 3, 4, 8). Four scales in
 * one column is exactly how two input paths drift apart — the pointer had its own `commitValue`
 * switch, a keyboard path would need a second one, and the bar height and the readout a third. So
 * the scale lives here once:
 *
 *   - the pointer turns a 0..1 drag ratio into a value through `ratioToValue`;
 *   - the keyboard steps a value by `step` (or `largeStep` with Shift / PageUp-PageDown);
 *   - the bar height and the readout are the same spec the value came from.
 *
 * The ratio formulas are the lane's existing ones, moved rather than rewritten, so a drag that
 * painted 100 still paints 100. Ratchet is the odd one out and says so: its values are a list
 * (1, 2, 3, 4, 8), not a range, because "one more ratchet" is the next entry in that list.
 */
import type { ParameterDimension } from "./stepParameters";

export interface LaneDimensionSpec {
  /** Lowest and highest value the dimension can hold. */
  min: number;
  max: number;
  /** One keypress. */
  step: number;
  /** Shift, or PageUp/PageDown. */
  largeStep: number;
  /** Decimals a value is allowed to keep after arithmetic (gate keeps one, the rest none). */
  decimals: number;
  /**
   * Discrete scales step through this list instead of by arithmetic. Present ⇒ the value the user
   * lands on is always an element of the list.
   */
  values?: readonly number[];
  /** The lane's own reset preset (the number the "reset" button writes). */
  preset: number;
  /** A pointer's 0..1 position inside a column as a value — the drag's existing formulas. */
  ratioToValue(ratio: number): number;
  /** The fader's height, in percent of the column. */
  heightPercent(value: number): number;
  /** The readout and the screen reader's `aria-valuetext`. */
  format(value: number): string;
}

/** Ratchet steps: not a range, a vocabulary (the engine's own set). */
export const RATCHET_VALUES = [1, 2, 3, 4, 8] as const;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function roundTo(value: number, decimals: number): number {
  if (decimals <= 0) return Math.round(value);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export const LANE_SPECS: Record<ParameterDimension, LaneDimensionSpec> = {
  velocity: {
    min: 1,
    max: 127,
    step: 1,
    largeStep: 10,
    decimals: 0,
    preset: 100,
    ratioToValue: (ratio) => clamp(Math.round(ratio * 127), 1, 127),
    heightPercent: (value) => Math.max(5, (value / 127) * 100),
    format: (value) => `${value}`,
  },
  gate: {
    min: 0.1,
    max: 2,
    step: 0.1,
    largeStep: 0.5,
    decimals: 1,
    preset: 0.8,
    ratioToValue: (ratio) => Math.round((0.1 + ratio * 1.9) * 10) / 10,
    heightPercent: (value) => Math.max(5, Math.min(100, (value / 2) * 100)),
    format: (value) => `${Math.round(value * 100)}%`,
  },
  probability: {
    min: 0,
    max: 100,
    step: 1,
    largeStep: 10,
    decimals: 0,
    preset: 100,
    ratioToValue: (ratio) => Math.round(ratio * 100),
    heightPercent: (value) => Math.max(5, value),
    format: (value) => `${value}%`,
  },
  ratchet: {
    min: RATCHET_VALUES[0],
    max: RATCHET_VALUES[RATCHET_VALUES.length - 1],
    step: 1,
    largeStep: 2,
    decimals: 0,
    values: RATCHET_VALUES,
    preset: 1,
    ratioToValue: (ratio) => (ratio < 0.2 ? 1 : ratio < 0.4 ? 2 : ratio < 0.65 ? 3 : ratio < 0.85 ? 4 : 8),
    heightPercent: (value) => Math.max(12, (value / 8) * 100),
    format: (value) => `${value}x`,
  },
};

/**
 * A value moved by one or more steps, clamped to the dimension.
 *
 * Discrete scales walk their list, so ratchet goes 1 → 2 → 3 → 4 → 8 and back, and a large step
 * skips two entries: the point of a discrete scale is that only its own values are reachable.
 * A value that is somehow not in the list (an imported pattern, a stale local state) snaps to the
 * nearest entry first rather than inventing a new one.
 */
export function stepLaneValue(
  spec: LaneDimensionSpec,
  value: number,
  direction: 1 | -1,
  large = false
): number {
  if (spec.values) {
    const list = spec.values;
    const nearest = list.reduce(
      (best, candidate) => (Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best),
      list[0]
    );
    const from = list.indexOf(nearest);
    const distance = large ? spec.largeStep : spec.step;
    const to = clamp(from + direction * distance, 0, list.length - 1);
    return list[to];
  }
  const magnitude = large ? spec.largeStep : spec.step;
  return roundTo(clamp(value + direction * magnitude, spec.min, spec.max), spec.decimals);
}

export interface LaneKeyboardBounds {
  /** How many columns the lane has, for moving between them. */
  count: number;
}

export type LaneKeyboardIntent =
  /** Focus another column; the value is untouched. */
  | { kind: "cursor"; index: number }
  /** Change the value of the column the cursor is on. */
  | { kind: "value"; value: number };

/**
 * The intent behind a keypress on a lane column, or null when the lane should not touch the key.
 *
 * Up/Down change the value because the faders are vertical (that is also what `aria-orientation`
 * says); Left/Right move between columns, which is the pattern a row of sliders has — a roving tab
 * stop rather than one tab stop per step. Anything with ⌘/Ctrl held is left alone for the same
 * reason as in the roll: those combinations belong to the browser.
 */
export function laneKeyboardIntent(
  key: string,
  modifiers: { shift?: boolean; meta?: boolean; ctrl?: boolean },
  index: number,
  value: number,
  spec: LaneDimensionSpec,
  bounds: LaneKeyboardBounds
): LaneKeyboardIntent | null {
  if (modifiers.meta || modifiers.ctrl) return null;
  const shift = Boolean(modifiers.shift);
  const last = Math.max(0, bounds.count - 1);
  const to = (target: number): LaneKeyboardIntent => ({
    kind: "cursor",
    index: clamp(Math.round(target), 0, last),
  });

  switch (key) {
    case "ArrowUp":
      return { kind: "value", value: stepLaneValue(spec, value, 1, shift) };
    case "ArrowDown":
      return { kind: "value", value: stepLaneValue(spec, value, -1, shift) };
    case "PageUp":
      return { kind: "value", value: stepLaneValue(spec, value, 1, true) };
    case "PageDown":
      return { kind: "value", value: stepLaneValue(spec, value, -1, true) };
    case "ArrowRight":
      return to(index + 1);
    case "ArrowLeft":
      return to(index - 1);
    case "Home":
      return to(0);
    case "End":
      return to(last);
    default:
      return null;
  }
}
