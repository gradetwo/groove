/**
 * Tests for the parameterised reverb bus (src/audio/ReverbBus.ts).
 *
 * These tests analyse the generated impulse response directly rather than rendering
 * through the fake convolver: `FakeConvolverNode` stores the buffer but performs no
 * convolution, so a "render" assertion against it would only be testing the fake.
 * Everything below is therefore a property of the actual impulse data — the same
 * data the real `ConvolverNode` will convolve with — plus graph-level assertions on
 * the fakes for routing, ramps and rebuild accounting.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ReverbBus,
  DEFAULT_REVERB_PARAMS,
  REVERB_DECAY_MIN_SEC,
  REVERB_DECAY_MAX_SEC,
  REVERB_PREDELAY_MAX_MS,
  type ReverbParams,
} from "../audio/ReverbBus";
import {
  FakeAudioContext,
  FakeOfflineAudioContext,
  FakeAudioParam,
  FakeConvolverNode,
} from "./helpers/fakeAudio";

const SR = 44100;

/** Builds a bus on a fake realtime context and captures the convolver it created. */
function makeBus(params: Partial<ReverbParams> = {}) {
  const ctx = new FakeAudioContext();
  let convolver: FakeConvolverNode | null = null;
  const anyCtx = ctx as any;
  const originalCreateConvolver = anyCtx.createConvolver.bind(ctx);
  anyCtx.createConvolver = () => {
    convolver = originalCreateConvolver();
    return convolver;
  };
  const bus = new ReverbBus(ctx as unknown as BaseAudioContext, params);
  return {
    ctx,
    bus,
    getConvolver: () => convolver as FakeConvolverNode | null,
  };
}

function impulseData(bus: ReverbBus, channel: number): Float32Array {
  const impulse = bus.getImpulse();
  if (!impulse) throw new Error("bus has no impulse");
  return impulse.getChannelData(channel);
}

function energyBetween(data: Float32Array, start: number, end: number): number {
  let energy = 0;
  const from = Math.max(0, start);
  const to = Math.min(data.length, end);
  for (let i = from; i < to; i++) energy += data[i] * data[i];
  return energy;
}

function firstDifference(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : length;
}

/**
 * Normalised correlation of the diffuse tail only. The early reflections are
 * deliberately mono, so including them would understate the tail decorrelation.
 */
