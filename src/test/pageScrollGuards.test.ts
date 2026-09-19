/**
 * The page must stay vertically scrollable over the controls the studio is made of.
 *
 * `input[type=range]` carried `touch-action: none`, which means a gesture starting over a slider
 * could not pan the page at all. The studio renders 22 of them — per-track volume and pan, sends,
 * swing, tempo, insert stages, mixer — so the dead zones were spread across the whole surface. That
 * is the shape of "two-finger scrolling stops working over parts of the page", and a five-pane probe
 * of the app's other candidate rules scrolled in every pane, which is what pointed here.
 *
 * `pan-y` is the fix: vertical page scrolling stays available, and the horizontal drag that changes
 * the value is unaffected because a range input is a native control that handles its own gesture.
 *
 * These are source assertions because the property has no runtime representation in jsdom. The real
 * geometry is measured by `scripts/diagnose_page_scroll.mjs`, which loads the built app and reports
 * whether the page scrolls under every subset of its stylesheet.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.resolve(TEST_DIR, "../index.css"), "utf8");
/** Comments stripped, so an explanation of a rule cannot satisfy an assertion about it. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("range inputs do not block vertical page scrolling", () => {
  it("uses pan-y rather than none", () => {
    const rule = cssCode.match(/input\[type=range\]\s*\{([^}]*)\}/)?.[1];
    expect(rule, "the range-input rule is gone").toBeTruthy();
    expect(rule!).toMatch(/touch-action:\s*pan-y/);
    // `none` would swallow a gesture that starts over any of the 22 sliders.
    expect(rule!).not.toMatch(/touch-action:\s*none/);
  });

  it("keeps the 44px target the rule exists for", () => {
    // The rule's original purpose (P2-21) must survive the change.
    const rule = cssCode.match(/input\[type=range\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/height:\s*44px/);
  });
});

describe("no element-wide rule claims the whole viewport's gestures", () => {
  it("applies touch-action: none only to surfaces that genuinely own the gesture", () => {
    /**
     * `touch-action: none` is correct on a drawing surface — the piano roll grid paints a note from a
     * one-finger drag and therefore cannot give the gesture up. It is wrong on anything the user might
     * scroll past. This asserts the *set* rather than each site, so a new `none` has to be a decision
     * someone made here rather than an accident.
     */
    const noneUsers = [...cssCode.matchAll(/\.([a-z][a-z0-9_-]*)\s*\{[^}]*touch-action:\s*none/g)].map(
      (m) => m[1]
    );
    expect(noneUsers.sort()).toEqual(["touch-action-none"]);

    // The utility exists for explicitly-owned surfaces; the range input is not one of them.
    expect(cssCode).not.toMatch(/input\[type=range\][^{]*\{[^}]*touch-action:\s*none/);
  });

  it("does not put touch-action: none on the root or the body", () => {
    // A gesture-owning rule at the root would make the entire page unscrollable by touch or trackpad.
    for (const rootSel of [":root", "html", "body"]) {
      const rule = cssCode.match(new RegExp(`${rootSel}\\s*\\{([^}]*)\\}`))?.[1];
      if (rule) expect(rule, `${rootSel} must not disable panning`).not.toMatch(/touch-action:\s*none/);
    }
  });
});
