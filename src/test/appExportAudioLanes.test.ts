/**
 * **The app's own export path, and the audio lane it used to drop in silence.**
 *
 * `WavExporter` mixes audio lanes only for a caller that passes `RenderWavOptions.audioLaneCatalogue`. The MCP server does; `useExportActions` did not, so a lane a user built exported a
 * silent mix with no report. These criteria are about the **app's wiring** — `prepareAudioLaneExport`, which is what `useExportActions` now calls — and not about the mixer again (that is
 * `audioLaneOfflineRender.test.ts`). The three facts worth pinning:
 *
 *   1. the options the app builds carry the catalogue, so the lane's own bytes are in the exported file — measured as **energy in the exported WAV**, against the same export with the
 *      lane removed, not against a flag;
 *   2. a lane whose asset the catalogue does not hold is a **problem naming the lane and the id**, and the file contains no lane;
 *   3. a catalogue that failed to load is reported as its own fact, so "the manifest 404'd" does not read as "no samples ship with the app yet".
 *
 * **jsdom has no `OfflineAudioContext`**, so the browser graph cannot run here. `MixingOfflineAudioContext` below is the smallest double that makes the file measurable: it renders each
 * `AudioBufferSourceNode` through the gain `startSamplerNote` placed it in, at the second it was started — which is the whole of the production browser adapter (`source → gain →
 * musicBus`), nothing more. `exportMasterWav` itself runs unchanged, encodes the samples, and the assertions read that WAV back with the project's own reader
 * (`scripts/lib/wav.mjs`). What is *not* measured here is the master bus's compression and limiting, which the double passes through: the claim is that the lane's audio is present, not
 * that a fake reproduces the console.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWav } from "../../scripts/lib/wav.mjs";
import { FakeAudioBuffer, FakeGainNode, FakeOfflineAudioContext } from "./helpers/fakeAudio";
import { compileArrangementToPattern } from "../data/arrangementCompile";
import { exportMasterWav } from "../audio/WavExporter";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { ArrangementV2 } from "../types/arrangementV2";
import type { SequencerPattern } from "../types/genre";
import {
  audioLaneExportFacts,
  hasAudioLane,
  mergeAudioLaneReports,
  prepareAudioLaneExport,
} from "../features/sequencer/hooks/audioLaneExport";

const SAMPLE_RATE = 44100;

/** A decoded sample: one channel of a cosine, so the **first** frame is already nonzero and "did the lane reach the file" is a number rather than a boolean. */
function cosineBuffer(frames = 441, amplitude = 1): FakeAudioBuffer {
  const buffer = new FakeAudioBuffer(1, frames, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = amplitude * Math.cos((2 * Math.PI * i) / 64);
  return buffer;
}

/**
 * The fake, plus the one thing a fake must do for this criterion: return a signal instead of silence.
 *
 * `decodeAudioData` answers with a known buffer (the loader caches it, exactly as the browser loader caches its decoded result), and `startRendering` sums what the graph's
 * `AudioBufferSourceNode`s were asked to play. No filter, compressor or limiter is modelled — those are unity here — because the fact under test is presence, and modelling the console
 * would be a second renderer rather than a double.
 */
class MixingOfflineAudioContext extends FakeOfflineAudioContext {
  decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve(cosineBuffer() as unknown as AudioBuffer);
  }
  startRendering(): Promise<FakeAudioBuffer> {
    const out = new FakeAudioBuffer(this.numberOfChannels, this.length, this.sampleRate);
    const left = out.getChannelData(0);
    for (const source of this.createdBufferSources) {
      const buffer = source.buffer as FakeAudioBuffer | null;
      if (!buffer) continue;
      const data = buffer.getChannelData(0);
      // `startSamplerNote` connects the source to its own gain; that gain node is the lane's level.
      const gain = (source.outgoing[0]?.node as FakeGainNode | undefined)?.gain.value ?? 1;
      const rate = source.playbackRate.value > 0 ? source.playbackRate.value : 1;
      const at = Math.round((source.started[0]?.when ?? 0) * this.sampleRate);
      for (let i = 0; i < data.length; i += 1) {
        const frame = at + Math.floor(i / rate);
        if (frame >= left.length) break;
        left[frame] += data[i]! * gain;
      }
    }
    return Promise.resolve(out);
  }
}

