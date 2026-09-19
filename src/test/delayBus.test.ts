import { describe, it, expect } from "vitest";
import {
  DelayBus,
  DEFAULT_DELAY_PARAMS,
  DELAY_TIME_MIN_SEC,
  DELAY_TIME_MAX_SEC,
  DELAY_FEEDBACK_MAX,
  delayDivisionSeconds,
  delayCrossfadeSeconds,
  type DelayDivision,
  type DelayParams,
} from "../audio/DelayBus";
import {
  FakeAudioContext,
  FakeAudioGraph,
  FakeAudioParam,
  FakeChannelMergerNode,
  FakeChannelSplitterNode,
  FakeDelayNode,
  FakeFilterNode,
  FakeGainNode,
  FakeNode,
  FakeOfflineAudioContext,
} from "./helpers/fakeAudio";

// ---------------------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------------------
//
// Two gaps in `helpers/fakeAudio.ts` matter here and are worked around rather than hidden:
//
//  * `FakeAudioGraph.createDelay` does not record the nodes it creates (unlike
//    `createdGains` / `createdFilters`), so the delay lines could not be inspected at all.
//  * `FakeDelayNode` has no `maxDelayTime` property, so the constructor argument — the one
//    thing that actually decides the node's maximum delay — cannot be read back off the
//    node.
//  * `createChannelSplitter` / `createChannelMerger` are likewise unrecorded.
//
// `instrumentGraph` wraps those three factories on a fake context so the tests can see the
// delay nodes, the maximum each was allocated for, and the channel-routing nodes. Nothing
// about the doubles' behaviour is changed; only their return values are captured.

interface GraphRecorder {
  delays: FakeDelayNode[];
  delayMaxArgs: number[];
  splitters: FakeChannelSplitterNode[];
  mergers: FakeChannelMergerNode[];
}

function instrumentGraph(ctx: FakeAudioGraph): GraphRecorder {
  const rec: GraphRecorder = { delays: [], delayMaxArgs: [], splitters: [], mergers: [] };

  const baseCreateDelay = ctx.createDelay.bind(ctx);
  ctx.createDelay = ((maxDelayTime?: number) => {
    const node = baseCreateDelay();
    rec.delays.push(node);
    rec.delayMaxArgs.push(maxDelayTime ?? 0);
    return node;
  }) as typeof ctx.createDelay;

  const baseCreateSplitter = ctx.createChannelSplitter.bind(ctx);
  ctx.createChannelSplitter = ((numberOfOutputs?: number) => {
    const node = baseCreateSplitter(numberOfOutputs);
    rec.splitters.push(node);
    return node;
  }) as typeof ctx.createChannelSplitter;

  const baseCreateMerger = ctx.createChannelMerger.bind(ctx);
  ctx.createChannelMerger = ((numberOfInputs?: number) => {
    const node = baseCreateMerger(numberOfInputs);
    rec.mergers.push(node);
    return node;
  }) as typeof ctx.createChannelMerger;

  return rec;
}

/** The fake param behind a real-typed `AudioParam`, whose `events` log the ramps read. */
function fakeParam(param: AudioParam): FakeAudioParam {
  return param as unknown as FakeAudioParam;
}

/** A real-typed node back to its fake identity, for comparisons against the registry. */
function asFakeNode(node: AudioNode): FakeNode {
  return node as unknown as FakeNode;
}

function allNodes(ctx: FakeAudioGraph, rec: GraphRecorder): FakeNode[] {
  return [
    ...ctx.createdGains,
    ...ctx.createdFilters,
    ...rec.delays,
    ...rec.splitters,
    ...rec.mergers,
  ];
}

/** Forward adjacency built from the fake's `incoming` arrays. */
function buildAdjacency(nodes: FakeNode[]): Map<FakeNode, FakeNode[]> {
  const inSet = new Set(nodes);
  const adj = new Map<FakeNode, FakeNode[]>();
  for (const node of nodes) adj.set(node, []);
  for (const node of nodes) {
    for (const source of node.incoming) {
      if (inSet.has(source)) adj.get(source)!.push(node);
    }
  }
  return adj;
}

function canReach(adj: Map<FakeNode, FakeNode[]>, from: FakeNode, to: FakeNode): boolean {
  const stack = [...(adj.get(from) ?? [])];
  const seen = new Set<FakeNode>();
  while (stack.length) {
    const node = stack.pop()!;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(adj.get(node) ?? []));
  }
  return false;
}

