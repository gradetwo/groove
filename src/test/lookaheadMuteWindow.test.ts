/**
 * ⭐5 · **The 200 ms look-ahead and a live mute/fader — measured first, then pinned.**
 *
 * ## What was reported, and what the measurement says
 *
 * `docs/OPEN_WORK.md` §107.3 (⭐5) inferred from two constants — `lookaheadMs = 20`
 * (`AudioEngine.ts`, the scheduler's execution period) and `scheduleAheadSec = 0.20`
 * (`AudioEngine.ts`, how far ahead a note is placed on the Web Audio timeline) — that a note placed
 * 200 ms before it sounds is **immune to a later mute or fader move**. That inference is only sound
 * if the lane's audibility is *baked into the voice* when the voice is built. It is not:
 *
 *   · `syncTrackGains()` writes the lane's mute/volume to the **channel strip's own gain node**, and
 *     every voice is connected upstream of it (`getTrackDestination` → `insert.input` → … → `gain`);
 *   · so a note placed 185 ms ahead, then muted, is multiplied by ~0 at **its own onset** (M1 below)
 *     and a note already sounding is below −60 dB 34.6 ms later (M1b);
 *   · and a fader move is fully in force at an already-placed note's onset, settling within 1% in
 *     28.6 ms (M2).
 *
 * The one direction the look-ahead *does* bite is **unmuting**: the pass consumes every step inside
 * `[now, now + scheduleAheadSec)` and skips a silenced lane, so those onsets were never voiced and
 * had to wait for the next grid event beyond the window — measured at 120 BPM as two lost 1/16
 * onsets, 285 ms of silence after the unmute (M3). That is what the change under test fixes, by
 * re-voicing exactly those onsets at their original times when a lane becomes audible again
 * (`AudioEngine.revoiceStepsThatBecameAudible`).
 *
 * ## Method (stated, because a criterion that hides its method is not a measurement)
 *
 * jsdom ships no Web Audio, so there is no waveform to render and none is claimed. The measurement
 * is taken on the **automation the engine schedules**: {@link gainAt} evaluates an `AudioParam`'s
 * recorded event list with the platform's semantics (a step holds, a linear ramp interpolates,
 * `setTargetAtTime` approaches exponentially and never arrives — which is why "muted" is stated as
 * "below −60 dB" rather than "== 0"). The note's onset is not assumed either: it is read off the
 * voice the engine actually created (`FakeOscillatorNode.startedAt[0]`), and the lane's gain is
 * evaluated **at that instant**.
 *
 * ## What this file explicitly does not cover
 *
 * A lane whose sound is a catalogue recording is not voiced by this engine at all
 * (`sampledLaneIndexes`), and the live sampler path places its voices on `musicDestination` — the
 * bus *after* the strips — so neither this fix nor the strip gain reaches them: for a recorded lane,
 * mute is still decided when a pass is planned (`samplerLanePlayback.audibleSamplerLanesOf`), which
 * is a whole pass of latency, not 200 ms. That is measured structurally in the last block and
 * skipped there with its reason; it belongs to the sampler workstream, not to this one, and it is
 * **not** silently ignored.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import type { SequencerPattern } from "../types/genre";
import { FakeAudioContext, FakeGainNode, FakeNode, installFakeAudioContext } from "./helpers/fakeAudio";

const STEPS = 16;
/** 120 BPM at 1/16 — the grid the readings below are quoted on. */
const STEP_SECONDS = 0.125;

function pattern(options: { everyStep?: boolean } = {}): SequencerPattern {
  const hitEveryStep = options.everyStep ?? false;
  return {
    genre_id: "lookahead-test",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: STEPS,
    tracks: [
      {
        track_id: "bass",
        name: "Bass",
        instrument: "synth",
        steps: Array.from({ length: STEPS }, (_, i) => (hitEveryStep || i % 4 === 0 ? 1 : 0)),
        velocity: new Array(STEPS).fill(100),
        pitch: new Array(STEPS).fill(36),
        gate: new Array(STEPS).fill(0.8),
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
      },
    ],
  } as unknown as SequencerPattern;
}

type ParamEvent = { type: string; value: number; time: number; timeConstant?: number };

/**
 * The value of an `AudioParam` at time `t`, from the events the engine scheduled on it.
 *
 * The three semantics that matter, exactly as the Web Audio specification defines them:
 * `setValueAtTime` holds until the next event, `linearRampToValueAtTime` interpolates from the
 * previous event's time and value, and `setTargetAtTime` approaches its target exponentially with
 * the recorded time constant and **never arrives** — so "muted" is a threshold, not an equality.
 */
