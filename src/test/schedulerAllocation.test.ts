/**
 * Allocation gate for the realtime scheduler's hot path.
 *
 * Background: a performance review asked whether the look-ahead pass allocates on every
 * step, and estimated ~4 objects/step from reading the code but never measured it (a
 * browser CDP allocation-sampling attempt produced no data). This criterion measures that
 * shape deterministically on the existing fake-AudioContext harness — no browser, no
 * wall-clock assertions — and pins it so a future change cannot quietly add per-step churn.
 *
 * What the loop allocates per scheduled step (`schedulerLoop`, AudioEngine.ts):
 *
 *   1. `new Set<number>()` for the silenced-lane log          (:2171)
 *   2. one object pushed into `scheduledWindow`               (:2173)
 *   3. one object pushed into `stepQueue`                     (:2174)
 *   4. the `activeTracks` array `scheduleStep` returns        (:2213)
 *
 * Measured (see the commit that added this file): 64 scheduled steps create 256 objects,
 * exactly 4.00/step, and the reading is identical for a 2-track and an 8-track pattern —
 * the per-step cost does not grow with lanes. Because the cap is the measured number
 * rather than a comfortable multiple of it, one extra allocation per step (5.00/step,
 * 320 for the run) trips it. There is deliberately no optimisation here: the measurement
 * found nothing pathological, so the gate itself is the deliverable.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { FakeAudioContext, installFakeAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";

/** The measured shape, and therefore the cap. One extra allocation/step must exceed it. */
const ALLOCATIONS_PER_SCHEDULED_STEP = 4;
const SCHEDULED_STEPS = 64;
const ALLOCATION_CAP = ALLOCATIONS_PER_SCHEDULED_STEP * SCHEDULED_STEPS;

interface StepQueueEntry { step: number; time: number; activeTracks: number[] }
interface WindowEntry { step: number; time: number; stepDur: number; silenced: Set<number> }

/** Minimal deterministic pattern: 120 BPM, 16 steps, one onset every 4th step per lane. */
function makePattern(trackCount: number): SequencerPattern {
  const steps = 16;
  return {
    genre_id: "scheduler-allocation",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: Array.from({ length: trackCount }, (_, t) => ({
      track_id: `lane-${t}`,
      name: `Lane ${t}`,
      instrument: t % 3 === 0 ? "drum" : "synth",
      steps: Array.from({ length: steps }, (_, i) => (i % 4 === 0 ? 1 : 0)),
      velocity: new Array(steps).fill(100),
      pitch: Array.from({ length: steps }, (_, i) => (i % 8 === 2 ? 36 : 0)),
      gate: new Array(steps).fill(0.8),
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
    })),
  } as unknown as SequencerPattern;
}

interface AllocationCounts {
  /** Pushes into `stepQueue` — one per scheduled step. */
  queued: number;
  /** Pushes into `scheduledWindow` — one per scheduled step. */
  windowed: number;
  /** `new Set` constructions seen during the drive (the silenced-lane log). */
  silencedSets: number;
  /** `scheduleStep` invocations — each allocates exactly one `activeTracks` array. */
  scheduleStepCalls: number;
  /** Distinct `activeTracks` arrays captured. */
  distinctActiveTrackArrays: number;
  /** Distinct `silenced` Sets captured off the window entries. */
  distinctSilencedSets: number;
  total: number;
}

/**
 * Instrument the four known sites, drive the transport until `targetSteps` steps have been
 * scheduled, and return the counts. `Set` is wrapped with a counting subclass for the
 * duration of the synchronous drive only, so the reading is not polluted by `play()`'s
 * awaits (and is restored in a `finally`).
 */
function measureSchedulerAllocations(
  engine: AudioEngine,
  ctx: FakeAudioContext,
  targetSteps: number
): AllocationCounts {
  const internal = engine as unknown as {
    stepQueue: StepQueueEntry[];
    scheduledWindow: WindowEntry[];
    scheduleStep: (...args: unknown[]) => number[];
    schedulerLoop: () => void;
  };

  const counts = { queued: 0, windowed: 0, silencedSets: 0, scheduleStepCalls: 0 };
  const activeTrackArrays: number[][] = [];
  const silencedSets: Set<number>[] = [];

  const originalQueuePush = internal.stepQueue.push.bind(internal.stepQueue);
  internal.stepQueue.push = (...items: StepQueueEntry[]) => {
    counts.queued += items.length;
    return originalQueuePush(...items);
  };

  const originalWindowPush = internal.scheduledWindow.push.bind(internal.scheduledWindow);
  internal.scheduledWindow.push = (...items: WindowEntry[]) => {
    counts.windowed += items.length;
    for (const item of items) silencedSets.push(item.silenced);
    return originalWindowPush(...items);
  };

  const originalScheduleStep = internal.scheduleStep;
  internal.scheduleStep = function (this: unknown, ...args: unknown[]): number[] {
    counts.scheduleStepCalls += 1;
    const result = originalScheduleStep.apply(this, args);
    activeTrackArrays.push(result);
    return result;
  };

  const NativeSet = globalThis.Set;
  class CountingSet<T> extends NativeSet<T> {
    constructor(iterable?: Iterable<T> | null) {
      super(iterable ? Array.from(iterable) : undefined);
      counts.silencedSets += 1;
    }
  }
  globalThis.Set = CountingSet as unknown as SetConstructor;

  try {
    let guard = 0;
    while (counts.queued < targetSteps && guard < 100_000) {
      ctx.currentTime += 0.025; // 40 Hz watchdog tick, same cadence as `startScheduler`
      internal.schedulerLoop();
      guard += 1;
    }
  } finally {
    globalThis.Set = NativeSet;
  }

  const total = counts.queued + counts.windowed + counts.silencedSets + counts.scheduleStepCalls;
  return {
    ...counts,
    distinctActiveTrackArrays: new NativeSet(activeTrackArrays).size,
    distinctSilencedSets: new NativeSet(silencedSets).size,
    total,
  };
}

describe("scheduler allocation shape (measured on the fake AudioContext)", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    restore = installFakeAudioContext();
  });

  afterEach(() => {
    restore?.();
    restore = null;
  });

  // Two and eight lanes: the per-step cost must not grow with the track count.
  for (const trackCount of [2, 8]) {
    it(`schedules ${SCHEDULED_STEPS} steps at <= ${ALLOCATIONS_PER_SCHEDULED_STEP} objects/step with ${trackCount} tracks`, async () => {
      const engine = new AudioEngine();
      engine.setPattern(makePattern(trackCount));
      await engine.play();
      const ctx = engine.getAudioContext() as unknown as FakeAudioContext;

      const measured = measureSchedulerAllocations(engine, ctx, SCHEDULED_STEPS);

      // The drive is deterministic: exactly the requested steps were scheduled.
      expect(measured.queued).toBe(SCHEDULED_STEPS);
      // Each of the four sites fired once per step, and each produced a distinct object.
      expect(measured.windowed).toBe(SCHEDULED_STEPS);
      expect(measured.silencedSets).toBe(SCHEDULED_STEPS);
      expect(measured.scheduleStepCalls).toBe(SCHEDULED_STEPS);
      expect(measured.distinctSilencedSets).toBe(SCHEDULED_STEPS);
      expect(measured.distinctActiveTrackArrays).toBe(SCHEDULED_STEPS);

      // The gate: the measured shape, with no headroom for an added per-step allocation.
      expect(measured.total).toBeLessThanOrEqual(ALLOCATION_CAP);

      engine.destroy();
    });
  }
});
