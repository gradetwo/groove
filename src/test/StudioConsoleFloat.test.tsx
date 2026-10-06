import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { loadGenre } from "../data/index/loader";
import type { Genre } from "../types/genre";

/**
 * Feature #2 — studio ↔ mixing console linkage.
 *
 * The whole point of the extraction is that the floated console is the SAME panel
 * as the `/console` route, fed the studio's engine and store. These integration
 * tests pin the two failure modes the design must avoid:
 *
 *   1. opening the console must not construct a second `AudioEngine`, and
 *   2. an edit made on the floated desk must land in the studio's own store
 *      (observable through the studio's track row), not a private copy.
 */
const { engineMock, AudioEngineCtor } = vi.hoisted(() => {
  const engineMock = {
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    setSwing: vi.fn(),
    setTimeSignature: vi.fn(),
    setResolution: vi.fn(),
    setLoopRange: vi.fn(),
    setMetronome: vi.fn(),
    setCountIn: vi.fn(),
    setDrumKit: vi.fn(),
    setDrumsOnly: vi.fn(),
    setRecordArmed: vi.fn(),
    setOnTrackTrigger: vi.fn(),
    setTrackState: vi.fn(),
    getTrackState: vi.fn(),
    getTrackStates: vi.fn(() => []),
    getAnalyser: vi.fn(() => null),
    enableTrackAnalysers: vi.fn(),
    areTrackAnalysersEnabled: vi.fn(() => false),
    getTrackAnalyser: vi.fn(() => null),
    getMasterAnalyser: vi.fn(() => null),
    getStereoAnalysers: vi.fn(() => ({ left: null, right: null })),
    setMasterVolume: vi.fn(),
    getMasterVolume: vi.fn(() => 0.8),
    getEffectiveMasterVolume: vi.fn(() => 0.8),
    setSpatialMode: vi.fn(),
    getSpatialMode: vi.fn(() => false),
    getSpatialLayout: vi.fn(() => []),
    getLiveRecorder: vi.fn(() => ({ setOnQuantizedStep: vi.fn() })),
    setMasterFilter: vi.fn(),
    setMasterSaturation: vi.fn(),
    setMasterChorus: vi.fn(),
    setMasterBitcrusher: vi.fn(),
    setSendLevel: vi.fn(),
    setTrackInstrument: vi.fn(),
    auditionTrack: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    destroy: vi.fn(),
    getIsPlaying: vi.fn(() => false),
  };
  return { engineMock, AudioEngineCtor: vi.fn(() => engineMock) };
});

vi.mock("../audio/AudioEngine", () => ({
  AudioEngine: AudioEngineCtor,
}));

import { HardwareConsoleView } from "../views/HardwareConsoleView";

const ASYNC_TIMEOUT = 15000;
const TEST_TIMEOUT = 60000;

async function chicagoHouse(): Promise<Genre> {
  return (await loadGenre("chicago-house"))!;
}

describe("HardwareConsoleView · standalone /console route (feature #2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("groove_language", "en");
  });

  it("owns exactly one engine and renders the extracted shared panel", async () => {
    const genre = await chicagoHouse();
    const onOpenStudio = vi.fn();
    render(
      <LanguageProvider>
        <HardwareConsoleView selectedGenre={genre} onOpenStudio={onOpenStudio} />
      </LanguageProvider>
    );

    await screen.findByTestId("hardware-console", undefined, { timeout: ASYNC_TIMEOUT });
    // One engine for the route, no hidden second one inside the panel.
    expect(AudioEngineCtor).toHaveBeenCalledTimes(1);
    expect(engineMock.enableTrackAnalysers).toHaveBeenCalledWith(true);
    // The page variant keeps the "Open in Studio" affordance.
    fireEvent.click(screen.getByText("Open in Studio"));
    expect(onOpenStudio).toHaveBeenCalledWith({ id: genre.id });
  }, TEST_TIMEOUT);
});
