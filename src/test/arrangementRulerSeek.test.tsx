/**
 * ⭐ **The ruler said 「跳到第 4 小节」 and the transport stayed at bar one.**
 *
 * ## The reading this file is written against
 *
 * `/var/tmp/uxaudit/seek3.json` (live 2.34.44, load 18.4): a click on `ruler-bar-6` moved `arrangement-play-start`
 * from x **245 → 629** — the marker really moved — while `arrangement-position` stayed **`1.1`**, the playhead stayed
 * at x **249**, and all sixteen sampled steps after the next Play were `1.1 1.2 1.3 1.4 1.1 …`. Ableton's arrangement
 * view states the contract: *"You can click anywhere within a track to move the insert marker and set a new play
 * position."* One step there, no steps here — and the interface painted itself as clickable, which is worse than not
 * having the feature.
 *
 * ## What each case measures, and how it is read red
 *
 * **Case 1 — the engine's own contract.** `AudioEngine.seek` clamps to the pattern the transport holds and leaves a
 * position behind that `canReturnToStart()` reports (which is what lights the Stop control). Delete the clamp and the
 * first assertion goes red; delete the `resumeStep` write and the second does.
 *
 * **Case 2 — the whole gesture, on a real engine and a real player, with the scheduler driven by the fake clock
 * `audioScheduler.test.ts` uses.** Click bar 6, press Play, advance three seconds, and read the steps the scheduler
 * actually fired: every one of them is in bar 7 (steps 96–111), where before the change they were `0…15` on repeat.
 * Remove the `seekTransport?.()` line from `onRulerSelect` and this is the audit's reading again.
 *
 * **Case 3 — ⭐ the §26 half, measured rather than argued.** The engine and the recorded lanes are two clocks, and the
 * player owns the second one: `playerFromEngine.play` **stops the engine** when it has no held position and re-plans
 * the sampler lanes from step 0. So a seek that only moved the engine would be wiped by the very press it was meant to
 * affect, and the arrangement would sound the top of the piece over a playhead at bar seven. The producer of that
 * failure is one call — `createSamplerLanePlayback(...).play(bpm, { fromStep })` — and this case reads its argument:
 * **`{ fromStep: 96 }`**, not `{}`. That is what `player.pause()` in `onRulerSelect` buys, and deleting it turns this
 * red (`{}` and `engine.stop()` called).
 *
 * **Case 4 — the marker stops being a picture of a guess.** A ruler that draws eight bars over a pattern that holds
 * one is the same defect one layer down, and it exists today: `createArrangementFromTemplate` returns an arrangement
 * with **no `bars`**, so the ruler's fallback (eight) and the compile's answer (one) disagree — the disagreement
 * `features/arrangement/loopSteps.ts` was written about. The seek therefore reports where the transport **landed** and
 * the marker follows that, so an out-of-range click shows the position it really got rather than the one it asked for.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import { AudioEngine } from "../audio/AudioEngine";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import { DEFAULT_SAMPLER_ASSET } from "../data/defaultContent";
import { stepsPerBarFor } from "../data/noteEvents";
import type { ArrangementV2 } from "../types/arrangementV2";
import { FakeAudioContext, installFakeAudioContext } from "./helpers/fakeAudio";

/**
 * ⭐ The recorded-lane scheduler, doubled **so its argument can be read**.
 *
 * This is the seam `playerFromEngine` hands the sampler half its grid offset through, and the offset is the whole of
 * §26: the engine can start at bar seven while the recordings start at bar one, and nothing on screen says so.
 */
const { samplerPlayMock, samplerStopMock } = vi.hoisted(() => ({
  samplerPlayMock: vi.fn(async () => undefined),
  samplerStopMock: vi.fn(() => 0),
}));
vi.mock("../audio/samplerLanePlayback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/samplerLanePlayback")>();
  return {
    ...actual,
    createSamplerLanePlayback: vi.fn(() => ({ play: samplerPlayMock, stop: samplerStopMock })),
  };
});

const noCapture = () => new Promise<never>(() => undefined);

const renderView = (props: Partial<React.ComponentProps<typeof ArrangementViewV2>> = {}) => {
  localStorage.setItem("groove_language", "en");
  return render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} {...props} />
    </LanguageProvider>
  );
};

/** Through Logic's "Choose a Project", because a new arrangement starts by being chosen. */

/** An eight-bar arrangement, which is what the ruler draws: `createArrangement`'s own `DEFAULT_BARS`. */
const eightBars = (templateId?: string): ArrangementV2 => {
  const base = createArrangementFromTemplate("s", templateId, "synth");
  return { ...base, bars: 8 };
};

/** Drives the real look-ahead loop without a real audio clock — the helper `audioScheduler.test.ts` uses. */
function advance(engine: AudioEngine, ctx: FakeAudioContext, seconds: number, tickSeconds = 0.025) {
  const ticks = Math.max(1, Math.round(seconds / tickSeconds));
  const scheduler = engine as unknown as { schedulerLoop: () => void };
  const seen: number[] = [];
  for (let i = 0; i < ticks; i++) {
    ctx.currentTime += tickSeconds;
    scheduler.schedulerLoop();
    seen.push(engine.getCurrentStep());
  }
  return seen;
}

