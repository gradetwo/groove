/**
 * A real library, parsed.
 *
 * Every format claim in this workstream was a prediction until it met a file. This one meets the drum kit the manifest ships — `sfzinstruments/virtuosity_drums` @ `9f04cf9a7345`, the actual four files of its include chain, committed
 * as fixtures — and the shape it turns out to have is not the shape the earlier note assumed.
 *
 * The program file holds **no regions at all**, and that is not an obstacle: it is a routing document. `<control>` declares the CC defaults and their labels, three `<global>` blocks state the defaults for each microphone's regions, and the
 * regions arrive through `#include`. So the parser sees: `control` → `global` → include → `master` → `group` → include → `region`, four levels deep, with `<master>` and `<group>` opcodes inherited downward and two different keymap
 * `#define`s naming the notes.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expandIncludes } from "../audio/sfz/includes";
import { parseSfz, unresolvedVariables } from "../audio/sfz/parse";

const ROOT = "src/test/fixtures/sfz/virtuosity-drums";
/** The reader the mirror gives the include expander: a path relative to the program file, or nothing. */
const read = (relative: string) => {
  const full = path.join(ROOT, relative);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
};

function parseProgram(file = "01-basic-kit.sfz") {
  const expanded = expandIncludes(readFileSync(path.join(ROOT, file), "utf8"), read);
  return { expanded, regions: parseSfz(expanded.text) };
}

describe("a real library's include chain", () => {
  it("reaches the regions through the includes, and the program file itself has none of its own", () => {
    const program = readFileSync(path.join(ROOT, "01-basic-kit.sfz"), "utf8");
    expect(program).not.toMatch(/<region>/);
    const { expanded, regions } = parseProgram();
    expect(expanded.included).toContain("mappings/kickmic_basic.sfz");
    expect(expanded.included).toContain("mappings/kickmic/kick_snoff_map.sfz");
    expect(regions.length).toBeGreaterThan(0);
    /**
     * **The fixtures are four files of a much larger chain, so most includes are reported rather than followed — and the reports are the criterion.** Every problem names a path, none is silent, and each of them is a file this fixture set does
     * not hold: that is what makes the partial fixture honest rather than a parser that quietly gave up.
     */
    expect(expanded.problems.length).toBeGreaterThan(0);
    expect(expanded.problems.every((problem) => problem.includes("included file") && problem.includes("was not found"))).toBe(true);
  });

  it("keeps every region's sample distinct, and relative to the program as it was written", () => {
    const { regions } = parseProgram();
    const samples = regions.map((region) => region.sample);
    expect(new Set(samples).size).toBe(samples.length);
    /**
     * `../Samples/...` from a file three directories down resolves to `Samples/...` at the library root, which is where the bucket holds it — so the path is kept as written and the caller resolves it against the program's own
     * directory, the rule `mirrorPlan` already implements.
     */
    expect(samples.every((sample) => sample.startsWith("../Samples/"))).toBe(true);
  });

  it("reads the round-robin fields the mappings use, on the regions that declare them", () => {
    const { regions } = parseProgram();
    const text = readFileSync(path.join(ROOT, "mappings/kickmic/kick_snoff_map.sfz"), "utf8");
    const declared = (text.match(/^seq_length=/gm) ?? []).length;
    expect(declared).toBeGreaterThan(0);
    expect(regions.filter((region) => region.opcodes.seq_length !== undefined)).toHaveLength(declared);
  });

  /**
   * **The one thing standing between this parser and this library, measured rather than predicted.**
   *
   * `keymaps/default/keymap_basic.sfz` is 67 lines of `#define $KICK_SNWRONG_KEY 35` and its siblings, and the mappings write `key=$KICK_SNWRONG_KEY`. The parser collects those definitions but never substitutes them, so every one of the
   * sixteen regions carries the literal string as its key — one key for the whole kit, which would put every drum on one note.
   *
   * The criterion is the rule rather than the number: a value that contains a variable the definitions do not resolve must be **reported**, and the report must agree with what the regions contain. Substitution is the next piece of
   * parser work, and this test flips to asserting `key === "35"` when it lands.
   */
  it("reports every variable it could not substitute, agreeing with what the regions carry", () => {
    const { regions } = parseProgram();
    const report = unresolvedVariables(regions);
    const carrying = regions.filter((region) =>
      Object.values(region.opcodes).some((value) => typeof value === "string" && value.includes("$"))
    );
    expect(report.regions).toBe(carrying.length);
    expect(report.variables).toContain("$KICK_SNWRONG_KEY");
    // Named rather than dropped: a caller can say which note the instrument failed to place, instead of silently mapping every region onto one key.
    expect(report.variables.every((variable) => variable.startsWith("$"))).toBe(true);
  });
});