function gainAt(events: readonly ParamEvent[], t: number): number {
  let held = 0;
  let approach: { from: number; t0: number; target: number; tc: number } | null = null;
  for (const event of events) {
    if (event.time > t) break;
    if (
      event.type === "setValueAtTime" ||
      event.type === "linearRampToValueAtTime" ||
      event.type === "exponentialRampToValueAtTime"
    ) {
      held = event.value;
      approach = null;
    } else if (event.type === "setTargetAtTime") {
      approach = { from: held, t0: event.time, target: event.value, tc: event.timeConstant ?? 0.005 };
    }
  }
  if (approach && t > approach.t0) {
    return approach.target + (approach.from - approach.target) * Math.exp(-(t - approach.t0) / approach.tc);
  }
  return held;
}

/** The first instant at or after `from` where the parameter is within `tolerance` of `target`. */
function settleMs(events: readonly ParamEvent[], from: number, target: number, tolerance: number): number {
  for (let step = 1; step <= 4000; step++) {
    const t = from + step / 20000;
    if (Math.abs(gainAt(events, t) - target) <= tolerance) return (t - from) * 1000;
  }
  return Infinity;
}

/** Every node reachable downstream of `from`, following the fake graph's recorded edges. */
function reachableFrom(from: FakeNode): Set<FakeNode> {
  const seen = new Set<FakeNode>();
  const queue: FakeNode[] = [from];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const edge of node.outgoing) queue.push(edge.node);
  }
  return seen;
}

/** Drives the look-ahead loop forward without a real audio clock (the scheduler's own tick). */
function advance(engine: AudioEngine, ctx: FakeAudioContext, seconds: number, tickSeconds = 0.025) {
  const ticks = Math.max(1, Math.round(seconds / tickSeconds));
  const scheduler = engine as unknown as { schedulerLoop: () => void };
  for (let i = 0; i < ticks; i++) {
    ctx.currentTime += tickSeconds;
    scheduler.schedulerLoop();
  }
}

interface Internals {
  nextStepTime: number;
  scheduleAheadSec: number;
  scheduledWindow: Array<{ step: number; time: number; stepDur: number; silenced: Set<number> }>;
}

function internals(engine: AudioEngine): Internals {
  return engine as unknown as Internals;
}

function stripGain(engine: AudioEngine, idx: number): FakeGainNode {
  return (engine as unknown as { trackStrips: Array<{ gain: FakeGainNode }> }).trackStrips[idx].gain;
}

function stripGainEvents(engine: AudioEngine, idx: number): ParamEvent[] {
  return stripGain(engine, idx).gain.events as ParamEvent[];
}

/**
 * The onsets of the voices the engine's scheduler created after `mark`, earliest first.
 *
 * Filtered by routing rather than by count, because `play()` also fires the GS-1 capability probe
 * (`gs1Capability.ts:218`: a probe oscillator at gain 0.33 → analyser → destination, deliberately
 * outside the mixer). A voice that does not reach the lane's own destination is not a note, and
 * counting it as one would make every reading below wrong.
 */
function noteOnsets(ctx: FakeAudioContext, engine: AudioEngine, mark: number, trackIdx = 0): number[] {
  const destination = engine.getTrackDestination(trackIdx) as unknown as FakeNode;
  return ctx.createdOscillators
    .slice(mark)
    .filter((osc) => reachableFrom(osc as unknown as FakeNode).has(destination))
    .map((osc) => osc.startedAt[0])
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b);
}

async function playing(options: { everyStep?: boolean } = {}) {
  const engine = new AudioEngine();
  engine.setPattern(pattern(options));
  const ctx = engine.getAudioContext() as unknown as FakeAudioContext;
  const mark = ctx.createdOscillators.length;
  await engine.play();
  return { engine, ctx, mark };
}

