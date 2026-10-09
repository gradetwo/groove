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

  it("⭐ renders the panel into the body, measured from the chip — the stacking context that hid it is escaped", () => {
    /**
     * ⭐ **The fourth evaluation's P1-1, as a criterion.** The panel used to be `absolute` inside the slot, and the slot
     * lives in a sticky `z-10` column: `z-50` therefore meant 50 *inside that context*, and a track near the bottom of the
     * list opened a panel that `arrangement-detail` painted over — 315 options in the DOM, none of them clickable
     * (`elementFromPoint` proved it; scripted `.click()` never asked what was on top).
     *
     * So the property to hold is not "it floats" but "**it is not a descendant of the column**": a portal into
     * `document.body`, `fixed`, with coordinates measured from the chip and clamped to the viewport.
     */
    // ⭐ Whole-file assertions: the properties are about how this component renders, and slicing around one testid made
    // them depend on where a comment happens to end.
    expect(browser, "it escapes every ancestor's stacking context").toMatch(/createPortal\(/);
    expect(browser, "into the body").toMatch(/document\.body/);
    expect(browser, "positioned by measurement, not by ancestors").toMatch(/getBoundingClientRect\(\)/);
    expect(browser, "the slot is the measuring anchor").toMatch(/ref=\{slotRef\}/);
    expect(browser, "above everything the surface draws").toMatch(/z-\[6\d\]/);
    expect(browser, "on its own surface").toMatch(/bg-panel/);
    expect(browser, "with a height bounded by what is left").toMatch(/maxHeight/);
    expect(browser, "and a way to close it that does not depend on the chip").toMatch(/instrument-panel-close-/);
    // ⭐ And the panel is not positioned as a descendant any more: no `absolute` in its own class string.
    const panelClass = browser.slice(browser.indexOf("instrument-panel-"), browser.indexOf("instrument-panel-") + 900);
    expect(panelClass, "the panel is fixed, not absolute inside the column").not.toMatch(/className="[^"]*absolute/);
  });

  it("⭐ makes every row of the library a thumb target on a phone", () => {
    const library = readFileSync(resolve(__dirname, "../components/arrangement/InstrumentLibraryV2.tsx"), "utf8");
    const at = library.indexOf("function rowClass");
    expect(at, "rows come from one place, so one rule covers them").toBeGreaterThan(-1);
    expect(library.slice(at, at + 600), "44px on a phone, dense from `sm:`").toMatch(/min-h-11 sm:min-h-0/);
  });
});

});