/**
 * ⭐ **The automation curve has to reach the audio graph, or the lane is a control that lies.**
 *
 * The compile expands a curve into `volumeByStep`, and this is the other end: the scheduler must schedule that step's
 * gain on the track's strip at that step's time. The two failures worth pinning are the ones an implementation actually
 * makes — a lane whose static `volume` keeps winning (the curve is stored, drawn and inaudible), and a curve that is
 * only applied once rather than per step (a fade becomes a level).
 *
 * The fader's own methods are spied rather than the graph inspected: the question is what the engine *scheduled* and
 * when, which is exactly what `setValueAtTime` answers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { FakeAudioParam, installFakeAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

const rep = (pattern: number[], length = 16): number[] => {
  const out: number[] = [];
  for (let i = 0; i < length; i++) out.push(pattern[i % pattern.length] ?? 0);
  return out;
};

/** One lane that sounds on every step, so a per-step gain has somewhere to be scheduled. */
function patternWith(volumeByStep?: number[]): SequencerPattern {
  const track: SequencerTrack = {
    track_id: "kick",
    name: "Kick",
    instrument: "kick",
    steps: rep([1]),
    velocity: rep([100]),
    pitch: rep([0]),
    volume: 1,
    ...(volumeByStep ? { volumeByStep } : {}),
  };
  return {
    genre_id: "automation_engine",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: 16,
    tracks: [track],
  } as unknown as SequencerPattern;
}

let restore: (() => void) | null = null;
beforeEach(() => {
  restore = installFakeAudioContext();
});
afterEach(() => {
  restore?.();
  restore = null;
  vi.restoreAllMocks();
});

/**
 * The gains the engine scheduled on the first track's strip, in order.
 *
 * Read from the double's own event log rather than a spy: `FakeAudioParam` records every scheduling call, which is the
 * same instrument `lookaheadMuteWindow` uses to tell a ramp from a step — so this asks the graph what it was told, not
 * what one method happened to be called with.
 */
async function scheduledGains(pattern: SequencerPattern): Promise<number[]> {
  const engine = new AudioEngine();
  engine.setPattern(pattern);
  const strip = (engine as unknown as { trackStrips: Array<{ gain: { gain: FakeAudioParam } } | null> }).trackStrips[0];
  const param = strip?.gain.gain;
  if (!param) throw new Error("the engine built no strip for the lane");
  param.events.length = 0;
  await engine.play();
  return param.events.filter((event) => event.type === "setValueAtTime").map((event) => event.value);
}

describe("an automated lane in the live engine", () => {
  it("⭐ schedules the curve's own value per step instead of the static fader", async () => {
    const gains = await scheduledGains(patternWith([0.25, 0.5, 0.75, 1]));
    expect(gains.length, "several steps were scheduled").toBeGreaterThan(1);
    // The values come from the curve, not from `volume: 1` — that is the whole point.
    for (const gain of gains) expect([0.25, 0.5, 0.75, 1]).toContain(gain);
    expect(new Set(gains).size, "and it is per step, not one level applied repeatedly").toBeGreaterThan(1);
    expect(gains[0]).toBe(0.25);
  });

  it("leaves a lane without automation to the static fader, so nothing changes for existing projects", async () => {
    const gains = await scheduledGains(patternWith());
    for (const gain of gains) expect(gain).toBe(1);
  });

  it("clamps a curve to the mixer's own ceiling rather than trusting the stored array", async () => {
    const gains = await scheduledGains(patternWith([99]));
    for (const gain of gains) expect(gain).toBeLessThanOrEqual(2);
  });
});
