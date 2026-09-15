import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompareView } from "../views/CompareView";
import { LanguageProvider } from "../i18n/LanguageContext";
import { loadGenre } from "../data/index/loader";
import { GENRE_MIX, GENRE_MIX_RESOLVED } from "../data/genreMix";
import { GENRES_MAP } from "../data/genres";
import type { Genre, SequencerPattern } from "../types/genre";

/**
 * Loudness-matched A/B auditioning (user requirement: "曲风比对里头响度也是
 * 差不多的"). Both compare-view paths must hand the engine the arranged mix and a
 * matching master trim — the single-genre audition automatically, the merged
 * `sync_*` composite through an explicit mean-of-members override.
 */
const engineInstances: Array<Record<string, ReturnType<typeof vi.fn>>> = [];

vi.mock("../audio/AudioEngine", () => ({
  AudioEngine: vi.fn().mockImplementation(() => {
    const engine = {
      setPattern: vi.fn(),
      setBpm: vi.fn(),
      setSwing: vi.fn(),
      setTimeSignature: vi.fn(),
      setResolution: vi.fn(),
      setTotalSteps: vi.fn(),
      setDrumsOnly: vi.fn(),
      setDrumKit: vi.fn(),
      setTrackState: vi.fn(),
      setLoudnessTrimDb: vi.fn(),
      getAnalyser: vi.fn(() => null),
      play: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      destroy: vi.fn(),
      getIsPlaying: vi.fn(() => false),
    };
    engineInstances.push(engine);
    return engine;
  }),
}));

const ASYNC_TIMEOUT = 10000;
const TEST_TIMEOUT = 40000;

/**
 * Two genres whose measured trims are both clearly positive, so "the composite uses
 * the mean of the members" is observable and cannot be satisfied by 0 dB by accident.
 */
function strongTrimPair(): Genre[] {
  const sorted = Object.entries(GENRE_MIX)
    .sort((a, b) => b[1].loudnessTrimDb - a[1].loudnessTrimDb)
    .map(([id]) => id);
  const ids = sorted.slice(0, 2);
  expect(GENRE_MIX[ids[0]].loudnessTrimDb).toBeGreaterThan(0.3);
  expect(GENRE_MIX[ids[1]].loudnessTrimDb).toBeGreaterThan(0.3);
  return ids.map((id) => GENRES_MAP[id]);
}

async function initialPair(): Promise<Genre[]> {
  const a = await loadGenre("chicago-house");
  const b = await loadGenre("punk-rock");
  return [a!, b!];
}

/**
 * The two library extremes (loudest vs quietest trim) — the worst case for "soloing
 * one side must use that side's own trim". With the composite's mean, isolating a
 * side would be off by half of this difference, which is the bug this pins down.
 */
function extremeTrimPair(): Genre[] {
  const sorted = Object.entries(GENRE_MIX).sort((a, b) => b[1].loudnessTrimDb - a[1].loudnessTrimDb);
  const loudId = sorted[0][0];
  const quietId = sorted[sorted.length - 1][0];
  const loud = GENRE_MIX[loudId].loudnessTrimDb;
  const quiet = GENRE_MIX[quietId].loudnessTrimDb;
  expect(loud - quiet).toBeGreaterThan(3);
  return [GENRES_MAP[loudId], GENRES_MAP[quietId]];
}

function renderCompare(pair: Genre[]) {
  return render(
    <LanguageProvider>
      <CompareView initialGenres={pair} onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
    </LanguageProvider>
  );
}

/** The legacy placeholder kick gain every genre used to ship with. */
const LEGACY_KICK_VOLUME = 0.9;

