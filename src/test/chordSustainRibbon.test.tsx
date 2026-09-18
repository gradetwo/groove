import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackRow } from "../components/sequencer/TrackRow";
import { DEMO_TRACKS_CONFIG } from "../components/sequencer/trackConfig";
import { LanguageProvider } from "../i18n/LanguageContext";

describe("TrackRow chord sustain ribbon and duration switching", () => {
  const meta = DEMO_TRACKS_CONFIG[5]; // Chords track metadata

  it("renders DAW-grade sustain ribbon spanning across 16 steps when gate = 16", () => {
    const steps = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const gate = [16, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8];
    const pitches = [[60, 64, 67], null, null, null, null, null, null, null, null, null, null, null, null, null, null, null];

    const track = {
      name: "Chords",
      track_id: "chords",
      instrument: "piano_lead",
      steps,
      gate,
      pitches,
      pitch: [60],
      velocity: [100],
    };

    render(
      <LanguageProvider>
        <TrackRow
          track={track as any}
          trackIdx={5}
          meta={meta}
          isSolo={false}
          isMute={false}
          isSilenced={false}
          isHatTrack={false}
          stepCount={16}
          stepsPerBar={16}
          groupSize={4}
          isVelocityLaneOpen={false}
          isVelocityActiveTrack={false}
          isZh={true}
          onAudition={vi.fn()}
          onCycleLength={vi.fn()}
          onToggleMute={vi.fn()}
          onToggleSolo={vi.fn()}
          onChangeVolume={vi.fn()}
          onOpenVelocity={vi.fn()}
          onOpenInspector={vi.fn()}
          onOpenPianoRoll={vi.fn()}
          isInspectorOpen={false}
          onShiftTrack={vi.fn()}
          onSmartFill={vi.fn()}
          onClearTrack={vi.fn()}
          onMoveUp={vi.fn()}
          onMoveDown={vi.fn()}
          canMoveUp={true}
          canMoveDown={true}
          onChangePan={vi.fn()}
          onChangeSwing={vi.fn()}
        />
      </LanguageProvider>
    );

    // Step 0 is the trigger cell (has sustain follower connector)
    const step0 = screen.getByTestId("step-cell-5-0");
    expect(step0).toBeInTheDocument();
    expect(step0.getAttribute("data-active")).toBe("true");

    // Steps 1 to 15 are sustain tail cells
    const tails = screen.getAllByTestId("chord-sustain-tail");
    expect(tails).toHaveLength(15);

    // Step 15 has the terminal tie symbol "┤"
    const step15 = screen.getByTestId("step-cell-5-15");
    expect(step15).toHaveTextContent("┤");

    // Steps 1-14 have tie symbol "─"
    const step1 = screen.getByTestId("step-cell-5-1");
    expect(step1).toHaveTextContent("─");
  });

  it("truncates sustain tail when another chord triggers at step 8", () => {
    const steps = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
    const gate = [16, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8];

    const track = {
      name: "Chords",
      track_id: "chords",
      instrument: "piano_lead",
      steps,
      gate,
      pitch: [60, null, null, null, null, null, null, null, 65],
    };

    render(
      <LanguageProvider>
        <TrackRow
          track={track as any}
          trackIdx={5}
          meta={meta}
          isSolo={false}
          isMute={false}
          isSilenced={false}
          isHatTrack={false}
          stepCount={16}
          stepsPerBar={16}
          groupSize={4}
          isVelocityLaneOpen={false}
          isVelocityActiveTrack={false}
          isZh={true}
          onAudition={vi.fn()}
          onCycleLength={vi.fn()}
          onToggleMute={vi.fn()}
          onToggleSolo={vi.fn()}
          onChangeVolume={vi.fn()}
          onOpenVelocity={vi.fn()}
          onOpenInspector={vi.fn()}
          onOpenPianoRoll={vi.fn()}
          isInspectorOpen={false}
          onShiftTrack={vi.fn()}
          onSmartFill={vi.fn()}
          onClearTrack={vi.fn()}
          onMoveUp={vi.fn()}
          onMoveDown={vi.fn()}
          canMoveUp={true}
          canMoveDown={true}
          onChangePan={vi.fn()}
          onChangeSwing={vi.fn()}
        />
      </LanguageProvider>
    );

    // Step 7 ends the first chord's sustain
    const step7 = screen.getByTestId("step-cell-5-7");
    expect(step7).toHaveTextContent("┤");

    // Step 8 is a trigger cell
    const step8 = screen.getByTestId("step-cell-5-8");
    expect(step8.getAttribute("data-active")).toBe("true");

    // Step 15 ends the second chord's sustain (step 8 + 8 = 16, so steps 9-15 are 7 tail steps)
    const step15 = screen.getByTestId("step-cell-5-15");
    expect(step15).toHaveTextContent("┤");

    // Total tail steps = 7 (steps 1-7) + 7 (steps 9-15) = 14
    const tails = screen.getAllByTestId("chord-sustain-tail");
    expect(tails).toHaveLength(14);
  });

  it("cycles chord duration via interactive button and triggers onSetChordDuration", () => {
    const steps = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const gate = [16, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8];

    const track = {
      name: "Chords",
      track_id: "chords",
      instrument: "piano_lead",
      steps,
      gate,
    };

    const handleSetDuration = vi.fn();

    render(
      <LanguageProvider>
        <TrackRow
          track={track as any}
          trackIdx={5}
          meta={meta}
          isSolo={false}
          isMute={false}
          isSilenced={false}
          isHatTrack={false}
          stepCount={16}
          stepsPerBar={16}
          groupSize={4}
          isVelocityLaneOpen={false}
          isVelocityActiveTrack={false}
          isZh={true}
          onAudition={vi.fn()}
          onCycleLength={vi.fn()}
          onToggleMute={vi.fn()}
          onToggleSolo={vi.fn()}
          onChangeVolume={vi.fn()}
          onOpenVelocity={vi.fn()}
          onOpenInspector={vi.fn()}
          onOpenPianoRoll={vi.fn()}
          isInspectorOpen={false}
          onShiftTrack={vi.fn()}
          onSmartFill={vi.fn()}
          onClearTrack={vi.fn()}
          onMoveUp={vi.fn()}
          onMoveDown={vi.fn()}
          canMoveUp={true}
          canMoveDown={true}
          onChangePan={vi.fn()}
          onChangeSwing={vi.fn()}
          onSetChordDuration={handleSetDuration}
        />
      </LanguageProvider>
    );

    const btn = screen.getByTestId("chord-duration-button-5");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("4拍");

    // Click to cycle: 16 -> 8 (2 beats)
    fireEvent.click(btn);
    expect(handleSetDuration).toHaveBeenCalledWith(5, 8);
  });
});
