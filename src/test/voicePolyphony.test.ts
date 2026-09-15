/**
 * E-08 — bounded polyphony with click-free voice stealing.
 *
 * The engine has no voice pool: every note builds a fresh node graph and nothing capped
 * how many could sound at once. E-01 then tripled the `chords` track's voice count by
 * giving it real harmony, which makes an unbounded engine a genuine risk rather than a
 * theoretical one.
 *
 * These tests pin three separate claims, because "it never exceeds the cap" alone would
 * pass for an implementation that simply dropped notes or that clicked on every steal:
 *   1. the cap holds,
 *   2. the *right* voice is chosen (the one closest to finishing),
 *   3. stealing is a fade, not a step.
 */
import { describe, it, expect } from "vitest";
import {
  VoiceRegistry,
  DEFAULT_MAX_ACTIVE_VOICES,
  STEAL_FADE_SEC,
  PANIC_FADE_SEC,
} from "../audio/voiceRegistry";
import { FakeGainNode } from "./helpers/fakeAudio";

/** Records `stop(when)` so a steal can be shown to stop a voice early. */
class RecordingSource {
  public stoppedAt: number[] = [];
  stop(when = 0): void {
    this.stoppedAt.push(when);
  }
}

function makeVoice(stopTime: number) {
  const gain = new FakeGainNode();
  const source = new RecordingSource();
  return { gain, source, stopTime };
}

type Registerable = Parameters<VoiceRegistry["register"]>;

function register(registry: VoiceRegistry, voice: ReturnType<typeof makeVoice>) {
  registry.register(
    voice.source as unknown as Registerable[0],
    voice.gain as unknown as Registerable[1],
    voice.stopTime
  );
}

describe("E-08 · polyphony cap", () => {
  it("never tracks more voices than the cap", () => {
    const registry = new VoiceRegistry(() => 0, 4);
    for (let i = 0; i < 50; i++) {
      register(registry, makeVoice(100));
    }
    expect(registry.activeVoices).toBe(4);
    expect(registry.size).toBe(4);
  });

  it("does not steal while there is headroom", () => {
    const registry = new VoiceRegistry(() => 0, 8);
    for (let i = 0; i < 8; i++) register(registry, makeVoice(100));
    expect(registry.stealCount).toBe(0);
  });

  it("prunes finished voices instead of stealing them", () => {
    let now = 0;
    const registry = new VoiceRegistry(() => now, 4);
    // Four voices that all end at t=1, then time moves past them.
    for (let i = 0; i < 4; i++) register(registry, makeVoice(1));
    now = 5;
    register(registry, makeVoice(10));
    expect(registry.activeVoices).toBe(1);
    expect(registry.stealCount).toBe(0);
  });

  it("steals the voice closest to finishing, not the oldest", () => {
    const registry = new VoiceRegistry(() => 0, 3);
    // Registered oldest-first: the LAST one ends soonest, so it should be the victim.
    const oldest = makeVoice(100);
    const middle = makeVoice(50);
    const soonest = makeVoice(9);
    register(registry, oldest);
    register(registry, middle);
    register(registry, soonest);

    register(registry, makeVoice(100)); // forces one steal

    expect(registry.stealCount).toBe(1);
    expect(soonest.source.stoppedAt).toHaveLength(1);
    expect(oldest.source.stoppedAt).toHaveLength(0);
    expect(middle.source.stoppedAt).toHaveLength(0);
  });

  it("steals exactly as many voices as needed, no more", () => {
    const registry = new VoiceRegistry(() => 0, 2);
    register(registry, makeVoice(10));
    register(registry, makeVoice(20));
    register(registry, makeVoice(30));
    expect(registry.stealCount).toBe(1);
    register(registry, makeVoice(40));
    expect(registry.stealCount).toBe(2);
    expect(registry.activeVoices).toBe(2);
  });
});

