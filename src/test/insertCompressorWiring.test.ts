/**
 * The channel strip's compressor is the **project's own worklet**, and this holds the wiring that made it so.
 *
 * ## What this file is the criterion for
 *
 * `ChannelStripDsp` used `ctx.createDynamicsCompressor()`; it now uses `public/glueCompressorWorklet.js` — the same
 * kernel the master bus runs — whenever the context's module has loaded. That substitution is the whole of the
 * headless renderer's band error (`docs/HEADLESS_CORE_PLAN.md` §8.9–§8.12): a `DynamicsCompressorNode` is the
 * *host's* compressor, and Chromium and `node-web-audio-api` do not agree on it, so the two hosts could not be the
 * same sound while a strip ran one. `npm run probe:headless` is the end-to-end criterion; this file is the part that
 * can be held in milliseconds, and it is written so that **removing the wiring turns it red** rather than merely
 * describing the wiring.
 *
 * ## The three facts it holds, and why each one is a fact rather than a reading of the source
 *
 *  1. a strip built on a context whose module is in **is** the worklet — and its settings reached the processor;
 *  2. a strip can still be **reconfigured** afterwards (§8.12's half: `setParams` posts a settings message, so a
 *     compressor that could only be configured once would go stale the first time anyone moved a knob);
 *  3. a strip built **without** the module — a jsdom double, a non-secure origin, a failed load, a caller that never
 *     asked — keeps the host node, because `new AudioWorkletNode` for an unregistered processor throws and an insert
 *     chain must never lose its compressor.
 *
 * ⚠️ **Fact 3 is the reverse experiment in miniature.** The parity probe's reverse run turns the same door off in the
 * application (`insertCompressorWorkletReady` returning false) and expects the three red assertions to come back; case
 * 3 is what says that door is the one that decides.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ChannelStrip } from "../audio/ChannelStripDsp";
import {
  ensureInsertCompressorWorklet,
  insertCompressorWorkletReady,
  INSERT_COMP_KNEE_DB,
} from "../audio/InsertCompressor";
import { GLUE_COMPRESSOR_PROCESSOR_NAME, GLUE_COMPRESSOR_WORKLET_URL } from "../audio/GlueCompressorFactory";
import { resolveTrackInsert, type TrackInsertParams } from "../data/trackInsert";

/* ------------------------------------------------------------------ a strip-shaped double */

class FakeNode {
  incoming: FakeNode[] = [];
  outgoing: FakeNode[] = [];
  connect(dest: FakeNode): FakeNode {
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

class FakeParam {
  value: number;
  events: Array<{ value: number; time: number }> = [];
  constructor(initial = 0) {
    this.value = initial;
  }
  setValueAtTime(value: number, time = 0) {
    this.events.push({ value, time });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time = 0) {
    return this.setValueAtTime(value, time);
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}
class FakeFilter extends FakeNode {
  type: string = "lowpass";
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  gain = new FakeParam(0);
}
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
  reduction = 0;
}
class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = "none";
}

/**
 * The one double this file needs beyond the graph: a context that can *answer* the worklet question.
 *
 * Deliberately not `src/test/helpers/fakeAudio.ts`. That double is the offline renderer's, and it does not model the
 * **one** behaviour this file is about — whether the module load has resolved, which is the synchronous fact a strip's
 * constructor reads. `addModule` here is a promise the test can resolve itself, so "before" and "after" are states the
 * test owns rather than a race it hopes for.
 */
class WorkletContext {
  currentTime = 0;
  sampleRate = 44100;
  readonly nodes: FakeNode[] = [];
  readonly compressors: FakeCompressor[] = [];
  readonly addModuleCalls: string[] = [];
  /** Set by a test that wants the module load to fail, which is a fallback, not an error. */
  failModuleLoad = false;
  private resolveModule: (() => void) | null = null;

  readonly audioWorklet = {
    addModule: (url: string): Promise<void> => {
      this.addModuleCalls.push(url);
      return new Promise<void>((resolve, reject) => {
        this.resolveModule = () => (this.failModuleLoad ? reject(new Error("module failed to load")) : resolve());
      });
    },
  };

  /** Completes the pending `addModule`, so the *synchronous* readiness fact becomes true. */
  async completeModuleLoad(): Promise<void> {
    this.resolveModule?.();
    // Two turns: the promise's own `then` (which records `loaded`) and the `ensure…` caller's.
    await Promise.resolve();
    await Promise.resolve();
  }

  createGain() {
    const node = new FakeGain();
    this.nodes.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new FakeFilter();
    this.nodes.push(node);
    return node;
  }
  createDynamicsCompressor() {
    const node = new FakeCompressor();
    this.compressors.push(node);
    this.nodes.push(node);
    return node;
  }
  createWaveShaper() {
    const node = new FakeShaper();
    this.nodes.push(node);
    return node;
  }
}

class FakeAudioWorkletNode extends FakeNode {
  static instances: FakeAudioWorkletNode[] = [];
  /** Processor names this host has registered — `addModule` is what registers one, exactly like the real host. */
  static registered = new Set<string>();
  static posted: unknown[] = [];
  readonly name: string;
  readonly processorOptions: Record<string, unknown>;
  readonly port: { postMessage: (data: unknown) => void; onmessage: ((event: { data: unknown }) => void) | null };
  readonly context: unknown;

