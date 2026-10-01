/**
 * **The WavExporter integration** — the half the plan-layer criteria do not touch.
 *
 * A review of the first cut deleted `WavExporter`'s audio-lane mixing block *and* its `track_id === "audio"` early return and watched every test stay green:
 * the criteria drove `scheduleOfflineAudioLanes` through the test's own sink, so neither the wrong sound (a synth percussion hit under the sample) nor the missing
 * render was pinned. These criteria render through the real `exportMasterWav` and assert on the **file it produces** and on the graph it built:
 *
 *   · the lane's music is in the encoded WAV (nonzero energy and peak), and the same render with no catalogue is pure silence — so deleting the mixing block
 *     cannot pass;
 *   · no oscillator is created for the lane at all — so deleting the early return cannot pass (it would voice the lane as a cowbell);
 *   · a muted lane is silent and reported;
 *   · `pan` reaches a `StereoPannerNode` and `gainDb` reaches the lane's `GainNode`;
 *   · a `track_id` spelled `"Audio"` is treated as an audio lane by the renderer, not silently skipped;
 *   · an empty catalogue still yields a report (with the catalogue problem), instead of `{}` with the lane unexplained.
 *
 * jsdom has no Web Audio, so a **mixing** `OfflineAudioContext` stands in: it decodes to a known signal and its `startRendering` sums every scheduled
 * `BufferSource` at its `start(when)` through its downstream `GainNode`, which is what the real graph does for a sample with no processing. Everything under test —
 * the dispatch, the early return, the mute rule, the panner, the lane scheduler, the master ceiling and the WAV encoder — is the production code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportMasterWav } from "../audio/WavExporter";
import { FakeAudioBuffer, FakeGainNode, FakeOfflineAudioContext, FakeStereoPannerNode } from "./helpers/fakeAudio";
import { resetGs1OfflineCapability, setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
import type { OfflineAudioLaneReport } from "../audio/offlineAudioLanes";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

const SAMPLE_RATE = 44100;
const LANE_FRAMES = 441;

/** The lane's own bytes: a cosine, so frame 0 is already nonzero and "did it start where asked" is readable. */
function laneSample(): FakeAudioBuffer {
  const buffer = new FakeAudioBuffer(1, LANE_FRAMES, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.cos((2 * Math.PI * i) / 64);
  return buffer;
}

/**
 * The stand-in graph. Its `startRendering` is the one piece of audio arithmetic the test owns — summing scheduled sources through their gain node — because the
 * real `OfflineAudioContext` is not in jsdom, and a zero-filled buffer would make every assertion vacuous.
 */
class MixingOfflineAudioContext extends FakeOfflineAudioContext {
  decoded = laneSample();

  decodeAudioData = async (): Promise<AudioBuffer> => this.decoded as unknown as AudioBuffer;

  startRendering(): Promise<FakeAudioBuffer> {
    const out = new FakeAudioBuffer(this.numberOfChannels, this.length, this.sampleRate);
    for (const source of this.createdBufferSources) {
      const buffer = source.buffer as FakeAudioBuffer | null;
      if (!buffer || source.started.length === 0 || typeof buffer.getChannelData !== "function") continue;
      const when = source.started[0]!.when;
      const at = Math.max(0, Math.round(when * this.sampleRate));
      const rate = source.playbackRate.value > 0 ? source.playbackRate.value : 1;
      const edge = source.outgoing[0]?.node;
      const gain = edge instanceof FakeGainNode ? edge.gain.value : 1;
      const data = buffer.getChannelData(0);
      for (let channel = 0; channel < out.numberOfChannels; channel += 1) {
        const target = out.getChannelData(channel);
        const limit = Math.min(target.length, at + Math.ceil(data.length / rate));
        for (let i = at; i < limit; i += 1) {
          const src = (i - at) * rate;
          const lo = Math.floor(src);
          const hi = Math.min(data.length - 1, lo + 1);
          const frac = src - lo;
          target[i] += (data[lo]! * (1 - frac) + data[hi]! * frac) * gain;
        }
      }
    }
    return Promise.resolve(out);
  }
}

/** 16-bit PCM as the exporter writes it, so the assertion is on the bytes a caller would download. */
function decodeWavBytes(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "data") {
      const frames = Math.floor(size / 2);
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) out[i] = view.getInt16(body + i * 2, true) / 32768;
      return out;
    }
    offset = body + size + (size % 2);
  }
  throw new Error("the encoded WAV has no data chunk");
}