function tailCorrelation(left: Float32Array, right: Float32Array, startSec: number): number {
  const start = Math.min(left.length, Math.round(startSec * SR));
  let cross = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  for (let i = start; i < left.length; i++) {
    cross += left[i] * right[i];
    leftEnergy += left[i] * left[i];
    rightEnergy += right[i] * right[i];
  }
  const denom = Math.sqrt(leftEnergy * rightEnergy);
  return denom > 0 ? cross / denom : 1;
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** RBJ cookbook biquad coefficients (already divided by a0). */
function lowpass(fc: number, sampleRate: number, q = Math.SQRT1_2): Biquad {
  const w0 = (2 * Math.PI * fc) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cos) / 2) / a0,
    b1: (1 - cos) / a0,
    b2: ((1 - cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function highpass(fc: number, sampleRate: number, q = Math.SQRT1_2): Biquad {
  const w0 = (2 * Math.PI * fc) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cos) / 2) / a0,
    b1: (-(1 + cos)) / a0,
    b2: ((1 + cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function applyBiquad(input: Float32Array, c: Biquad): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/**
 * Schroeder backward-integration RT60 estimate of the region starting at
 * `startSec`. For a pure exponential envelope the -5..-35 dB slope extrapolates
 * exactly to the RT60, so this is a direct measure of the tail's decay time.
 */
function estimateRt60(data: Float32Array, sampleRate: number, startSec: number): number {
  const start = Math.max(0, Math.floor(startSec * sampleRate));
  const length = data.length - start;
  if (length < 64) return NaN;
  const edc = new Float64Array(length + 1);
  for (let i = length - 1; i >= 0; i--) {
    const sample = data[start + i];
    edc[i] = edc[i + 1] + sample * sample;
  }
  if (edc[0] <= 0) return NaN;
  const reference = edc[0];
  const dbAt = (value: number) => 10 * Math.log10(Math.max(value, 1e-300) / reference);
  const crossing = (targetDb: number): number => {
    for (let i = 0; i < length; i++) {
      if (dbAt(edc[i]) <= targetDb) return i / sampleRate;
    }
    return NaN;
  };
  const t5 = crossing(-5);
  const t35 = crossing(-35);
  if (!Number.isFinite(t5) || !Number.isFinite(t35)) return NaN;
  return 2 * (t35 - t5);
}

describe("ReverbBus: exported contract", () => {
  it("exposes sane defaults and decay bounds", () => {
    expect(REVERB_DECAY_MIN_SEC).toBeGreaterThan(0);
    expect(REVERB_DECAY_MAX_SEC).toBeGreaterThanOrEqual(10);
    expect(REVERB_DECAY_MIN_SEC).toBeLessThan(REVERB_DECAY_MAX_SEC);
    expect(DEFAULT_REVERB_PARAMS.enabled).toBe(true);
    expect(DEFAULT_REVERB_PARAMS.decaySec).toBeGreaterThanOrEqual(REVERB_DECAY_MIN_SEC);
    expect(DEFAULT_REVERB_PARAMS.decaySec).toBeLessThanOrEqual(REVERB_DECAY_MAX_SEC);
    expect(DEFAULT_REVERB_PARAMS.returnLevel).toBeGreaterThan(0);
    expect(DEFAULT_REVERB_PARAMS.returnLevel).toBeLessThanOrEqual(1);
  });

  it("getParams returns a copy, not internal state", () => {
    const { bus } = makeBus({ decaySec: 0.3 });
    const params = bus.getParams();
    params.returnLevel = 0.999;
    params.damping = 1;
    expect(bus.getParams().returnLevel).not.toBe(0.999);
    expect(bus.getParams().damping).not.toBe(1);
  });
});

describe("ReverbBus: frequency-dependent decay (damping)", () => {
  it("decays the 4 kHz band faster than the 630 Hz band", () => {
    const { bus } = makeBus({ decaySec: 2, damping: 1, preDelayMs: 0, width: 1 });
    const data = impulseData(bus, 0);

    const low = applyBiquad(data, lowpass(630, SR));
    const high = applyBiquad(data, highpass(4000, SR));
    const rtLow = estimateRt60(low, SR, 0.06);
    const rtHigh = estimateRt60(high, SR, 0.06);

    expect(rtLow).toBeGreaterThan(1.5);
    expect(rtHigh).toBeGreaterThan(0);
    // The property the old flat-noise impulse lacked: highs die first. The design
    // makes the high band decay at 0.25 * decaySec, so the ratio should land well
    // under half while the low band still tracks decaySec (asserted below).
    const ratio = rtHigh / rtLow;
    expect(ratio).toBeLessThan(0.5);
    expect(ratio).toBeGreaterThan(0.1);
    expect(rtLow).toBeLessThan(2.5);
  });

  it("keeps the bands matched when damping is 0 (the old flat behaviour)", () => {
    const { bus } = makeBus({ decaySec: 2, damping: 0, preDelayMs: 0, width: 1 });
    const data = impulseData(bus, 0);
    const rtLow = estimateRt60(applyBiquad(data, lowpass(630, SR)), SR, 0.06);
    const rtHigh = estimateRt60(applyBiquad(data, highpass(4000, SR)), SR, 0.06);
    const ratio = rtHigh / rtLow;
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1.25);
  });

  it("shortens the high-band RT60 monotonically as damping rises", () => {
    const rtHighFor = (damping: number) => {
      const { bus } = makeBus({ decaySec: 2, damping, preDelayMs: 0, width: 1 });
      return estimateRt60(applyBiquad(impulseData(bus, 0), highpass(4000, SR)), SR, 0.06);
    };
    const rtFlat = rtHighFor(0);
    const rtMid = rtHighFor(0.5);
    const rtHeavy = rtHighFor(1);
    expect(rtMid).toBeLessThan(rtFlat);
    expect(rtHeavy).toBeLessThan(rtMid);
  });
});

describe("ReverbBus: pre-delay and early reflections", () => {
  it("is exactly silent before the configured pre-delay", () => {
    const preDelayMs = 50;
    const { bus } = makeBus({ preDelayMs, decaySec: 0.5, damping: 0, width: 1 });
    const data = impulseData(bus, 0);
    const preSamples = Math.round((preDelayMs / 1000) * SR);

    expect(energyBetween(data, 0, preSamples)).toBe(0);
    // ...and there is energy immediately after it (early reflections first).
    expect(
      energyBetween(data, preSamples, preSamples + Math.round(0.05 * SR))
    ).toBeGreaterThan(0);
  });

  it("places the transient earlier when the pre-delay is zero", () => {
    const preDelayMs = 50;
    const preSamples = Math.round((preDelayMs / 1000) * SR);
    const { bus } = makeBus({ preDelayMs: 0, decaySec: 0.5, damping: 0, width: 1 });
    const data = impulseData(bus, 0);
    expect(energyBetween(data, 0, preSamples)).toBeGreaterThan(0);
    // The first non-zero sample is an early reflection, not the diffuse tail:
    // the early taps must arrive before the 30 ms diffuse onset.
    let firstNonZero = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 0) {
        firstNonZero = i;
        break;
      }
    }
    expect(firstNonZero).toBeGreaterThan(0);
    expect(firstNonZero / SR).toBeLessThan(0.03);
  });

  it("has at least a few discrete early reflections before the diffuse tail", () => {
    // With damping 0 the early taps are the only source of energy before the tail
    // onset; counting distinct energy clusters counts the reflections.
    const { bus } = makeBus({ preDelayMs: 0, decaySec: 0.5, damping: 0, width: 1 });
    const data = impulseData(bus, 0);
    const earlySamples = Math.round(0.03 * SR);
    let clusters = 0;
    let inCluster = false;
    for (let i = 0; i < earlySamples; i++) {
      const loud = Math.abs(data[i]) > 1e-6;
      if (loud && !inCluster) {
        clusters++;
        inCluster = true;
      } else if (!loud) {
        inCluster = false;
      }
    }
    expect(clusters).toBeGreaterThanOrEqual(3);
  });
});

