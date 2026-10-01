import { describe, expect, it } from "vitest";
import { examplesFor, hasExamples, listExamples, EXAMPLE_GENRES } from "../../mcp/examples";
import { allGenreIds } from "../../mcp/library";
import { validatePattern } from "../../mcp/pattern";
import { TOOLS } from "../../mcp/registry";

/**
 * Every example passes the **same gate any pattern does**.
 *
 * That is the acceptance line docs/V4_REVIEW_PLAN.md writes for this workstream, and the reason to build examples from the genre library
 * rather than pasting JSON: a pasted example can quietly stop being a valid pattern, and nothing would notice.
 */
describe("the example library", () => {
  it("says which genres have examples, and only those", () => {
    expect(EXAMPLE_GENRES.length).toBeGreaterThan(0);
    for (const genreId of EXAMPLE_GENRES) expect(hasExamples(genreId)).toBe(true);
    expect(hasExamples("no-such-genre")).toBe(false);
    expect(examplesFor("no-such-genre")).toEqual([]);
  });

  it("gives each example a recipe, a title and a pattern that validates", () => {
    for (const genreId of EXAMPLE_GENRES) {
      const examples = examplesFor(genreId);
      expect(examples.length).toBeGreaterThanOrEqual(2);
      for (const example of examples) {
        expect(example.recipe.length).toBeGreaterThan(0);
        expect(example.title.en.length).toBeGreaterThan(0);
        expect(example.notes.length).toBeGreaterThan(0);
        const validation = validatePattern(example.pattern as never);
        expect(validation.ok, `${example.id}: ${JSON.stringify(validation.problems)}`).toBe(true);
      }
    }
  });

  it("makes the second example genuinely different, so a few-shot prompt shows a change rather than a copy", () => {
    for (const genreId of EXAMPLE_GENRES) {
      const [base, variation] = examplesFor(genreId);
      expect(JSON.stringify(base.pattern)).not.toBe(JSON.stringify(variation.pattern));
    }
  });
});

/**
 * `list_examples` and `get_example` must agree about what exists.
 *
 * This is the **only** thing that keeps them from drifting: two tools built on the same `examplesFor` still drift the moment one of
 * them grows a filter, a limit or a cached id list the other does not have. The served set is discovered by **calling** `get_example`
 * across the library rather than by reading `EXAMPLE_GENRES`, so a change to either side shows up here instead of in a roster someone
 * has to remember to update.
 */
describe("the example list and get_example agree", () => {
  type Reply = Record<string, unknown>;
  const call = (name: string, args: Record<string, unknown>): Reply => {
    const tool = TOOLS.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`no tool named ${name}`);
    return tool.handler(args as never) as unknown as Reply;
  };

  it(
    "lists exactly what get_example can serve, and every listed id fetches that same example",
    () => {
      // The universe, discovered from get_example itself: id → the genre and index that serve it.
      const served = new Map<string, { genreId: string; index: number }>();
      for (const genreId of allGenreIds()) {
        const reply = call("get_example", { genreId });
        expect(Array.isArray(reply.examples), genreId).toBe(true);
        (reply.examples as Array<{ id: string }>).forEach((row, index) => served.set(row.id, { genreId, index }));
      }
      expect(served.size).toBeGreaterThan(0);

      // Everything the list advertises. `limit` is above the current library, and the loop still pages, so the check keeps covering
      // every example after the library grows rather than silently checking the first page.
      const listed = new Map<string, { genreId: string; index: number }>();
      let offset = 0;
      for (;;) {
        const page = call("list_examples", { limit: 200, offset }) as {
          total: number;
          returned: number;
          examples: Array<{ id: string; genreId: string; index: number }>;
        };
        expect(page.returned).toBe(page.examples.length);
        for (const row of page.examples) {
          // The genre and index the list published must be the ones that fetch that exact example. This is the round trip.
          expect(served.get(row.id), `listed ${row.id} is not served by get_example`).toEqual({
            genreId: row.genreId,
            index: row.index,
          });
          listed.set(row.id, { genreId: row.genreId, index: row.index });
        }
        offset += page.returned;
        if (offset >= page.total) break;
        expect(page.returned).toBeGreaterThan(0);
      }

      // And the other direction: nothing get_example serves is missing from the list.
      expect([...listed.keys()].sort()).toEqual([...served.keys()].sort());
      for (const [id, location] of served) expect(listed.get(id), id).toEqual(location);
    },
    120_000
  );

  it("filters by genre and pages without losing or repeating a row", () => {
    const filtered = listExamples({ genreId: "chicago-house" });
    expect(filtered.total).toBe(2);
    expect(filtered.genres).toEqual(["chicago-house"]);
    expect(filtered.examples.every((example) => example.genreId === "chicago-house")).toBe(true);

    const total = listExamples({ limit: 1 }).total;
    const first = listExamples({ limit: 3 });
    const second = listExamples({ limit: 3, offset: 3 });
    expect(first.total).toBe(total);
    expect(second.offset).toBe(3);
    expect(first.examples.map((example) => example.id)).not.toEqual(second.examples.map((example) => example.id));
    // An unknown genre is an empty filter, not a crash — and it says so with a zero total.
    expect(listExamples({ genreId: "no-such-genre" }).total).toBe(0);
  });
});
