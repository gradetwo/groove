/**
 * U10: the piano roll's keyboard model.
 *
 * The mapping is a pure function precisely so it can be tested like this — no DOM, no renderer, and
 * every boundary (clip edges, pitch rows, the 1..127 velocity range) is a value in a table rather
 * than a gesture.
 */
import { describe, it, expect } from "vitest";
import {
  clampCursor,
  rollKeyboardIntent,
  scrollToRevealCursor,
  type RollKeyboardBounds,
} from "../features/sequencer/rollKeyboard";

const BOUNDS: RollKeyboardBounds = { stepCount: 16, barSteps: 4, loMidi: 48, hiMidi: 72 };
const NONE = { shift: false, meta: false, ctrl: false };

describe("roll keyboard · cursor movement", () => {
  it("moves one step and one semitone per arrow, and clamps to the clip", () => {
    const at = { stepIdx: 5, midi: 60 };
    expect(rollKeyboardIntent("ArrowRight", NONE, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 6, midi: 60 },
    });
    expect(rollKeyboardIntent("ArrowLeft", NONE, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 4, midi: 60 },
    });
    expect(rollKeyboardIntent("ArrowUp", NONE, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 5, midi: 61 },
    });
    expect(rollKeyboardIntent("ArrowDown", NONE, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 5, midi: 59 },
    });

    // The clip is 16 steps and the drawn rows are 48..72: walking off either end must stop there,
    // because a cursor the user cannot see is worse than one that refuses to move.
    const leftEdge = clampCursor({ stepIdx: -3, midi: 20 }, BOUNDS);
    expect(leftEdge).toEqual({ stepIdx: 0, midi: 48 });
    expect(rollKeyboardIntent("ArrowLeft", NONE, { stepIdx: 0, midi: 48 }, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 0, midi: 48 },
    });
    expect(rollKeyboardIntent("ArrowDown", NONE, { stepIdx: 0, midi: 48 }, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 0, midi: 48 },
    });
    expect(rollKeyboardIntent("ArrowRight", NONE, { stepIdx: 15, midi: 72 }, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 15, midi: 72 },
    });
    expect(rollKeyboardIntent("ArrowUp", NONE, { stepIdx: 15, midi: 72 }, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 15, midi: 72 },
    });
  });

  it("moves a bar with Shift and an octave with Shift+Up/Down", () => {
    const at = { stepIdx: 5, midi: 60 };
    expect(rollKeyboardIntent("ArrowRight", { ...NONE, shift: true }, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 9, midi: 60 },
    });
    expect(rollKeyboardIntent("ArrowLeft", { ...NONE, shift: true }, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 1, midi: 60 },
    });
    expect(rollKeyboardIntent("ArrowUp", { ...NONE, shift: true }, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 5, midi: 72 },
    });
    expect(rollKeyboardIntent("ArrowDown", { ...NONE, shift: true }, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 5, midi: 48 },
    });
  });

  it("jumps to the ends of the clip with Home and End", () => {
    const at = { stepIdx: 7, midi: 61 };
    expect(rollKeyboardIntent("Home", NONE, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 0, midi: 61 },
    });
    expect(rollKeyboardIntent("End", NONE, at, BOUNDS)).toEqual({
      kind: "move",
      cursor: { stepIdx: 15, midi: 61 },
    });
  });
});

