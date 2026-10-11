/**
 * ⭐ **The genre page's full audition is the clip, and this pins the press.**
 *
 * The owner's decision (2026-10-11): `full` plays the pre-generated MP3 named by the manifest, `drums` keeps the live
 * engine. The manifest is mocked rather than `fetch`ed because the reader is deliberately strict — a stub one field short
 * would test the reader, not the view — and the engine is doubled because jsdom has no WebAudio. The pattern is the one
 * `mobileClipPlayback.test.tsx` proved: `vi.mock` + `vi.hoisted`, a stubbed `HTMLMediaElement.prototype.play`, and the
 * tree wrapped in `LanguageProvider`.
 *
 * The engine half of the harness is `genreDetailSamplerLoading.test.tsx`'s, so the drums press reaches `engine.play()`
 * through the same prepare-then-transport path the real view uses.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { GENRES_MAP } from "../data/genres";
import { GenreDetailView } from "../views/GenreDetailView";

const JAZZ = GENRES_MAP["bebop"] ?? GENRES_MAP["traditional-jazz"] ?? Object.values(GENRES_MAP)[0];
const CLIP_URL = "https://r2mirror.groove.wangda.today/clips/bebop.mp3";

const { clipRecord, otherClip, clipState } = vi.hoisted(() => ({
  clipRecord: {
    genreId: "bebop",
    url: "https://r2mirror.groove.wangda.today/clips/bebop.mp3",
    seconds: 16.6,
    engineVersion: "2.36.6",
    recipeVersion: "1",
    generatedAt: "2026-10-11",
    recordedLanes: 3,
    builtInLanes: 2,
  },
  otherClip: {
    genreId: "detroit-techno",
    url: "https://r2mirror.groove.wangda.today/clips/detroit-techno.mp3",
    seconds: 16.6,
    engineVersion: "2.36.6",
    recipeVersion: "1",
    generatedAt: "2026-10-11",
    recordedLanes: 3,
    builtInLanes: 2,
  },
  /** Flipped by the no-clip case: a valid manifest that simply does not name this genre. */
  clipState: { found: true },
}));

vi.mock("../data/genreClips", () => ({
  readClipManifest: () => ({ bars: 8, clips: [otherClip] }),
  clipForGenre: () => (clipState.found ? clipRecord : undefined),
  staleClips: () => [],
}));

const playMock = vi.fn(async () => undefined);
const pauseMock = vi.fn();

const { order, engineMock, AudioEngineCtor } = vi.hoisted(() => {
  const order: string[] = [];
  const engineMock = {
    onLoopWrap: undefined as ((t: number) => void) | undefined,
    setOnStep: vi.fn(),
    setOnPlay: vi.fn(),
    setOnStop: vi.fn(),
    setMetronome: vi.fn(),
    getMetronome: vi.fn(() => false),
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    getBpm: vi.fn(() => 120),
    setTrackState: vi.fn(),
    getTrackState: vi.fn(() => undefined),
    getTrackStates: vi.fn(() => []),
    stop: vi.fn(),
    destroy: vi.fn(),
    getIsPlaying: vi.fn(() => false),
    getCurrentStep: vi.fn(() => 0),
    getStepDuration: vi.fn(() => 0.125),
    setMasterVolume: vi.fn(),
    prepareSampledLanes: vi.fn(() => ({ stoodDown: [], problems: [] })),
    play: vi.fn(async () => {
      order.push("engine.play");
    }),
    audioContext: { currentTime: 0 } as unknown as BaseAudioContext,
    musicDestination: { connect: vi.fn() } as unknown as AudioNode,
  };
  return { order, engineMock, AudioEngineCtor: vi.fn(() => engineMock) };
});

vi.mock("../audio/AudioEngine", () => ({ AudioEngine: AudioEngineCtor }));

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

const renderPage = () =>
  render(
    <LanguageProvider>
      <GenreDetailView
        genre={JAZZ}
        onBack={() => undefined}
        onSelectGenre={() => undefined}
        onOpenStudio={() => undefined}
        onAddToCompare={() => undefined}
      />
    </LanguageProvider>
  );

const clipAudio = (container: HTMLElement) => container.querySelector("[data-testid='clip-audition-audio']");

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  clipState.found = true;
  /**
   * ⭐ The hook fetches the manifest itself before reading it; the *reader* is mocked, but the request still has to
   * succeed, or the manifest stays null and every genre looks clipless forever.
   */
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ bars: 8, clips: [clipRecord] }) })));
  // ⭐ jsdom implements no media; without the stub the element's own play would throw "not implemented".
  HTMLMediaElement.prototype.play = playMock as unknown as HTMLMediaElement["play"];
  HTMLMediaElement.prototype.pause = pauseMock as unknown as HTMLMediaElement["pause"];
  // A recording that resolves, so the drums press reaches `engine.play()` instead of stopping at the prepare gate.
  loadNoteMock.mockImplementation(async () => ({ buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" }));
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("/genre · the clip audition", () => {
  it("⭐ plays the genre's pre-cut clip on a full audition, without starting the engine", async () => {
    const { container } = renderPage();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The label only says "clip" once the manifest has resolved one, so waiting for it is waiting for the clip.
    const full = await screen.findByRole("button", { name: /Audition Pre-cut Clip/i }, { timeout: 6000 });
    fireEvent.click(full);

    await waitFor(() => expect(clipAudio(container)).toBeTruthy(), { timeout: 6000 });
    expect(clipAudio(container)?.getAttribute("src")).toBe(CLIP_URL);
    await waitFor(() => expect(playMock).toHaveBeenCalled(), { timeout: 6000 });
    expect(order, "the clip is the sound; the engine must not also start").not.toContain("engine.play");
  }, 15000);

  it("⭐ keeps the engine for a drums audition and mounts no clip element", async () => {
    const { container } = renderPage();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.click(await screen.findByRole("button", { name: /Audition Drums Only/i }, { timeout: 6000 }));

    await waitFor(() => expect(order).toContain("engine.play"), { timeout: 6000 });
    expect(clipAudio(container), "a drums audition has no clip to play").toBeNull();
  }, 15000);

  it("⭐ says so at the press when the genre has no clip, instead of a silent nothing", async () => {
    /**
     * ⭐ The regression this pins: the sentence used to be gated on `isPlaying`, which the engine path only sets
     * **after** its sampler preparation resolves — so a clipless genre showed nothing at all until then (and never,
     * if the recordings refused to start). Measured in a browser. It must now appear with the press.
     */
    clipState.found = false;
    renderPage();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const full = await screen.findByRole("button", { name: /Audition Full Tracks/i }, { timeout: 6000 });
    fireEvent.click(full);

    const fallback = await screen.findByTestId("clip-audition-fallback", {}, { timeout: 6000 });
    expect(fallback.textContent).toMatch(/No pre-cut clip for this genre/i);
    expect(clipAudio(document.body), "the engine path mounts no clip element").toBeNull();
  }, 15000);
});
