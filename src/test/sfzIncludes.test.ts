import { describe, expect, it } from "vitest";
import { expandIncludes } from "../audio/sfz/includes";
import { parseSfz } from "../audio/sfz/parse";

/**
 * `#include`, with the three failure modes that actually bite: a cycle, a missing file, and nesting that never stops.
 *
 * The reader is injected, so all of them are testable without a network — which is the same reason the decoder and the SFZ fetcher are injected everywhere else in this
 * workstream. And the last criterion is the one the objective demands of every step: text with no include comes back **character for character unchanged**.
 */
const files = (map: Record<string, string>) => (path: string) => map[path];

describe("expandIncludes", () => {
  it("expands one include in place, so the regions land where the directive sat", () => {
    const result = expandIncludes('a\n#include "keymap.sfz"\nb', files({ "keymap.sfz": "<region> sample=kick.wav" }));
    expect(result.problems).toEqual([]);
    expect(result.included).toEqual(["keymap.sfz"]);
    expect(result.text).toBe("a\n<region> sample=kick.wav\nb");
  });

  it("resolves a nested include relative to the file that asked for it", () => {
    const result = expandIncludes('#include "keymaps/basic.sfz"', files({ "keymaps/basic.sfz": '#include "deep/more.sfz"', "keymaps/deep/more.sfz": "<region> sample=snare.wav" }));
    expect(result.problems).toEqual([]);
    // Relative to `keymaps/`, not to the root — the path a real library relies on.
    expect(result.included).toEqual(["keymaps/basic.sfz", "keymaps/deep/more.sfz"]);
    expect(result.text).toBe("<region> sample=snare.wav");
  });

  it("reports a cycle instead of recursing forever", () => {
    const result = expandIncludes('#include "a.sfz"', files({ "a.sfz": '#include "b.sfz"', "b.sfz": '#include "a.sfz"' }));
    expect(result.problems.join("\n")).toMatch(/circular include of "a\.sfz"/);
    // And it names the chain it was already reading, so the cycle is visible rather than merely reported.
    expect(result.problems.join("\n")).toMatch(/a\.sfz → b\.sfz/);
  });

  it("names a file it could not find, and stops rather than guessing", () => {
    const result = expandIncludes('#include "missing.sfz"', files({}));
    expect(result.text).toBe("");
    expect(result.problems).toEqual(['<root>:1: included file "missing.sfz" was not found']);
  });

  it("returns text with no include character for character unchanged, and still parses to regions", () => {
    const plain = "<global> tune=10\n<region> sample=a.wav pitch_keycenter=60\n";
    const result = expandIncludes(plain, files({}));
    expect(result.problems).toEqual([]);
    expect(result.text).toBe(plain);
    expect(result.included).toEqual([]);
    // The point of the whole feature: an expanded program feeds the parser that already exists.
    const expanded = expandIncludes('#include "k.sfz"', files({ "k.sfz": "<region> sample=kick.wav pitch_keycenter=36" }));
    expect(parseSfz(expanded.text)).toHaveLength(1);
  });
});
