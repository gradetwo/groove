import React from "react";
import { GENRE_MIX_RESOLVED } from "../data/genreMix";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { HardwareConsoleView } from "../views/HardwareConsoleView";
import { LanguageProvider } from "../i18n/LanguageContext";
import { loadGenre } from "../data/index/loader";
import type { Genre } from "../types/genre";

/**
 * The console drives a real AudioEngine for transport, track state sync and
 * metering. jsdom has no WebAudio, so the engine is stubbed exactly the way
 * `CompareViewPresets.test.tsx` stubs it — plus the methods the console needs
 * (`setTrackState`, `getTrackStates`, `getStereoAnalysers`, `setMasterVolume`).
 */
const engineMock = vi.hoisted(() => ({
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
  // N-02 spatial monitoring surface (added after this mock was first written).
  setSpatialMode: vi.fn(),
  getSpatialMode: vi.fn(() => false),
  getSpatialLayout: vi.fn(() => []),
  getLiveRecorder: vi.fn(() => ({ setOnQuantizedStep: vi.fn() })),
  play: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  destroy: vi.fn(),
  getIsPlaying: vi.fn(() => false),
}));

vi.mock("../audio/AudioEngine", () => ({
  AudioEngine: vi.fn().mockImplementation(() => engineMock),
}));

// The view is heavy (it resolves a genre chunk on first load) and the full suite
// runs files in parallel, so testing-library's 1s default is not enough here.
const ASYNC_TIMEOUT = 10000;
const TEST_TIMEOUT = 40000;

async function chicagoHouse(): Promise<Genre> {
  const genre = await loadGenre("chicago-house");
  return genre!;
}

function renderConsole(genre: Genre) {
  return render(
    <LanguageProvider>
      <HardwareConsoleView selectedGenre={genre} onOpenStudio={vi.fn()} />
    </LanguageProvider>
  );
}

