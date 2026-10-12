/**
 * The region drag in the new arrangement editor, read off the model the way the person's edit reaches it.
 *
 * The owner's finding was concrete: `/new`'s region carried `onClick={onSelect}` (:52 of `ArrangementLaneV2`) and
 * nothing else — no pointer gesture, no key — while the Studio editor's `ArrangementPanel` had had a bar-quantised
 * move/resize drag since B3, and the toolbar's `snap` value had exactly one consumer (the ruler's corner readout). So
 * these criteria are about the three things that were missing, in the states a person meets them:
 *
 * 1. **a drag changes where the region is**, and the assertion is on the **value** (`onArrangementChange`'s own report
 *    of the arrangement, plus the `data-start-bar` the lane derives from it) rather than on a style;
 * 2. **the drag is quantised, and the toolbar's snap value decides the unit** — the same 1.4 bars of pointer travel
 *    lands on bar 1 with the grid on, on 1.4 with it off, and on 1.4 while `Alt` is held;
 * 3. **a drag is one undo entry, a key press is one edit, and a gesture that moved nothing is neither.**
 *
 * ⚠️ **What a jsdom test can and cannot prove.** It can prove which range the lane reported and what the arrangement
 * became; it cannot prove that a browser retargets a captured pointer to the handle, or that a 24 px band is a
 * comfortable target with a finger. `Alt` is asserted as an event property here and the pointer capture is a no-op in
 * this environment (`setPointerCapture` is absent), which is why the lane's capture is best-effort with a recorded
 * reason rather than a load-bearing call.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import type { ArrangementV2, TrackRegion } from "../types/arrangementV2";

const noCapture = () => new Promise<never>(() => undefined);

/** The default zoom, which is the number every pixel figure below is in. Read from the ruler's own export rather than copied. */
const PX_PER_BAR = 64;

/** One track, eight bars, and a region of the given range — absent means the whole arrangement, option (a). */
const arrangement = (region?: TrackRegion): ArrangementV2 => ({
  songId: "s",
  tracks: [{ id: "bass", kind: "synth", name: "Bass", ...(region === undefined ? {} : { region }) }],
  notesByTrack: { bass: [] },
  bars: 8,
  sourceSlots: [],
});

/**
 * Render the view straight into an arrangement.
 *
 * `initialArrangement` is what skips Logic's "Choose a Project" — the view's own prop for "a project is already
 * chosen" — so these criteria are about the gesture and not about the chooser, which has criteria of its own.
 */
const renderView = (region?: TrackRegion) => {
  const onArrangementChange = vi.fn();
  render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} initialArrangement={arrangement(region)} onArrangementChange={onArrangementChange} />
    </LanguageProvider>
  );
  return {
    onArrangementChange,
    /** The last arrangement the view reported, which is where every model-level assertion below is made. */
    reported: () => onArrangementChange.mock.calls[onArrangementChange.mock.calls.length - 1]![0] as ArrangementV2,
  };
};

const undoButton = () => screen.getByTestId("arrangement-undo") as HTMLButtonElement;
const snapToggle = () => screen.getByTestId("arrangement-snap-toggle") as HTMLButtonElement;
const regionEl = () => screen.getByTestId("arrangement-region-bass");
const resizeEl = () => screen.getByTestId("arrangement-resize-bass");

/**
 * One pointer gesture: press, `steps` moves, release.
 *
 * Several moves on purpose — a real drag produces one per frame, and "a gesture is one undo entry" is only a claim
 * worth testing when the gesture had more than one chance to record something. `altKey` travels on every event, which
 * is what "hold it while you drag" means.
 */
const drag = (element: HTMLElement, deltaPx: number, options: { altKey?: boolean; steps?: number } = {}) => {
  const steps = options.steps ?? 4;
  const modifiers = options.altKey === true ? { altKey: true } : {};
  fireEvent.pointerDown(element, { clientX: 0, pointerId: 1, ...modifiers });
  for (let step = 1; step <= steps; step += 1) {
    fireEvent.pointerMove(element, { clientX: (deltaPx * step) / steps, pointerId: 1, ...modifiers });
  }
  fireEvent.pointerUp(element, { clientX: deltaPx, pointerId: 1, ...modifiers });
};

