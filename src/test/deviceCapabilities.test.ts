/**
 * Device classification and the mobile gesture guards.
 *
 * The classification is pure so it can be tested without a browser — the case that matters most
 * (a landscape phone) is wider than the phone breakpoint and would otherwise be mistaken for a
 * tablet.
 */
import { describe, it, expect } from "vitest";
import { classifyDevice, PHONE_MAX_WIDTH_PX, PHONE_MAX_HEIGHT_PX } from "../hooks/useDeviceCapabilities";
import fs from "node:fs";
import path from "node:path";

const base = {
  touch: false,
  phoneWidth: false,
  shortViewport: false,
  landscape: false,
  reducedMotion: false,
};

describe("device classification", () => {
  it("treats a desktop as neither touch nor phone", () => {
    const caps = classifyDevice(base);
    expect(caps).toMatchObject({ isTouch: false, isPhone: false, isMobile: false });
  });

  it("treats a portrait phone as mobile", () => {
    const caps = classifyDevice({ ...base, touch: true, phoneWidth: true });
    expect(caps).toMatchObject({ isTouch: true, isPhone: true, isMobile: true });
  });

  /**
   * The case a width-only test gets wrong. A 390×844 phone in landscape is 844 px wide, so
   * `max-width: 639px` is false and a naive check hands it the desktop editor — on the smallest
   * screen with the least vertical room.
   */
  it("treats a landscape phone as mobile even though it is wider than the breakpoint", () => {
    const caps = classifyDevice({ ...base, touch: true, phoneWidth: false, shortViewport: true, landscape: true });
    expect(caps.isPhone).toBe(true);
    expect(caps.isMobile).toBe(true);
  });

  it("does not treat a touch laptop as a phone", () => {
    // Coarse pointer reported on a large, tall viewport: big targets yes, phone layout no.
    const caps = classifyDevice({ ...base, touch: true, phoneWidth: false, shortViewport: false });
    expect(caps).toMatchObject({ isTouch: true, isPhone: false, isMobile: false });
  });

  it("does not treat a narrow desktop window as mobile without touch", () => {
    const caps = classifyDevice({ ...base, touch: false, phoneWidth: true });
    expect(caps.isMobile).toBe(false);
  });

  it("does not mistake a landscape tablet for a landscape phone", () => {
    // Touch, landscape, but tall enough (an iPad is ~834 px tall in landscape on the short side
    // only when split; a full iPad landscape viewport is well above the short-viewport bound).
    const caps = classifyDevice({ ...base, touch: true, landscape: true, shortViewport: false });
    expect(caps.isMobile).toBe(false);
  });

  it("carries the reduced-motion preference through", () => {
    expect(classifyDevice({ ...base, reducedMotion: true }).prefersReducedMotion).toBe(true);
  });

  it("keeps the breakpoints in the documented range", () => {
    expect(PHONE_MAX_WIDTH_PX).toBeGreaterThan(320);
    expect(PHONE_MAX_WIDTH_PX).toBeLessThan(768);
    expect(PHONE_MAX_HEIGHT_PX).toBeLessThan(PHONE_MAX_WIDTH_PX);
  });
});

/**
 * The zoom / magnifier guards are the one part of the mobile work that cannot be unit-tested
 * behaviourally (jsdom has no gesture engine), so they are asserted at the source level: the
 * viewport meta must not opt back into pinch zoom, and the global stylesheet must disable the
 * double-tap zoom and the overscroll gestures a native app does not have.
 */
describe("mobile zoom and gesture guards", () => {
  const root = process.cwd();
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");

  it("does not allow viewport zoom via the meta tag", () => {
    const meta = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/)?.[1] ?? "";
    expect(meta).toContain("width=device-width");
    expect(meta).toContain("initial-scale=1");
    // `maximum-scale` / `user-scalable=yes` re-enable pinch zoom, which on iOS also brings back
    // the magnifier loupe. The app is a control surface, not a document to be zoomed.
    expect(meta).not.toMatch(/maximum-scale/i);
    expect(meta).not.toMatch(/user-scalable\s*=\s*yes/i);
  });

  it("removes the double-tap zoom and iOS callout globally", () => {
    expect(css).toMatch(/touch-action:\s*manipulation/);
    expect(css).toMatch(/-webkit-touch-callout:\s*none/);
  });

  it("disables overscroll bounce and pull-to-refresh at the root", () => {
    // Overscroll at the document level is what makes a PWA feel like a web page: rubber-banding
    // and pull-to-refresh both fire during a downward drag on the step grid.
    expect(css).toMatch(/overscroll-behavior[^;]*none/);
  });
});
