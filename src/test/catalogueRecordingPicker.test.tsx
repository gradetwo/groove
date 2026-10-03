/**
 * **A genre lane can choose the catalogue recording it plays — and the choice reaches the engine.**
 *
 * ## The gap these criteria are written against
 *
 * `/new` could always pick any program asset the manifest declares: its view loads the catalogue runtime and its
 * arrangement hands the assets to `InstrumentLibraryV2`. A genre lane could not. Its timbre picker goes by
 * **instrument name**, and a name reaches a recording only through a hand-written row in
 * `src/data/sampledInstruments.ts` — twenty-two of the sixty-one names the genre data writes. Measured on the shipped
 * manifest: **322 program-level assets, of which 274 are named by no row**, so a composer in a genre could not choose
 * most of the recordings the repository already ships.
 *
 * The engine had the mechanism the whole time. `sampledAssetForLane`'s **first** source is the lane's own
 * `sample.assetId` (for the roles the table lists, plus `audio`), and `SequencerTrack` has carried the field — and
 * `projectDb` has persisted it — since the audio-lane work. Nothing wrote it in the studio. `SET_TRACK_SAMPLE` and
 * `CatalogueRecordingPicker` are the part that writes it.
 *
 * ## Why the assertions are where they are
 *
 * Choosing a recording is only a change if the **engine** resolves differently, so the criteria here do not stop at
 * "the callback fired". They run the store's own reducer and then ask the engine's own resolver:
 * `sampledAssetForLane` (what the lane sounds), `sampledLaneRefs` (which lanes a render treats as recordings) and
 * `sampledStandDownIndexes` (which of those will actually be mixed from their own bytes, standing the synthesiser
 * down). That is the discipline `sampledInstrumentPaletteWiring.test.ts` states for the palette rows — *"a row that
 * `sampledInstrumentFor` can find but `sampledAssetForLane` does not return is a mapping no lane plays"* — applied to
 * a choice a person makes instead of a judgement written in code.
 *
 * The last criterion renders the real `StudioView` and reads the pattern the mocked engine was handed, so the wiring
 * from the inspector's own chip to `engine.setPattern` is judged as one chain rather than as two halves that each
 * pass on their own. **Removing the picker from `StudioView` makes it red** (run and recorded in the change's report).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";

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
    // The inspector is opened in the integration criterion, which reads these two.
    getTrackCompressorReductionDb: vi.fn(() => 0),
    getAudioContext: vi.fn(() => null),
  };
  return { engineMock, AudioEngineCtor: vi.fn(() => engineMock) };
});

vi.mock("../audio/AudioEngine", () => ({ AudioEngine: AudioEngineCtor }));

/**
 * The runtime, configured — because the shipped default is not.
 *
 * `VITE_SAMPLE_ROOT` is empty in a test run and in the shipped build, which makes `appCatalogueRuntime.configured`
 * false and its list empty; the whole point of this criterion is the list, so the singleton is replaced with one
 * built from the manifest through the catalogue's own `catalogueFromManifestText`. `createCatalogueRuntime` is left
 * real, so the unconfigured case below is the *actual* implementation rather than a second mock.
 */
vi.mock("../data/sampleCatalogueRuntime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/sampleCatalogueRuntime")>();
  const [{ catalogueFromManifestText }, fs] = await Promise.all([
    import("../data/sampleCatalogue"),
    import("node:fs"),
  ]);
  const assets = catalogueFromManifestText(fs.readFileSync("public/samples/manifest.json", "utf8"), "").assets;
  return {
    ...actual,
    appCatalogueRuntime: {
      assets,
      problems: [],
      ready: true,
      configured: true,
      loading: false,
      load: async () => ({ assets, problems: [] }),
    },
  };
});

