/**
 * The step grid must pan horizontally without swallowing the page's vertical scroll.
 *
 * The handler used to be `if (e.shiftKey && e.deltaY !== 0) { … preventDefault() … }` — correct for a
 * mouse wheel and Shift, but blind to a trackpad, whose two-finger swipe arrives as `deltaX` with
 * little or no `deltaY` and no modifier. And the mirror-image mistake is the dangerous one: a handler
 * that intercepts on `deltaY !== 0` alone takes the page's vertical scroll away from the whole grid.
 *
 * So the rule is stated in both directions: a horizontal-dominant gesture pans the grid, a
 * vertical-dominant one is left to the browser, and `preventDefault` is never called where there is
 * nothing to scroll.
 *
 * The hook is exercised through a real DOM listener rather than by extracting the predicate, so the
 * test covers the registration options too — a `passive: true` listener could not cancel anything, and
 * that would be invisible to a test of the predicate alone.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMatrixScroll } from "../features/sequencer/hooks/useMatrixScroll";

/** A container with real scroll geometry, since jsdom has none. */
function makeContainer({ scrollWidth = 800, clientWidth = 400 } = {}) {
  const el = document.createElement("div");
  el.scrollLeft = 0;
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  document.body.appendChild(el);
  return el;
}

const wheel = (el: HTMLElement, init: WheelEventInit) => {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
};

let container: HTMLElement;

beforeEach(() => {
  container = makeContainer();
});

afterEach(() => {
  container.remove();
});

const mount = () =>
  renderHook(() =>
    useMatrixScroll({
      matrixContainerRef: { current: container } as never,
      stepsPerBar: 4,
      setViewedBar: () => {},
      commit: () => {},
    })
  );

describe("step-grid wheel handling", () => {
  it("leaves a vertical gesture to the browser, which is what keeps the page scrollable", () => {
    mount();
    const event = wheel(container, { deltaY: 120, deltaX: 0 });
    expect(event.defaultPrevented, "a vertical wheel must not be cancelled").toBe(false);
    expect(container.scrollLeft).toBe(0);
  });

  it("pans the grid on a horizontal-dominant gesture, with no modifier needed", () => {
    // A trackpad two-finger swipe: deltaX dominates, no shiftKey.
    mount();
    const event = wheel(container, { deltaX: 90, deltaY: 4 });
    expect(event.defaultPrevented).toBe(true);
    expect(container.scrollLeft).toBe(90);
  });

  it("still honours Shift+wheel, the mouse-wheel convention", () => {
    mount();
    const event = wheel(container, { deltaY: 60, deltaX: 0, shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(container.scrollLeft).toBe(60);
  });

  it("does not cancel a vertical gesture even with a large delta", () => {
    // The regression guard: intercepting on `deltaY !== 0` alone removes the page's scroll.
    mount();
    const event = wheel(container, { deltaY: 4000, deltaX: 0, shiftKey: false });
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not eat a gesture when there is nothing to scroll", () => {
    container.remove();
    container = makeContainer({ scrollWidth: 400, clientWidth: 400 });
    mount();
    const event = wheel(container, { deltaX: 200, deltaY: 0 });
    expect(event.defaultPrevented, "an unscrollable grid must not swallow the gesture").toBe(false);
  });

  it("registers the listener as cancellable", () => {
    /**
     * A `passive` listener cannot call `preventDefault` at all, so the pan would silently stop working
     * while every predicate test still passed. Asserting the effective behaviour — `preventDefault`
     * actually takes effect — is what covers the registration options.
     */
    mount();
    const event = wheel(container, { deltaX: 50, deltaY: 0 });
    expect(event.defaultPrevented).toBe(true);
  });
});
