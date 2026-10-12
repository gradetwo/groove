/**
 * ⭐ **A cache that is lost is invisible to every existing assertion.**
 *
 * `mcpExamples.test.ts` checks that `list_examples` and `get_example` agree about *what exists*, which catches a
 * cache returning the wrong example. Nothing it has can catch the cache not being used at all: the output is
 * identical either way, and the whole cost is the rebuild. The measured rebuild is the expensive part —
 * `examplesFor` runs `patternFromGenre` + `applyPatternOps` + `suggestProgression` + a seeded `generateMelody`
 * for **every** genre, and `listExamples` then keeps only the four static summary fields and throws the patterns
 * away. On the shipped library that is 159 melody generations per call.
 *
 * So this criterion counts the producer instead of the output: the seeded melody generator is the one call in
 * `examplesFor` that cannot be answered from a static table, and it is mocked through `vi.mock` (the pattern
 * `budgetHonesty.test.ts` documents — a live-import `vi.spyOn` does not intercept a same-graph call site).
 *
 * It is written to be able to go red: with the cache removed, `afterSecond` is `2 × afterFirst`, and a cache
 * keyed on the wrong thing (say, the raw genre id instead of the cleaned one) shows up as a second build for the
 * aliased spellings this also covers.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../mcp/melody", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../mcp/melody")>();
  return { ...actual, generateMelody: vi.fn(actual.generateMelody) };
});

import { listExamples } from "../../mcp/examples";
import { allGenreIds } from "../../mcp/library";
import * as melody from "../../mcp/melody";

describe("the worked-example cache", () => {
  it("builds each genre's examples once, not once per list_examples call", () => {
    const producer = vi.mocked(melody.generateMelody);
    const genreCount = allGenreIds().length;
    // 159 today. The absolute assertion below would be vacuous against a library of three genres.
    expect(genreCount).toBeGreaterThan(100);

    listExamples({ limit: 500 });
    const afterFirst = producer.mock.calls.length;
    listExamples({ limit: 500 });
    const afterSecond = producer.mock.calls.length;

    // The cold listing generates exactly one melody per genre — not two, and not none.
    expect(afterFirst).toBe(genreCount);
    // ⭐ The criterion: the second listing rebuilds nothing. A lost cache makes this 2 × genreCount.
    expect(afterSecond).toBe(afterFirst);
  });

  it("keys the cache on the cleaned genre id, so aliased spellings share one build", () => {
    const producer = vi.mocked(melody.generateMelody);
    listExamples({ genreId: "Chicago House" });
    const afterAlias = producer.mock.calls.length;
    listExamples({ genreId: "chicago-house" });
    expect(producer.mock.calls.length).toBe(afterAlias);
    // `listExamples` reports the cleaned id, so both spellings describe the same genre rather than two.
    expect(listExamples({ genreId: "Chicago House" }).genres).toEqual(["chicago-house"]);
  });
});