describe("⭐5 · a live mute on the look-ahead's own notes", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("M4 · a note the engine scheduled reaches the lane's own fader gain", async () => {
    const { engine, ctx, mark } = await playing({ everyStep: true });
    advance(engine, ctx, 0.1);

    const destination = engine.getTrackDestination(0) as unknown as FakeNode;
    expect(
      reachableFrom(destination).has(stripGain(engine, 0) as unknown as FakeNode),
      "the lane's fader gain must sit downstream of the destination every voice connects to"
    ).toBe(true);

    const onsets = noteOnsets(ctx, engine, mark);
    expect(
      onsets.length,
      "no scheduled voice was routed through the lane — the readings would be vacuous"
    ).toBeGreaterThan(0);

    // The routing filter above is load-bearing: the GS-1 capability probe is also an oscillator.
    expect(ctx.createdOscillators.slice(mark).length).toBeGreaterThan(onsets.length);
    engine.destroy();
  });

  it("M1 · a note already placed is silent at its own onset when the lane is muted", async () => {
    const { engine, ctx, mark } = await playing({ everyStep: true });
    advance(engine, ctx, 0.1);

    const scheduledAhead = noteOnsets(ctx, engine, mark)
      .filter((t) => t > ctx.currentTime)
      .pop()!;
    expect(
      scheduledAhead - ctx.currentTime,
      "the note under measurement must have been placed strictly ahead of the mute"
    ).toBeGreaterThan(0.05);

    engine.setTrackState(0, { mute: true });

    const atOnset = gainAt(stripGainEvents(engine, 0), scheduledAhead);
    // eslint-disable-next-line no-console
    console.log(
      `[⭐5 M1] a note ${((scheduledAhead - ctx.currentTime) * 1000).toFixed(1)} ms ahead, muted now → ` +
        `lane gain at its onset = ${atOnset.toExponential(3)} (below −60 dB is 8e-4)`
    );
    expect(atOnset).toBeLessThan(0.8 * 1e-3);
    engine.destroy();
  });

  it("M1b · a note already sounding goes quiet fast, and the mute is a ramp rather than a step", async () => {
    const { engine, ctx } = await playing({ everyStep: true });
    advance(engine, ctx, 0.1);

    const mutedAt = ctx.currentTime;
    engine.setTrackState(0, { mute: true });
    const events = stripGainEvents(engine, 0);

    /**
     * The click criterion: the value at the mute instant is still the old one, and the new one is
     * approached with a time constant. A `setValueAtTime(0, now)` — a one-sample step — reads 0
     * here and carries no `timeConstant` at all, so deleting the ramp turns this red.
     */
    const atMuteInstant = gainAt(events, mutedAt);
    const muteEvents = events.filter((e) => e.time >= mutedAt && e.type === "setTargetAtTime");
    expect(muteEvents.length, "the mute must be applied as a ramp, not a step").toBeGreaterThan(0);
    expect(muteEvents[0].timeConstant, "the ramp must state a time constant").toBeGreaterThan(0);
    expect(atMuteInstant, "the gain must not jump at the mute instant — that is a click").toBeGreaterThan(0.5);

    const ms = settleMs(events, mutedAt, 0, 0.8 * 1e-3);
    // eslint-disable-next-line no-console
    console.log(
      `[⭐5 M1b] −60 dB ${ms.toFixed(1)} ms after the mute; value at the mute instant ${atMuteInstant.toFixed(3)}, ` +
        `time constant ${muteEvents[0].timeConstant}s`
    );
    expect(ms).toBeLessThan(60);
    engine.destroy();
  });

  it("M2 · a note already placed plays at the fader's new value", async () => {
    const { engine, ctx, mark } = await playing({ everyStep: true });
    advance(engine, ctx, 0.1);

    const scheduledAhead = noteOnsets(ctx, engine, mark)
      .filter((t) => t > ctx.currentTime)
      .pop()!;
    const movedAt = ctx.currentTime;
    engine.setTrackState(0, { volume: 0.2 });

    const events = stripGainEvents(engine, 0);
    const atOnset = gainAt(events, scheduledAhead);
    const ms = settleMs(events, movedAt, 0.2, 0.002);
    // eslint-disable-next-line no-console
    console.log(
      `[⭐5 M2] fader 0.8 → 0.2: lane gain at the already-placed note's onset = ${atOnset.toFixed(4)} ` +
        `(target 0.2); within 1% after ${ms.toFixed(1)} ms`
    );
    expect(atOnset).toBeCloseTo(0.2, 6);
    engine.destroy();
  });
});

