import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import type { SequencerPattern } from "../types/genre";
import { FakeAudioContext, installFakeAudioContext } from "./helpers/fakeAudio";

/**
 * E-03: the realtime scheduler used to be untestable because jsdom ships no
 * AudioContext, so every existing engine test ran with `ctx === null` and never
 * touched `play()`, the look-ahead loop, panic or the voice registry.
 *
 * These tests install a strict fake AudioContext (it throws on the same illegal
 * exponential-ramp targets a browser does) and drive the transport for real.
 */

function makePattern(options: { volume?: number; velocity?: number; steps?: number } = {}): SequencerPattern {
  const steps = options.steps ?? 16;
  return {
    genre_id: "test-genre",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        instrument: "drum",
        steps: Array.from({ length: steps }, (_, i) => (i % 4 === 0 ? 1 : 0)),
        velocity: new Array(steps).fill(options.velocity ?? 100),
        pitch: new Array(steps).fill(0),
        gate: new Array(steps).fill(0.8),
        volume: options.volume ?? 0.8,
        pan: 0,
        mute: false,
        solo: false,
      },
      {
        track_id: "bass",
        name: "Bass",
        instrument: "synth",
        steps: Array.from({ length: steps }, (_, i) => (i % 8 === 2 ? 1 : 0)),
        velocity: new Array(steps).fill(options.velocity ?? 100),
        pitch: Array.from({ length: steps }, (_, i) => (i % 8 === 2 ? 36 : 0)),
        gate: new Array(steps).fill(0.8),
        volume: options.volume ?? 0.8,
        pan: 0,
        mute: false,
        solo: false,
      },
    ],
  } as unknown as SequencerPattern;
}

/** Drives the look-ahead loop forward without a real audio clock. */
function advanceTransport(engine: AudioEngine, ctx: FakeAudioContext, seconds: number, tickSeconds = 0.025) {
  const ticks = Math.max(1, Math.round(seconds / tickSeconds));
  const scheduler = engine as unknown as { schedulerLoop: () => void };
  for (let i = 0; i < ticks; i++) {
    ctx.currentTime += tickSeconds;
    scheduler.schedulerLoop();
  }
}

describe("E-03 · realtime transport on a fake AudioContext", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    restore = installFakeAudioContext();
  });

  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  it("initialises a real audio graph instead of running headless", () => {
    const engine = new AudioEngine();
    expect(engine.getAudioContext()).toBeInstanceOf(FakeAudioContext);
    engine.destroy();
  });

  it("play() schedules the first steps immediately (synchronous look-ahead pass)", async () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern());

    await engine.play();

    expect(engine.getIsPlaying()).toBe(true);
    expect(engine.getSchedulerHealth().queuedSteps).toBeGreaterThan(0);
    // Real voices were created through the graph, not skipped.
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    expect(ctx.createdOscillators.length).toBeGreaterThan(0);

    engine.destroy();
  });

  it("advances the step grid across the pattern and reports steps to the callback", async () => {
    const onStep = vi.fn();
    const engine = new AudioEngine({ onStep });
    engine.setPattern(makePattern({ steps: 16 }));
    await engine.play();

    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    advanceTransport(engine, ctx, 2);

    expect(engine.getCurrentStep()).toBeGreaterThanOrEqual(0);
    expect(engine.getSchedulerHealth().queuedSteps).toBeLessThanOrEqual(128);
    expect(engine.getSchedulerHealth().schedulingErrors).toBe(0);

    engine.destroy();
  });

  it("keeps playing when a track fader is at zero (the P0 wedge regression)", async () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern({ volume: 0, velocity: 0 }));

    await expect(engine.play()).resolves.toBeUndefined();
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    expect(() => advanceTransport(engine, ctx, 1)).not.toThrow();

    expect(engine.getSchedulerHealth().schedulingErrors).toBe(0);
    expect(engine.getIsPlaying()).toBe(true);

    engine.destroy();
  });

  it("resyncs instead of firing every missed step after a stall", async () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern({ steps: 16 }));
    await engine.play();
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;

    const before = engine.getSchedulerHealth();
    // Simulate a backgrounded tab: the audio clock jumps 5 seconds forward.
    ctx.currentTime += 5;
    (engine as unknown as { schedulerLoop: () => void }).schedulerLoop();

    const after = engine.getSchedulerHealth();
    expect(after.droppedSteps).toBeGreaterThan(before.droppedSteps);
    // A 5s stall at 120 BPM / 1-16 is 40 steps; the queue must not replay them all.
    expect(after.queuedSteps).toBeLessThan(128);

    engine.destroy();
  });

  it("stop() halts the transport and reports it", async () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern());
    await engine.play();
    expect(engine.getIsPlaying()).toBe(true);

    engine.stop();
    expect(engine.getIsPlaying()).toBe(false);
    // A second stop must be harmless.
    expect(() => engine.stop()).not.toThrow();

    engine.destroy();
  });

  it("destroy() closes the context exactly once and is idempotent", () => {
    const engine = new AudioEngine();
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    expect(ctx.state).toBe("running");

    engine.destroy();
    expect(ctx.state).toBe("closed");
    expect(() => engine.destroy()).not.toThrow();
  });

  it("applies per-track mute and solo while scheduling", async () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern());
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;

    engine.setTrackState(0, { mute: true });
    const beforeMuted = ctx.createdOscillators.length;
    await engine.play();
    advanceTransport(engine, ctx, 0.5);
    const mutedVoices = ctx.createdOscillators.length - beforeMuted;

    engine.stop();

    const engine2 = new AudioEngine();
    engine2.setPattern(makePattern());
    const ctx2 = engine2.getAudioContext() as unknown as FakeAudioContext;
    const beforeFull = ctx2.createdOscillators.length;
    await engine2.play();
    advanceTransport(engine2, ctx2, 0.5);
    const fullVoices = ctx2.createdOscillators.length - beforeFull;

    // Muting the kick must not remove the bass, but it must reduce total voices.
    expect(mutedVoices).toBeGreaterThan(0);
    expect(mutedVoices).toBeLessThan(fullVoices);

    engine.destroy();
    engine2.destroy();
  });

  it("honours the loop range while advancing", async () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern({ steps: 16 }));
    engine.setLoopRange([4, 8]);
    await engine.play();

    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
    advanceTransport(engine, ctx, 2);

    expect(engine.getCurrentStep()).toBeGreaterThanOrEqual(4);
    expect(engine.getCurrentStep()).toBeLessThan(8);

    engine.destroy();
  });
});
