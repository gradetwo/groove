import { describe, expect, it } from "vitest";
import { examplesFor, hasExamples, EXAMPLE_GENRES } from "../../mcp/examples";
import { validatePattern } from "../../mcp/pattern";

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
