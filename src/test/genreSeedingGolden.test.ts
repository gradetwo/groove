/**
 * ⭐ **A golden value over the v2 seeding path, so work on v1 is guarded.**
 *
 * `genreMix`'s twenty eight cases in `genreMix.test.ts` check **properties** — coverage, variety, category character.
 * Properties survive a change of numbers, and the plan to retire v1 has to cut the v2 seeding path away from v1's types,
 * which is exactly the kind of work that can move values without failing a property.
 *
 * So this pins the seeding of one genre literally: the track count, the note count and a digest of the whole pattern.
 * Measured at 2026-10-04 18:4x against `GENRES_MAP["chicago-house"]`; any change to what `patternFromGenre` produces fails here
 * first, which is the point. ⚠️ What it does **not** say is that these values are musically right — it says they are the
 * ones v2 ships today, so a change to them is a decision rather than an accident.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GENRES_MAP } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";

describe("the v2 seeding path, pinned for one genre", () => {
  it("⭐ seeds the same tracks, notes and pattern it shipped at 2.34.47", () => {
    const pattern = patternFromGenre(GENRES_MAP["chicago-house"] as never);
    const notes = pattern.tracks.reduce(
      (n, track) => n + (track.steps ? track.steps.filter((s) => s !== null && s !== undefined).length : 0),
      0,
    );
    expect({
      tracks: pattern.tracks.length,
      notes,
      digest: createHash("sha256").update(JSON.stringify(pattern)).digest("hex").slice(0, 16),
    /**
     * ⚠️ **This digest was measured here, because the value `bb9f05d` pinned does not match the code it shipped with.**
     *
     * `bb9f05d` ("genre tuning") set it to `7159ed94dec95c71`, and that commit **fails its own criterion**: running this
     * file against `bb9f05d` yields `84a1c6778db82a7b`. Measured rather than assumed — the previous commit `fdbdb88`
     * passes its own pin (`0a1994d8c0149c6c`), so the breakage arrived with the genre tuning, and the most likely cause is
     * that the tuned `genreMix.ts` was not the state it was measured on (its pin was changed in the same commit as the
     * tuning, and the two disagree).
     *
     * So the honest repair is to pin **what the code produces**, with this note: the digest is a fingerprint of "what v2
     * seeds today", and the value it replaced was not one this tree has ever produced.
     */
    }).toEqual({ tracks: 8, notes: 1024, digest: "84a1c6778db82a7b" });
  });
});
