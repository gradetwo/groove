import { describe, expect, it } from "vitest";
import { compileArrangementToLanes, compileArrangementToSongInput } from "../data/arrangementCompile";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * The bridge the owner's sentence rests on: **a track that is an audio sampler should be audible.**
 *
 * The engine already sounds a lane with `track_id: "audio"` and a `sample.assetId`, so what matters here is only that a v2 sampler track compiles into exactly that — and that the two cases where a compile
 * could quietly mislead (a folder emitting a lane, or four drum lanes collapsing into one) do not happen.
 */
const arr = (...tracks: ArrangementV2["tracks"]): ArrangementV2 => ({ songId: "s", tracks, sourceSlots: ["A"] });

describe("compiling a v2 arrangement into engine lanes", () => {
  it("turns a sampler track into the audio lane the engine already plays", () => {
    const lanes = compileArrangementToLanes(arr({ id: "t1", kind: "sampler", name: "Drums", sample: { assetId: "virtuosity-drums-basic" } }));
    expect(lanes).toHaveLength(1);
    // ⭐ Exactly the shape the proven chain consumes — nothing about it is new, which is why no engine change is needed.
    expect(lanes[0]!.track.track_id).toBe("audio");
    expect(lanes[0]!.track.sample).toEqual({ assetId: "virtuosity-drums-basic" });
    // The lane names its source, so a load failure can quote the track the user sees.
    expect(lanes[0]!.sourceTrackId).toBe("t1");
  });

  it("produces no lane at all for a folder, because grouping is not sounding", () => {
    const lanes = compileArrangementToLanes(arr({ id: "f", kind: "folder", name: "Drums" }, { id: "t", kind: "sampler", name: "Kick", sample: { assetId: "x" } }));
    // One lane, not two: a folder that emitted a silent lane would be invisible until something mixed it.
    expect(lanes.map((lane) => lane.sourceTrackId)).toEqual(["t"]);
  });

  it("keeps a projected song's original roles instead of collapsing them to one kind", () => {
    // Four drum lanes are four roles in v1; compiling them by kind alone would produce four `kick` lanes and lose what the song was.
    const lanes = compileArrangementToLanes(
      arr(
        { id: "kick", kind: "drumkit", name: "Kick", fromTrackId: "kick" },
        { id: "snare", kind: "drumkit", name: "Snare", fromTrackId: "snare" },
        { id: "hihat", kind: "drumkit", name: "Hat", fromTrackId: "hihat" },
        { id: "percussion", kind: "drumkit", name: "Perc", fromTrackId: "percussion" }
      )
    );
    expect(lanes.map((lane) => lane.track.track_id)).toEqual(["kick", "snare", "hihat", "percussion"]);
  });

  it("emits an empty lane for a track with no notes, rather than dropping it", () => {
    const input = compileArrangementToSongInput(arr({ id: "t", kind: "synth", name: "Lead" }));
    // Silence is the honest result of "a track with nothing on it"; omitting the lane would make the track disappear on reload.
    expect(input.clips.A.tracks).toHaveLength(1);
    expect(input.clips.A.tracks[0]!.steps.every((step) => step === 0)).toBe(true);
  });
});