function successorFilter(adj: Map<FakeNode, FakeNode[]>, node: FakeNode): FakeFilterNode {
  const found = (adj.get(node) ?? []).find((n): n is FakeFilterNode => n instanceof FakeFilterNode);
  expect(found, "expected a filter directly downstream of the delay line").toBeTruthy();
  return found!;
}

function successorGain(adj: Map<FakeNode, FakeNode[]>, node: FakeNode): FakeGainNode {
  const found = (adj.get(node) ?? []).find((n): n is FakeGainNode => n instanceof FakeGainNode);
  expect(found, "expected a gain directly downstream of the damping filter").toBeTruthy();
  return found!;
}

function makeBus(params?: Partial<DelayParams>) {
  const ctx = new FakeAudioContext();
  const rec = instrumentGraph(ctx);
  const bus = new DelayBus(ctx as unknown as BaseAudioContext, params);
  return { ctx, rec, bus };
}

function kindCounts(ctx: FakeAudioGraph, rec: GraphRecorder) {
  return {
    gains: ctx.createdGains.length,
    filters: ctx.createdFilters.length,
    delays: rec.delays.length,
    splitters: rec.splitters.length,
    mergers: rec.mergers.length,
  };
}

/**
 * Analytic magnitude of the in-loop biquad low-pass, used to turn the *measured* graph
 * (filter cutoff and Q, feedback gain actually written to the nodes) into repeat levels.
 * `biquadLowpassMagnitude` is the standard 2nd-order low-pass transfer magnitude with the
 * node's own Q, not a re-statement of the implementation.
 */
function biquadLowpassMagnitude(freqHz: number, cutoffHz: number, q: number): number {
  const r = freqHz / cutoffHz;
  return 1 / Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / q, 2));
}

interface MeasuredLoop {
  delay: FakeDelayNode;
  damp: FakeFilterNode;
  fb: FakeGainNode;
}

/** Extracts the (single) dampled feedback loop of a centred build from the built graph. */
function measureCentredLoop(ctx: FakeAudioGraph, rec: GraphRecorder): MeasuredLoop {
  const adj = buildAdjacency(allNodes(ctx, rec));
  const delay = rec.delays[rec.delays.length - 1];
  const damp = successorFilter(adj, delay);
  const fb = successorGain(adj, damp);
  return { delay, damp, fb };
}

/** Loop gain at a frequency: feedback x the in-loop low-pass magnitude. */
function loopGainAt(loop: MeasuredLoop, freqHz: number): number {
  return (
    loop.fb.gain.value *
    biquadLowpassMagnitude(freqHz, loop.damp.frequency.value, loop.damp.Q.value)
  );
}

// ---------------------------------------------------------------------------------------
// Tempo-aware divisions
// ---------------------------------------------------------------------------------------

const DIVISIONS: DelayDivision[] = ["1/4", "1/8d", "1/8t", "1/8", "1/16", "1/16d"];

