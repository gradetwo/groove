/**
 * ⭐ **A curve has to be drawn where a person put it, and one drag has to be one undo step.**
 *
 * This is the surface half of `docs/DAW_GAP_ARRANGEMENT.md` §8's fourth item. The data half (the model, the reading, the
 * compile expansion, the engine's per-step scheduling) shipped in v2.40.0; what is pinned here is what a person actually
 * touches.
 *
 * Three failures worth catching, all of them real ones in this repository's history:
 *
 *   - **a point drawn at the wrong beat**, which is how a lane and the ruler beside it disagree;
 *   - **a drag that writes the model on every pointer move**, which makes one gesture into a dozen undo steps — the
 *     reason `ArrangementLaneV2` holds a region drag in its own state and commits on release;
 *   - **an empty lane that cannot be filled**, because a lane with no points has nothing to grab.
 *
 * The lane's geometry is read from the element the component actually draws, not from a copy of its arithmetic: the
 * assertions use the same `pixelsPerBar` and height the component was handed, so a test that passed while the drawing
 * drifted is not possible. (`arrangementAutomationLane.test.tsx`'s sibling criteria pin the model and the engine.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { AutomationLaneV2 } from "../components/arrangement/AutomationLaneV2";
import type { AutomationParameter, AutomationPoint } from "../data/automation";

const PIXELS_PER_BAR = 100;
const WIDTH = 400;
const LANE_ID = "automation-lane-t1";

/** jsdom reports every rect as 0×0, so the lane is given the geometry it would have on screen. */
function placeLane(container: HTMLElement, height: number): HTMLElement {
  const lane = container.querySelector<HTMLElement>(`[data-testid='${LANE_ID}']`);
  if (!lane) throw new Error("the lane did not render");
  lane.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: WIDTH, bottom: height, width: WIDTH, height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return lane;
}

function mount(points: AutomationPoint[], onChange = vi.fn(), parameter: AutomationParameter = "gainDb") {
  const view = render(
    <LanguageProvider>
      <AutomationLaneV2
        trackName="Keys"
        parameter={parameter}
        points={points}
        pixelsPerBar={PIXELS_PER_BAR}
        width={WIDTH}
        onChange={onChange}
        testId={LANE_ID}
      />
    </LanguageProvider>
  );
  return { view, lane: placeLane(view.container, 72), onChange };
}

const pointAt = (container: HTMLElement, index: number) =>
  container.querySelector<HTMLElement>(`[data-testid='${LANE_ID}-point-${index}']`);

beforeEach(() => cleanup());
afterEach(() => cleanup());

