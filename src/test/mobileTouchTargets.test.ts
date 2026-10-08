import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The controls a thumb has to hit** (third evaluation, F12 — its own measurement was DOM geometry, and this is the
 * source-side half of it).
 *
 * Measured at 390×844 with the step grid excluded: **51 controls under 44 px**, including the two fixed here — the
 * **destructive** track-remove square (20 px) and the header's version button (20 px). The grid cells (`step N`) are
 * deliberately small and are **exempt on purpose**, so a criterion that demanded 44 px everywhere would be asking for the
 * grid to be destroyed.
 */
const source = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");

describe("mobile touch targets", () => {
  it("⭐ the destructive track-remove control is 44 px on a phone and compact only from `sm:`", () => {
    const header = source("components/arrangement/TrackHeaderV2.tsx");
    expect(header, "the default is the touch size").toMatch(/h-11 w-11 shrink-0 rounded[^"]*sm:h-5 sm:w-5/);
    // ⭐ And the old unconditional 20 px square is gone: keeping it would mean the phone never got the larger target.
    expect(header).not.toMatch(/className="h-5 w-5 shrink-0 rounded/);
  });

  it("⭐ the header's version control reaches 44 px on a phone as well", () => {
    const header = source("components/Header.tsx");
    expect(header).toContain("min-h-11");
    expect(header, "and returns to the compact pill only from `sm:`").toContain("sm:min-h-0");
  });

  it("⭐ the arrangement panel's action controls reach 44 px on a phone too", () => {
    /**
     * The same list, one row further down: `arrangement-legato-selection`, `arrangement-arpeggiate-selection`,
     * `arrangement-euclidean` and `arrangement-form-loop` all measured 22–24 px at 390×844. They share one class string,
     * which is why one rule covers them — and `sm:min-h-0` is what keeps the desktop panel as dense as it was.
     */
    const view = source("components/arrangement/ArrangementViewV2.tsx");
    const controls = ["arrangement-legato-selection", "arrangement-arpeggiate-selection", "arrangement-euclidean", "arrangement-form-loop"];
    for (const id of controls) {
      const at = view.indexOf(`data-testid="${id}"`);
      expect(at, `${id} is in the view`).toBeGreaterThan(-1);
      const block = view.slice(at, at + 400);
      expect(block, `${id} has a phone-sized target with a desktop escape`).toMatch(/min-h-11[^"]*sm:min-h-0|sm:min-h-0[^"]*min-h-11/);
    }
  });

});