describe("⭐ the engine's own seek, which the ruler had no way to reach", () => {
  /** A pattern of `steps` sixteenths on one lane — all `setPattern` needs to know the transport's length. */
  const patternOf = (steps: number) => ({
    genre_id: "probe",
    bpm: 120,
    scale: "chromatic",
    totalSteps: steps,
    tracks: [{ track_id: "lead", name: "Lead", steps: new Array(steps).fill(0) }],
  });

  it("lands inside the pattern, and leaves a position the Stop control can return from", () => {
    const engine = new AudioEngine();

    /**
     * ⚠️ **A pattern first, because that is when the engine learns how long the transport is.** `totalSteps` starts at
     * sixteen and is replaced by `setPattern`, so a seek before the first play is clamped against a default that
     * describes nothing: measured, a click on bar 6 of an eight-bar arrangement came back **15** before this rule
     * existed. The engine therefore clamps only against a pattern it has actually been handed.
     */
    engine.setPattern(patternOf(128) as never);

    // ⭐ 4/4: bar 6 (0-based) begins at step 96 — `stepsPerBarFor`'s number, not a constant sixteen.
    expect(stepsPerBarFor("4/4")).toBe(16);
    expect(engine.seek(6 * stepsPerBarFor("4/4"))).toBe(96);
    expect(engine.getCurrentStep()).toBe(96);
    /**
     * ⭐ **And the position is a *position*, not just a cursor.** `canReturnToStart()` is what the Stop button's
     * disabled state reports, and it answers from `resumeStep` — the field `play()` reads. Writing `currentStep` alone
     * would move a running transport and leave a stopped one exactly where it was, which is the audit's bug in engine
     * form. Delete the `this.resumeStep = target` line and this goes red.
     */
    expect(engine.canReturnToStart(), "a seek left no position for play() to resume from").toBe(true);

    // Clamped both ways, to the pattern the transport actually holds.
    expect(engine.seek(99999)).toBe(127);
    expect(engine.seek(-5)).toBe(0);
    expect(engine.getCurrentStep()).toBe(0);

    // A three-quarter bar is twelve steps, so the same conversion is not a hard-coded sixteen.
    engine.setPattern(patternOf(96) as never);
    expect(stepsPerBarFor("3/4")).toBe(12);
    expect(engine.seek(6 * stepsPerBarFor("3/4"))).toBe(72);
    engine.destroy();
  });
});

