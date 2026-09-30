/**
 * The region a lane draws, and the miniature inside it — the arithmetic half.
 *
 * `docs/ARRANGEMENT_UI_DESIGN.md` §4 settles two questions that a component cannot answer on its own, and both are
 * decisions rather than conveniences:
 *
 * 1. **Option (a): one region per track spanning bars 1..`arrangement.bars`.** The model has no general region
 *    type, only `TakeRegion`, and `notesByTrack` is one flat list per track. Deriving the region from the length
 *    the arrangement already declares is what the design doc chose because it **does not lie and does not touch the
 *    model**; option (b), promoting `TakeRegion` to a general region, waits until "arranging in sections" is a real
 *    need with a real shape.
 *
 * 2. **The miniature's coordinates.** x = `startBeats`, y = pitch normalised to **the track's own range**, width =
 *    `lengthBeats`, alpha = velocity. Normalising per track is what makes a two-note bass part and a two-octave
 *    piano part both legible in the same lane height; normalising across all tracks would draw the bass as a
 *    flat line at the bottom.
 *
 * Both are pure functions, so both are checked here rather than through a render.
 */
import { describe, expect, it } from "vitest";
import { deriveArrangementRegions, deriveNoteMiniatures, miniaturesFor, type NoteMiniature } from "../data/arrangementLanes";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";

const note = (pitch: number, startBeats: number, lengthBeats = 0.5, velocity = 100): NoteEvent => ({
  pitch,
  startBeats,
  lengthBeats,
  velocity,
});

const arrangement = (overrides: Partial<ArrangementV2> = {}): ArrangementV2 => ({
  songId: "s",
  tracks: [
    { id: "bass", kind: "instrument", name: "Bass" },
    { id: "keys", kind: "sampler", name: "Keys" },
  ],
  notesByTrack: { bass: [note(40, 0), note(45, 2)], keys: [note(60, 1)] },
  bars: 4,
  sourceSlots: ["A"],
  ...overrides,
});

describe("one region per track, over the arrangement's own bars", () => {
  it("spans the whole declared length, for every track", () => {
    const regions = deriveArrangementRegions(arrangement());
    expect(regions.map((region) => region.trackId)).toEqual(["bass", "keys"]);
    for (const region of regions) {
      // Bars are zero-based inside the model; the region says so in both units so a caller never converts twice.
      expect(region.startBar).toBe(0);
      expect(region.endBar).toBe(4);
      expect(region.startBeats).toBe(0);
      expect(region.endBeats).toBe(16);
    }
  });

  it("falls back to the default length when the arrangement does not declare one", () => {
    // An older file with no `bars` still has to draw: the honest reading is a default, not an empty lane.
    const regions = deriveArrangementRegions(arrangement({ bars: undefined }));
    expect(regions[0]!.endBar).toBe(8);
  });

  it("gives a track with nothing on it a region with no notes, rather than no region", () => {
    /**
     * This is the difference between option (a) and "only draw something that sounds". A track is a place where
     * things go, and a lane that vanished when it was empty would make the track look deleted.
     */
    const regions = deriveArrangementRegions(arrangement({ notesByTrack: { bass: [note(40, 0)] } }));
    expect(regions).toHaveLength(2);
    expect(regions[1]!.notes).toEqual([]);
  });
});

describe("the miniature's coordinates", () => {
  it("places x at the note's beat and width at its length, both as fractions of the region", () => {
    const [bass] = deriveArrangementRegions(arrangement());
    const [first, second] = bass!.miniatures;
    // 0 beats into 16 is the left edge; 2 beats in is an eighth of the way across.
    expect(first!.x).toBe(0);
    expect(second!.x).toBeCloseTo(2 / 16, 10);
    // A half-beat note is a thirty-second of a sixteen-beat region.
    expect(first!.width).toBeCloseTo(0.5 / 16, 10);
  });

  it("normalises the pitch to the track's own range, with the highest note at the top", () => {
    const [bass] = deriveArrangementRegions(arrangement());
    const [low, high] = bass!.miniatures;
    // The bass part is pitches 40 and 45, so the low note sits at the bottom and the high one at the top.
    expect(low!.y).toBe(1);
    expect(high!.y).toBe(0);
  });

  it("puts a track whose notes are all one pitch in the middle, not at an edge", () => {
    /**
     * A one-pitch part is the common case (a kick, a single held note), and dividing by a zero range would give
     * `NaN` height — which renders as nothing at all rather than as a wrong position, the worst way to be wrong.
     */
    const [region] = deriveArrangementRegions(arrangement({ notesByTrack: { bass: [note(40, 0), note(40, 4)] } }));
    expect(region!.miniatures.map((miniature) => miniature.y)).toEqual([0.5, 0.5]);
  });

  it("carries the velocity through as the alpha the lane draws with", () => {
    const [region] = deriveArrangementRegions(
      arrangement({ notesByTrack: { bass: [note(40, 0, 0.5, 127), note(41, 1, 0.5, 1)] } })
    );
    expect(region!.miniatures[0]!.alpha).toBeCloseTo(1, 10);
    // 1 is inaudible rather than invisible: the design doc says alpha reads velocity, and a zero-alpha note would
    // be a note the user wrote and cannot see.
    expect(region!.miniatures[1]!.alpha).toBeGreaterThan(0);
    expect(region!.miniatures[1]!.alpha).toBeLessThan(0.2);
  });

  it("keeps a note that starts before the region and one that runs past its end inside it", () => {
    /**
     * The clamp exists because the region is derived from the arrangement's length, not from the notes: a note
     * written in bar 9 of an eight-bar arrangement is past the declared end, and a miniature drawn outside its
     * region would be invisible in a lane that clips — a note the user can hear and cannot see.
     */
    const miniatures = deriveNoteMiniatures([note(40, -1, 2), note(41, 15.75, 4)], 0, 16);
    expect(miniatures[0]!.x).toBe(0);
    expect(miniatures[0]!.width).toBeCloseTo(1 / 16, 10);
    expect(miniatures[1]!.x).toBeCloseTo(15.75 / 16, 10);
    expect(miniatures[1]!.x + miniatures[1]!.width).toBeCloseTo(1, 10);
  });

  it("draws nothing at all for a region with no length", () => {
    // A guard, not a feature: an end that equals its start would divide by zero.
    expect(deriveNoteMiniatures([note(40, 0)], 4, 4)).toEqual([]);
  });

  it("sorts nothing and reorders nothing — the notes are drawn where the model put them", () => {
    // Sorting is the model's business (and the compiler's); a lane that reordered would make two readings of one
    // array disagree about which note is which.
    const notes = [note(45, 8), note(40, 0)];
    const miniatures: NoteMiniature[] = deriveNoteMiniatures(notes, 0, 16);
    expect(miniatures.map((miniature) => miniature.pitch)).toEqual([45, 40]);
  });
});

describe("reading one track's miniatures", () => {
  it("answers with the region the track id names", () => {
    expect(miniaturesFor(arrangement(), "bass")).toHaveLength(2);
    expect(miniaturesFor(arrangement(), "keys")).toHaveLength(1);
  });

  it("answers with nothing for a track that is not there, rather than throwing", () => {
    // The view asks during a render; an exception would be a blank screen rather than an empty lane.
    expect(miniaturesFor(arrangement(), "gone")).toEqual([]);
  });
});
