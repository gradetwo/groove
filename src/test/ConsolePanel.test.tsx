import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { GENRES_MAP } from "../data/genres";
import { GENRE_MIX_RESOLVED } from "../data/genreMix";
import { useSequencerStore } from "../features/sequencer/useSequencerStore";
import { ConsolePanel } from "../components/console/ConsolePanel";
import { ConsoleOverlay } from "../components/console/ConsoleOverlay";

/**
 * Feature #2 — the extracted `ConsolePanel` must be presentational about its two
 * live dependencies. These tests pin the crux of the architectural constraint:
 * rendering the desk constructs NEITHER an `AudioEngine` NOR a sequencer store,
 * it always reads/writes the injected ones. The `AudioEngine` module is mocked so
 * any accidental `new AudioEngine()` inside the panel is observable.
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
    setTrackState: vi.fn(),
    getTrackState: vi.fn(),
    getTrackStates: vi.fn(() => []),
    enableTrackAnalysers: vi.fn(),
    areTrackAnalysersEnabled: vi.fn(() => false),
    getTrackAnalyser: vi.fn(() => null),
    getMasterAnalyser: vi.fn(() => null),
    getStereoAnalysers: vi.fn(() => ({ left: null, right: null })),
    setMasterVolume: vi.fn(),
    getMasterVolume: vi.fn(() => 0.8),
    setSpatialMode: vi.fn(),
    getSpatialMode: vi.fn(() => false),
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    getIsPlaying: vi.fn(() => false),
  };
  return { engineMock, AudioEngineCtor: vi.fn(() => engineMock) };
});

vi.mock("../audio/AudioEngine", () => ({
  AudioEngine: AudioEngineCtor,
}));

const genre = GENRES_MAP["chicago-house"] ?? Object.values(GENRES_MAP)[0];

type Store = ReturnType<typeof useSequencerStore>;

/** Wires the real store hook to the panel; exposes it so tests can commit from outside. */
function renderPanel(overrides: Partial<React.ComponentProps<typeof ConsolePanel>> = {}) {
  let captured: Store | null = null;
  const Harness: React.FC = () => {
    const store = useSequencerStore(genre);
    captured = store;
    return <ConsolePanel engine={engineMock as never} store={store} {...overrides} />;
  };
  const utils = render(
    <LanguageProvider>
      <Harness />
    </LanguageProvider>
  );
  return { ...utils, getStore: () => captured as Store };
}

function renderOverlay(isOpen: boolean, engine: unknown | null, onClose = vi.fn()) {
  const Harness: React.FC = () => {
    const store = useSequencerStore(genre);
    return (
      <ConsoleOverlay
        isOpen={isOpen}
        engine={engine as never}
        store={store}
        onClose={onClose}
      />
    );
  };
  return {
    onClose,
    ...render(
      <LanguageProvider>
        <Harness />
      </LanguageProvider>
    ),
  };
}

describe("ConsolePanel · injected engine + store (feature #2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("groove_language", "en");
  });

  it("renders the injected store without constructing an engine", () => {
    renderPanel();

    expect(AudioEngineCtor).not.toHaveBeenCalled();
    expect(screen.getByTestId("hardware-console")).toBeTruthy();

    // The console shows the *arranged* per-genre mix, not the raw value in the genre
    // file: `patternFromGenre` seeds the store from `GENRE_MIX_RESOLVED`. Assert against
    // that table rather than a hard-coded number, so retuning the mix cannot break this
    // test while a real regression in the seeding path still does.
    const fader = screen.getByTestId("console-fader-0") as HTMLInputElement;
    const expected = GENRE_MIX_RESOLVED[genre.id]?.kick.volume ?? genre.sequencer_pattern.tracks[0].volume ?? 0.8;
    expect(Number(fader.value)).toBeCloseTo(expected, 2);
  });

  it("subscribes to the injected store: an outside commit reaches the fader", async () => {
    const { getStore } = renderPanel();

    act(() => {
      getStore().commit({ type: "SET_VOLUME", trackIdx: 0, volume: 0.2 });
    });

    await waitFor(() => {
      expect(Number((screen.getByTestId("console-fader-0") as HTMLInputElement).value)).toBeCloseTo(
        0.2,
        2
      );
    });
  });

  it("pushes mixer edits through the injected engine's track-state API", async () => {
    renderPanel();

    fireEvent.change(screen.getByTestId("console-fader-0"), { target: { value: "0.35" } });

    await waitFor(() => {
      const synced = engineMock.setTrackState.mock.calls.some(
        ([trackIdx, patch]) => trackIdx === 0 && (patch as { volume?: number }).volume === 0.35
      );
      expect(synced).toBe(true);
    });
  });

  it("enables the shared engine's track analysers while mounted and releases them on unmount", () => {
    const { unmount } = renderPanel();

    expect(engineMock.enableTrackAnalysers).toHaveBeenCalledWith(true);

    unmount();

    expect(engineMock.enableTrackAnalysers).toHaveBeenCalledWith(false);
    expect(AudioEngineCtor).not.toHaveBeenCalled();
  });

  it("renders mixer guide button when onOpenHelp is provided and invokes it", () => {
    const handleOpenHelp = vi.fn();
    renderPanel({ onOpenHelp: handleOpenHelp });

    const helpBtn = screen.getByTestId("console-help-button");
    expect(helpBtn).toBeInTheDocument();
    fireEvent.click(helpBtn);
    expect(handleOpenHelp).toHaveBeenCalledTimes(1);
  });
});

