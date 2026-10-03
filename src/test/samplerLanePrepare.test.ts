/**
 * ⭐ **The two facts the owner asked for: "同一 asset 一次播放只请求一次、只解码一次", and "先就绪再播".**
 *
 * The measurement this pins, on `/genre/bebop`'s recorded lanes (v2.34.40, real network, the app's own modules):
 * **68 requests for 45 distinct files, 22 of them 404**, and on a second play of the same genre the loader — built fresh by
 * `createSamplerLanePlayback` on every press — paid for all 45 again at our layer. The 22 wrong ones are
 * `src/test/sfzIncludes.test.ts`'s business now; this file is the other half: **one loader, so a warm-up and a re-play cost nothing**.
 *
 * ## Why the criteria are shaped this way
 *
 * A criterion that only calls `prepareSamplerLanes` could pass while the production call sites still built a **new** loader per play — the
 * warm-up would be a second download rather than a cache hit, which is worse than not warming at all. So the cases below assert the pair:
 * the *same* loader is reused (nothing requested twice, nothing decoded twice), and a *different* loader really does pay again — which is
 * what makes the first assertion able to fail when the sharing is removed.
 */
import { describe, expect, it } from "vitest";
import { createSampleLoader } from "../audio/sampleLoader";
import { prepareSamplerLanes } from "../audio/samplerLanePrepare";
import { sampledAssetForLane } from "../data/sampledInstruments";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

/**
 * One lane the palette maps, with **five notes and three distinct pitches** — a bar that repeats notes, as a real bar does (a walking bass
 * plays the same note on several steps). The repetition is the point: without it, "asked once per distinct note" and "asked once per step"
 * are the same number and the criterion could not fail.
 */
const lane = {
  track_id: "lead",
  name: "Lead",
  instrument: "sax_lead",
  steps: [1, 1, 1, 1, 1, 0, 0, 0],
  pitch: [60, 60, 62, 60, 67, 0, 0, 0],
  pitches: [[60], [60], [62], [60], [67], [], [], []],
} as unknown as SequencerTrack;

const pattern = { totalSteps: 8, genre_id: "fixture", tracks: [lane] } as unknown as SequencerPattern;

/** The asset the palette names for that lane, wearing an SFZ the injected fetch will serve. */
const laneAssetId = sampledAssetForLane(lane)!;
const laneAsset: SampleAsset = {
  assetId: laneAssetId,
  name: "fixture sax",
  kind: "one-shot",
  seconds: 1,
  sfz: { url: "https://library.invalid/Prog.sfz", path: "Prog.sfz" },
};

/** A program whose three regions answer the three pitches, so a note resolves without a catalogue entry per sample. */
const PROGRAM = [
  "<control> default_path=Samples/",
  "<region> sample=a.wav key=60 pitch_keycenter=60",
  "<region> sample=b.wav key=62 pitch_keycenter=62",
  "<region> sample=c.wav key=67 pitch_keycenter=67",
].join("\n");

interface Counted {
  loader: ReturnType<typeof createSampleLoader>;
  programFetches: () => number;
  decodes: () => number;
}

/** A loader with counting seams: the two requests the measured defect was made of, and nothing else. */
function countingLoader(): Counted {
  let programFetches = 0;
  let decodes = 0;
  const loader = createSampleLoader(
    async () => {
      decodes += 1;
      return { duration: 1, length: 1, numberOfChannels: 1, sampleRate: 44100 } as unknown as AudioBuffer;
    },
    [laneAsset],
    async () => {
      programFetches += 1;
      return PROGRAM;
    }
  );
  return { loader, programFetches: () => programFetches, decodes: () => decodes };
}