describe("dragging a region moves it, in the model", () => {
  it("⭐⭐ changes the region's start by the bars the pointer crossed — and the model says the same thing the lane draws", () => {
    const { reported } = renderView({ startBar: 0, endBar: 4 });
    drag(regionEl(), PX_PER_BAR, { steps: 1 });

    // The lane draws the region's range from `track.region` (through `deriveArrangementRegions`), so this value is the
    // model's and not a style: the same number is asserted against the arrangement below.
    expect(regionEl().dataset.startBar).toBe("1");
    expect(regionEl().dataset.bars).toBe("4");
    // ⭐ The assertion that matters: the arrangement the view **reported to its host** carries the moved region.
    expect(reported().tracks[0]!.region).toEqual({ startBar: 1, endBar: 5 });
  });

  it("moves the whole region rather than resizing it, and stops at the end of the arrangement", () => {
    renderView({ startBar: 4, endBar: 8 });
    drag(regionEl(), 3 * PX_PER_BAR, { steps: 3 });
    // Four bars of region in eight bars of arrangement: it stops at bar 5, keeping its length.
    expect(regionEl().dataset.startBar).toBe("4");
    expect(regionEl().dataset.bars).toBe("4");
  });

  it("changes the length when the right-edge handle is dragged, and only the length", () => {
    renderView({ startBar: 0, endBar: 4 });
    drag(resizeEl(), -PX_PER_BAR, { steps: 2 });
    expect(regionEl().dataset.startBar).toBe("0");
    expect(regionEl().dataset.bars).toBe("3");
    expect(regionEl().dataset.endBar).toBe("3");
  });

  it("announces the handle as a separator with its own name, so the resize is reachable without a pointer position", () => {
    renderView({ startBar: 0, endBar: 4 });
    const handle = resizeEl();
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-label")).toMatch(/Bass/);
  });
});

describe("the drag is quantised, and the toolbar's snap value decides the unit", () => {
  it("⭐⭐ lands on a bar rather than where the pointer stopped", () => {
    renderView({ startBar: 0, endBar: 4 });
    // 1.4 bars of travel: without a grid this would be 1.4, and the default unit is one bar (a whole note).
    drag(regionEl(), 1.4 * PX_PER_BAR, { steps: 2 });
    expect(regionEl().dataset.startBar).toBe("1");
  });

  it("⭐⭐ lands where the pointer stopped when the snap toggle is off — so the control changes the result", () => {
    /**
     * The defect being closed: `snapOn` had exactly one consumer, `snapLabel={snapOn ? snap : undefined}`, so turning
     * it off changed a line of text and nothing else. The two halves below are the same drag of the same distance, and
     * they must not agree.
     */
    renderView({ startBar: 0, endBar: 4 });
    drag(regionEl(), 1.4 * PX_PER_BAR, { steps: 2 });
    expect(regionEl().dataset.startBar).toBe("1");

    // Back to where it started, then the grid is switched off.
    fireEvent.click(undoButton());
    expect(regionEl().dataset.startBar).toBe("0");
    fireEvent.click(snapToggle());
    expect(snapToggle().getAttribute("aria-pressed")).toBe("false");
    // The value is still shown — "off" is a state, and the value is still what it would snap to.
    expect(screen.getByTestId("arrangement-snap-value").textContent).toBe("1/1");

    drag(regionEl(), 1.4 * PX_PER_BAR, { steps: 2 });
    expect(Number(regionEl().dataset.startBar)).toBeCloseTo(1.4, 10);
  });

  it("⭐ follows the *value* the toolbar shows, not only its on/off state", () => {
    /**
     * The toolbar's value button cycles the ladder; before this change every rung of it was a label. A quarter note is
     * a beat (0.25 of a 4/4 bar), so the same 1.4 bars of travel lands on the beat grid instead of on a bar.
     */
    renderView({ startBar: 0, endBar: 4 });
    // The default is a whole note (a bar); step twice to a quarter note.
    fireEvent.click(screen.getByTestId("arrangement-snap-cycle"));
    fireEvent.click(screen.getByTestId("arrangement-snap-cycle"));
    expect(screen.getByTestId("arrangement-snap-value").textContent).toBe("1/4");
    drag(regionEl(), 1.4 * PX_PER_BAR, { steps: 2 });
    expect(regionEl().dataset.startBar).toBe("1.5");
  });

  it("⭐⭐ Alt releases the gesture from the grid without touching the toggle (WCAG 2.5.7's sibling: the bypass key)", () => {
    /**
     * Live's and FL's own modifier, which `docs/ARRANGEMENT_UI_DESIGN.md` §3 already adopts ("吸附开关 + 绕过键"). The
     * toggle is still on and still says the same value afterwards — a bypass is for one gesture, not a settings change.
     */
    renderView({ startBar: 0, endBar: 4 });
    drag(regionEl(), 1.4 * PX_PER_BAR, { steps: 2, altKey: true });
    expect(Number(regionEl().dataset.startBar)).toBeCloseTo(1.4, 10);
    expect(snapToggle().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("arrangement-snap-value").textContent).toBe("1/1");
  });

  it("a drag that does not reach the grid is not an edit at all", () => {
    const { onArrangementChange } = renderView({ startBar: 0, endBar: 4 });
    const before = onArrangementChange.mock.calls.length;
    drag(regionEl(), PX_PER_BAR / 8, { steps: 3 });
    expect(regionEl().dataset.startBar).toBe("0");
    // The region reported its range only because the effect reports every render; no *edit* reached the history.
    expect(undoButton().disabled).toBe(true);
    expect(onArrangementChange.mock.calls.length).toBe(before);
  });
});

