/**
 * ⭐ **The three waits the audit found, and the reading that says each one is now visible and escapable.**
 *
 * ## What each case is written against, and how it is read red
 *
 * **② the studio strip's M button is NOT the bug the audit reported.** The audit read
 * `aria-pressed` by re-finding the button **by its old `aria-label`**, and that label changes on press
 * (`静音` → `取消静音`, `TrackRow.tsx`), so the re-query returned the *next* track's button — which is
 * unmuted and therefore correctly `false`. Measured with the element held by identity instead
 * (`/var/tmp/uxfix/base-live.json`, live 2.34.44, load 16.6): `aria-pressed` `false → true`, engine
 * `trackStates[0].mute` `false → true`, and the stale-label query landed on **index 112 instead of 99**.
 * The criterion below therefore holds the element and asserts both facts, and it is the *only* change
 * ② needed: delete `aria-pressed={isMute}` from `TrackRow.tsx` and it goes red.
 *
 * **③ the press must show a wait on the same frame, and a failure must be retryable.** Measured before
 * the change (same file, live): first visible wait **3 204 ms** after the click, `clickToRunning`
 * **12 524 ms**, and during all of it the button still read 「播放」 with `disabled=false`. Case 1
 * asserts `data-preparation="preparing"` **synchronously after `fireEvent.click` returns** — which is
 * "the same frame" in React 18, because the handler's synchronous prefix ends at the first `await`.
 * Delete the `setTransportPreparation("preparing")` line and it goes red. Case 2 fails the
 * preparation and presses again; delete the retry (the ticket, or the failure state) and it goes red.
 *
 * **④ a 214-second export with no percentage and no way out.** Measured before the change (same file,
 * live): **214 522 ms**, 1 download only at the very end, `[role=progressbar]` **0**, cancel buttons
 * **0**. Case 3 drives `onRenderProgress` — the renderer's own seam, already present at
 * `WavExporter.ts`'s `RenderWavOptions` — and asserts the export button draws the number; delete the
 * `onRenderProgress: progressFor(...)` wiring and the number stays 0, so it goes red. Case 4 cancels
 * mid-render and asserts no download: that is the whole of the promise (`OfflineAudioContext` has no
 * abort and `src/audio/**` is read-only here), and deleting the checkpoint makes it red.
 *
 * ## Why this is a file of its own
 *
 * `studioSamplerLoading.test.tsx` already pins the wait's *ordering* and the shared loader, and the
 * audit's brief requires those criteria to stay byte-identical. These are new facts — a state, its
 * retry, a percentage and a cancel — so they are new criteria in a new file rather than edits to
 * someone else's.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/** The scheduler is doubled so the recorded-lane half needs no audio graph; the wait is what is judged here. */
vi.mock("../audio/samplerSteps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/samplerSteps")>();
  return {
    ...actual,
    scheduleSamplerSteps: vi.fn(async () => ({ started: 0, voices: [], problems: [], legato: { carried: 0, refused: [], started: 0 } })),
  };
});

/**
 * The wait's own loader, with `loadNote` under the test's control — `loadNoteMock` is what gates a
 * preparation open and closed, so "the button says preparing while the download is in flight" is a
 * fact about the wiring rather than about how fast the machine is.
 */
