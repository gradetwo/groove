/**
 * 即兴 (the jam module, M4).
 *
 * The screen's contract: edit the groove, hear it, and put the tempo where a thumb can reach it.
 * Everything here is driven through the props the shell hands in, so the tests need no audio and no
 * engine — the two things that make an editor like this hard to test.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileJamScreen } from "../mobile/screens/MobileJamScreen";
import { ALL_GENRES } from "../data/genres";
import type { Genre, SequencerPattern } from "../types/genre";

const GENRE = ALL_GENRES.find((genre) => genre.id === "deep-house") ?? ALL_GENRES[0];

const renderJam = (
  overrides: { genreId?: string; isPlaying?: boolean; readClock?: () => { step: number; fraction: number } } = {}
) => {
  // Typed spies, kept out of the props object so the assertions can read their call arguments.
  const spies = {
    onTogglePlay: vi.fn<(genre: Genre) => void>(),
    onApplyPattern: vi.fn<(pattern: SequencerPattern) => void>(),
    onTempo: vi.fn<(bpm: number) => void>(),
    onSwing: vi.fn<(swing: number) => void>(),
    onOpenGenre: vi.fn<(genreId: string) => void>(),
  };
  const props = {
    genreId: GENRE.id,
    isPlaying: false,
    readClock: () => ({ step: 4, fraction: 0 }),
    ...spies,
    ...overrides,
  };
  const utils = render(
    <LanguageProvider>
      <MobileJamScreen {...props} />
    </LanguageProvider>
  );
  return { ...utils, props, spies };
};

describe("jam module", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
  });

  it("renders four lanes of sixteen steps", () => {
    renderJam();
    for (let lane = 0; lane < 4; lane += 1) {
      for (let step = 0; step < 16; step += 1) {
        expect(screen.getByTestId(`mobile-jam-step-${lane}-${step}`)).toBeInTheDocument();
      }
    }
    expect(screen.getByTestId("mobile-jam-grid")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-jam-tempo")).toBeInTheDocument();
  });

  it("toggles a step and pushes the edited pattern to the engine", () => {
    const { spies } = renderJam();
    const step = screen.getByTestId("mobile-jam-step-0-0");
    const before = step.getAttribute("aria-pressed");
    fireEvent.click(step);
    expect(screen.getByTestId("mobile-jam-step-0-0").getAttribute("aria-pressed")).not.toBe(before);
    expect(spies.onApplyPattern).toHaveBeenCalled();
    const lastPattern = spies.onApplyPattern.mock.calls.at(-1)?.[0] as SequencerPattern;
    const kick = lastPattern.tracks.find((track) => track.track_id === "kick");
    expect(Boolean(kick?.steps[0])).toBe(before !== "true");
  });

  it("resets the groove back to the genre's own pattern", () => {
    renderJam();
    const step = screen.getByTestId("mobile-jam-step-0-0");
    const original = step.getAttribute("aria-pressed");
    fireEvent.click(step);
    expect(screen.getByTestId("mobile-jam-step-0-0").getAttribute("aria-pressed")).not.toBe(original);

    fireEvent.click(screen.getByTestId("mobile-jam-reset"));
    expect(screen.getByTestId("mobile-jam-step-0-0").getAttribute("aria-pressed")).toBe(original);
  });

  it("plays and stops through the shell's transport", () => {
    const { spies, unmount } = renderJam();
    fireEvent.click(screen.getByTestId("mobile-jam-play"));
    expect(spies.onTogglePlay).toHaveBeenCalledTimes(1);
    expect(spies.onTogglePlay.mock.calls[0][0].id).toBe(GENRE.id);
    unmount();

    renderJam({ isPlaying: true });
    expect(screen.getByTestId("mobile-jam-play")).toHaveAttribute("aria-pressed", "true");
  });

  it("arms recording, and a pad then writes the step under the playhead", () => {
    renderJam();
    expect(screen.queryByTestId("mobile-jam-record-hint")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mobile-jam-record"));
    expect(screen.getByTestId("mobile-jam-record")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("mobile-jam-record-hint")).toBeInTheDocument();

    // `readClock` reports step 4, so the kick pad writes step 4 of lane 0.
    const target = screen.getByTestId("mobile-jam-step-0-4");
    const before = target.getAttribute("aria-pressed");
    fireEvent.click(screen.getByTestId("mobile-jam-pad-kick"));
    expect(screen.getByTestId("mobile-jam-step-0-4").getAttribute("aria-pressed")).not.toBe(before);
  });

  it("keeps the tempo inside its documented range and tells the engine", () => {
    const { spies } = renderJam();
    const bpm = () => Number((screen.getByTestId("mobile-jam-bpm").textContent ?? "").replace(/[^0-9]/g, ""));
    const start = bpm();
    fireEvent.click(screen.getByTestId("mobile-jam-bpm-up"));
    expect(bpm()).toBe(start + 2);
    expect(spies.onTempo).toHaveBeenLastCalledWith(start + 2);

    for (let i = 0; i < 60; i += 1) fireEvent.click(screen.getByTestId("mobile-jam-bpm-up"));
    expect(bpm()).toBe(180);
    for (let i = 0; i < 120; i += 1) fireEvent.click(screen.getByTestId("mobile-jam-bpm-down"));
    expect(bpm()).toBe(60);
  });

  it("sets swing and reports it as a 0..1 fraction", () => {
    const { spies } = renderJam();
    fireEvent.click(screen.getByTestId("mobile-jam-swing-30"));
    expect(screen.getByTestId("mobile-jam-swing-value").textContent).toContain("30%");
    expect(spies.onSwing).toHaveBeenLastCalledWith(0.3);
  });

  it("opens the backing genre's page from the header", () => {
    const { spies } = renderJam();
    fireEvent.click(screen.getByTestId("mobile-jam-genre"));
    expect(spies.onOpenGenre).toHaveBeenCalledWith(GENRE.id);
  });
});