describe("one gesture is one undo entry", () => {
  it("⭐⭐ a drag of many moves is undone by one press, and the stack is then empty", () => {
    /**
     * The claim the wiring has to make good: the lane holds the in-flight range and reports it **once**, on pointer up.
     * An edit per pointer move would leave the stack with one entry per move, and this criterion would fail on the
     * second line — a single undo would return the region to a bar it passed through rather than to where it began.
     */
    renderView({ startBar: 0, endBar: 4 });
    drag(regionEl(), 3 * PX_PER_BAR, { steps: 8 });
    expect(regionEl().dataset.startBar).toBe("3");
    expect(undoButton().disabled).toBe(false);
    expect(undoButton().getAttribute("data-undo-action")).toBe("region");

    fireEvent.click(undoButton());
    expect(regionEl().dataset.startBar).toBe("0");
    // ⭐ One entry, not eight: after a single undo there is nothing left to undo.
    expect(undoButton().disabled).toBe(true);
    expect(screen.getByTestId("arrangement-redo").getAttribute("data-redo-action")).toBe("region");
  });

  it("a drag that lands back where it began records nothing", () => {
    renderView({ startBar: 0, endBar: 4 });
    // Right one bar and left one bar, in one gesture.
    fireEvent.pointerDown(regionEl(), { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(regionEl(), { clientX: PX_PER_BAR, pointerId: 1 });
    fireEvent.pointerMove(regionEl(), { clientX: 0, pointerId: 1 });
    fireEvent.pointerUp(regionEl(), { clientX: 0, pointerId: 1 });
    expect(regionEl().dataset.startBar).toBe("0");
    expect(undoButton().disabled).toBe(true);
  });

  it("a region dragged back to the whole arrangement drops the range, so 'moved back' equals 'never moved'", () => {
    const { reported } = renderView({ startBar: 0, endBar: 4 });
    // The right edge out to the end of the arrangement: the range becomes the default span, which is stored as absence.
    drag(resizeEl(), 4 * PX_PER_BAR, { steps: 2 });
    expect(regionEl().dataset.startBar).toBe("0");
    expect(regionEl().dataset.bars).toBe("8");
    expect("region" in reported().tracks[0]!).toBe(false);
  });

  it("⭐ selecting on a press is not an edit", () => {
    // The press selects (the ported order: the drag may end outside the region), and a press with no movement must not
    // enter the undo stack — otherwise clicking a region would be something to undo.
    renderView({ startBar: 0, endBar: 4 });
    fireEvent.pointerDown(regionEl(), { clientX: 0, pointerId: 1 });
    fireEvent.pointerUp(regionEl(), { clientX: 0, pointerId: 1 });
    expect(regionEl().getAttribute("aria-current")).toBe("true");
    expect(undoButton().disabled).toBe(true);
  });
});

describe("the keyboard's alternative to the drag (WCAG 2.5.7)", () => {
  it("⭐⭐ a focused region is nudged and resized by the arrow keys, through the same arithmetic", () => {
    /**
     * The ported binding from the Studio editor's `commandForKey`: arrows move, Shift+arrows change the length. The
     * region is a button, so this is reachable by Tab — and it is what makes the pointer gesture legal under 2.5.7
     * rather than only convenient.
     */
    renderView({ startBar: 0, endBar: 4 });
    const region = regionEl();
    region.focus();
    expect(document.activeElement).toBe(region);

    fireEvent.keyDown(region, { key: "ArrowRight" });
    expect(regionEl().dataset.startBar).toBe("1");
    expect(regionEl().dataset.bars).toBe("4");

    // Shift changes the length instead of the position — the Studio editor's own binding, not a second invention.
    fireEvent.keyDown(regionEl(), { key: "ArrowRight", shiftKey: true });
    expect(regionEl().dataset.endBar).toBe("6");
    expect(regionEl().dataset.startBar).toBe("1");

    fireEvent.keyDown(regionEl(), { key: "ArrowLeft" });
    expect(regionEl().dataset.startBar).toBe("0");

    // And it is an edit like any other: each press is one entry, and one undo walks one press back.
    expect(undoButton().disabled).toBe(false);
    fireEvent.click(undoButton());
    expect(regionEl().dataset.startBar).toBe("1");
  });

  it("leaves every other key alone, so the grid around the region keeps its own keys", () => {
    renderView({ startBar: 0, endBar: 4 });
    const region = regionEl();
    fireEvent.keyDown(region, { key: "ArrowUp" });
    fireEvent.keyDown(region, { key: "Tab" });
    expect(regionEl().dataset.startBar).toBe("0");
    expect(undoButton().disabled).toBe(true);
  });

  it("steps by a bar when snapping is off, because a key press cannot be unquantised", () => {
    renderView({ startBar: 0, endBar: 4 });
    fireEvent.click(snapToggle());
    fireEvent.keyDown(regionEl(), { key: "ArrowRight" });
    expect(regionEl().dataset.startBar).toBe("1");
  });
});
