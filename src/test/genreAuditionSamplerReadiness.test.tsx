/**
 * ⭐ **"正在获取音源" — and the transport does not start until it has.**
 *
 * The owner's second and third asks: show that the recordings are being fetched, and start playing **when they are ready**. Before this, the
 * genre audition started the transport first and let `scheduleSamplerSteps` await a fetch and a decode per note behind it, so the recorded
 * lanes — which the engine had just stood down — opened the bar silent, and every onset whose time had passed when the bytes arrived was
 * started immediately, i.e. as a burst rather than as music.
 *
 * ## How the criterion is able to fail
 *
 * The loader is the seam: `sharedSamplerLoader` is doubled here so a case can hold a note's resolution open and look at the world **while the
 * load is still running**. `AudioEngine` is doubled for the reason every other audio criterion doubles it — jsdom has no WebAudio — and the
 * catalogue is doubled to the shipped manifest so that the lanes really are stood down (with an empty catalogue there is nothing to wait for,
 * which is a fact this module's own guard relies on and is asserted separately below).
 *
 * The red is read by removing the wait from `useGenreAudition.toggleAudition`: `engine.play` is then called before the first `loadNote`, the
 * first assertion fails, and `samplerPreparation` is never observed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { GENRES_MAP } from "../data/genres";

/** A jazz style whose lanes the palette maps — `sax_lead` on the lead, `walking_upright` on the bass. */
const JAZZ = GENRES_MAP["bebop"] ?? GENRES_MAP["traditional-jazz"] ?? Object.values(GENRES_MAP)[0];

/** Every call, in the order it happened — the one piece of evidence "ready, then play" is made of. */
const { order, engineMock, AudioEngineCtor } = vi.hoisted(() => {
  const order: string[] = [];
  const engineMock = {
    onLoopWrap: undefined as ((t: number) => void) | undefined,
    setOnStep: vi.fn(),
    setMetronome: vi.fn(),
    getMetronome: vi.fn(() => false),
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    getBpm: vi.fn(() => 120),
    stop: vi.fn(),
    play: vi.fn(async () => {
      order.push("engine.play");
    }),
    scrubTo: vi.fn(),
    getIsPlaying: vi.fn(() => true),
    getCurrentStep: vi.fn(() => 0),
    getStepDuration: vi.fn(() => 0.125),
    setMasterVolume: vi.fn(),
    destroy: vi.fn(),
    prepareSampledLanes: vi.fn(() => ({ stoodDown: [], problems: [] })),
    getTrackState: vi.fn(() => undefined),
    getTrackStates: vi.fn(() => []),
    audioContext: { currentTime: 0 } as unknown as BaseAudioContext,
    musicDestination: { connect: vi.fn() } as unknown as AudioNode,
  };
  return { order, engineMock, AudioEngineCtor: vi.fn(() => engineMock) };
});

vi.mock("../audio/AudioEngine", () => ({ AudioEngine: AudioEngineCtor }));
vi.mock("../audio/VinylScrub", () => ({
  createVinylScrub: () => ({ applyBpm: vi.fn(), dispose: vi.fn(), scrubTo: vi.fn() }),
}));

/** The scheduler is not what is under test: whether a note *was fetched before the transport* is. */
const { scheduleSamplerStepsMock } = vi.hoisted(() => {
  const scheduleSamplerStepsMock = vi.fn();
  scheduleSamplerStepsMock.mockImplementation(async () => ({
    started: 0,
    voices: [],
    problems: [] as string[],
    legato: { carried: 0, refused: [], started: 0 },
  }));
  return { scheduleSamplerStepsMock };
});
vi.mock("../audio/samplerSteps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/samplerSteps")>();
  return { ...actual, scheduleSamplerSteps: scheduleSamplerStepsMock };
});

/**
 * ⭐ **The seam the criterion controls.** `loadNote` is held open on a promise the case releases, so "before ready" is a state that can be
 * observed rather than a race that has to be won.
 */
const { loadNoteMock, loaderStub } = vi.hoisted(() => {
  const loadNoteMock = vi.fn();
  return {
    loadNoteMock,
    loaderStub: {
      loadNote: loadNoteMock,
      load: vi.fn(async () => ({}) as AudioBuffer),
      decodes: vi.fn(() => 0),
    },
  };
});
vi.mock("../audio/sharedSamplerLoader", () => ({ sharedSamplerLoader: () => loaderStub }));

