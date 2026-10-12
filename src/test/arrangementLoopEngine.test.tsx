/**
 * ⭐ **The loop brace was a picture, and the picture was the whole feature.** This file is the criterion for the gap
 * between two things that each already worked:
 *
 *   · `AudioEngine.setLoopRange` has always existed and the transport has always read it — the scheduler wraps inside
 *     `[lStart, lEnd)` and resumes the pattern at `loopRange[0]` (`AudioEngine.ts:1748`, `:2083`, `:2131`, and
 *     `schedulerMath.ts:52` for the stall path);
 *   · `LoopBraceV2` has always drawn a real brace, in **bars**, and moved it by pointer and keyboard.
 *
 * Neither ever spoke to the other on the arrangement route: a search for `setLoopRange` in
 * `components/arrangement/ArrangementViewV2.tsx` and in `audio/playerFromEngine.ts` returned nothing, and the view's
 * own header said so in as many words — "the loop brace is a ruler-level loop that no audio path reads". So the brace
 * could be drawn, dragged and nudged while the playhead ran to the end of the pattern regardless.
 *
 * **Four claims, and each one is falsifiable by a reading rather than by an intention:**
 *
 *   1. the conversion is the compile's bar-to-step ratio — `stepsPerBarFor(timeSignature)`, twelve in 3/4 and sixteen
 *      in 4/4 — and not a bars-passed-straight-through or a constant. This is the claim the whole change is easiest to
 *      get wrong in, so it is checked against both signatures and against the clamping edge;
 *   2. moving the brace tells the transport, and switching it off **clears** it rather than merely unpainting the brace;
 *   3. the same run really wraps — recorded against a live `AudioEngine` on the strict fake `AudioContext`
 *      (`audioScheduler.test.ts` records why that harness exists) — and switching the brace off mid-run is what lets
 *      the playhead leave the window. That second half is the counterfactual: it is what a `setLoopRange` that was
 *      never called looks like, measured in the same test rather than argued;
 *   4. the `/new` route is what supplies the engine, so the brace of a real route reaches a real engine with no test
 *      wiring in between.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { NewProjectView } from "../views/NewProjectView";
import { LanguageProvider } from "../i18n/LanguageContext";
import { AudioEngine } from "../audio/AudioEngine";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { getActiveAudioEngine, setActiveAudioEngine } from "../audio/activeEngine";
import { loopStepsFor } from "../features/arrangement/loopSteps";
import { stepsPerBarFor } from "../data/noteEvents";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import type { ArrangementV2 } from "../types/arrangementV2";
import { FakeAudioContext, installFakeAudioContext } from "./helpers/fakeAudio";

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
const chooseThrough = () => fireEvent.click(screen.getByRole("button", { name: "Create" }));

describe("the brace's unit against the transport's", () => {
  it("converts bars into the compile's steps, and a 3/4 bar is twelve of them rather than sixteen", () => {
    // ⭐ 4/4: bar 2 begins at step 16 — `stepsFromNotes` puts a note at `startBeats / STEP_BEATS`, and a bar is four
    // beats — so bars 2–4 are the half-open step window [16, 48).
    expect(stepsPerBarFor("4/4")).toBe(16);
    expect(loopStepsFor([1, 3], stepsPerBarFor("4/4"), 128)).toEqual([16, 48]);
    /**
     * ⭐ And the same reading in 3/4, which is the case a hard-coded sixteen gets wrong: `data/noteEvents.ts` says
     * `STEPS_PER_BAR` is sixteen *"because a bar is four beats"*, and `stepsPerBarFor` is the function that answers
     * otherwise. A conversion that returned [16, 48) here would be the unit error this criterion exists for.
     */
    expect(stepsPerBarFor("3/4")).toBe(12);
    expect(loopStepsFor([1, 3], stepsPerBarFor("3/4"), 96)).toEqual([12, 36]);
    // No brace is no loop at all — the state the transport starts in.
    expect(loopStepsFor(undefined, 16, 128)).toBeNull();
  });

  /**
   * ⭐ **The clamp, which is its own claim because it is its own trap** — and one the code deliberately steps around:
   * `features/arrangement/loopSteps.ts` says so in as many words ("a brace past the end of the pattern does not hand
   * the scheduler a window it will sit in silently"). `arrangement.bars` is optional and the two fallbacks disagree:
   * the ruler reads eight bars (`DEFAULT_REGION_BARS`) while the compile reads **one**, so a brace the ruler can draw
   * and the user can drag is a window the pattern does not have. Handed over unclamped it is `[64, 128)` against a
   * sixteen-step pattern — the scheduler resumes at step 64, every lane's `steps[64]` is `undefined`, and switching the
   * loop **on** silences an arrangement that was playing. Clamped, the file plays the one bar it has, which is what it
   * does with no brace at all.
   */
  it("refuses a brace the pattern does not reach, rather than handing over a window that fires nothing", () => {
    // The whole pattern is still a loop — it is the range the brace would be clamped *to*.
    expect(loopStepsFor([0, 8], 16, 16)).toEqual([0, 16]);
    // Past the end, and clamped away to nothing: `null`, not `[16, 16]` and certainly not `[64, 128)`.
    expect(loopStepsFor([4, 8], 16, 16)).toBeNull();
    expect(loopStepsFor([2, 4], 16, 16)).toBeNull();
    // Half inside and half outside keeps the half that exists rather than being thrown away with it.
    expect(loopStepsFor([0, 4], 16, 16)).toEqual([0, 16]);
    // And the same reading one bar into a pattern that is two bars long: only the part that exists survives.
    expect(loopStepsFor([1, 4], 16, 32)).toEqual([16, 32]);
  });
});

