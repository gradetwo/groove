/**
 * ⭐ **`/studio`: 点播放 ⇒ 看到"正在获取音源" ⇒ 就绪后才 `play()` —— 而且那条被映射的采样声部真的走到 `loadNote`。**
 *
 * ## The defect these criteria are written against, measured before the change
 *
 * The owner: *"我播放时候，没有 cache 模式，直接点播放，没看到哪里会提示下载音源"*. The visible half was the smaller one.
 * On `origin/dev`, pressing the studio's Play with `delta-blues` loaded produced (single-file probe, the real view, a
 * doubled engine and a gated loader):
 *
 * ```
 *   order                      ["engine.play"]   ← the transport started, nothing before it
 *   loadNote calls             0                 ← 12 distinct notes / 2 assets: not one was requested
 *   scheduleSamplerSteps calls 0                 ← nothing placed those lanes on the clock
 *   prepareSampledLanes calls  2                 ← the engine WAS told to stand their synthesisers down
 *   sampler-loading present    false
 * ```
 *
 * So a mapped lane was stood down from the synthesizer, sounded by nothing, and asked for no bytes: **silent**, which is
 * `src/hooks/useRecordedLanes.ts`'s own warning — *"Calling only the first is worse than the defect: a lane that played
 * the wrong instrument becomes a lane that plays nothing."* The wait was missing **and** the scheduler was.
 *
 * ## What each case pins, and how it is read red
 *
 *   1. **the wait, before the transport** — delete the `prepareRecordings` call from `handleTogglePlay` and the first
 *      assertion fails (`sampler-loading` never appears) and the ordering assertion fails (`engine.play` is `order[0]`);
 *   2. **the lanes reach the loader** — `loadNote` is `0` on `origin/dev`, so this is the owner's own complaint in the
 *      form a machine can read;
 *   3. **a scheduler places them** — `scheduleSamplerSteps` is `0` on `origin/dev`;
 *   4. **one download, not two** — the loader the wait warms and the loader the scheduler sounds through are the **same
 *      object**; delete `loaderFor: sharedLoaderFor` from `StudioView` and this fails while case 1 still passes, which is
 *      exactly the false green `src/test/samplerLanePrepare.test.ts`'s header warns about;
 *   5. **a failure is a sentence and no transport** — `loadNote` rejects ⇒ `sampler-problems` names the reason and
 *      `engine.play` is never called;
 *   6. **nothing to fetch says nothing** — `edm-trap`'s mapped lanes are drum lanes, which write no pitch, so
 *      `planSamplerSteps` plans **0** events and the panel must not raise a wait for work that does not exist.
 *
 * ## Why the doubles look like this
 *
 * jsdom has no Web Audio, so `AudioEngine` is doubled with the surface this route writes. `scheduleSamplerSteps` is
 * doubled because a real voice needs a graph — but the double **drains the loader** the caller handed it, so the chain
 * "warm → place" is exercised rather than skipped, and the loader identity in case 4 is a fact about the wiring rather
 * than about the double. The loader itself is a cache keyed exactly as `createSampleLoader`'s is (`src/audio/sampleLoader.ts`:
 * the decode cache holds the *promise*, keyed by the note), which is what lets case 4 read a second play as a cache hit;
 * the real `createSampleLoader` behaving that way is `samplerLanePrepare.test.ts`'s reading, and the two compose rather
 * than repeat.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { readFileSync } from "node:fs";
import { LanguageProvider } from "../i18n/LanguageContext";
import { loadGenre } from "../data/index/loader";
import type { Genre } from "../types/genre";

const { order, engineMock, AudioEngineCtor } = vi.hoisted(() => {
  const order: string[] = [];
  const engineMock = {
    onLoopWrap: undefined as ((t: number) => void) | undefined,
    setOnStep: vi.fn(),
    setOnPlay: vi.fn(),
    setOnStop: vi.fn(),
    setOnTrackTrigger: vi.fn(),
    setPreviewScope: vi.fn(),
    setPattern: vi.fn(),
    setBpm: vi.fn(),
    getBpm: vi.fn(() => 120),
    setSwing: vi.fn(),
    setTimeSignature: vi.fn(),
    setResolution: vi.fn(),
    setLoopRange: vi.fn(),
    setMetronome: vi.fn(),
    getMetronome: vi.fn(() => false),
    setCountIn: vi.fn(),
    setDrumKit: vi.fn(),
    setDrumsOnly: vi.fn(),
    setRecordArmed: vi.fn(),
    setTrackState: vi.fn(),
    getTrackState: vi.fn(() => undefined),
    getTrackStates: vi.fn(() => []),
    applyAudioMutes: vi.fn(),
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
    setMasterFilter: vi.fn(),
    setMasterSaturation: vi.fn(),
    setMasterChorus: vi.fn(),
    setMasterBitcrusher: vi.fn(),
    setSendLevel: vi.fn(),
    setTrackInstrument: vi.fn(),
    auditionTrack: vi.fn(),
    triggerNote: vi.fn(),
    previewChord: vi.fn(),
    getTrackCompressorReductionDb: vi.fn(() => 0),
    getAudioContext: vi.fn(() => null),
    getLiveRecorder: vi.fn(() => ({ setOnQuantizedStep: vi.fn() })),
    canReturnToStart: vi.fn(() => false),
    isAudioBlocked: vi.fn(() => false),
    getIsPlaying: vi.fn(() => false),
    getCurrentStep: vi.fn(() => 0),
    getStepDuration: vi.fn(() => 0.125),
    sampledLanesStoodDown: vi.fn(() => []),
    prepareSampledLanes: vi.fn(() => ({ stoodDown: [], problems: [] as string[] })),
    destroy: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(async () => {
      order.push("engine.play");
    }),
    audioContext: { currentTime: 0 } as unknown as BaseAudioContext,
    musicDestination: { connect: vi.fn() } as unknown as AudioNode,
  };
  return { order, engineMock, AudioEngineCtor: vi.fn(() => engineMock) };
});

vi.mock("../audio/AudioEngine", () => ({ AudioEngine: AudioEngineCtor }));

/**
 * ⭐ **The scheduler is doubled, but it drains the loader it was handed.**
 *
 * A real `scheduleSamplerSteps` needs a voice and a graph; a double that returned a canned report would leave the
 * "warm → place" chain untested, and case 4's loader identity would be a fact about a mock. So this one walks the plan
 * it was given and asks the **caller's own loader** for each note — which is the call the real one makes
 * (`src/audio/samplerSteps.ts:285`) — and records the loader so the criterion can compare it with the one the wait used.
 */