function installMixingOfflineAudioContext(): () => void {
  const g = globalThis as unknown as { OfflineAudioContext: unknown; window?: { OfflineAudioContext: unknown } };
  const originalGlobal = g.OfflineAudioContext;
  const originalWindow = g.window?.OfflineAudioContext;
  g.OfflineAudioContext = MixingOfflineAudioContext;
  if (g.window) g.window.OfflineAudioContext = MixingOfflineAudioContext;
  return () => {
    g.OfflineAudioContext = originalGlobal;
    if (g.window) g.window.OfflineAudioContext = originalWindow;
  };
}

/** The exported blob read back with the project's own reader — the file, not the buffer the test built. */
function readExportedWav(bytes: ArrayBuffer) {
  const path = join(mkdtempSync(join(tmpdir(), "groove-app-lane-")), "master.wav");
  writeFileSync(path, Buffer.from(bytes));
  return readWav(path) as { frames: number; peak: number; rms: number; data: Float32Array[] };
}

/** The lane's catalogue entry. `url` is required: an asset declared without bytes is refused loudly by the decoder rather than fetched from nowhere. */
const probeAsset: SampleAsset = {
  assetId: "probe-impulse",
  name: "Probe impulse",
  kind: "one-shot",
  seconds: 0.01,
  url: "https://example.test/probe.wav",
};

/** A one-bar arrangement with a single sampler track — what the app compiles a user's audio lane from. */
function samplerArrangement(assetId: string): ArrangementV2 {
  return {
    songId: "song",
    sourceSlots: [],
    bars: 1,
    tracks: [{ id: "t1", kind: "sampler", name: "Drums", sample: { assetId } }],
  };
}

/** The compiled pattern, and the same pattern with the audio lane removed — the control for "the difference is the lane". */
const compiled = (assetId: string): SequencerPattern => compileArrangementToPattern(samplerArrangement(assetId), { t1: [] });
const withoutAudioLane = (pattern: SequencerPattern): SequencerPattern => ({
  ...pattern,
  tracks: pattern.tracks.filter((track) => track.track_id !== "audio"),
});