describe("ReverbBus: decaySec controls the tail", () => {
  it("keeps energy at 1 s for a long decay where a short one has ended", () => {
    const short = makeBus({ decaySec: 0.6, damping: 0, width: 1, preDelayMs: 0 }).bus;
    const long = makeBus({ decaySec: 8, damping: 0, width: 1, preDelayMs: 0 }).bus;
    const shortData = impulseData(short, 0);
    const longData = impulseData(long, 0);

    const windowStart = Math.round(1.0 * SR);
    const windowEnd = Math.round(1.2 * SR);
    expect(energyBetween(shortData, windowStart, windowEnd)).toBe(0);
    const longLate = energyBetween(longData, windowStart, windowEnd);
    expect(longLate).toBeGreaterThan(0);
    expect(longData.length).toBeGreaterThanOrEqual(Math.ceil(8 * SR));
  });

  it("measures the configured RT60 in both a small room and an ambient tail", () => {
    const small = makeBus({ decaySec: 0.6, damping: 0, width: 1, preDelayMs: 0 }).bus;
    const ambient = makeBus({ decaySec: 8, damping: 0, width: 1, preDelayMs: 0 }).bus;
    const rtSmall = estimateRt60(impulseData(small, 0), SR, 0.06);
    const rtAmbient = estimateRt60(impulseData(ambient, 0), SR, 0.06);

    expect(rtSmall).toBeGreaterThan(0.35);
    expect(rtSmall).toBeLessThan(0.95);
    expect(rtAmbient).toBeGreaterThan(5.5);
    expect(rtAmbient).toBeLessThan(10.5);
  });
});

describe("ReverbBus: stereo width", () => {
  it("gives bit-identical channels at width 0", () => {
    const { bus } = makeBus({ width: 0, decaySec: 0.6, damping: 0.3, preDelayMs: 0 });
    expect(firstDifference(impulseData(bus, 0), impulseData(bus, 1))).toBe(-1);
  });

  it("decorrelates the tail at width 1", () => {
    const { bus } = makeBus({ width: 1, decaySec: 0.6, damping: 0.3, preDelayMs: 0 });
    const left = impulseData(bus, 0);
    const right = impulseData(bus, 1);
    expect(firstDifference(left, right)).not.toBe(-1);
    expect(Math.abs(tailCorrelation(left, right, 0.05))).toBeLessThan(0.25);
  });

  it("interpolates width between mono and fully decorrelated", () => {
    const { bus } = makeBus({ width: 0.5, decaySec: 0.6, damping: 0.3, preDelayMs: 0 });
    const correlation = tailCorrelation(impulseData(bus, 0), impulseData(bus, 1), 0.05);
    expect(correlation).toBeGreaterThan(0.25);
    expect(correlation).toBeLessThan(0.95);
  });
});

