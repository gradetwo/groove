import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MusicalTypingModal } from "../components/sequencer/MusicalTypingModal";
import type { SequencerPattern } from "../types/genre";

const mockPattern: SequencerPattern = {
  genre_id: "synthwave",
  bpm: 120,
  scale: "C minor",
  resolution: "1/16",
  totalSteps: 16,
  tracks: [
    {
      track_id: "bass",
      name: "Synth Bass",
      instrument: "analog_bass",
      steps: [1, 0, 0, 0],
      velocity: [100, 100, 100, 100],
    },
    {
      track_id: "chords",
      name: "Poly Chords",
      instrument: "poly_synth",
      steps: [1, 0, 0, 0],
      velocity: [100, 100, 100, 100],
    },
  ],
};

describe("MusicalTypingModal", () => {
  it("does not render when isOpen is false", () => {
    render(
      <MusicalTypingModal
        isOpen={false}
        onClose={vi.fn()}
        pattern={mockPattern}
        activeTrackIdx={0}
        onSelectTrack={vi.fn()}
        onAudition={vi.fn()}
        isZh={false}
      />
    );
    expect(screen.queryByTestId("musical-typing-modal")).toBeNull();
  });

  it("renders when isOpen is true with track selector and keys", () => {
    render(
      <MusicalTypingModal
        isOpen={true}
        onClose={vi.fn()}
        pattern={mockPattern}
        activeTrackIdx={0}
        onSelectTrack={vi.fn()}
        onAudition={vi.fn()}
        isZh={false}
      />
    );
    expect(screen.getByTestId("musical-typing-modal")).toBeInTheDocument();
    expect(screen.getByTestId("musical-typing-track-select")).toHaveValue("0");
    expect(screen.getByTestId("musical-key-a")).toBeInTheDocument();
    expect(screen.getByTestId("musical-key-w")).toBeInTheDocument();
  });

  it("switches track when track selector is changed", () => {
    const onSelectTrack = vi.fn();
    render(
      <MusicalTypingModal
        isOpen={true}
        onClose={vi.fn()}
        pattern={mockPattern}
        activeTrackIdx={0}
        onSelectTrack={onSelectTrack}
        onAudition={vi.fn()}
        isZh={false}
      />
    );

    fireEvent.change(screen.getByTestId("musical-typing-track-select"), {
      target: { value: "1" },
    });
    expect(onSelectTrack).toHaveBeenCalledWith(1);
  });

  it("triggers audition on mouse/touch click on key", () => {
    const onAudition = vi.fn();
    render(
      <MusicalTypingModal
        isOpen={true}
        onClose={vi.fn()}
        pattern={mockPattern}
        activeTrackIdx={0}
        onSelectTrack={vi.fn()}
        onAudition={onAudition}
        isZh={false}
      />
    );

    // Click white key 'a' (C4 = 60 by default with baseOctave 4)
    fireEvent.pointerDown(screen.getByTestId("musical-key-a"));
    expect(onAudition).toHaveBeenCalledWith(0, 60, 100, 0.9);
  });

  it("plays notes on computer keyboard keydown (A=C4, W=C#4)", () => {
    const onAudition = vi.fn();
    render(
      <MusicalTypingModal
        isOpen={true}
        onClose={vi.fn()}
        pattern={mockPattern}
        activeTrackIdx={0}
        onSelectTrack={vi.fn()}
        onAudition={onAudition}
        isZh={false}
      />
    );

    // Press 'a' key
    fireEvent.keyDown(window, { key: "a" });
    expect(onAudition).toHaveBeenCalledWith(0, 60, 100, 0.9);

    // Press 'w' key
    fireEvent.keyDown(window, { key: "w" });
    expect(onAudition).toHaveBeenCalledWith(0, 61, 100, 0.9);
  });

  it("shifts octave up with 'x' and down with 'z'", () => {
    const onAudition = vi.fn();
    render(
      <MusicalTypingModal
        isOpen={true}
        onClose={vi.fn()}
        pattern={mockPattern}
        activeTrackIdx={0}
        onSelectTrack={vi.fn()}
        onAudition={onAudition}
        isZh={false}
      />
    );

    // Press 'x' to shift octave up from C4 to C5
    fireEvent.keyDown(window, { key: "x" });
    expect(screen.getByTestId("musical-typing-octave-display")).toHaveTextContent("C5");

    // Now pressing 'a' should play C5 (72)
    fireEvent.keyDown(window, { key: "a" });
    expect(onAudition).toHaveBeenCalledWith(0, 72, 100, 0.9);

    // Press 'z' to shift octave down back to C4
    fireEvent.keyDown(window, { key: "z" });
    expect(screen.getByTestId("musical-typing-octave-display")).toHaveTextContent("C4");
  });

  it("adjusts velocity with 'v' and 'c'", () => {
    const onAudition = vi.fn();
    render(
      <MusicalTypingModal
        isOpen={true}
        onClose={vi.fn()}
        pattern={mockPattern}
        activeTrackIdx={0}
        onSelectTrack={vi.fn()}
        onAudition={onAudition}
        isZh={false}
      />
    );

    // Press 'v' to increase velocity by 16 (100 -> 116)
    fireEvent.keyDown(window, { key: "v" });
    expect(screen.getByTestId("musical-typing-velocity-display")).toHaveTextContent("116");

    // Press 'a' to play with 116 velocity
    fireEvent.keyDown(window, { key: "a" });
    expect(onAudition).toHaveBeenCalledWith(0, 60, 116, 0.9);
  });

  it("plays chord stack when chord mode is toggled", () => {
    const onAudition = vi.fn();
    render(
      <MusicalTypingModal
        isOpen={true}
        onClose={vi.fn()}
        pattern={mockPattern}
        activeTrackIdx={1}
        onSelectTrack={vi.fn()}
        onAudition={onAudition}
        isZh={false}
      />
    );

    // Click Chord Mode toggle
    const chordToggle = screen.getByTestId("musical-typing-chord-toggle");
    fireEvent.click(chordToggle);

    // Press 'a' key -> should trigger chord voices
    fireEvent.keyDown(window, { key: "a" });
    expect(onAudition).toHaveBeenCalled();
    expect(onAudition.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("closes modal on Escape or Alt+K", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <MusicalTypingModal
        isOpen={true}
        onClose={onClose}
        pattern={mockPattern}
        activeTrackIdx={0}
        onSelectTrack={vi.fn()}
        onAudition={vi.fn()}
        isZh={false}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Alt+K
    fireEvent.keyDown(window, { key: "k", code: "KeyK", altKey: true });
    expect(onClose).toHaveBeenCalledTimes(2);

    // Close button
    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("occupies 100% horizontal width and has z-index 9999 on top of all panels", () => {
    render(
      <MusicalTypingModal
        isOpen={true}
        onClose={vi.fn()}
        pattern={mockPattern}
        activeTrackIdx={0}
        onSelectTrack={vi.fn()}
        onAudition={vi.fn()}
        isZh={false}
      />
    );

    const modal = screen.getByTestId("musical-typing-modal");
    expect(modal).toHaveStyle({ zIndex: "9999" });

    const keybed = screen.getByTestId("musical-typing-keybed");
    expect(keybed).toHaveStyle({ width: "100%" });

    const whiteKeyA = screen.getByTestId("musical-key-a");
    expect(whiteKeyA).toHaveStyle({ flex: "1 0 auto", minWidth: "24px" });

    const blackKeyW = screen.getByTestId("musical-key-w");
    expect(blackKeyW).toHaveStyle({ transform: "translateX(-50%)" });
  });
});
