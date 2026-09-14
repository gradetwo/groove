import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CompareView } from "../views/CompareView";
import { LanguageProvider } from "../i18n/LanguageContext";
import { loadGenre } from "../data/index/loader";
import type { Genre } from "../types/genre";

// The view drives real AudioEngine auditions; keep WebAudio out of jsdom.
vi.mock("../audio/AudioEngine", () => ({
  AudioEngine: vi.fn().mockImplementation(() => ({
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    setSwing: vi.fn(),
    setTimeSignature: vi.fn(),
    setResolution: vi.fn(),
    setTrackState: vi.fn(),
    getAnalyser: vi.fn(() => null),
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    destroy: vi.fn(),
    getIsPlaying: vi.fn(() => false),
  })),
}));

/**
 * Acceptance test for the reported bug: the "classic matchup" preset buttons in
 * CompareView did nothing at all for the Synthwave/Industrial and Nu-Disco/Funk
 * pairs, because their hardcoded genre ids did not exist and the handler returned
 * silently. This asserts the user-visible outcome: the compared pair actually changes.
 */
// CompareView is a heavy view (it resolves the genre catalog on mount) and the full
// suite runs these files in parallel, so jsdom lands well past testing-library's
// 1s default. Bound every async signal explicitly and give each test head-room —
// this view's tests flaked under `vitest run --coverage` before these were added.
const ASYNC_TIMEOUT = 10000;
const TEST_TIMEOUT = 40000;

async function initialPair(): Promise<Genre[]> {
  const a = await loadGenre("chicago-house");
  const b = await loadGenre("detroit-techno");
  return [a!, b!];
}

describe("CompareView classic matchup presets (click path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("swaps the compared pair when clicking 'Nu-Disco vs Funk'", async () => {
    const pair = await initialPair();
    render(
      <LanguageProvider>
        <CompareView initialGenres={pair} onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    const presetButton = await screen.findByRole(
      "button",
      { name: /Nu-Disco 对决 Funk|Nu-Disco vs Funk/i },
      { timeout: ASYNC_TIMEOUT }
    );
    fireEvent.click(presetButton);

    await waitFor(
      () => {
        expect(screen.getAllByText(/Nu-Disco House/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/^Funk$/i).length).toBeGreaterThan(0);
      },
      { timeout: ASYNC_TIMEOUT }
    );

    // And the previously compared pair is gone.
    await waitFor(
      () => {
        expect(screen.queryByText(/Chicago House/i)).toBeNull();
      },
      { timeout: ASYNC_TIMEOUT }
    );
  }, TEST_TIMEOUT);

  it("swaps the compared pair when clicking 'Synthwave vs Industrial Techno'", async () => {
    const pair = await initialPair();
    render(
      <LanguageProvider>
        <CompareView initialGenres={pair} onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    const presetButton = await screen.findByRole(
      "button",
      { name: /Synthwave 对决 Industrial Techno|Synthwave vs Industrial Techno/i },
      { timeout: ASYNC_TIMEOUT }
    );
    fireEvent.click(presetButton);

    await waitFor(
      () => {
        expect(screen.getAllByText(/^Synthwave$/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Industrial Techno/i).length).toBeGreaterThan(0);
      },
      { timeout: ASYNC_TIMEOUT }
    );
  }, TEST_TIMEOUT);

  it("keeps working for a preset whose ids were already correct", async () => {
    const pair = await initialPair();
    render(
      <LanguageProvider>
        <CompareView initialGenres={pair} onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    const presetButton = await screen.findByRole(
      "button",
      { name: /House 对决 Techno|House vs Techno/i },
      { timeout: ASYNC_TIMEOUT }
    );
    fireEvent.click(presetButton);

    await waitFor(
      () => {
        expect(screen.getAllByText(/Chicago House/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Detroit Techno/i).length).toBeGreaterThan(0);
      },
      { timeout: ASYNC_TIMEOUT }
    );
  }, TEST_TIMEOUT);

  it("renders every preset as an enabled, clickable button", async () => {
    const pair = await initialPair();
    render(
      <LanguageProvider>
        <CompareView initialGenres={pair} onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    const presets = await screen.findAllByRole("button", { name: /对决|vs/i }, { timeout: ASYNC_TIMEOUT });
    expect(presets.length).toBeGreaterThanOrEqual(3);
    for (const button of presets) {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    }
    // Sanity: the preset row is present and addressable.
    expect(within(document.body).getByText(/经典预设对比|Presets/i)).toBeTruthy();
  }, TEST_TIMEOUT);
});
