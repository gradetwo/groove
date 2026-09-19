import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Toolbar, type ToolbarProps } from "../components/sequencer/Toolbar";
import { TrackRow } from "../components/sequencer/TrackRow";
import { PianoRollLane } from "../components/sequencer/PianoRollLane";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

const noop = () => {};

vi.mock("../components/sequencer/PitchPickerModal", () => ({
  midiToNoteName: (midi: number) => `NOTE_${midi}`,
}));

function makeToolbarProps(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    isPlaying: false,
    bpm: 128,
    swing: 0,
    timeSignature: "4/4",
    resolution: "1/16",
    stepCount: 16,
    barCount: 1,
    viewedBar: 0,
    mobileEditMode: "step",
    showAdvancedControls: false,
    isVelocityLaneOpen: false,
    isSidebarCollapsed: false,
    isEditorMaximized: false,
    canUndo: true,
    canRedo: true,
    genreName: "Deep House",
    genreAccent: "#00ffcc",
    isZh: false,
    stepsPerBar: 16,
    groupSize: 4,
    onTogglePlay: vi.fn(),
    onChangeBpm: vi.fn(),
    onChangeSwing: vi.fn(),
    onChangeTimeSignature: vi.fn(),
    onChangeResolution: vi.fn(),
    onChangeStepCount: vi.fn(),
    onChangeMobileEditMode: vi.fn(),
    onSelectBar: vi.fn(),
    onToggleVelocityLane: vi.fn(),
    onTogglePianoRoll: vi.fn(),
    isPianoRollOpen: false,
    onOpenEuclidean: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onToggleMaximize: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleAdvancedControls: vi.fn(),
    onQuickAction: vi.fn(),
    onExportMidi: vi.fn(),
    onShare: vi.fn(),
    onAddSteps: vi.fn(),
    onRemoveSteps: vi.fn(),
    onScrollByPixels: vi.fn(),
    ...overrides,
  };
}

function makeTrack(name: string, trackId: string): SequencerTrack {
  return {
    track_id: trackId,
    name,
    steps: [1, 0, 0, 0],
    velocity: [100, 100, 100, 100],
    notes: [36, 36, 36, 36],
    volume: 0.8,
    pan: 0,
    instrument: "synth",
  } as SequencerTrack;
}

function makeSamplePattern(): SequencerPattern {
  return {
    genre_id: "techno-peak",
    bpm: 120,
    scale: "minor",
    totalSteps: 16,
    tracks: [
      makeTrack("Kick", "kick"),
      makeTrack("Bass", "bass"),
    ],
  };
}

function baseTrackRowProps(overrides: Record<string, unknown> = {}) {
  return {
    track: makeTrack("Kick", "kick"),
    trackIdx: 0,
    meta: { id: "kick", name: "Kick", sub: { zh: "底鼓", en: "Kick" }, color: "#ff5964" },
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

describe("Item 8: Toolbar Logical Grouping, Capsule Pills & Compact Fold", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the three Tier 1 group pills by default, and the project group with the density on", () => {
    /**
     * G.10's slimming: the project group is Tier 2/3 (project context, exports, niche modes), so
     * the default toolbar shows three pills instead of four. The assertion is both halves — the
     * absence is as much the design as the presence, and asserting only the advanced-on state would
     * let the toolbar silently grow back to 36 visible controls.
     */
    const { unmount } = render(<Toolbar {...makeToolbarProps()} />);
    expect(screen.getByTestId("toolbar-group-transport")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-group-edit")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-group-views")).toBeInTheDocument();
    expect(screen.queryByTestId("toolbar-group-project")).not.toBeInTheDocument();
    unmount();

    render(<Toolbar {...makeToolbarProps({ showAdvancedControls: true })} />);
    expect(screen.getByTestId("toolbar-group-transport")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-group-edit")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-group-views")).toBeInTheDocument();
    expect(screen.getByTestId("toolbar-group-project")).toBeInTheDocument();
  });

  it("toggles toolbar folding and persists to localStorage", () => {
    render(<Toolbar {...makeToolbarProps()} />);
    const foldBtn = screen.getByTestId("toolbar-fold-toggle");
    expect(foldBtn).toHaveAttribute("aria-pressed", "false");

    // Click to fold
    fireEvent.click(foldBtn);
    expect(localStorage.getItem("groove_toolbar_folded")).toBe("true");
    expect(foldBtn).toHaveAttribute("aria-pressed", "true");

    // Groups 2, 3, 4 should be collapsed
    expect(screen.queryByTestId("toolbar-group-edit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toolbar-group-views")).not.toBeInTheDocument();
    expect(screen.queryByTestId("toolbar-group-project")).not.toBeInTheDocument();

    // The more menu button is present
    const moreBtn = screen.getByTestId("toolbar-more-menu-btn");
    expect(moreBtn).toBeInTheDocument();

    // Open more menu
    fireEvent.click(moreBtn);
    expect(screen.getByTestId("toolbar-more-menu")).toBeInTheDocument();

    // Re-click fold button to unfold
    fireEvent.click(foldBtn);
    expect(localStorage.getItem("groove_toolbar_folded")).toBe("false");
    expect(screen.getByTestId("toolbar-group-edit")).toBeInTheDocument();
  });
});

