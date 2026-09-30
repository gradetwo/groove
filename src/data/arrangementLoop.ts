/**
 * The loop brace's arithmetic: a start bar, an end bar, and the three things a person does to it.
 *
 * A module rather than component state because the brief makes the brace's **keyboard alternatives load-bearing**:
 * `docs/ARRANGEMENT_UI_DESIGN.md` §7 singles out WCAG 2.5.7 (dragging movements) as the criterion that rules out a
 * drag-only loop brace, and §8 item 5 names the keyboard nudge as part of the cost of having one. Keeping move and
 * resize as pure functions is what lets the arrow keys and the pointer run the same code — two implementations of
 * "resize the loop" is how a drag and its keyboard alternative come to disagree about which end moved.
 *
 * Bars are zero-based and **half-open** (`startBar` inclusive, `endBar` exclusive), the same convention as
 * `TakeRegion`, so a loop and a take region can be compared without a translation nobody wrote down.
 */
import { regionBars } from "./arrangementLanes";
import type { ArrangementV2 } from "../types/arrangementV2";

/** A loop over bars, half-open: `[2, 6]` is bars 3, 4, 5 and 6 in the ruler's one-based counting. */
export type LoopRange = readonly [startBar: number, endBar: number];

/** The length a loop gets when it is switched on without a range of its own — Live's "two bars" default in spirit. */
export const DEFAULT_LOOP_BARS = 4;

/** The brace may never be shorter than this: a loop that starts and ends at the same bar has nothing to play. */
export const MIN_LOOP_BARS = 1;

/**
 * A loop of `length` bars starting at `startBar`, clamped into an arrangement of `bars` bars.
 *
 * The clamp slides the loop back inside the arrangement rather than truncating it, because truncating a four-bar
 * loop placed in the last bar would silently give a one-bar loop; sliding keeps the length the user asked for.
 */
export function loopRangeAt(bars: number, startBar: number, length = DEFAULT_LOOP_BARS): LoopRange {
  const total = Math.max(MIN_LOOP_BARS, Math.round(bars));
  const wanted = Math.max(MIN_LOOP_BARS, Math.min(total, Math.round(length)));
  const latestStart = Math.max(0, total - wanted);
  const start = Math.max(0, Math.min(latestStart, Math.round(startBar)));
  return [start, start + wanted];
}

/** The arrangement's own length, so a caller never has to pass it twice. */
export function loopRangeFor(arrangement: ArrangementV2, startBar: number, length = DEFAULT_LOOP_BARS): LoopRange {
  return loopRangeAt(regionBars(arrangement), startBar, length);
}

/**
 * Move the whole brace by `deltaBars`, keeping its length.
 *
 * Moving past an edge stops at the edge rather than wrapping: a brace that reappeared at bar 1 when dragged past the
 * end would be a loop the user did not ask for, and one they would hear before they understood what happened.
 */
export function moveLoop(loop: LoopRange, deltaBars: number, bars: number): LoopRange {
  const length = loop[1] - loop[0];
  const latestStart = Math.max(0, bars - length);
  const start = Math.max(0, Math.min(latestStart, Math.round(loop[0] + deltaBars)));
  return [start, start + length];
}

/**
 * Move one end of the brace.
 *
 * `"end"` can only ever extend the loop, and `"start"` can only ever shorten it: the two ends must not cross, or the
 * loop would invert and play everything outside itself — which is a real behaviour in some DAWs and a surprise in
 * all of them. The minimum length is enforced on both ends for the same reason.
 */
export function resizeLoop(loop: LoopRange, end: "start" | "end", deltaBars: number, bars: number): LoopRange {
  const [start, stop] = loop;
  if (end === "start") {
    const next = Math.max(0, Math.min(stop - MIN_LOOP_BARS, Math.round(start + deltaBars)));
    return [next, stop];
  }
  const next = Math.min(bars, Math.max(start + MIN_LOOP_BARS, Math.round(stop + deltaBars)));
  return [start, next];
}

/**
 * The bar a pointer at `offsetPx` is over, in bar units of `pixelsPerBar`.
 *
 * Returned as a **bar index**, not a rounded pixel, because the brace is stored in musical time: a drag that landed
 * on a pixel would put the loop somewhere the model cannot express, and the next resize would round it differently.
 * `Math.floor` rather than `Math.round` so that the pixel under the cursor is the bar the user is pointing at.
 */
export function barAtOffset(offsetPx: number, pixelsPerBar: number): number {
  if (!(pixelsPerBar > 0)) return 0;
  return Math.floor(offsetPx / pixelsPerBar);
}

/** `[2, 6]` as the ruler says it: "bars 3–6". Used for the brace's accessible name, so the value is readable. */
export function loopLabel(loop: LoopRange): string {
  return `${loop[0] + 1}–${loop[1]}`;
}

/**
 * The arrow keys a loop handle answers, as one function.
 *
 * **This is the WCAG 2.5.7 requirement, in the one place both the pointer and the keyboard can reach it.** The brief
 * (§7) makes the keyboard alternative non-optional for every drag: a loop brace that can only be dragged fails the
 * criterion. Left/right nudge by a bar, Shift+arrow by four, Home/End go to the arrangement's edges — the same
 * convention the brief lists for nudging, and the same functions the pointer calls, so a drag and its alternative
 * cannot land in different places.
 *
 * `undefined` means "this key is not mine", which the caller must distinguish from "the range did not change":
 * swallowing an arrow key would break the selection behaviour of whatever contains the brace.
 */
export function applyLoopKey(loop: LoopRange, part: "rock" | "start" | "end", key: string, shiftKey: boolean, bars: number): LoopRange | undefined {
  const step = shiftKey ? DEFAULT_LOOP_BARS : 1;
  switch (key) {
    case "ArrowLeft":
      return part === "rock" ? moveLoop(loop, -step, bars) : resizeLoop(loop, part, -step, bars);
    case "ArrowRight":
      return part === "rock" ? moveLoop(loop, step, bars) : resizeLoop(loop, part, step, bars);
    case "Home":
      // Home on an end means "this end goes to the start of the arrangement", not "the loop starts here" — the
      // handle under the cursor is the one the key acts on.
      return part === "rock" ? moveLoop(loop, -loop[0], bars) : resizeLoop(loop, part, -loop[0], bars);
    case "End":
      return part === "rock" ? moveLoop(loop, bars - loop[1], bars) : resizeLoop(loop, part, bars - loop[1], bars);
    default:
      return undefined;
  }
}

