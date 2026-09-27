import { describe, expect, it } from "vitest";
import { applyPatternOps } from "../../mcp/pattern";
import { GENRES_MAP } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";

/**
 * The writing half of harmony, as one deterministic operation.
 *
 * The reading half already existed (`list_chord_progressions`, `get_chord_progression`); this is the op the evaluation asked for, and
 * the design constraint is in its type: the chords are concrete, because `mcp/pattern.ts` is pure and cannot reach the progression
 * library. The tool layer resolves a name first.
 */
const patternOf = () => patternFromGenre(GENRES_MAP["chicago-house"] as never);

describe("set_chord_progression", () => {
  it("places one chord per bar on the chords lane", () => {
    const { pattern, applied } = applyPatternOps(patternOf(), [
      { op: "set_chord_progression", chords: [[60, 64, 67], [62, 65, 69]] },
    ]);
    const lane = pattern.tracks.find((track) => track.track_id === "chords" || track.name.toLowerCase().includes("chord"));
    expect(lane).toBeDefined();
    expect(applied[0]?.ok).toBe(true);
    // Step 0 of bar 0 carries the first chord, step 16 the second.
    expect(lane!.pitches?.[0]).toEqual([60, 64, 67]);
    expect(lane!.pitches?.[16]).toEqual([62, 65, 69]);
    expect(lane!.steps?.[0]).toBe(1);
    expect(lane!.steps?.[16]).toBe(1);
  });

  it("drops chords beyond the pattern and says so, rather than silently truncating", () => {
    const many = Array.from({ length: 40 }, (_, index) => [48 + (index % 12)]);
    const { applied } = applyPatternOps(patternOf(), [{ op: "set_chord_progression", chords: many }]);
    expect(applied[0]?.ok).toBe(true);
    expect(String(applied[0]?.detail)).toContain("beyond the pattern");
  });

  it("refuses a pattern with no chords lane instead of writing nowhere", () => {
    const bare = { ...patternOf(), tracks: [] } as never;
    const { applied } = applyPatternOps(bare, [{ op: "set_chord_progression", chords: [[60]] }]);
    expect(applied[0]?.ok).toBe(false);
  });
});
