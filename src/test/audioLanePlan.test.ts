import { describe, expect, it } from "vitest";
import { planAudioLaneEvents } from "../audio/audioLanePlan";
import type { SequencerTrack } from "../types/genre";
import type { SampleAsset } from "../data/sampleCatalogue";

/** A catalogue with something in it, because the shipped one is empty on purpose — the last test uses the default and expects refusals. */
const CATALOGUE: SampleAsset[] = [
  { assetId: "riser-01", name: "Riser 01", kind: "one-shot", seconds: 2 },
  { assetId: "chop-01", name: "Vox Chop", kind: "one-shot", seconds: 1 },
];

/**
 * The audio lane's playback **plan** (owner decision 2026-09-28, the read-only slice's first piece).
 *
 * Criteria, before the graph exists: a song with no audio lane plans nothing and reports nothing; an audio lane plans one sample per section it plays, at that
 * section's own start bar; and a lane whose reference cannot play is a **problem**, not a silent event.
 */
const lane = (extra: Record<string, unknown> = {}): SequencerTrack =>
  ({
    track_id: "kick",
    name: "Kick",
    instrument: "drum",
    steps: new Array(16).fill(0),
    velocity: new Array(16).fill(100),
    ...extra,
  }) as unknown as SequencerTrack;

const audioLane = (extra: Record<string, unknown> = {}) =>
  lane({ track_id: "audio", name: "Riser", instrument: "sampler", sample: { assetId: "riser-01" }, ...extra });

describe("planAudioLaneEvents", () => {
  it("plans nothing and reports nothing for a song without an audio lane", () => {
    const plan = planAudioLaneEvents({
      clips: { A: { tracks: [lane(), lane({ track_id: "lead", name: "Lead" })] } },
      sections: [{ id: "s1", slot: "A", bars: 4 }, { id: "s2", slot: "A", bars: 4 }],
    });
    expect(plan.events).toEqual([]);
    expect(plan.problems).toEqual([]);
  });

  it("starts the sample at the section's own first bar, once per section it plays", () => {
    const plan = planAudioLaneEvents({
      clips: { A: { tracks: [lane(), audioLane({ laneId: "riser" })] } },
      sections: [
        { id: "s1", slot: "A", bars: 4 },
        { id: "s2", slot: "A", bars: 4 },
      ],
      boundaries: [0, 4],
    }, CATALOGUE);
    expect(plan.problems).toEqual([]);
    expect(plan.events).toEqual([
      { laneId: "riser", name: "Riser", assetId: "riser-01", atBar: 0, atStep: 0 },
      { laneId: "riser", name: "Riser", assetId: "riser-01", atBar: 4, atStep: 64 },
    ]);
  });

  it("counts the bars itself when no boundaries are given, so the plan never needs them to be right", () => {
    const plan = planAudioLaneEvents({
      clips: { A: { tracks: [audioLane()] } },
      sections: [
        { id: "s1", slot: "A", bars: 3 },
        { id: "s2", slot: "A", bars: 2 },
      ],
    }, CATALOGUE);
    expect(plan.events.map((event) => event.atBar)).toEqual([0, 3]);
  });

  it("reports a lane whose sample cannot play, naming the section, instead of planning silence", () => {
    const plan = planAudioLaneEvents({
      clips: { A: { tracks: [audioLane({ sample: undefined }), audioLane({ name: "Chop", sample: { assetId: "nope" } })] } },
      sections: [{ id: "s1", slot: "A", bars: 1 }],
    });
    // The shipped catalogue is empty, so even a plausible id is refused — loudly, with the section it would have silenced.
    expect(plan.events).toEqual([]);
    expect(plan.problems).toHaveLength(2);
    expect(plan.problems[0]).toMatch(/section s1 · Riser/);
    expect(plan.problems[0]).toMatch(/must name a sample/);
    expect(plan.problems[1]).toMatch(/no samples ship with the app yet/);
    // Deliberately the **default** catalogue: shipped empty, so every reference is refused until assets exist.
    expect(planAudioLaneEvents({ clips: { A: { tracks: [audioLane()] } }, sections: [{ id: "s1", slot: "A", bars: 1 }] }).events).toEqual([]);
  });

  it("skips a section whose clip is missing rather than inventing an event for it", () => {
    const plan = planAudioLaneEvents({
      clips: { A: { tracks: [audioLane()] } },
      sections: [
        { id: "s1", slot: "A", bars: 1 },
        { id: "s2", slot: "B", bars: 1 },
      ],
    }, CATALOGUE);
    expect(plan.events.map((event) => event.atStep)).toEqual([0]);
  });
});