describe("ReverbBus: return level and enable ramp", () => {
  it("silences on enabled:false with a ramp, and restores on enabled:true", () => {
    const { bus } = makeBus({ enabled: true, returnLevel: 0.5, decaySec: 0.3 });
    const gain = bus.output.gain as unknown as FakeAudioParam;
    expect(gain.value).toBeCloseTo(0.5, 6);

    gain.events.length = 0;
    bus.setParams({ enabled: false });
    expect(gain.value).toBe(0);
    const silenceEvent = gain.events[gain.events.length - 1];
    expect(silenceEvent.type).toBe("linearRampToValueAtTime");
    expect(silenceEvent.value).toBe(0);
    expect(silenceEvent.time).toBeGreaterThan(0);
    // A step to 0 is exactly what would click; it must not be scheduled.
    expect(
      gain.events.some((event) => event.type === "setValueAtTime" && event.value === 0)
    ).toBe(false);

    gain.events.length = 0;
    bus.setParams({ enabled: true });
    const restoreEvent = gain.events[gain.events.length - 1];
    expect(restoreEvent.type).toBe("linearRampToValueAtTime");
    expect(restoreEvent.value).toBeCloseTo(0.5, 6);
    expect(restoreEvent.time).toBeGreaterThan(0);
  });

  it("ramps the return level when only returnLevel changes", () => {
    const { bus } = makeBus({ enabled: true, returnLevel: 0.5, decaySec: 0.3 });
    const gain = bus.output.gain as unknown as FakeAudioParam;
    gain.events.length = 0;
    bus.setParams({ returnLevel: 0.8 });
    const event = gain.events[gain.events.length - 1];
    expect(event.type).toBe("linearRampToValueAtTime");
    expect(event.value).toBeCloseTo(0.8, 6);
    expect(gain.value).toBeCloseTo(0.8, 6);
  });

  it("starts silent when constructed disabled and respects returnLevel 0", () => {
    const { bus } = makeBus({ enabled: false, returnLevel: 0.5, decaySec: 0.3 });
    expect((bus.output.gain as unknown as FakeAudioParam).value).toBe(0);
    const { bus: zero } = makeBus({ enabled: true, returnLevel: 0, decaySec: 0.3 });
    expect((zero.output.gain as unknown as FakeAudioParam).value).toBe(0);
  });
});

describe("ReverbBus: parameter clamping", () => {
  it("clamps out-of-range decaySec and never throws", () => {
    expect(() => {
      expect(
        new ReverbBus(new FakeAudioContext() as unknown as BaseAudioContext, {
          decaySec: -5,
        }).getParams().decaySec
      ).toBe(REVERB_DECAY_MIN_SEC);
      expect(
        new ReverbBus(new FakeAudioContext() as unknown as BaseAudioContext, {
          decaySec: 0,
        }).getParams().decaySec
      ).toBe(REVERB_DECAY_MIN_SEC);
      expect(
        new ReverbBus(new FakeAudioContext() as unknown as BaseAudioContext, {
          decaySec: 1e9,
        }).getParams().decaySec
      ).toBe(REVERB_DECAY_MAX_SEC);
      expect(
        new ReverbBus(new FakeAudioContext() as unknown as BaseAudioContext, {
          decaySec: Infinity,
        }).getParams().decaySec
      ).toBe(REVERB_DECAY_MAX_SEC);
      expect(
        new ReverbBus(new FakeAudioContext() as unknown as BaseAudioContext, {
          decaySec: NaN,
        }).getParams().decaySec
      ).toBe(DEFAULT_REVERB_PARAMS.decaySec);
    }).not.toThrow();
  });

  it("keeps the current value when setParams receives NaN", () => {
    const { bus } = makeBus({ decaySec: 3, damping: 0.4, width: 0.8, preDelayMs: 10 });
    bus.setParams({ decaySec: NaN, damping: NaN, width: NaN, preDelayMs: NaN });
    const params = bus.getParams();
    expect(params.decaySec).toBe(3);
    expect(params.damping).toBe(0.4);
    expect(params.width).toBe(0.8);
    expect(params.preDelayMs).toBe(10);
  });

  it("clamps the remaining numeric fields into range", () => {
    const { bus } = makeBus({ decaySec: 0.3 });
    bus.setParams({ damping: 2, width: -1, preDelayMs: 1e6, returnLevel: 5 });
    const params = bus.getParams();
    expect(params.damping).toBe(1);
    expect(params.width).toBe(0);
    expect(params.preDelayMs).toBe(REVERB_PREDELAY_MAX_MS);
    expect(params.returnLevel).toBe(1);
    // Every generated impulse must stay finite whatever the patch.
    for (const channel of [0, 1]) {
      for (const sample of Array.from(impulseData(bus, channel))) {
        expect(Number.isFinite(sample)).toBe(true);
      }
    }
  });
});