const { scheduleSamplerStepsMock, schedulerLoaders, schedulerPlans } = vi.hoisted(() => {
  const schedulerLoaders: unknown[] = [];
  const schedulerPlans: unknown[][] = [];
  const scheduleSamplerStepsMock = vi.fn(
    async (
      events: Array<{ assetId: string; pitch: number; technique?: string }>,
      input: { loader: { loadNote: (assetId: string, pitch: number, options?: unknown) => Promise<unknown> } }
    ) => {
      schedulerLoaders.push(input.loader);
      schedulerPlans.push(events);
      for (const event of events) {
        await input.loader.loadNote(
          event.assetId,
          event.pitch,
          event.technique === undefined ? undefined : { technique: event.technique }
        );
      }
      return { started: events.length, voices: [{ stop: () => undefined }], problems: [] as string[], legato: { carried: 0, refused: [], started: events.length } };
    }
  );
  return { scheduleSamplerStepsMock, schedulerLoaders, schedulerPlans };
});
vi.mock("../audio/samplerSteps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/samplerSteps")>();
  return { ...actual, scheduleSamplerSteps: scheduleSamplerStepsMock };
});

/**
 * ⭐ **The session's shared loader, as `sharedSamplerLoader` really behaves: one loader per (context, catalogue), with a
 * decode cache keyed by the note.**
 *
 * The identity half is the point of case 4: `sharedSamplerLoader` is memoised on the context, so the wait and the
 * scheduler arrive at the *same object* only when the view passes it both ways. `misses` is the cache — a note asked
 * twice through one loader decodes once, which is `createSampleLoader`'s documented rule and the reason a second press is
 * free.
 */
