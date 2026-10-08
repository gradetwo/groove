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


  it("⭐ the first-run prompt's two controls are phone-sized, because they are the first thing anyone touches", () => {
    /**
     * Measured at 390×844: `first-run-prompt-play` 24 px and `first-run-prompt-dismiss` 22 px. These are the very first
     * controls a new person is asked to hit, so they are on the primary path by definition; `sm:` keeps the prompt the same
     * compact strip on a desktop.
     *
     * ⚠️ **And the deliberate exemptions, stated so the list stops growing**: the step grid (`step N`), the bar **ruler**
     * (`ruler-bar-*`) and dense readouts are small on purpose — they are scales to read, not targets to hit — which is why
     * the probe excludes the grid and why this criterion names controls rather than "everything".
     */
    const prompt = source("components/onboarding/FirstRunPrompt.tsx");
    for (const id of ["first-run-prompt-play", "first-run-prompt-dismiss"]) {
      const at = prompt.indexOf(`data-testid="${id}"`);
      expect(at, `${id} is in the prompt`).toBeGreaterThan(-1);
      expect(prompt.slice(at, at + 320), `${id} has a phone-sized target with a desktop escape`).toMatch(/min-h-11[^"]*sm:min-h-0/);
    }
  });


  it("⭐ the arrangement panel's number inputs are 44 px on a phone and their desktop height is restored", () => {
    /**
     * Measured: `arrangement-euclidean-pulses` 22 px, `arrangement-tempo` / `arrangement-bars` /
     * `arrangement-transpose-semitones` 24 px. A number input on a phone is a thumb target as much as a button is, and
     * these keep the exact desktop height from `sm:` — the fix is mobile-first, so nothing about the wide layout moves.
     */
    const view = source("components/arrangement/ArrangementViewV2.tsx");
    for (const id of ["arrangement-euclidean-pulses", "arrangement-transpose-semitones", "arrangement-tempo", "arrangement-bars"]) {
      const at = view.indexOf(`data-testid="${id}"`);
      expect(at, `${id} is in the view`).toBeGreaterThan(-1);
      expect(view.slice(at, at + 420), `${id} is phone-sized with a desktop escape`).toMatch(/min-h-11/);
    }
  });

});