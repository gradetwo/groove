/**
 * A real library, parsed.
 *
 * Every format claim in this workstream was a prediction until it met a file. This one meets the drum kit the manifest ships — `sfzinstruments/virtuosity_drums` @ `9f04cf9a7345`, the actual four files of its include chain, committed
 * as fixtures — and the shape it turns out to have is not the shape the earlier note assumed.
 *
 * The program file holds **no regions at all**, and that is not an obstacle: it is a routing document. `<control>` declares the CC defaults and their labels, three `<global>` blocks state the defaults for each microphone's regions, and the
 * regions arrive through `#include`. So the parser sees: `control` → `global` → include → `master` → `group` → include → `region`, four levels deep, with `<master>` and `<group>` opcodes inherited downward and a keymap file of
 * `#define`s naming the notes.
 *
 * **It reads all of it.** An earlier version of this file claimed two gaps — that includes had to fall back to the library root and that `$name` was never substituted — and both claims were wrong. They came from measuring with an incomplete
 * fixture set: the program includes `keymaps/keymap_basic.sfz`, the fixtures held only the different file `keymaps/default/keymap_basic.sfz`, so no definitions were loaded and every region kept a literal `$KICK_SNWRONG_KEY`. The expander
 * had implemented both behaviours already. These criteria now assert what it does, and the note about the missing files stays because a partial fixture must not be mistaken for a parser that gave up.
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
    expect(expanded.included).toContain("keymaps/keymap_basic.sfz");
    expect(expanded.included).toContain("mappings/kickmic_basic.sfz");
    expect(expanded.included).toContain("mappings/kickmic/kick_snoff_map.sfz");
    /**
     * **And the fallback that this file's own author needed**: `mappings/kickmic_basic.sfz` writes `#include "mappings/kick_dampen.sfz"`, which from the including file's directory would be `mappings/mappings/kick_dampen.sfz`. The
     * expander tries that first, then the library root, and the root is where the file is — so the path below is the second candidate having won.
     */
    expect(expanded.included).toContain("mappings/kick_dampen.sfz");
    expect(regions.length).toBe(16);
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

});

describe("what the parser already does with this library", () => {
  it("substitutes the keymap's definitions, so the regions carry note numbers rather than variable names", () => {
    /**
     * **The claim this replaces was wrong.** With the definition file in the chain, every region's key is the number the keymap defines — 35 — and nothing is left unresolved. A partial fixture made a working substitution look like a missing
     * one, which is why the fixture set now includes the file the program actually includes rather than a similarly named one.
     */
    const { regions } = parseProgram();
    const keys = new Set(regions.map((region) => region.opcodes.key ?? region.inherited.key));
    expect([...keys]).toEqual(["35"]);
    expect(unresolvedVariables(regions)).toEqual({ variables: [], regions: 0 });
  });

  it("resolves the key to a note number, the velocity layers, and the round-robin length", () => {
    // The typed fields rather than the raw opcode dictionary: `key` becomes `lokey`/`hikey`, and these are the values a note is matched against.
    const { regions } = parseProgram();
    expect(new Set(regions.map((region) => `${region.lokey}/${region.hikey}`))).toEqual(new Set(["35/35"]));
    // Four velocity layers, and every one of them present: a missing layer would be a silent region rather than an error.
    expect(new Set(regions.map((region) => region.hivel))).toEqual(new Set([31, 63, 95, 127]));
    expect(new Set(regions.map((region) => region.opcodes.seq_length))).toEqual(new Set(["4"]));
  });

  it("inherits `<master>` and `<group>` downward, and keeps the CC opcodes it does not act on", () => {
    const { regions } = parseProgram();
    const first = regions[0]!;
    // `ampeg_hold` is stated in the master block of one included file and reaches a region declared two includes deeper.
    expect(first.opcodes.ampeg_hold).toBe("0.2");
    /**
     * **Kept rather than dropped.** This library is full of CC-driven opcodes, and the subset does not act on them yet — but a parser that discarded them would make the file look simpler than it is, and the next reader of these regions
     * could not tell "the file does not say" from "we threw it away".
     */
    expect(first.opcodes.tune_cc72).toBe("1200");
    expect(first.opcodes.tune_curvecc72).toBe("1");
  });

  it("records that an outer `<global>`'s values do not reach regions inside an included `<master>`", () => {
    /**
     * **Measured, and not yet settled.** The program's first `<global>` states `locc101=1`, `tune_cc90=1200`, `note_polyphony=3` and `group=501` for the kick's microphone; the kick's regions carry none of them, because the included file
     * opens its own `<master>` and the parser clears the global scope there. Treating `<master>` as `<global>` is the documented minimal rule, and this is its consequence.
     *
     * It is invisible at rest: `locc101=1` passes at the default CC101 anyway, and `tune_cc90=1200` is about zero cents at the default CC90 of 63.5. So the library still plays — which is exactly why a file that works cannot settle
     * whether the reset is right. What settles it is sfizz at a **non-default** CC: if the outer `<global>`'s values survive, moving CC90 must transpose while this parser's regions stay put.
     */
    const program = readFileSync(path.join(ROOT, "01-basic-kit.sfz"), "utf8");
    expect(program).toMatch(/^locc101=1$/m);
    expect(program).toMatch(/^tune_cc90=1200$/m);
    const { regions } = parseProgram();
    expect(regions[0]!.opcodes.locc101).toBeUndefined();
    expect(regions[0]!.opcodes.tune_cc90).toBeUndefined();
  });
});
