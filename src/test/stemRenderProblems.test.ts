import { describe, expect, it } from "vitest";
import { mergeRenderProblems } from "../../mcp/render/worker";

/**
 * A stems render runs the renderer once per track, and a whole-render problem is a fact about the
 * **call**, not about one stem: the host handing back a silent buffer and the retry recovering it, or
 * the page having no worklets at all. So the accumulation has one rule — keep the order, drop repeats —
 * and it is a pure function here rather than something you can only observe by rendering four tracks.
 *
 * The reads matter as much as the writes: a helper that returned the input unchanged would pass a
 * "carries the message" test and still print the same sentence once per track.
 */
describe("mergeRenderProblems", () => {
  it("keeps the order the problems arrived in", () => {
    expect(mergeRenderProblems(["a", "b"], ["c"])).toEqual(["a", "b", "c"]);
  });

  it("does not repeat a sentence that four stems each reported", () => {
    const recovered = "the host returned a silent buffer and the retry recovered it";
    const merged = mergeRenderProblems(
      mergeRenderProblems(mergeRenderProblems([], [recovered]), [recovered]),
      [recovered]
    );
    expect(merged).toEqual([recovered]);
    expect(merged).toHaveLength(1);
  });

  it("keeps two different problems apart", () => {
    expect(mergeRenderProblems(["silent retry"], ["no worklets", "silent retry"])).toEqual([
      "silent retry",
      "no worklets",
    ]);
  });

  it("returns a new array, so a caller's accumulator is not aliased", () => {
    const existing = ["a"];
    const merged = mergeRenderProblems(existing, ["b"]);
    expect(merged).not.toBe(existing);
    expect(existing).toEqual(["a"]);
  });
});
