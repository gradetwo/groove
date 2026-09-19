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

import { StudioView } from "../views/StudioView";
import { HardwareConsoleView } from "../views/HardwareConsoleView";

const ASYNC_TIMEOUT = 15000;
const TEST_TIMEOUT = 60000;

async function chicagoHouse(): Promise<Genre> {
  return (await loadGenre("chicago-house"))!;
}

function renderStudio(genre: Genre) {
  return render(
    <LanguageProvider>
      <StudioView
        selectedGenre={genre}
        onSelectGenre={vi.fn()}
        onViewDetail={vi.fn()}
      />
    </LanguageProvider>
  );
}

/**
 * Opens the toolbar's advanced density and returns the console's toggle.
 *
 * The floating console is Tier 2 (`toolbarTiers.ts`), so G.10's slimming moved it behind the
 * "More" control: the toolbar shows 12 Tier-1 controls by default instead of 36. Reaching the
 * console is therefore two clicks now, and a test that skipped the first click would be testing a
 * toolbar that no longer exists.
 */
async function openConsoleToggle() {
  const more = await screen.findByTestId("toolbar-advanced-toggle", undefined, {
    timeout: ASYNC_TIMEOUT,
  });
  fireEvent.click(more);
  return screen.findByTestId("studio-console-toggle", undefined, { timeout: ASYNC_TIMEOUT });
}

describe("StudioView · floating mixing console (feature #2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("groove_language", "en");
  });

  it("mounts the shared console from the toolbar button and unmounts it on close", async () => {
    const genre = await chicagoHouse();
    renderStudio(genre);

    const toggle = await openConsoleToggle();
    // Closed: the drawer is not in the DOM and the studio's own engine is the only one.
    expect(screen.queryByTestId("hardware-console")).toBeNull();
    expect(AudioEngineCtor).toHaveBeenCalledTimes(1);

    fireEvent.click(toggle);

    await screen.findByTestId("hardware-console", undefined, { timeout: ASYNC_TIMEOUT });
    // The floated desk did NOT create a second engine.
    expect(AudioEngineCtor).toHaveBeenCalledTimes(1);
    // ...and it enabled real channel metering on the studio's engine.
    expect(engineMock.enableTrackAnalysers).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByTestId("console-close"));

    await waitFor(() => expect(screen.queryByTestId("hardware-console")).toBeNull());
    expect(AudioEngineCtor).toHaveBeenCalledTimes(1);
    expect(engineMock.enableTrackAnalysers).toHaveBeenCalledWith(false);
  }, TEST_TIMEOUT);

  it("routes floated mixer edits into the studio's own store", async () => {
    const genre = await chicagoHouse();
    renderStudio(genre);

    fireEvent.click(await openConsoleToggle());
    await screen.findByTestId("console-fader-0", undefined, { timeout: ASYNC_TIMEOUT });

    // The studio's own track row (KICK) starts at the genre's volume...
    const studioFader = screen.getByLabelText(/^KICK Volume$/) as HTMLInputElement;
    const initial = Number(studioFader.value);

    // ...moving the channel fader on the floated desk must move the studio's row.
    fireEvent.change(screen.getByTestId("console-fader-0"), { target: { value: "0.31" } });

    await waitFor(
      () => {
        expect(Number((screen.getByLabelText(/^KICK Volume$/) as HTMLInputElement).value)).toBeCloseTo(
          0.31,
          2
        );
      },
      { timeout: ASYNC_TIMEOUT }
    );
    expect(initial).not.toBeCloseTo(0.31, 2);

    // The studio's engine received the same mixer move.
    const synced = engineMock.setTrackState.mock.calls.some(
      ([trackIdx, patch]) => trackIdx === 0 && (patch as { volume?: number }).volume === 0.31
    );
    expect(synced).toBe(true);
  }, TEST_TIMEOUT);

  it("dismisses the floated console with Escape", async () => {
    const genre = await chicagoHouse();
    renderStudio(genre);

    fireEvent.click(await openConsoleToggle());
    await screen.findByTestId("hardware-console", undefined, { timeout: ASYNC_TIMEOUT });

    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => expect(screen.queryByTestId("hardware-console")).toBeNull());
  }, TEST_TIMEOUT);

  it("toggles the floated console with the C shortcut, without opening the density", async () => {
    /**
     * The console is Tier 2, so the toolbar hides its button by default — but `C` is a real binding
     * and the tier table records it as `reachableVia: "more"`. A shortcut whose control cannot be
     * reached is the failure the table exists to prevent, so this presses the key with the advanced
     * density *closed* and expects the console anyway.
     */
    const genre = await chicagoHouse();
    renderStudio(genre);

    await screen.findByTestId("toolbar-advanced-toggle", undefined, { timeout: ASYNC_TIMEOUT });
    expect(screen.queryByTestId("studio-console-toggle")).toBeNull();

    fireEvent.keyDown(document.body, { key: "c" });
    await screen.findByTestId("hardware-console", undefined, { timeout: ASYNC_TIMEOUT });

    fireEvent.keyDown(document.body, { key: "c" });
    await waitFor(() => expect(screen.queryByTestId("hardware-console")).toBeNull());
  }, TEST_TIMEOUT);
});

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
