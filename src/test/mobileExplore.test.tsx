/**
 * 探索 (the explore module, M6).
 *
 * Three sub-pages that each *do* something: fire the kick, audition a progression, or drop a lane out
 * of the groove that is playing. The tests mock the two audio engines (the module is not the place to
 * assert how a kick sounds) and pin the behaviour the user can see.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileExploreScreen } from "../mobile/screens/MobileExploreScreen";
import { POPULAR_PROGRESSION_CATEGORIES, POPULAR_PROGRESSIONS } from "../data/popularProgressions";
import { ALL_GENRES } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import type { Genre } from "../types/genre";

const kick = vi.hoisted(() => ({
  trigger: vi.fn(),
  setParams: vi.fn(),
  getParams: vi.fn(() => ({
    softness: 0.5,
    grit: 0.5,
    rumble: 0.5,
    subMute: false,
    thumpMute: false,
    clickMute: false,
  })),
}));

const chord = vi.hoisted(() => ({
  initAudioContext: vi.fn(),
  setTimbre: vi.fn(),
  setStyle: vi.fn(),
  setBpm: vi.fn(),
  setLoop: vi.fn(),
  startProgression: vi.fn(),
  stop: vi.fn(),
  panic: vi.fn(),
}));

vi.mock("../audio/AnatomyKickEngine", async () => {
  const actual = await vi.importActual<typeof import("../audio/AnatomyKickEngine")>(
    "../audio/AnatomyKickEngine"
  );
  return { ...actual, globalAnatomyKickEngine: kick };
});

vi.mock("../audio/ChordAudioEngine", () => ({
  ChordAudioEngine: vi.fn(() => chord),
}));

const renderExplore = (overrides: Partial<React.ComponentProps<typeof MobileExploreScreen>> = {}) => {
  const spies = {
    onTogglePlay: vi.fn<(genre: Genre) => void>(),
    onApplyPattern: vi.fn(),
  };
  const utils = render(
    <LanguageProvider>
      <MobileExploreScreen genreId="deep-house" isPlaying={false} {...spies} {...overrides} />
    </LanguageProvider>
  );
  return { ...utils, spies };
};

describe("explore module", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
    kick.trigger.mockReset();
    kick.setParams.mockReset();
    chord.startProgression.mockReset();
    chord.panic.mockReset();
  });

  it("opens on 底鼓设计 and switches sub-pages", () => {
    renderExplore();
    expect(screen.getByTestId("mobile-explore-kick")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-explore-tab-kick")).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByTestId("mobile-explore-tab-chords"));
    expect(screen.getByTestId("mobile-explore-chords")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-explore-kick")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mobile-explore-tab-groove"));
    expect(screen.getByTestId("mobile-explore-groove")).toBeInTheDocument();
  });

  it("fires the kick and toggles its three layers", () => {
    renderExplore();
    fireEvent.click(screen.getByTestId("mobile-explore-kick-fire"));
    expect(kick.trigger).toHaveBeenCalledTimes(1);

    const sub = screen.getByTestId("mobile-explore-kick-layer-sub");
    expect(sub).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(sub);
    // The engine's layers are mute switches, so turning a layer off writes `subMute: true`.
    expect(kick.setParams).toHaveBeenCalledWith(expect.objectContaining({ subMute: true }));
  });

  it("sets a feel value to the step that was tapped", () => {
    renderExplore();
    fireEvent.click(screen.getByTestId("mobile-explore-kick-softness-4"));
    expect(kick.setParams).toHaveBeenCalledWith(expect.objectContaining({ softness: 1 }));
    fireEvent.click(screen.getByTestId("mobile-explore-kick-grit-0"));
    expect(kick.setParams).toHaveBeenCalledWith(expect.objectContaining({ grit: 0 }));
  });

  it("applies a preset and plays it immediately", () => {
    renderExplore();
    const preset = screen.getAllByTestId(/^mobile-explore-kick-preset-/)[0];
    fireEvent.click(preset);
    expect(kick.setParams).toHaveBeenCalled();
    expect(kick.trigger).toHaveBeenCalledTimes(1);
  });

  it("auditions a progression through the chord engine, in its own key and feel", () => {
    renderExplore();
    fireEvent.click(screen.getByTestId("mobile-explore-tab-chords"));
    const first = POPULAR_PROGRESSIONS[0];
    fireEvent.click(screen.getByTestId(`mobile-explore-chord-play-${first.id}`));

    expect(chord.initAudioContext).toHaveBeenCalled();
    expect(chord.setTimbre).toHaveBeenCalledWith(first.suggestedTimbre);
    expect(chord.setStyle).toHaveBeenCalledWith(first.suggestedStyle);
    expect(chord.setBpm).toHaveBeenCalledWith(first.suggestedBpm);
    expect(chord.startProgression).toHaveBeenCalledTimes(1);
    expect(chord.startProgression.mock.calls[0][0]).toEqual(first.chords);
    expect(screen.getByTestId(`mobile-explore-chord-play-${first.id}`)).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Tapping the same one again stops it.
    fireEvent.click(screen.getByTestId(`mobile-explore-chord-play-${first.id}`));
    expect(chord.panic).toHaveBeenCalled();
  });

  it("filters the progressions by category", () => {
    renderExplore();
    fireEvent.click(screen.getByTestId("mobile-explore-tab-chords"));
    const category = POPULAR_PROGRESSION_CATEGORIES.find((entry) => entry.id === "jazz_soul_rnb")!;
    fireEvent.click(screen.getByTestId(`mobile-explore-chord-category-${category.id}`));
    const expected = POPULAR_PROGRESSIONS.filter((progression) => progression.category === category.id);
    const shown = document.querySelectorAll('[data-testid^="mobile-explore-chord-"]:not([data-testid*="play"]):not([data-testid*="category"])');
    expect(shown.length).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("drops a lane out of the groove and pushes the reduced pattern to the engine", () => {
    const { spies } = renderExplore();
    fireEvent.click(screen.getByTestId("mobile-explore-tab-groove"));

    const lane = screen.getByTestId("mobile-explore-groove-lane-kick");
    expect(lane).toHaveAttribute("aria-pressed", "true");
    spies.onApplyPattern.mockClear();

    fireEvent.click(lane);
    expect(screen.getByTestId("mobile-explore-groove-lane-kick")).toHaveAttribute("aria-pressed", "false");

    /**
     * Any call carrying the reduced pattern counts: the effect that pushes edits runs once per
     * pattern change, and asserting on "the last call" would also be asserting on render ordering.
     */
    const pushed = spies.onApplyPattern.mock.calls.map(
      (call) => call[0] as { tracks: Array<{ track_id: string; steps: boolean[] }> }
    );
    // The genre's own pattern is the reference: the kick lane must be emptied *and* every other lane
    // must be exactly as the genre authored it (this catches "dropped one lane, mangled the rest").
    const base = patternFromGenre(ALL_GENRES.find((genre) => genre.id === "deep-house")!);
    const untouched = (candidate: { tracks: Array<{ track_id: string; steps: boolean[] }> }) =>
      base.tracks
        .filter((track) => track.track_id !== "kick")
        .every((track) => {
          const other = candidate.tracks.find((item) => item.track_id === track.track_id);
          return JSON.stringify(other?.steps ?? null) === JSON.stringify(Array.from(track.steps));
        });

    expect(
      pushed.some((pattern) => {
        const kickTrack = pattern.tracks.find((track) => track.track_id === "kick");
        return kickTrack?.steps.every((step) => step === false) === true && untouched(pattern);
      }),
      "a pattern with the kick lane emptied and every other lane intact"
    ).toBe(true);
  });

  it("plays and stops the deconstructed groove through the shell's transport", () => {
    const { spies } = renderExplore();
    fireEvent.click(screen.getByTestId("mobile-explore-tab-groove"));
    fireEvent.click(screen.getByTestId("mobile-explore-groove-play"));
    expect(spies.onTogglePlay).toHaveBeenCalledTimes(1);
    expect(spies.onTogglePlay.mock.calls[0][0].id).toBe("deep-house");
  });
});