describe("ConsoleOverlay · dismissible shared drawer (feature #2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("groove_language", "en");
  });

  it("renders nothing while closed and nothing while the engine is not ready", () => {
    renderOverlay(false, engineMock);
    expect(screen.queryByTestId("hardware-console")).toBeNull();

    renderOverlay(true, null);
    expect(screen.queryByTestId("hardware-console")).toBeNull();
    expect(AudioEngineCtor).not.toHaveBeenCalled();
  });

  it("mounts the shared panel when open and closes through the header button", () => {
    const { onClose } = renderOverlay(true, engineMock);

    expect(screen.getByTestId("hardware-console")).toBeTruthy();
    expect(screen.getByTestId("hardware-console").dataset.consoleVariant).toBe("overlay");

    fireEvent.click(screen.getByTestId("console-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses on backdrop click without hitting the desk itself", () => {
    const { onClose } = renderOverlay(true, engineMock);

    fireEvent.click(screen.getByTestId("console-overlay-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(AudioEngineCtor).not.toHaveBeenCalled();
  });
});

/**
 * B7's decision moved out of this panel, and the regression that caused the move is what this case guards.
 *
 * The console used to feed the engine the flattened song itself. The live-arrangement probe then found the gap: the
 * console is only mounted when the user opens it, so the studio's transport played the loop while the arrangement was
 * on screen. The decision now lives in the engine's lifecycle hook (`playingPattern`), and the console must **not**
 * set a pattern — two writers of one transport is how they drifted apart in the first place.
 */
describe("ConsolePanel · B7 lives in the lifecycle hook, not here", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("groove_language", "en");
  });

  it("does not push a pattern of its own, even with song mode on", async () => {
    const { getStore } = renderPanel();
    await act(async () => {
      getStore().commit({
        type: "SET_SECTIONS",
        sections: [
          { id: "s1", slot: "A", bars: 2 },
          { id: "s2", slot: "B", bars: 1 },
        ] as never,
      });
      getStore().commit({ type: "TOGGLE_SONG_MODE" });
    });
    expect(engineMock.setPattern, "the console must not be a second writer of the transport").not.toHaveBeenCalled();
  });
});

/**
 * ⭐ **The insert chain has to be reachable from the desk, or the DSP is a capability nothing can ask for.**
 *
 * `TrackInspector` — the signal-chain strip and the three curves computed from the live parameters — was built and
 * tested and had **no production reference at all**: `grep -rn TrackInspector src/` found only its own file and
 * `src/test/`. So every EQ band, the compressor and the drive were adjustable by nothing on the Web, however complete
 * the audio path was. These cases are about the *mount*, not the panel: they assert the real component is rendered
 * through the console's own button, and that a band drag reaches the store's existing action.
 *
 * Two failures worth catching: a desk with no opener at all (the state this fixes), and an opener that renders a copy
 * of the panel that writes somewhere other than `SET_TRACK_INSERT` — which would look right and change no audio.
 */
describe("the console's insert chain", () => {
  const openInspector = () => {
    const utils = renderPanel({
      engine: {
        ...engineMock,
        getTrackInsert: vi.fn(() => null),
        getTrackCompressorReductionDb: vi.fn(() => 0),
      } as never,
    });
    const opener = utils.container.querySelector<HTMLElement>("[data-testid='console-insert-0']");
    expect(opener, "a channel offers its chain").not.toBeNull();
    fireEvent.click(opener!);
    return utils;
  };

  it("⭐ opens the real inspector from a channel's EQ button, with the chain the engine is running", () => {
    const utils = openInspector();
    expect(
      utils.container.querySelector("[data-testid='insert-flow-strip']"),
      "the real signal-chain strip is mounted, not a stand-in"
    ).not.toBeNull();
    // The curves are the inspector's own, and they are computed from the live parameters rather than drawn from a file.
    // The chain strip shows one stage at a time without unmounting the others, so the compressor's and drive's curves
    // are present but hidden until their stage is chosen — presence is what proves the panels are really mounted.
    expect(utils.container.querySelector("[data-testid='insert-eq-curve-path']")).not.toBeNull();
    expect(utils.container.querySelector("[data-testid='insert-comp-curve-path']")).not.toBeNull();
    expect(utils.container.querySelector("[data-testid='insert-drive-curve-path']")).not.toBeNull();
  });

  it("⭐ a band drag changes the track's chain through the store's own action, so the audio follows", () => {
    const utils = openInspector();
    const before = utils.getStore().state.pattern.tracks[0]!.insert?.low.gainDb ?? null;

    // The EQ stage is the initial selection, so its bands are the ones on screen.
    const gain = utils.container.querySelector<HTMLInputElement>(
      "[data-testid='insert-stage-panel-low'] [data-testid='track-inspector-low-gain']"
    );
    expect(gain, "the low band's gain is adjustable").not.toBeNull();
    fireEvent.change(gain!, { target: { value: "6" } });

    const after = utils.getStore().state.pattern.tracks[0]!.insert?.low.gainDb ?? null;
    expect(after, "the store's chain changed, which is what the engine reads").toBe(6);
    expect(after, "and not the value it already had").not.toBe(before);
  });

  it("closes again, so the desk is not permanently covered", () => {
    const utils = openInspector();
    fireEvent.click(utils.container.querySelector("[data-testid='track-inspector-close']")!);
    expect(utils.container.querySelector("[data-testid='insert-flow-strip']")).toBeNull();
  });
});
