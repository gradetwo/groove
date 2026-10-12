import { describe, it, expect } from "vitest";
import {
  ChannelStrip,
  INSERT_COMP_KNEE_DB,
  INSERT_DRIVE_CURVE_SAMPLES,
  INSERT_HPF_Q,
} from "../audio/ChannelStripDsp";
import { makeSaturationCurve, saturationCurveInputForIndex } from "../audio/EffectsRack";
import {
  INSERT_COMP_MAX_ATTACK_SEC,
  INSERT_COMP_MAX_MAKEUP_DB,
  INSERT_COMP_MAX_RATIO,
  INSERT_COMP_MAX_RELEASE_SEC,
  INSERT_COMP_MAX_THRESHOLD_DB,
  INSERT_COMP_MIN_ATTACK_SEC,
  INSERT_COMP_MIN_MAKEUP_DB,
  INSERT_COMP_MIN_RATIO,
  INSERT_COMP_MIN_RELEASE_SEC,
  INSERT_COMP_MIN_THRESHOLD_DB,
  INSERT_DRIVE_MAX,
  INSERT_DRIVE_MIN,
  INSERT_DRIVE_MIX_MAX,
  INSERT_EQ_MAX_GAIN_DB,
  INSERT_EQ_MAX_HZ,
  INSERT_EQ_MAX_Q,
  INSERT_EQ_MIN_GAIN_DB,
  INSERT_EQ_MIN_HZ,
  INSERT_EQ_MIN_Q,
  INSERT_HPF_MAX_HZ,
  INSERT_HPF_MIN_HZ,
  INSERT_ROLES,
  bypassTrackInsert,
  isTrackInsertBypassed,
  resolveTrackInsert,
  type TrackEqBand,
  type TrackInsertParams,
} from "../data/trackInsert";
import { FakeOfflineAudioContext } from "./helpers/fakeAudio";

// ---------------------------------------------------------------------------
// Test double
//
// `src/test/helpers/fakeAudio.ts` cannot express what these tests need to prove:
// `FakeNode.disconnect()` is a no-op that never removes the edge it recorded in the
// destination's `incoming` array. Per-stage true bypass *is* an edge-removal claim, so a
// green assertion against that double would prove nothing. This double models the one
// browser behaviour the feature depends on: `disconnect()` removes every outgoing edge.
//
// It also lacks a `DynamicsCompressorNode.reduction` value that responds to signal, and
// so does this one — `reduction` is a settable plain number here, and the test says so
// rather than pretending to measure real gain reduction.
// ---------------------------------------------------------------------------

class RecParam {
  value: number;
  events: Array<{ type: string; value: number; time: number }> = [];
  constructor(initial = 0) {
    this.value = initial;
  }
  setValueAtTime(value: number, time = 0) {
    this.events.push({ type: "setValueAtTime", value, time });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time = 0) {
    this.events.push({ type: "linearRampToValueAtTime", value, time });
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number, time = 0) {
    this.events.push({ type: "exponentialRampToValueAtTime", value, time });
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number, time = 0) {
    this.events.push({ type: "setTargetAtTime", value, time });
    this.value = value;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class RecNode {
  incoming: RecNode[] = [];
  outgoing: RecNode[] = [];
  connect(dest: RecNode): RecNode {
    this.outgoing.push(dest);
    dest.incoming.push(this);
    return dest;
  }
  disconnect(): void {
    for (const dest of this.outgoing) {
      const i = dest.incoming.indexOf(this);
      if (i >= 0) dest.incoming.splice(i, 1);
    }
    this.outgoing = [];
  }
}

class RecGain extends RecNode {
  gain = new RecParam(1);
}
class RecFilter extends RecNode {
  type: BiquadFilterType = "lowpass";
  frequency = new RecParam(350);
  Q = new RecParam(1);
  gain = new RecParam(0);
}
class RecCompressor extends RecNode {
  threshold = new RecParam(-24);
  knee = new RecParam(30);
  ratio = new RecParam(12);
  attack = new RecParam(0.003);
  release = new RecParam(0.25);
  reduction = 0;
}
class RecShaper extends RecNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = "none";
}

class RecordingContext {
  currentTime = 0;
  sampleRate = 44100;
  readonly nodes: RecNode[] = [];
  readonly gains: RecGain[] = [];
  readonly filters: RecFilter[] = [];
  readonly compressors: RecCompressor[] = [];
  readonly shapers: RecShaper[] = [];

