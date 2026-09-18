import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { DEFAULT_SYNTH_PRESETS, keyTrackedCutoff } from "../audio/PolySynth";
import { resolveInstrumentPreset } from "../audio/instrumentPresets";
import { chordVoicingForStep } from "../audio/chordVoicing";
import { resolveVoicingStyle } from "../data/genreVoicing";
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

describe("genre timbres · the live engine voices the declared instrument", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    restore = installFakeAudioContext();
  });

  afterEach(() => {
    restore?.();
    restore = null;
  });

  function synthPattern(trackId: "bass" | "chords" | "lead" | "fx", instrument: string, pitch: number) {
    const steps = 16;
    return {
      genre_id: "timbre-test",
      bpm: 120,
      swing: 0,
      scale: "C minor",
      totalSteps: steps,
      tracks: [
        {
          track_id: trackId,
          name: trackId === "lead" ? "Lead" : trackId,
          instrument,
          steps: Array.from({ length: steps }, (_, i) => (i === 0 ? 1 : 0)),
          velocity: new Array(steps).fill(100),
          pitch: new Array(steps).fill(pitch),
          gate: new Array(steps).fill(0.8),
          volume: 0.8,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
    } as unknown as SequencerPattern;
  }

  /** Triggers one note and returns only the nodes that trigger created. */
  function triggerAndDiff(pattern: SequencerPattern) {
    const engine = new AudioEngine();
    engine.setPattern(pattern);
    engine.initAudioContext();
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;

    const oscBefore = ctx.createdOscillators.length;
    const filterBefore = ctx.createdFilters.length;
    engine.triggerNote(0, pattern.tracks[0].name, 0.8, pattern.tracks[0].pitch?.[0] ?? 0);

    return {
      engine,
      oscillators: ctx.createdOscillators.slice(oscBefore),
      filters: ctx.createdFilters.slice(filterBefore),
    };
  }

  it("plays a flute_lead with the flute preset instead of the analog lead", () => {
    const { engine, oscillators, filters } = triggerAndDiff(synthPattern("lead", "flute_lead", 72));
    const flute = resolveInstrumentPreset("flute_lead", "lead");

    // Two oscillators were created by playPolySynthNote with the resolved waveform
    // pair and the resolved detune — not the fixed analog lead (saw + square, 7 cents).
    expect(oscillators.map((o) => o.type)).toEqual([flute.osc1Type, flute.osc2Type]);
    expect(oscillators[1].detune.events[0]?.value).toBe(flute.osc2DetuneCents);
    expect(oscillators.map((o) => o.type)).not.toEqual([
      DEFAULT_SYNTH_PRESETS.analogLead.osc1Type,
      DEFAULT_SYNTH_PRESETS.analogLead.osc2Type,
    ]);

    // The per-voice low-pass is opened to the flute cutoff *for the note being played*: the
    // authored figure is a C4 value and this is a C5, so key tracking has moved it (see
    // `keyTrackedCutoff`).
    expect(filters).toHaveLength(1);
    expect(filters[0].frequency.events[0]?.value).toBe(keyTrackedCutoff(flute, 72));
    expect(filters[0].frequency.events[0]?.value).not.toBe(flute.filterCutoff);

    engine.destroy();
  });

  it("plays sub_bass on a sub_bass track with its own low-pass", () => {
    const { engine, oscillators, filters } = triggerAndDiff(synthPattern("bass", "sub_bass", 36));
    const sub = resolveInstrumentPreset("sub_bass", "bass");

    expect(oscillators.map((o) => o.type)).toEqual([sub.osc1Type, sub.osc2Type]);
    // Two octaves below the C4 anchor, so the corner closes — which is what a sub bass needs.
    expect(filters[0].frequency.events[0]?.value).toBe(keyTrackedCutoff(sub, 36));
    // The old behaviour was acidBass (1200 Hz); sub_bass must be lower still.
    expect(filters[0].frequency.events[0]?.value).toBeLessThan(
      DEFAULT_SYNTH_PRESETS.acidBass.filterCutoff
    );

    engine.destroy();
  });

  it("plays a rhodes_ep chord as a voicing with the EP preset", () => {
    const { engine, oscillators, filters } = triggerAndDiff(synthPattern("chords", "rhodes_ep", 60));
    const rhodes = resolveInstrumentPreset("rhodes_ep", "chords");

    // E-01: the chords track is no longer monophonic, and the voicing is no longer a
    // generic 1-3-5 — it depends on the genre, falling back to the track's instrument.
    // This fixture has no genre entry, so the Rhodes instrument resolves to 7ths: the
    // point of the assertion is that the *harpsichord-like* behaviour (one note, or a
    // bare triad regardless of instrument) cannot come back.
    const style = resolveVoicingStyle("timbre-test", "rhodes_ep");
    expect(style).toBe("seventh");
    const voicing = chordVoicingForStep(60, "C minor", { style });
    expect(voicing).toHaveLength(4);
    expect(oscillators.map((o) => o.type)).toEqual(
      voicing.flatMap(() => [rhodes.osc1Type, rhodes.osc2Type])
    );
    expect(filters).toHaveLength(voicing.length);
    // One tracked corner per chord tone: a voicing is not one filter setting repeated, it is each
    // note's own. (This used to require the identical authored value on all four.)
    const expectedRhodes = voicing.map((n) => keyTrackedCutoff(rhodes, n));
    expect(filters.map((f) => f.frequency.events[0]?.value).sort((a, b) => (a as number) - (b as number))).toEqual(
      [...expectedRhodes].sort((a, b) => a - b)
    );
    expect(rhodes).not.toBe(DEFAULT_SYNTH_PRESETS.warmPad);

    engine.destroy();
  });

  it("keeps the legacy role preset for an unknown instrument", () => {
    const { engine, filters } = triggerAndDiff(synthPattern("lead", "totally_unknown", 72));

    expect(filters[0].frequency.events[0]?.value).toBe(
      keyTrackedCutoff(DEFAULT_SYNTH_PRESETS.analogLead, 72)
    );

    engine.destroy();
  });

  it("keeps the dedicated noise-sweep path for the noise_sweep fx instrument", () => {
    const engine = new AudioEngine();
    engine.setPattern(synthPattern("fx", "noise_sweep", 12));
    engine.initAudioContext();
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;

    const oscBefore = ctx.createdOscillators.length;
    const filterBefore = ctx.createdFilters.length;
    engine.triggerNote(0, "fx", 0.8, 12);

    // The sweep is one oscillator through a bandpass that starts at 2000 Hz — the
    // poly synth would have created two oscillators instead.
    expect(ctx.createdOscillators.slice(oscBefore)).toHaveLength(1);
    const filters = ctx.createdFilters.slice(filterBefore);
    expect(filters).toHaveLength(1);
    expect(filters[0].frequency.events[0]?.value).toBe(2000);

    engine.destroy();
  });
});
