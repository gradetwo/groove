/**
 * The ProMotion throttle: what it costs and, more importantly, that it does not kill the loop.
 *
 * `682b3dc` put a ~25 ms / ~40 FPS floor in front of five visualisers to stop a 120 Hz display from
 * repainting them ~120 times a second. A display that fast cannot be reproduced on this machine, so
 * this criterion does not measure frame *rates* — it installs a fake `requestAnimationFrame` and
 * drives frames at timestamps it chooses, counting two things the throttle is actually responsible
 * for:
 *
 * - **how many times the frame callback is re-armed** — the re-arm must happen *before* the throttle
 *   check, so a throttled frame is skipped, not the loop. If it ever moves after the check, the loop
 *   dies at the first skipped frame and the re-arm count collapses.
 * - **how many times the draw branch runs** — the number that has to land near 40 per second, and
 *   must not collapse to "once" while a visualiser is playing.
 *
 * The idle half pins the other end of the same effect: `Header`'s static ambient bars are drawn once
 * and then the effect *stops* re-arming, which is the "pause idle visualizer" half of the commit.
 *
 * ## Why `Header` and not `OscilloscopeWaveform`
 *
 * Both effects have the same self-contained shape (a canvas, an optional analyser, `isPlaying`), and
 * neither needs a real `AudioContext` — `Header`'s analyser is an optional prop and the playing path
 * is exercised here with a duck-typed stub whose only method the effect calls is
 * `getByteFrequencyData`. `Header` was chosen because it is the *only* one of the five call sites
 * whose idle path is a distinguishable, terminating branch on the same effect: with `isPlaying`
 * false it draws the static bars and returns without re-arming, so the idle property is observable
 * through the same two counters. `OscilloscopeWaveform` keeps re-arming when idle (its idle path
 * draws a flat line every throttled frame), so it cannot pin "the loop stops when idle".
 *
 * `Header` renders under `LanguageProvider` alone — the same context the existing header criteria
 * use — and does not need a `ResizeObserver`: `Header.tsx:220` guards on `typeof ResizeObserver`.
 *
 * ## The red proof this criterion was built against
 *
 * Moving just the re-arm line after the throttle check (`Header.tsx:282` → after `:284`) turns the
 * playing case red immediately, and it fails on the *re-arm* assertion before the draw count is even
 * reached: callback invocations and re-arms fall from **120 to 1**, draws from **30 to 0**, pending
 * from **1 to 0**. The loop died on the first throttled frame — which is the exact regression this
 * pins, and the reason the re-arm assertion is stated first.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { Header } from "../components/Header";
import { LanguageProvider } from "../i18n/LanguageContext";

type FrameCallback = (now: number) => void;

interface FrameScheduler {
  requestFrame: (cb: FrameCallback) => number;
  cancelFrame: (id: number) => void;
  /** Run one display refresh; returns the timestamp handed to every callback in it. */
  tick: (intervalMs: number) => number;
  /** How many times a frame callback was invoked (each one that is not the last re-arms). */
  calls: () => number;
  /** How many frames are currently armed. */
  pending: () => number;
}

/**
 * A `requestAnimationFrame` that only ticks when the criterion says so.
 *
 * `tick(intervalMs)` invokes every callback pending at that moment — exactly as a browser invokes
 * the callbacks that were pending when the display refreshes — at a timestamp of `(index + 1) *
 * intervalMs`. Nothing here reads a clock, so the counts below are a property of the throttle
 * arithmetic and not of this machine's load.
 */
function installFrameScheduler(): FrameScheduler {
  let nextId = 0;
  let tickIndex = 0;
  let calls = 0;
  const pending = new Map<number, FrameCallback>();

  const requestFrame = (cb: FrameCallback): number => {
    const id = ++nextId;
    pending.set(id, cb);
    return id;
  };
  const cancelFrame = (id: number): void => {
    pending.delete(id);
  };

  /**
   * Run one display refresh.
   *
   * The callbacks are snapshotted first: a callback that re-arms inside this tick registers for the
   * *next* one, which is what the browser does too.
   */
  const tick = (intervalMs: number): number => {
    const now = ++tickIndex * intervalMs;
    const due = [...pending.values()];
    pending.clear();
    act(() => {
      for (const cb of due) {
        calls += 1;
        cb(now);
      }
    });
    return now;
  };

  return { requestFrame, cancelFrame, tick, calls: () => calls, pending: () => pending.size };
}

const originalRaf = globalThis.requestAnimationFrame;
const originalCaf = globalThis.cancelAnimationFrame;

/**
 * A recording 2D context. `clearRect` is the draw branch's first canvas call on *every* path
 * (`Header.tsx` playing path and idle path both clear before painting), so its call count is the
 * count of throttle passes.
 */
