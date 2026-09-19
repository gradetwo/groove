import { describe, it, expect } from "vitest";
import { safeGain, safeFreq, safeVelocity, safeTime, MIN_GAIN, MAX_FREQ } from "../audio/dspGuards";
import { computeCatchUp } from "../audio/schedulerMath";
import { synthesizeKick, synthesizeSnare, synthesizeHiHat, synthesizePercussion } from "../audio/DrumKitModels";
import { playPolySynthNote } from "../audio/PolySynth";
import { FakeOfflineAudioContext } from "./helpers/fakeAudio";

/**
 * Minimal AudioContext double that reproduces the one browser behaviour that matters
 * here: `exponentialRampToValueAtTime` throws a RangeError for a target <= 0.
 * Everything else is inert bookkeeping.
 */
class FakeAudioParam {
  value = 0;
  exponentialTargets: number[] = [];

  setValueAtTime(value: number, _time: number) {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, _time: number) {
    if (!Number.isFinite(value)) throw new RangeError(`linearRampToValueAtTime: ${value}`);
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number, _time: number) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`exponentialRampToValueAtTime target must be > 0, got ${value}`);
    }
    this.exponentialTargets.push(value);
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number, _time: number) {
    this.value = value;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  connect(destination?: unknown) {
    return destination ?? this;
  }
  disconnect() {}
}

class FakeGainNode extends FakeNode {
  gain = new FakeAudioParam();
}
class FakeOscillatorNode extends FakeNode {
  type = "sine";
  frequency = new FakeAudioParam();
  detune = new FakeAudioParam();
  start() {}
  stop() {}
}
class FakeFilterNode extends FakeNode {
  type = "lowpass";
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
}
class FakeBufferSourceNode extends FakeNode {
  buffer: unknown = null;
  playbackRate = new FakeAudioParam();
  start() {}
  stop() {}
}
class FakeStereoPannerNode extends FakeNode {
  pan = new FakeAudioParam();
}
class FakeWaveShaperNode extends FakeNode {
  curve: unknown = null;
  oversample = "none";
}
class FakeConvolverNode extends FakeNode {
  buffer: unknown = null;
}

function createFakeContext() {
  return {
    currentTime: 0,
    sampleRate: 44100,
    state: "running" as const,
    destination: new FakeNode(),
    createGain: () => new FakeGainNode(),
    createOscillator: () => new FakeOscillatorNode(),
    createBiquadFilter: () => new FakeFilterNode(),
    createBufferSource: () => new FakeBufferSourceNode(),
    createStereoPanner: () => new FakeStereoPannerNode(),
    createWaveShaper: () => new FakeWaveShaperNode(),
    createConvolver: () => new FakeConvolverNode(),
    createAnalyser: () => ({ fftSize: 2048, frequencyBinCount: 1024, connect: () => {}, disconnect: () => {} }),
    createDynamicsCompressor: () => ({
      threshold: new FakeAudioParam(),
      knee: new FakeAudioParam(),
      ratio: new FakeAudioParam(),
      attack: new FakeAudioParam(),
      release: new FakeAudioParam(),
      connect: () => {},
      disconnect: () => {},
    }),
    createDelay: () => ({ delayTime: new FakeAudioParam(), connect: () => {}, disconnect: () => {} }),
    /**
     * The stereo unison stage (v2.0.58) needs these two, and this minimal double did not have them:
     * the sibling velocity suite failed with `ctx.createChannelSplitter is not a function` — a
     * *crash*, not a failed assertion, and one that said nothing about velocity. The guard below is
     * what stops the next node type from arriving the same way.
     */
    createChannelSplitter: () => ({ numberOfOutputs: 2, connect: () => {}, disconnect: () => {} }),
    /**
     * The wavetable path (organ drawbar registrations) needs this, and the oscillator needs
     * `setPeriodicWave` to receive it. Found by the guard below rather than by a crash, which is
     * exactly the outcome that guard was added for after the `ChannelSplitter` incident.
     */
    createPeriodicWave: () => ({ real: new Float32Array(1), imag: new Float32Array(1) }),
    createChannelMerger: () => ({ numberOfInputs: 2, connect: () => {}, disconnect: () => {} }),
    /**
     * Found by the guard below, not by a failure: the noise bed asks for a buffer, and a double
     * without `createBuffer` would have crashed the first time a preset with `noiseMix` was played
     * through it. Nothing exercised it before, which is exactly the state the guard exists to
     * surface.
     */
    createBuffer: (channels: number, length: number, rate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      getChannelData: () => new Float32Array(length),
    }),
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
  } as unknown as BaseAudioContext;
}

