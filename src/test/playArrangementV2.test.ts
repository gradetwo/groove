import { describe, expect, it, vi } from "vitest";
import { playArrangementV2 } from "../audio/playArrangementV2";
import type { ArrangementV2 } from "../types/arrangementV2";
import type { SequencerPattern } from "../types/genre";

/**
 * The join that had no criterion: **an arrangement built in the new interface reaches the engine.**
 *
 * Both halves were already checked — the compile produces the planner's shape, and the planner turns a lane into events — but nothing asserted they were ever connected for a v2 arrangement. A sampler track
 * that compiles perfectly and is never handed to the player is silent, and that is the failure the owner asked to remove.
 *
 * The player is handed the engine's `SequencerPattern` now, not the `clips`/`sections` song input: the audio-lane path starts one sample per lane per bar and only for a lane whose `track_id` is `"audio"`, so it
 * was silent for a drumkit or an instrument lane. What this criterion still asserts is unchanged — the engine was *asked*, and the counts tell "nothing to play" from "the engine ignored what it got".
 */
const player = () => ({ play: vi.fn(async (input: { pattern: SequencerPattern }) => ({ planned: input.pattern.tracks.length })) });

describe("playing a v2 arrangement", () => {
  it("hands the engine a lane for every sounding track, and reports what it planned", async () => {
    const engine = player();
    const arrangement: ArrangementV2 = {
      songId: "s",
      sourceSlots: [],
      tracks: [
        { id: "t1", kind: "sampler", name: "Drums", sample: { assetId: "virtuosity-drums-basic" } },
        { id: "t2", kind: "instrument", name: "Bass" },
      ],
    };
    const result = await playArrangementV2(arrangement, { t1: [{ pitch: 36, startBeats: 0, lengthBeats: 0.25, velocity: 100 }] }, engine as never);
    // ⭐ The engine was actually asked: a compile nobody plays is the silent-sampler bug with extra steps.
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(result.compiledLanes).toBe(2);
    expect(result.planned).toBe(2);
  });

  it("hands the engine nothing when the only track is a folder, and says so", async () => {
    const engine = player();
    const arrangement: ArrangementV2 = { songId: "s", sourceSlots: [], tracks: [{ id: "f", kind: "folder", name: "Drums" }] };
    const result = await playArrangementV2(arrangement, {}, engine as never);
    // ⭐ Zero is a real answer, and the caller can tell "nothing to play" from "the engine ignored what it got" because the compiled count is reported beside it.
    expect(result.compiledLanes).toBe(0);
    expect(result.planned).toBe(0);
  });
});
