import { describe, it, expect, vi } from "vitest";
import { EffectsRack } from "../audio/EffectsRack";

/**
 * A fake BaseAudioContext that records the routing graph and models
 * `disconnect()` (all outgoing edges). Filter bypass is asserted on the
 * topology of the graph, not on parameter values, because the fix routes the
 * signal around the filter rather than parking it at a "transparent" frequency.
 */
function createRecordingAudioContext() {
  const edges: Array<{ from: any; to: any }> = [];
  const nodes: any[] = [];
  let idCounter = 0;

  const createAudioParam = (initial = 0) => ({
    value: initial,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });

  const createNode = (type: string) => {
    const node: any = {
      _type: type,
      _id: ++idCounter,
      connect: vi.fn((dest: any) => {
        edges.push({ from: node, to: dest });
        return dest;
      }),
      disconnect: vi.fn(() => {
        for (let i = edges.length - 1; i >= 0; i--) {
          if (edges[i].from === node) edges.splice(i, 1);
        }
      }),
      start: vi.fn(),
      stop: vi.fn(),
    };

    if (type === "gain") {
      node.gain = createAudioParam(1.0);
    } else if (type === "biquadFilter") {
      node.type = "lowpass";
      node.frequency = createAudioParam(1000);
      node.Q = createAudioParam(1.0);
    } else if (type === "waveShaper") {
      node.curve = null;
      node.oversample = "none";
    } else if (type === "delay") {
      node.delayTime = createAudioParam(0.015);
    } else if (type === "oscillator") {
      node.type = "sine";
      node.frequency = createAudioParam(0.8);
    }

    nodes.push(node);
    return node;
  };

  const ctx: any = {
    currentTime: 0,
    sampleRate: 44100,
    _edges: edges,
    _nodes: nodes,
    createGain: vi.fn(() => createNode("gain")),
    createBiquadFilter: vi.fn(() => createNode("biquadFilter")),
    createWaveShaper: vi.fn(() => createNode("waveShaper")),
    createDelay: vi.fn(() => createNode("delay")),
    createOscillator: vi.fn(() => createNode("oscillator")),
    // createChannelMerger intentionally absent: exercises the fallback branch.
  };

  return ctx;
}

const nodeOfType = (ctx: any, type: string, index = 0) =>
  ctx._nodes.filter((n: any) => n._type === type)[index];
const edgesFrom = (ctx: any, node: any) => ctx._edges.filter((e: any) => e.from === node);
const edgesInto = (ctx: any, node: any) => ctx._edges.filter((e: any) => e.to === node);
const hasEdge = (ctx: any, from: any, to: any) =>
  ctx._edges.some((e: any) => e.from === from && e.to === to);

/** The rack creates the saturation shaper before the bitcrusher shaper. */
function rackNodes(ctx: any) {
  return {
    filter: nodeOfType(ctx, "biquadFilter"),
    shaper: nodeOfType(ctx, "waveShaper", 0),
    crusher: nodeOfType(ctx, "waveShaper", 1),
  };
}