describe("the automation lane", () => {
  it("⭐ draws one handle per point, at the beat and level it was given", () => {
    const { view } = mount([
      { atBeats: 0, value: 0 },
      { atBeats: 4, value: -12 },
    ]);
    const first = pointAt(view.container, 0);
    const second = pointAt(view.container, 1);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    // Four beats at 100 px per bar is one bar: 100 px. A lane that used the wrong beats-per-bar answers 400 or 25.
    expect(second!.style.left).toBe(`${PIXELS_PER_BAR}px`);
    // Unity is the top of the −60…+6 range; −12 dB sits below it.
    const top = parseFloat(first!.style.top);
    const below = parseFloat(second!.style.top);
    expect(below, "−12 dB is drawn below 0 dB").toBeGreaterThan(top);
    expect(top, "0 dB is not the very top of a range that reaches +6").toBeGreaterThan(0);
  });

  it("⭐ writes nothing while the pointer is down, and the whole curve once on release", () => {
    const { view, lane, onChange } = mount([
      { atBeats: 0, value: 0 },
      { atBeats: 4, value: -12 },
    ]);
    const handle = pointAt(view.container, 1)!;

    // The gesture starts where the point actually is — the handle the point draws itself — then moves right and up.
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: PIXELS_PER_BAR, clientY: 52.3 });
    fireEvent.pointerMove(lane, { pointerId: 1, clientX: PIXELS_PER_BAR * 1.5, clientY: 36 });
    fireEvent.pointerMove(lane, { pointerId: 1, clientX: PIXELS_PER_BAR * 2, clientY: 0 });
    expect(onChange, "the model is untouched until the gesture ends").not.toHaveBeenCalled();

    fireEvent.pointerUp(lane, { pointerId: 1, clientX: PIXELS_PER_BAR * 2, clientY: 0 });
    expect(onChange, "one release is one edit").toHaveBeenCalledTimes(1);
    const written = onChange.mock.calls[0]![0] as AutomationPoint[];
    expect(written, "and it carries the curve, not one point").toHaveLength(2);
    // The dragged point moved right in time (two bars) and to the top of the range.
    const moved = written.find((point) => point.atBeats > 4)!;
    expect(moved.atBeats, "two bars in").toBeCloseTo(8, 1);
    expect(moved.value, "the top of the range, +6 dB").toBeCloseTo(6, 1);
    // The other point is the one it was: a drag is not a rewrite of the whole curve.
    expect(written.find((point) => point.atBeats === 0)!.value).toBe(0);
  });

  it("⭐ a press on empty lane adds a point, so an empty lane is not a dead end", () => {
    const { lane, onChange } = mount([]);
    fireEvent.pointerDown(lane, { pointerId: 1, clientX: PIXELS_PER_BAR / 2, clientY: 36 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const written = onChange.mock.calls[0]![0] as AutomationPoint[];
    expect(written).toHaveLength(1);
    // Half a bar in is two beats.
    expect(written[0]!.atBeats).toBeCloseTo(2, 5);
  });

  it("⭐ nudges a point from the keyboard, which is the path a touch-only drag cannot offer", () => {
    const { view, onChange } = mount([{ atBeats: 0, value: -6 }]);
    const handle = pointAt(view.container, 0)!;
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledTimes(1);
    const written = onChange.mock.calls[0]![0] as AutomationPoint[];
    expect(written[0]!.value, "one dB up").toBeCloseTo(-5, 5);
    expect(written[0]!.atBeats, "and the position is untouched").toBe(0);
  });
});

/**
 * ⭐ **The axis belongs to the parameter, and getting that wrong is invisible rather than obvious.**
 *
 * A pan travels −1…1 and a send 0…1. Drawn on the level's −60…+6 dB axis, **every** pan value would sit at the very
 * bottom of the lane (they are all far below −60 on that scale) and every drag would come back as a dB — a curve that
 * looks plausible and is meaningless. So the vertical mapping is asserted per parameter, on the element's own geometry.
 */
describe("a lane for a parameter other than the level", () => {
  it("⭐ maps a pan on the −1…1 scale, not on the level's dB scale", () => {
    const { view } = mount([{ atBeats: 0, value: -1 }, { atBeats: 4, value: 1 }], vi.fn(), "pan");
    const low = pointAt(view.container, 0)!;
    const high = pointAt(view.container, 1)!;

    // −1 is the bottom of the lane and +1 the top: on a dB axis both would be pinned to the bottom edge.
    expect(parseFloat(low.style.top), "−1 sits at the bottom").toBeGreaterThan(60);
    expect(parseFloat(high.style.top), "+1 sits at the top").toBeLessThan(12);
  });

  it("⭐ maps a send on the 0…1 scale, so a half-wet send is halfway up", () => {
    const { view } = mount([{ atBeats: 0, value: 0 }, { atBeats: 4, value: 1 }], vi.fn(), "sendA");
    const dry = parseFloat(pointAt(view.container, 0)!.style.top);
    const wet = parseFloat(pointAt(view.container, 1)!.style.top);
    expect(dry, "0 is the bottom").toBeGreaterThan(60);
    expect(wet, "1 is the top").toBeLessThan(12);
  });

  it("⭐ writes the curve under the lane's own parameter, so a pan edit is stored as a pan", () => {
    const { view, lane, onChange } = mount([{ atBeats: 0, value: 0 }], vi.fn(), "pan");
    fireEvent.pointerDown(lane, { pointerId: 1, clientX: 0, clientY: 36 });
    fireEvent.pointerUp(lane, { pointerId: 1, clientX: 0, clientY: 36 });
    // The component reports points only; the parameter travels with the command the caller builds, which the view's own
    // criterion pins. Here the point stays on the pan scale: halfway up the lane is 0, not −60.
    expect(onChange).toHaveBeenCalledTimes(1);
    const written = onChange.mock.calls[0]![0] as AutomationPoint[];
    expect(Math.abs(written[0]!.value), "a pan value near centre").toBeLessThan(0.2);
  });
});
