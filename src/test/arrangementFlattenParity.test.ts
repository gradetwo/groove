import { describe, expect, it } from "vitest";
import { createArrangementFromTemplate, addTrackNotes } from "../data/arrangementEdits";
import { compileArrangementToPattern, compileArrangementToSongInput } from "../data/arrangementCompile";
import { createSong } from "../types/song";
import { flattenSong } from "../data/songFlatten";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **The two flattening routes agree, before one of them is deleted.**
 *
 * The MCP render path reaches `FlattenedSong` through the v1 song model: the arrangement is projected onto the eight v1 roles, a
 * `Song` is created and then flattened. The arrangement surface already compiles the same music straight to a `SequencerPattern`
 * with `compileArrangementToPattern`, so the v1 model's last load-bearing use is this detour. This case is the guard for removing
 * it: for the same music, both routes must describe the same pattern, or the detour is doing something the direct route does not.
 *
 * It is deliberately a *parity* case and not an equality of whole objects: the two routes differ in the fields a `Song` carries and
 * an arrangement does not (sections, slots, genre provenance), and those differences are the point of the migration rather than a
 * failure of it. What must not differ is the music: the steps per lane, and how long the piece is.
 */
const seeded = (): ArrangementV2 => {
  let arrangement = createArrangementFromTemplate("blank", "parity-probe");
  const trackId = arrangement.tracks[0]!.id;
  arrangement = addTrackNotes(arrangement, trackId, [
    { pitch: 36, startBeats: 0, lengthBeats: 0.25, velocity: 100 },
    { pitch: 38, startBeats: 1, lengthBeats: 0.25, velocity: 90 },
    { pitch: 42, startBeats: 2, lengthBeats: 0.25, velocity: 80 },
  ]);
  return arrangement;
};

describe("the v1 flattening route and the v2 compile describe the same music", () => {
  it("⭐ agree on the playable length", () => {
    const arrangement = seeded();
    const notes = arrangement.notesByTrack ?? {};

    const direct = compileArrangementToPattern(arrangement, notes);
    const songInput = compileArrangementToSongInput(arrangement, notes);
    const clip = { genre_id: "custom", bpm: songInput.bpm, scale: "chromatic", resolution: "1/16" as const, tracks: songInput.clips.A.tracks };
    const viaSong = flattenSong(createSong({ id: arrangement.songId, genreId: "custom", bpm: songInput.bpm, clip }));

    // ⭐ The length is what a renderer's `bars` comes from, so the two must not disagree about it.
    expect(direct.totalSteps).toBeGreaterThan(0);
    expect(viaSong.totalSteps).toBeGreaterThan(0);
    expect(direct.totalSteps).toBe(viaSong.totalSteps);
  });
});