import { CatalogueRecordingPicker, instrumentChoicesFromAssets, laneAcceptsCatalogueRecording } from "../components/arrangement/CatalogueRecordingPicker";
import { catalogueFromManifestText } from "../data/sampleCatalogue";
import { createCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import { describeCatalogueStatus, describeRuntimeStatus } from "../data/sampleCatalogueStatus";
import {
  ALL_SAMPLED_INSTRUMENTS,
  SAMPLED_INSTRUMENTS,
  sampledAssetForLane,
} from "../data/sampledInstruments";
import { sampledLaneRefs, sampledStandDownIndexes } from "../audio/sampledLanes";
import { createInitialSequencerState, sequencerReducer } from "../features/sequencer/useSequencerStore";
import { LanguageProvider } from "../i18n/LanguageContext";
import { loadGenre } from "../data/index/loader";
import type { Genre } from "../types/genre";
import { StudioView } from "../views/StudioView";

/**
 * A recording **no palette row names and the drum-kit constant does not name**: the solo cello from
 * `karoryfer-bigcat-cello`, which `sampledInstrumentPaletteWiring.test.ts` lists as a library no row may seat. If a
 * criterion can reach this, it is reaching something the genre route could not reach before this change.
 */
const UNREACHABLE_RECORDING = "karoryfer-bigcat-cello:03-Plucked";

/** The catalogue the app ships, read from the same manifest the MCP listing and `/new` read. */
function shippedAssets() {
  return catalogueFromManifestText(readFileSync("public/samples/manifest.json", "utf8"), "").assets;
}

const TEST_TIMEOUT = 60000;

async function chicagoHouse(): Promise<Genre> {
  return (await loadGenre("chicago-house"))!;
}

/** The lane the criteria address: a melodic role, which is what "a track that can play a recording" means. */
function melodicTrackIndex(genre: Genre): number {
  const index = genre.sequencer_pattern.tracks.findIndex((track) => track.track_id === "chords");
  expect(index, "chicago-house must still write a chords lane").toBeGreaterThanOrEqual(0);
  return index;
}

describe("the list a genre lane chooses from", () => {
  it("is the catalogue's own list — every program asset the manifest declares, and no second catalogue", () => {
    const assets = shippedAssets();
    const choices = instrumentChoicesFromAssets(assets);

    // 32 entries expanded to 322 program-level assets, every one of them an SFZ program (the catalogue's own
    // definition of "an instrument"). The numbers are asserted because a list that silently shrank would make the
    // two criteria below pass over a catalogue that no longer reaches the mirror. It was 34 → 327 until
    // 2026-10-03, when `freepats-tubular-bells1` (2 programs) and `gregsullivan-e-pianos` (3) left the mirror.
    expect(assets).toHaveLength(322);
    expect(assets.every((asset) => asset.sfz)).toBe(true);
    expect(choices).toHaveLength(322);

    // Same ids in the same order, and the library read out of the id rather than looked up a second time.
    expect(choices.map((choice) => choice.assetId)).toEqual(assets.map((asset) => asset.assetId));
    expect(choices[0]!.library).toBe("virtuosity-drums-basic");
    expect(choices.find((choice) => choice.assetId === "vcsl:Marimba")!.library).toBe("vcsl");
  });

  it("reaches a recording the palette cannot name, which is the reach this change adds", () => {
    const choices = instrumentChoicesFromAssets(shippedAssets());
    expect(choices.some((choice) => choice.assetId === UNREACHABLE_RECORDING)).toBe(true);
    // Not a claim about the picker: no row names it today, so no lane could play it through the name table.
    expect(SAMPLED_INSTRUMENTS.some((row) => row.assetId === UNREACHABLE_RECORDING)).toBe(false);
    expect(ALL_SAMPLED_INSTRUMENTS.some((row) => row.assetId === UNREACHABLE_RECORDING)).toBe(false);
    // And the palette is still the twenty-two written rows it was: this change does not touch the table.
    expect(SAMPLED_INSTRUMENTS).toHaveLength(22);
  });
});

describe("the chooser is offered exactly where the engine honours a recording", () => {
  it("accepts the melodic roles and `audio`, and refuses the drum and effect roles", () => {
    for (const role of ["bass", "chords", "lead", "audio"]) {
      expect(laneAcceptsCatalogueRecording(role), `${role} plays a recording`).toBe(true);
    }
    for (const role of ["kick", "snare", "hihat", "percussion", "fx"]) {
      expect(laneAcceptsCatalogueRecording(role), `${role} must not be offered one`).toBe(false);
    }
  });

  it("matches the resolver: a drum role carrying a sample id resolves to nothing, which is why it gets no chip", () => {
    // The engine's own answer, not a second list: `sampledAssetForLane` refuses a drum or effect lane's `sample`.
    expect(sampledAssetForLane({ track_id: "kick", instrument: "acoustic_kick", sample: { assetId: UNREACHABLE_RECORDING } })).toBeUndefined();
    expect(sampledAssetForLane({ track_id: "fx", instrument: "noise_sweep", sample: { assetId: UNREACHABLE_RECORDING } })).toBeUndefined();
    // ...while the melodic role it is offered on really does resolve.
    expect(sampledAssetForLane({ track_id: "chords", instrument: "m1_organ", sample: { assetId: UNREACHABLE_RECORDING } })).toBe(UNREACHABLE_RECORDING);
  });

  it("renders nothing at all for a lane the engine would ignore", () => {
    const { container } = render(
      <CatalogueRecordingPicker
        trackName="Kick Drum"
        role="kick"
        instruments={instrumentChoicesFromAssets(shippedAssets())}
        status={describeCatalogueStatus({ configured: true, loading: false, ready: true, problems: [], assetCount: 1 })}
        onChoose={() => undefined}
      />
    );
    expect(container.querySelector("[data-testid='lane-recording']")).toBeNull();
  });
});

describe("the choice reaches the engine", () => {
  it("writes the lane's own recording, which `sampledAssetForLane` reads first, and clears back to the table", async () => {
    const genre = await chicagoHouse();
    const index = melodicTrackIndex(genre);
    const state = createInitialSequencerState(genre);
    // Before any choice: the lane sounds the written table's answer for its name, not a synthesised fallback.
    expect(sampledAssetForLane(state.pattern.tracks[index]!)).toBe("freepats-drawbar-organ");

    const chosen = sequencerReducer(state, { type: "SET_TRACK_SAMPLE", trackIdx: index, assetId: UNREACHABLE_RECORDING });
    expect(chosen.pattern.tracks[index]!.sample).toEqual({ assetId: UNREACHABLE_RECORDING });
    // ⭐ The engine's resolver, not the component's state.
    expect(sampledAssetForLane(chosen.pattern.tracks[index]!)).toBe(UNREACHABLE_RECORDING);
    // ...and the render's two questions about it: which lanes are recordings, and which will actually be mixed from
    // their own bytes (the synthesiser standing down).
    expect(sampledLaneRefs(chosen.pattern).some((ref) => ref.trackIndex === index && ref.assetId === UNREACHABLE_RECORDING)).toBe(true);
    expect(sampledStandDownIndexes(chosen.pattern, shippedAssets()).get(index)).toBe(UNREACHABLE_RECORDING);

    // Clearing is not silence: it puts the lane back on the name table's row for `m1_organ`.
    const cleared = sequencerReducer(chosen, { type: "SET_TRACK_SAMPLE", trackIdx: index, assetId: null });
    expect(cleared.pattern.tracks[index]!.sample).toBeUndefined();
    expect(sampledAssetForLane(cleared.pattern.tracks[index]!)).toBe("freepats-drawbar-organ");
  });

  it("cannot turn a drum lane into one note, which is why no chip is offered there", async () => {
    const genre = await chicagoHouse();
    const state = createInitialSequencerState(genre);
    const kickIndex = state.pattern.tracks.findIndex((track) => track.track_id === "kick");
    expect(kickIndex).toBeGreaterThanOrEqual(0);
    // Without a choice of its own, an acoustic kick lane sounds the catalogue kit through the drum table...
    expect(sampledAssetForLane(state.pattern.tracks[kickIndex]!)).toBe("virtuosity-drums-basic");
    const withSample = sequencerReducer(state, { type: "SET_TRACK_SAMPLE", trackIdx: kickIndex, assetId: UNREACHABLE_RECORDING });
    // ...and a `sample` on it is refused outright by `sampledAssetForLane` (the lane would fall back to its physical
    // model, not to one recorded note). The store writes the field — it is not the place that decides what a role may
    // sound — so the boundary is drawn where the person can see it: `laneAcceptsCatalogueRecording` withholds the chip
    // on exactly these roles, and the criterion above asserts the two agree.
    expect(sampledAssetForLane(withSample.pattern.tracks[kickIndex]!)).toBeUndefined();
    expect(state.pattern.tracks[kickIndex]!.sample).toBeUndefined();
  });

  it("leaves another lane's resolution alone, so choosing is per lane", async () => {
    const genre = await chicagoHouse();
    const state = createInitialSequencerState(genre);
    const index = melodicTrackIndex(genre);
    const bassIndex = state.pattern.tracks.findIndex((track) => track.track_id === "bass");
    const chosen = sequencerReducer(state, { type: "SET_TRACK_SAMPLE", trackIdx: index, assetId: UNREACHABLE_RECORDING });
    // `sub_bass` is a synthesiser by definition, and stays one: only the chosen lane's sound changed.
    expect(sampledAssetForLane(chosen.pattern.tracks[bassIndex]!)).toBeUndefined();
  });
});

describe("an empty catalogue says why instead of opening onto nothing", () => {
  it("is empty for a real reason when no mirror is configured — the runtime's own answer", async () => {
    const runtime = createCatalogueRuntime({ root: "" });
    expect(runtime.configured).toBe(false);
    expect(await runtime.load()).toEqual({ assets: [], problems: [] });
    expect(describeRuntimeStatus(runtime).phase).toBe("unconfigured");
  });

  it("draws the reason and no chip, for every way the list can be empty", () => {
    const cases = [
      describeRuntimeStatus(createCatalogueRuntime({ root: "" })),
      describeCatalogueStatus({ configured: true, loading: true, ready: false, problems: [], assetCount: 0 }),
      describeCatalogueStatus({ configured: true, loading: false, ready: false, problems: ["manifest: 404 from /samples/manifest.json"], assetCount: 0 }),
      describeCatalogueStatus({ configured: true, loading: false, ready: true, problems: [], assetCount: 0 }),
    ];
    for (const status of cases) {
      const { unmount } = render(
        <CatalogueRecordingPicker
          trackName="Chords"
          role="chords"
          instruments={[]}
          status={status}
          onChoose={() => undefined}
        />
      );
      // No control that can only open an empty browser...
      expect(screen.queryByTestId("lane-recording-open"), `${status.phase}: no chip`).toBeNull();
      // ...and the reason is drawn, in the status module's own words rather than a second sentence.
      expect(screen.getByTestId("lane-recording-unavailable").textContent).toContain(status.summary);
      for (const detail of status.detail) {
        expect(screen.getByTestId("lane-recording-detail").textContent).toContain(detail);
      }
      unmount();
    }
  });
});

describe("the chip in the panel", () => {
  function renderPicker(onChoose: (assetId: string | null) => void, assetId?: string) {
    return render(
      <CatalogueRecordingPicker
        trackName="Chords"
        role="chords"
        {...(assetId === undefined ? {} : { assetId })}
        instruments={instrumentChoicesFromAssets(shippedAssets())}
        status={describeCatalogueStatus({ configured: true, loading: false, ready: true, problems: [], assetCount: 322 })}
        onChoose={onChoose}
      />
    );
  }

  it("names what the lane plays and opens the library on demand", () => {
    renderPicker(() => undefined, "freepats-drawbar-organ");
    const open = screen.getByTestId("lane-recording-open");
    expect(open.textContent).toContain("Drawbar");
    expect(screen.queryByTestId("instrument-library")).toBeNull();
    fireEvent.click(open);
    expect(screen.getByTestId("instrument-library")).toBeDefined();
  });

  it("reports the chosen asset id and closes behind the choice", () => {
    const onChoose = vi.fn();
    renderPicker(onChoose);
    fireEvent.click(screen.getByTestId("lane-recording-open"));
    fireEvent.click(screen.getByTestId(`instrument-option-${UNREACHABLE_RECORDING}`));
    expect(onChoose).toHaveBeenCalledWith(UNREACHABLE_RECORDING);
    expect(screen.queryByTestId("instrument-library")).toBeNull();
  });

  it("offers the way back to the track's own instrument, and reports it as a clear", () => {
    const onChoose = vi.fn();
    renderPicker(onChoose, UNREACHABLE_RECORDING);
    fireEvent.click(screen.getByTestId("lane-recording-clear"));
    expect(onChoose).toHaveBeenCalledWith(null);
  });
});

describe("the studio's inspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("groove_language", "en");
  });

  it("carries a melodic track's choice through `engine.setPattern`, where the engine resolves it", async () => {
    const genre = await chicagoHouse();
    const index = melodicTrackIndex(genre);
    render(
      <LanguageProvider>
        <StudioView selectedGenre={genre} onSelectGenre={vi.fn()} onViewDetail={vi.fn()} />
      </LanguageProvider>
    );

    // Open the inspector on the chords lane, the way a person does: its header.
    const header = await screen.findByTestId(`track-header-${index}`, undefined, { timeout: 15000 });
    fireEvent.click(header);

    // The recording panel is there, it is the melodic lane's, and it is not offered on the drums beside it.
    expect((await screen.findByTestId("lane-recording", undefined, { timeout: 15000 })).getAttribute("data-role")).toBe("chords");

    fireEvent.click(screen.getByTestId("lane-recording-open"));
    fireEvent.click(screen.getByTestId(`instrument-option-${UNREACHABLE_RECORDING}`));

    /**
     * ⭐ **Read from the engine, not from the panel.** The last pattern the engine was handed is what the transport
     * would play, and asking the engine's own resolver about it is what makes this a criterion about sound rather
     * than about a callback.
     */
    await waitFor(
      () => {
        const pattern = engineMock.setPattern.mock.calls.at(-1)?.[0] as { tracks: { sample?: { assetId?: string } }[] } | undefined;
        expect(pattern?.tracks[index]?.sample?.assetId).toBe(UNREACHABLE_RECORDING);
        expect(sampledAssetForLane(pattern!.tracks[index]!)).toBe(UNREACHABLE_RECORDING);
        expect(sampledStandDownIndexes(pattern as never, shippedAssets()).get(index)).toBe(UNREACHABLE_RECORDING);
      },
      { timeout: 15000 }
    );
  }, TEST_TIMEOUT);
});
