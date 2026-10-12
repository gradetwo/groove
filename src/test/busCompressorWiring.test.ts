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

  it("⭐ prefers the shared worklet whenever the context has one, because the host node is what differed", async () => {
    /**
     * This used to assert the opposite, and its reason was that "the shipped path must be byte-for-byte what it
     * was". That was right while the host node cost nothing: in a browser it is Chromium's compressor and the
     * worklet is ours, so either is the same to a listener. It stopped being right when the headless host was
     * measured — there the host node is `node-web-audio-api`'s implementation, and it is where the 1.28 dB and
     * 1.774 LU of host difference come from. Parity needs one implementation on both hosts, the host's cannot be
     * changed without asking Chromium to change, so the shared one is ours and the browser path moves with it.
     * See `docs/HEADLESS_CORE_PLAN.md` §8.6.
     *
     * Two diagnostics were added while this was being worked out and both stayed: the factory's `catch` reports
     * why a swap failed, and the early return reports a handle disposed before the module loaded. Neither fires
     * for this case, which is the evidence that the swap succeeds rather than falling back.
     */
    restore = withFakeWorklet();
    const ctx = context();
    const graph = buildMasterGraph(ctx as unknown as BaseAudioContext, {});
    // ⭐ Await the swap, not the live read: `busCompressorKind()` is synchronous and returns `"node"` until the
    // module has loaded, which is indistinguishable from a fallback and is what made this look broken.
    const kind = await (graph as unknown as { busCompressorReady: () => Promise<string> }).busCompressorReady();
    expect(kind).toBe("worklet");
    expect(
      FakeAudioWorkletNode.instances.filter((n) => n.name === "groove-glue-compressor-processor").length
    ).toBeGreaterThan(0);
  });

  it("keeps a node when the context has no worklet at all, because compression must never be absent", async () => {
    // The other half, kept from the criterion above when it was flipped: a non-secure origin has no
    // `audioWorklet`, and the bus still has to be compressed — `kind` is what says which one it got.
    restore = withFakeWorklet();
    FakeOfflineAudioContext.workletsAvailable = false;
    const ctx = context();
    const graph = buildMasterGraph(ctx as unknown as BaseAudioContext, {});
    const kind = await (graph as unknown as { busCompressorKind: () => Promise<string> }).busCompressorKind();
    expect(kind).toBe("node");
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