describe("⭐5 · unmuting: the one window the look-ahead really costs", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  /**
   * ⭐ **The criterion this change exists for.** While the transport is running with a lane muted,
   * unmute it: every onset the current pass already consumed and that is *still in the future* must
   * be voiced at its original time. Without the fix the first sound is the first grid event beyond
   * `now + scheduleAheadSec`, which is strictly later than the window — so this goes red when
   * `revoiceStepsThatBecameAudible` is not called.
   */
  it("M3 · unmute is heard inside the look-ahead window, not after it", async () => {
    const { engine, ctx, mark } = await playing({ everyStep: true });

    engine.setTrackState(0, { mute: true });
    advance(engine, ctx, 1.0);

    // A lane that stays muted places no voices at all — the reading `audioScheduler.test.ts` pins.
    const placedWhileMuted = ctx.createdOscillators.length;
    const windowBeforeUnmute = internals(engine)
      .scheduledWindow.map((entry) => entry.time)
      .filter((t) => t > ctx.currentTime);

    engine.setTrackState(0, { mute: false });
    const unmuteAt = ctx.currentTime;
    advance(engine, ctx, 0.5);

    const heard = noteOnsets(ctx, engine, mark).filter((t) => t > unmuteAt);
    const firstOnset = heard[0];
    const gap = firstOnset - unmuteAt;
    // eslint-disable-next-line no-console
    console.log(
      `[⭐5 M3] muted for 1 s, unmuted at t=${unmuteAt.toFixed(3)}: onsets the pass had consumed and still had in ` +
        `the future = [${windowBeforeUnmute.map((t) => t.toFixed(3)).join(", ")}]; first sound ${(gap * 1000).toFixed(0)} ms ` +
        `later (at t=${firstOnset.toFixed(3)}); window = ${internals(engine).scheduleAheadSec}s`
    );

    expect(windowBeforeUnmute.length, "the measurement needs an onset inside the window to give back").toBeGreaterThan(0);
    expect(
      windowBeforeUnmute.every((t) => heard.includes(t)),
      "every onset the pass consumed inside the window must be voiced when the lane becomes audible"
    ).toBe(true);
    expect(
      gap,
      "the first sound after an unmute must land inside the window the unmute happened in"
    ).toBeLessThan(internals(engine).scheduleAheadSec);
    // The re-voiced note is heard at the lane's own level, not at a stale one.
    expect(gainAt(stripGainEvents(engine, 0), firstOnset)).toBeCloseTo(0.8, 3);
    /**
     * And the playhead's report agrees with what is heard: the step it belongs to now names the
     * lane as active, which is what the lane flash is drawn from.
     */
    const reported = (
      engine as unknown as { stepQueue: Array<{ step: number; time: number; activeTracks: number[] }> }
    ).stepQueue.find((item) => Math.abs(item.time - firstOnset) < 1e-9);
    expect(reported?.activeTracks, "the step that was given its onset back must report the lane").toContain(0);
    expect(ctx.createdOscillators.length).toBeGreaterThan(placedWhileMuted);
    engine.destroy();
  });

  it("M3b · a lane muted for the whole pass still places no voices (being muted stays free)", async () => {
    const { engine, ctx } = await playing({ everyStep: true });
    engine.setTrackState(0, { mute: true });
    const before = ctx.createdOscillators.length;
    advance(engine, ctx, 1.0);
    // eslint-disable-next-line no-console
    console.log(`[⭐5 M3b] voices placed by a lane muted for 1 s: ${ctx.createdOscillators.length - before}`);
    expect(ctx.createdOscillators.length).toBe(before);
    engine.destroy();
  });

  it("M3c · the re-voice is in the future, never a late blip from the muted past", async () => {
    const { engine, ctx, mark } = await playing({ everyStep: true });
    engine.setTrackState(0, { mute: true });
    advance(engine, ctx, 0.4);
    const unmuteAt = ctx.currentTime;
    engine.setTrackState(0, { mute: false });
    const onsets = noteOnsets(ctx, engine, mark).filter((t) => t > unmuteAt - 1e-9);
    expect(onsets.length).toBeGreaterThan(0);
    // The first thing it does is the nearest *future* onset, not a catch-up burst of the past.
    expect(onsets[0] - unmuteAt).toBeLessThanOrEqual(STEP_SECONDS + 0.05);
    engine.destroy();
  });
});

describe("⭐5 · the recorded-lane path (excluded, and said so)", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("M5 · a recorded lane's destination is the bus *after* the strips, so the strip gain cannot reach it", async () => {
    const { engine } = await playing({ everyStep: true });
    const laneDestination = engine.getTrackDestination(0) as unknown as FakeNode;
    const samplerDestination = engine.musicDestination as unknown as FakeNode;
    expect(samplerDestination).not.toBe(laneDestination);
    // The strip feeds the bus (so an engine voice is inside the fader)…
    expect(reachableFrom(laneDestination).has(samplerDestination)).toBe(true);
    // …which is exactly why a voice connected *to the bus* is outside the fader.
    expect(reachableFrom(samplerDestination).has(stripGain(engine, 0) as unknown as FakeNode)).toBe(false);
    engine.destroy();
  });

  /**
   * ⚠️ **Not fixed here, and not hidden either.**
   *
   * The live sampler path places recorded lanes on `engine.musicDestination`
   * (`samplerLanePlayback.ts`, `place()`), so a recorded lane's already-placed voices are never
   * multiplied by its own strip gain — and `audibleSamplerLanesOf` consults mute only when a pass is
   * **planned**. Measured consequence: muting a recorded lane keeps the current pass sounding (up to
   * a whole pattern, not 200 ms) and its fader never applies. Fixing that means routing each lane's
   * voices to its own strip, which is the sampler workstream's territory
   * (`sampleLoader.ts` / `browserSampleGraph.ts` / the lane scheduler), so it is skipped with this
   * reason rather than quietly passing.
   */
  it.skip("M6 · mute/fader on a recorded lane take effect on already-placed voices (sampler workstream)", () => {
    // Deliberately not implemented in this workstream: see the note above and the report for ⭐5.
  });
});
