import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import React from "react";
import { PianoRollV2 } from "../components/arrangement/PianoRollV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **The grid draws a window of steps, not the whole arrangement.**
 *
 * The independent evaluation measured this component at **4,736 real `<button>` cells for eight bars** (37 pitch rows ×
 * 128 steps) and **74,592 for 126 bars**, with the node count past 75,000 and a first paint of 3.09 s — one button per
 * pitch row per step, for the entire piece. The fix draws only the visible step window (a constant when the container
 * has no measured width, which is the case here), so what this pins is the **shape**: the cell count stops following the
 * arrangement's length.
 *
 * It is written as a budget and not as an exact number because the window is a rendering choice; what must not come
 * back is a count that grows with the piece.
 *
 * ⚠️ **The two readings are different quantities, and this file only has one of them** (BACKLOG S-04, written out on
 * 2026-10-16 after the number was read as if it were the other):
 *
 *   · **here (jsdom):** the container is never laid out, so `clientWidth` is 0 and the component falls back to
 *     `DEFAULT_VISIBLE_STEPS = 64` steps (`PianoRollV2.tsx:82`) — a constant, which is exactly what makes a cell count
 *     pinned at 8 bars and at 126 bars comparable at all. `≤3,000` cells and `<12,000` nodes are **this** reading.
 *   · **in a browser:** the window is `Math.ceil(clientWidth / 12) + VISIBLE_MARGIN_STEPS * 2` (`:201-204`), so it is a
 *     function of the viewport: a 1920-pixel container draws `ceil(1920 / 12) + 8 = 168` steps per pitch row, more than
 *     twice the fallback. Nothing here measures that, and a passing run must not be read as "the browser draws fewer
 *     than 3,000 cells".
 *
 * A browser reading needs a real layout — `VIEWPORT_W=3840` with the DOM probe (BACKLOG S-07), or the screen audit —
 * which is why this criterion is a shape check and the browser figure lives in the handover batch rather than here. The
 * case below keeps the note honest by reading the component's own constants.
 */
const roll = (bars: number) =>
  render(
    <LanguageProvider>
      <PianoRollV2 notes={[]} onAddNote={() => {}} onRemoveNote={() => {}} onMoveNote={() => {}} onResizeNote={() => {}} beats={bars * 4} />
    </LanguageProvider>
  );

const count = (container: HTMLElement, selector: string) => container.querySelectorAll(selector).length;

describe("the roll's DOM budget", () => {
  it("⭐ does not grow the cell count with the arrangement's length", () => {
    const short = roll(8);
    const shortCells = count(short.container, '[data-testid^="roll-cell-"]');
    short.unmount();
    const long = roll(126);
    const longCells = count(long.container, '[data-testid^="roll-cell-"]');
    const longNodes = long.container.querySelectorAll("*").length;
    long.unmount();

    // Measured before the fix: 4,736 cells at eight bars and 74,592 at 126 (a 15.8× climb for a 15.8× longer piece).
    // The window makes both the same size, so any return of "one cell per step" fails here.
    expect(longCells, `126 bars rendered ${longCells} cells`).toBeLessThanOrEqual(3_000);
    expect(longCells).toBe(shortCells);
    expect(longNodes, `126 bars rendered ${longNodes} DOM nodes`).toBeLessThan(12_000);
  });

  it("⭐ keeps the note above true: it quotes the component's own constants", () => {
    /**
     * ⭐ **A note that quotes numbers can rot.** The paragraph above explains that this file measures the *fallback*
     * window (`64`) while a browser measures `ceil(clientWidth / CELL) + 8` with `CELL = 12`; if either constant is
     * changed, the explanation silently becomes false and the next reader trusts it. Reading the component's source is
     * what makes that impossible — the same device `userPresetList.test.tsx` uses for its call site.
     */
    const source = readFileSync(resolve(__dirname, "../components/arrangement/PianoRollV2.tsx"), "utf8");
    expect(source, "the fallback window this file's counts come from").toContain("const DEFAULT_VISIBLE_STEPS = 64;");
    expect(source, "the cell width the browser formula divides by").toContain("const CELL = 12;");
    expect(source, "the browser formula, which is a different quantity from the fallback").toMatch(
      /Math\.ceil\(width \/ CELL\) \+ VISIBLE_MARGIN_STEPS \* 2/
    );
  });
});