describe("HardwareConsoleView (N-01 / P8-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Force the English dictionary so tooltip assertions are deterministic.
    localStorage.setItem("groove_language", "en");
  });

  it("renders one channel strip per track in the current pattern", async () => {
    const genre = await chicagoHouse();
    renderConsole(genre);

    const strips = await screen.findAllByTestId(
      /^console-channel-\d+$/,
      undefined,
      { timeout: ASYNC_TIMEOUT }
    );
    expect(strips.length).toBe(genre.sequencer_pattern.tracks.length);
    expect(strips.length).toBe(8);

    // Track names come straight from the pattern.
    for (const track of genre.sequencer_pattern.tracks) {
      expect(screen.getAllByText(track.name).length).toBeGreaterThan(0);
    }
  }, TEST_TIMEOUT);

  it("commits a fader move to the sequencer store and pushes it to the engine", async () => {
    const genre = await chicagoHouse();
    renderConsole(genre);

    const fader = (await screen.findByTestId("console-fader-0", undefined, {
      timeout: ASYNC_TIMEOUT,
    })) as HTMLInputElement;
    // The arranged per-genre mix is the genre's default now, so assert against the mix
    // table instead of the raw value in the genre file (which is the pre-mix placeholder).
    const expectedKick = GENRE_MIX_RESOLVED[genre.id]?.kick.volume ?? genre.sequencer_pattern.tracks[0].volume ?? 0.8;
    expect(Number(fader.value)).toBeCloseTo(expectedKick, 2);

    fireEvent.change(fader, { target: { value: "0.25" } });

    // The range is fully controlled by store state: if the commit did not land the
    // DOM value would snap back to the old store value on the next render.
    await waitFor(
      () => {
        expect(Number((screen.getByTestId("console-fader-0") as HTMLInputElement).value)).toBeCloseTo(0.25, 2);
      },
      { timeout: ASYNC_TIMEOUT }
    );
    // Digital dB readout round-trips too: 0.25 linear ≈ -12.0 dBFS.
    expect(within(screen.getByTestId("console-channel-0")).getByText("-12.0")).toBeTruthy();

    // And the store -> engine sync reflected the new volume.
    await waitFor(
      () => {
        const synced = engineMock.setTrackState.mock.calls.some(
          ([trackIdx, patch]) => trackIdx === 0 && (patch as { volume?: number }).volume === 0.25
        );
        expect(synced).toBe(true);
      },
      { timeout: ASYNC_TIMEOUT }
    );
  }, TEST_TIMEOUT);

  it("commits mute and solo toggles to the sequencer store", async () => {
    const genre = await chicagoHouse();
    renderConsole(genre);

    const muteButton = await screen.findByTestId("console-mute-3", undefined, {
      timeout: ASYNC_TIMEOUT,
    });
    expect(muteButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(muteButton);
    await waitFor(
      () => {
        expect(screen.getByTestId("console-mute-3")).toHaveAttribute("aria-pressed", "true");
      },
      { timeout: ASYNC_TIMEOUT }
    );

    const soloButton = screen.getByTestId("console-solo-3");
    expect(soloButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(soloButton);
    await waitFor(
      () => {
        expect(screen.getByTestId("console-solo-3")).toHaveAttribute("aria-pressed", "true");
      },
      { timeout: ASYNC_TIMEOUT }
    );

    // Both toggles reached the audio engine through the track-state sync.
    await waitFor(
      () => {
        const muted = engineMock.setTrackState.mock.calls.some(
          ([trackIdx, patch]) => trackIdx === 3 && (patch as { mute?: boolean }).mute === true
        );
        const soloed = engineMock.setTrackState.mock.calls.some(
          ([trackIdx, patch]) => trackIdx === 3 && (patch as { solo?: boolean }).solo === true
        );
        expect(muted && soloed).toBe(true);
      },
      { timeout: ASYNC_TIMEOUT }
    );
  }, TEST_TIMEOUT);

  it("renders an independent stereo meter per strip, plus a master meter", async () => {
    const genre = await chicagoHouse();
    renderConsole(genre);

    await screen.findByTestId("console-meter-0", undefined, { timeout: ASYNC_TIMEOUT });

    for (let trackIdx = 0; trackIdx < 8; trackIdx += 1) {
      const meter = screen.getByTestId(`console-meter-${trackIdx}`);
      expect(meter).toBeTruthy();
      expect(meter.querySelectorAll("[data-meter-bar]").length).toBe(2);
      expect(meter.querySelectorAll('[data-clip-zone="true"]').length).toBeGreaterThan(0);
    }

    const masterMeter = screen.getByTestId("console-master-meter");
    expect(masterMeter.querySelectorAll("[data-meter-bar]").length).toBe(2);
  }, TEST_TIMEOUT);

  it("writes the master fader to the engine", async () => {
    const genre = await chicagoHouse();
    renderConsole(genre);

    const masterFader = (await screen.findByTestId("console-master-fader", undefined, {
      timeout: ASYNC_TIMEOUT,
    })) as HTMLInputElement;
    fireEvent.change(masterFader, { target: { value: "0.5" } });
    await waitFor(
      () => {
        expect(engineMock.setMasterVolume).toHaveBeenCalledWith(0.5);
      },
      { timeout: ASYNC_TIMEOUT }
    );

  }, TEST_TIMEOUT);

  it("toggles channel polarity (Ø) and keeps the button in sync with the pattern", async () => {
    const genre = await chicagoHouse();
    renderConsole(genre);

    const phaseButton = (await screen.findByTestId("console-phase-0", undefined, {
      timeout: ASYNC_TIMEOUT,
    })) as HTMLButtonElement;
    // The engine now exposes a real polarity stage, so this control is live.
    expect(phaseButton.disabled).toBe(false);
    expect(phaseButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(phaseButton);

    await waitFor(
      () => {
        expect(phaseButton.getAttribute("aria-pressed")).toBe("true");
      },
      { timeout: ASYNC_TIMEOUT }
    );

    // Clicking again flips it back.
    fireEvent.click(phaseButton);
    await waitFor(
      () => {
        expect(phaseButton.getAttribute("aria-pressed")).toBe("false");
      },
      { timeout: ASYNC_TIMEOUT }
    );
  }, TEST_TIMEOUT);
});

describe("HardwareConsoleView · spatial monitoring toggle (N-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("groove_language", "en");
  });

  it("starts in stereo mode and switches the engine to HRTF when toggled", async () => {
    const genre = await chicagoHouse();
    renderConsole(genre);

    const toggle = await screen.findByRole("button", { name: /Binaural|双耳/i }, { timeout: ASYNC_TIMEOUT });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);

    await waitFor(
      () => {
        expect(toggle.getAttribute("aria-pressed")).toBe("true");
        expect(engineMock.setSpatialMode).toHaveBeenCalledWith(true);
      },
      { timeout: ASYNC_TIMEOUT }
    );

    fireEvent.click(toggle);
    await waitFor(
      () => {
        expect(engineMock.setSpatialMode).toHaveBeenCalledWith(false);
      },
      { timeout: ASYNC_TIMEOUT }
    );
  }, TEST_TIMEOUT);
});

describe("console meter maths · suspended-context safety", () => {
  it("reads a flat buffer as silence, not full scale", async () => {
    const { peakFromTimeDomain, formatDb, linearToMeterPosition } = await import(
      "../components/console/meterMath"
    );

    // A suspended AudioContext hands back all-zero frames.
    expect(peakFromTimeDomain(new Uint8Array(256))).toBe(0);
    expect(peakFromTimeDomain(new Uint8Array(256).fill(128))).toBe(0);
    expect(linearToMeterPosition(peakFromTimeDomain(new Uint8Array(256)))).toBe(0);
    expect(formatDb(0)).toBe("-\u221E");

    // A real bipolar waveform still measures normally.
    const wave = new Uint8Array(8);
    wave.set([128, 192, 128, 64, 128, 192, 128, 64]);
    expect(peakFromTimeDomain(wave)).toBeCloseTo(0.5, 3);

    // And a full-scale signal is still reported as such: byte 0 is full negative
    // excursion (|0-128|/128 = 1) and 255 is 0.992, so the peak is 1.
    const hot = new Uint8Array([128, 255, 128, 0]);
    expect(peakFromTimeDomain(hot)).toBe(1);
    expect(peakFromTimeDomain(new Uint8Array([128, 255]))).toBeCloseTo(0.992, 3);
  });
});
