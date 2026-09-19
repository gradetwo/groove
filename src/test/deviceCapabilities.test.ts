/**
 * Device classification and the mobile gesture guards.
 *
 * The classification is pure so it can be tested without a browser — the case that matters most
 * (a landscape phone) is wider than the phone breakpoint and would otherwise be mistaken for a
 * tablet.
 */
import { describe, it, expect } from "vitest";
import { classifyDevice, PHONE_MAX_WIDTH_PX, PHONE_MAX_HEIGHT_PX, useDeviceCapabilities } from "../hooks/useDeviceCapabilities";
import { renderHook } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const readFileSync = fs.readFileSync;

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

  it("flags a short landscape viewport, which is the shape with the least room", () => {
    const caps = classifyDevice({ ...base, touch: true, landscape: true, shortViewport: true });
    expect(caps.isShortLandscape).toBe(true);
  });

  it("does not flag portrait, nor a tall landscape viewport", () => {
    expect(
      classifyDevice({ ...base, touch: true, landscape: false, shortViewport: true }).isShortLandscape
    ).toBe(false);
    expect(
      classifyDevice({ ...base, touch: true, landscape: true, shortViewport: false }).isShortLandscape
    ).toBe(false);
  });

  /**
   * The JS boundary and the CSS boundary must be the same number.
   *
   * They were 480 and 500: a 490 px-tall landscape viewport got the compressed stylesheet from
   * `@media (max-height: 500px)` while JS still classified it as a tall phone, so a component
   * could be sized by one rule and positioned by another. There is no way to share a constant
   * between CSS and TS, so this asserts they agree by reading the stylesheet — the one place an
   * edit to either side is caught.
   */
  it("uses the same short-landscape boundary as the stylesheet", () => {
    const css = readFileSync(path.resolve(TEST_DIR, "../index.css"), "utf8");
    const media = css.match(/@media \(max-height: (\d+)px\) and \(orientation: landscape\)/);
    expect(media, "the short-landscape media query is gone").toBeTruthy();
    expect(Number(media![1])).toBe(PHONE_MAX_HEIGHT_PX);
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
  /**
   * Comments carry no CSS, and this file's comments quote the exact broken declarations the tests
   * below forbid (`overscroll-behavior: none` among them), so they are stripped before any
   * declaration is inspected. Offset-preserving is not needed here — nothing maps back to a line.
   */
  const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  /**
   * The declaration block of a bare selector.
   *
   * Throws rather than returning empty when the selector is absent. The lookups this replaced used
   * `indexOf` + `slice`, which silently produced `""` for a selector that did not exist and turned
   * a regression guard into an assertion about nothing — see the test that documents it.
   */
  const blockOf = (selector: string): string => {
    const match = cssRules.match(new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([^{}]*)\\}`));
    if (!match) throw new Error(`src/index.css has no \`${selector}\` block`);
    return match[1];
  };

  it("blocks viewport zoom at the source", () => {
    const meta = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/)?.[1] ?? "";
    expect(meta).toContain("width=device-width");
    expect(meta).toContain("initial-scale=1");
    /**
     * `user-scalable=no` + `maximum-scale=1` is the deliberate choice, and it is the *second*
     * attempt at this.
     *
     * The first removed `maximum-scale` on the theory that its presence enabled zoom. Removing it
     * did not stop pinch — it merely stopped *capping* it — so the phone could still be zoomed by
     * accident mid-gesture, and the magnifier loupe over a step grid (the original complaint) was
     * still reachable. This is a control surface, not a document; the only correct value is none.
     */
    expect(meta).toMatch(/maximum-scale=1(\.0)?/);
    expect(meta).toMatch(/user-scalable=no/);
  });

  it("removes the double-tap zoom on controls and the iOS callout globally", () => {
    expect(css).toMatch(/touch-action:\s*manipulation/);
    expect(css).toMatch(/-webkit-touch-callout:\s*none/);
  });

  it("does NOT put touch-action on the root, which broke trackpad scrolling", () => {
    /**
     * Chrome honours `touch-action` on touch-capable desktop hardware, so a root-level
     * `touch-action: manipulation` disabled two-finger trackpad scrolling on an ordinary laptop.
     * It is applied per-control instead (see the rule right after the body block), which keeps the
     * double-tap suppression where it matters without taking the page's scroll gestures away.
     *
     * This assertion used to run against `css.slice(css.indexOf("html,"), …)` — and `src/index.css`
     * contains no `html,` selector, so `indexOf` returned -1, `slice` returned the empty string, and
     * the check passed no matter what the root said. A guard for a real regression that cannot fail
     * is worse than no guard: it is the reason the note above claims something nobody re-verified.
     * The block lookups below parse the real blocks and throw when one is missing, so a renamed
     * selector fails the suite instead of silently emptying it.
     */
    for (const selector of ["html", "body"]) {
      expect(blockOf(selector), `${selector} block`).not.toMatch(/touch-action/);
    }
    // ...and it is still applied to controls.
    expect(cssRules).toMatch(/button,[\s\S]{0,120}touch-action:\s*manipulation/);
  });

  it("suppresses overscroll on the horizontal axis only, so the page still scrolls", () => {
    /**
     * The root rule is deliberately axis-split, and this test exists because the previous form
     * broke the most basic gesture on the page.
     *
     * `overscroll-behavior: none` on `html`/`body` is honoured by Chrome on touch-capable *desktop*
     * hardware, and on macOS it made two-finger trackpad scrolling of the page stop working
     * entirely — the page could still be scrolled programmatically, `overflow` and `touch-action`
     * were untouched, and Safari was unaffected, which is why it read as a mystery for a while.
     * Verified by hand against the built app: the page scrolls with the shorthand removed and does
     * not with it present.
     *
     * The horizontal half is kept on purpose — it suppresses Chrome's two-finger horizontal
     * history-swipe (Back/Forward), which the step grid's own horizontal panning would otherwise
     * fire constantly. Vertical belongs to the browser.
     */
    for (const selector of ["html", "body"]) {
      const declarations = blockOf(selector)
        .split(";")
        .map((d) => d.trim().replace(/\s+/g, " "));
      expect(declarations, `${selector} block`).toContain("overscroll-behavior-x: none");
      expect(declarations, `${selector} block`).toContain("overscroll-behavior-y: auto");
      // The regression, in both of the forms that can express it.
      expect(declarations, `${selector} block`).not.toContain("overscroll-behavior: none");
      expect(declarations, `${selector} block`).not.toContain("overscroll-behavior-y: none");
    }
  });
});

/**
 * Regression: the hook must not require `matchMedia`.
 *
 * jsdom does not implement it and several suites stub `window` wholesale, which drops it. The
 * first version read it in the initialiser but called `window.matchMedia(...)` unguarded in the
 * effect, so every view using the hook threw on mount in those suites — a runtime API the hook
 * merely *prefers* took seven tests down with it.
 */
describe("useDeviceCapabilities robustness", () => {
  it("mounts and returns the desktop default when matchMedia is unavailable", () => {
    const original = window.matchMedia;
    // @ts-expect-error deliberately removing an API the hook must tolerate losing.
    delete window.matchMedia;
    try {
      const { result } = renderHook(() => useDeviceCapabilities());
      // Desktop is the safe fallback: it is the superset layout, so nothing becomes unreachable.
      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTouch).toBe(false);
      expect(typeof result.current.isPhone).toBe("boolean");
    } finally {
      window.matchMedia = original;
    }
  });
});