const catalogue: SampleAsset[] = [
  { assetId: "probe-impulse", name: "Probe impulse", kind: "one-shot", seconds: 0.01, url: "https://example.test/probe.wav" },
];

/** One audio lane, with a note on step 0 so the synth dispatch *would* voice it if the early return were removed. */
function audioLanePattern(track: Partial<SequencerTrack> = {}): SequencerPattern {
  const steps = new Array(16).fill(0);
  steps[0] = 1;
  const pitch = new Array(16).fill(null);
  pitch[0] = 60;
  return {
    genre_id: "custom",
    bpm: 120,
    scale: "chromatic",
    resolution: "1/16",
    totalSteps: 16,
    tracks: [
      {
        track_id: "audio",
        name: "Sampler",
        instrument: "sampler",
        steps,
        pitch,
        sample: { assetId: "probe-impulse" },
        ...track,
      },
    ],
  } as SequencerPattern;
}

function installGraph(): () => void {
  const g = globalThis as { OfflineAudioContext?: unknown; window?: { OfflineAudioContext?: unknown } };
  const previousGlobal = g.OfflineAudioContext;
  const previousWindow = g.window?.OfflineAudioContext;
  g.OfflineAudioContext = MixingOfflineAudioContext;
  if (g.window) g.window.OfflineAudioContext = MixingOfflineAudioContext;
  return () => {
    g.OfflineAudioContext = previousGlobal;
    if (g.window) g.window.OfflineAudioContext = previousWindow;
  };
}

let restoreGraph: () => void;

beforeEach(() => {
  restoreGraph = installGraph();
  // The GS-1 capability probe is a second OfflineAudioContext; caching a verdict keeps `lastInstance` the render's own context.
  setGs1OfflineCapability("unmeasured");
  // The decoder fetches the asset's bytes; a stub keeps the network out of a unit test.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8), text: async () => "" }))
  );
});

afterEach(() => {
  restoreGraph();
  resetGs1OfflineCapability();
  vi.unstubAllGlobals();
});