  createGain() {
    const node = new RecGain();
    this.gains.push(node);
    this.nodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new RecFilter();
    this.filters.push(node);
    this.nodes.push(node);
    return node;
  }
  createDynamicsCompressor() {
    const node = new RecCompressor();
    this.compressors.push(node);
    this.nodes.push(node);
    return node;
  }
  createWaveShaper() {
    const node = new RecShaper();
    this.shapers.push(node);
    this.nodes.push(node);
    return node;
  }
}

const asCtx = (ctx: RecordingContext) => ctx as unknown as BaseAudioContext;

const hasEdge = (from: RecNode, to: RecNode) => from.outgoing.includes(to);

/** A chain with every stage enabled, i.e. the one the order guarantee is about. */
function allEnabled(overrides: Partial<TrackInsertParams> = {}): TrackInsertParams {
  return {
    hpfEnabled: true,
    hpfHz: 80,
    low: { enabled: true, hz: 200, gainDb: 3, q: 0.8 },
    mid: { enabled: true, hz: 1000, gainDb: -3, q: 1 },
    high: { enabled: true, hz: 8000, gainDb: 3, q: 0.8 },
    compEnabled: true,
    compThresholdDb: -18,
    compRatio: 4,
    compAttackSec: 0.01,
    compReleaseSec: 0.1,
    compMakeupDb: 2,
    driveEnabled: true,
    driveAmount: 2,
    driveMix: 0.5,
    ...overrides,
  };
}

// Node identity comes from the graph, not from creation order: the order test below
// proves which node is which by walking the edges. `gains` order is documented in the
// constructor: [input, output, makeup, driveIn, driveDry, driveWet].
type RecGainNode = GainNode & RecNode;

function buildFrom(params: TrackInsertParams) {
  const ctx = new RecordingContext();
  const strip = new ChannelStrip(asCtx(ctx), params);
  return {
    ctx,
    strip,
    input: strip.input as unknown as RecGainNode,
    output: strip.output as unknown as RecGainNode,
    hpf: ctx.filters[0],
    low: ctx.filters[1],
    mid: ctx.filters[2],
    high: ctx.filters[3],
    comp: ctx.compressors[0],
    makeup: ctx.gains[2],
    driveIn: ctx.gains[3],
    driveDry: ctx.gains[4],
    driveWet: ctx.gains[5],
    shaper: ctx.shapers[0],
  };
}

// ---------------------------------------------------------------------------
// Biquad magnitude response from RBJ cookbook coefficients.
//
// The browser computes the real coefficients; the double does not. So this evaluates the
// *documented* RBJ shapes for the type/frequency/Q/gain the strip actually wrote. It
// pins that the strip asked for the right filter — it cannot prove the browser's own
// coefficient maths, and does not claim to.
// ---------------------------------------------------------------------------

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function rbjCoeffs(
  type: BiquadFilterType,
  f0: number,
  q: number,
  gainDb: number,
  sampleRate: number
): BiquadCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (type === "peaking") {
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else if (type === "lowshelf") {
    const sa = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cos + sa);
    b1 = 2 * A * (A - 1 - (A + 1) * cos);
    b2 = A * (A + 1 - (A - 1) * cos - sa);
    a0 = A + 1 + (A - 1) * cos + sa;
    a1 = -2 * (A - 1 + (A + 1) * cos);
    a2 = A + 1 + (A - 1) * cos - sa;
  } else if (type === "highshelf") {
    const sa = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cos + sa);
    b1 = -2 * A * (A - 1 + (A + 1) * cos);
    b2 = A * (A + 1 + (A - 1) * cos - sa);
    a0 = A + 1 - (A - 1) * cos + sa;
    a1 = 2 * (A - 1 - (A + 1) * cos);
    a2 = A + 1 - (A - 1) * cos - sa;
  } else {
    // highpass (the only other type the strip uses)
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function magnitudeDb(c: BiquadCoeffs, f: number, sampleRate: number): number {
  const w = (2 * Math.PI * f) / sampleRate;
  const z1r = Math.cos(-w),
    z1i = Math.sin(-w);
  const z2r = Math.cos(-2 * w),
    z2i = Math.sin(-2 * w);
  const nr = c.b0 + c.b1 * z1r + c.b2 * z2r;
  const ni = c.b1 * z1i + c.b2 * z2i;
  const dr = 1 + c.a1 * z1r + c.a2 * z2r;
  const di = c.a1 * z1i + c.a2 * z2i;
  return 20 * Math.log10(Math.hypot(nr, ni) / Math.hypot(dr, di));
}

const magDb = (filter: RecFilter, f: number, sampleRate = 44100): number =>
  magnitudeDb(
    rbjCoeffs(filter.type, filter.frequency.value, filter.Q.value, filter.gain.value, sampleRate),
    f,
    sampleRate
  );

// ---------------------------------------------------------------------------
// Routing / true bypass
// ---------------------------------------------------------------------------

describe("ChannelStrip — signal order and true bypass", () => {
  it("wires input → HPF → low shelf → peaking → high shelf → comp → makeup → drive → output", () => {
    const b = buildFrom(allEnabled());

    expect(b.ctx.filters).toHaveLength(4);
    expect(b.ctx.compressors).toHaveLength(1);
    expect(b.ctx.shapers).toHaveLength(1);

    expect(b.hpf.type).toBe("highpass");
    expect(b.low.type).toBe("lowshelf");
    expect(b.mid.type).toBe("peaking");
    expect(b.high.type).toBe("highshelf");

    const linear: RecNode[] = [b.input, b.hpf, b.low, b.mid, b.high, b.comp, b.makeup, b.driveIn];
    for (let i = 0; i < linear.length - 1; i++) {
      expect(hasEdge(linear[i], linear[i + 1])).toBe(true);
      expect(linear[i].outgoing).toHaveLength(1);
    }

    // The drive stage is the split/merge substage: input → shaper → wet → output and
    // input → dry → output.
    expect(hasEdge(b.driveIn, b.shaper)).toBe(true);
    expect(hasEdge(b.shaper, b.driveWet)).toBe(true);
    expect(hasEdge(b.driveWet, b.output)).toBe(true);
    expect(hasEdge(b.driveIn, b.driveDry)).toBe(true);
    expect(hasEdge(b.driveDry, b.output)).toBe(true);
    expect(b.output.incoming).toHaveLength(2);

    // Nothing feeds the input, and the strip never touches the caller's downstream edges.
    expect(b.input.incoming).toHaveLength(0);
    expect(b.output.outgoing).toHaveLength(0);
  });

  it("removes each disabled stage from the path instead of parking a filter", () => {
    const base = allEnabled();

    {
      const b = buildFrom({ ...base, hpfEnabled: false });
      expect(b.hpf.incoming).toHaveLength(0);
      expect(b.hpf.outgoing).toHaveLength(0);
      expect(hasEdge(b.input, b.low)).toBe(true);
      expect(b.input.outgoing).toHaveLength(1);
      expect(b.low.incoming).toHaveLength(1);
    }

    {
      const b = buildFrom({ ...base, low: { ...base.low, enabled: false } });
      expect(b.low.incoming).toHaveLength(0);
      expect(b.low.outgoing).toHaveLength(0);
      expect(hasEdge(b.hpf, b.mid)).toBe(true);
      expect(b.mid.incoming).toHaveLength(1);
    }

    {
      const b = buildFrom({ ...base, mid: { ...base.mid, enabled: false } });
      expect(b.mid.incoming).toHaveLength(0);
      expect(b.mid.outgoing).toHaveLength(0);
      expect(hasEdge(b.low, b.high)).toBe(true);
      expect(b.high.incoming).toHaveLength(1);
    }

    {
      const b = buildFrom({ ...base, high: { ...base.high, enabled: false } });
      expect(b.high.incoming).toHaveLength(0);
      expect(b.high.outgoing).toHaveLength(0);
      expect(hasEdge(b.mid, b.comp)).toBe(true);
      expect(b.comp.incoming).toHaveLength(1);
    }

    {
      // Disabling compression removes its makeup gain too — one stage, not two.
      const b = buildFrom({ ...base, compEnabled: false });
      expect(b.comp.incoming).toHaveLength(0);
      expect(b.comp.outgoing).toHaveLength(0);
      expect(b.makeup.incoming).toHaveLength(0);
      expect(b.makeup.outgoing).toHaveLength(0);
      expect(hasEdge(b.high, b.driveIn)).toBe(true);
      expect(b.driveIn.incoming).toHaveLength(1);
    }

    {
      const b = buildFrom({ ...base, driveEnabled: false });
      expect(b.driveIn.incoming).toHaveLength(0);
      expect(b.driveIn.outgoing).toHaveLength(0);
      expect(b.shaper.incoming).toHaveLength(0);
      expect(b.shaper.outgoing).toHaveLength(0);
      expect(b.driveDry.incoming).toHaveLength(0);
      expect(b.driveWet.incoming).toHaveLength(0);
      expect(hasEdge(b.makeup, b.output)).toBe(true);
      expect(b.output.incoming).toHaveLength(1);
    }
  });

  it("is a straight unity wire when everything is bypassed (measurably transparent)", () => {
    // Bypass is proved by path enumeration, not by trusting a parameter: the strip
    // contains exactly one path from input to output, and it is input(GainNode gain=1)
    // → output(GainNode gain=1), i.e. a transfer function of exactly 1.0.
    const b = buildFrom(bypassTrackInsert());

    expect(b.strip.isBypassed()).toBe(true);
    expect(b.input.outgoing).toEqual([b.output]);
    expect(b.output.incoming).toEqual([b.input]);
    expect(b.input.gain.value).toBe(1);
    expect(b.output.gain.value).toBe(1);

    const internal = b.ctx.nodes.filter((n) => n !== b.input && n !== b.output);
    expect(internal.length).toBeGreaterThan(0);
    for (const node of internal) {
      expect(node.incoming).toHaveLength(0);
      expect(node.outgoing).toHaveLength(0);
    }
  });

  it("defaults to a bypassed straight wire when constructed without params", () => {
    const ctx = new RecordingContext();
    const strip = new ChannelStrip(asCtx(ctx));
    const input = strip.input as unknown as RecGainNode;
    const output = strip.output as unknown as RecGainNode;
    expect(strip.isBypassed()).toBe(true);
    expect(input.outgoing).toEqual([output]);
  });

  it("keeps exactly one path per active stage through repeated toggles", () => {
    const b = buildFrom(allEnabled());

    for (let i = 0; i < 3; i++) {
      b.strip.setParams({ compEnabled: false });
      b.strip.setParams({ compEnabled: true });
      b.strip.setParams({ driveEnabled: false });
      b.strip.setParams({ driveEnabled: true });
      b.strip.setParams({ mid: { enabled: false } as TrackEqBand });
      b.strip.setParams({ mid: { enabled: true } as TrackEqBand });
    }

    for (const node of [b.hpf, b.low, b.mid, b.high, b.comp, b.makeup, b.driveIn, b.shaper]) {
      expect(node.incoming).toHaveLength(1);
      expect(node.outgoing.length).toBeGreaterThanOrEqual(1);
    }
    expect(b.driveDry.incoming).toHaveLength(1);
    expect(b.driveWet.incoming).toHaveLength(1);
    expect(b.output.incoming).toHaveLength(2);
    expect(b.input.outgoing).toHaveLength(1);

    // And back to a clean straight wire.
    b.strip.setParams({
      hpfEnabled: false,
      low: { enabled: false } as TrackEqBand,
      mid: { enabled: false } as TrackEqBand,
      high: { enabled: false } as TrackEqBand,
      compEnabled: false,
      driveEnabled: false,
    });
    expect(b.input.outgoing).toEqual([b.output]);
    expect(b.output.incoming).toEqual([b.input]);
    for (const node of b.ctx.nodes.filter((n) => n !== b.input && n !== b.output)) {
      expect(node.incoming).toHaveLength(0);
      expect(node.outgoing).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// EQ magnitude response
// ---------------------------------------------------------------------------

describe("ChannelStrip — EQ magnitude response", () => {
  it("places the high-pass at its corner with Butterworth Q and rejects below it", () => {
    const b = buildFrom(allEnabled({ hpfEnabled: true, hpfHz: 400 }));

    expect(b.hpf.type).toBe("highpass");
    expect(b.hpf.frequency.value).toBe(400);
    expect(b.hpf.Q.value).toBeCloseTo(INSERT_HPF_Q, 12);

    // −3.01 dB at the corner for a maximally-flat (Q = 1/sqrt(2)) high-pass.
    expect(magDb(b.hpf, 400)).toBeCloseTo(-3.0103, 1);
    expect(magDb(b.hpf, 20)).toBeLessThan(-20);
    expect(Math.abs(magDb(b.hpf, 400 * 16))).toBeLessThan(0.1);
  });

  it("reaches the requested gain for the peaking band and both shelves", () => {
    const b = buildFrom(
      allEnabled({
        low: { enabled: true, hz: 200, gainDb: 6, q: 0.8 },
        mid: { enabled: true, hz: 420, gainDb: -3, q: 1 },
        high: { enabled: true, hz: 8000, gainDb: 6, q: 0.9 },
      })
    );

    // Peaking is exact at its own centre frequency.
    expect(magDb(b.mid, 420)).toBeCloseTo(-3, 4);

    // Shelves reach the requested gain deep in their own band. (At f0 an RBJ shelf sits
    // at half the shelf gain in dB; that midpoint is asserted separately so the test
    // documents the shape rather than hiding it.) The plateau tolerance is 0.15 dB — at
    // 18 kHz the discrete-time shelf is a few hundredths of a dB from its asymptote.
    expect(Math.abs(magDb(b.low, 20) - 6)).toBeLessThan(0.15);
    expect(Math.abs(magDb(b.high, 18000) - 6)).toBeLessThan(0.15);
    expect(magDb(b.low, 200)).toBeCloseTo(3, 1);
    expect(magDb(b.high, 8000)).toBeCloseTo(3, 1);

    // The cut direction really is a cut: mids are below unity at 420 Hz.
    expect(magDb(b.mid, 420)).toBeLessThan(0);
  });

  it("writes the clamped band values onto the filters", () => {
    const b = buildFrom(
      allEnabled({
        low: { enabled: true, hz: 120, gainDb: -4.5, q: 3 },
        mid: { enabled: true, hz: 1600, gainDb: 7, q: 2.5 },
        high: { enabled: true, hz: 6000, gainDb: -2, q: 0.5 },
      })
    );
    expect(b.low.frequency.value).toBe(120);
    expect(b.low.gain.value).toBe(-4.5);
    expect(b.low.Q.value).toBe(3);
    expect(b.mid.frequency.value).toBe(1600);
    expect(b.mid.gain.value).toBe(7);
    expect(b.mid.Q.value).toBe(2.5);
    expect(b.high.frequency.value).toBe(6000);
    expect(b.high.gain.value).toBe(-2);
    expect(b.high.Q.value).toBe(0.5);

    // And the response follows: mid boost at 1600 Hz.
    expect(magDb(b.mid, 1600)).toBeCloseTo(7, 4);
  });
});

// ---------------------------------------------------------------------------
// Clamping
// ---------------------------------------------------------------------------

type FieldCase = {
  name: string;
  apply: (strip: ChannelStrip, value: unknown) => void;
  read: (params: TrackInsertParams) => number | undefined;
  min: number;
  max: number;
};

const GARBAGE = [-1e9, -1, 0, 1e9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "nonsense"];

const numericCases: FieldCase[] = [
  {
    name: "hpfHz",
    apply: (s, v) => s.setParams({ hpfHz: v as number }),
    read: (p) => p.hpfHz,
    min: INSERT_HPF_MIN_HZ,
    max: INSERT_HPF_MAX_HZ,
  },
  {
    name: "low.hz",
    apply: (s, v) => s.setParams({ low: { ...s.getParams().low, hz: v as number } }),
    read: (p) => p.low.hz,
    min: INSERT_EQ_MIN_HZ,
    max: INSERT_EQ_MAX_HZ,
  },
  {
    name: "low.gainDb",
    apply: (s, v) => s.setParams({ low: { ...s.getParams().low, gainDb: v as number } }),
    read: (p) => p.low.gainDb,
    min: INSERT_EQ_MIN_GAIN_DB,
    max: INSERT_EQ_MAX_GAIN_DB,
  },
  {
    name: "low.q",
    apply: (s, v) => s.setParams({ low: { ...s.getParams().low, q: v as number } }),
    read: (p) => p.low.q,
    min: INSERT_EQ_MIN_Q,
    max: INSERT_EQ_MAX_Q,
  },
  {
    name: "mid.hz",
    apply: (s, v) => s.setParams({ mid: { ...s.getParams().mid, hz: v as number } }),
    read: (p) => p.mid.hz,
    min: INSERT_EQ_MIN_HZ,
    max: INSERT_EQ_MAX_HZ,
  },
  {
    name: "mid.gainDb",
    apply: (s, v) => s.setParams({ mid: { ...s.getParams().mid, gainDb: v as number } }),
    read: (p) => p.mid.gainDb,
    min: INSERT_EQ_MIN_GAIN_DB,
    max: INSERT_EQ_MAX_GAIN_DB,
  },
  {
    name: "mid.q",
    apply: (s, v) => s.setParams({ mid: { ...s.getParams().mid, q: v as number } }),
    read: (p) => p.mid.q,
    min: INSERT_EQ_MIN_Q,
    max: INSERT_EQ_MAX_Q,
  },
  {
    name: "high.hz",
    apply: (s, v) => s.setParams({ high: { ...s.getParams().high, hz: v as number } }),
    read: (p) => p.high.hz,
    min: INSERT_EQ_MIN_HZ,
    max: INSERT_EQ_MAX_HZ,
  },
  {
    name: "high.gainDb",
    apply: (s, v) => s.setParams({ high: { ...s.getParams().high, gainDb: v as number } }),
    read: (p) => p.high.gainDb,
    min: INSERT_EQ_MIN_GAIN_DB,
    max: INSERT_EQ_MAX_GAIN_DB,
  },
  {
    name: "high.q",
    apply: (s, v) => s.setParams({ high: { ...s.getParams().high, q: v as number } }),
    read: (p) => p.high.q,
    min: INSERT_EQ_MIN_Q,
    max: INSERT_EQ_MAX_Q,
  },
  {
    name: "compThresholdDb",
    apply: (s, v) => s.setParams({ compThresholdDb: v as number }),
    read: (p) => p.compThresholdDb,
    min: INSERT_COMP_MIN_THRESHOLD_DB,
    max: INSERT_COMP_MAX_THRESHOLD_DB,
  },
  {
    name: "compRatio",
    apply: (s, v) => s.setParams({ compRatio: v as number }),
    read: (p) => p.compRatio,
    min: INSERT_COMP_MIN_RATIO,
    max: INSERT_COMP_MAX_RATIO,
  },
  {
    name: "compAttackSec",
    apply: (s, v) => s.setParams({ compAttackSec: v as number }),
    read: (p) => p.compAttackSec,
    min: INSERT_COMP_MIN_ATTACK_SEC,
    max: INSERT_COMP_MAX_ATTACK_SEC,
  },
  {
    name: "compReleaseSec",
    apply: (s, v) => s.setParams({ compReleaseSec: v as number }),
    read: (p) => p.compReleaseSec,
    min: INSERT_COMP_MIN_RELEASE_SEC,
    max: INSERT_COMP_MAX_RELEASE_SEC,
  },
  {
    name: "compMakeupDb",
    apply: (s, v) => s.setParams({ compMakeupDb: v as number }),
    read: (p) => p.compMakeupDb,
    min: INSERT_COMP_MIN_MAKEUP_DB,
    max: INSERT_COMP_MAX_MAKEUP_DB,
  },
  {
    name: "driveAmount",
    apply: (s, v) => s.setParams({ driveAmount: v as number }),
    read: (p) => p.driveAmount,
    min: INSERT_DRIVE_MIN,
    max: INSERT_DRIVE_MAX,
  },
  {
    name: "driveMix",
    apply: (s, v) => s.setParams({ driveMix: v as number }),
    read: (p) => p.driveMix,
    min: 0,
    max: INSERT_DRIVE_MIX_MAX,
  },
];

describe("ChannelStrip — clamping", () => {
  it("lands every numeric field inside its documented bound for every garbage input", () => {
    for (const field of numericCases) {
      for (const value of GARBAGE) {
        const strip = new ChannelStrip(asCtx(new RecordingContext()), allEnabled());
        expect(() => field.apply(strip, value)).not.toThrow();
        const got = field.read(strip.getParams());
        expect(Number.isFinite(got), `${field.name} <- ${String(value)}`).toBe(true);
        expect(got!, `${field.name} <- ${String(value)}`).toBeGreaterThanOrEqual(field.min);
        expect(got!, `${field.name} <- ${String(value)}`).toBeLessThanOrEqual(field.max);
      }
    }
  });

  it("clamps construction params too (a corrupt stored insert cannot break the graph)", () => {
    const corrupt = {
      hpfEnabled: true,
      hpfHz: Number.NaN,
      low: { enabled: true, hz: 1e9, gainDb: -1e9, q: 1e9 },
      mid: { enabled: true, hz: -1e9, gainDb: Number.POSITIVE_INFINITY, q: -1e9 },
      high: { enabled: true, hz: Number.NaN, gainDb: Number.NaN, q: Number.NaN },
      compEnabled: true,
      compThresholdDb: 1e9,
      compRatio: 0,
      compAttackSec: -5,
      compReleaseSec: 1e9,
      compMakeupDb: 1e9,
      driveEnabled: true,
      driveAmount: 0,
      driveMix: 5,
    } as TrackInsertParams;

    const b = buildFrom(corrupt);

    expect(b.hpf.frequency.value).toBeGreaterThanOrEqual(INSERT_HPF_MIN_HZ);
    expect(b.hpf.frequency.value).toBeLessThanOrEqual(INSERT_HPF_MAX_HZ);
    expect(b.low.frequency.value).toBeGreaterThanOrEqual(INSERT_EQ_MIN_HZ);
    expect(b.low.frequency.value).toBeLessThanOrEqual(INSERT_EQ_MAX_HZ);
    expect(b.low.gain.value).toBeLessThanOrEqual(INSERT_EQ_MAX_GAIN_DB);
    expect(b.low.Q.value).toBeLessThanOrEqual(INSERT_EQ_MAX_Q);
    expect(b.comp.threshold.value).toBeGreaterThanOrEqual(INSERT_COMP_MIN_THRESHOLD_DB);
    expect(b.comp.threshold.value).toBeLessThanOrEqual(INSERT_COMP_MAX_THRESHOLD_DB);
    expect(b.comp.ratio.value).toBeGreaterThanOrEqual(INSERT_COMP_MIN_RATIO);
    expect(b.comp.ratio.value).toBeLessThanOrEqual(INSERT_COMP_MAX_RATIO);
    expect(b.comp.attack.value).toBeGreaterThanOrEqual(INSERT_COMP_MIN_ATTACK_SEC);
    expect(b.comp.release.value).toBeLessThanOrEqual(INSERT_COMP_MAX_RELEASE_SEC);
    expect(b.makeup.gain.value).toBeGreaterThanOrEqual(Math.pow(10, INSERT_COMP_MIN_MAKEUP_DB / 20));
    expect(b.makeup.gain.value).toBeLessThanOrEqual(Math.pow(10, INSERT_COMP_MAX_MAKEUP_DB / 20) + 1e-9);
    expect(b.driveDry.gain.value).toBeGreaterThanOrEqual(0);
    expect(b.driveWet.gain.value).toBeLessThanOrEqual(INSERT_DRIVE_MIX_MAX);

    const p = b.strip.getParams();
    expect(Number.isFinite(p.hpfHz)).toBe(true);
    expect(p.driveMix).toBeGreaterThanOrEqual(0);
    expect(p.driveMix).toBeLessThanOrEqual(INSERT_DRIVE_MIX_MAX);
    expect(p.driveAmount).toBeGreaterThanOrEqual(INSERT_DRIVE_MIN);
    expect(p.driveAmount).toBeLessThanOrEqual(INSERT_DRIVE_MAX);
  });

  it("coerces booleans and keeps undefined fields when a partial band is passed", () => {
    const b = buildFrom(allEnabled());

    b.strip.setParams({ hpfEnabled: 0 as unknown as boolean });
    expect(b.strip.getParams().hpfEnabled).toBe(false);
    b.strip.setParams({ hpfEnabled: 1 as unknown as boolean });
    expect(b.strip.getParams().hpfEnabled).toBe(true);

    // A runtime-partial band patch (the published type is a full band) must not wipe the
    // other fields of the band it touches.
    const before = b.strip.getParams().mid;
    b.strip.setParams({ mid: { gainDb: 99 } as unknown as TrackEqBand });
    const after = b.strip.getParams().mid;
    expect(after.enabled).toBe(before.enabled);
    expect(after.hz).toBe(before.hz);
    expect(after.q).toBe(before.q);
    expect(after.gainDb).toBe(INSERT_EQ_MAX_GAIN_DB);

    // A patch that is `undefined` everywhere leaves the params untouched.
    const snapshot = b.strip.getParams();
    b.strip.setParams({});
    expect(b.strip.getParams()).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Compressor + makeup
// ---------------------------------------------------------------------------

describe("ChannelStrip — compressor and makeup gain", () => {
  it("writes threshold/ratio/attack/release/knee and reports no reduction initially", () => {
    const b = buildFrom(
      allEnabled({
        compEnabled: true,
        compThresholdDb: -22,
        compRatio: 6,
        compAttackSec: 0.02,
        compReleaseSec: 0.25,
      })
    );

    expect(b.comp.threshold.value).toBe(-22);
    expect(b.comp.ratio.value).toBe(6);
    expect(b.comp.attack.value).toBe(0.02);
    expect(b.comp.release.value).toBe(0.25);
    expect(b.comp.knee.value).toBe(INSERT_COMP_KNEE_DB);
    expect(b.strip.getGainReductionDb()).toBe(0);
  });

  it("applies makeup with the strip's own gain node, not the compressor", () => {
    const b = buildFrom(allEnabled({ compEnabled: true, compMakeupDb: 6 }));

    expect(b.makeup).not.toBe(b.comp);
    expect(hasEdge(b.comp, b.makeup)).toBe(true);
    expect(b.makeup.gain.value).toBeCloseTo(Math.pow(10, 6 / 20), 10);
    // A DynamicsCompressorNode has no makeup parameter; if one ever appeared and the strip
    // used it, this assertion would catch the contract drifting.
    expect((b.comp as unknown as Record<string, unknown>).makeup).toBeUndefined();

    // Makeup is part of the compressor stage: bypassing compression removes it from the
    // path and holds the node at unity, so a stale compMakeupDb cannot leak gain.
    const off = buildFrom(allEnabled({ compEnabled: false, compMakeupDb: 12 }));
    expect(off.makeup.incoming).toHaveLength(0);
    expect(off.makeup.outgoing).toHaveLength(0);
    expect(off.makeup.gain.value).toBe(1);
    expect(off.comp.incoming).toHaveLength(0);
  });

  it("reports gain reduction from the compressor and zero when bypassed", () => {
    const b = buildFrom(allEnabled({ compEnabled: true }));

    b.comp.reduction = -6.5;
    expect(b.strip.getGainReductionDb()).toBeCloseTo(6.5, 6);

    // A nonsensical positive `reduction` never reports negative gain reduction.
    b.comp.reduction = 3;
    expect(b.strip.getGainReductionDb()).toBe(0);

    b.comp.reduction = -4;
    b.strip.setParams({ compEnabled: false });
    expect(b.strip.getGainReductionDb()).toBe(0);

    // Honest gap: this double does not compute `reduction` from a signal, so the value
    // above is injected by the test. It proves the strip reads and signs the browser
    // property correctly; it does not measure the browser's compressor.
  });
});

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

describe("ChannelStrip — drive", () => {
  it("has unity small-signal gain across the whole drive range", () => {
    for (const amount of [INSERT_DRIVE_MIN, 1.5, 2, 4, INSERT_DRIVE_MAX]) {
      const b = buildFrom(allEnabled({ driveEnabled: true, driveAmount: amount, driveMix: 1 }));
      const curve = b.shaper.curve;
      expect(curve).not.toBeNull();
      expect(curve!.length).toBe(INSERT_DRIVE_CURVE_SAMPLES);

      // Central-difference slope of the transfer table at x = 0. An even sample count puts
      // a sample exactly at the centre, so this measures the true small-signal gain.
      // Q13: the table spans ±SATURATION_INPUT_CEILING, so the spacing comes from the shared
      // inverse mapping instead of assuming a ±1 domain.
      const centre = curve!.length / 2;
      const dx = saturationCurveInputForIndex(1, curve!.length) - saturationCurveInputForIndex(0, curve!.length);
      const slope = (curve![centre + 1] - curve![centre - 1]) / (2 * dx);
      expect(Math.abs(slope - 1), `drive ${amount}`).toBeLessThan(1e-3);

      // Bit-identical to the master rack's corrected curve — this is the anti-drift pin.
      expect(Array.from(curve!)).toEqual(Array.from(makeSaturationCurve(amount, INSERT_DRIVE_CURVE_SAMPLES)));

      // Peak magnitude <= 1 for every supported drive, so engaging DRIVE cannot add level.
      expect(Math.max(...Array.from(curve!, Math.abs))).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("is exactly dry at mix 0 and fully wet at mix 1", () => {
    const dry = buildFrom(allEnabled({ driveEnabled: true, driveMix: 0 }));
    expect(dry.driveDry.gain.value).toBe(1);
    expect(dry.driveWet.gain.value).toBe(0);

    const wet = buildFrom(allEnabled({ driveEnabled: true, driveMix: 1 }));
    expect(wet.driveDry.gain.value).toBe(0);
    expect(wet.driveWet.gain.value).toBe(1);

    const half = buildFrom(allEnabled({ driveEnabled: true, driveMix: 0.5 }));
    expect(half.driveDry.gain.value).toBe(0.5);
    expect(half.driveWet.gain.value).toBe(0.5);

    // Out-of-range mix is clamped, so "full wet" can never exceed unity.
    const over = buildFrom(allEnabled({ driveEnabled: true, driveMix: 5 }));
    expect(over.driveWet.gain.value).toBe(1);
    expect(over.driveDry.gain.value).toBe(0);
  });

  it("is linear (curve null) and out of the path when drive is disabled", () => {
    const b = buildFrom(allEnabled({ driveEnabled: false, driveAmount: 4, driveMix: 0.7 }));
    expect(b.shaper.curve).toBeNull();
    expect(b.shaper.incoming).toHaveLength(0);
    expect(b.shaper.outgoing).toHaveLength(0);
    expect(b.driveDry.incoming).toHaveLength(0);
    expect(b.driveWet.incoming).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Determinism / endpoint stability
// ---------------------------------------------------------------------------

function paramSnapshot(ctx: RecordingContext) {
  return ctx.nodes.map((node) => {
    const params: Record<string, { value: number; events: Array<{ type: string; value: number; time: number }> }> =
      {};
    for (const [key, value] of Object.entries(node)) {
      if (value instanceof RecParam) {
        params[key] = { value: value.value, events: value.events.map((e) => ({ ...e })) };
      }
    }
    return params;
  });
}

describe("ChannelStrip — determinism and stable endpoints", () => {
  it("schedules identical values and builds identical curves for identical params", () => {
    const params = allEnabled({ driveEnabled: true, driveAmount: 5, driveMix: 0.35 });

    const a = buildFrom(params);
    const b = buildFrom(params);
    a.strip.setParams({ mid: { enabled: true, hz: 1234, gainDb: -5, q: 2 } });
    b.strip.setParams({ mid: { enabled: true, hz: 1234, gainDb: -5, q: 2 } });

    expect(a.strip.getParams()).toEqual(b.strip.getParams());
    expect(paramSnapshot(a.ctx)).toEqual(paramSnapshot(b.ctx));
    expect(Array.from(a.shaper.curve!)).toEqual(Array.from(b.shaper.curve!));
    expect(a.ctx.gains.map((g) => g.gain.value)).toEqual(b.ctx.gains.map((g) => g.gain.value));
  });

  it("keeps input/output identity and unity gain across setParams and stage toggles", () => {
    const b = buildFrom(allEnabled());
    const input = b.input;
    const output = b.output;

    const patches: Array<Partial<TrackInsertParams>> = [
      { hpfEnabled: false },
      { hpfEnabled: true, hpfHz: 320 },
      { low: { enabled: false } as TrackEqBand },
      { compEnabled: false },
      { driveEnabled: false, driveMix: 0 },
      { compEnabled: true, compMakeupDb: 9 },
      { driveEnabled: true, driveAmount: 7, driveMix: 0.9 },
    ];

    for (const patch of patches) {
      b.strip.setParams(patch);
      expect(b.input).toBe(input);
      expect(b.output).toBe(output);
      expect(b.input.gain.value).toBe(1);
      expect(b.output.gain.value).toBe(1);
    }

    expect(b.ctx.gains[0]).toBe(input);
    expect(b.ctx.gains[1]).toBe(output);
  });
});

// ---------------------------------------------------------------------------
// Contract agreement, teardown, offline context
// ---------------------------------------------------------------------------

describe("ChannelStrip — contract, teardown and offline context", () => {
  it("isBypassed() agrees with isTrackInsertBypassed() for every role and for patches", () => {
    for (const role of INSERT_ROLES) {
      const strip = new ChannelStrip(asCtx(new RecordingContext()), resolveTrackInsert(role));
      expect(strip.getParams()).toEqual(resolveTrackInsert(role));
      expect(strip.isBypassed()).toBe(isTrackInsertBypassed(strip.getParams()));
      // Every role ships at least a high-pass and a compressor, so none is bypassed.
      expect(strip.isBypassed()).toBe(false);
    }

    const bypassed = new ChannelStrip(asCtx(new RecordingContext()), bypassTrackInsert());
    expect(bypassed.isBypassed()).toBe(true);
    expect(isTrackInsertBypassed(bypassed.getParams())).toBe(true);

    // Any single enabled stage flips it, and the data module agrees.
    const single = new ChannelStrip(asCtx(new RecordingContext()), {
      ...bypassTrackInsert(),
      driveEnabled: true,
    });
    expect(single.isBypassed()).toBe(false);
    expect(single.isBypassed()).toBe(isTrackInsertBypassed(single.getParams()));

    const offAgain = new ChannelStrip(asCtx(new RecordingContext()), allEnabled());
    offAgain.setParams({
      hpfEnabled: false,
      low: { enabled: false } as TrackEqBand,
      mid: { enabled: false } as TrackEqBand,
      high: { enabled: false } as TrackEqBand,
      compEnabled: false,
      driveEnabled: false,
    });
    expect(offAgain.isBypassed()).toBe(true);
    expect(offAgain.isBypassed()).toBe(isTrackInsertBypassed(offAgain.getParams()));
  });

  it("dispose() is safe twice and leaves no connected nodes", () => {
    const b = buildFrom(allEnabled());

    b.strip.dispose();
    for (const node of b.ctx.nodes) {
      expect(node.incoming).toHaveLength(0);
      expect(node.outgoing).toHaveLength(0);
    }

    expect(() => b.strip.dispose()).not.toThrow();
    expect(() => b.strip.setParams({ hpfEnabled: true })).not.toThrow();
    expect(b.input.outgoing).toHaveLength(0);
    expect(b.output.outgoing).toHaveLength(0);
  });

  it("builds the same graph against an OfflineAudioContext double", () => {
    // `FakeOfflineAudioContext` exercises the offline factory path (sampleRate, no
    // `currentTime` movement). It does NOT render audio — see the honest gap in the
    // report: jsdom has no Web Audio, so no test here renders through a real
    // OfflineAudioContext.
    const ctx = new FakeOfflineAudioContext(2, 44100, 44100);
    const strip = new ChannelStrip(ctx as unknown as BaseAudioContext, resolveTrackInsert("kick"));

    expect(strip.getParams()).toEqual(resolveTrackInsert("kick"));
    expect(strip.isBypassed()).toBe(false);
    expect(ctx.createdFilters).toHaveLength(4);
    expect(ctx.createdGains).toHaveLength(6);
    expect(strip.getGainReductionDb()).toBe(0);
    expect(() => strip.dispose()).not.toThrow();
  });
});
