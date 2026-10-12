import { describe, expect, it } from "vitest";
import { scheduleAudioLaneSamples } from "../audio/audioLaneScheduler";
import type { ScheduleInput } from "../audio/audioLaneScheduler";
import { createSampleLoader } from "../audio/sampleLoader";
import { totalSeconds } from "../data/tempoMap";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { AudioLaneEvent } from "../audio/audioLanePlan";

/**
 * The scheduler (owner decision 2026-09-28, the read-only slice's last graph piece).
 *
 * The graph is **injected**, so what is tested is what goes wrong: the second each sample starts at, the gain it carries, the order, and the loud failure when a sample
 * cannot load. The browser adapter that starts a buffer source is the part least likely to be wrong and least likely to be testable.
 *
 * (This file is a rewrite: the first version let the fixture's type be inferred and then chased the four resulting errors with casts. **The fixture's type is part of
 * the design**, so it is declared here.)
 */
const CATALOGUE: SampleAsset[] = [{ assetId: "riser-01", name: "Riser 01", kind: "one-shot", seconds: 2 }];
const buffer = (id: string) => ({ id } as unknown as AudioBuffer);
const MAP = [{ atBar: 0, bpm: 66 }, { atBar: 4, bpm: 132 }];

const song = (tracks: Array<Record<string, unknown>>): ScheduleInput =>
  ({
    clips: { A: { tracks } },
    sections: [
      { id: "s1", slot: "A", bars: 4 },
      { id: "s2", slot: "A", bars: 2 },
    ],
    boundaries: [0, 4],
    bpm: 66,
    tempoTrack: MAP,
  }) as unknown as ScheduleInput;

const audioLane = (extra: Record<string, unknown> = {}) => ({
  track_id: "audio",
  name: "Riser",
  instrument: "sampler",
  sample: { assetId: "riser-01" },
  ...extra,
});

const loader = () => createSampleLoader(async (asset) => buffer(asset.assetId), CATALOGUE);

describe("scheduleAudioLaneSamples", () => {
  it("schedules nothing and reports nothing for a song without an audio lane", async () => {
    const calls: number[] = [];
    const report = await scheduleAudioLaneSamples(song([{ track_id: "kick", name: "Kick" }]), loader(), {
      start: (_b, when) => calls.push(when),
    });
    expect(report).toEqual({ scheduled: 0, seconds: [], problems: [] });
    expect(calls).toEqual([]);
  });

  it("places each event at the second the tempo map gives it, in bar order", async () => {
    const seen: Array<{ when: number; gain: number; atBar: number }> = [];
    const report = await scheduleAudioLaneSamples(
      song([audioLane()]),
      loader(),
      { start: (_b, when, gain, event) => seen.push({ when, gain, atBar: event.atBar }) },
      0,
      CATALOGUE
    );

    expect(report.problems).toEqual([]);
    expect(report.scheduled).toBe(2);
    // Equal to the map's own prefixes rather than to arithmetic written here, so this cannot pass while the renderer disagrees.
    expect(seen.map((entry) => entry.when)).toEqual([totalSeconds({ bpm: 66, tempoTrack: MAP }, 0), totalSeconds({ bpm: 66, tempoTrack: MAP }, 4)]);
    expect(seen.map((entry) => entry.atBar)).toEqual([0, 4]);
  });

  it("carries the gain it was given, so a caller can place a sample quietly", async () => {
    const gains: number[] = [];
    await scheduleAudioLaneSamples(
      song([audioLane()]),
      loader(),
      { start: (_b, _w, gain) => gains.push(gain) },
      -6,
      CATALOGUE
    );
    expect(gains).toEqual([-6, -6]);
  });

  it("reports a sample that will not load, naming its section, instead of scheduling silence", async () => {
    const calls: AudioLaneEvent[] = [];
    const report = await scheduleAudioLaneSamples(song([audioLane({ sample: { assetId: "missing" } })]), loader(), {
      start: (_b, _w, _g, event) => calls.push(event),
    });
    expect(report.scheduled).toBe(0);
    expect(calls).toEqual([]);
    // Two sections, two failures, each naming the section it would have silenced — the planner's wording, which is the better one.
    expect(report.problems).toHaveLength(2);
    expect(report.problems[0]).toMatch(/section s1 · Riser: no sample "missing"/);
  });
});
