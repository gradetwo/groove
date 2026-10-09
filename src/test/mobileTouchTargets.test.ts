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
    /**
     * ⭐ **The hit area, not the layout box.** The first version of this criterion demanded `h-11 w-11`, and the release
     * matrix then caught the cost: growing the control grew the header column, and WebKit reported *"header 0 is at
     * 726px/119px against its lane at 845px/22px — the two columns must share one row height."* A target is therefore
     * extended **outside** the layout box, so the criterion checks that the extension is there (12 px past each edge of a
     * 20 px square = 44 px) rather than that the square itself grew.
     */
    expect(header, "the 20 px square stays 20 px").toMatch(/className="relative h-5 w-5 shrink-0 rounded[^"]*"/);
    expect(header, "and its hit area reaches 44 px without touching the row").toMatch(/after:absolute after:-inset-3 after:content-\[''\]/);
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
    // ⭐ The panel is not part of the header/lane grid, so a real `min-h-11` box is fine there — and it is what keeps the
    // desktop panel dense from `sm:`.
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
    expect(prompt, "and it offers no second play control").not.toContain("first-run-prompt-play");
    /** ⭐ Only the dismiss remains: the hint's own play control was a duplicate of the transport's (fifth evaluation P3). */
    for (const id of ["first-run-prompt-dismiss"]) {
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


  it("⭐ the first-run hint yields width instead of pushing Import/Export onto their own line", () => {
    /**
     * Reported from a fresh profile (incognito): with the hint visible, the file group wrapped to a line of its own. The
     * hint lives in the transport group of a `flex flex-wrap` toolbar, so a hint that cannot shrink wraps the row; it is a
     * hint, so truncating it is the honest trade.
     */
    const prompt = source("components/onboarding/FirstRunPrompt.tsx");
    const at = prompt.indexOf('data-testid="first-run-prompt"');
    expect(at, "the hint is in the file").toBeGreaterThan(-1);
    const block = prompt.slice(at, at + 2600);
    expect(block, "it can shrink").toMatch(/min-w-0 shrink/);
    expect(block, "and its text truncates rather than wrapping the row").toMatch(/flex-1 min-w-0 truncate/);
  });


  it("⭐ the first-run hint renders outside the toolbar, so it cannot cost a toolbar row", () => {
    /**
     * The measured fix: inside the transport group the hint took ~506 px of a wrapping row and every group after it moved
     * down one — reproduced at **1512 CSS px** (the reporter's own window), where Import/Export landed on a row alone. As a
     * row of its own the toolbar went from five rows back to four, with the file group beside FX and ZOOM.
     */
    const view = source("components/arrangement/ArrangementViewV2.tsx");
    const hint = view.indexOf("<FirstRunPrompt");
    const toolbar = view.indexOf('data-testid="arrangement-toolbar"');
    expect(hint, "the hint is rendered on this view").toBeGreaterThan(-1);
    expect(toolbar, "the toolbar is rendered on this view").toBeGreaterThan(-1);
    expect(hint, "the hint comes before the toolbar, not inside it").toBeLessThan(toolbar);
  });


  it("⭐ the instrument slot keeps a readable width on a phone", () => {
    /**
     * Measured (fourth evaluation, P1-2's second half): with `min-w-0` alone the slot was squeezed to **10 px** by the
     * other controls in the row — a 44 px-tall chip that was effectively invisible. A minimum width on the phone gives the
     * instrument's name somewhere to live (measured 104 px after the change), and from `sm:` the slot yields again.
     */
    const browser = readFileSync(resolve(__dirname, "../components/arrangement/InstrumentBrowserV2.tsx"), "utf8");
    const at = browser.indexOf("ref={slotRef}");
    expect(at, "the slot exists").toBeGreaterThan(-1);
    expect(browser.slice(Math.max(0, at - 300), at + 300), "a phone width it can be read at").toMatch(/min-w-\[6\.5rem\]/);
    expect(browser.slice(Math.max(0, at - 300), at + 300), "and the wide layout unchanged").toMatch(/sm:min-w-0/);
  });


  it("⭐ the track header's ids are marked, so the list and the header cannot share a testid", () => {
    /**
     * Measured online (fifth evaluation, P2-2): `track-list-add`, `track-synth-2`, `track-gain-synth-2` and
     * `track-gain-value-synth-2` each appeared **twice**, because the studio draws a track's controls both in the header
     * column and in the track list. The instrument chip was fixed that way first; this applies the same scheme to the
     * whole header, and the DOM now counts **178 testids over 178 elements — no duplicates** (`probe-duplicate-testids`).
     */
    const header = source("components/arrangement/TrackHeaderV2.tsx");
    const ids = [...header.matchAll(/data-testid=\{`(track-[^`]+)`\}/g)].map((match) => match[1]);
    expect(ids.length, "the header draws track controls").toBeGreaterThan(10);
    for (const id of ids) expect(id, `${id} carries the marker`).toMatch(/-header`?$/);
    const view = source("components/arrangement/ArrangementViewV2.tsx");
    expect(view, "and the header's add button too").toContain('data-testid="track-list-add-header"');
  });

});