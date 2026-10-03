/**
 * **Every entry point that owns an engine and plays a pattern must sound that pattern's recorded lanes — and the
 * console route, which owns an engine and plays nothing, must not pretend to.**
 *
 * ## The defect these criteria exist for
 *
 * A lane whose instrument the palette maps (`sax_lead`, `walking_upright`, `acoustic_kick`, …) is a **recording**, and
 * two things have to happen for it to be heard: `AudioEngine.prepareSampledLanes` stands its synthesiser down (and plays
 * nothing), while `createSamplerLanePlayback` places its notes from their own bytes. Calling only the first is **worse
 * than the defect** — a lane that played the wrong instrument becomes a lane that plays nothing — which is why every
 * case below asserts **both halves**, and why "it was stood down" alone can never make one of these pass.
 *
 * The genre detail page and the timeline's shuffle were repaired first (`genreAuditionSampledLanes.test.tsx`). These
 * are the four remaining engine-owning surfaces:
 *
 *   · `CustomGenreMakerView` — its preview called `engineRef.current.play()` and nothing else;
 *   · `ChallengeView` — a fresh `new AudioEngine` per question, same omission, on the one screen that is *only* about
 *     telling one genre from another;
 *   · `CompareView` — two hand-built engines (single audition and the synchronous composite), same omission, on the
 *     screen whose whole promise is hearing the difference between two styles;
 *   · `HardwareConsoleView` — own engine, but it **never sets a pattern** on it: the console is a mixing desk, the
 *     sound comes from the studio whose engine the floated panel is given. That is the reverse criterion at the bottom.
 *
 * ## ⚠️ How the red was read, and why the doubles look like this
 *
 * The engine is doubled and `scheduleSamplerSteps` is watched, exactly as `genreAuditionSampledLanes.test.tsx` does:
 * the question is "was a catalogue handed to the engine, and was a lane scheduled from its bytes", not what the audio
 * sounds like. `AudioEngine` is mocked because jsdom has no WebAudio, and the double carries the recorded-lane surface
 * (`prepareSampledLanes`, `getTrackState(s)`, `getBpm`) so its silence can never be what makes a case pass.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { LanguageProvider } from "../i18n/LanguageContext";
import { GENRES_MAP } from "../data/genres";
import { catalogueFromManifestText } from "../data/sampleCatalogue";
import { appCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import { forkGenre, saveCustomGenre } from "../features/customGenre/customGenreDb";
import { readFileSync } from "node:fs";

/**
 * The engine double. `onLoopWrap` is a property the recorded-lane controller assigns, exactly as it does on a real
 * engine; `prepareSampledLanes` is the stand-down half, and returns no problems so the double is not what a report sees.
 */
const { engineMock, AudioEngineCtor, engineInstances } = vi.hoisted(() => {
  const engineInstances: Record<string, unknown>[] = [];
  const engineMock = {
    onLoopWrap: undefined as ((t: number) => void) | undefined,
    setOnStep: vi.fn(),
    setOnPlay: vi.fn(),
    setOnStop: vi.fn(),
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    getBpm: vi.fn(() => 120),
    setTotalSteps: vi.fn(),
    setLoudnessTrimDb: vi.fn(),
    setTrackState: vi.fn(),
    getTrackState: vi.fn(() => undefined),
    getTrackStates: vi.fn(() => []),
    applyAudioMutes: vi.fn(),
    prepareSampledLanes: vi.fn(() => ({ stoodDown: [], problems: [] })),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    getIsPlaying: vi.fn(() => false),
    getCurrentStep: vi.fn(() => 0),
    getStepDuration: vi.fn(() => 0.125),
    // The mixing desk's own surface (`ConsolePanel`), so the reverse criterion below can mount the route at all.
    getMasterVolume: vi.fn(() => 0.8),
    setMasterVolume: vi.fn(),
    setSpatialMode: vi.fn(),
    setMetronome: vi.fn(),
    setCountIn: vi.fn(),
    setDrumKit: vi.fn(),
    setSwing: vi.fn(),
    setTimeSignature: vi.fn(),
    setResolution: vi.fn(),
    enableTrackAnalysers: vi.fn(),
    getStereoAnalysers: vi.fn(() => ({ left: null, right: null })),
    getTrackAnalyser: vi.fn(() => null),
    getLiveRecorder: vi.fn(() => ({ setOnQuantizedStep: vi.fn() })),
    audioContext: { currentTime: 0 } as unknown as BaseAudioContext,
    musicDestination: { connect: vi.fn() } as unknown as AudioNode,
  };
  const AudioEngineCtor = vi.fn(() => {
    engineInstances.push(engineMock);
    return engineMock;
  });
  return { engineMock, AudioEngineCtor, engineInstances };
});

