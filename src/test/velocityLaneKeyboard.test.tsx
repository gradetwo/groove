/**
 * U10: the parameter lane's keyboard path.
 *
 * The lane was pointer-only: sixteen drag targets and no way in. These tests pin the three things
 * that make it a real alternative rather than a decorative `tabIndex` — one tab stop whose cursor
 * moves, arrow keys writing through the *same* callback a drag uses, and a live region that says
 * what changed. Keys the lane does not own have to stay unswallowed, because the drawer sits inside
 * a sequencer that already owns Enter, Delete and ⌘/Ctrl.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { VelocityLane } from "../components/sequencer/VelocityLane";
import type { ParameterDimension } from "../features/sequencer/stepParameters";
import type { SequencerTrack } from "../types/genre";

const TRACK = {
  track_id: "lead",
  name: "LEAD",
  steps: [1, 1, 0, 0],
  velocity: [100, 127, 100, 100],
  gate: [0.8, 0.8, 0.8, 0.8],
  probability: [100, 100, 100, 100],
  ratchet: [4, 4, 4, 4],
  volume: 0.8,
  pan: 0,
} as unknown as SequencerTrack;

const baseProps = {
  tracks: [TRACK],
  activeTrackIdx: 0,
  onSelectTrack: () => {},
  onUpdateVelocity: vi.fn(),
  onBatchUpdateVelocity: vi.fn(),
  onUpdateProbability: vi.fn(),
  onUpdateGate: vi.fn(),
  onUpdateRatchet: vi.fn(),
  onClose: () => {},
  currentStep: 0,
  isPlaying: false,
  stepCount: 4,
  stepsPerBar: 4,
  groupSize: 4,
  tracksConfig: [{ id: "lead", name: "LEAD", colourRole: "lead" as const }],
};

const renderLane = (dimension: ParameterDimension = "velocity", overrides: Record<string, unknown> = {}) =>
  render(
    <LanguageProvider>
      <VelocityLane {...baseProps} dimension={dimension} {...overrides} />
    </LanguageProvider>
  );

/** The lane's columns in DOM order. */
const columns = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[role="slider"]'));

describe("parameter lane · one tab stop with a cursor", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
  });

  it("exposes every column as a slider, and exactly one of them in the tab order", () => {
    const { container } = renderLane();
    const cols = columns(container);
    expect(cols).toHaveLength(4);
    // One tab stop, not four: a keyboard path that costs a Tab per step is an obstacle course.
    expect(cols.filter((c) => c.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(cols.filter((c) => c.getAttribute("tabindex") === "-1")).toHaveLength(3);
  });

  it("puts the dimension's own scale on the slider, not a 0..100 guess", () => {
    const { container, unmount } = renderLane("velocity");
    const first = columns(container)[0];
    expect(first).toHaveAttribute("aria-valuemin", "1");
    expect(first).toHaveAttribute("aria-valuemax", "127");
    expect(first).toHaveAttribute("aria-valuenow", "100");
    expect(first).toHaveAttribute("aria-valuetext", "100");
    expect(first).toHaveAttribute("aria-label", "第 1 步 · 力度");
    expect(first).toHaveAttribute("aria-orientation", "vertical");
    unmount();

    // Gate is 0.1..2.0 and reads as a percentage — the same slider role, a different scale.
    const gate = renderLane("gate");
    const gateFirst = columns(gate.container)[0];
    expect(gateFirst).toHaveAttribute("aria-valuemin", "0.1");
    expect(gateFirst).toHaveAttribute("aria-valuemax", "2");
    expect(gateFirst).toHaveAttribute("aria-valuenow", "0.8");
    expect(gateFirst).toHaveAttribute("aria-valuetext", "80%");
    expect(gateFirst).toHaveAttribute("aria-label", "第 1 步 · 音长");
  });
});

describe("parameter lane · arrow keys edit the value", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    baseProps.onUpdateVelocity.mockClear();
    baseProps.onUpdateGate.mockClear();
    baseProps.onUpdateRatchet.mockClear();
  });

  it("writes a stepped value through the same callback a drag uses", () => {
    const { container } = renderLane();
    fireEvent.keyDown(columns(container)[0], { key: "ArrowUp" });
    expect(baseProps.onUpdateVelocity).toHaveBeenCalledWith(0, 0, 101);

    fireEvent.keyDown(columns(container)[0], { key: "ArrowUp", shiftKey: true });
    expect(baseProps.onUpdateVelocity).toHaveBeenLastCalledWith(0, 0, 110);

    fireEvent.keyDown(columns(container)[0], { key: "ArrowDown" });
    expect(baseProps.onUpdateVelocity).toHaveBeenLastCalledWith(0, 0, 99);
  });

  it("stops at the ends of the scale instead of wrapping into another value", () => {
    const { container } = renderLane();
    // Column 1 is already at 127 — the ceiling of the scale.
    fireEvent.keyDown(columns(container)[1], { key: "ArrowUp" });
    expect(baseProps.onUpdateVelocity).toHaveBeenCalledWith(0, 1, 127);
  });

  it("steps gate in tenths, and ratchet through its own 1,2,3,4,8 vocabulary", () => {
    const gate = renderLane("gate");
    fireEvent.keyDown(columns(gate.container)[0], { key: "ArrowUp" });
    // The float trap: 0.8 + 0.1 must not reach the callback as 0.9000000000000001.
    expect(baseProps.onUpdateGate).toHaveBeenCalledWith(0, 0, 0.9);
    gate.unmount();

    const ratchet = renderLane("ratchet");
    fireEvent.keyDown(columns(ratchet.container)[0], { key: "ArrowUp" });
    expect(baseProps.onUpdateRatchet).toHaveBeenCalledWith(0, 0, 8);
  });

  it("says what changed in the live region", () => {
    renderLane();
    fireEvent.keyDown(screen.getAllByRole("slider")[0], { key: "ArrowUp" });
    // The zero-width space alternates so a repeated message still re-announces; the text a reader
    // hears is the same either way.
    expect(screen.getByRole("status").textContent?.replace(/\u200B/g, "")).toBe("第 1 步 · 力度 101");
  });
});

describe("parameter lane · the cursor moves, and only the lane's keys are taken", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    baseProps.onUpdateVelocity.mockClear();
  });

  it("moves the cursor with Left/Right and takes focus with it", () => {
    const { container } = renderLane();
    fireEvent.keyDown(columns(container)[0], { key: "ArrowRight" });
    const cols = columns(container);
    expect(cols[1]).toHaveAttribute("tabindex", "0");
    expect(cols[0]).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(cols[1]);
    // Moving is not editing.
    expect(baseProps.onUpdateVelocity).not.toHaveBeenCalled();

    fireEvent.keyDown(cols[1], { key: "End" });
    expect(columns(container)[3]).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(columns(container)[3], { key: "ArrowRight" });
    expect(columns(container)[3]).toHaveAttribute("tabindex", "0");
  });

  it("leaves the keys it does not own alone", () => {
    const { container } = renderLane();
    const first = columns(container)[0];
    for (const event of [
      { key: "Enter" },
      { key: " " },
      { key: "Delete" },
      { key: "Tab" },
      { key: "a" },
      { key: "ArrowUp", metaKey: true },
      { key: "ArrowUp", ctrlKey: true },
    ]) {
      fireEvent.keyDown(first, event);
    }
    expect(baseProps.onUpdateVelocity).not.toHaveBeenCalled();
    expect(columns(container)[0]).toHaveAttribute("tabindex", "0");
  });
});