/** The shipped manifest, so the pattern's lanes really resolve through the catalogue the stand-down rule reads. */
const { catalogueLoadMock } = vi.hoisted(() => ({ catalogueLoadMock: vi.fn() }));
vi.mock("../data/sampleCatalogueRuntime", async () => {
  const { readFileSync } = await import("node:fs");
  const { catalogueFromManifestText } = await import("../data/sampleCatalogue");
  const { assets } = catalogueFromManifestText(
    readFileSync("public/samples/manifest.json", "utf8"),
    "https://r2mirror.groove.wangda.today"
  );
  catalogueLoadMock.mockImplementation(async () => ({ assets, problems: [] }));
  return { appCatalogueRuntime: { load: catalogueLoadMock } };
});

beforeEach(() => {
  vi.clearAllMocks();
  engineMock.onLoopWrap = undefined;
  order.length = 0;
});
afterEach(() => vi.clearAllMocks());

/** Let the mount effect's catalogue load settle, so the case is about the wait rather than about a race with the manifest. */
async function mountWithCatalogue() {
  const { useGenreAudition } = await import("../hooks/useGenreAudition");
  const rendered = renderHook(() => useGenreAudition());
  await waitFor(() => expect(catalogueLoadMock).toHaveBeenCalled());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return rendered;
}

describe("a genre audition waits for its recordings, visibly", () => {
  it("⭐ does not start the transport until every needed recording is decoded, then starts it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    loadNoteMock.mockImplementation(async () => {
      order.push("loadNote");
      await gate;
      return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
    });

    const { result } = await mountWithCatalogue();
    await act(async () => {
      void result.current.toggleAudition(JAZZ);
      await Promise.resolve();
    });

    // ⭐ "Before ready": the recordings are being fetched, the transport has NOT started…
    await waitFor(() => expect(loadNoteMock).toHaveBeenCalled());
    expect(order, "the transport started before the recordings were ready").not.toContain("engine.play");
    // …and that wait is visible rather than a silent pause — a determinate count, known before the first note resolves.
    expect(result.current.samplerPreparation, "the wait was not observable, so a surface could only show a lie").not.toBeNull();
    expect(result.current.samplerPreparation!.total).toBeGreaterThan(0);
    expect(result.current.samplerPreparation!.loaded).toBe(0);
    expect(result.current.playingGenreId).toBeNull();

    await act(async () => {
      release();
      await Promise.resolve();
    });

    // ⭐ "After ready": the notes were resolved first, then the transport started, and the wait is gone.
    await waitFor(() => expect(order).toContain("engine.play"));
    expect(order.indexOf("loadNote")).toBeLessThan(order.indexOf("engine.play"));
    expect(result.current.samplerPreparation).toBeNull();
    expect(result.current.playingGenreId).toBe(JAZZ.id);
  });

  it("starts nothing when no recording could be prepared, and says so instead of waiting forever", async () => {
    loadNoteMock.mockImplementation(async () => {
      throw new Error("HTTP 404");
    });

    const { result } = await mountWithCatalogue();
    await act(async () => {
      await result.current.toggleAudition(JAZZ);
    });

    expect(order, "a press that could not get its recordings must not start a transport").not.toContain("engine.play");
    expect(result.current.samplerPreparation).toBeNull();
    expect(result.current.playingGenreId).toBeNull();
  });

  it("does not wait at all when the engine stood nothing down — the empty-catalogue case", async () => {
    catalogueLoadMock.mockImplementation(async () => ({ assets: [], problems: [] }));
    loadNoteMock.mockImplementation(async () => {
      order.push("loadNote");
      return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
    });

    const { result } = await mountWithCatalogue();
    await act(async () => {
      await result.current.toggleAudition(JAZZ);
    });

    // With no catalogue nothing is stood down, so nothing is silent and there is nothing to fetch for.
    expect(loadNoteMock).not.toHaveBeenCalled();
    expect(order).toContain("engine.play");
    expect(result.current.samplerPreparation).toBeNull();
  });
});