describe("Item 9: Track Row Fold and Type Indicator Badges", () => {
  it("renders category type badges for drum and melodic tracks", () => {
    const drumTrack = makeTrack("Kick", "kick");
    const { rerender } = render(
      <TrackRow
        {...baseTrackRowProps({
          track: drumTrack,
          trackIdx: 0,
          meta: { id: "kick", name: "Kick", sub: { zh: "底鼓", en: "Kick" }, color: "#ff5964" },
        })}
      />
    );

    const drumBadge = screen.getByTestId("track-type-0");
    expect(drumBadge).toHaveTextContent("DRUM");

    const bassTrack = makeTrack("Sub Bass", "bass");
    rerender(
      <TrackRow
        {...baseTrackRowProps({
          track: bassTrack,
          trackIdx: 4,
          meta: { id: "bass", name: "Bass", sub: { zh: "贝斯", en: "Bass" }, color: "#38bdf8" },
        })}
      />
    );

    const bassBadge = screen.getByTestId("track-type-4");
    expect(bassBadge).toHaveTextContent("BASS");
  });

  it("supports single-track fold button toggle", () => {
    const onToggleCompact = vi.fn();
    render(
      <TrackRow
        {...baseTrackRowProps({
          onToggleCompact,
        })}
      />
    );

    const foldBtn = screen.getByTestId("track-fold-0");
    fireEvent.click(foldBtn);
    expect(onToggleCompact).toHaveBeenCalledTimes(1);
  });
});

describe("Item 3: Piano Roll New, Export, and Record Features", () => {
  it("renders New, Export, and Record buttons", () => {
    const pattern = makeSamplePattern();
    render(
      <PianoRollLane
        pattern={pattern}
        activeTrackIdx={0}
        stepCount={16}
        stepsPerBar={16}
        isZh={false}
        currentStep={0}
        onSelectTrack={noop}
        onClose={noop}
        commit={vi.fn()}
        onAudition={noop}
      />
    );

    expect(screen.getByTestId("piano-roll-new-btn")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll-export-btn")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll-record-btn")).toBeInTheDocument();
  });

  it("opens confirmation dialog when clicking New clip and cancels or clears", () => {
    const pattern = makeSamplePattern();
    const commit = vi.fn();
    render(
      <PianoRollLane
        pattern={pattern}
        activeTrackIdx={0}
        stepCount={16}
        stepsPerBar={16}
        isZh={false}
        currentStep={0}
        onSelectTrack={noop}
        onClose={noop}
        commit={commit}
        onAudition={noop}
      />
    );

    fireEvent.click(screen.getByTestId("piano-roll-new-btn"));
    const confirmBtn = screen.getByTestId("piano-roll-new-confirm");
    expect(confirmBtn).toBeInTheDocument();

    // Confirm new clip
    fireEvent.click(confirmBtn);

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "COMMIT_PATTERN" })
    );
    expect(screen.queryByTestId("piano-roll-new-confirm")).not.toBeInTheDocument();
  });

  it("opens export clip dropdown with JSON, MIDI and Copy options", () => {
    const pattern = makeSamplePattern();
    render(
      <PianoRollLane
        pattern={pattern}
        activeTrackIdx={0}
        stepCount={16}
        stepsPerBar={16}
        isZh={false}
        currentStep={0}
        onSelectTrack={noop}
        onClose={noop}
        commit={vi.fn()}
        onAudition={noop}
      />
    );

    const exportBtn = screen.getByTestId("piano-roll-export-btn");
    fireEvent.click(exportBtn);

    expect(screen.getByTestId("piano-roll-export-json")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll-export-midi")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll-copy-json")).toBeInTheDocument();
  });

  it("toggles realtime recording armed state", () => {
    const pattern = makeSamplePattern();
    render(
      <PianoRollLane
        pattern={pattern}
        activeTrackIdx={0}
        stepCount={16}
        stepsPerBar={16}
        isZh={false}
        currentStep={0}
        onSelectTrack={noop}
        onClose={noop}
        commit={vi.fn()}
        onAudition={noop}
      />
    );

    const recordBtn = screen.getByTestId("piano-roll-record-btn");
    expect(recordBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(recordBtn);
    expect(recordBtn).toHaveAttribute("aria-pressed", "true");
  });
});
