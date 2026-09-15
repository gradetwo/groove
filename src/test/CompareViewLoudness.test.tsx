import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CompareView } from "../views/CompareView";
import { LanguageProvider } from "../i18n/LanguageContext";
import { loadGenre } from "../data/index/loader";
import { GENRE_MIX, GENRE_MIX_RESOLVED } from "../data/genreMix";
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

async function initialPair(): Promise<Genre[]> {
  const a = await loadGenre("chicago-house");
  const b = await loadGenre("punk-rock");
  return [a!, b!];
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
    const pair = await initialPair();
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
});
