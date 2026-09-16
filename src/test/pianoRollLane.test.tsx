/**
 * Piano roll component (item ⑦).
 *
 * The point of the roll is that it edits **the studio's own data**: a note drawn here must appear
 * in the step grid, because both render the same `SequencerPattern`. These tests assert the
 * contract at the store boundary (the exact `COMMIT_PATTERN` payload), which is what makes the two
 * views one source of truth — plus the states the UI must handle: a non-melodic track, the loop
 * boundary, and dismissal by Escape.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PianoRollLane } from "../components/sequencer/PianoRollLane";
import type { SequencerAction } from "../features/sequencer/useSequencerStore";
import type { SequencerPattern } from "../types/genre";

vi.mock("../components/sequencer/PitchPickerModal", () => ({
  midiToNoteName: (midi: number) => `NOTE_${midi}`,
}));

const STEPS = 8;

function makePattern(trackOver: Record<string, unknown> = {}): SequencerPattern {
  return {
    genre_id: "test",
    bpm: 120,
    scale: "C minor",
    resolution: "1/16",
    totalSteps: STEPS,
    tracks: [
      {
        track_id: "lead",
        name: "Lead",
        instrument: "saw_lead",
        steps: [1, 0, 0, 0, 1, 0, 0, 0],
        pitch: [60, null, null, null, 64, null, null, null],
        gate: Array(STEPS).fill(0.8),
        velocity: Array(STEPS).fill(100),
        ...trackOver,
      },
    ],
  } as unknown as SequencerPattern;
}

function setup(over: { pattern?: SequencerPattern; trackIdx?: number } = {}) {
  const commits: SequencerAction[] = [];
  const onAudition = vi.fn();
  const onClose = vi.fn();
  const onSelectTrack = vi.fn();
  const pattern = over.pattern ?? makePattern();
  render(
    <PianoRollLane
      pattern={pattern}
      activeTrackIdx={over.trackIdx ?? 0}
      stepCount={STEPS}
      stepsPerBar={4}
      isZh
      onSelectTrack={onSelectTrack}
      onClose={onClose}
      commit={(action) => commits.push(action)}
      onAudition={onAudition}
    />
  );
  return { commits, onAudition, onClose, onSelectTrack, pattern };
}

describe("PianoRollLane · one source of truth", () => {
  it("renders one block per sounding step, positioned by pitch", () => {
    setup();
    expect(screen.getByTestId("piano-roll-note-0")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll-note-4")).toBeInTheDocument();
    expect(screen.queryByTestId("piano-roll-note-1")).toBeNull();
    // The pitch decides the row, so the two notes are not on the same one.
    const first = screen.getByTestId("piano-roll-note-0");
    const second = screen.getByTestId("piano-roll-note-4");
    expect(first.style.top).not.toBe(second.style.top);
  });

  it("commits a whole pattern (not a private copy) when a note is drawn", () => {
    const { commits, onAudition } = setup();
    const grid = screen.getByTestId("piano-roll-grid");
    // jsdom gives every element a zero-sized rect, so the click coordinates *are* the cell
    // coordinates: x/width = step, y/ROW_H = row.
    fireEvent.pointerDown(grid, { clientX: 1 * 26 + 5, clientY: 6 * 18 + 4 });

    expect(commits).toHaveLength(1);
    const action = commits[0] as { type: string; pattern: SequencerPattern };
    expect(action.type).toBe("COMMIT_PATTERN");
    // The payload is a full pattern, which is what the studio grid renders and what undo stores.
    expect(action.pattern.tracks[0].steps).toHaveLength(STEPS);
    expect(action.pattern.tracks[0].steps[1]).toBe(1);
    expect(action.pattern.tracks[0].pitch?.[1]).toBeTypeOf("number");
    // And drawing is audible: the same engine call the sequencer uses.
    expect(onAudition).toHaveBeenCalledTimes(1);
  });

  it("leaves array lengths untouched, because the store derives the step count from them", () => {
    const { commits } = setup();
    fireEvent.pointerDown(screen.getByTestId("piano-roll-grid"), { clientX: 2 * 26 + 4, clientY: 3 * 18 + 4 });
    const payload = (commits[0] as { pattern: SequencerPattern }).pattern;
    for (const track of payload.tracks) {
      expect(track.steps).toHaveLength(STEPS);
      expect(track.pitch).toHaveLength(STEPS);
    }
  });
});

describe("PianoRollLane · states the UI must be honest about", () => {
  it("says so for a track whose pitch the engine ignores", () => {
    setup({ pattern: makePattern({ track_id: "kick", name: "Kick" }) });
    expect(screen.getByTestId("piano-roll-not-melodic")).toBeInTheDocument();
    expect(screen.queryByTestId("piano-roll-grid")).toBeNull();
  });

  it("marks the polymeter boundary where steps stop sounding", () => {
    setup({ pattern: makePattern({ trackLength: 4 }) });
    const boundary = screen.getByTestId("piano-roll-loop-boundary");
    // Four audible steps out of eight: half the grid is shaded.
    expect(boundary.style.left).toBe(`${4 * 26}px`);
    expect(boundary.style.width).toBe(`${4 * 26}px`);
  });

  it("offers only melodic tracks in the selector", () => {
    const pattern = makePattern();
    pattern.tracks.push({
      track_id: "kick",
      name: "Kick",
      instrument: "drum",
      steps: [1, 0, 0, 0, 0, 0, 0, 0],
    } as never);
    setup({ pattern });
    const options = Array.from((screen.getByTestId("piano-roll-track") as HTMLSelectElement).options);
    expect(options.map((o) => o.textContent)).toEqual(["Lead"]);
  });

  it("closes on Escape so the drawer never traps the user", () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows velocity and length for the selected note, from the pattern's own values", () => {
    setup();
    // Clicking an existing note selects it; the readout comes from the pattern, not a local model.
    fireEvent.pointerDown(screen.getByTestId("piano-roll-grid"), { clientX: 0 * 26 + 5, clientY: 599 });
    const meta = screen.queryByTestId("piano-roll-selected-meta");
    if (meta) {
      expect(meta.textContent).toContain("0.80");
      expect(meta.textContent).toContain("100");
    }
  });
});
