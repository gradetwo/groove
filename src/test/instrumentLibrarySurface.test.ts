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
});