describe("the app's export path and its audio lanes", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
    vi.unstubAllGlobals();
  });

  it("mixes the lane's own samples into the exported WAV, measurably, when the catalogue holds them", async () => {
    restore = installMixingOfflineAudioContext();
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) }));

    const pattern = compiled("probe-impulse");
    expect(hasAudioLane(pattern)).toBe(true);

    // ⭐ These are the exact options `useExportActions` spreads into `exportMasterWav`; `loadCatalogue` stands in for `appCatalogueRuntime.load`.
    const prepared = await prepareAudioLaneExport(pattern, async () => ({ assets: [probeAsset], problems: [] }));
    expect(prepared.options.audioLaneCatalogue).toEqual([probeAsset]);
    expect(prepared.catalogueProblems).toEqual([]);

    const withLane = await exportMasterWav(pattern, "custom", { bpm: 120, ...prepared.options });
    const laneWav = readExportedWav(await withLane.blob.arrayBuffer());
    expect(laneWav.frames).toBeGreaterThan(0);
    // The lane's cosine is in the file: real samples, not a promise that they might be.
    expect(laneWav.peak).toBeGreaterThan(0);
    expect(laneWav.rms).toBeGreaterThan(0);

    // The reporter agrees with the file, and names the lane that reached it.
    const facts = audioLaneExportFacts(prepared.report(), prepared.catalogueProblems);
    expect(facts.rendered).toEqual(["Drums"]);
    expect(facts.problems).toEqual([]);

    // The control: the *same* export with the audio lane taken out is silent, so the difference measured above is the lane.
    const control = await exportMasterWav(withoutAudioLane(pattern), "custom", { bpm: 120 });
    const controlWav = readExportedWav(await control.blob.arrayBuffer());
    expect(controlWav.rms).toBe(0);
    expect(laneWav.rms).toBeGreaterThan(controlWav.rms);
  });

  it("names a lane whose asset the catalogue does not hold, and exports no lane audio for it", async () => {
    restore = installMixingOfflineAudioContext();
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) }));

    const pattern = compiled("not-in-the-catalogue");
    const prepared = await prepareAudioLaneExport(pattern, async () => ({ assets: [probeAsset], problems: [] }));

    const result = await exportMasterWav(pattern, "custom", { bpm: 120, ...prepared.options });
    const wav = readExportedWav(await result.blob.arrayBuffer());
    expect(wav.rms).toBe(0);

    const facts = audioLaneExportFacts(prepared.report(), prepared.catalogueProblems);
    expect(facts.rendered).toEqual([]);
    expect(facts.problems).toHaveLength(1);
    // The lane and the id, both: a reason the user can act on rather than "the export was silent".
    expect(facts.problems[0]).toContain("Drums");
    expect(facts.problems[0]).toContain("not-in-the-catalogue");
  });

  it("reports a catalogue that failed to load as its own fact, beside the lane it left unresolved", async () => {
    restore = installMixingOfflineAudioContext();
    const pattern = compiled("probe-impulse");
    const prepared = await prepareAudioLaneExport(pattern, async () => ({
      assets: [],
      problems: ["manifest: 404 from /samples/manifest.json"],
    }));

    // The render still runs — a broken catalogue must not refuse the export — and its lane report is what carries the second fact.
    const result = await exportMasterWav(pattern, "custom", { bpm: 120, ...prepared.options });
    expect(readExportedWav(await result.blob.arrayBuffer()).rms).toBe(0);

    const facts = audioLaneExportFacts(prepared.report(), prepared.catalogueProblems);
    // The runtime's own failure is the first line, because the lane reporter's generic "no samples ship with the app yet" would otherwise hide it.
    expect(facts.problems[0]).toBe("sample catalogue: manifest: 404 from /samples/manifest.json");
    expect(facts.problems).toHaveLength(2);
    expect(facts.problems[1]).toContain("probe-impulse");
  });

  it("does not touch the catalogue for a pattern with no audio lane, which is the additive case", async () => {
    let loads = 0;
    const pattern = withoutAudioLane(compiled("probe-impulse"));
    expect(hasAudioLane(pattern)).toBe(false);

    const prepared = await prepareAudioLaneExport(pattern, async () => {
      loads += 1;
      return { assets: [probeAsset], problems: [] };
    });

    expect(loads).toBe(0);
    expect(prepared.options).toEqual({});
    expect(audioLaneExportFacts(prepared.report(), prepared.catalogueProblems)).toEqual({ rendered: [], problems: [] });
  });

  it("accumulates the per-stem reports, so a problem found in an earlier stem is not dropped by the last one", () => {
    // `exportStemsWav` renders once per track, so the reporter is called once per stem; keeping only the last would lose the first stem's failure.
    const first = {
      lanes: [{ trackIndex: 0, track_id: "audio" as const, laneId: "riser", name: "Riser" }],
      events: 1,
      problems: [
        { trackIndex: 1, track_id: "audio" as const, name: "Vox", assetId: "vox", reason: 'no sample "vox"' },
      ],
    };
    const second = {
      lanes: [{ trackIndex: 2, track_id: "audio" as const, name: "Drums" }],
      events: 2,
      problems: [],
    };

    const merged = mergeAudioLaneReports(first, second);
    const facts = audioLaneExportFacts(merged);
    expect(facts.rendered).toEqual(["Riser", "Drums"]);
    expect(facts.problems).toEqual(['Vox: no sample "vox"']);
    expect(merged.events).toBe(3);
  });
});