describe("EffectsRack filter bypass routing (D1)", () => {
  it("keeps the disabled filter out of the signal path at construction", () => {
    const ctx = createRecordingAudioContext();
    const rack = new EffectsRack(ctx);
    const { filter, shaper } = rackNodes(ctx);

    // DEFAULT_FX_STATE.filterEnabled === false, so nothing may touch the filter.
    expect(edgesInto(ctx, filter)).toHaveLength(0);
    expect(edgesFrom(ctx, filter)).toHaveLength(0);

    // input -> saturation directly, exactly one path (no doubled signal).
    expect(hasEdge(ctx, rack.inputNode, shaper)).toBe(true);
    expect(edgesFrom(ctx, rack.inputNode)).toHaveLength(1);
    expect(edgesInto(ctx, shaper)).toHaveLength(1);

    rack.destroy();
  });

  it("honours an initially enabled filter at construction", () => {
    const ctx = createRecordingAudioContext();
    const rack = new EffectsRack(ctx, { filterEnabled: true });
    const { filter, shaper } = rackNodes(ctx);

    expect(hasEdge(ctx, rack.inputNode, filter)).toBe(true);
    expect(hasEdge(ctx, filter, shaper)).toBe(true);
    expect(hasEdge(ctx, rack.inputNode, shaper)).toBe(false);
    expect(edgesInto(ctx, shaper)).toHaveLength(1);

    rack.destroy();
  });

  it("routes through the filter only while enabled and restores bypass exactly once", () => {
    const ctx = createRecordingAudioContext();
    const rack = new EffectsRack(ctx);
    const { filter, shaper } = rackNodes(ctx);

    rack.setFilter(true, 4500, 3.5, "highpass");
    expect(hasEdge(ctx, rack.inputNode, filter)).toBe(true);
    expect(hasEdge(ctx, filter, shaper)).toBe(true);
    expect(hasEdge(ctx, rack.inputNode, shaper)).toBe(false);
    expect(edgesInto(ctx, shaper)).toHaveLength(1);

    rack.setFilter(false, 4500, 3.5, "highpass");
    expect(hasEdge(ctx, rack.inputNode, shaper)).toBe(true);
    expect(hasEdge(ctx, rack.inputNode, filter)).toBe(false);
    expect(hasEdge(ctx, filter, shaper)).toBe(false);
    expect(edgesFrom(ctx, filter)).toHaveLength(0);
    expect(edgesFrom(ctx, rack.inputNode)).toHaveLength(1);
    expect(edgesInto(ctx, shaper)).toHaveLength(1);

    // Repeated toggles must never accumulate a duplicate (doubled) path.
    for (let i = 0; i < 3; i++) {
      rack.setFilter(true, 1000, 2, "lowpass");
      rack.setFilter(false, 1000, 2, "lowpass");
    }
    expect(edgesFrom(ctx, rack.inputNode)).toHaveLength(1);
    expect(edgesInto(ctx, shaper)).toHaveLength(1);
    expect(edgesFrom(ctx, filter)).toHaveLength(0);

    // Re-enabling restores the original topology exactly (still single paths).
    rack.setFilter(true, 1000, 2, "lowpass");
    expect(edgesFrom(ctx, rack.inputNode)).toHaveLength(1);
    expect(edgesInto(ctx, shaper)).toHaveLength(1);
    expect(hasEdge(ctx, rack.inputNode, filter)).toBe(true);
    expect(hasEdge(ctx, filter, shaper)).toBe(true);

    rack.destroy();
  });

  it("does not park a disabled non-lowpass filter in the path (no 20 Hz trick)", () => {
    const ctx = createRecordingAudioContext();
    const rack = new EffectsRack(ctx);
    const { filter, shaper } = rackNodes(ctx);

    const types: BiquadFilterType[] = [
      "lowpass",
      "highpass",
      "bandpass",
      "lowshelf",
      "highshelf",
      "peaking",
      "notch",
      "allpass",
    ];

    for (const type of types) {
      rack.setFilter(false, 800, 4, type);
      // A disabled bandpass/peaking/shelf parked at 20 Hz is not transparent, so
      // it must be absent from the graph entirely.
      expect(edgesInto(ctx, filter)).toHaveLength(0);
      expect(edgesFrom(ctx, filter)).toHaveLength(0);
      expect(hasEdge(ctx, rack.inputNode, shaper)).toBe(true);
      expect(edgesInto(ctx, shaper)).toHaveLength(1);
      // Parameters still track the requested value; bypass is a re-route.
      expect(filter.frequency.value).toBe(800);
    }

    rack.destroy();
  });

  it("sets a non-none oversample on both wave shapers (D2)", () => {
    const ctx = createRecordingAudioContext();
    const rack = new EffectsRack(ctx);
    const { shaper, crusher } = rackNodes(ctx);

    expect(shaper.oversample).not.toBe("none");
    expect(crusher.oversample).not.toBe("none");

    rack.destroy();
  });

  it("disconnects the rewired filter edges on destroy()", () => {
    const ctx = createRecordingAudioContext();
    const rack = new EffectsRack(ctx);
    const { filter, shaper, crusher } = rackNodes(ctx);
    const output = rack.outputNode;
    const input = rack.inputNode;

    rack.setFilter(true, 1000, 2, "lowpass");
    rack.destroy();

    const chain = [input, output, filter, shaper, crusher];
    expect(ctx._edges.filter((e: any) => chain.includes(e.from))).toHaveLength(0);
  });
});