vi.mock("../audio/AudioEngine", () => ({ AudioEngine: AudioEngineCtor }));

/**
 * ⭐ **The scheduler is watched, because it is the half that makes a sound.**
 *
 * ⚠️ `mockImplementation`, not `mockResolvedValue`: `vi.clearAllMocks()` clears a mock's return value as well as its
 * history, so a `mockResolvedValue` is silently replaced by `undefined` before a later test body runs.
 */
const { scheduleSamplerStepsMock } = vi.hoisted(() => {
  const scheduleSamplerStepsMock = vi.fn();
  scheduleSamplerStepsMock.mockImplementation(async () => ({
    started: 1,
    voices: [{ stop: () => undefined }],
    problems: [] as string[],
    legato: { carried: 0, refused: [], started: 0 },
  }));
  return { scheduleSamplerStepsMock };
});

vi.mock("../audio/samplerSteps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/samplerSteps")>();
  return { ...actual, scheduleSamplerSteps: scheduleSamplerStepsMock };
});

/** A jazz style whose lanes the palette maps on all four roles — the genre every case below plays. */
const JAZZ = GENRES_MAP["bebop"] ?? GENRES_MAP["traditional-jazz"] ?? Object.values(GENRES_MAP)[0];

/**
 * The catalogue the session resolved, read from the **shipped manifest** rather than hand-written: this is the same
 * statement `genreAuditionSampledLanes.test.tsx` makes — an address really exists for the lane, so "it was never asked
 * for" is the whole of the defect.
 */
const CATALOGUE = catalogueFromManifestText(
  readFileSync("public/samples/manifest.json", "utf8"),
  "https://r2mirror.groove.wangda.today"
).assets;

const ASSET_IDS = new Set(CATALOGUE.map((asset) => asset.assetId));

