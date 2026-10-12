import { describe, expect, it } from "vitest";
import { audioLaneEventSeconds, planAudioLaneEvents } from "../audio/audioLanePlan";
import { totalSeconds } from "../data/tempoMap";
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

/**
 * The event's time in seconds — and the point is that it is **not computed here**.
 *
 * A second implementation of "what a bar costs" would agree with the renderer until one of them changed, which is the defect this codebase has paid for most often. So
 * the criteria compare this against the tempo map's own answers rather than against arithmetic written for the test.
 */
describe("audioLaneEventSeconds", () => {
  it("matches a bar's cost from the tempo map when there is no tempo map at all", () => {
    const plain = { bpm: 120 };
    expect(audioLaneEventSeconds({ atBar: 0 }, plain)).toBe(0);
    expect(audioLaneEventSeconds({ atBar: 1 }, plain)).toBeCloseTo(2, 10);
    expect(audioLaneEventSeconds({ atBar: 4 }, plain)).toBeCloseTo(totalSeconds(plain, 4), 10);
  });

  it("follows a tempo map, so a sample starts with the music rather than with a stale tempo", () => {
    const mapped = { bpm: 66, tempoTrack: [{ atBar: 0, bpm: 66 }, { atBar: 2, bpm: 132 }] };
    // Two bars at 66, then a bar at double the tempo: the event in the fast section lands where the music does.
    expect(audioLaneEventSeconds({ atBar: 2 }, mapped)).toBeCloseTo((4 * 60) / 66 * 2, 10);
    expect(audioLaneEventSeconds({ atBar: 3 }, mapped)).toBeCloseTo((4 * 60) / 66 * 2 + (4 * 60) / 132, 10);
    // And always equal to the map's own prefix, which is the whole assertion.
    for (const bar of [0, 1, 2, 3, 8]) expect(audioLaneEventSeconds({ atBar: bar }, mapped)).toBeCloseTo(totalSeconds(mapped, bar), 10);
  });

  it("starts the first bar of a section where the plan says that section is", () => {
    const song = { bpm: 90, tempoTrack: [{ atBar: 4, bpm: 180 }] };
    const plan = planAudioLaneEvents(
      {
        clips: { A: { tracks: [audioLane()] } },
        sections: [{ id: "s1", slot: "A", bars: 4 }, { id: "s2", slot: "A", bars: 2 }],
        boundaries: [0, 4],
      },
      CATALOGUE
    );
    expect(plan.events).toHaveLength(2);
    // The second event is the one that matters: it is where the tempo doubles, so a hand-written conversion would be wrong by construction.
    expect(audioLaneEventSeconds(plan.events[1]!, song)).toBeCloseTo(totalSeconds(song, 4), 10);
    // The discriminating case is a bar **after** the change: there the map's answer differs from the naive one, so this cannot pass by coincidence.
    const after = { atBar: 6 };
    expect(audioLaneEventSeconds(after, song)).toBeCloseTo(totalSeconds(song, 6), 10);
    expect(audioLaneEventSeconds(after, song)).not.toBeCloseTo(6 * ((4 * 60) / 90), 3);
  });
});