describe("the brace reaching the transport", () => {
  it("hands it over when the brace moves, and clears it when the brace is switched off", () => {
    const sink = vi.fn();
    renderView({ setTransportLoopRange: sink });
    chooseThrough();
    /**
     * The invariant is stated from the first paint rather than only on the first change: what the brace shows and what
     * the transport holds are one fact, and at mount that fact is "no loop". Clearing an already-clear engine is the
     * no-op `AudioEngine.setLoopRange(null)` is.
     */
    expect(sink).toHaveBeenLastCalledWith(null);

    // The toolbar's Loop creates a four-bar brace at the bar the view is looking at (bar 1), so bars 1–4 = steps [0, 64).
    fireEvent.click(screen.getByTestId("arrangement-loop"));
    expect(sink).toHaveBeenLastCalledWith([0, 64]);

    // The brace's own WCAG 2.5.7 alternative — the keyboard rock — is the gesture, and it must reach the transport too.
    fireEvent.keyDown(screen.getByTestId("loop-brace-move"), { key: "ArrowRight" });
    expect(sink).toHaveBeenLastCalledWith([16, 80]);

    // ⭐ Off means **cleared**. A brace that is merely unpainted while the transport still holds its window is the same
    // defect one layer down.
    fireEvent.click(screen.getByTestId("arrangement-loop"));
    expect(sink).toHaveBeenLastCalledWith(null);
  });
});

