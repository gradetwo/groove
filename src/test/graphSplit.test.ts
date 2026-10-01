/**
 * The graph-split measurement seam: what it says is absent really is absent, and what it says is
 * unchanged really is unchanged.
 *
 * ## Why these criteria exist
 *
 * The seam exists so that `scripts/measure_graph_split.mjs` can attribute render cost to voices,
 * effects, sends and the limiter by rendering the same song with one part removed. A difference
 * between two renders is only evidence if the two renders really differ in exactly that part, and
 * "absent means what it always did" is only true if nobody can make a default flip. The probe's
 * numbers are CI-only and cannot be asserted here; the *graph* can, and it is the thing the probe
 * depends on.
 *
 * ## How the graph is read
 *
 * `FakeOfflineAudioContext` records every node it is asked to create, so a render leaves a
 * countable trace. The counts are read as deltas, not absolutes, because the master chain, the FX
 * rack and the impulse generator all contribute nodes that have nothing to do with the seam.
 * Where a part has exactly one creator in this codebase the absolute count is used instead, and
 * that is stated at the assertion: the reverb send bus is the only `createConvolver` caller.
 */
import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
import { afterEach, describe, expect, it } from "vitest";
import { buildMasterGraph } from "../audio/masterGraph";
import { renderPatternOffline, type RenderGraphSplit } from "../audio/WavExporter";
import type { MasterLimiterKind } from "../audio/MasterLimiter";
import type { SequencerPattern } from "../types/genre";
import {
  FakeAudioContext,
  FakeOfflineAudioContext,
  installFakeOfflineAudioContext,
} from "./helpers/fakeAudio";

/**
 * The offline GS-1 capability probe renders a throwaway context of its own, which would replace
 * `FakeOfflineAudioContext.lastInstance` with a context that is not the render under test. Cached
 * as satisfied at module scope, exactly as `trackSends.test.ts` does for the same reason; the
 * pattern below uses drum lanes only, so no GS-1 host is ever built.
 */
setGs1OfflineCapability("usable");

const TRACKS = 2;
const STEPS = 4;

function pattern(): SequencerPattern {
  const lane = (track_id: string, name: string) => ({
    track_id,
    name,
    instrument: "drum",
    steps: [1, 0, 1, 0],
    velocity: [100, 100, 100, 100],
    pitch: [0, 0, 0, 0],
    gate: [0.8, 0.8, 0.8, 0.8],
    volume: 0.8,
    pan: 0,
    sendA: 0.5,
    sendB: 0.3,
    mute: false,
    solo: false,
  });
  return {
    genre_id: "graph-split-test",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: STEPS,
    tracks: [lane("kick", "Kick"), lane("snare", "Snare")],
  } as unknown as SequencerPattern;
}

interface RenderTrace {
  gains: number;
  filters: number;
  oscillators: number;
  delays: number;
  convolvers: number;
  compressors: number;
  startedSources: number;
  limiterKind: MasterLimiterKind | null;
}

/** One render with the seam as given, and the trace its context left behind. */
async function render(graphSplit?: RenderGraphSplit): Promise<RenderTrace> {
  let limiterKind: MasterLimiterKind | null = null;
  await renderPatternOffline(pattern(), {
    graphSplit,
    onLimiterKind: (kind) => {
      limiterKind = kind;
    },
  });
  const ctx = FakeOfflineAudioContext.lastInstance;
  if (!ctx) throw new Error("the render left no fake context behind");
  return {
    gains: ctx.createdGains.length,
    filters: ctx.createdFilters.length,
    oscillators: ctx.createdOscillators.length,
    delays: ctx.createdDelays.length,
    convolvers: ctx.createdConvolvers.length,
    compressors: ctx.createdCompressors.length,
    startedSources: ctx.createdBufferSources.filter((source) => source.started.length > 0).length,
    limiterKind,
  };
}

describe("the graph-split seam · absent means the shipped graph", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("omitting graphSplit and passing all-true produce the same node trace", async () => {
    restore = installFakeOfflineAudioContext();
    const omitted = await render(undefined);
    const explicit = await render({ voices: true, effects: true, sends: true, limiter: true });
    expect(explicit).toEqual(omitted);
  });

  it("omitting graphSplit really does build every part", async () => {
    restore = installFakeOfflineAudioContext();
    const full = await render(undefined);
    // The reverb send bus is the only createConvolver caller in the codebase, so this is a direct
    // reading of "the sends are in the graph" rather than a count that has to be differenced.
    expect(full.convolvers).toBe(1);
    expect(full.delays).toBeGreaterThan(0);
    expect(full.oscillators).toBeGreaterThan(0);
    expect(full.filters).toBeGreaterThanOrEqual(4 * TRACKS);
    expect(full.limiterKind).not.toBe("none");
  });
});