describe("delayDivisionSeconds", () => {
  it("makes a quarter note 60/bpm", () => {
    expect(delayDivisionSeconds("1/4", 120)).toBeCloseTo(0.5, 12);
    expect(delayDivisionSeconds("1/4", 60)).toBeCloseTo(1, 12);
    expect(delayDivisionSeconds("1/4", 90)).toBeCloseTo(60 / 90, 12);
  });

  it.each([90, 120, 128, 140, 175])("keeps the musical ratios at %i BPM", (bpm) => {
    const quarter = delayDivisionSeconds("1/4", bpm);
    const eighth = delayDivisionSeconds("1/8", bpm);

    // dotted eighth = 1.5 x eighth, triplet eighth = 2/3 x eighth
    expect(delayDivisionSeconds("1/8d", bpm)).toBeCloseTo(eighth * 1.5, 12);
    expect(delayDivisionSeconds("1/8t", bpm)).toBeCloseTo(eighth * (2 / 3), 12);
    // and the rest of the family relative to the beat
    expect(eighth).toBeCloseTo(quarter / 2, 12);
    expect(delayDivisionSeconds("1/16", bpm)).toBeCloseTo(quarter / 4, 12);
    expect(delayDivisionSeconds("1/16d", bpm)).toBeCloseTo(quarter * 0.375, 12);
  });

  it("is defined and distinct for every declared division", () => {
    const values = DIVISIONS.map((d) => delayDivisionSeconds(d, 120));
    for (const v of values) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(new Set(values).size).toBe(DIVISIONS.length);
  });

  it("uses the playing tempo, not a static default_bpm", () => {
    // The measured drift in this library: sequencer_pattern.bpm vs top-level default_bpm.
    const playingBpm = 128;
    const staticDefaultBpm = 100;

    const withPlaying = delayDivisionSeconds("1/8d", playingBpm);
    const withWrong = delayDivisionSeconds("1/8d", staticDefaultBpm);

    expect(withPlaying).toBeCloseTo(45 / 128, 12); // 0.3515625 s
    expect(withWrong).toBeCloseTo(0.45, 12);
    // The wrong tempo is audibly a different (longer) echo, not a rounding wobble.
    expect(withWrong - withPlaying).toBeGreaterThan(0.09);
    expect(withPlaying).not.toBeCloseTo(withWrong, 3);
  });

  it("survives a nonsense tempo", () => {
    for (const bpm of [0, -120, NaN, Infinity, -Infinity]) {
      const seconds = delayDivisionSeconds("1/8", bpm);
      expect(Number.isFinite(seconds)).toBe(true);
      expect(seconds).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------------------
// Damped feedback: the filter really is inside the loop, and it really darkens
// ---------------------------------------------------------------------------------------

describe("damped feedback loop", () => {
  it("places a lowpass in the loop at exactly dampHz and returns through the feedback gain", () => {
    const { ctx, rec, bus } = makeBus({ dampHz: 1200, feedback: 0.4, pingPong: false });
    const adj = buildAdjacency(allNodes(ctx, rec));
    const delay = rec.delays[0];

    const damp = successorFilter(adj, delay);
    expect(damp.type).toBe("lowpass");
    expect(damp.frequency.value).toBe(1200);
    expect(damp.Q.value).toBeCloseTo(Math.SQRT1_2, 6);

    const fb = successorGain(adj, damp);
    expect(fb.gain.value).toBeCloseTo(0.4, 6);

    // The loop closes: the filter can reach its own delay line again, so it is *in* the
    // loop rather than a one-shot tone control on the return.
    expect(canReach(adj, damp, delay)).toBe(true);

    // Two branches leave the delay: the damped feedback loop and the wet tap. The first
    // repeat (the tap) is undamped, which is exactly what makes later repeats darker.
    const branches = adj.get(delay) ?? [];
    expect(branches.length).toBe(2);
    expect(branches).toContain(damp);
    const wetTap = branches.find((n) => n !== damp && n instanceof FakeGainNode)!;
    expect(canReach(adj, wetTap, asFakeNode(bus.output))).toBe(true);

    // Changing dampHz rewrites the same node's cutoff (no rebuild).
    bus.setParams({ dampHz: 5000 });
    expect(bus.getParams().dampHz).toBe(5000);
    expect(damp.frequency.value).toBe(5000);
    expect(damp).toBe(successorFilter(adj, delay));
  });

  it("makes later repeats measurably darker when dampHz is lowered", () => {
    // Approach: the fake nodes do not process audio, so the darkening is computed from the
    // graph the bus actually built. `measureCentredLoop` walks the built connections to the
    // in-loop filter and feedback gain, then the standard biquad low-pass magnitude turns
    // the measured cutoff/Q into a per-repeat loop gain. The recurrence for a tap at the
    // delay output is: repeat k amplitude at f = loopGain(f)^k.
    const bright = makeBus({ dampHz: 8000, feedback: 0.5, pingPong: false });
    const dark = makeBus({ dampHz: 700, feedback: 0.5, pingPong: false });
    const brightLoop = measureCentredLoop(bright.ctx, bright.rec);
    const darkLoop = measureCentredLoop(dark.ctx, dark.rec);

    // Provenance: the cutoffs under test came off the graph, not from the test body.
    expect(brightLoop.damp.frequency.value).toBe(8000);
    expect(darkLoop.damp.frequency.value).toBe(700);
    expect(brightLoop.fb.gain.value).toBeCloseTo(0.5, 9);
    expect(darkLoop.fb.gain.value).toBeCloseTo(0.5, 9);

    const probeHz = 4000;
    const brightGain = loopGainAt(brightLoop, probeHz);
    const darkGain = loopGainAt(darkLoop, probeHz);
    expect(darkGain).toBeLessThan(brightGain);

    const brightRepeat5 = Math.pow(brightGain, 5);
    const darkRepeat5 = Math.pow(darkGain, 5);
    expect(darkRepeat5).toBeLessThan(brightRepeat5);
    // "Measurably" darker, not a rounding difference: > 6 dB down by the fifth repeat.
    expect(20 * Math.log10(brightRepeat5 / darkRepeat5)).toBeGreaterThan(6);

    // At 100 Hz the low-pass is transparent in both, so this is high-frequency darkening
    // and not just a quieter loop.
    const brightLow = loopGainAt(brightLoop, 100);
    const darkLow = loopGainAt(darkLoop, 100);
    expect(Math.abs(20 * Math.log10(brightLow / darkLow))).toBeLessThan(0.5);
  });

  it("clamps feedback to DELAY_FEEDBACK_MAX and never lets the loop reach unity", () => {
    const { ctx, rec, bus } = makeBus({ feedback: 1, pingPong: false });
    expect(bus.getParams().feedback).toBe(DELAY_FEEDBACK_MAX);
    expect(measureCentredLoop(ctx, rec).fb.gain.value).toBeCloseTo(DELAY_FEEDBACK_MAX, 9);

    bus.setParams({ feedback: 5 });
    expect(bus.getParams().feedback).toBe(DELAY_FEEDBACK_MAX);
    expect(measureCentredLoop(ctx, rec).fb.gain.value).toBeCloseTo(DELAY_FEEDBACK_MAX, 9);

    bus.setParams({ feedback: -3 });
    expect(bus.getParams().feedback).toBe(0);
    expect(measureCentredLoop(ctx, rec).fb.gain.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------

describe("delay time", () => {
  it("clamps negative, zero, absurd and NaN times into the declared bounds", () => {
    const { rec, bus } = makeBus();
    const delayNode = () => rec.delays[rec.delays.length - 1];

    const pinned: Array<[number, number]> = [
      [-1, DELAY_TIME_MIN_SEC],
      [0, DELAY_TIME_MIN_SEC],
      [DELAY_TIME_MIN_SEC / 2, DELAY_TIME_MIN_SEC],
      [1e9, DELAY_TIME_MAX_SEC],
    ];
    for (const [input, expected] of pinned) {
      expect(() => bus.setParams({ timeSeconds: input })).not.toThrow();
      expect(bus.getParams().timeSeconds).toBe(expected);
      expect(delayNode().delayTime.value).toBeCloseTo(expected, 9);
    }

    for (const weird of [NaN, Infinity, -Infinity]) {
      expect(() => bus.setParams({ timeSeconds: weird })).not.toThrow();
      const clamped = bus.getParams().timeSeconds;
      expect(Number.isFinite(clamped)).toBe(true);
      expect(clamped).toBeGreaterThanOrEqual(DELAY_TIME_MIN_SEC);
      expect(clamped).toBeLessThanOrEqual(DELAY_TIME_MAX_SEC);
      expect(delayNode().delayTime.value).toBeCloseTo(clamped, 9);
    }
  });

  it("allocates each delay node for the declared maximum, not the current value", () => {
    const { rec, bus } = makeBus({ timeSeconds: DELAY_TIME_MIN_SEC });
    // The node's max is set by the constructor argument, which is the only place the fake
    // can expose it (FakeDelayNode has no maxDelayTime property).
    expect(rec.delayMaxArgs.length).toBeGreaterThan(0);
    expect(Math.min(...rec.delayMaxArgs)).toBeGreaterThanOrEqual(DELAY_TIME_MAX_SEC);

    // A long time is therefore usable without rebuilding, and a rebuild keeps the bound.
    bus.setParams({ timeSeconds: DELAY_TIME_MAX_SEC });
    expect(rec.delays[rec.delays.length - 1].delayTime.value).toBeCloseTo(
      DELAY_TIME_MAX_SEC,
      9
    );
    bus.setParams({ pingPong: true });
    expect(Math.min(...rec.delayMaxArgs)).toBeGreaterThanOrEqual(DELAY_TIME_MAX_SEC);
    expect(bus.getParams().timeSeconds).toBe(DELAY_TIME_MAX_SEC);
  });
});

// ---------------------------------------------------------------------------------------
// Return level / enabled
// ---------------------------------------------------------------------------------------

describe("return level and enabled", () => {
  it("is the only thing that decides the wet level, clamped to 0..1", () => {
    const { ctx, bus } = makeBus({ feedback: 0.4, returnLevel: 0.55, enabled: true });
    expect(bus.output.gain.value).toBeCloseTo(0.55, 9);

    // Exactly one node in the whole graph carries the return level: `output`. Neither the
    // feedback gain nor any summing stage is scaled by it.
    const atReturn = ctx.createdGains.filter((g) => Math.abs(g.gain.value - 0.55) < 1e-9);
    expect(atReturn).toHaveLength(1);
    expect(atReturn[0]).toBe(bus.output);

    bus.setParams({ returnLevel: 2 });
    expect(bus.getParams().returnLevel).toBe(1);
    expect(bus.output.gain.value).toBeCloseTo(1, 9);

    bus.setParams({ returnLevel: -1 });
    expect(bus.getParams().returnLevel).toBe(0);
    expect(bus.output.gain.value).toBe(0);
  });

  it("silences with a short ramp and restores with a ramp, never a step to 0", () => {
    const { bus } = makeBus({ enabled: true, returnLevel: 0.3 });
    const returnGain = fakeParam(bus.output.gain);
    expect(returnGain.value).toBeCloseTo(0.3, 9);

    const beforeDisable = returnGain.events.length;
    bus.setParams({ enabled: false });
    const disableEvents = returnGain.events.slice(beforeDisable);
    expect(disableEvents.some((e) => e.type === "linearRampToValueAtTime" && e.value === 0)).toBe(
      true
    );
    expect(disableEvents.some((e) => e.type === "setValueAtTime" && e.value === 0)).toBe(false);
    expect(returnGain.value).toBe(0);

    // Staying disabled: a returnLevel change must not leak any signal back in.
    bus.setParams({ returnLevel: 0.9 });
    expect(returnGain.value).toBe(0);

    const beforeEnable = returnGain.events.length;
    bus.setParams({ enabled: true });
    const enableEvents = returnGain.events.slice(beforeEnable);
    expect(
      enableEvents.some((e) => e.type === "linearRampToValueAtTime" && e.value === 0.9)
    ).toBe(true);
    expect(returnGain.value).toBeCloseTo(0.9, 9);
  });

  it("applies a disabled state from construction without an audible graph", () => {
    const { bus } = makeBus({ enabled: false, returnLevel: 0.4 });
    expect(bus.getParams().enabled).toBe(false);
    expect(bus.output.gain.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// Ping-pong routing and stable endpoints
// ---------------------------------------------------------------------------------------

describe("pingPong routing", () => {
  it("changes the graph and keeps input/output identities stable across toggles", () => {
    const { ctx, rec, bus } = makeBus({ pingPong: false, feedback: 0.5, dampHz: 3000 });
    const inputBefore = bus.input;
    const outputBefore = bus.output;

    // Centred build: one stereo delay line, no channel routing nodes at all.
    expect(rec.delays).toHaveLength(1);
    expect(rec.splitters).toHaveLength(0);
    expect(rec.mergers).toHaveLength(0);
    const centredAdj = buildAdjacency(allNodes(ctx, rec));
    const centredDelay = rec.delays[0];
    const centredDamp = successorFilter(centredAdj, centredDelay);
    expect(centredDamp.type).toBe("lowpass");
    const centredFb = successorGain(centredAdj, centredDamp);
    expect(canReach(centredAdj, centredFb, centredDelay)).toBe(true); // self feedback

    bus.setParams({ pingPong: true });
    expect(bus.input).toBe(inputBefore);
    expect(bus.output).toBe(outputBefore);

    // Ping-pong build: the routing genuinely differs — two mono lines plus a splitter and
    // a merger that did not exist before.
    expect(rec.delays).toHaveLength(3); // 1 centred + 2 ping
    expect(rec.splitters).toHaveLength(1);
    expect(rec.mergers).toHaveLength(1);

    const pingAdj = buildAdjacency(allNodes(ctx, rec));
    const delayL = rec.delays[1];
    const delayR = rec.delays[2];
    const dampL = successorFilter(pingAdj, delayL);
    const dampR = successorFilter(pingAdj, delayR);
    expect(dampL.type).toBe("lowpass");
    expect(dampR.type).toBe("lowpass");
    // Cross-fed: L's tail returns into R's line and vice versa, and each loop still closes.
    expect(canReach(pingAdj, dampL, delayR)).toBe(true);
    expect(canReach(pingAdj, dampR, delayL)).toBe(true);
    expect(canReach(pingAdj, dampL, delayL)).toBe(true);
    expect(canReach(pingAdj, dampL, dampL)).toBe(true);

    // The send is split before anything reaches the merger, so the merger's mono inputs
    // see the two mono delay lines, never a down-mixed stereo signal.
    expect(canReach(pingAdj, asFakeNode(bus.input), rec.splitters[0])).toBe(true);
    expect(rec.mergers[0].incoming.filter((n) => n instanceof FakeDelayNode)).toHaveLength(2);

    // Switching back rebuilds a valid centred graph behind the same endpoints.
    bus.setParams({ pingPong: false });
    expect(bus.input).toBe(inputBefore);
    expect(bus.output).toBe(outputBefore);
    expect(rec.delays).toHaveLength(4);
    expect(rec.splitters).toHaveLength(1);
    expect(rec.mergers).toHaveLength(1);
    const backAdj = buildAdjacency(allNodes(ctx, rec));
    const backDelay = rec.delays[3];
    const backDamp = successorFilter(backAdj, backDelay);
    expect(canReach(backAdj, backDamp, backDelay)).toBe(true);
  });

  it("keeps the endpoints stable across many unrelated setParams calls", () => {
    const { bus } = makeBus();
    const input = bus.input;
    const output = bus.output;
    bus.setParams({ timeSeconds: 1, feedback: 0.7, dampHz: 900, returnLevel: 0.4 });
    bus.setParams({ pingPong: true });
    bus.setParams({ timeSeconds: 0.1 });
    bus.setParams({ pingPong: false });
    bus.setParams({ enabled: false });
    bus.setParams({ enabled: true });
    expect(bus.input).toBe(input);
    expect(bus.output).toBe(output);
  });
});

// ---------------------------------------------------------------------------------------
// Determinism / offline compatibility
// ---------------------------------------------------------------------------------------

describe("determinism and offline compatibility", () => {
  const params: Partial<DelayParams> = {
    timeSeconds: 0.5,
    feedback: 0.4,
    dampHz: 1000,
    pingPong: true,
    returnLevel: 0.3,
  };

  it("builds the same graph on a realtime and an offline context", () => {
    const live = new FakeAudioContext();
    const liveRec = instrumentGraph(live);
    const busLive = new DelayBus(live as unknown as BaseAudioContext, params);

    const offline = new FakeOfflineAudioContext(2, 44100, 44100);
    const offlineRec = instrumentGraph(offline);
    const busOffline = new DelayBus(offline as unknown as BaseAudioContext, params);

    expect(busOffline.getParams()).toEqual(busLive.getParams());
    expect(kindCounts(offline, offlineRec)).toEqual(kindCounts(live, liveRec));
    expect(offlineRec.delays.map((d) => d.delayTime.value)).toEqual(
      liveRec.delays.map((d) => d.delayTime.value)
    );
    expect(
      offline.createdFilters.map((f) => [f.type, f.frequency.value, f.Q.value])
    ).toEqual(live.createdFilters.map((f) => [f.type, f.frequency.value, f.Q.value]));
    expect(offline.createdGains.map((g) => g.gain.value)).toEqual(
      live.createdGains.map((g) => g.gain.value)
    );
  });

  it("is deterministic: identical params produce an identical graph", () => {
    const first = new FakeAudioContext();
    const firstRec = instrumentGraph(first);
    const busFirst = new DelayBus(first as unknown as BaseAudioContext, params);

    const second = new FakeAudioContext();
    const secondRec = instrumentGraph(second);
    const busSecond = new DelayBus(second as unknown as BaseAudioContext, params);

    expect(busSecond.getParams()).toEqual(busFirst.getParams());
    expect(kindCounts(second, secondRec)).toEqual(kindCounts(first, firstRec));
    expect(second.createdGains.map((g) => g.gain.value)).toEqual(
      first.createdGains.map((g) => g.gain.value)
    );
  });

  it("adds no random or clock-based state between two identical instances", () => {
    // The determinism test above is the positive form; this is the negative guard that a
    // later edit cannot quietly introduce per-instance variation (Math.random, Date.now).
    const a = makeBus(params);
    const b = makeBus(params);
    expect(b.bus.getParams()).toEqual(a.bus.getParams());
    expect(kindCounts(b.ctx, b.rec)).toEqual(kindCounts(a.ctx, a.rec));
    expect(b.rec.delayMaxArgs).toEqual(a.rec.delayMaxArgs);
  });

  it("disposes idempotently and ignores setParams afterwards", () => {
    const { bus } = makeBus({ pingPong: true });
    expect(() => bus.dispose()).not.toThrow();
    expect(() => bus.dispose()).not.toThrow();
    expect(() => bus.setParams({ timeSeconds: 1, pingPong: false })).not.toThrow();
    expect(bus.getParams().timeSeconds).toBe(DEFAULT_DELAY_PARAMS.timeSeconds);
  });
});

// ---------------------------------------------------------------------------------------
// M4: a rebuild hands the tail over instead of cutting it
// ---------------------------------------------------------------------------------------

/** The persistent wet summing node: the one gain that feeds the public `output`. */
function wetSumOf(ctx: FakeAudioGraph, bus: DelayBus): FakeGainNode {
  const output = asFakeNode(bus.output);
  const found = ctx.createdGains.filter((g) => g.outgoing.some((edge) => edge.node === output));
  expect(found, "expected exactly one wet summing node feeding output").toHaveLength(1);
  return found[0];
}

/**
 * Every generation output gain, oldest first — the builds that feed the wet sum. A build that is
 * still fading out keeps this edge, which is how these tests see that it was not cut.
 */
function generationGains(ctx: FakeAudioGraph, bus: DelayBus): FakeGainNode[] {
  const wetSum = wetSumOf(ctx, bus);
  return ctx.createdGains.filter((g) => g.outgoing.some((edge) => edge.node === wetSum));
}

describe("rebuild cross-fade (M4)", () => {
  it("fades the outgoing build out instead of disconnecting it, so the tail is not cut", () => {
    const { ctx, rec, bus } = makeBus({ pingPong: false, feedback: 0.5, timeSeconds: 0.25 });
    const centredDelay = rec.delays[0];
    const [firstGen] = generationGains(ctx, bus);
    expect(firstGen.gain.value).toBeCloseTo(1, 9);

    const delayDisconnects = centredDelay.disconnectCalls;
    const genDisconnects = firstGen.disconnectCalls;

    bus.setParams({ pingPong: true });

    // The defect: `_build()` used to disconnect every node of the old build here, which truncated
    // whatever was still ringing in its delay line. Nothing of the outgoing build may be torn down
    // at toggle time.
    expect(centredDelay.disconnectCalls).toBe(delayDisconnects);
    expect(firstGen.disconnectCalls).toBe(genDisconnects);

    // …and it is still feeding the wet sum, so its repeats keep arriving while it fades.
    expect(firstGen.outgoing.some((edge) => edge.node === wetSumOf(ctx, bus))).toBe(true);

    // Faded from wherever its gain actually was to silence, over the delay-tied window.
    const fade = firstGen.gain.events;
    const pin = fade.findIndex((e) => e.type === "setValueAtTime");
    expect(pin).toBeGreaterThanOrEqual(0);
    const ramp = fade.slice(pin).find((e) => e.type === "linearRampToValueAtTime");
    expect(ramp?.value).toBe(0);
    expect(ramp?.time).toBeCloseTo(delayCrossfadeSeconds(0.25), 9);

    // The replacement fades in over the same window, so the two overlap instead of gapping: this is
    // the half that covers the new (empty) delay line's warm-up.
    const gens = generationGains(ctx, bus);
    expect(gens).toHaveLength(2);
    const entering = gens[1].gain.events;
    expect(entering[0]).toEqual({ type: "setValueAtTime", value: 0, time: 0 });
    expect(
      entering.some(
        (e) =>
          e.type === "linearRampToValueAtTime" &&
          e.value === 1 &&
          Math.abs(e.time - delayCrossfadeSeconds(0.25)) < 1e-9
      )
    ).toBe(true);
  });

  it("tears the retired build down once its fade has elapsed, on the audio clock", () => {
    const { ctx, rec, bus } = makeBus({ pingPong: false, timeSeconds: 0.25 });
    const oldDelay = rec.delays[0];
    const [firstGen] = generationGains(ctx, bus);
    bus.setParams({ pingPong: true });

    const fadeEnd = delayCrossfadeSeconds(0.25);

    // Mid-fade: still alive. A wall-clock timer would have freed it by now if the code used one.
    ctx.currentTime = fadeEnd / 2;
    bus.setParams({ feedback: 0.4 });
    expect(oldDelay.disconnectCalls).toBe(0);
    expect(firstGen.disconnectCalls).toBe(0);

    // Past the fade, the next parameter application frees it — the audio clock, not a timer.
    ctx.currentTime = fadeEnd;
    bus.setParams({ feedback: 0.45 });
    expect(oldDelay.disconnectCalls).toBe(1);
    expect(firstGen.disconnectCalls).toBe(1);
    // (`generationGains` cannot show the teardown: the shared fake counts `disconnect()` calls
    // rather than dropping the edges, by design. The call counts above are the observable.)

    // Sweeping again is a no-op, not a double disconnect.
    bus.setParams({ feedback: 0.5 });
    expect(oldDelay.disconnectCalls).toBe(1);
  });

  it("handles two toggles inside one fade window without cutting either build", () => {
    const { ctx, rec, bus } = makeBus({ pingPong: false, timeSeconds: 0.25 });
    const firstDelay = rec.delays[0];
    bus.setParams({ pingPong: true });
    ctx.currentTime = 0.05;
    const secondGen = generationGains(ctx, bus)[1];
    bus.setParams({ pingPong: false });

    // Both replaced builds are still connected and both were given their own fade ramp.
    expect(generationGains(ctx, bus)).toHaveLength(3);
    expect(firstDelay.disconnectCalls).toBe(0);
    expect(secondGen.disconnectCalls).toBe(0);
    for (const gen of generationGains(ctx, bus).slice(0, 2)) {
      const ramp = gen.gain.events.find(
        (e) => e.type === "linearRampToValueAtTime" && e.value === 0
      );
      expect(ramp, "every replaced build gets its own fade to zero").toBeTruthy();
    }

    // The second fade is measured from the second toggle, not the first.
    const secondRamp = secondGen.gain.events.find(
      (e) => e.type === "linearRampToValueAtTime" && e.value === 0
    );
    expect(secondRamp?.time).toBeCloseTo(0.05 + delayCrossfadeSeconds(0.25), 9);

    // Past both windows, one sweep retires both.
    ctx.currentTime = 0.05 + delayCrossfadeSeconds(0.25);
    bus.setParams({ feedback: 0.5 });
    expect(firstDelay.disconnectCalls).toBe(1);
    expect(secondGen.disconnectCalls).toBe(1);
  });

  it("disposes retiring builds that are still inside their fade window", () => {
    const { ctx, rec, bus } = makeBus({ pingPong: false, timeSeconds: 0.25 });
    const oldDelay = rec.delays[0];
    const [firstGen] = generationGains(ctx, bus);
    bus.setParams({ pingPong: true });
    // Still fading: nothing has been freed yet, so `dispose` is the only thing that can free it.
    expect(oldDelay.disconnectCalls).toBe(0);
    bus.dispose();
    expect(oldDelay.disconnectCalls).toBe(1);
    expect(firstGen.disconnectCalls).toBe(1);
  });

  it("ties the window to the delay time, with a floor and a ceiling", () => {
    // One 1/8 at 120 BPM — the library's most common echo — is the floor, and anything faster gets
    // the floor too: a shorter window would stop being click-free.
    expect(delayCrossfadeSeconds(0.25)).toBeCloseTo(0.25, 9);
    expect(delayCrossfadeSeconds(0.125)).toBeCloseTo(0.25, 9);
    expect(delayCrossfadeSeconds(DELAY_TIME_MIN_SEC)).toBeCloseTo(0.25, 9);
    // Longer delays get a proportionally longer handover, so the new line's first repeat is covered…
    expect(delayCrossfadeSeconds(0.4)).toBeCloseTo(0.4, 9);
    // …up to the ceiling, past which a switch stops feeling immediate.
    expect(delayCrossfadeSeconds(1)).toBeCloseTo(0.5, 9);
    expect(delayCrossfadeSeconds(DELAY_TIME_MAX_SEC)).toBeCloseTo(0.5, 9);
    // Non-finite inputs are clamped like every other time in this file, never returned as-is.
    expect(Number.isFinite(delayCrossfadeSeconds(NaN))).toBe(true);
    expect(delayCrossfadeSeconds(NaN)).toBeCloseTo(0.25, 9);
    expect(delayCrossfadeSeconds(Infinity)).toBeCloseTo(0.5, 9);
  });

  it("keeps the cross-fade deterministic across two identical toggle sequences", () => {
    const run = () => {
      const { ctx, bus } = makeBus({ pingPong: false, timeSeconds: 0.3 });
      bus.setParams({ pingPong: true });
      ctx.currentTime = 0.1;
      bus.setParams({ pingPong: false });
      return ctx.createdGains.map((g) => g.gain.events);
    };
    expect(run()).toEqual(run());
  });
});
