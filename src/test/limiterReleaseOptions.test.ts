/**
 * The limiter's release ballistics are reachable from the graph.
 *
 * `MasterLimiterOptions` declared `releaseFastMs`/`releaseSlowMs` and `public/limiterWorklet.js` honoured
 * them, but `createMasterLimiter` never put them in `processorOptions` — so a caller could pass them and
 * measure exactly no difference. That matters now: the release is what decides whether a *dip* in the
 * programme is refilled (the limiter's gain recovering while the sidechain is ducking), which is the
 * mechanism behind `duckErasedInMaster`, and A/B-ing it needs the knob to actually arrive.
 *
 * The assertion is on what the processor was *constructed with*, because that is the boundary where the
 * value used to disappear; absent options must stay absent so the worklet's own defaults remain the
 * shipped behaviour.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createMasterLimiter } from "../audio/MasterLimiter";
import { buildMasterGraph } from "../audio/masterGraph";
import { renderPatternOffline } from "../audio/WavExporter";
import { installFakeOfflineAudioContext, FakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { DrumPattern } from "../types/genre";

class FakeAudioWorkletNode {
  static instances: FakeAudioWorkletNode[] = [];
  port = { onmessage: null, postMessage: vi.fn() };
  connected: unknown[] = [];
  disconnected = 0;
  constructor(
    public readonly context: unknown,
    public readonly name: string,
    public readonly options: { processorOptions?: Record<string, unknown> } = {}
  ) {
    FakeAudioWorkletNode.instances.push(this);
  }
  connect(target: unknown) {
    this.connected.push(target);
  }
  disconnect() {
    this.disconnected += 1;
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

describe("the master limiter's release options reach the worklet", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("passes an override through, and leaves the defaults alone when there is none", async () => {
    restore = withFakeWorklet();
    const ctx = new FakeOfflineAudioContext(2, 128, 44100) as unknown as BaseAudioContext;

    const handle = createMasterLimiter(ctx, { releaseFastMs: 250, releaseSlowMs: 400 });
    await handle.ready;
    const overridden = FakeAudioWorkletNode.instances.at(-1)!;
    expect(overridden.name).toBe("groove-limiter-processor");
    expect(overridden.options.processorOptions?.releaseFastMs).toBe(250);
    expect(overridden.options.processorOptions?.releaseSlowMs).toBe(400);

    const plain = createMasterLimiter(ctx);
    await plain.ready;
    const defaults = FakeAudioWorkletNode.instances.at(-1)!;
    // `undefined`, not 80/400: the worklet owns its defaults, and duplicating them here is how the two drift.
    expect(defaults.options.processorOptions?.releaseFastMs).toBeUndefined();
    expect(defaults.options.processorOptions?.releaseSlowMs).toBeUndefined();
  });
});


describe("…and a render can ask for them", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  const PATTERN: DrumPattern = {
    genre_id: "deep-house",
    bpm: 124,
    swing: 0,
    scale: "minorPentatonic",
    tracks: [
      { name: "Kick", track_id: "kick", instrument: "kick", steps: [1, 0, 0, 0], volume: 0.9, pan: 0 },
      { name: "Snare", track_id: "snare", instrument: "snare", steps: [0, 0, 1, 0], volume: 0.8, pan: 0 },
    ],
  };

  it("carries them from the render options to the processor", async () => {
    // The end-to-end half: `renderPatternOffline` is the path every measurement and the export button use, so a
    // knob that stops at the graph's own options is a knob no probe can reach.
    restore = withFakeWorklet();
    await renderPatternOffline(PATTERN, { bars: 1, limiterReleaseFastMs: 250, limiterReleaseSlowMs: 400 });
    const node = FakeAudioWorkletNode.instances.at(-1)!;
    expect(node.options.processorOptions?.releaseFastMs).toBe(250);
    expect(node.options.processorOptions?.releaseSlowMs).toBe(400);

    await renderPatternOffline(PATTERN, { bars: 1 });
    const plain = FakeAudioWorkletNode.instances.at(-1)!;
    expect(plain.options.processorOptions?.releaseFastMs).toBeUndefined();
  });
});


describe("the bus compressor's release is reachable too", () => {
  /**
   * The graph does not expose its compressor (it is an internal stage), so the assertion is made where the value
   * lands: the fake context records every `createDynamicsCompressor()` and the test reads the node back. An
   * assertion with a `?? default` fallback would pass whether or not the option arrived, which is the shape of a
   * test that cannot fail.
   */
  const compressorReleaseFor = (options: Parameters<typeof buildMasterGraph>[1]) => {
    const ctx = new FakeOfflineAudioContext(2, 128, 44100);
    const made: Array<{ release: { value: number } }> = [];
    const original = ctx.createDynamicsCompressor.bind(ctx);
    (ctx as unknown as Record<string, unknown>).createDynamicsCompressor = () => {
      const node = original() as unknown as { release: { value: number } };
      made.push(node);
      return node;
    };
    buildMasterGraph(ctx as unknown as BaseAudioContext, options);
    return made;
  };

  it("uses the caller's value, and the shipped 220 ms when there is none", () => {
    /**
     * Wired for the same reason as the limiter's: A2 had to test whether the compressor's *release* is what
     * refills the sidechain duck. (Measured answer: it is not — 0.22 s, 0.5 s and 0.8 s all leave disco's duck at
     * −2.0 dB — but that is only knowable if the knob arrives.)
     */
    /**
     * The graph builds more than one `DynamicsCompressor`: the bus compressor, and the *fallback* limiter that
     * holds the ceiling until the worklet module loads. Asserting on the last one made this test read the fallback's
     * 0.25 s and "fail" — so the assertion is on the set of releases, which is what the option is about.
     */
    const releases = (options: Parameters<typeof buildMasterGraph>[1]) =>
      compressorReleaseFor(options).map((node) => node.release.value);

    const overridden = releases({ masterBusCompReleaseSec: 0.5 });
    expect(overridden.length, "the graph must build its compressors").toBeGreaterThan(0);
    expect(overridden).toContain(0.5);

    // …and the shipped value when there is no option, which is the number the plan's measurements quote.
    expect(releases({})).toContain(0.22);
    expect(releases({})).not.toContain(0.5);
  });
});
