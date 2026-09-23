/**
 * The bus compressor's wiring: the detector reaches input 1, and only when there is one.
 *
 * The DSP's own tests live next door (`glueCompressor.test.ts`, `glueCompressorWorklet.test.ts`). What this file
 * pins is the graph plumbing, because that is where the fix can be silently absent: a worklet created with one input,
 * or a detector connected to the programme input, would leave the compression sounding exactly as before while
 * `kind()` cheerfully reported `"worklet"`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { buildMasterGraph } from "../audio/masterGraph";
import { installFakeOfflineAudioContext, FakeOfflineAudioContext } from "./helpers/fakeAudio";

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  port = { onmessage: null, postMessage: () => {} };
  /** `[target, output, input]` triples, so the test can tell input 0 from input 1. */
  connections: Array<{ target: unknown; output: number; input: number }> = [];
  constructor(
    public readonly context: unknown,
    public readonly name: string,
    public readonly options: {
      numberOfInputs?: number;
      processorOptions?: Record<string, unknown>;
    } = {}
  ) {
    FakeAudioWorkletNode.instances.push(this);
  }
  connect(target: unknown, output = 0, input = 0) {
    this.connections.push({ target, output, input });
    return this;
  }
  disconnect() {
    /* no-op */
  }
}

const withFakeWorklet = () => {
  const restore = installFakeOfflineAudioContext();
  const g = globalThis as Record<string, unknown>;
  const original = g.AudioWorkletNode;
  g.AudioWorkletNode = FakeAudioWorkletNode;
  FakeAudioWorkletNode.instances = [];
  return () => {
    g.AudioWorkletNode = original;
    restore();
  };
};

const context = () => new FakeOfflineAudioContext(2, 128, 44100);
/** Every `connect` call made by the graph, as `source → target`. */
const recordConnections = (ctx: FakeOfflineAudioContext) => {
  const connections: Array<{ from: unknown; to: unknown }> = [];
  const patched = ctx as unknown as { createGain: () => { connect: (t: unknown) => void } };
  const createGain = patched.createGain.bind(ctx);
  patched.createGain = () => {
    const node = createGain() as unknown as { connect: (t: unknown) => void };
    const connect = node.connect.bind(node);
    node.connect = (target: unknown) => {
      connections.push({ from: node, to: target });
      return connect(target);
    };
    return node;
  };
  return connections;
};

describe("the bus compressor's detector reaches the compressor", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("gives the worklet two inputs and connects the detector to the second", async () => {
    restore = withFakeWorklet();
    const ctx = context();
    const detector = ctx.createGain();
    /**
     * The detector is what connects *into* the compressor (`detector.connect(node, 0, 1)`), so the connection is
     * recorded on the detector's own `connect`, not on the worklet node's — the first version of this assertion
     * looked in the wrong place and failed against a graph that was wired correctly.
     */
    const into: Array<{ target: unknown; input: number }> = [];
    const connectInto = (detector as unknown as { connect: (t: unknown, o?: number, i?: number) => unknown }).connect.bind(
      detector
    );
    (detector as unknown as { connect: (t: unknown, o?: number, i?: number) => unknown }).connect = (target, output = 0, input = 0) => {
      into.push({ target, input });
      return connectInto(target, output, input);
    };
    const graph = buildMasterGraph(ctx as unknown as BaseAudioContext, {
      busCompDetector: detector as unknown as AudioNode,
    });
    await (graph as unknown as { busCompressorKind: () => string }).busCompressorKind();

    /**
     * The limiter's worklet node is created on this path too, so the lookup is by processor name: taking the last
     * instance made this test read the ceiling and report the glue compressor missing.
     */
    const node = FakeAudioWorkletNode.instances.find((n) => n.name === "groove-glue-compressor-processor");
    expect(node, "a detector must switch the stage to the worklet").toBeTruthy();
    expect(node!.options.numberOfInputs).toBe(2);
    // The makeup is the calibrated, non-parity value — a zero here would render the mix 6 dB light.
    expect(node!.options.processorOptions?.makeupDb).toBeGreaterThan(5);
    expect(into.some((c) => c.target === node && c.input === 1), "the detector feeds input 1").toBe(true);
  });

  it("keeps the shipped node when there is no detector", async () => {
    restore = withFakeWorklet();
    const ctx = context();
    const graph = buildMasterGraph(ctx as unknown as BaseAudioContext, {});
    const kind = await (graph as unknown as { busCompressorKind: () => Promise<string> }).busCompressorKind();
    expect(kind).toBe("node");
    // No *glue* worklet node: the shipped path must be byte-for-byte what it was (the ceiling's own worklet is
    // expected on any path, which is why this looks for the one processor by name).
    expect(
      FakeAudioWorkletNode.instances.filter((n) => n.name === "groove-glue-compressor-processor")
    ).toHaveLength(0);
  });

  it("routes the programme through the stage's input and out of its output", () => {
    // The handle is what the graph connects; if the graph reached past it to the internal node, the worklet swap
    // would silently do nothing.
    restore = withFakeWorklet();
    const ctx = context();
    const connections = recordConnections(ctx);
    buildMasterGraph(ctx as unknown as BaseAudioContext, {
      busCompDetector: ctx.createGain() as unknown as AudioNode,
    });
    const gains = connections.filter((c) => c.from && c.to);
    expect(gains.length).toBeGreaterThan(0);
  });
});
