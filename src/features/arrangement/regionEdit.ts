/**
 * The arrangement lane's region arithmetic: a region's range, and the three things a person does to it.
 *
 * **A port, not an invention.** The Studio editor's arrangement (`ArrangementPanel`) has had a move/resize drag since
 * B3 — `beginDrag(…, "move")` / `(…, "resize")`, with the whole rule in one line:
 *
 * ```
 * const barsMoved = Math.round((event.clientX - drag.startX) / ARRANGEMENT_BAR_WIDTH);
 * ```
 *
 * That line is the ported part, and it moved here for the reason `songEdit.ts` gives for the same split: everything the
 * gesture *decides* is arithmetic about the arrangement and belongs somewhere a test can reach without a browser. The
 * component keeps the DOM half — pointer capture, which element was grabbed, whether a gesture is in flight.
 *
 * **What changed in the port, and why.** The Studio editor's line quantises to a whole bar because that is the only
 * unit its ruler can show, and `LoopBraceV2` rounds to bars for the same recorded reason ("a loop at bar 2.5 is not
 * something the ruler can show"). The new lane's toolbar already carries a **snap value** that nothing consumed, so the
 * unit became a parameter: `unitBars` is the visible snap value in bars, and `undefined` means snapping is off (the
 * bypass modifier, or the toggle) and the region lands where the pointer is. The bar-quantised behaviour the Studio
 * editor has is `unitBars = 1`, which is the lane's own default (`DEFAULT_SNAP = "1/1"`).
 *
 * **The delta is quantised, not the result** — the ported line's own shape. It is also the one that cannot drift: the
 * region keeps whatever offset it had, and a drag of the same distance from the same place always lands the same way.
 *
 * Positions are **bars**, half-open, matching `TrackRegion`/`TakeRegion`; `undefined` is never produced here — the
 * default span is `setTrackRegion`'s business, one layer down.
 */
import { MIN_REGION_BARS } from "../../data/arrangementLanes";
import type { TrackRegion } from "../../types/arrangementV2";

/** Which end of the region a gesture turned. `"move"` is the body; `"resize"` is the right edge. */
export type RegionPart = "move" | "resize";

/** The keyboard's whole vocabulary for a region — deliberately the Studio editor's, minus the commands it has no model for. */
export type RegionCommand = "move-left" | "move-right" | "grow" | "shrink";

/**
 * The step a keyboard nudge uses when snapping is off.
 *
 * A bar, because a key press cannot be "unquantised": it has to move something, and a bar is (a) what the ruler's
 * cells are, (b) what the ported gesture used, and (c) the unit the loop brace's own arrow keys use. Snapping *off*
 * says a drag may land between bars; it does not say an arrow key should move a thousandth of one.
 */
export const KEYBOARD_STEP_BARS = 1;

/**
 * `deltaBars` rounded to the snap grid, or left alone when there is no grid.
 *
 * `Math.round` rather than floor/ceil so a nudge either way from a grid line is symmetric, and so a drag of less than
 * half a unit is not a move at all — which is what makes a click on the region a selection and not a one-pixel edit.
 */
export function quantiseBars(deltaBars: number, unitBars: number | undefined): number {
  if (unitBars === undefined || !(unitBars > 0)) return deltaBars;
  return Math.round(deltaBars / unitBars) * unitBars;
}

/** The step an arrow key takes: the snap grid when one is on, a bar when it is off. */
export function regionStepBars(unitBars: number | undefined): number {
  return unitBars !== undefined && unitBars > 0 ? unitBars : KEYBOARD_STEP_BARS;
}

/**
 * One region range after a delta, clamped into an arrangement of `bars`.
 *
 * The clamps are the model's, not the view's: a region may not start before bar 1, may not end past the arrangement,
 * and may not be shorter than `MIN_REGION_BARS` — a region that crossed its own ends would invert, and one shorter
 * than a bar has no bar line to be read against (the same reason `MIN_LOOP_BARS` exists one file over). Clamped rather
 * than rejected because both callers are gestures: dragging past the end means "put it at the end".
 */
export function regionAfter(from: TrackRegion, part: RegionPart, deltaBars: number, bars: number): TrackRegion {
  const total = Math.max(MIN_REGION_BARS, bars);
  // Normalised on the way in as well, so this is a total function over any range an older file could hold.
  const start0 = Math.max(0, Math.min(total - MIN_REGION_BARS, from.startBar));
  const length = Math.max(MIN_REGION_BARS, Math.min(total - start0, from.endBar - start0));

  if (part === "resize") {
    const next = Math.max(MIN_REGION_BARS, Math.min(total - start0, length + deltaBars));
    return { startBar: start0, endBar: start0 + next };
  }
  const start = Math.max(0, Math.min(total - length, start0 + deltaBars));
  return { startBar: start, endBar: start + length };
}

/**
 * A pointer drag, in pixels, as the region it lands on.
 *
 * The whole of the ported gesture: pixels → bars → the snap grid → a clamped range. `pixelsPerBar` is the **same
 * number the ruler and the lanes are laid out with** (`ArrangementViewV2` passes one value to both), which is what
 * keeps a dragged edge under the pointer rather than near it.
 */
export function dragRegion(
  from: TrackRegion,
  part: RegionPart,
  deltaPx: number,
  pixelsPerBar: number,
  unitBars: number | undefined,
  bars: number
): TrackRegion {
  const rawBars = pixelsPerBar > 0 ? deltaPx / pixelsPerBar : 0;
  return regionAfter(from, part, quantiseBars(rawBars, unitBars), bars);
}

/**
 * The region command a key means, or `null` when the key is not the region's.
 *
 * ⭐ **The ported binding, verbatim from `songEdit.commandForKey`**: left/right nudge, Shift+left/right change the
 * length. That is the Studio editor's own keyboard model, and it is what makes the drag's WCAG 2.5.7 alternative real
 * rather than promised: the region is a button, so this is reachable by Tab and Enter-free — and `null` for every other
 * key, so the arrow keys of a scroll container are not swallowed.
 */
export function regionCommandForKey(key: string, shiftKey = false): RegionCommand | null {
  switch (key) {
    case "ArrowLeft":
      return shiftKey ? "shrink" : "move-left";
    case "ArrowRight":
      return shiftKey ? "grow" : "move-right";
    default:
      return null;
  }
}

/** The same edit as `dragRegion`, for a key press: a discrete step rather than a pointer position. */
export function applyRegionCommand(from: TrackRegion, command: RegionCommand, stepBars: number, bars: number): TrackRegion {
  switch (command) {
    case "move-left":
      return regionAfter(from, "move", -stepBars, bars);
    case "move-right":
      return regionAfter(from, "move", stepBars, bars);
    case "grow":
      return regionAfter(from, "resize", stepBars, bars);
    case "shrink":
      return regionAfter(from, "resize", -stepBars, bars);
  }
}