describe("the two things this library needs that the parser does not do", () => {
  const paths = new Set(
    (JSON.parse(readFileSync("public/samples/manifest.json", "utf8")).entries as { id: string; files: { path: string }[] }[])
      .find((entry) => entry.id === "virtuosity-drums-basic")!
      .files.map((file) => file.path)
  );

  it("resolves an include written from the library root, which is how this library writes them", () => {
    /**
     * `mappings/kickmic_basic.sfz` contains `#include "mappings/kick_dampen.sfz"`. Resolved against the including file's own directory — the rule the expander implements, and the rule most libraries follow — that path becomes
     * `mappings/mappings/kick_dampen.sfz`. **The mirror says which one this library means**: the root-relative form exists and the nested form does not.
     */
    expect(paths.has("Programs/mappings/kick_dampen.sfz")).toBe(true);
    expect(paths.has("Programs/mappings/mappings/kick_dampen.sfz")).toBe(false);
    // So a loader has to try the including file's directory first and the program root second, and report only when neither has it.
    expect(paths.has("Programs/keymaps/keymap_basic.sfz")).toBe(true);
  });

  it("has the definitions the mappings need, and the mappings use them", () => {
    /**
     * The other gap, measured: `keymaps/default/keymap_basic.sfz` is 67 lines of `#define $NAME value`, and the mappings write `key=$KICK_SNWRONG_KEY`. The parser collects the definitions and does not substitute them, so all sixteen
     * regions of the kick microphone carry one literal key — which would put the whole kit on a single note.
     */
    const keymap = readFileSync(path.join(ROOT, "keymaps/default/keymap_basic.sfz"), "utf8");
    const defined = new Set((keymap.match(/^#define\s+(\$[A-Za-z0-9_]+)/gm) ?? []).map((line) => line.replace(/^#define\s+/, "").trim()));
    /**
     * A rule rather than a count: **every variable the mapping file uses is defined by the keymap file**. That is what makes substitution possible at all — a name without a definition could not be resolved by any loader, and one with a
     * definition is what the next piece of work reads.
     */
    const usedInMapping = new Set(readFileSync(path.join(ROOT, "mappings/kickmic_basic.sfz"), "utf8").match(/\$[A-Za-z0-9_]+/g) ?? []);
    const mappingUsesKey = new Set([...usedInMapping].filter((name) => name.includes("KEY") || name.includes("TIME")));
    for (const name of mappingUsesKey) expect(defined, `${name} is not defined`).toContain(name);
    // The declarations are also used by files this fixture set does not hold, so the keymap is larger than what one mapping file needs.
    expect(defined.size).toBeGreaterThan(mappingUsesKey.size);
    // The `key=` sits in the `<group>` of the microphone's mapping file, not in the region file the group includes.
    const mapping = readFileSync(path.join(ROOT, "mappings/kickmic_basic.sfz"), "utf8");
    expect(mapping).toMatch(/key=\$KICK_SNWRONG_KEY/);
    {
      const { regions } = parseProgram();
      const keys = new Set(regions.map((region) => region.opcodes.key ?? region.inherited.key));
      // One literal key, not a number: substitution is the next parser change, and this assertion is what will change with it.
      expect([...keys]).toEqual(["$KICK_SNWRONG_KEY"]);
    }
  });
});
