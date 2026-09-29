import { describe, expect, it } from "vitest";
import { ALL_GENRES } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import { projectSongToV2, v1TrackKeys } from "../data/arrangementProjection";

/**
 * The projection over **every real genre in the repository** — because "lossless" is only a claim until it is run against the data it is about.
 *
 * The owner's constraint was that the new arrangement model must read old songs without losing anything, and those songs are the users' data. A projection that drops a lane, merges two lanes of one kind,
 * or skips a slot is a failed projection regardless of how reasonable the code looks, so the criterion walks the actual genres rather than a fixture written to pass.
 */
const songFor = (genre: (typeof ALL_GENRES)[number]) => {
  const clip = patternFromGenre(genre);
  return { id: `probe-${genre.id}`, clips: { A: clip } };
};

describe("projecting real songs into the v2 arrangement", () => {
  it("keeps every v1 lane, for every genre the app ships", () => {
    let genresChecked = 0;
    let lanesChecked = 0;
    for (const genre of ALL_GENRES) {
      const song = songFor(genre);
      const arrangement = projectSongToV2(song);
      const expected = v1TrackKeys(song);
      // Every lane present, and **nothing invented**: a projection that added or dropped a lane would change what a song sounds like.
      expect(arrangement.tracks.map((track) => track.id).sort(), `genre ${genre.id}`).toEqual([...expected].sort());
      genresChecked += 1;
      lanesChecked += expected.length;
    }
    // The loop is only meaningful if it actually walked something; a genre list that came back empty would make every assertion above vacuous.
    expect(genresChecked).toBeGreaterThan(0);
    expect(lanesChecked).toBeGreaterThan(0);
  });

  it("maps the ninth kind to a sampler track, which is the one the owner wants to hear", () => {
    const song = {
      id: "s",
      clips: { A: { tracks: [{ track_id: "audio", name: "Lane", sample: { assetId: "virtuosity-drums-basic" } }] } },
    } as never;
    const [track] = projectSongToV2(song).tracks;
    // `audio` is the role that reaches the SFZ engine, so it must arrive as a sampler — not as an instrument, and not silently dropped.
    expect(track!.kind).toBe("sampler");
    expect(track!.sample).toEqual({ assetId: "virtuosity-drums-basic" });
    expect(track!.fromTrackId).toBe("audio");
  });

  it("keeps two lanes of one kind apart, because that is what laneId exists for", () => {
    const song = {
      id: "s",
      clips: { A: { tracks: [{ track_id: "lead", name: "Lead A", laneId: "a" }, { track_id: "lead", name: "Lead B", laneId: "b" }] } },
    } as never;
    const tracks = projectSongToV2(song).tracks;
    // Merging them would be the quietest possible data loss: the song would still load, and one of the two lanes would simply be gone.
    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => track.name).sort()).toEqual(["Lead A", "Lead B"]);
  });
});
