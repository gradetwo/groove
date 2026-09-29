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
import { compileArrangementToSongInput } from "../data/arrangementCompile";
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
    const song = compileArrangementToSongInput(arrangement, { t1: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] }) as never;
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