describe("prepareSamplerLanes — the wait, and what it costs", () => {
  it("asks once per distinct note, not once per step, and reports the count it is waiting for", async () => {
    const calls: string[] = [];
    let loads = 0;
    const loader = {
      loadNote: async (assetId: string, pitch: number) => {
        loads += 1;
        calls.push(`${assetId}@${pitch}`);
        return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
      },
      load: async () => ({}) as AudioBuffer,
      decodes: () => loads,
    };
    const progress: number[] = [];
    const report = await prepareSamplerLanes({
      pattern,
      catalogue: [],
      loader,
      lanes: [{ sourceTrackId: "lead", lane }],
      onProgress: (p) => progress.push(p.loaded),
    });

    // Three distinct pitches across eight steps: three loads, and the total is known before the first one finishes.
    expect(report.total).toBe(3);
    expect(loads, "a repeated pitch must not be loaded once per step").toBe(3);
    // In the plan's own order — the order the report's problems are read in, and the order the progress ticks.
    expect(calls).toEqual([60, 62, 67].map((pitch) => `${laneAssetId}@${pitch}`));
    expect(report.ready).toBe(true);
    expect(report.problems).toEqual([]);
    // The display can be determinate: 0 first, then one tick per note, ending at the total.
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(3);
  });

  it("names every note it could not load, and is not ready when one failed", async () => {
    const loader = {
      loadNote: async (_assetId: string, pitch: number) => {
        if (pitch === 62) throw new Error("no region covers key 62");
        return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
      },
      load: async () => ({}) as AudioBuffer,
      decodes: () => 0,
    };
    const report = await prepareSamplerLanes({
      pattern,
      catalogue: [],
      loader,
      lanes: [{ sourceTrackId: "lead", lane }],
    });
    // Silence with a reason, never silence alone — and the count says two of three are ready.
    expect(report.ready).toBe(false);
    expect(report.empty).toBe(false);
    expect(report.loaded).toBe(2);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain("note 62");
    expect(report.problems[0]).toContain("no region covers key 62");
  });

  it("has nothing to wait for when the engine stood nothing down", async () => {
    let loads = 0;
    const loader = {
      loadNote: async () => {
        loads += 1;
        return { buffer: {} as AudioBuffer, ratio: 1, samplePath: "x" };
      },
      load: async () => ({}) as AudioBuffer,
      decodes: () => 0,
    };
    const report = await prepareSamplerLanes({ pattern, catalogue: [], loader, lanes: [] });
    expect(report.empty).toBe(true);
    expect(report.ready).toBe(true);
    expect(report.total).toBe(0);
    // ⭐ An empty list is not a request for every lane: nothing is fetched, so a mirror-less build cannot be made to wait on a lane that is
    // still a synthesiser.
    expect(loads).toBe(0);
  });
});

describe("the same loader means a second play pays nothing", () => {
  it("fetches the program once and decodes each sample once across two preparations", async () => {
    const counted = countingLoader();
    const first = await prepareSamplerLanes({
      pattern,
      catalogue: [laneAsset],
      loader: counted.loader,
      lanes: [{ sourceTrackId: "lead", lane }],
    });
    expect(first.ready, "the fixture's three notes must resolve, or this criterion measures nothing").toBe(true);
    const fetchesAfterFirst = counted.programFetches();
    const decodesAfterFirst = counted.decodes();
    expect(fetchesAfterFirst).toBe(1);
    expect(decodesAfterFirst).toBe(3);

    // A second play through the same loader — the session's shared one — is a cache hit in both halves.
    const second = await prepareSamplerLanes({
      pattern,
      catalogue: [laneAsset],
      loader: counted.loader,
      lanes: [{ sourceTrackId: "lead", lane }],
    });
    expect(second.ready).toBe(true);
    expect(counted.programFetches(), "the instrument was downloaded twice").toBe(fetchesAfterFirst);
    expect(counted.decodes(), "a sample was decoded twice").toBe(decodesAfterFirst);
  });

  it("⭐ a different loader really does pay again — which is what makes the sharing the fix rather than a coincidence", async () => {
    const counted = countingLoader();
    await prepareSamplerLanes({ pattern, catalogue: [laneAsset], loader: counted.loader, lanes: [{ sourceTrackId: "lead", lane }] });

    /**
     * The red half. Before `sharedSamplerLoader`, **every press** built a loader like this one, so this is what the app did on the second
     * play: the program and every `#include` under it again, and every sample decoded again.
     */
    const fresh = countingLoader();
    await prepareSamplerLanes({ pattern, catalogue: [laneAsset], loader: fresh.loader, lanes: [{ sourceTrackId: "lead", lane }] });
    expect(fresh.programFetches()).toBe(1);
    expect(fresh.decodes()).toBe(3);
  });
});