  constructor(ctx: unknown, name: string, options?: { processorOptions?: Record<string, unknown> }) {
    super();
    /**
     * The behaviour that makes case 3 necessary rather than defensive: the real host throws here, and it is why the
     * strip asks a *synchronous* question instead of building a node and hoping.
     */
    if (!FakeAudioWorkletNode.registered.has(name)) {
      throw new Error(`InvalidStateError: processor '${name}' is not registered`);
    }
    this.context = ctx;
    this.name = name;
    this.processorOptions = options?.processorOptions ?? {};
    this.port = {
      postMessage: (data: unknown) => {
        FakeAudioWorkletNode.posted.push(data);
      },
      onmessage: null,
    };
    FakeAudioWorkletNode.instances.push(this);
  }

  /** Delivers a reduction report to the main thread, the way the processor's `port.postMessage` does. */
  emit(data: unknown): void {
    this.port.onmessage?.({ data });
  }
}

const enabled = (overrides: Partial<TrackInsertParams> = {}): TrackInsertParams => ({
  ...resolveTrackInsert("kick"),
  ...overrides,
});

let originalWorkletNode: unknown;
let originalRegistered: Set<string>;

beforeEach(() => {
  originalWorkletNode = (globalThis as Record<string, unknown>).AudioWorkletNode;
  (globalThis as Record<string, unknown>).AudioWorkletNode = FakeAudioWorkletNode;
  originalRegistered = new Set(FakeAudioWorkletNode.registered);
  FakeAudioWorkletNode.registered = new Set([GLUE_COMPRESSOR_PROCESSOR_NAME]);
  FakeAudioWorkletNode.instances = [];
  FakeAudioWorkletNode.posted = [];
});

afterEach(() => {
  (globalThis as Record<string, unknown>).AudioWorkletNode = originalWorkletNode;
  FakeAudioWorkletNode.registered = originalRegistered;
});

/* ------------------------------------------------------------------ the wiring */

describe("the channel strip's compressor is the shared worklet when the context has it", () => {
  it("⭐ builds the project's own processor, with the strip's own parameters, once the module is in", async () => {
    const ctx = new WorkletContext();
    const asCtx = ctx as unknown as BaseAudioContext;

    // Before the module resolves, nothing claims to be ready.
    expect(insertCompressorWorkletReady(asCtx), "no module is in yet").toBe(false);

    const loading = ensureInsertCompressorWorklet(asCtx);
    expect(ctx.addModuleCalls, "the module the bus uses, not a second copy of the file").toEqual([
      GLUE_COMPRESSOR_WORKLET_URL,
    ]);
    expect(insertCompressorWorkletReady(asCtx), "still loading, so still not ready").toBe(false);
    await ctx.completeModuleLoad();
    await expect(loading).resolves.toBe(true);
    expect(insertCompressorWorkletReady(asCtx)).toBe(true);

    const params = enabled({
      compEnabled: true,
      compThresholdDb: -12,
      compRatio: 4,
      compAttackSec: 0.012,
      compReleaseSec: 0.12,
      compMakeupDb: 3,
    });
    const strip = new ChannelStrip(asCtx, params);

    expect(strip.compressorKind(), "the strip is on the project's compressor, not the host's").toBe("worklet");
    expect(ctx.compressors, "and no host DynamicsCompressorNode was built for it").toHaveLength(0);

    const node = FakeAudioWorkletNode.instances.at(-1)!;
    expect(node.name).toBe(GLUE_COMPRESSOR_PROCESSOR_NAME);
    expect(node.processorOptions).toMatchObject({
      thresholdDb: -12,
      kneeDb: INSERT_COMP_KNEE_DB,
      ratio: 4,
      attackSec: 0.012,
      releaseSec: 0.12,
      /**
       * ⚠️ **Zero, and this is the assertion that keeps the gain staging where it was.** The strip has a *separate*
       * makeup gain node on purpose (`ChannelStripDsp`'s header); letting the worklet also apply `compMakeupDb` would
       * apply it twice. The bus does the opposite, because `DynamicsCompressorNode` has no makeup of its own.
       */
      makeupDb: 0,
      /** And the bus's release hold is a glue-stage feature, not a channel-strip one. */
      holdMs: 0,
      sampleRate: 44100,
      reportReduction: true,
    });
    /**
     * The strip's own makeup node still carries the value — the worklet is the only thing that changed, so
     * `compMakeupDb` must still be auditable exactly where the header says it is.
     */
    const makeup = ctx.nodes.filter((n): n is FakeGain => n instanceof FakeGain);
    expect(makeup.some((g) => Math.abs(g.gain.value - Math.pow(10, 3 / 20)) < 1e-9)).toBe(true);
  });

  it("⭐ still reconfigures it after construction, which is the half §8.12 added the message road for", async () => {
    const ctx = new WorkletContext();
    const asCtx = ctx as unknown as BaseAudioContext;
    const loading = ensureInsertCompressorWorklet(asCtx);
    await ctx.completeModuleLoad();
    await loading;

    const strip = new ChannelStrip(asCtx, enabled({ compEnabled: true, compThresholdDb: -12, compRatio: 4 }));
    FakeAudioWorkletNode.posted = [];

    // A knob moves: `setParams` is what the console and the genre applier call.
    strip.setParams({ compThresholdDb: -24, compRatio: 8, compReleaseSec: 0.4 });

    expect(FakeAudioWorkletNode.posted, "the live worklet hears about the change").toHaveLength(1);
    expect(FakeAudioWorkletNode.posted[0]).toMatchObject({
      thresholdDb: -24,
      ratio: 8,
      releaseSec: 0.4,
      kneeDb: INSERT_COMP_KNEE_DB,
      makeupDb: 0,
    });
  });

  it("⭐ reads the reduction the processor reports, so the strip's meter survives the swap", async () => {
    const ctx = new WorkletContext();
    const asCtx = ctx as unknown as BaseAudioContext;
    const loading = ensureInsertCompressorWorklet(asCtx);
    await ctx.completeModuleLoad();
    await loading;

    const strip = new ChannelStrip(asCtx, enabled({ compEnabled: true }));
    const node = FakeAudioWorkletNode.instances.at(-1)!;
    expect(strip.getGainReductionDb(), "nothing reported yet").toBe(0);

    // The processor reports a non-positive dB, the same sign `DynamicsCompressorNode.reduction` uses.
    node.emit({ type: "reduction", reductionDb: -6.5 });
    expect(strip.getCompressorReductionDb()).toBeCloseTo(-6.5, 6);
    expect(strip.getGainReductionDb(), "a meter shows the magnitude").toBeCloseTo(6.5, 6);

    // A bypassed strip is unwired and receives no blocks, so its last report must not be shown as live.
    strip.setParams({ compEnabled: false });
    expect(strip.getGainReductionDb()).toBe(0);

    // A malformed or foreign message is not trusted.
    node.emit({ type: "somethingElse", reductionDb: -30 });
    node.emit({ type: "reduction", reductionDb: Number.NaN });
    strip.setParams({ compEnabled: true });
    expect(strip.getGainReductionDb()).toBeCloseTo(6.5, 6);
  });
});

/* ------------------------------------------------------------------ the reverse */

describe("a strip keeps the host node unless the worklet is really available", () => {
  it("⚠️ uses the host node when nobody asked for the module, exactly as before", () => {
    const ctx = new WorkletContext();
    const strip = new ChannelStrip(ctx as unknown as BaseAudioContext, enabled({ compEnabled: true }));

    expect(strip.compressorKind()).toBe("node");
    expect(ctx.compressors, "the host compressor is the fallback, not a failure").toHaveLength(1);
    expect(ctx.addModuleCalls, "and nothing was fetched behind the caller's back").toEqual([]);
    expect(FakeAudioWorkletNode.instances).toHaveLength(0);
  });

  it("⚠️ uses the host node when the module failed to load — a flake must not cost the track its compressor", async () => {
    const ctx = new WorkletContext();
    ctx.failModuleLoad = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const loading = ensureInsertCompressorWorklet(ctx as unknown as BaseAudioContext);
      await ctx.completeModuleLoad();
      await expect(loading).resolves.toBe(false);
      expect(insertCompressorWorkletReady(ctx as unknown as BaseAudioContext)).toBe(false);

      const strip = new ChannelStrip(ctx as unknown as BaseAudioContext, enabled({ compEnabled: true }));
      expect(strip.compressorKind()).toBe("node");
      expect(ctx.compressors).toHaveLength(1);
      // Not silent about it: the fallback is reported once, the way the bus factory reports its own.
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("⚠️ asks for the module once per context, however many strips are built", async () => {
    const ctx = new WorkletContext();
    const asCtx = ctx as unknown as BaseAudioContext;
    // A four-track render builds four strips; the module is one file.
    const loads = [ensureInsertCompressorWorklet(asCtx), ensureInsertCompressorWorklet(asCtx), ensureInsertCompressorWorklet(asCtx)];
    await ctx.completeModuleLoad();
    await Promise.all(loads);
    for (let i = 0; i < 4; i += 1) new ChannelStrip(asCtx, enabled({ compEnabled: true }));
    expect(ctx.addModuleCalls).toHaveLength(1);
    expect(FakeAudioWorkletNode.instances).toHaveLength(4);
  });
});
