/**
 * ⭐ **"正在获取音源" is on the page — the owner's own route, and the owner's own complaint.**
 *
 * `/genre/bebop` is `GenreDetailView`, and before this it pressed play and let the fetch happen behind a transport that was already running:
 * the recorded lanes were stood down, so the bar opened with the sax and the bass **missing**, and when the bytes arrived every onset whose
 * time had passed started at once. This file is the UI half of the criterion — `genreAuditionSamplerReadiness.test.tsx` is the ordering half
 * against the hook.
 *
 * The page is rendered with the engine doubled (jsdom has no WebAudio) and the sample loader doubled to a gated stub, so "while the
 * recordings are loading" is a state that can be looked at rather than a race that has to be won. The red is read by deleting the
 * `preparing` block from the view: the testid then never appears, and the first assertion fails.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { GENRES_MAP } from "../data/genres";
import { GenreDetailView } from "../views/GenreDetailView";

const JAZZ = GENRES_MAP["bebop"] ?? GENRES_MAP["traditional-jazz"] ?? Object.values(GENRES_MAP)[0];

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

beforeEach(() => {
  vi.clearAllMocks();
  engineMock.onLoopWrap = undefined;
  order.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("/genre/bebop · the audition says it is fetching the recordings", () => {
  it("⭐ shows the wait while the recordings load, and starts the transport only once they are ready", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    loadNoteMock.mockImplementation(async () => {
      order.push("loadNote");
      await gate;
      return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
    });

    renderPage();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.click(screen.getByRole("button", { name: /Audition Full Tracks/i }));

    // ⭐ The wait is visible on the page, with a count, and the transport has not started.
    await waitFor(() => expect(screen.getByTestId("sampler-loading")).toBeTruthy());
    expect(screen.getByTestId("sampler-loading").textContent).toMatch(/\d+ \/ \d+/);
    expect(order, "the transport started while the recordings were still downloading").not.toContain("engine.play");

    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(order).toContain("engine.play"));
    expect(screen.queryByTestId("sampler-loading")).toBeNull();
    expect(order.indexOf("loadNote")).toBeLessThan(order.indexOf("engine.play"));
  });

  it("shows why nothing started, rather than a silent button", async () => {
    loadNoteMock.mockImplementation(async () => {
      throw new Error("HTTP 404");
    });

    renderPage();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(screen.getByRole("button", { name: /Audition Full Tracks/i }));

    await waitFor(() => expect(screen.getByTestId("sampler-problems")).toBeTruthy());
    expect(screen.getByTestId("sampler-problems").textContent).toContain("HTTP 404");
    expect(order, "a press whose recordings failed must not start a transport").not.toContain("engine.play");
    expect(screen.queryByTestId("sampler-loading")).toBeNull();
  });
});
