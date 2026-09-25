import { describe, it, expect } from "vitest";
import { flattenSong } from "../data/songFlatten";
import { resolveTimeline, type ClipSlot, type Song, type SongSection } from "../types/song";
import type { SequencerPattern } from "../types/genre";

/**
 * The first step of the per-track arrangement: a section may name a clip **per lane**.
 *
 * `docs/TRACK_ARRANGEMENT_PLAN.md` split this from the lane UI on purpose — the data shape and the one place that
 * turns sections into a render are the risky part, and they can be judged before any drag gesture is built on top.
 * The property that makes it safe to land is the second case here: a song that names nothing must flatten
 * **byte-identically** to the same song without the field, because every trim and every timbre fingerprint in this
 * repository is built on the loop render that sits downstream of this function.
 */
const lane = (trackId: string, steps: number[], instrument = "x") => ({
  track_id: trackId,
  name: trackId,
  instrument,
  steps,
  velocity: new Array(steps.length).fill(100),
});

const clip = (kick: number[], bass: number[]): SequencerPattern =>
  ({
    genre_id: "chicago-house",
    bpm: 124,
    swing: 0,
    scale: "C minor",
    totalSteps: kick.length,
    tracks: [lane("kick", kick), lane("bass", bass)],
  }) as unknown as SequencerPattern;

const A = clip([1, 0, 0, 0], [0, 0, 0, 0]);
const B = clip([0, 0, 0, 0], [0, 1, 0, 0]);

const song = (sections: SongSection[]): Song =>
  ({
    id: "song-1",
    name: "Test",
    genreId: "chicago-house",
    bpm: 124,
    swing: 0,
    resolution: "1/16",
    clips: { A, B } as Partial<Record<ClipSlot, SequencerPattern>>,
    sections,
    loopRange: null,
  }) as unknown as Song;

const section = (extra: Partial<SongSection> = {}): SongSection => ({
  id: "s1",
  slot: "A",
  bars: 1,
  ...extra,
});

describe("per-lane section clips", () => {
  it("takes one lane from another clip and leaves the rest where they were", () => {
    const flattened = flattenSong(song([section({ slots: { bass: "B" } })]));
    const kick = flattened.pattern.tracks.find((track) => track.track_id === "kick")!;
    const bass = flattened.pattern.tracks.find((track) => track.track_id === "bass")!;
    // Kick still comes from A, bass now comes from B.
    expect(Array.from(kick.steps)).toEqual([1, 0, 0, 0]);
    expect(Array.from(bass.steps)).toEqual([0, 1, 0, 0]);
    expect(flattened.problems).toEqual([]);
  });

  it("flattens byte-identically when no lane names a clip", () => {
    // The constraint the plan states: the loop render must not move, so this path must be a no-op.
    const withField = flattenSong(song([section({ slots: {} })]));
    const without = flattenSong(song([section()]));
    expect(JSON.stringify(withField.pattern)).toBe(JSON.stringify(without.pattern));
    expect(withField.totalSteps).toBe(without.totalSteps);
  });

  it("falls back for a lane the named clip does not have, rather than taking another lane's steps", () => {
    /**
     * The lane is named as `B`, and `B` has no percussion lane. The honest answer is "keep the section's own clip for
     * this lane", not "use whatever sits at that index in B" — which is the failure this addressing rule exists to
     * prevent.
     */
    const withPerc = clip([1, 0, 0, 0], [0, 0, 0, 0]);
    withPerc.tracks = [...withPerc.tracks, lane("percussion", [0, 0, 1, 0])] as SequencerPattern["tracks"];
    const base = song([section({ slots: { percussion: "B" } })]);
    (base.clips as Record<string, SequencerPattern>).A = withPerc;
    const flattened = flattenSong(base);
    const percussion = flattened.pattern.tracks.find((track) => track.track_id === "percussion")!;
    expect(Array.from(percussion.steps), "A's percussion, not B's kick lane").toEqual([0, 0, 1, 0]);
  });

  it("resolves the per-lane choice into the bar the flattener reads", () => {
    const timeline = resolveTimeline(song([section({ slots: { bass: "B" } })]));
    expect(timeline.bars[0].slot).toBe("A");
    expect(timeline.bars[0].slots).toEqual({ bass: "B" });
    // …and a section with no per-lane choice carries no field at all, which is what keeps the old path identical.
    expect(resolveTimeline(song([section()])).bars[0].slots).toBeUndefined();
  });
});
