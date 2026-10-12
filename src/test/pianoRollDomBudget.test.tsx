import { describe, expect, it } from "vitest";
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
});