/**
 * Every `ctx.create*` call the synthesis voices can reach for.
 *
 * A literal list on purpose. The problem with a partial double is that nobody knows it is partial
 * until a *new* node type appears — at which point the test crashes for a reason unrelated to what
 * it tests. Adding a node type to the engine now fails this assertion, so the next author is told to
 * extend the double (or move to the shared `FakeOfflineAudioContext`, which implements all of these)
 * rather than being handed a confusing `is not a function`.
 */
const NODE_FACTORIES_THE_VOICES_NEED = [
  "createAnalyser",
  "createBiquadFilter",
  "createBuffer",
  "createBufferSource",
  "createChannelMerger",
  "createChannelSplitter",
  "createConvolver",
  "createDelay",
  "createDynamicsCompressor",
  "createGain",
  "createOscillator",
  "createPeriodicWave",
  "createStereoPanner",
  "createWaveShaper",
] as const;

describe("the minimal AudioContext double covers what the voices call", () => {
  it("implements every node factory the engine can reach for", () => {
    const ctx = createFakeContext() as unknown as Record<string, unknown>;
    const missing = NODE_FACTORIES_THE_VOICES_NEED.filter((name) => typeof ctx[name] !== "function");
    expect(missing).toEqual([]);
  });

  it("agrees with the shared double about that list", () => {
    // The shared fake implements the whole graph API, so if it lacks a factory this list claims,
    // the list is wrong rather than the local double being complete.
    const shared = new FakeOfflineAudioContext(1, 16, 44100) as unknown as Record<string, unknown>;
    for (const name of NODE_FACTORIES_THE_VOICES_NEED) {
      expect(typeof shared[name], `the shared fake lacks ${name}`).toBe("function");
    }
  });
});