beforeEach(() => {
  /**
   * ⚠️ **`mockRestore` for the spy only, never `vi.restoreAllMocks()`.**
   *
   * `restoreAllMocks` would also reset the **module** mocks above (`../audio/samplerSteps`'s
   * `scheduleSamplerSteps`, whose implementation is what makes a scheduled pass observable) — and a mock whose
   * implementation has been stripped resolves `undefined`, which is a failure of the criterion rather than of the code.
   */
  vi.clearAllMocks();
  globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  localStorage.clear();
  localStorage.setItem("groove_language", "en");
  engineMock.onLoopWrap = undefined;
  engineInstances.length = 0;
  /**
   * The runtime is handed the manifest this test already read — a spy rather than a fetch, so the criterion is not
   * judging `/samples/manifest.json`'s availability in jsdom.
   */
  vi.spyOn(appCatalogueRuntime, "load").mockImplementation(async () => ({ assets: CATALOGUE, problems: [] }));
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * ⭐ **Both halves of a recorded lane, under the one condition that makes them a claim.**
 *
 * The transport is awaited by the caller first, because the lanes are placed *after* it — that order is the point
 * (their onsets are measured from the clock `play()` starts), so polling both halves at once could read "nothing was
 * scheduled" while the first half was still being handed over.
 *
 * `planned` is the honest qualifier: a round is drawn from the genre pool and some mapped lanes carry **no notes** (a
 * `hihat` is mapped by role, and a steps array can be empty), so `scheduleSamplerSteps` legitimately places nothing for
 * such a pattern — and asserting otherwise would make this file a criterion about the pool. When there are notes, the
 * assertion is the full one: the synthesiser stood down **and** the bytes were scheduled.
 */
async function expectRecordedLanesStoodDown(
  where: string,
  planned: number
): Promise<void> {
  expect(
    engineMock.prepareSampledLanes,
    `${where}: the engine was never told which lanes are recordings, so a mapped lane keeps its built-in synthesiser`
  ).toHaveBeenCalled();
  if (planned === 0) return;
  await waitFor(
    () =>
      expect(
        scheduleSamplerStepsMock,
        `${where}: the lane was stood down from the synthesiser and nothing scheduled it from its samples, so it plays nothing at all`
      ).toHaveBeenCalled(),
    { timeout: 10000 }
  );
}

/**
 * ⭐ **Click, after letting the view's mount-time work settle — and re-query the button.**
 *
 * `ChallengeView` builds its engine and seeds its question in a mount effect, and `findByRole` can hand back the button
 * from a render whose effects have not flushed yet; clicking that node then lands on a handler that has already been
 * replaced. Flushing inside `act` first is what makes these cases judge the wiring rather than React's scheduling.
 */
async function clickAfterEffects(name: RegExp | string): Promise<void> {
  await settle();
  await clickElement(await screen.findByRole("button", { name }));
}

/** The same, for a surface that renders one audition button per compared genre — the first column is the subject. */
async function clickFirstAfterEffects(name: RegExp | string): Promise<void> {
  await settle();
  const [first] = await screen.findAllByRole("button", { name });
  await clickElement(first!);
}

/** Let a view's mount-time effects flush, so the node that is clicked is the one whose handler is current. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function clickElement(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
}

/** The assets the plan asked the loader for — a lane the mirror does not hold would fail to resolve. */
function scheduledAssetIds(): Set<string> {
  const ids = new Set<string>();
  for (const event of scheduleSamplerStepsMock.mock.calls.at(-1)?.[0] ?? []) {
    ids.add((event as { assetId: string }).assetId);
  }
  return ids;
}

/** The pattern the engine was last handed, so the expectation is read from what actually played. */
function lastPattern(): { tracks?: unknown[] } | undefined {
  return engineMock.setPattern.mock.calls.at(-1)?.[0] as { tracks?: unknown[] } | undefined;
}

/**
 * ⭐ **How many notes the recorded-lane plan actually carries for the pattern the engine was handed.**
 *
 * Read from the same two functions the controller reads it from (`sampledAssetForLane`, `planSamplerSteps`), so this
 * criterion cannot go green because a genre happened to be quiet, and cannot go red because one happened to be.
 */
async function plannedEventCount(pattern: unknown): Promise<number> {
  const { sampledAssetForLane } = await import("../data/sampledInstruments");
  const { planSamplerSteps } = await import("../audio/samplerSteps");
  const lanes = ((pattern as { tracks?: unknown[] })?.tracks ?? [])
    .filter((track) => sampledAssetForLane(track as never) !== undefined)
    .map((track, index) => ({ sourceTrackId: `lane-${index}`, lane: track as never }));
  return planSamplerSteps(lanes as never).length;
}

describe("CustomGenreMakerView · the preview of a forked jazz style sounds its recordings", () => {
  it("⭐ stands the synthesiser down AND schedules the lane from its samples when Play is pressed", async () => {
    // A custom genre forked from a jazz style: it carries `sax_lead` on the lead, `walking_upright` on the bass and an
    // acoustic kit — the shapes a user makes by forking, which is the only way this view can hold a recorded lane.
    await saveCustomGenre(forkGenre(JAZZ));
    const { CustomGenreMakerView } = await import("../views/CustomGenreMakerView");
    render(
      <LanguageProvider>
        <CustomGenreMakerView onOpenStudio={vi.fn()} onSelectGenre={vi.fn()} />
      </LanguageProvider>
    );

    await clickAfterEffects(/试听律动|Audition Pattern/i);

    await waitFor(() => expect(engineMock.play).toHaveBeenCalled(), { timeout: 10000 });
    const planned = await plannedEventCount(lastPattern());
    expect(planned, "a forked jazz style must have notes to place").toBeGreaterThan(0);
    await expectRecordedLanesStoodDown("the custom-genre preview", planned);
    // The plan names the recorded instruments this genre forked, not a synthesiser stand-in.
    const ids = scheduledAssetIds();
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(ASSET_IDS.has(id), `${id} must be an asset the shipped manifest carries`).toBe(true);
  }, 30000);
});

describe("ChallengeView · the ear-training round plays the genre it is asking about", () => {
  it("⭐ stands the synthesiser down AND schedules the lane from its samples on Start Listening", async () => {
    const { ChallengeView } = await import("../views/ChallengeView");
    render(
      <LanguageProvider>
        <ChallengeView onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    await clickAfterEffects(/点击开始听辨|Start Listening/i);

    /**
     * ⭐ **The transport is awaited first, because the recorded lanes are placed *after* it** — that order is the
     * whole point (the sampler's onsets are measured from the clock `play()` starts), so a criterion that polled both
     * halves at once could read "nothing was scheduled" while the first half was still being handed over.
     */
    await waitFor(() => expect(engineMock.play).toHaveBeenCalled(), { timeout: 10000 });
    const planned = await plannedEventCount(lastPattern());
    await expectRecordedLanesStoodDown("the challenge round", planned);
    if (planned > 0) {
      expect(scheduledAssetIds().size, "the plan named the recordings it placed").toBeGreaterThan(0);
    } else {
      // The other half of the same claim: a pattern whose recorded lanes carry no notes must place nothing —
      // "scheduled something anyway" would be the doubling this whole module exists to prevent.
      expect(scheduleSamplerStepsMock, "a mapped lane with no notes must place nothing").not.toHaveBeenCalled();
    }
  }, 30000);

  it("⭐ re-plans after a pause, so the second half of the round is not silent", async () => {
    const { ChallengeView } = await import("../views/ChallengeView");
    render(
      <LanguageProvider>
        <ChallengeView onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    await clickAfterEffects(/点击开始听辨|Start Listening/i);
    await waitFor(() => expect(engineMock.play).toHaveBeenCalled(), { timeout: 10000 });
    // ⭐ **The seam must have run at all**, whatever this round's lanes carry: with the wiring removed this is the
    // assertion that goes red, rather than the resume count below being skipped by a `planned === 0` round.
    await waitFor(() => expect(engineMock.prepareSampledLanes).toHaveBeenCalled(), { timeout: 10000 });
    const planned = await plannedEventCount(lastPattern());
    // ⭐ The round is drawn from a pool that contains mapped-but-silent lanes (a drum lane whose steps are empty), so
    // the resume claim is only meaningful when this round really carries notes on a recorded lane.
    if (planned === 0) return;
    await waitFor(() => expect(scheduleSamplerStepsMock).toHaveBeenCalled(), { timeout: 10000 });
    const afterStart = scheduleSamplerStepsMock.mock.calls.length;
    expect(afterStart, "the first pass placed a voice before the pause is judged").toBeGreaterThan(0);

    await clickAfterEffects(/暂停|Pause/i);
    expect(engineMock.pause, "the Pause button reaches the engine's own pause").toHaveBeenCalled();
    await clickAfterEffects(/^▶?\s*(播放|Play)$/i);

    await waitFor(
      () =>
        expect(
          scheduleSamplerStepsMock.mock.calls.length,
          "a resume must re-plan the recorded lanes, or the rest of the round is silent"
        ).toBeGreaterThan(afterStart),
      { timeout: 10000 }
    );
  }, 30000);
});

describe("CompareView · the A/B audition sounds the recordings it is comparing", () => {
  it("⭐ stands the synthesiser down AND schedules the lane from its samples", async () => {
    const { CompareView } = await import("../views/CompareView");
    const pair = [GENRES_MAP["chicago-house"], GENRES_MAP["bebop"]].filter(Boolean);
    render(
      <LanguageProvider>
        <CompareView initialGenres={pair} onSelectGenre={vi.fn()} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    await clickFirstAfterEffects(/仅鼓组|Drums Only/i);

    await waitFor(() => expect(engineMock.play).toHaveBeenCalled(), { timeout: 10000 });
    const planned = await plannedEventCount(lastPattern());
    await expectRecordedLanesStoodDown("the A/B audition", planned);
  }, 30000);
});

/**
 * ⭐ **The reverse criterion: the console route must NOT sound a recorded lane, and the reason is structural.**
 *
 * `HardwareConsoleView` builds its own engine and hands it to `ConsolePanel`, which is a **mixing desk**: it syncs
 * tempo, swing, mixer state and metering, and deliberately does **not** choose which pattern plays (that decision lives
 * in the studio's lifecycle hook, because the panel is also mounted *inside* the studio over the studio's own engine).
 * So on `/console` the transport button calls `engine.play()` on an engine that was never given a pattern — and
 * `AudioEngine`'s scheduler returns immediately without one.
 *
 * That makes this route **not affected by the sampled-lane defect**: there is no lane of any kind to be wrong about.
 * The assertion is the reason (never `setPattern`, never a stand-down, never a scheduled note), not a count — so if
 * someone later wires a pattern into this route, this case goes red and forces the full wiring rather than half of it.
 */
describe("HardwareConsoleView · a mixing desk plays no lanes, so it cannot play the wrong one", () => {
  it("⭐ never sets a pattern, never stands a lane down and never schedules a sampler step", async () => {
    const { HardwareConsoleView } = await import("../views/HardwareConsoleView");
    render(
      <LanguageProvider>
        <HardwareConsoleView selectedGenre={JAZZ} onOpenStudio={vi.fn()} />
      </LanguageProvider>
    );

    // The transport button the panel owns, pressed on the standalone route.
    await settle();
    await clickElement(await screen.findByTestId("console-transport-toggle", undefined, { timeout: 10000 }));

    for (const engine of engineInstances) {
      expect(
        (engine as { setPattern: ReturnType<typeof vi.fn> }).setPattern,
        "the console route chose a pattern for its engine — the pattern belongs to the studio's lifecycle, and a route that owns one now owns its recorded lanes too"
      ).not.toHaveBeenCalled();
    }
    expect(engineMock.prepareSampledLanes, "a desk with no pattern has no lane to stand down").not.toHaveBeenCalled();
    expect(scheduleSamplerStepsMock, "a desk with no pattern has no sampler step to place").not.toHaveBeenCalled();
  }, 30000);
});