describe("⭐ clicking the ruler moves the transport, on a real engine", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    restore = installFakeAudioContext();
    samplerPlayMock.mockClear();
    samplerStopMock.mockClear();
  });

  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  it("starts the next pass at the bar that was clicked, not at bar one", async () => {
    const engine = new AudioEngine();
    engine.setBpm(120);
    const player = createArrangementPlayer({ engine, loadCatalogue: async () => ({ assets: [] }) });
    const seekTransport = vi.fn((step: number) => engine.seek(step));

    renderView({ player, seekTransport, initialArrangement: eightBars() });

    // ⭐ The conversion is the view's, and the unit is the engine's: bar 6 of 4/4 is step 96, not "6".
    fireEvent.click(screen.getByTestId("ruler-bar-6"));
    expect(seekTransport).toHaveBeenCalledWith(96);
    expect(engine.getCurrentStep()).toBe(96);
    // The marker is drawn where the transport really is — the thing that used to be a decoratve triangle.
    expect(screen.getByTestId("arrangement-play-start").style.left).toBe(`${6 * 64 - 4}px`);

    await act(async () => {
      fireEvent.click(screen.getByTestId("arrangement-play"));
    });
    expect(engine.getIsPlaying()).toBe(true);

    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    let seen: number[] = [];
    act(() => {
      seen = advance(engine, ctx, 3);
    });
    const distinct = [...new Set(seen)].sort((a, b) => a - b);
    // eslint-disable-next-line no-console -- the readings are the evidence this criterion exists to produce
    console.log("RULER_SEEK_READINGS", JSON.stringify({ seeked: 96, distinctFirst: distinct.slice(0, 6), min: distinct[0], max: distinct.at(-1) }));

    /**
     * ⭐ **Three seconds at 120 BPM is twenty-four steps, all of them in bar 7 (steps 96–111) and then bar 8.** The
     * audit's reading was `1.1 1.2 1.3 1.4` on repeat — a transport parked in bar one. Remove the
     * `seekTransport?.(next * stepsPerBar)` line from `onRulerSelect` and this is that reading again.
     */
    expect(distinct[0], "the transport did not start at the bar that was clicked").toBeGreaterThanOrEqual(96);
    expect(Math.max(...seen)).toBeLessThan(128);
    expect(seen.every((step) => step >= 96)).toBe(true);

    engine.destroy();
  });

  it("⭐ tells the recorded lanes as well, because the engine reaching bar 7 while they play bar 1 is a silent defect", async () => {
    const engine = new AudioEngine();
    engine.setBpm(120);
    const player = createArrangementPlayer({
      engine,
      // A catalogue with a real asset, so the lane resolves and the recorded-lane scheduler is reached at all. An
      // empty one leaves `playerFromEngine` reporting "catalogue unavailable" and never calling it, which would make
      // this criterion vacuous rather than red.
      loadCatalogue: async () => ({
        assets: [
          {
            assetId: DEFAULT_SAMPLER_ASSET,
            name: "Default sampler",
            kind: "one-shot" as const,
            seconds: 1,
            url: "https://example.test/kit.wav",
          },
        ],
      }),
    });
    const seekTransport = vi.fn((step: number) => engine.seek(step));
    /** The play that follows a seek must not stop the engine: that is what would erase the position. */
    const stop = vi.spyOn(engine, "stop");

    renderView({ player, seekTransport, initialArrangement: eightBars("samplers") });
    fireEvent.click(screen.getByTestId("ruler-bar-6"));
    expect(engine.getCurrentStep()).toBe(96);

    await act(async () => {
      fireEvent.click(screen.getByTestId("arrangement-play"));
    });

    /**
     * ⭐ **The two readings that are the whole of §26.** `engine.stop()` resets the step to zero and clears the held
     * position, so a single call to it here is the seek being wiped; and the recorded-lane plan is the argument the
     * sampler scheduler is handed — `{}` means "from the top", `{ fromStep: 96 }` means "from the bar that was
     * clicked". Delete `player?.pause?.()` from `onRulerSelect` and both go the wrong way in the same run.
     */
    expect(stop, "the play that followed the seek stopped the engine, which is the position being erased").not.toHaveBeenCalled();
    expect(samplerPlayMock, "the recorded lanes were never planned").toHaveBeenCalled();
    const [, samplerOptions] = samplerPlayMock.mock.calls.at(-1) as unknown as [number, { fromStep?: number }];
    // eslint-disable-next-line no-console -- the readings are the evidence this criterion exists to produce
    console.log("RULER_SEEK_SAMPLER_READINGS", JSON.stringify({ engineStep: engine.getCurrentStep(), samplerOptions }));
    expect(samplerOptions.fromStep, "the recordings were planned from the top of the piece").toBe(96);

    engine.destroy();
  });

  /**
   * ⭐ **The ruler draws eight bars over a pattern that holds one, and the seek says so instead of lying.**
   *
   * A template-created arrangement states no `bars` (`data/arrangementEdits.ts`), so the ruler's fallback
   * (`DEFAULT_REGION_BARS` = 8) and the compile's answer (one bar) disagree — the disagreement
   * `features/arrangement/loopSteps.ts` documents for the loop brace. The engine clamps a seek to the pattern it holds,
   * `seek` **returns** what it landed on, and the marker is drawn from that: an out-of-range click shows the position
   * the transport really got. This case pins the reflection; the underlying eight-bars-versus-one is reported rather
   * than changed here, because it is a model decision about how long a new arrangement is.
   */
  it("draws the play-start where the transport actually landed when the ruler asked for a bar the pattern does not have", () => {
    const engine = new AudioEngine();
    engine.setBpm(120);
    const seekTransport = vi.fn((step: number) => engine.seek(step));

    /**
     * ⭐ **A template-created arrangement, which is the case that disagrees with itself**: `createArrangementFromTemplate`
     * returns no `bars`, so the ruler falls back to eight (`DEFAULT_REGION_BARS`) while the compile answers **one**
     * (`createArrangement`, the blank path, states `DEFAULT_BARS`). `"drums-bass"` is the chooser's own first
     * template.
     */
    const template = createArrangementFromTemplate("s", "drums-bass", "synth");
    expect(template.bars, "this criterion is about an arrangement that states no bars").toBeUndefined();
    renderView({ seekTransport, initialArrangement: template });

    fireEvent.click(screen.getByTestId("ruler-bar-6"));
    const landed = engine.getCurrentStep();
    // eslint-disable-next-line no-console -- the reading is the evidence this criterion exists to produce
    console.log("RULER_SEEK_CLAMP_READING", JSON.stringify({ requested: 96, oneBarPatternSteps: 16, landed }));
    // The view clamped to the pattern the compile will hand the transport, not to the ruler's eight bars.
    expect(landed).toBe(15);
    /**
     * And the marker follows the landing rather than the request — the difference between a control that reports and
     * one that decorates. The offset is the triangle's own half-width, the same arithmetic `arrangementGrid.test.tsx`
     * pins for the in-range case.
     */
    expect(screen.getByTestId("arrangement-play-start").style.left).toBe(`${0 * 64 - 4}px`);
    engine.destroy();
  });
});