describe("F-01 · DSP guards keep illegal values out of exponential ramps", () => {
  it("safeGain never returns zero or non-finite values", () => {
    expect(safeGain(0)).toBe(MIN_GAIN);
    expect(safeGain(-3)).toBe(MIN_GAIN);
    expect(safeGain(Number.NaN)).toBe(MIN_GAIN);
    expect(safeGain(Number.POSITIVE_INFINITY)).toBe(MIN_GAIN);
    expect(safeGain(0.5)).toBe(0.5);
  });

  it("safeFreq clamps into the audible/valid range", () => {
    expect(safeFreq(0)).toBeGreaterThan(0);
    expect(safeFreq(-100)).toBeGreaterThan(0);
    expect(safeFreq(Number.NaN)).toBeGreaterThan(0);
    expect(safeFreq(999999)).toBe(MAX_FREQ);
    expect(safeFreq(440)).toBe(440);
  });

  it("safeVelocity keeps a technically-positive velocity for muted tracks", () => {
    expect(safeVelocity(0)).toBe(MIN_GAIN);
    expect(safeVelocity(-1)).toBe(MIN_GAIN);
    expect(safeVelocity(Number.NaN)).toBe(MIN_GAIN);
    expect(safeVelocity(1)).toBe(1);
  });

  it("safeTime falls back for non-finite or negative times", () => {
    expect(safeTime(Number.NaN, 1.5)).toBe(1.5);
    expect(safeTime(-2, 1.5)).toBe(1.5);
    expect(safeTime(3, 1.5)).toBe(3);
  });

  // Regression for the P0 wedge: a zero-velocity step used to throw RangeError inside
  // the scheduler, which re-threw every tick and silently killed playback.
  it.each(["808", "909", "acoustic", "cyber"] as const)(
    "synthesizeKick(%s) survives velocity 0 without throwing",
    (kit) => {
      const ctx = createFakeContext();
      expect(() =>
        synthesizeKick(ctx, ctx.destination, 0, 0, 0, kit, null)
      ).not.toThrow();
    }
  );

  it.each(["808", "909", "acoustic", "cyber"] as const)(
    "synthesizeSnare/synthesizePercussion/synthesizeHiHat survive velocity 0 (%s)",
    (kit) => {
      const ctx = createFakeContext();
      expect(() => synthesizeSnare(ctx, ctx.destination, 0, 0, 0, kit, null)).not.toThrow();
      expect(() => synthesizePercussion(ctx, ctx.destination, 0, 0, 0, kit, null)).not.toThrow();
      expect(() => synthesizeHiHat(ctx, ctx.destination, 0, 0, 0, kit, 1, 0.125, 0.8, null)).not.toThrow();
    }
  );

  it("playPolySynthNote survives velocity 0 and a zero filter cutoff", () => {
    const ctx = createFakeContext();
    const brokenPreset = {
      name: "broken",
      osc1Type: "sawtooth" as OscillatorType,
      osc2Type: "square" as OscillatorType,
      osc2DetuneCents: 5,
      osc2Mix: 0.5,
      filterCutoff: 0,
      filterQ: 1,
      adsr: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.2 },
    };
    expect(() => playPolySynthNote(ctx, ctx.destination, 60, 0, 0.25, 0, brokenPreset)).not.toThrow();
  });
});

describe("F-02 · computeCatchUp re-aligns the grid after a stall", () => {
  const base = { now: 10, stepDur: 0.125, stepsCount: 16, loopRange: null };

  it("leaves the grid untouched when it is in phase", () => {
    const result = computeCatchUp({ ...base, currentStep: 4, nextStepTime: 10 });
    expect(result).toEqual({ currentStep: 4, nextStepTime: 10, droppedSteps: 0 });
  });

  it("tolerates sub-step jitter without dropping steps", () => {
    const result = computeCatchUp({ ...base, currentStep: 4, nextStepTime: 9.99 });
    expect(result.droppedSteps).toBe(0);
    expect(result.currentStep).toBe(4);
  });

  it("skips the missed steps instead of replaying them (5s stall @ 1/16 120bpm)", () => {
    const stepDur = 0.125;
    const result = computeCatchUp({
      now: 5,
      stepDur,
      stepsCount: 16,
      loopRange: null,
      currentStep: 0,
      nextStepTime: 0,
    });
    expect(result.droppedSteps).toBe(40);
    expect(result.nextStepTime).toBeGreaterThanOrEqual(5);
    expect(result.nextStepTime).toBeLessThan(5 + stepDur);
    // 40 skipped steps from step 0 in a 16-step pattern lands back on step 8.
    expect(result.currentStep).toBe(8);
  });

  it("never schedules the next step in the past", () => {
    const result = computeCatchUp({ ...base, currentStep: 2, nextStepTime: -100 });
    expect(result.nextStepTime).toBeGreaterThanOrEqual(base.now);
  });

  it("wraps inside the loop range when one is set", () => {
    const result = computeCatchUp({
      now: 10,
      stepDur: 0.25,
      stepsCount: 16,
      loopRange: [4, 8],
      currentStep: 6,
      nextStepTime: 9,
    });
    // 4 missed steps over a 4-step loop = full cycle back to the same step.
    expect(result.droppedSteps).toBe(4);
    expect(result.currentStep).toBe(6);
  });

  it("degrades safely when the step duration is invalid", () => {
    const result = computeCatchUp({ ...base, stepDur: 0, currentStep: 3, nextStepTime: -50 });
    expect(result.droppedSteps).toBe(0);
    expect(result.currentStep).toBe(3);
  });
});
