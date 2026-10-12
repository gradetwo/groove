import { describe, expect, it } from "vitest";
import { flattenSong } from "../data/songFlatten";
import { validatePattern } from "../../mcp/pattern";
import type { Song } from "../types/song";

/**
 * Decision 1A's second half: two lanes of one kind must **survive** flattening and validation, and a song that carries none must be untouched.
 *
 * This is the part the report's premise needed and the type alone cannot give: a second lead that exists in the model but is merged away (or rejected as an
 * unknown track) by the flattener is not a second lead. Written as a criterion first so the answer is which of those is true rather than a belief.
 */
const lane = (track_id: string, name: string, extra: Record<string, unknown> = {}) => ({
  track_id,
  name,
  instrument: "synth",
  steps: new Array(16).fill(0),
  velocity: new Array(16).fill(100),
  ...extra,
});

const songWithTwoLeads = (): Song =>
  ({
    id: "s",
    genreId: "custom",
    bpm: 120,
    clips: {
      A: {
        genre_id: "custom",
        bpm: 120,
        totalSteps: 16,
        tracks: [lane("kick", "Kick"), lane("lead", "Lead 1", { laneId: "lead-1" }), lane("lead", "Lead 2", { laneId: "lead-2" })],
      },
    },
    sections: [{ id: "s1", slot: "A", bars: 1 }],
  }) as unknown as Song;

const songWithoutLaneIds = (): Song =>
  ({
    id: "s",
    genreId: "custom",
    bpm: 120,
    clips: { A: { genre_id: "custom", bpm: 120, totalSteps: 16, tracks: [lane("kick", "Kick"), lane("lead", "Lead")] } },
    sections: [{ id: "s1", slot: "A", bars: 1 }],
  }) as unknown as Song;

describe("two lanes of a kind through the flattener", () => {
  it("keeps both leads, and names them apart", () => {
    const flattened = flattenSong(songWithTwoLeads());
    const leads = flattened.pattern.tracks.filter((track) => track.track_id === "lead");
    expect(leads).toHaveLength(2);
    expect(leads.map((track) => track.name)).toEqual(["Lead 1", "Lead 2"]);
    expect(leads.map((track) => track.laneId)).toEqual(["lead-1", "lead-2"]);
  });

  it("is accepted by validatePattern rather than rejected as an unknown track", () => {
    const flattened = flattenSong(songWithTwoLeads());
    const validation = validatePattern(flattened.pattern as never);
    // The id list may collapse to kinds; what matters is that a second lane is not a problem.
    expect(validation.problems ?? []).toEqual([]);
  });

  it("leaves a song with no laneId exactly as the flattener produced before", () => {
    const flattened = flattenSong(songWithoutLaneIds());
    expect(flattened.pattern.tracks.map((track) => track.name)).toEqual(["Kick", "Lead"]);
    expect(JSON.stringify(flattened.pattern)).not.toContain("laneId");
  });
});