describe("roll keyboard · editing intents", () => {
  it("maps the edit keys, and swallows only those", () => {
    const at = { stepIdx: 2, midi: 60 };
    expect(rollKeyboardIntent("Enter", NONE, at, BOUNDS)).toEqual({ kind: "toggle" });
    expect(rollKeyboardIntent(" ", NONE, at, BOUNDS)).toEqual({ kind: "toggle" });
    expect(rollKeyboardIntent("Delete", NONE, at, BOUNDS)).toEqual({ kind: "delete" });
    expect(rollKeyboardIntent("Backspace", NONE, at, BOUNDS)).toEqual({ kind: "delete" });
    expect(rollKeyboardIntent("+", NONE, at, BOUNDS)).toEqual({ kind: "velocity", delta: 1 });
    expect(rollKeyboardIntent("=", NONE, at, BOUNDS)).toEqual({ kind: "velocity", delta: 1 });
    expect(rollKeyboardIntent("-", NONE, at, BOUNDS)).toEqual({ kind: "velocity", delta: -1 });
    expect(rollKeyboardIntent("_", NONE, at, BOUNDS)).toEqual({ kind: "velocity", delta: -1 });
    expect(rollKeyboardIntent("+", { ...NONE, shift: true }, at, BOUNDS)).toEqual({
      kind: "velocity",
      delta: 10,
    });
    // Length: the one editing operation that was still pointer-only through the resize handle.
    expect(rollKeyboardIntent("]", NONE, at, BOUNDS)).toEqual({ kind: "length", delta: 1 });
    expect(rollKeyboardIntent("[", NONE, at, BOUNDS)).toEqual({ kind: "length", delta: -1 });
    expect(rollKeyboardIntent("]", { ...NONE, shift: true }, at, BOUNDS)).toEqual({
      kind: "length",
      delta: 4,
    });

    // Anything else is left to the page: the roll is one panel of an app, not a keyboard trap.
    for (const key of ["Tab", "a", "Escape", "PageUp", "F5"]) {
      expect(rollKeyboardIntent(key, NONE, at, BOUNDS)).toBeNull();
    }
  });

  it("never takes a key the platform owns", () => {
    const at = { stepIdx: 2, midi: 60 };
    // ⌘←/Ctrl+Delete and friends must keep working everywhere else in the app.
    expect(rollKeyboardIntent("ArrowLeft", { ...NONE, meta: true }, at, BOUNDS)).toBeNull();
    expect(rollKeyboardIntent("Delete", { ...NONE, ctrl: true }, at, BOUNDS)).toBeNull();
    expect(rollKeyboardIntent("Enter", { ...NONE, meta: true }, at, BOUNDS)).toBeNull();
  });
});

describe("roll keyboard · keeping the cursor on screen", () => {
  const view = {
    cellW: 26,
    rowH: 18,
    viewW: 260,
    viewH: 180,
    scrollLeft: 0,
    scrollTop: 0,
  };

  /** The cell sits inside the viewport with a full cell of margin on each side. */
  function hasMargin(cursor: { stepIdx: number; rowIdx: number }, at: { left: number; top: number }) {
    const cellLeft = cursor.stepIdx * view.cellW;
    const cellRight = cellLeft + view.cellW;
    const cellTop = cursor.rowIdx * view.rowH;
    const cellBottom = cellTop + view.rowH;
    return (
      cellLeft >= at.left + view.cellW &&
      cellRight <= at.left + view.viewW - view.cellW &&
      cellTop >= at.top + view.rowH &&
      cellBottom <= at.top + view.viewH - view.rowH
    );
  }

  it("leaves a visible cursor alone, so moving inside the viewport does not jitter", () => {
    expect(scrollToRevealCursor({ ...view, stepIdx: 4, rowIdx: 4 })).toEqual({ left: 0, top: 0 });
  });

  it("scrolls right just far enough to reveal the cell and its margin", () => {
    // Row 5 starts at 90, which is already comfortably inside the 180 px viewport.
    const cursor = { stepIdx: 20, rowIdx: 5 };
    // 20 × 26 + 26 + 26 - 260 = 312.
    const at = scrollToRevealCursor({ ...view, ...cursor });
    expect(at.left).toBe(312);
    expect(hasMargin(cursor, at)).toBe(true);

    // And it settles: a second application is a no-op, which is what "scrolled just far enough" means.
    expect(scrollToRevealCursor({ ...view, scrollLeft: at.left, ...cursor })).toEqual(at);
  });

  it("scrolls left and up to reveal a cell behind the viewport, never below zero", () => {
    expect(
      scrollToRevealCursor({ ...view, scrollLeft: 300, scrollTop: 200, stepIdx: 2, rowIdx: 1 })
    ).toEqual({ left: 26, top: 0 });
    // The clamp: a cell at the very start cannot scroll the viewport to a negative offset.
    expect(scrollToRevealCursor({ ...view, stepIdx: 0, rowIdx: 0 })).toEqual({ left: 0, top: 0 });
  });

  it("scrolls down for a row below the fold", () => {
    // Row 20 starts at 360; 360 + 18 + 18 - 180 = 216.
    expect(scrollToRevealCursor({ ...view, stepIdx: 0, rowIdx: 20 }).top).toBe(216);
  });

  it("does nothing before the viewport has been measured", () => {
    // jsdom has no layout, and neither does a hidden panel: a zero-sized viewport must not compute
    // a scroll into nowhere.
    expect(
      scrollToRevealCursor({ ...view, viewW: 0, viewH: 0, stepIdx: 40, rowIdx: 40 })
    ).toEqual({ left: 0, top: 0 });
  });
});
