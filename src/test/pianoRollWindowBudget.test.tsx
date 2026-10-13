import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { PianoRollV2 } from "../components/arrangement/PianoRollV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * ⭐ **The step window comes from the scroller's width, not from the arrangement's length — and it is bounded by
 * that width.**
 *
 * The existing budget criterion renders under jsdom, where there is no layout, so `clientWidth` is 0 and the roll
 * falls back to `DEFAULT_VISIBLE_STEPS`. That is a real code path, but it is not the one a browser takes: measured
 * in chromium, a 1440 px viewport draws 123 step columns and a 2200 px viewport draws 186, with the pitch rows
 * unchanged at 49 — so the cells scale with the viewport.
 *
 * This criterion feeds a real width, so the gate runs the path the browser runs. It pins the arithmetic rather than
 * a viewport-dependent constant (`PianoRollV2.tsx`: `CELL = 12`, `VISIBLE_MARGIN_STEPS = 2`, and the window is
 * `ceil(width / CELL) + VISIBLE_MARGIN_STEPS * 2`). Drop the margin, or make the window ignore the measured width,
 * and this goes red.
 */
const CELL = 12;
const VISIBLE_MARGIN_STEPS = 4; // PianoRollV2.tsx:83 — my first draft said 2 and the criterion caught me
const WIDTH = 1380; // what a 1440 px viewport leaves the scroller after the keys and gutter

describe("the roll's step window", () => {
  const withScrollerWidth = (width: number) => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
    return () => {
      if (original) Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
      else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    };
  };

  it("⭐ draws ceil(clientWidth / CELL) + margin step columns, whatever the arrangement's length", () => {
    const restore = withScrollerWidth(WIDTH);
    try {
      const view = render(
        <LanguageProvider>
          <PianoRollV2 notes={[]} onAddNote={() => {}} onRemoveNote={() => {}} onMoveNote={() => {}} onResizeNote={() => {}} beats={40 * 4} />
        </LanguageProvider>
      );
      const steps = new Set<string>();
      for (const cell of view.container.querySelectorAll('[data-testid^="roll-cell-"]')) {
        steps.add(cell.getAttribute("data-testid")!.split("-")[3]!);
      }
      const expected = Math.ceil(WIDTH / CELL) + VISIBLE_MARGIN_STEPS * 2;
      expect(steps.size, `${WIDTH}px of scroller must draw ${expected} step columns`).toBe(expected);
    } finally {
      restore();
    }
  });
});
