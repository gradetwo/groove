/**
 * The last rung: **a sampler track in the new arrangement reaches the engine's planner.**
 *
 * Everything below this has its own criteria — the model, the compile, the planner, the loader, and an end-to-end probe in CI that proves real bytes become sound. What had no criterion was the **join**: that a
 * `TrackV2` with an asset actually produces lane events when the arrangement is compiled and planned. And the join is where every expensive bug in this workstream has lived — the compile and the planner are
 * each correct in isolation and can still disagree about their shared shape.
 *
 * It needs no `AudioContext`: `planAudioLaneEvents` is pure, so the join can be judged without a browser.
 */
import { describe, expect, it } from "vitest";
import { compileArrangementToLanes, compileArrangementToSongInput } from "../data/arrangementCompile";
import { planAudioLaneEvents } from "../audio/audioLanePlan";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { ArrangementV2 } from "../types/arrangementV2";

const arrangement: ArrangementV2 = {
  songId: "s",
  sourceSlots: ["A"],
  tracks: [{ id: "t1", kind: "sampler", name: "Drums", sample: { assetId: "virtuosity-drums-basic" } }],
};

describe("a v2 arrangement reaching the planner", () => {
  it("plans lane events for a sampler track, so an audio track is audible rather than only compilable", () => {
    // ⭐ The engine is untouched: the compile produces the shape the planner already takes, and this asserts the two agree.
    const song = compileArrangementToSongInput(arrangement, { t1: [0, 1, 2, 3].map((beat) => ({ pitch: 36, startBeats: beat, lengthBeats: 0.25, velocity: 100 })) }) as never;
    // ⭐ The catalogue is a parameter **because the shipped one is deliberately empty** — so a criterion that passes `[]` is asking the planner to find an asset that no catalogue holds, and gets a
    // `problem` rather than an event. The first version of this criterion did exactly that and failed; the failure was in the criterion's setup, not in the compile.
    const asset: SampleAsset = { assetId: "virtuosity-drums-basic", name: "Virtuosity Drums", kind: "one-shot", seconds: 1 };
    const plan = planAudioLaneEvents(song, [asset]);
    const events = (plan as { events?: unknown[] }).events ?? [];
    // More than zero is the whole point: a compiled lane the planner ignored would be a silent sampler track, which is the failure the owner asked to remove.
    expect(events.length).toBeGreaterThan(0);
  });

  it("plans nothing for an arrangement whose only track is a folder", () => {
    const onlyFolder: ArrangementV2 = { songId: "s", sourceSlots: [], tracks: [{ id: "f", kind: "folder", name: "Drums" }] };
    const song = compileArrangementToSongInput(onlyFolder) as never;
    // "Grouping is not sounding" asserted at the far end of the chain, not only where the compile skips it.
    const folderAsset: SampleAsset = { assetId: "virtuosity-drums-basic", name: "Virtuosity Drums", kind: "one-shot", seconds: 1 };
    const events = ((planAudioLaneEvents(song, [folderAsset]) as { events?: unknown[] }).events ?? []) as unknown[];
    expect(events.length).toBe(0);
  });
});

describe("the compile's own output, which a cast could hide", () => {
  /**
   * **The criterion that was missing, and the bug it would have caught.** The lane object is built with `as SequencerTrack`, and that cast silences the compiler: a `NoteEvent[]` assigned into `steps: number[]` type-checks and then reaches the engine as objects, which are all
   * truthy — so every step of every lane would trigger. Nothing asserted the shape of what the compile produced, only that events came out.
   */
  it("writes steps as 0/1 numbers and pitches as numbers, whatever the model holds", () => {
    const arrangement = {
      songId: "s",
      sourceSlots: [] as string[],
      tracks: [{ id: "t1", kind: "synth" as const, name: "Keys" }],
    };
    const lanes = compileArrangementToLanes(arrangement as never, {
      t1: [
        { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
        { pitch: 64, startBeats: 1, lengthBeats: 0.5, velocity: 100 },
      ],
    });
    const steps = lanes[0]!.track.steps ?? [];
    expect(steps.every((value) => typeof value === "number")).toBe(true);
    // Two notes, two steps on: an object per note would have made every step truthy.
    expect(steps.filter((value) => value !== 0)).toHaveLength(2);
    const pitches = lanes[0]!.track.pitch ?? [];
    expect(pitches.every((value) => typeof value === "number")).toBe(true);
    expect(pitches.filter((value) => value !== 0)).toEqual([60, 64]);
  });

  it("plans one event per lane per bar, which is why the planner cannot catch a broken lane", () => {
    /**
     * **Where the defect was invisible.** The planner thinks in lanes and bars: one audio lane in a one-bar song is one event, whatever that lane's steps hold. So a lane whose steps were note objects still planned correctly — the noise would have come out of the engine's own
     * step loop, one level further down. That is why the criterion above has to live with the compile rather than with the planner.
     */
    const arrangement = {
      songId: "s",
      sourceSlots: [] as string[],
      tracks: [{ id: "t1", kind: "sampler" as const, name: "Drums", sample: { assetId: "virtuosity-drums-basic" } }],
    };
    const song = compileArrangementToSongInput(arrangement as never, {
      t1: [0, 1, 2, 3].map((beat) => ({ pitch: 36, startBeats: beat, lengthBeats: 0.25, velocity: 100 })),
    });
    const asset: SampleAsset = { assetId: "virtuosity-drums-basic", name: "Virtuosity Drums", kind: "one-shot", seconds: 1 };
    const plan = planAudioLaneEvents(song as never, [asset]) as { events?: { laneId?: string; atBar?: number }[] };
    expect(plan.events).toHaveLength(1);
    // And the lane it handed over is the one the compile built, with the notes' four steps on.
    const lane = (song as { clips: { A: { tracks: { steps?: number[] }[] } } }).clips.A.tracks[0]!;
    expect((lane.steps ?? []).filter((value) => value !== 0)).toHaveLength(4);
  });
});