function installRecordingCanvas() {
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D
  );
  return ctx;
}

/** The only analyser method `Header`'s playing path calls (Header.tsx:289). */
function makeAnalyser() {
  return {
    frequencyBinCount: 1024,
    getByteFrequencyData: vi.fn((data: Uint8Array) => {
      for (let i = 0; i < data.length; i++) data[i] = (i * 7) % 256;
    }),
  } as unknown as AnalyserNode;
}

function renderHeader(opts: { isPlaying: boolean; analyser: AnalyserNode | null }) {
  return render(
    <LanguageProvider>
      <Header
        currentTab="studio"
        onSelectTab={vi.fn()}
        onOpenSearch={vi.fn()}
        onRandomGenre={vi.fn()}
        analyser={opts.analyser}
        isPlaying={opts.isPlaying}
      />
    </LanguageProvider>
  );
}

beforeEach(() => {
  localStorage.setItem("groove_language", "zh");
});

afterEach(() => {
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCaf;
  cleanup();
  vi.restoreAllMocks();
});

describe("visualiser frame throttle · the 25 ms floor does not kill the loop", () => {
  it("re-arms every tick while playing and throttles the draw to the ~40 FPS floor", () => {
    const scheduler = installFrameScheduler();
    globalThis.requestAnimationFrame = scheduler.requestFrame;
    globalThis.cancelAnimationFrame = scheduler.cancelFrame;
    const ctx = installRecordingCanvas();

    renderHeader({ isPlaying: true, analyser: makeAnalyser() });

    const INTERVAL_MS = 8.33; // one 120 Hz refresh: 120 ticks make one second
    const TICKS = 120;
    const THROTTLE_MS = 25;

    for (let i = 0; i < TICKS; i++) scheduler.tick(INTERVAL_MS);

    const draws = ctx.clearRect.mock.calls.length;
    const calls = scheduler.calls();

    // The loop must not die: every callback invocation re-arms the next frame, and the last tick
    // leaves exactly one frame armed for the refresh that has not happened yet.
    expect(calls).toBe(TICKS);
    expect(scheduler.pending()).toBe(1);

    /**
     * The design window, stated before the measurement.
     *
     * The effect registers its first frame when it runs; the first *draw* cannot happen before the
     * timestamp reaches the 25 ms floor, which on an 8.33 ms grid is the 4th tick (33.32 ms).
     *
     * Note what the literal 8.33 does to the recurrence: three ticks are 24.99 ms, which is *under*
     * the floor, so on this exact grid a draw can only recur every **4** ticks = 33.32 ms and the
     * measured reading is 30 draws over 120 ticks (999.6 ms), i.e. 30 per second on the harness's
     * arithmetic — 75% of the nominal 40. A real 120 Hz display emits ~8.3333 ms timestamps whose
     * accumulated interval crosses 25 ms on some triples and not others, which is why the product
     * behaviour is "about 40 FPS"; this criterion pins the *logic* deterministically, not the
     * display's jitter. The bounds below are therefore deliberately loose enough to hold for either
     * quantisation and tight enough that a collapsed loop fails:
     *
     *   upper: 1 bootstrap draw + one draw per 25 ms of the window = ceil(999.6/25) + 1 = 41
     *   lower: a third of that (13) — below it "the throttle is working" has become "the loop is
     *          broken", which is exactly the regression the red proof exercises
     */
    const maxDraws = Math.ceil((TICKS * INTERVAL_MS) / THROTTLE_MS) + 1; // 41
    const minDraws = Math.floor(maxDraws / 3); // 13

    expect(draws).toBeGreaterThanOrEqual(minDraws);
    expect(draws).toBeLessThanOrEqual(maxDraws);
    expect(draws).toBeLessThan(TICKS); // throttled, not unthrottled
    // The measured reading, locked so a silent drift in either direction is visible. The 4-tick
    // quantisation above is what makes it 30 rather than 37/40: ticks 4, 8, 12 … 120.
    expect(draws).toBe(30);
  });

  it("stops re-arming when idle and draws the static bars exactly once", () => {
    const scheduler = installFrameScheduler();
    globalThis.requestAnimationFrame = scheduler.requestFrame;
    globalThis.cancelAnimationFrame = scheduler.cancelFrame;
    const ctx = installRecordingCanvas();

    renderHeader({ isPlaying: false, analyser: null });

    const TICKS = 60;
    for (let i = 0; i < TICKS; i++) scheduler.tick(8.33);

    // The idle branch paints the static ambient bars and returns *before* the re-arm, so the one
    // armed frame is the last one this effect ever runs.
    expect(scheduler.calls()).toBe(1);
    expect(scheduler.pending()).toBe(0);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).toHaveBeenCalledTimes(32); // 32 static bars, drawn in that single pass
  });
});
