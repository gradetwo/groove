/**
 * Phone grid geometry.
 *
 * The step grid is the surface a beat is actually programmed on, so its cell size is not a
 * styling preference — it is whether the instrument is playable. Measured before this test
 * existed: 28×40 px on a 390 px phone, against a 44 px recommended target and a ~32 px practical
 * floor. The audit that found it (PRODUCT_PLAN_v2.1.0.md §4) also counted 40-odd controls in the
 * same viewport, so the fix had to gain height and width without adding chrome.
 *
 * These assertions are on the class strings because jsdom has no layout engine; the real geometry
 * is asserted by the device matrix, which taps these cells by coordinate at seven viewports.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StepCell } from "../components/sequencer/StepCell";

const baseProps = {
  trackIdx: 0,
  stepIdx: 0,
  value: 1,
  velocity: 100,
  gate: 1,
  pitch: 60,
  color: "#f5b73d",
  isActive: true,
  isCurrent: false,
  isPlaying: false,
  trackName: "Kick",
  accent: "#f5b73d",
};

const renderCell = (over: { isCompact?: boolean } = {}) =>
  render(<StepCell {...(({ ...baseProps, ...over }) as unknown as React.ComponentProps<typeof StepCell>)} />);

/** The element carrying the sizing classes. */
const cellOf = (container: HTMLElement) =>
  (container.querySelector("[data-step-idx]") ?? container.firstElementChild) as HTMLElement;

describe("StepCell phone geometry", () => {
  it("gives a phone a 36px-wide cell that cannot be squashed by the flex row", () => {
    const { container } = renderCell();
    const cls = cellOf(container).className;
    // `w-9` = 36px, applied *before* the `sm:` override so it is the phone value. A plain
    // `min-w-[28px]` was not enough: 28 px is below the practical tap floor and the cells are
    // inside a horizontally scrolling grid where width is what the user aims at.
    expect(cls).toMatch(/(^|\s)w-9(\s|$)/);
    // Desktop keeps its own floor and lets flex distribute the remaining width.
    expect(cls).toMatch(/sm:min-w-\[36px\]/);
    expect(cls).toMatch(/sm:w-auto/);
  });

  it("gives a phone a 44px-tall cell", () => {
    const { container } = renderCell();
    const cls = cellOf(container).className;
    // `h-11` = 44px exactly; desktop stays at `h-10` because eight rows have to fit beside the
    // information dossier there.
    expect(cls).toMatch(/(^|\s)h-11(\s|$)/);
    expect(cls).toMatch(/sm:h-10/);
  });

  it("keeps the compact density override, which is an explicit user choice", () => {
    // `isCompact` is the per-track density preference; it must still win over the new phone
    // default or the preference becomes unreachable.
    const { container } = renderCell({ isCompact: true });
    expect(cellOf(container).className).toMatch(/h-7/);
  });

  it("keeps the touch-action that stops double-tap zoom on a cell", () => {
    const { container } = renderCell();
    // A cell is the most-tapped element in the app; if the browser is allowed to interpret two
    // quick taps as a double-tap it zooms the page instead of programming a beat.
    expect(cellOf(container).className).toContain("touch-action-manipulation");
  });
});