const { loadNoteMock, sharedSamplerLoaderMock, loaderBuilds } = vi.hoisted(() => {
  const loaderBuilds = { count: 0 };
  /**
   * ⚠️ **A resolved note, not `undefined`.** `observingSamplerLoader` reads `answer.samplePath` off
   * every answer, so a double that resolves with nothing makes *every* note a problem and the
   * preparation fails for a reason that has nothing to do with the code under test. Measured: that is
   * exactly how the first draft of this file went red ("Cannot read properties of undefined (reading
   * 'samplePath')", twelve times).
   */
  const resolvedNote = () => ({ buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" });
  const loadNoteMock = vi.fn(async () => resolvedNote());
  const build = () => ({
    loadNote: loadNoteMock,
    load: vi.fn(async () => ({}) as AudioBuffer),
    decodes: vi.fn(() => 0),
  });
  const memo = new Map<string, ReturnType<typeof build>>();
  const sharedSamplerLoaderMock = vi.fn((_context: unknown, _catalogue: unknown) => {
    const key = "session";
    const existing = memo.get(key);
    if (existing) return existing;
    const loader = build();
    memo.set(key, loader);
    loaderBuilds.count += 1;
    return loader;
  });
  return { loadNoteMock, sharedSamplerLoaderMock, loaderBuilds };
});
vi.mock("../audio/sharedSamplerLoader", () => ({
  sharedSamplerLoader: sharedSamplerLoaderMock,
  sharedSamplerLoaderBuilds: () => loaderBuilds.count,
}));

vi.mock("../data/sampleCatalogueRuntime", async () => {
  const { catalogueFromManifestText } = await import("../data/sampleCatalogue");
  const { assets } = catalogueFromManifestText(
    readFileSync("public/samples/manifest.json", "utf8"),
    "https://r2mirror.groove.wangda.today"
  );
  return {
    appCatalogueRuntime: { assets, problems: [], ready: true, configured: true, loading: false, load: async () => ({ assets, problems: [] }) },
  };
});

/**
 * The renderer's two seams, doubled: `exportMasterWav` resolves when the test says so, and it reports
 * progress through **the option the production code passes** (`onRenderProgress`) rather than through
 * anything this file invents. `triggerWavDownload` is the download event the cancel criterion reads.
 */
const { exportMasterWavMock, triggerWavDownloadMock, renderProgressCalls } = vi.hoisted(() => {
  const renderProgressCalls: Array<(frames: number, total: number) => void> = [];
  return {
    exportMasterWavMock: vi.fn(),
    triggerWavDownloadMock: vi.fn(),
    renderProgressCalls,
  };
});
vi.mock("../audio/WavExporter", () => ({
  EXPORT_MEMORY_WARN_BYTES: 220 * 1024 * 1024,
  estimateExportMemoryBytes: () => ({ buffers: 0, encoded: 0, peak: 0, megabytes: 0 }),
  exportMasterWav: exportMasterWavMock,
  exportStemsZip: vi.fn(),
  exportMasterMp3: vi.fn(),
  renderPatternOffline: vi.fn(),
  triggerWavDownload: triggerWavDownloadMock,
}));
vi.mock("../audio/Mp3Exporter", () => ({ exportMasterMp3: vi.fn(async () => ({ blob: new Blob(["x"]), filename: "x.mp3", bitrateKbps: 192, limiterKind: "worklet", gs1HostFailures: 0 })) }));

import { StudioView } from "../views/StudioView";

async function deltaBlues(): Promise<Genre> {
  return (await loadGenre("delta-blues"))!;
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
async function playButton(): Promise<HTMLElement> {
  await settle();
  return screen.findByRole("button", { name: /Play \/ Pause/i }, { timeout: 20000 });
}

beforeEach(() => {
  vi.clearAllMocks();
  renderProgressCalls.length = 0;
  order.length = 0;
  globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  localStorage.clear();
  localStorage.setItem("groove_language", "en");
  engineMock.isAudioBlocked.mockReturnValue(false);
  engineMock.prepareSampledLanes.mockReturnValue({ stoodDown: [], problems: [] });
  loadNoteMock.mockImplementation(async () => ({ buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" }));
  exportMasterWavMock.mockImplementation(async () => ({ blob: new Blob(["w"]), filename: "custom_master_120bpm.wav", durationSec: 1, limiterKind: "worklet", gs1HostFailures: 0 }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("② the studio strip's mute button tells the truth about its own state", () => {
  it("⭐ holds the element: aria-pressed follows the real mute, and the label change is why the audit misread it", async () => {
    renderStudio(await deltaBlues());
    await settle();

    /**
     * Held **by identity**, which is the whole point: the button renames itself on press
     * (`静音` → `取消静音`), so any query that names it by label describes a different element after the
     * click. This is the audit's reading reproduced deliberately, and then the truth beside it.
     */
    const muteButtons = screen.getAllByRole("button", { name: "Mute" });
    const held = muteButtons[0]!;
    expect(held.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(held);
    await settle();

    expect(held.getAttribute("aria-pressed"), "aria-pressed does not follow the mute the engine was given").toBe("true");
    expect(held.getAttribute("aria-label")).toBe("Unmute");
    expect(engineMock.setTrackState).toHaveBeenCalledWith(0, { mute: true });

    /**
     * And the trap itself, written down so nobody re-reports it: the *stale-label* query now answers
     * about track 1, which is unmuted — `false`, exactly the reading the audit took.
     */
    const staleQuery = screen.getAllByRole("button", { name: "Mute" })[0]!;
    expect(staleQuery).not.toBe(held);
    expect(staleQuery.getAttribute("aria-pressed")).toBe("false");

    // Pressing it again returns both readings to where they started.
    fireEvent.click(held);
    await settle();
    expect(held.getAttribute("aria-pressed")).toBe("false");
    expect(engineMock.setTrackState).toHaveBeenLastCalledWith(0, { mute: false });
  }, 120000);
});

describe("③ the press shows its own wait, and a failure can be retried", () => {
  it("⭐ the waiting state is on the button in the same frame as the press — not 3 204 ms later", async () => {
    /**
     * The preparation is held open by the loader, so the wait persists for as long as this test needs
     * it to: without that, "the state appeared" could be a fact about a fast machine.
     */
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    loadNoteMock.mockImplementation(async () => {
      order.push("loadNote");
      await gate;
      return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
    });

    renderStudio(await deltaBlues());
    const play = await playButton();

    // Nothing is being prepared yet, and the button is the ordinary Play button.
    expect(play.dataset.preparation).toBe("idle");
    expect(play.textContent).toContain("PLAY");

    fireEvent.click(play);

    /**
     * ⭐ **No `await`, no `waitFor`, no flush.** `fireEvent.click` runs the handler's synchronous
     * prefix inside `act`, and that prefix ends at the first `await` — so this assertion is exactly
     * "the frame the finger came off", which is what the audit's criterion asks for. Delete
     * `setTransportPreparation("preparing")` and this is `idle` and red.
     */
    expect(play.dataset.preparation, "the button did not say it was preparing on the press's own frame").toBe("preparing");
    expect(play.getAttribute("aria-busy")).toBe("true");
    expect(play.textContent).toMatch(/Preparing/);
    // And it is still a control: the whole defect was that this state had nothing to press.
    expect((play as HTMLButtonElement).disabled).toBe(false);
    expect(order).not.toContain("engine.play");
    // ①'s other half: the panel below still shows the same wait, so the two cannot tell two stories.
    await waitFor(() => expect(screen.getByTestId("sampler-loading")).toBeTruthy(), { timeout: 20000 });

    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(order).toContain("engine.play"), { timeout: 20000 });
    await waitFor(() => expect(play.dataset.preparation).toBe("idle"), { timeout: 20000 });
  }, 120000);

  it("⭐ a failed preparation says so on the button, and the same button retries it", async () => {
    let fail = true;
    loadNoteMock.mockImplementation(async () => {
      order.push("loadNote");
      if (fail) throw new Error("HTTP 404 from the mirror");
      return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
    });

    renderStudio(await deltaBlues());
    const play = await playButton();

    fireEvent.click(play);
    await waitFor(() => expect(play.dataset.preparation).toBe("failed"), { timeout: 20000 });
    expect(play.textContent).toMatch(/retry/i);
    // The reasons are beside it, naming the note — the failure is a sentence, not a stuck bar.
    await waitFor(() => expect(screen.getByTestId("sampler-problems")).toBeTruthy(), { timeout: 20000 });
    expect(order, "a failed preparation must not start a transport").not.toContain("engine.play");
    expect(screen.queryByTestId("sampler-loading")).toBeNull();

    /**
     * ⭐ **The retry.** The loader now succeeds; the *same* button is pressed again, and the run that
     * can actually finish is the one that starts a transport. Two facts make this a retry rather
     * than a second transport: the button says `preparing` again, and `loadNote` is asked again.
     */
    fail = false;
    const notesBefore = order.filter((one) => one === "loadNote").length;
    fireEvent.click(play);
    await waitFor(() => expect(order.filter((one) => one === "loadNote").length).toBeGreaterThan(notesBefore), { timeout: 20000 });
    await waitFor(() => expect(order).toContain("engine.play"), { timeout: 20000 });
    expect(play.dataset.preparation).toBe("idle");
  }, 120000);
});

describe("④ a long export has a percentage and a way out", () => {
  it("⭐ the export button carries the renderer's own progress, and a cancel stops the file", async () => {
    let finish!: (value: { blob: Blob; filename: string; durationSec: number; limiterKind: string; gs1HostFailures: number }) => void;
    exportMasterWavMock.mockImplementation(
      async (_pattern: unknown, _genre: string, options: { onRenderProgress?: (frames: number, total: number) => void }) => {
        if (options.onRenderProgress) renderProgressCalls.push(options.onRenderProgress);
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
    );

    renderStudio(await deltaBlues());
    await settle();

    fireEvent.click(document.querySelector('[data-toolbar-id="export"]')!);
    await settle();
    fireEvent.click(screen.getByTestId("export-wav"));

    /**
     * The button is busy from the click, and the progress element exists with a number rather than
     * only a spinner — that is the reading the audit could not take (`[role=progressbar]` = 0 in
     * `export2.json`).
     */
    await waitFor(() => expect(screen.getByTestId("export-progress")).toBeTruthy(), { timeout: 20000 });
    const bar = screen.getByTestId("export-progress");
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");

    // The renderer reports a tenth of the way in through the option the app passed it.
    expect(renderProgressCalls.length, "the app did not ask the renderer for progress").toBeGreaterThan(0);
    await act(async () => {
      renderProgressCalls.at(-1)!(4410, 44100);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(bar.getAttribute("aria-valuenow")).toBe("10");

    // And the way out is a real, named control beside it.
    const cancel = screen.getByTestId("export-cancel");
    expect(cancel.getAttribute("aria-label")).toBe("Cancel export");

    fireEvent.click(cancel);
    await settle();
    /**
     * ⭐ **The cancel's whole promise: no file.** The render itself cannot be aborted
     * (`OfflineAudioContext.startRendering()` has no abort and `src/audio/**` is read-only here), so the
     * run is allowed to finish and must then *decline to hand anything over*.
     */
    await act(async () => {
      finish({ blob: new Blob(["w"]), filename: "custom_master_120bpm.wav", durationSec: 1, limiterKind: "worklet", gs1HostFailures: 0 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(triggerWavDownloadMock, "a cancelled export still produced a download").not.toHaveBeenCalled();
    expect(screen.queryByTestId("export-progress")).toBeNull();
    expect(screen.queryByTestId("export-cancel")).toBeNull();
  }, 120000);
});