describe("the transport wrapping inside the brace, on a real engine", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    restore = installFakeAudioContext();
  });

  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  /** Drives the real look-ahead loop forward without a real audio clock — the helper `audioScheduler.test.ts` uses. */
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

  /** Every place the reported step went **backwards**, which is exactly where a pass ended. */
  const wrapsIn = (seen: number[]) => seen.reduce((count, step, index) => (index > 0 && step < seen[index - 1]! ? count + 1 : count), 0);

  it("keeps the playhead in the brace, and leaving the brace off is what lets it out", async () => {
    const engine = new AudioEngine();
    engine.setBpm(120);
    const player = createArrangementPlayer({ engine, loadCatalogue: async () => ({ assets: [] }) });

    renderView({ player, setTransportLoopRange: (range) => engine.setLoopRange(range) });
    chooseThrough();
    fireEvent.click(screen.getByTestId("arrangement-loop"));
    // Bars 2–5 of an eight-bar arrangement: [16, 80) in the engine's own steps.
    fireEvent.keyDown(screen.getByTestId("loop-brace-move"), { key: "ArrowRight" });
    expect(engine.getLoopRange()).toEqual([16, 80]);

    await act(async () => {
      fireEvent.click(screen.getByTestId("arrangement-play"));
    });
    expect(engine.getIsPlaying()).toBe(true);

    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    // Twenty seconds at 120 BPM is a hundred and sixty sixteenths: four passes of a four-bar loop.
    let inside: number[] = [];
    act(() => {
      inside = advance(engine, ctx, 20);
    });
    const insideDistinct = [...new Set(inside)].sort((a, b) => a - b);
    const insideWraps = wrapsIn(inside);
    const insideOut = inside.filter((step) => step < 16 || step >= 80);

    /**
     * ⭐ **The counterfactual, in the same run and on the same clock**: switch the brace off and the window goes with
     * it. No `setLoopRange` call at all produces the second reading, so the first one is evidence about this wiring
     * rather than about the scheduler happening to stay put.
     */
    fireEvent.click(screen.getByTestId("arrangement-loop"));
    expect(engine.getLoopRange()).toBeNull();
    let outside: number[] = [];
    act(() => {
      outside = advance(engine, ctx, 5);
    });
    const outsideMax = Math.max(...outside);

    // eslint-disable-next-line no-console -- the readings are the evidence this criterion exists to produce
    console.log(
      "LOOP_WRAP_READINGS",
      JSON.stringify({
        loopRange: [16, 80],
        inside: { distinct: insideDistinct, outOfWindow: insideOut.length, wraps: insideWraps },
        cleared: { max: outsideMax, distinct: [...new Set(outside)].sort((a, b) => a - b).slice(0, 8) },
      })
    );

    // ⭐ With the brace on: every reported step is inside it, and the playhead came back round more than once.
    expect(insideOut).toHaveLength(0);
    expect(insideDistinct[0]).toBeGreaterThanOrEqual(16);
    expect(insideDistinct[insideDistinct.length - 1]).toBeLessThan(80);
    expect(insideWraps).toBeGreaterThanOrEqual(2);

    // ⭐ With it off: the same clock carries the playhead past the window that was holding it.
    expect(outsideMax).toBeGreaterThanOrEqual(80);

    engine.destroy();
  });

  /**
   * ⭐ **The clamp, end to end: the brace the ruler can draw past the pattern the compile built must not silence a
   * playing arrangement** — the exact thing `features/arrangement/loopSteps.ts` was written to step around.
   *
   * The file here is the one where the two lengths disagree: it states **no `bars`**, so the ruler's fallback
   * (`DEFAULT_REGION_BARS`, eight) is what the brace is drawn and dragged against, while the compile's
   * (`arrangement.bars ?? 0` → one bar) is what the transport will hold — a sixteen-step pattern. A four-bar brace
   * moved out to bars 5–8 is then steps `[64, 128)` against those sixteen steps. Unclamped, `AudioEngine.play`
   * resumes at step 64, `track.steps[64]` is `undefined` for every lane, and the reading below is a playhead parked
   * at 64 firing nothing: **pressing Loop while it plays would silence it**. Clamped, the window is `null` — "the
   * region you drew does not exist" — and the file plays the one bar it has, exactly as it does with no brace at all.
   *
   * Falsified by removing the `clamp` in `loopStepsFor`: `getLoopRange()` becomes `[64, 128)` and this run's maximum
   * step becomes 64, so both assertions below go red.
   */
  it("does not silence a playing arrangement when the brace sits past the pattern's own end", async () => {
    const engine = new AudioEngine();
    engine.setBpm(120);
    const player = createArrangementPlayer({ engine, loadCatalogue: async () => ({ assets: [] }) });

    // The same arrangement the view builds, with the length it is allowed to omit taken away.
    const stated = createArrangementFromTemplate("s", undefined, "synth");
    const unstated: ArrangementV2 = { ...stated };
    delete unstated.bars;

    renderView({ player, initialArrangement: unstated, setTransportLoopRange: (range) => engine.setLoopRange(range) });
    // Bars 1–4 first, then the brace's own four-bar shift: bars 5–8, which the ruler draws and the pattern does not have.
    fireEvent.click(screen.getByTestId("arrangement-loop"));
    fireEvent.keyDown(screen.getByTestId("loop-brace-move"), { key: "ArrowRight", shiftKey: true });
    expect(screen.getByTestId("loop-brace").dataset.loopStart).toBe("4");
    expect(screen.getByTestId("loop-brace").dataset.loopEnd).toBe("8");
    // ⭐ The claim: what reached the engine is "no window", not a window it cannot fire from.
    expect(engine.getLoopRange()).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("arrangement-play"));
    });
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    let seen: number[] = [];
    act(() => {
      seen = advance(engine, ctx, 6);
    });
    const seenMax = Math.max(...seen);
    const seenDistinct = [...new Set(seen)].sort((a, b) => a - b);

    // eslint-disable-next-line no-console -- the readings are the evidence this criterion exists to produce
    console.log("LOOP_CLAMP_READINGS", JSON.stringify({ braceBars: [4, 8], patternSteps: 16, loopRange: engine.getLoopRange(), seenMax, seenDistinct }));

    // ⭐ It played the bar it has, rather than sitting at step 64 where every lane is empty.
    expect(seenMax).toBeLessThan(16);
    expect(seenMax).toBeGreaterThan(0);
    // And it came round more than once, so this is playback rather than a playhead that never moved.
    expect(wrapsIn(seen)).toBeGreaterThanOrEqual(2);

    engine.destroy();
  });
});

describe("the /new route, where the engine actually is", () => {
  beforeEach(() => {
    setActiveAudioEngine(null);
  });

  afterEach(() => {
    setActiveAudioEngine(null);
  });

  /**
   * ⭐ **No test wiring between the brace and the engine.** `NewProjectView` builds its own `AudioEngine`, registers it
   * where the entry gate can reach it, and is the only thing that can hand the view a transport; the reading below is
   * that engine's own `getLoopRange()`. Removing the sink from the route — or the calls from the view — leaves this
   * `null` while the button still says the brace is on.
   */
  it("hands the brace to its own engine, and clears it when the brace is switched off", async () => {
    const restore = installFakeAudioContext();
    try {
      render(
        <LanguageProvider>
          <NewProjectView capture={noCapture} />
        </LanguageProvider>
      );
      fireEvent.click(await screen.findByRole("button", { name: "Create" }));

      const engine = getActiveAudioEngine();
      expect(engine).not.toBeNull();
      expect(engine!.getLoopRange()).toBeNull();

      fireEvent.click(screen.getByTestId("arrangement-loop"));
      // Eight bars in 4/4, a four-bar brace at bar 1: steps [0, 64).
      expect(engine!.getLoopRange()).toEqual([0, 64]);

      fireEvent.click(screen.getByTestId("arrangement-loop"));
      expect(engine!.getLoopRange()).toBeNull();
    } finally {
      restore();
    }
  });
});
