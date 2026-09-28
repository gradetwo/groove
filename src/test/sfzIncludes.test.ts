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

/**
 * The fallback that a **real** library forced.
 *
 * `Programs/mappings/kickmic_basic.sfz` (pinned commit `9f04cf9a7345`) includes `mappings/kick_dampen.sfz`, and that file sits at `Programs/mappings/kick_dampen.sfz` — so
 * resolving only from the including file produced `…/mappings/mappings/…` and found nothing 119 times over. Both bases are now tried, including-file first so the
 * documented behaviour is unchanged for files that follow it. A synthetic fixture could never have found this, which is why the criterion below is written in the shape of
 * the real case rather than the shape I would have invented.
 */
describe("expandIncludes — the real library's resolution rule", () => {
  it("falls back to the root when the including file's directory does not hold the path", () => {
    const files = (map: Record<string, string>) => (path: string) => map[path];
    /**
     * The chain is written as the real one is **nested**, and that nesting is the whole point: the root is the first file of the chain, not the file being expanded.
     *
     * The first version of this test called the two-level-deep file **as the top level**, where the root and the including file are the same directory — so both candidates
     * were identical, the fallback could never engage, and the test failed for a reason that had nothing to do with the code. Writing the fixture as the real chain is not
     * decoration; it is what makes the criterion able to fail.
     */
    const result = expandIncludes('#include "keymaps/kickmic_basic.sfz"', files({
      "Programs/keymaps/kickmic_basic.sfz": '#include "mappings/kick_dampen.sfz"',
      "Programs/mappings/kick_dampen.sfz": "<region> sample=kick.wav",
    }), { path: "Programs/01-basic-kit.sfz" });
    expect(result.problems).toEqual([]);
    // The root-relative path is the one that exists, and it is the one that was read.
    expect(result.included).toEqual(["Programs/keymaps/kickmic_basic.sfz", "Programs/mappings/kick_dampen.sfz"]);
    expect(result.text).toContain("sample=kick.wav");
  });

  it("still prefers the including file's own directory when both could match", () => {
    const files = (map: Record<string, string>) => (path: string) => map[path];
    const result = expandIncludes('#include "shared.sfz"', files({ "Programs/keymaps/shared.sfz": "<region> sample=local.wav", "Programs/shared.sfz": "<region> sample=root.wav" }), {
      path: "Programs/keymaps/keymap.sfz",
    });
    // SFZ's documented rule wins when it can be satisfied, so the fallback only ever rescues a case the rule cannot.
    expect(result.included).toEqual(["Programs/keymaps/shared.sfz"]);
  });
});
