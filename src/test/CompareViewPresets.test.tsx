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

describe("CompareView same-origin (lineage) comparison (N-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers the lineage of the compared genre and adds a relative on click", async () => {
    const pair = await initialPair();
    render(
      <LanguageProvider>
        <CompareView initialGenres={pair} onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    // Chicago House derives from Disco, so the lineage row must surface it.
    const lineageRow = await screen.findByText(/Same origin|同源对比/i, {}, { timeout: ASYNC_TIMEOUT });
    expect(lineageRow).toBeTruthy();

    // The accessible name is "from Disco" / "源自 Disco"; matching bare /Disco/i would
    // also hit the "Nu-Disco vs Funk" preset button.
    const discoChip = await screen.findByRole(
      "button",
      { name: (name: string) => /^(from|源自)\s*Disco$/i.test(name.trim()) },
      { timeout: ASYNC_TIMEOUT }
    );
    expect((discoChip as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(discoChip);

    // Disco joins the comparison pool (max four) rather than replacing the pair.
    await waitFor(
      () => {
        expect(screen.getAllByText(/^Disco$/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Chicago House/i).length).toBeGreaterThan(0);
      },
      { timeout: ASYNC_TIMEOUT }
    );
  }, TEST_TIMEOUT);
});

/**
 * The compare columns show each genre's artwork, in the skin the reader has chosen.
 *
 * Small on purpose: `GenreCover` owns the skin resolution and the fallback chain (see `genreCoverSkin.test.tsx`); what
 * this pins is that the desktop view is *wired* to it, which is the half that was missing on the phone shell for as long
 * as the covers have existed.
 */
describe("CompareView genre artwork", () => {
  it("gives each compared genre its own cover", async () => {
    const pair = await initialPair();
    render(
      <LanguageProvider>
        <CompareView initialGenres={pair} onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );
    const covers = await screen.findAllByTestId(/^compare-cover-/, {}, { timeout: ASYNC_TIMEOUT });
    expect(covers.length).toBeGreaterThanOrEqual(2);
    for (const cover of covers) {
      expect(cover.getAttribute("src")).toMatch(/^\/covers\/(default|[a-zA-Z]+)\//);
    }
  }, TEST_TIMEOUT);
});
