import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MASTER_LIMITER_SETTINGS,
  MAX_TRACKED_VOICES,
  VoiceRegistry,
  applyMasterLimiter,
  createEngineAudioContext,
  rampBusMute,
} from "../audio/voiceRegistry";
import { MasterclassAudioEngine } from "../audio/MasterclassAudioEngine";
import { ChordAudioEngine } from "../audio/ChordAudioEngine";
import {
  FakeAudioContext,
  FakeGainNode,
  FakeOscillatorNode,
  installFakeAudioContext,
} from "./helpers/fakeAudio";

/**
 * A-05: the three engines used to each own a copy of the voice bookkeeping / limiter /
 * context bootstrap (and the masterclass engine had none at all, so `stop()` left
 * scheduled voices sounding). These tests cover the shared implementation and the two
 * engines that now depend on it.
 */
describe("A-05 · VoiceRegistry", () => {
  function makeVoice(stopTime: number) {
    const gain = new FakeGainNode();
    const source = new FakeOscillatorNode();
    return { gain, source, stopTime };
  }

  it("tracks registered voices and prunes the finished ones", () => {
    let now = 0;
    const registry = new VoiceRegistry(() => now);
    const a = makeVoice(1);
    const b = makeVoice(5);
    registry.register(a.source as unknown as AudioScheduledSourceNode, a.gain as unknown as GainNode, a.stopTime);
    registry.register(b.source as unknown as AudioScheduledSourceNode, b.gain as unknown as GainNode, b.stopTime);
    expect(registry.size).toBe(2);

    now = 2;
    registry.prune();
    expect(registry.size).toBe(1);
  });

  it("panic() fades every voice and empties the registry", () => {
    const registry = new VoiceRegistry(() => 0);
    const voices = [makeVoice(10), makeVoice(10)];
    for (const v of voices) {
      registry.register(v.source as unknown as AudioScheduledSourceNode, v.gain as unknown as GainNode, v.stopTime);
    }

    registry.panic();

    for (const v of voices) {
      const events = v.gain.gain.events;
      expect(events.some((e) => e.type === "setValueAtTime")).toBe(true);
      expect(events.some((e) => e.type === "linearRampToValueAtTime" && e.value <= 0.001)).toBe(true);
    }
    expect(registry.size).toBe(0);
  });

  it("panic() survives voices the browser already stopped", () => {
    const registry = new VoiceRegistry(() => 0);
    const broken = {
      gain: {
        gain: {
          cancelScheduledValues: () => {
            throw new Error("already stopped");
          },
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          value: 1,
        },
      },
      source: {
        stop: () => {
          throw new Error("already stopped");
        },
      },
      stopTime: 10,
    };
    registry.register(
      broken.source as unknown as AudioScheduledSourceNode,
      broken.gain as unknown as GainNode,
      broken.stopTime
    );

    expect(() => registry.panic()).not.toThrow();
    expect(registry.size).toBe(0);
  });

  it("stays bounded on a long session", () => {
    const registry = new VoiceRegistry(() => 0);
    for (let i = 0; i < MAX_TRACKED_VOICES + 200; i++) {
      const v = makeVoice(1000);
      registry.register(v.source as unknown as AudioScheduledSourceNode, v.gain as unknown as GainNode, v.stopTime);
    }
    expect(registry.size).toBeLessThanOrEqual(MAX_TRACKED_VOICES);
  });

  it("clear() forgets everything without touching the nodes", () => {
    const registry = new VoiceRegistry(() => 0);
    const v = makeVoice(10);
    registry.register(v.source as unknown as AudioScheduledSourceNode, v.gain as unknown as GainNode, v.stopTime);
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

describe("A-05 · shared context / limiter / bus helpers", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("applies one canonical limiter configuration", () => {
    const ctx = new FakeAudioContext();
    const limiter = ctx.createDynamicsCompressor();
    applyMasterLimiter(limiter as unknown as DynamicsCompressorNode, ctx as unknown as BaseAudioContext);

    expect(limiter.threshold.value).toBe(MASTER_LIMITER_SETTINGS.threshold);
    expect(limiter.ratio.value).toBe(MASTER_LIMITER_SETTINGS.ratio);
    expect(limiter.attack.value).toBe(MASTER_LIMITER_SETTINGS.attack);
    expect(limiter.release.value).toBe(MASTER_LIMITER_SETTINGS.release);
  });

  it("creates a real context from the environment", () => {
    const ctx = createEngineAudioContext();
    expect(ctx).toBeInstanceOf(FakeAudioContext);
  });

  it("mutes and restores a bus without ever ramping to exactly zero", () => {
    const ctx = new FakeAudioContext();
    const bus = ctx.createGain();
    bus.gain.value = 0.85;

    rampBusMute(bus as unknown as GainNode, ctx as unknown as BaseAudioContext, true, 0.85);
    const muteEvent = bus.gain.events[bus.gain.events.length - 1];
    expect(muteEvent.type).toBe("linearRampToValueAtTime");
    expect(muteEvent.value).toBeGreaterThan(0);

    rampBusMute(bus as unknown as GainNode, ctx as unknown as BaseAudioContext, false, 0.85);
    const restoreEvent = bus.gain.events[bus.gain.events.length - 1];
    expect(restoreEvent.value).toBeCloseTo(0.85);
  });
});

describe("A-05 · engines share the plumbing", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  it("MasterclassAudioEngine.stop() silences the bus instead of leaving voices ringing", () => {
    const engine = new MasterclassAudioEngine();
    engine.start();

    const masterGain = (engine as unknown as { masterGain: FakeGainNode | null }).masterGain;
    expect(masterGain).not.toBeNull();
    const eventsBeforeStop = masterGain!.gain.events.length;

    engine.stop();

    const events = masterGain!.gain.events;
    expect(events.length).toBeGreaterThan(eventsBeforeStop);
    const last = events[events.length - 1];
    expect(last.type).toBe("linearRampToValueAtTime");
    expect(last.value).toBeLessThanOrEqual(0.001);
    expect(engine.getIsPlaying()).toBe(false);

    // Restarting must un-mute again, otherwise the engine would be permanently silent.
    engine.start();
    const afterRestart = masterGain!.gain.events[masterGain!.gain.events.length - 1];
    expect(afterRestart.value).toBeGreaterThan(0.5);

    engine.destroy();
  });

  it("MasterclassAudioEngine.destroy() is idempotent and closes the context once", () => {
    const engine = new MasterclassAudioEngine();
    engine.start();
    const ctx = (engine as unknown as { ctx: FakeAudioContext | null }).ctx!;

    engine.destroy();
    expect(ctx.state).toBe("closed");
    expect(() => engine.destroy()).not.toThrow();
  });

  it("ChordAudioEngine.panic() clears its registered voices", () => {
    const engine = new ChordAudioEngine();
    const ctx = engine.initAudioContext() as unknown as FakeAudioContext;
    expect(ctx).toBeInstanceOf(FakeAudioContext);

    // Register one voice through the same path the synth uses.
    const gain = ctx.createGain();
    const source = ctx.createOscillator();
    (engine as unknown as {
      registerVoice: (s: unknown, g: unknown, t: number) => void;
    }).registerVoice(source, gain, 10);

    expect(() => engine.panic()).not.toThrow();
    engine.destroy();
  });
});
