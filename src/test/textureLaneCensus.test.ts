import { describe, expect, it } from "vitest";
import { GENRES_MAP } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";

/**
 * A4's content side starts with a census, not an edit.
 *
 * The measurement that closed A4 said the riser machinery is implemented and **no catalogued clip had a lane for it to play** — but
 * it only sampled three genres. Adding a texture lane to genres that already have one would be noise, and adding one to a genre whose
 * music has no riser in it would be inventing material; so the honest first step is the list.
 *
 * The lane is found the way `songFlatten.textureLanes` finds it: by id or name, because a genre calls its texture voice `fx`,
 * `riser`, `texture`, `sweep` or `noise` depending on the genre.
 */
const TEXTURE = /(^|[^a-z])(fx|riser|texture|sweep|noise)([^a-z]|$)/;

const idOf = (genre: unknown) => (genre as { id: string }).id;

describe("which catalogued clips carry a texture lane (A4's content census)", () => {
  it("reports the list, and the count is the number ③b has to work with", () => {
    const genres = Object.values(GENRES_MAP) as unknown[];
    const withLane: string[] = [];
    for (const genre of genres) {
      const pattern = patternFromGenre(genre as never);
      const lane = pattern?.tracks?.find((track) =>
        TEXTURE.test(`${track.track_id ?? ""} ${track.name ?? ""}`.toLowerCase())
      );
      if (lane) withLane.push(`${idOf(genre)}:${lane.track_id}`);
    }
    /**
     * …and whether any of those lanes holds **material**, which is the question the fix turns on.
     *
     * A lane that exists and is silent needs notes, not a new voice; a lane with notes whose riser is inaudible needs something else
     * entirely. The census reports both counts so the difference is a number rather than an assumption.
     */
    let withNotes = 0;
    const silent: string[] = [];
    for (const genre of genres) {
      const pattern = patternFromGenre(genre as never);
      const lane = pattern?.tracks?.find((track) =>
        TEXTURE.test(`${track.track_id ?? ""} ${track.name ?? ""}`.toLowerCase())
      );
      if (!lane) continue;
      const hits = (lane.steps ?? []).reduce((sum: number, value: number) => sum + (value > 0 ? 1 : 0), 0);
      if (hits > 0) withNotes += 1;
      else silent.push(idOf(genre));
    }

    // Printed rather than asserted: the point is the list, and a hard expectation here would have to be rewritten by the very change
    // this census exists to plan.
    console.log(`texture lanes: ${withLane.length}/${genres.length} clips — ${withLane.join(", ") || "(none)"}`);
    console.log(`with material: ${withNotes}/${withLane.length} — silent: ${silent.length} (${silent.slice(0, 6).join(", ")}…)`);
    expect(genres.length).toBeGreaterThan(100);
  });
});