describe("ReverbBus: determinism", () => {
  it("produces identical impulse data for two independently built buses", () => {
    const params: Partial<ReverbParams> = {
      decaySec: 0.5,
      damping: 0.6,
      preDelayMs: 15,
      width: 1,
      returnLevel: 0.3,
    };
    const first = makeBus(params).bus;
    const second = makeBus(params).bus;
    for (const channel of [0, 1]) {
      const a = impulseData(first, channel);
      const b = impulseData(second, channel);
      expect(a.length).toBe(b.length);
      expect(firstDifference(a, b)).toBe(-1);
    }
  });

  it("rebuilds the same impulse when only non-synthesis params change", () => {
    const params: Partial<ReverbParams> = { decaySec: 0.5, damping: 0.6, width: 1 };
    const bus = makeBus(params).bus;
    const before = Array.from(impulseData(bus, 0));
    bus.setParams({ enabled: false, returnLevel: 0.1 });
    expect(Array.from(impulseData(bus, 0))).toEqual(before);
  });

  it("never uses Math.random (source guard, comments stripped)", () => {
    const root = process.cwd();
    const source = fs
      .readFileSync(path.join(root, "src/audio/ReverbBus.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/Math\.random/);
  });
});

describe("ReverbBus: cheap parameter changes and stable graph", () => {
  it("does not rebuild the impulse when the synthesis params are unchanged", () => {
    const { bus } = makeBus({ decaySec: 1, damping: 0.4, width: 1, preDelayMs: 10 });
    expect(bus.getImpulseBuildCount()).toBe(1);
    const first = bus.getImpulse();

    bus.setParams({ decaySec: 1, damping: 0.4, width: 1, preDelayMs: 10 });
    expect(bus.getImpulseBuildCount()).toBe(1);
    // Same buffer object, i.e. no reallocation either.
    expect(bus.getImpulse()).toBe(first);

    // Level-only changes never touch the impulse.
    bus.setParams({ returnLevel: 0.2, enabled: false });
    expect(bus.getImpulseBuildCount()).toBe(1);
    expect(bus.getImpulse()).toBe(first);

    // A synthesis change rebuilds exactly once.
    bus.setParams({ decaySec: 2 });
    expect(bus.getImpulseBuildCount()).toBe(2);
    expect(bus.getImpulse()).not.toBe(first);

    // Width is baked into the impulse (mid/side), so it rebuilds by design.
    bus.setParams({ width: 0.5 });
    expect(bus.getImpulseBuildCount()).toBe(3);
  });

  it("keeps input/output stable and rewires only the convolver buffer", () => {
    const { bus, getConvolver } = makeBus({ decaySec: 0.5 });
    const convolver = getConvolver();
    expect(convolver).not.toBeNull();
    const input = bus.input;
    const output = bus.output;

    expect((convolver as any).normalize).toBe(false);
    expect(convolver!.buffer).toBe(bus.getImpulse());
    /**
     * The send's high-pass sits between them: `input -> highpass -> convolver`.
     *
     * Filtering the send rather than the return is the point — the tail is then built from a band-limited signal instead of
     * having its low end filtered after the fact, which leaves the mud inside the tail's own decay envelope.
     */
    const sendFilter = (convolver as any).incoming[0];
    expect(sendFilter.type).toBe("highpass");
    expect(sendFilter.Q.value).toBeCloseTo(0.707, 3);
    expect((sendFilter as any).incoming).toContain(input);
    expect((output as any).incoming).toContain(convolver);

    bus.setParams({ decaySec: 2, damping: 0.8 });
    expect(bus.input).toBe(input);
    expect(bus.output).toBe(output);
    expect(getConvolver()).toBe(convolver);
    expect(convolver!.buffer).toBe(bus.getImpulse());
  });

  it("shapes the send, and 0 means genuinely bypassed", () => {
    /**
     * The bus used to take whatever a track sent it — `input -> convolver` — so kick and bass energy went into a stereo
     * tail. The filter is on the **send**, before the convolver: filtering the return afterwards would leave the low end
     * inside the tail's own decay envelope, which is most of the mud.
     */
    const { bus: shaped } = makeBus({ sendHighpassHz: 160 });
    const shapedFilter = (shaped as unknown as { sendHighpass: { frequency: { value: number }; type: string } })
      .sendHighpass;
    expect(shapedFilter.type).toBe("highpass");
    expect(shapedFilter.frequency.value).toBe(160);

    // 0 is the "off" case and must not leave a degenerate 0 Hz high-pass in the path.
    const { bus: off } = makeBus({ sendHighpassHz: 0 });
    expect((off as unknown as { sendHighpass: { frequency: { value: number } } }).sendHighpass.frequency.value).toBe(10);

    // …and it stays live, because the genre's own FX profile is written after the graph is built.
    shaped.setParams({ sendHighpassHz: 90 });
    expect(shapedFilter.frequency.value).toBe(90);
  });

  it("disposes cleanly and is inert afterwards", () => {
    const { bus, getConvolver } = makeBus({ decaySec: 0.3 });
    const convolver = getConvolver()!;
    bus.dispose();
    expect(bus.getImpulse()).toBeNull();
    expect(convolver.buffer).toBeNull();
    expect((bus.output.gain as unknown as FakeAudioParam).value).toBe(0);
    const builds = bus.getImpulseBuildCount();
    bus.setParams({ decaySec: 5 });
    expect(bus.getImpulseBuildCount()).toBe(builds);
    expect(bus.getImpulse()).toBeNull();
  });
});

describe("ReverbBus: offline compatibility and performance", () => {
  it("builds against an OfflineAudioContext at its own sample rate", () => {
    const offlineRate = 48000;
    const offline = new FakeOfflineAudioContext(2, offlineRate * 2, offlineRate);
    const bus = new ReverbBus(offline as unknown as BaseAudioContext, {
      decaySec: 0.4,
      preDelayMs: 5,
    });
    const impulse = bus.getImpulse();
    expect(impulse).not.toBeNull();
    expect(impulse!.sampleRate).toBe(offlineRate);
    expect(impulse!.numberOfChannels).toBe(2);
    expect(impulse!.length).toBeGreaterThanOrEqual(Math.ceil(0.4 * offlineRate));
    bus.setParams({ decaySec: 0.6 });
    expect(bus.getImpulse()!.length).toBeGreaterThanOrEqual(Math.ceil(0.6 * offlineRate));
  });

  it("generates a 10 s stereo impulse within a sane time budget", () => {
    const started = performance.now();
    const { bus } = makeBus({ decaySec: REVERB_DECAY_MAX_SEC, damping: 0.7 });
    const elapsedMs = performance.now() - started;
    const impulse = bus.getImpulse()!;
    // eslint-disable-next-line no-console -- deliberate measurement, reported in the PR
    console.log(
      `[ReverbBus] 10 s stereo impulse (${impulse.length} frames/ch) generated in ${elapsedMs.toFixed(
        1
      )} ms`
    );
    expect(impulse.length).toBeGreaterThanOrEqual(Math.ceil(REVERB_DECAY_MAX_SEC * SR));
    // Generous bound: catches an accidental O(n^2) or per-sample reallocation, not
    // machine-to-machine jitter.
    expect(elapsedMs).toBeLessThan(3000);
  });
});
