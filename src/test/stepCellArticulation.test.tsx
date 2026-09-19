/**
 * Step cell length bar — making the genre's chord length visible (item ⑥).
 *
 * The reported symptom was "every genre's chords are the same one-cell length". The engine does
 * vary it — `stepDur × gate × CHORD_BASE_GATE × articulation.gateScale`, and the articulation
 * table spans 0.3× (stab) to 3.0× (sustain) — but the grid bar drew the raw `gate`, which is 0.8
 * for every genre's defaults, and it was hidden entirely when `gate === 0.8`. So the display
 * said "all genres are identical" while the audio did not.
 *
 * These tests pin the display against the engine's arithmetic: the bar must show the effective
 * length, mark the articulations that ring past their step, and leave non-chord roles alone.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StepCell } from "../components/sequencer/StepCell";
import { CHORD_ARTICULATIONS, CHORD_BASE_GATE } from "../audio/chordVoicing";

// `StepCell` imports the pitch picker for note names; keep the real modal out of this suite.
vi.mock("../components/sequencer/PitchPickerModal", () => ({
  midiToNoteName: (midi: number) => `NOTE_${midi}`,
}));

const baseProps = {
  trackIdx: 0,
  stepIdx: 0,
  stepVal: 1,
  velocity: 100,
  isAcc: false,
  isHatRound: false,
  isHatTriplet: false,
  ratchet: 1,
  prob: 100,
  isMelodic: true,
  midiNote: 60,
  isOutsideLoop: false,
  isPlayhead: false,
  isBarStart: false,
  isGroupStart: false,
  trackColor: "#22d3ee",
};

describe("StepCell · chord length bar", () => {
  it("shows the effective length for a chord stab (0.3x), which is under one step", () => {
    render(
      <StepCell
        {...baseProps}
        gate={0.8}
        articulationGateScale={CHORD_ARTICULATIONS.stab.gateScale}
        articulationLabel="短促"
      />
    );
    const bar = screen.getByTestId("step-length-bar");
    const expected = Math.round(0.8 * CHORD_BASE_GATE * CHORD_ARTICULATIONS.stab.gateScale * 1000) / 10; // 36%
    expect(bar.style.width).toBe(`${expected}%`);
    expect(bar.getAttribute("title")).toContain("短促");
    expect(bar.getAttribute("title")).toContain((0.8 * CHORD_BASE_GATE * CHORD_ARTICULATIONS.stab.gateScale).toFixed(2));
    // A stab does not outlast its step, so it must not carry the "rings past" marker.
    expect(screen.queryByTestId("step-length-tail")).toBeNull();
  });

  it("marks a chord that rings past its step and clamps the bar at 100%", () => {
    render(
      <StepCell
        {...baseProps}
        gate={0.8}
        articulationGateScale={CHORD_ARTICULATIONS.sustain.gateScale}
        articulationLabel="长音"
      />
    );
    const tail = screen.getByTestId("step-length-tail");
    // 0.8 × 1.5 × 3.0 = 3.6 steps: the width cannot exceed the cell, so the styling carries the
    // "it keeps ringing" information instead.
    expect(tail.style.width).toBe("100%");
    expect(tail.getAttribute("title")).toContain("3.60");
    expect(screen.queryByTestId("step-length-bar")).toBeNull();
  });

  it("distinguishes every articulation, via width below one step and the tail marker above it", () => {
    const signatures: string[] = [];
    const widths: Record<string, string> = {};
    for (const [name, definition] of Object.entries(CHORD_ARTICULATIONS)) {
      const { unmount } = render(
        <StepCell {...baseProps} gate={0.8} articulationGateScale={definition.gateScale} articulationLabel={name} />
      );
      const node = screen.queryByTestId("step-length-tail") ?? screen.queryByTestId("step-length-bar");
      // Width alone cannot separate the articulations that all ring past their step (they clamp at
      // 100%), so the signature is the marker plus the exact multiplier the tooltip states.
      signatures.push(`${node?.getAttribute("data-testid")}|${node?.getAttribute("title")}`);
      widths[name] = node?.style.width ?? "none";
      unmount();
    }
    expect(new Set(signatures).size).toBe(Object.keys(CHORD_ARTICULATIONS).length);
    // Below one step the width is a real, distinct measure of the length.
    expect(widths.stab).toBe("36%");
    expect(widths.comp).toBe("66%");
    expect(widths.strum).toBe("96%");
    // At or above one step the bar clamps and the tail marker takes over.
    expect(widths.block).toBe("100%");
    expect(widths.sustain).toBe("100%");
  });

  it("leaves a non-chord role on the raw gate, including hiding the old 0.8 default", () => {
    const { unmount } = render(<StepCell {...baseProps} gate={0.8} />);
    // Historically the bar was hidden at exactly 0.8; that behaviour is preserved for roles whose
    // length the genre does not decide.
    expect(screen.queryByTestId("step-length-bar")).toBeNull();
    expect(screen.queryByTestId("step-length-tail")).toBeNull();
    unmount();

    render(<StepCell {...baseProps} gate={0.5} />);
    expect(screen.getByTestId("step-length-bar").style.width).toBe("50%");
  });

  it("never draws a length bar on an empty or out-of-loop step", () => {
    const { unmount } = render(
      <StepCell {...baseProps} stepVal={0} gate={0.8} articulationGateScale={3} articulationLabel="长音" />
    );
    expect(screen.queryByTestId("step-length-bar")).toBeNull();
    expect(screen.queryByTestId("step-length-tail")).toBeNull();
    unmount();

    render(<StepCell {...baseProps} isOutsideLoop gate={0.8} articulationGateScale={3} articulationLabel="长音" />);
    expect(screen.queryByTestId("step-length-tail")).toBeNull();
  });
});
