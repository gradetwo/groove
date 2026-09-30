/**
 * The loop brace's arithmetic, and the proof that every drag on it has a keyboard alternative.
 *
 * `docs/ARRANGEMENT_UI_DESIGN.md` §3 records how the DAWs do it (Live: a loop switch, a brace in the ruler,
 * `Ctrl/Cmd+L`, arrows nudge, Ctrl+arrows change length; Bitwig: drag the middle to move, drag either end to
 * resize) and adopts both. §7 then makes the keyboard half **not optional**: WCAG 2.5.7 "Dragging Movements"
 * requires every drag to have a single-pointer non-dragging alternative, so a brace that can only be dragged is a
 * criterion failure rather than a missing convenience.
 *
 * That is why the arithmetic lives in `data/arrangementLoop` as pure functions and this file checks them directly:
 * the arrow keys and the pointer must run **the same two functions**, and a file that checked only the rendered
 * result could not tell whether they do.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOP_BARS,
  MIN_LOOP_BARS,
  applyLoopKey,
  barAtOffset,
  loopLabel,
  loopRangeAt,
  loopRangeFor,
  moveLoop,
  resizeLoop,
  type LoopRange,
} from "../data/arrangementLoop";
import type { ArrangementV2 } from "../types/arrangementV2";

const arrangement = (bars?: number): ArrangementV2 => ({ songId: "s", tracks: [], bars, sourceSlots: ["A"] });

describe("turning the loop on", () => {
  it("places a default-length loop at the bar the user asked from", () => {
    expect(loopRangeAt(16, 4)).toEqual([4, 4 + DEFAULT_LOOP_BARS]);
    expect(DEFAULT_LOOP_BARS).toBeGreaterThanOrEqual(2);
  });

  it("slides a loop that would hang off the end back inside, keeping its length", () => {
    // Truncating instead would silently hand back a one-bar loop when the user asked for four.
    expect(loopRangeAt(16, 15)).toEqual([12, 16]);
  });

  it("reads the length from the arrangement when it is given one", () => {
    // An eight-bar arrangement defaults to bar 1, and a four-bar loop fits without clamping.
    expect(loopRangeFor(arrangement(8), 0)).toEqual([0, 4]);
    // The same helper on a file that declares no length uses the editor's default, not zero.
    expect(loopRangeFor(arrangement(undefined), 0)).toEqual([0, 4]);
  });

  it("never makes a loop shorter than one bar", () => {
    expect(loopRangeAt(16, 0, 0)).toEqual([0, MIN_LOOP_BARS]);
    expect(loopRangeAt(16, 0, -4)).toEqual([0, MIN_LOOP_BARS]);
  });
});

describe("moving the brace", () => {
  it("slides it by whole bars and keeps its length", () => {
    expect(moveLoop([2, 6], 1, 16)).toEqual([3, 7]);
    expect(moveLoop([2, 6], -2, 16)).toEqual([0, 4]);
  });

  it("stops at the arrangement's edges instead of wrapping", () => {
    /**
     * A brace that reappeared at bar 1 when dragged past bar 16 would be a loop the user did not ask for and would
     * hear before understanding it, so the edge is a stop.
     */
    expect(moveLoop([12, 16], 4, 16)).toEqual([12, 16]);
    expect(moveLoop([0, 4], -8, 16)).toEqual([0, 4]);
  });

  it("rounds a pointer's fractional bars to the nearest bar rather than keeping them", () => {
    // The model is in bars; a loop at bar 2.5 is not something the ruler can show or the user can name.
    expect(moveLoop([2, 6], 1.4, 16)).toEqual([3, 7]);
    expect(moveLoop([2, 6], 0.6, 16)).toEqual([3, 7]);
  });
});

