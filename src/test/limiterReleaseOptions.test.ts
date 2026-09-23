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
