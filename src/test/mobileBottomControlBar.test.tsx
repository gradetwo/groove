import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { loadGenre } from "../data/index/loader";
import type { Genre } from "../types/genre";

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

import { StudioView } from "../views/StudioView";

async function chicagoHouse(): Promise<Genre> {
  return (await loadGenre("chicago-house"))!;
}

describe("Clean Mobile Workspace & Virtual Keyboard FAB", { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("groove_language", "zh");
  });

  it("renders clean mobile workspace without redundant bottom control bar", async () => {
    const genre = await chicagoHouse();
    render(
      <LanguageProvider>
        <StudioView
          selectedGenre={genre}
          onSelectGenre={vi.fn()}
          onViewDetail={vi.fn()}
        />
      </LanguageProvider>
    );

    await waitFor(() => {
      // Redundant bottom bar is removed
      expect(screen.queryByTestId("mobile-bottom-control-bar")).toBeNull();
      // Keyboard FAB is cleanly available
      expect(screen.getByTestId("virtual-keyboard-fab")).toBeInTheDocument();
    });
  });

  it("clicks virtual keyboard FAB to open keyboard and hides FAB while open", async () => {
    const genre = await chicagoHouse();
    render(
      <LanguageProvider>
        <StudioView
          selectedGenre={genre}
          onSelectGenre={vi.fn()}
          onViewDetail={vi.fn()}
        />
      </LanguageProvider>
    );

    const fab = await screen.findByTestId("virtual-keyboard-fab");
    fireEvent.click(fab);

    // Virtual keyboard should now be open
    expect(screen.getByTestId("musical-typing-modal")).toBeInTheDocument();
    // FAB should now be hidden
    expect(screen.queryByTestId("virtual-keyboard-fab")).toBeNull();
  });

  it("toggles play and adjusts BPM cleanly from toolbar transport", async () => {
    const genre = await chicagoHouse();
    render(
      <LanguageProvider>
        <StudioView
          selectedGenre={genre}
          onSelectGenre={vi.fn()}
          onViewDetail={vi.fn()}
        />
      </LanguageProvider>
    );

    const playBtn = await screen.findByRole("button", { name: "Play / Pause" });
    fireEvent.click(playBtn);
    expect(engineMock.play).toHaveBeenCalled();

    const increaseBpm = screen.getByRole("button", { name: "Increase BPM" });
    fireEvent.click(increaseBpm);
    expect(engineMock.setBpm).toHaveBeenCalled();
  });
});