describe("the graph-split seam · a named part really is left out", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("voices: false schedules no notes but builds the whole graph", async () => {
    restore = installFakeOfflineAudioContext();
    const full = await render(undefined);
    const silent = await render({ voices: false });

    expect(silent.oscillators).toBe(0);
    expect(silent.startedSources).toBe(0);
    // The graph is still the full one. Filters are not compared: the voices themselves build
    // filters, so that count *is* the thing this variant removes. The send bus (the only convolver
    // caller) and the ceiling are graph-only, so their equality is the "graph but no notes" claim.
    expect(silent.convolvers).toBe(full.convolvers);
    expect(silent.compressors).toBe(full.compressors);
    expect(silent.limiterKind).toBe(full.limiterKind);
  });

  it("effects: false leaves out exactly the per-track insert chains", async () => {
    restore = installFakeOfflineAudioContext();
    const full = await render(undefined);
    const dry = await render({ effects: false });

    // A ChannelStrip builds four biquads (HPF, low shelf, peaking, high shelf); nothing else in the
    // render creates filters per track, so this delta is the chain and only the chain.
    expect(full.filters - dry.filters).toBe(4 * TRACKS);
    // The rest of the graph is untouched by this variant.
    expect(dry.oscillators).toBe(full.oscillators);
    expect(dry.convolvers).toBe(full.convolvers);
  });

  it("sends: false leaves out the reverb and delay buses", async () => {
    restore = installFakeOfflineAudioContext();
    const full = await render(undefined);
    const dry = await render({ sends: false });

    expect(full.convolvers).toBe(1);
    expect(dry.convolvers).toBe(0);
    // The delay bus is the only creator of delay nodes whose count scales with the graph the seam
    // controls; the rack's own delays are constant across the two renders.
    expect(dry.delays).toBeLessThan(full.delays);
    // No per-track send tap is created for a bus that does not exist, so the gains drop too.
    expect(dry.gains).toBeLessThan(full.gains);
  });

  it("limiter: false reports no ceiling and builds none", async () => {
    restore = installFakeOfflineAudioContext();
    const full = await render(undefined);
    const bare = await render({ limiter: false });

    // "none" and not "fallback": a render with no ceiling must not be described as one with a
    // degraded ceiling, which is the distinction an export's warning text depends on.
    expect(bare.limiterKind).toBe("none");
    expect(full.limiterKind).not.toBe("none");
    // In this environment there is no `AudioWorkletNode`, so the ceiling is its compressor
    // fallback and its absence is exactly one compressor — the glue stages' and strips' own
    // compressors are constant across the two renders.
    expect(full.compressors - bare.compressors).toBe(1);
  });
});

describe("buildMasterGraph · the seam at the shared builder", () => {
  it("builds the sends and the ceiling by default", () => {
    const ctx = new FakeAudioContext();
    const graph = buildMasterGraph(ctx as unknown as BaseAudioContext, {});
    expect(graph.reverb).not.toBeNull();
    expect(graph.delay).not.toBeNull();
    expect(graph.limiter).not.toBeNull();
    expect(graph.limiterKind()).not.toBe("none");
    expect(ctx.createdConvolvers).toHaveLength(1);
  });

  it("returns null buses and no ceiling when asked", () => {
    const ctx = new FakeAudioContext();
    const graph = buildMasterGraph(ctx as unknown as BaseAudioContext, { sends: false, limiter: false });
    expect(graph.reverb).toBeNull();
    expect(graph.delay).toBeNull();
    expect(graph.limiter).toBeNull();
    expect(graph.limiterKind()).toBe("none");
    expect(graph.limiterLatencySeconds()).toBe(0);
    expect(ctx.createdConvolvers).toHaveLength(0);
    // Teardown must survive the absent parts, because `dispose()` runs on every engine teardown.
    expect(() => graph.dispose()).not.toThrow();
  });
});
