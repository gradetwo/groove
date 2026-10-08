import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The instrument chooser must be readable over what it floats on** (reported with a screenshot).
 *
 * Every category and row of `instrument-library` was drawn **over** the arrangement: the host's surface is translucent and
 * this list declared no background at all, so two texts occupied one line. A panel is a surface — it takes the skin's own
 * token rather than nothing — and the criterion is here because "it looked fine in my theme" is exactly how this ships.
 */
const library = readFileSync(resolve(__dirname, "../components/arrangement/InstrumentLibraryV2.tsx"), "utf8");

describe("the instrument chooser's surface", () => {
  it("⭐ declares an opaque background, so its labels cannot overlap the canvas behind it", () => {
    const at = library.indexOf('data-testid="instrument-library"');
    expect(at, "the chooser is in the file").toBeGreaterThan(-1);
    const block = library.slice(at, at + 320);
    expect(block, "the root carries a surface token").toMatch(/className="[^"]*\bbg-panel\b/);
    expect(block, "and it is not transparent").not.toMatch(/bg-transparent/);
  });

  it("⭐ and its search box is a phone-sized target", () => {
    const at = library.indexOf('placeholder={t("instrument_search")}');
    expect(at, "the search input is in the file").toBeGreaterThan(-1);
    expect(library.slice(at, at + 400), "the input is 44px on a phone").toMatch(/min-h-11/);
  });

describe("the instrument chooser's layer", () => {
  /**
   * ⭐ **A chooser that floats, so the row cannot squeeze it** (reported from a screenshot: the panel was cramped and its
   * labels overlapped the arrangement).
   *
   * It used to render in the track row's own flow, inside a column whose height is pinned to `--arr-track-h`: the panel
   * was too small for its three columns *and* pressed against everything around it. `absolute` takes it out of flow, which
   * is also what keeps the header/lane row-height contract the release matrix asserts.
   */
  const browser = readFileSync(resolve(__dirname, "../components/arrangement/InstrumentBrowserV2.tsx"), "utf8");

  it("⭐ anchors the panel to its slot and takes it out of the row's flow", () => {
    expect(browser, "the slot is the positioning context").toMatch(/instrument-slot-\$\{trackId\}`[^>]*className="relative/);
    const at = browser.indexOf("instrument-panel-");
    expect(at, "the panel exists").toBeGreaterThan(-1);
    const block = browser.slice(at, at + 2200);
    expect(block, "it floats above the grid").toMatch(/absolute/);
    expect(block, "above the arrangement").toMatch(/z-[2-9]\d/);
    expect(block, "on its own surface").toMatch(/bg-panel/);
    expect(block, "with a bounded, scrollable height").toMatch(/max-h-\[[67]\dvh\]/);
    expect(block, "and a way to close it that does not depend on the chip").toMatch(/instrument-panel-close-/);
    /**
     * ⭐ **And it must be reachable on a phone** (measured: released as an anchored panel alone, it opened at y=985 in an
     * 844 px viewport — below the fold, which is the "inconvenient to operate" the screenshot showed). The mobile-first
     * default is therefore a bottom sheet pinned to the viewport, with the anchored panel restored from `sm:`.
     */
    expect(block, "a phone gets a sheet pinned to the viewport").toMatch(/fixed/);
    expect(block, "spanning the width it has").toMatch(/inset-x-2/);
    expect(block, "at the bottom edge").toMatch(/bottom-2/);
    expect(block, "and a wide screen gets the anchored panel back").toMatch(/sm:absolute/);
  });

  it("⭐ makes every row of the library a thumb target on a phone", () => {
    const library = readFileSync(resolve(__dirname, "../components/arrangement/InstrumentLibraryV2.tsx"), "utf8");
    const at = library.indexOf("function rowClass");
    expect(at, "rows come from one place, so one rule covers them").toBeGreaterThan(-1);
    expect(library.slice(at, at + 600), "44px on a phone, dense from `sm:`").toMatch(/min-h-11 sm:min-h-0/);
  });
});

});