describe("E-08 · stealing is a fade, not a step", () => {
  it("ramps the stolen voice down and stops it early", () => {
    const registry = new VoiceRegistry(() => 0, 1);
    const victim = makeVoice(100);
    // The voice must be *sounding* for "do not step to silence" to mean anything: the
    // fake's default gain is 0, from which an unconditional step to 0 is a no-op.
    victim.gain.gain.value = 0.5;
    register(registry, victim);
    register(registry, makeVoice(100));

    const events = victim.gain.gain.events;
    // The fade must start from the level the voice was actually at...
    const hold = events.find((e) => e.type === "setValueAtTime");
    expect(hold).toBeDefined();
    expect(hold!.value).toBeCloseTo(0.5, 6);

    // ...ramp down over the steal fade...
    const ramp = events.find((e) => e.type === "linearRampToValueAtTime");
    expect(ramp).toBeDefined();
    expect(ramp!.value).toBeCloseTo(0.0001, 6);
    expect(ramp!.time).toBeCloseTo(STEAL_FADE_SEC, 6);

    // ...and never hard-step a sounding voice to zero, which would itself click.
    const stepToZero = events.find((e) => e.type === "setValueAtTime" && e.value === 0);
    expect(stepToZero).toBeUndefined();

    // The voice is stopped earlier than it would have stopped on its own.
    expect(victim.source.stoppedAt).toHaveLength(1);
    expect(victim.source.stoppedAt[0]).toBeLessThan(100);
    expect(victim.source.stoppedAt[0]).toBeGreaterThanOrEqual(STEAL_FADE_SEC);
  });

  it("survives a voice that the browser has already stopped", () => {
    const registry = new VoiceRegistry(() => 0, 1);
    const victim = makeVoice(100);
    victim.source.stop = () => {
      throw new Error("already stopped");
    };
    register(registry, victim);
    expect(() => register(registry, makeVoice(100))).not.toThrow();
    expect(registry.activeVoices).toBe(1);
  });
});

describe("E-08 · configuration and diagnostics", () => {
  it("defaults to a cap that will not engage during normal playback", () => {
    // A safety net must not colour the sound; 128 tracked sources is roughly 32
    // simultaneous PolySynth notes, far above any pattern in the library.
    expect(DEFAULT_MAX_ACTIVE_VOICES).toBeGreaterThanOrEqual(64);
    const registry = new VoiceRegistry(() => 0);
    expect(registry.maxVoices).toBe(DEFAULT_MAX_ACTIVE_VOICES);
  });

  it("sanitises a degenerate cap instead of wedging the engine", () => {
    const registry = new VoiceRegistry(() => 0, 4);
    for (const bad of [0, -1, NaN, Infinity]) {
      registry.setMaxActiveVoices(bad);
      expect(registry.maxVoices).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(registry.maxVoices)).toBe(true);
    }
    // ...and the registry still works afterwards.
    register(registry, makeVoice(100));
    expect(registry.activeVoices).toBeGreaterThan(0);
  });

  it("can be driven down to a single voice without deadlocking", () => {
    const registry = new VoiceRegistry(() => 0, 1);
    for (let i = 0; i < 10; i++) register(registry, makeVoice(1000));
    expect(registry.activeVoices).toBe(1);
    expect(registry.stealCount).toBe(9);
  });

  it("reports the active count and resets it on clear()", () => {
    const registry = new VoiceRegistry(() => 0, 8);
    register(registry, makeVoice(100));
    register(registry, makeVoice(100));
    expect(registry.activeVoices).toBe(2);
    registry.clear();
    expect(registry.activeVoices).toBe(0);
  });
});

describe("E-08 · panic() still works after the shared release path", () => {
  it("fades every voice and empties the registry", () => {
    const registry = new VoiceRegistry(() => 0, 8);
    const voices = [makeVoice(100), makeVoice(100), makeVoice(100)];
    for (const v of voices) register(registry, v);

    registry.panic();

    expect(registry.activeVoices).toBe(0);
    for (const v of voices) {
      const ramp = v.gain.gain.events.find((e) => e.type === "linearRampToValueAtTime");
      expect(ramp).toBeDefined();
      expect(ramp!.time).toBeCloseTo(PANIC_FADE_SEC, 6);
      expect(v.source.stoppedAt).toHaveLength(1);
    }
  });
});