const { loadNoteMock, misses, loaderFor, sharedSamplerLoaderMock, loaderBuilds, resetLoaders } = vi.hoisted(() => {
  const misses = { count: 0 };
  /**
   * ⚠️ **The build counter has to exist on this mock, because the production code now reads it.**
   *
   * `useTransportControls` publishes `sharedSamplerLoaderBuilds()` into the diagnostics ledger, and a mock module that does
   * not export it makes the import throw *inside the click handler* — which reads as "the transport never started" rather
   * than as "the double is incomplete". Measured: that is exactly how this file first went red after the ledger landed.
   */
  const loaderBuilds = { count: 0 };
  const loadNoteMock = vi.fn();
  /**
   * ⚠️ **The memo is replaced by `resetLoaders`, not merely emptied.**
   *
   * `engineMock.audioContext` and the catalogue are module-level constants, so a memo that survived a test would hand the
   * next test the *same* loader — whose decode cache is already warm — and every "the first play decoded something"
   * assertion would read zero for a reason that has nothing to do with the code under test. Measured: that is exactly
   * how the first draft of this file failed.
   */
  let perContext = new WeakMap<object, Map<readonly unknown[], unknown>>();
  const build = () => {
    const seen = new Set<string>();
    return {
      loadNote: async (assetId: string, pitch: number, options?: { technique?: string }) => {
        await loadNoteMock(assetId, pitch, options);
        const key = `${assetId}\u0000${pitch}\u0000${options?.technique ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          misses.count += 1;
        }
        return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
      },
      load: vi.fn(async () => ({}) as AudioBuffer),
      decodes: vi.fn(() => misses.count),
    };
  };
  const loaderFor = (context: object, catalogue: readonly unknown[]) => {
    let byCatalogue = perContext.get(context);
    if (!byCatalogue) {
      byCatalogue = new Map();
      perContext.set(context, byCatalogue);
    }
    const existing = byCatalogue.get(catalogue);
    if (existing) return existing;
    const loader = build();
    byCatalogue.set(catalogue, loader);
    loaderBuilds.count += 1;
    return loader;
  };
  const resetLoaders = () => {
    misses.count = 0;
    loaderBuilds.count = 0;
    loadNoteMock.mockClear();
    perContext = new WeakMap();
  };
  return { loadNoteMock, misses, loaderFor, sharedSamplerLoaderMock: vi.fn(loaderFor), loaderBuilds, resetLoaders };
});
vi.mock("../audio/sharedSamplerLoader", () => ({
  sharedSamplerLoader: sharedSamplerLoaderMock,
  sharedSamplerLoaderBuilds: () => loaderBuilds.count,
}));

vi.mock("../data/sampleCatalogueRuntime", async () => {
  const { catalogueFromManifestText } = await import("../data/sampleCatalogue");
  const { readFileSync: rf } = await import("node:fs");
  const { assets } = catalogueFromManifestText(
    rf("public/samples/manifest.json", "utf8"),
    "https://r2mirror.groove.wangda.today"
  );
  return {
    appCatalogueRuntime: { assets, problems: [], ready: true, configured: true, loading: false, load: async () => ({ assets, problems: [] }) },
  };
});

import { StudioView } from "../views/StudioView";

/** A genre whose **melodic** lanes the palette maps: 7 mapped lanes, of which bass/chords/lead carry pitches. */
async function deltaBlues(): Promise<Genre> {
  return (await loadGenre("delta-blues"))!;
}
/** A genre whose two mapped lanes are **drum** lanes: the plan is empty and there is nothing to fetch. */
async function edmTrap(): Promise<Genre> {
  return (await loadGenre("edm-trap"))!;
}

function renderStudio(genre: Genre) {
  return render(
    <LanguageProvider>
      <StudioView selectedGenre={genre} onSelectGenre={vi.fn()} onViewDetail={vi.fn()} />
    </LanguageProvider>
  );
}

async function settle(ms = 30): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** The studio's Play/Pause control, found after the view's mount work has flushed. */
async function pressPlay(): Promise<void> {
  await settle();
  fireEvent.click(await screen.findByRole("button", { name: /Play \/ Pause/i }, { timeout: 20000 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLoaders();
  schedulerLoaders.length = 0;
  schedulerPlans.length = 0;
  order.length = 0;
  globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  localStorage.clear();
  localStorage.setItem("groove_language", "en");
  engineMock.onLoopWrap = undefined;
  engineMock.isAudioBlocked.mockReturnValue(false);
  engineMock.prepareSampledLanes.mockReturnValue({ stoodDown: [], problems: [] });
  loadNoteMock.mockImplementation(async () => undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("/studio · 点播放要先就绪，并且那条采样声部真的走 loadNote", () => {
  it("⭐ 未缓存时出现'正在获取音源'，且准备完成之后才 play()", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let gated = false;
    loadNoteMock.mockImplementation(async () => {
      order.push("loadNote");
      if (gated) await gate;
    });

    renderStudio(await deltaBlues());
    await settle();

    // Gate the *prepare* pass, which is the first thing that asks for a note.
    gated = true;
    await pressPlay();

    // ⭐ The wait is on the page, with a determinate count, and the transport has NOT started.
    await waitFor(() => expect(screen.getByTestId("sampler-loading")).toBeTruthy(), { timeout: 20000 });
    expect(screen.getByTestId("sampler-loading").textContent).toMatch(/\d+\s*\/\s*\d+/);
    expect(order, "the transport started while the recordings were still downloading").not.toContain("engine.play");

    gated = false;
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(order).toContain("engine.play"), { timeout: 20000 });
    await waitFor(() => expect(screen.queryByTestId("sampler-loading")).toBeNull(), { timeout: 20000 });
    // ⭐ The order is the whole point: the recordings resolved first, the transport second.
    expect(order.indexOf("loadNote"), "nothing was requested before the transport started").toBeGreaterThanOrEqual(0);
    expect(order.filter((one) => one === "loadNote").length).toBeGreaterThan(0);
    expect(order.indexOf("loadNote")).toBeLessThan(order.indexOf("engine.play"));
  }, 120000);

  it("⭐ 被映射的采样声部真的请求了音源（今天:0 次），并且有调度器把它们放上时钟", async () => {
    renderStudio(await deltaBlues());
    await pressPlay();

    await waitFor(() => expect(order).toContain("engine.play"), { timeout: 20000 });
    await waitFor(() => expect(scheduleSamplerStepsMock).toHaveBeenCalled(), { timeout: 20000 });

    // ① the engine's own resolver was asked for these lanes' bytes — not zero, which is `origin/dev`.
    expect(loadNoteMock.mock.calls.length, "no recording was requested at all").toBeGreaterThan(0);
    // ② a scheduler was handed a non-empty plan of *these* assets.
    const plan = schedulerPlans.at(-1) ?? [];
    expect(plan.length, "the scheduler was handed an empty plan, so nothing would have sounded").toBeGreaterThan(0);
    const assetIds = new Set(plan.map((event) => (event as { assetId: string }).assetId));
    expect([...assetIds].sort()).toEqual([
      "dsmolken-double-bass:d-smolken-rubner-bass-pizz",
      "karoryfer-emilyguitar:emily-clean",
    ]);
    // ⭐ The stand-down and the schedule describe the same lanes: the engine was told, and something played them.
    expect(engineMock.prepareSampledLanes).toHaveBeenCalled();
  }, 120000);

  it("⭐ 等待的那份下载就是发声的那份：两个 loader 是同一个对象，第二次播放是缓存命中", async () => {
    const view = renderStudio(await deltaBlues());
    await pressPlay();
    await waitFor(() => expect(scheduleSamplerStepsMock).toHaveBeenCalled(), { timeout: 20000 });
    await settle(50);

    const firstMisses = misses.count;
    expect(firstMisses, "the first play decoded nothing, so this criterion would be vacuous").toBeGreaterThan(0);

    /**
     * The scheduler's loader and the wait's loader must be one object — `sharedSamplerLoader` returns the same instance
     * for the same (context, catalogue), and both call sites pass the session's own array. Removing
     * `loaderFor: sharedLoaderFor` from `StudioView` gives the scheduler a loader built by `createSampleLoader` directly,
     * and this assertion fails while the wait above still passes.
     */
    expect(schedulerLoaders.length).toBeGreaterThan(0);
    const schedulerLoader = schedulerLoaders.at(-1);
    expect(
      sharedSamplerLoaderMock.mock.calls.length,
      "the session's shared loader was never asked for, so the warm-up and the sound cannot be one download"
    ).toBeGreaterThan(0);
    expect(schedulerLoader).toBe(sharedSamplerLoaderMock.mock.results.at(-1)?.value);

    view.unmount();
    const again = renderStudio(await deltaBlues());
    await pressPlay();
    await waitFor(() => expect(scheduleSamplerStepsMock.mock.calls.length).toBeGreaterThan(1), { timeout: 20000 });
    await settle(50);

    expect(
      misses.count,
      "the second play decoded notes again, so the warm-up was not the scheduler's own cache"
    ).toBe(firstMisses);
    again.unmount();
  }, 120000);

  it("失败要可见并且不许启动（静默启动即红）", async () => {
    loadNoteMock.mockImplementation(async () => {
      throw new Error("HTTP 404 from the mirror");
    });

    renderStudio(await deltaBlues());
    await pressPlay();

    await waitFor(() => expect(screen.getByTestId("sampler-problems")).toBeTruthy(), { timeout: 20000 });
    expect(screen.getByTestId("sampler-problems").textContent).toContain("HTTP 404");
    expect(order, "a press whose recordings all failed must not start a transport").not.toContain("engine.play");
    expect(screen.queryByTestId("sampler-loading")).toBeNull();
  }, 120000);

  it("⭐ 没有要下载的东西就不显示等待（edm-trap：映射了 2 条鼓声部，但它们不写音高）", async () => {
    renderStudio(await edmTrap());
    await pressPlay();

    await waitFor(() => expect(order).toContain("engine.play"), { timeout: 20000 });
    await settle(50);

    // The lanes ARE mapped and stand-down, so 0 notes is the plan's answer rather than "nothing was wired".
    expect(engineMock.prepareSampledLanes).toHaveBeenCalled();
    expect(scheduleSamplerStepsMock).not.toHaveBeenCalled();
    expect(loadNoteMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("sampler-loading"), "a progress display for work that never happened").toBeNull();
    expect(screen.queryByTestId("sampler-problems")).toBeNull();
  }, 120000);
});