describe("an audio lane through the real export path", () => {
  it("puts the lane's music in the exported WAV, and creates no synth voice for it", async () => {
    const pattern = audioLanePattern();
    let report: OfflineAudioLaneReport | undefined;
    const exported = await exportMasterWav(pattern, "custom", {
      audioLaneCatalogue: catalogue,
      onAudioLanes: (laneReport) => {
        report = laneReport;
      },
    });

    const samples = decodeWavBytes(new Uint8Array(await exported.blob.arrayBuffer()));
    const energy = samples.reduce((sum, value) => sum + value * value, 0);
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

    // ⭐ The file itself: deleting the mixing block leaves this at exactly zero.
    expect(energy).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(0.2);
    expect(report?.lanes.map((lane) => lane.name)).toEqual(["Sampler"]);
    expect(report?.problems).toEqual([]);

    /**
     * ⭐ And the wrong sound is gone: the lane has a note on step 0, so the `synthesizePercussion` fallthrough would have built a cowbell (two oscillators) here.
     * Deleting the early return cannot keep this at zero.
     */
    const ctx = MixingOfflineAudioContext.lastInstance as MixingOfflineAudioContext;
    expect(ctx.createdOscillators).toHaveLength(0);
    // Exactly one buffer source: the lane's own sample, carrying the buffer the loader decoded.
    expect(ctx.createdBufferSources).toHaveLength(1);
    expect(ctx.createdBufferSources[0]!.buffer).toBe(ctx.decoded);
    // Started at the lane's own offset (a flattened pattern is one section at bar 0) and at the lane's rate.
    expect(ctx.createdBufferSources[0]!.started[0]!.when).toBe(0);
    expect(ctx.createdBufferSources[0]!.playbackRate.value).toBe(1);
  });

  it("is silent when the catalogue resolves nothing — the same render with no lane audio", async () => {
    // The control: same pattern, same graph, empty catalogue. This is what "the mixing block did nothing" looks like, so the energy above cannot come from anywhere else.
    const pattern = audioLanePattern();
    let report: OfflineAudioLaneReport | undefined;
    const exported = await exportMasterWav(pattern, "custom", {
      audioLaneCatalogue: [],
      onAudioLanes: (laneReport) => {
        report = laneReport;
      },
    });

    const samples = decodeWavBytes(new Uint8Array(await exported.blob.arrayBuffer()));
    expect(samples.reduce((sum, value) => sum + Math.abs(value), 0)).toBe(0);
    // …and the reason is reported rather than the render being empty for no stated reason.
    expect(report?.lanes).toEqual([]);
    expect(report?.problems[0]?.reason).toMatch(/no sample "probe-impulse"/);
  });

  it("treats a track_id spelled \"Audio\" as an audio lane instead of silencing it unplanned", async () => {
    // `patternSchema` is `.passthrough()`, so this spelling is reachable caller data; the guard and the planner must agree on it, or the lane is neither rendered nor reported.
    const pattern = audioLanePattern({ track_id: "Audio" as SequencerTrack["track_id"] });
    let report: OfflineAudioLaneReport | undefined;
    const exported = await exportMasterWav(pattern, "custom", {
      audioLaneCatalogue: catalogue,
      onAudioLanes: (laneReport) => {
        report = laneReport;
      },
    });

    const samples = decodeWavBytes(new Uint8Array(await exported.blob.arrayBuffer()));
    expect(samples.reduce((sum, value) => sum + value * value, 0)).toBeGreaterThan(0);
    expect(report?.lanes).toHaveLength(1);
    expect(MixingOfflineAudioContext.lastInstance!.createdOscillators).toHaveLength(0);
  });

  it("does not sound a muted lane, and says it was not in the render", async () => {
    // The early return used to sit above the mute/solo test, so a muted lane was still mixed and still listed under `renderedAudioLanes`.
    const pattern = audioLanePattern({ mute: true });
    let report: OfflineAudioLaneReport | undefined;
    const exported = await exportMasterWav(pattern, "custom", {
      audioLaneCatalogue: catalogue,
      onAudioLanes: (laneReport) => {
        report = laneReport;
      },
    });

    const samples = decodeWavBytes(new Uint8Array(await exported.blob.arrayBuffer()));
    expect(samples.reduce((sum, value) => sum + Math.abs(value), 0)).toBe(0);
    expect(MixingOfflineAudioContext.lastInstance!.createdBufferSources).toHaveLength(0);
    expect(report?.lanes).toEqual([]);
    expect(report?.problems[0]?.reason).toMatch(/muted/);
  });

  it("routes the lane's own gain and pan into the graph", async () => {
    const gainDb = -6.0206;
    const volume = Math.pow(10, gainDb / 20);
    const pattern = audioLanePattern({ volume, pan: -1 });
    await exportMasterWav(pattern, "custom", { audioLaneCatalogue: catalogue });

    const ctx = MixingOfflineAudioContext.lastInstance as MixingOfflineAudioContext;
    const source = ctx.createdBufferSources.find((candidate) => candidate.buffer === ctx.decoded)!;
    const gainNode = source.outgoing[0]!.node as FakeGainNode;
    expect(gainNode).toBeInstanceOf(FakeGainNode);
    expect(gainNode.gain.value).toBeCloseTo(volume, 4);
    // `pan` is read by the lane path, not merely stored: the gain feeds a panner carrying the lane's position.
    const panner = gainNode.outgoing[0]!.node as FakeStereoPannerNode;
    expect(panner).toBeInstanceOf(FakeStereoPannerNode);
    expect(panner.pan.value).toBeCloseTo(-1, 6);
  });

  it("reports an unreadable catalogue instead of returning an empty, unexplained reply", async () => {
    // The graph render and the report are separate facts: an empty catalogue must still produce the reason it is empty.
    const pattern = audioLanePattern();
    let report: OfflineAudioLaneReport | undefined;
    await exportMasterWav(pattern, "custom", {
      audioLaneCatalogue: [],
      audioLaneCatalogueProblem: "the sample manifest could not be read at /tmp/none/manifest.json (ENOENT)",
      onAudioLanes: (laneReport) => {
        report = laneReport;
      },
    });
    expect(report?.catalogueProblem).toMatch(/\/tmp\/none\/manifest\.json/);
  });
});