describe("resizing the brace", () => {
  it("moves only the end it was given", () => {
    expect(resizeLoop([2, 6], "end", 2, 16)).toEqual([2, 8]);
    expect(resizeLoop([2, 6], "start", 2, 16)).toEqual([4, 6]);
  });

  it("refuses to let the two ends cross, so the loop cannot invert", () => {
    // Inverted loops play everything *outside* the brace, which some DAWs allow and every user finds by accident.
    expect(resizeLoop([2, 4], "start", 9, 16)).toEqual([3, 4]);
    expect(resizeLoop([2, 4], "end", -9, 16)).toEqual([2, 3]);
  });

  it("cannot be dragged past either end of the arrangement", () => {
    expect(resizeLoop([2, 6], "end", 99, 16)).toEqual([2, 16]);
    expect(resizeLoop([0, 6], "start", -4, 16)).toEqual([0, 6]);
  });
});

describe("reading a pointer's position as a bar", () => {
  it("takes the bar the pointer is inside, not the nearest bar line", () => {
    // `Math.floor`, not `Math.round`: the pixel under the cursor is the bar the user is pointing at.
    expect(barAtOffset(0, 64)).toBe(0);
    expect(barAtOffset(63, 64)).toBe(0);
    expect(barAtOffset(64, 64)).toBe(1);
    expect(barAtOffset(200, 64)).toBe(3);
  });

  it("answers bar zero rather than dividing by zero at an impossible zoom", () => {
    expect(barAtOffset(100, 0)).toBe(0);
    expect(Number.isFinite(barAtOffset(100, 0))).toBe(true);
  });
});

describe("naming the brace", () => {
  it("says the bars in the ruler's own one-based counting", () => {
    // `[2, 6]` is bars 3-6: the reader's number, not the model's.
    expect(loopLabel([2, 6])).toBe("3–6");
  });
});

describe("the keyboard alternative is the same arithmetic", () => {
  it("nudges and resizes through the functions the pointer uses", () => {
    /**
     * This is the 2.5.7 claim in executable form. An arrow key producing the value the pointer would have produced
     * is the whole requirement; asserting only that *a* change happened would pass for an alternative that goes to a
     * different place than the drag it replaces.
     */
    const dragged: LoopRange = moveLoop([2, 6], 1, 16);
    const nudged: LoopRange | undefined = applyLoopKey([2, 6], "rock", "ArrowRight", false, 16);
    expect(nudged).toEqual(dragged);

    const draggedEnd: LoopRange = resizeLoop([2, 6], "end", 1, 16);
    const nudgedEnd: LoopRange | undefined = applyLoopKey([2, 6], "end", "ArrowRight", false, 16);
    expect(nudgedEnd).toEqual(draggedEnd);
  });

  it("moves the end the handle belongs to, and never the other one", () => {
    // The start handle's arrows must not resize the end: two handles that both moved the same end would be one
    // handle with two hit areas.
    expect(applyLoopKey([2, 6], "start", "ArrowRight", false, 16)).toEqual([3, 6]);
    expect(applyLoopKey([2, 6], "end", "ArrowRight", false, 16)).toEqual([2, 7]);
  });

  it("uses Shift for a four-bar step, which is what makes a long arrangement navigable", () => {
    expect(applyLoopKey([4, 8], "rock", "ArrowRight", true, 16)).toEqual([8, 12]);
    // The end stops one bar after the start, not on it: the minimum loop is the same rule the drag obeys.
    expect(applyLoopKey([4, 8], "end", "ArrowLeft", true, 16)).toEqual([4, 5]);
  });

  it("sends Home and End to the arrangement's edges", () => {
    expect(applyLoopKey([4, 8], "rock", "Home", false, 16)).toEqual([0, 4]);
    expect(applyLoopKey([4, 8], "rock", "End", false, 16)).toEqual([12, 16]);
  });

  it("answers nothing for a key it does not own, so the page keeps its own arrows", () => {
    // `undefined` is distinguishable from "the range did not change": swallowing Up/Down would break scrolling.
    expect(applyLoopKey([2, 6], "rock", "ArrowUp", false, 16)).toBeUndefined();
    expect(applyLoopKey([2, 6], "end", "a", false, 16)).toBeUndefined();
  });
});