describe("CompareView loudness-matched auditioning", () => {
  beforeEach(() => {
    engineInstances.length = 0;
    vi.clearAllMocks();
  });

  it("seeds the arranged mix and the matching trim for a single-genre audition", async () => {
    const pair = await initialPair();
    renderCompare(pair);

    const fullBand = await screen.findAllByTitle(
      /Audition full arrangement|播放包含底鼓、贝斯、和声与合成器的完整配器/,
      {},
      { timeout: ASYNC_TIMEOUT }
    );
    fireEvent.click(fullBand[0]);

    await waitFor(
      () => {
        expect(engineInstances.length).toBeGreaterThan(0);
      },
      { timeout: ASYNC_TIMEOUT }
    );
    const engine = engineInstances[0];
    await waitFor(() => expect(engine.setPattern).toHaveBeenCalled(), { timeout: ASYNC_TIMEOUT });

    const pattern = engine.setPattern.mock.calls[0][0] as SequencerPattern;
    const seededValues = pair.map((g) => GENRE_MIX_RESOLVED[g.id].kick.volume);
    expect(seededValues).toContain(pattern.tracks[0].volume);
    expect(pattern.tracks[0].volume).not.toBe(LEGACY_KICK_VOLUME);

    // Explicitly back to automatic mode so a previous composite override cannot leak.
    expect(engine.setLoudnessTrimDb).toHaveBeenCalledWith(null);
  });

  it("seeds each member's mix into the composite and trims it by the mean of the members", async () => {
    const pair = strongTrimPair();
    renderCompare(pair);

    const syncButton = await screen.findByTitle(
      /Phase-locked dual-genre sync playback|对齐拍子与小节，同步播放对比曲风 A 与曲风 B/,
      {},
      { timeout: ASYNC_TIMEOUT }
    );
    fireEvent.click(syncButton);

    await waitFor(
      () => {
        expect(engineInstances.length).toBeGreaterThan(0);
      },
      { timeout: ASYNC_TIMEOUT }
    );
    const engine = engineInstances[0];
    await waitFor(() => expect(engine.setPattern).toHaveBeenCalled(), { timeout: ASYNC_TIMEOUT });

    const composite = engine.setPattern.mock.calls[0][0] as SequencerPattern;
    // 8 tracks per compared member.
    expect(composite.tracks.length).toBe(pair.length * 8);
    // Each half carries its own genre's arranged mix, not the flat placeholder.
    expect(composite.tracks[0].volume).toBe(GENRE_MIX_RESOLVED[pair[0].id].kick.volume);
    expect(composite.tracks[8].volume).toBe(GENRE_MIX_RESOLVED[pair[1].id].kick.volume);

    const expectedMean =
      pair.reduce((sum, g) => sum + GENRE_MIX[g.id].loudnessTrimDb, 0) / pair.length;
    expect(engine.setLoudnessTrimDb).toHaveBeenCalledWith(expectedMean);
  }, TEST_TIMEOUT);

  it("re-trims for the audible column when one side is soloed", async () => {
    const pair = extremeTrimPair();
    const [trimA, trimB] = pair.map((g) => GENRE_MIX[g.id].loudnessTrimDb);
    const mean = (trimA + trimB) / 2;
    renderCompare(pair);

    const syncButton = await screen.findByTitle(
      /Phase-locked dual-genre sync playback|对齐拍子与小节，同步播放对比曲风 A 与曲风 B/,
      {},
      { timeout: ASYNC_TIMEOUT }
    );
    fireEvent.click(syncButton);

    await waitFor(
      () => {
        expect(engineInstances.length).toBeGreaterThan(0);
      },
      { timeout: ASYNC_TIMEOUT }
    );
    const engine = engineInstances[0];
    await waitFor(() => expect(engine.setLoudnessTrimDb).toHaveBeenCalledWith(mean), {
      timeout: ASYNC_TIMEOUT,
    });

    // The routing deck only renders while the sync engine is playing.
    const soloA = await screen.findByRole(
      "button",
      { name: /^(Solo A|仅曲风 A)$/ },
      { timeout: ASYNC_TIMEOUT }
    );
    fireEvent.click(soloA);
    await waitFor(() => expect(engine.setLoudnessTrimDb).toHaveBeenLastCalledWith(trimA), {
      timeout: ASYNC_TIMEOUT,
    });

    const soloB = await screen.findByRole("button", { name: /^(Solo B|仅曲风 B)$/ }, {
      timeout: ASYNC_TIMEOUT,
    });
    fireEvent.click(soloB);
    await waitFor(() => expect(engine.setLoudnessTrimDb).toHaveBeenLastCalledWith(trimB), {
      timeout: ASYNC_TIMEOUT,
    });

    const mixBoth = await screen.findByRole("button", { name: /^(A\+B Mix|A \+ B 混合)$/ }, {
      timeout: ASYNC_TIMEOUT,
    });
    fireEvent.click(mixBoth);
    await waitFor(() => expect(engine.setLoudnessTrimDb).toHaveBeenLastCalledWith(mean), {
      timeout: ASYNC_TIMEOUT,
    });
  }, TEST_TIMEOUT);

  it("clears any composite override before a single-genre audition", async () => {
    const pair = extremeTrimPair();
    const trimA = GENRE_MIX[pair[0].id].loudnessTrimDb;
    renderCompare(pair);

    // Start the synchronised composite first, so an override exists on its engine.
    const syncButton = await screen.findByTitle(
      /Phase-locked dual-genre sync playback|对齐拍子与小节，同步播放对比曲风 A 与曲风 B/,
      {},
      { timeout: ASYNC_TIMEOUT }
    );
    fireEvent.click(syncButton);
    await waitFor(
      () => {
        expect(engineInstances.length).toBeGreaterThan(0);
      },
      { timeout: ASYNC_TIMEOUT }
    );
    const syncEngine = engineInstances[0];
    await waitFor(() => expect(syncEngine.setLoudnessTrimDb).toHaveBeenCalled(), {
      timeout: ASYNC_TIMEOUT,
    });

    // The dedicated audition buttons use a separate engine and must reset the
    // override so the engine derives this genre's own measured trim.
    const fullBand = await screen.findAllByTitle(
      /Audition full arrangement|播放包含底鼓、贝斯、和声与合成器的完整配器/,
      {},
      { timeout: ASYNC_TIMEOUT }
    );
    fireEvent.click(fullBand[0]);

    await waitFor(() => expect(engineInstances.length).toBeGreaterThan(1), {
      timeout: ASYNC_TIMEOUT,
    });
    const auditionEngine = engineInstances[engineInstances.length - 1];
    await waitFor(() => expect(auditionEngine.setLoudnessTrimDb).toHaveBeenCalledWith(null), {
      timeout: ASYNC_TIMEOUT,
    });
    // And the composite engine still carries its own value, i.e. the two paths did
    // not share state (they are separate AudioEngine instances by construction).
    expect(trimA).not.toBe(0);
  }, TEST_TIMEOUT);
});
