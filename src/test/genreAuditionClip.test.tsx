/**
 * ⭐ **The shared single-genre audition plays the pre-cut clip — and can be told to stay on the engine.**
 *
 * `useGenreAudition` is the one audition the two timeline views share (the earlier note that they had none was wrong),
 * so the owner's rule lives here: the toggle plays the manifest's MP3 when the genre has one, loops it like the engine it
 * replaces, and is paused by stop, by a genre switch and by unmount. The clips are the full mix, so `drums` does not
 * exist on this path and there is nothing to keep live for it.
 *
 * The hook has no JSX, so the element is imperative: `new Audio(url)` is doubled here and its `src`/`play`/`pause` are
 * watched, which is the interaction this file exists to pin. `clips: false` is the phone shell's opt-out — it keeps the
 * hook's engine for the jam / explore modules it must not turn into a clip player.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { GENRES_MAP } from "../data/genres";
import { useGenreAudition } from "../hooks/useGenreAudition";

const CLIP_URL = "https://r2mirror.groove.wangda.today/clips/bebop.mp3";
const JAZZ = GENRES_MAP["bebop"] ?? GENRES_MAP["traditional-jazz"] ?? Object.values(GENRES_MAP)[0];

const { clipState } = vi.hoisted(() => ({ clipState: { clip: undefined as unknown } }));
vi.mock("../data/genreClips", () => ({
  readClipManifest: () => ({ bars: 8, clips: [] }),
  clipForGenre: () => clipState.clip,
  staleClips: () => [],
}));

const { audioPlayMock, audioPauseMock, audioSources } = vi.hoisted(() => ({
  audioPlayMock: vi.fn(async () => undefined),
  audioPauseMock: vi.fn(),
  audioSources: [] as string[],
}));

const { engineMock, AudioEngineCtor } = vi.hoisted(() => {
  const engineMock = {
    onLoopWrap: undefined as ((t: number) => void) | undefined,
    setOnStep: vi.fn(),
    setMetronome: vi.fn(),
    getMetronome: vi.fn(() => false),
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    getBpm: vi.fn(() => 120),
    stop: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
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
  return { engineMock, AudioEngineCtor: vi.fn(() => engineMock) };
});

vi.mock("../audio/AudioEngine", () => ({ AudioEngine: AudioEngineCtor }));
vi.mock("../audio/VinylScrub", () => ({
  createVinylScrub: () => ({ applyBpm: vi.fn(), dispose: vi.fn(), scrubTo: vi.fn() }),
}));
vi.mock("../data/sampleCatalogueRuntime", () => ({
  appCatalogueRuntime: { load: async () => ({ assets: [], problems: [] }) },
}));
/** The engine path is only reached to prove the opt-out keeps it; its sampler controller is doubled so the empty
 *  catalogue cannot fill the log with one warning per step. */
vi.mock("../audio/samplerLanePlayback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/samplerLanePlayback")>();
  return {
    ...actual,
    createSamplerLanePlayback: () => ({ play: async () => undefined, stop: () => 0, sounding: 0 }),
  };
});

const CLIP = {
  genreId: "bebop",
  url: CLIP_URL,
  seconds: 16.6,
  engineVersion: "2.36.6",
  recipeVersion: "1",
  generatedAt: "2026-10-11",
  recordedLanes: 3,
  builtInLanes: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  clipState.clip = undefined;
  audioSources.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ bars: 8, clips: [] }) })));
  /**
   * ⭐ A real jsdom `<audio>` with the two methods doubled. The production helper now **attaches** the element (hidden,
   * with the clip testid) so a probe can see it, so a plain object stub would fail at `appendChild`/`setAttribute`.
   */
  vi.stubGlobal("Audio", function AudioStub(url?: string) {
    const el = document.createElement("audio");
    el.setAttribute("src", url ?? "");
    el.play = audioPlayMock as unknown as HTMLMediaElement["play"];
    el.pause = audioPauseMock as unknown as HTMLMediaElement["pause"];
    audioSources.push(url ?? "");
    return el;
  });
});
afterEach(() => vi.unstubAllGlobals());

/** Let the manifest request and the catalogue request settle before the press. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe("the shared audition plays the clip", () => {
  it("⭐ sounds the genre's clip on the toggle, and pauses it on the second press", async () => {
    clipState.clip = CLIP;
    const { result, unmount } = renderHook(() => useGenreAudition());
    await settle();

    await act(async () => {
      await result.current.toggleAudition(JAZZ);
    });
    expect(audioSources, "the clip's own URL is what plays").toEqual([CLIP_URL]);
    expect(audioPlayMock).toHaveBeenCalled();
    expect(result.current.playingGenreId).toBe(JAZZ.id);
    expect(AudioEngineCtor, "the clip is the sound; no engine starts").not.toHaveBeenCalled();

    await act(async () => {
      await result.current.toggleAudition(JAZZ);
    });
    expect(audioPauseMock).toHaveBeenCalled();
    expect(result.current.playingGenreId).toBeNull();
    unmount();
  }, 15000);

  it("⭐ pauses the clip when the consumer unmounts", async () => {
    clipState.clip = CLIP;
    const { result, unmount } = renderHook(() => useGenreAudition());
    await settle();
    await act(async () => {
      await result.current.toggleAudition(JAZZ);
    });
    audioPauseMock.mockClear();
    unmount();
    expect(audioPauseMock).toHaveBeenCalled();
  }, 15000);

  it("⭐ keeps the live engine when the caller passes clips: false", async () => {
    clipState.clip = CLIP;
    const { result } = renderHook(() => useGenreAudition({ clips: false }));
    await settle();

    await act(async () => {
      await result.current.toggleAudition(JAZZ);
    });
    expect(audioSources, "the phone shell's opt-out must not mount a clip").toEqual([]);
    expect(AudioEngineCtor).toHaveBeenCalled();
  }, 15000);
});
