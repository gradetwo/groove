/**
 * Logic-style track header (E-10 follow-up).
 *
 * The header itself opens the per-track inspector; auditioning the current timbre moved to a
 * dedicated ▶ button. These tests pin both halves so a future refactor cannot quietly
 * re-merge the two gestures and swallow one of them.
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TrackRow, type TrackMetaConfig } from "../components/sequencer/TrackRow";
import type { SequencerTrack } from "../types/genre";

// No lucide-react mock here: this suite asserts behaviour through the real DOM, and the
// memoization suite is the one that needs an icon render probe.

// StepCell pulls note names through the pitch modal; mock it so the real modal stays out of
// this suite.
vi.mock("../components/sequencer/PitchPickerModal", () => ({
  midiToNoteName: (midi: number) => `NOTE_${midi}`,
}));

const META: TrackMetaConfig = {
  id: "kick",
  name: "KICK",
  sub: { zh: "底鼓", en: "Kick" },
  color: "#ff5964",
};

function makeTrack(overrides: Partial<SequencerTrack> = {}): SequencerTrack {
  return {
    track_id: "kick",
    name: "KICK",
    steps: [1, 0, 1, 0],
    velocity: [100, 96, 100, 100],
    volume: 0.8,
    pan: 0,
    ...overrides,
  } as SequencerTrack;
}

const noop = () => {};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    track: makeTrack(),
    trackIdx: 0,
    meta: META,
    isSolo: false,
    isMute: false,
    isSilenced: false,
    isHatTrack: false,
    stepCount: 4,
    stepsPerBar: 4,
    groupSize: 4,
    isVelocityLaneOpen: false,
    isVelocityActiveTrack: false,
    isZh: false,
    onAudition: noop,
    onCycleLength: noop,
    onToggleMute: noop,
    onToggleSolo: noop,
    onChangeVolume: noop,
    onOpenVelocity: noop,
    onOpenInspector: noop,
    onShiftTrack: noop,
    onSmartFill: noop,
    onClearTrack: noop,
    ...overrides,
  } as React.ComponentProps<typeof TrackRow>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TrackRow header opens the inspector (E-10)", () => {
  it("opens the inspector when the header is clicked", () => {
    const onOpenInspector = vi.fn();
    const onAudition = vi.fn();
    render(<TrackRow {...baseProps({ onOpenInspector, onAudition })} />);

    fireEvent.click(screen.getByTestId("track-header-0"));

    expect(onOpenInspector).toHaveBeenCalledTimes(1);
    expect(onOpenInspector).toHaveBeenCalledWith(0);
    // The header no longer auditions — that gesture belongs to the ▶ button now.
    expect(onAudition).not.toHaveBeenCalled();
  });

  it("opens the inspector from the keyboard (Enter and Space)", () => {
    const onOpenInspector = vi.fn();
    render(<TrackRow {...baseProps({ onOpenInspector })} />);

    const header = screen.getByTestId("track-header-0");
    fireEvent.keyDown(header, { key: "Enter" });
    fireEvent.keyDown(header, { key: " " });

    expect(onOpenInspector).toHaveBeenCalledTimes(2);
  });

  it("ignores unrelated keys on the header", () => {
    const onOpenInspector = vi.fn();
    render(<TrackRow {...baseProps({ onOpenInspector })} />);

    fireEvent.keyDown(screen.getByTestId("track-header-0"), { key: "a" });

    expect(onOpenInspector).not.toHaveBeenCalled();
  });

  it("exposes the header as an expandable control wired to the inspector state", () => {
    const { rerender } = render(<TrackRow {...baseProps()} />);
    expect(screen.getByTestId("track-header-0")).toHaveAttribute("aria-expanded", "false");

    rerender(<TrackRow {...baseProps({ isInspectorOpen: true })} />);
    expect(screen.getByTestId("track-header-0")).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps a dedicated audition button that does not open the inspector", () => {
    const onOpenInspector = vi.fn();
    const onAudition = vi.fn();
    render(<TrackRow {...baseProps({ onOpenInspector, onAudition })} />);

    fireEvent.click(screen.getByTestId("track-audition-0"));

    expect(onAudition).toHaveBeenCalledTimes(1);
    expect(onAudition).toHaveBeenCalledWith(0, "KICK");
    expect(onOpenInspector).not.toHaveBeenCalled();
  });

  it("still opens the inspector from the explicit sliders button", () => {
    const onOpenInspector = vi.fn();
    render(<TrackRow {...baseProps({ onOpenInspector })} />);

    fireEvent.click(screen.getByTestId("track-inspector-open-0"));

    expect(onOpenInspector).toHaveBeenCalledWith(0);
  });

  it("marks only the open row as expanded", () => {
    const { container } = render(
      <>
        <TrackRow {...baseProps({ trackIdx: 0, isInspectorOpen: true })} />
        <TrackRow {...baseProps({ trackIdx: 1, isInspectorOpen: false })} />
      </>
    );

    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-testid^='track-header-']"));
    expect(rows.map((row) => row.dataset.testid)).toEqual(["track-header-0", "track-header-1"]);
    expect(rows.map((row) => row.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
  });
});
