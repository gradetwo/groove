/**
 * ⭐ **The scheduler's watchdog is a stall detector, not a second clock.**
 *
 * The 40 ms `setInterval` used to call `schedulerLoop` unconditionally, so a healthy playback entered the loop
 * twice over: once per 20 ms from the worklet/worker tick and once per 40 ms from the watchdog — measured on
 * this harness at **72–73 entries per second**, where the primary clock alone asks for **50**. The extra third
 * is scheduling work for a clock that is already on time, and on a phone that is heat and battery for no safety
 * gain. The guard makes the watchdog fire only after 100 ms of silence from the primary clock.
 *
 * ## Why this test moves the clock itself
 *
 * The guard is a comparison against `performance.now()`, and **vitest's fake timers do not advance it**: under
 * `vi.useFakeTimers()`, `advanceTimersByTimeAsync(1000)` fires 25 watchdog intervals while `performance.now()`
 * moves about 10 ms across the whole second, which would leave the guard permanently false and the reading
 * meaningless (it read 76/s either way until `performance.now` was stubbed). So the clock here is driven in
 * 1 ms steps and `performance.now` is stubbed to follow it, which makes both halves deterministic and removes
 * the wall clock from the assertion entirely.
 *
 * ## The red proof this was built against
 *
 * Restoring the unconditional call (`if (this.isPlaying) this.schedulerLoop();`) turns the rate case red at
 * **~72–73/s against the 60/s ceiling**. Deleting the stamp in `schedulerLoop` turns the stall case red —
 * without an entry to refresh it, the guard is always true, which is the same defect in the other direction.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { installFakeAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";

function makePattern(): SequencerPattern {
  const steps = 16;
  return {
    genre_id: "scheduler-watchdog-rate",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [
      {
        track_id: "lane-0",
        name: "Lane 0",
        instrument: "drum",
        steps: Array.from({ length: steps }, (_, i) => (i % 4 === 0 ? 1 : 0)),
      },
    ],
  } as unknown as SequencerPattern;
}

/** The clock the guard reads, advanced by hand one millisecond at a time. */
let clockMs = 0;

let restoreAudio: (() => void) | null = null;

beforeEach(() => {
  restoreAudio = installFakeAudioContext();
  vi.useFakeTimers();
  vi.setSystemTime(0);
  clockMs = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clockMs);
});

afterEach(() => {
  vi.useRealTimers();
  restoreAudio?.();
  restoreAudio = null;
  vi.restoreAllMocks();
});

/** Advance the timer queue and the readable clock together, 1 ms at a time. */
async function advance(ms: number): Promise<void> {
  for (let i = 0; i < ms; i++) {
    clockMs += 1;
    await vi.advanceTimersByTimeAsync(1);
  }
}

/** Entries into `schedulerLoop` over one simulated second, with the primary clock healthy. */
async function entriesPerSecond(): Promise<number> {
  const engine = new AudioEngine();
  const internals = engine as unknown as { schedulerLoop: () => void; workletClock: { stop: () => void } };
  const spy = vi.spyOn(internals, "schedulerLoop");

  engine.setPattern(makePattern());
  await engine.play();
  spy.mockClear();

  await advance(1_000);
  const entries = spy.mock.calls.length;

  engine.stop();
  return entries;
}

describe("AudioEngine · the watchdog fires on a stall, not on a healthy clock", () => {
  it("⭐ enters the loop about once per primary tick, not once per tick plus once per watchdog interval", async () => {
    const entries = await entriesPerSecond();

    // The primary tick is 20 ms, so a healthy second asks for ~50 entries. Adding the watchdog's 25 makes ~75.
    // The ceiling sits between them, and the floor keeps the reading from passing as "the loop never ran".
    expect(entries, `healthy second entered schedulerLoop ${entries} times (primary ≈50, plus watchdog ≈25)`).toBeGreaterThanOrEqual(40);
    expect(entries, `healthy second entered schedulerLoop ${entries} times — the watchdog is running as a second clock`).toBeLessThan(60);
  });

  it("⭐ still drives the loop when the primary clock goes silent, which is the safety the unconditional call gave", async () => {
    const engine = new AudioEngine();
    const internals = engine as unknown as { schedulerLoop: () => void; workletClock: { stop: () => void } };
    const spy = vi.spyOn(internals, "schedulerLoop");

    engine.setPattern(makePattern());
    await engine.play();

    // Stop the primary clock only: the transport keeps playing, so the watchdog is the only thing left.
    internals.workletClock.stop();
    spy.mockClear();

    await advance(1_000);
    const entries = spy.mock.calls.length;
    engine.stop();

    // 40 ms interval, minus the 100 ms the guard waits for: the watchdog settles at one entry per ~120 ms,
    // i.e. 8 in a simulated second — measured, and the same shape as the 6.7/s the real clock gives.
    //
    // The lower bound is the criterion. An upper bound here would not test the handover: with the old
    // unconditional call this case also fails, but for the opposite reason (the watchdog never stops), so the
    // rate ceiling belongs to the case above and only "the loop is still being driven" belongs here.
    expect(entries, "the primary clock stopped and the watchdog never took over").toBeGreaterThan(4);
  });
});
