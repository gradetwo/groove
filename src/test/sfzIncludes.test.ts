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

/**
 * `#define` and `$VAR`, with the scope rule the real library forced: **global and in order**.
 *
 * `Programs/keymaps/keymap_basic.sfz` defines keys and files reached later in the include tree use them — which a per-file scope could not reproduce, and which is why sfizz
 * resolved `key=$KICK_SNRIGHT_KEY` to 36 while our parser left it literal and matched every note. The last criterion is the loop back to that defect: an **undefined**
 * variable is left untouched, so `parseSfz` still marks the region and it never answers a note.
 */
describe("expandIncludes — defines and substitution", () => {
  it("substitutes a variable defined earlier in the same file", () => {
    const result = expandIncludes("#define $KEY 36\n<region> key=$KEY", files({}));
    expect(result.problems).toEqual([]);
    // The `#define` line produces **no output** — it changes what later lines mean rather than being content, which is also why there is no leading newline.
    expect(result.text).toBe("<region> key=36");
  });

  it("carries a definition into a file reached later in the tree, which is the real library's shape", () => {
    const result = expandIncludes('#define $KICK 36\n#include "mappings/kick.sfz"', files({ "Programs/mappings/kick.sfz": "<group>\nkey=$KICK" }), { path: "Programs/01.sfz" });
    expect(result.problems).toEqual([]);
    // The included file sees the parent's definition, and so does anything the parent expands after it.
    expect(result.text).toContain("key=36");
  });

  it("leaves an undefined variable untouched, so the region stays unselectable rather than defaulting", () => {
    const result = expandIncludes("<region> key=$NEVER_DEFINED", files({}));
    // Untouched here — and `parseSfz` then marks it unresolved, which is the behaviour proved in the parse criteria.
    expect(result.text).toBe("<region> key=$NEVER_DEFINED");
    const [region] = parseSfz(result.text);
    expect(region!.unresolved).toEqual(["$NEVER_DEFINED"]);
  });

  it("does not change text that has neither a define nor an include", () => {
    const plain = "<global> tune=10\n<region> sample=a.wav\n";
    expect(expandIncludes(plain, files({})).text).toBe(plain);
  });
});

/**
 * A trailing comment on a directive — the bug that left 48 regions of a real library unresolvable.
 *
 * The library writes `#define $HH_PPREROLL 1000 //Was effectively 0 up to version 0.925`, and the definition pattern anchored its end with `\s*$`, so every define carrying a
 * comment was silently ignored. The parser had stripped `//` since its first version; the preprocessor had not, which is the same line-grammar assumption one layer down.
 */
describe("expandIncludes — comments on directives", () => {
  it("still reads a define that carries a trailing comment", () => {
    const result = expandIncludes("#define $KEY 36 //GM splash cymbal key\n<region> key=$KEY", files({}));
    expect(result.problems).toEqual([]);
    expect(result.text).toBe("<region> key=36");
  });

  it("still reads an include that carries a trailing comment", () => {
    const result = expandIncludes('#include "k.sfz" // the keymap\n', files({ "k.sfz": "<region> sample=a.wav" }));
    expect(result.problems).toEqual([]);
    expect(result.text).toContain("sample=a.wav");
  });
});

/**
 * Windows line endings, which a real library actually ships.
 *
 * Eight `#define` lines in `virtuosity_drums`' keymap carry both a trailing comment and a carriage return, and none matched the definition pattern — so `$FLATRIDE_CRASH_KEY`
 * (55) and seven others were never defined, and twelve regions came out unresolvable. The fix is to normalise line endings before reading anything, which is justified on
 * its own terms rather than as a patch for one file.
 */
describe("expandIncludes — CRLF files", () => {
  it("reads a define and an include from a file with Windows line endings", () => {
    const crlf = "#define $KEY 36 //GM splash cymbal key\r\n#include \"k.sfz\"\r\n<region> key=$KEY\r\n";
    const result = expandIncludes(crlf, files({ "k.sfz": "<region> sample=a.wav\r\n" }));
    expect(result.problems).toEqual([]);
    expect(result.text).toContain("key=36");
    expect(result.text).toContain("sample=a.wav");
    // And no carriage returns survive into the parsed output, so downstream matching never has to think about them.
    expect(result.text.includes("\r")).toBe(false);
  });
});

/**
 * `included` — the list of files the expander read — pinned, because the mirror is about to depend on it.
 *
 * The structural gap that produced an unreachable program was this: the mirror plan was derived from `sample=` opcodes and said nothing about `.sfz` files, so **419 program files were never
 * uploaded** while the check on the entry program passed. The expander already knows every file it read, so the plan can mirror exactly those instead of copying a directory and hoping. That
 * makes this list load-bearing, and a load-bearing list needs a contract rather than an assumption.
 *
 * What the mirror needs from it, and therefore what is asserted: **every file the expansion actually read is named**, nested includes included.
 */
describe("the expander reports the files it read", () => {
  it("names nested includes, so a mirror can mirror exactly them", () => {
    const files: Record<string, string> = {
      "entry.sfz": '<region> sample=a.wav key=38\n#include "a.sfz"\n',
      "a.sfz": '<region> sample=b.wav key=39\n#include "b.sfz"\n',
      "b.sfz": "<region> sample=c.wav key=40\n",
    };
    const result = expandIncludes(files["entry.sfz"]!, (path) => files[path], { path: "entry.sfz" });
    // Both hops, not just the first: a mirror that stopped at one level would leave the deeper includes missing, which is the same silence by a shorter route.
    expect(result.included).toContain("a.sfz");
    expect(result.included).toContain("b.sfz");
    expect(result.problems).toEqual([]);
  });
});

/**
 * `missing` — the paths the reader could not supply, which is what an asynchronous caller loops on.
 *
 * A browser cannot read synchronously, so it cannot be handed to `expandIncludes` directly. The fix is not a second async expander (a second copy of the include semantics) but **waves**: run the
 * one implementation with whatever is available, fetch exactly what it could not read, run it again. That loop needs the **paths**, not sentences — and `problems` only ever had sentences.
 */
describe("the expander reports what it could not read", () => {
  it("lists a missing include by path, once, and still explains it", () => {
    const result = expandIncludes('<region> sample=a.wav key=38\n#include "gone.sfz"\n#include "gone.sfz"\n', () => undefined, { path: "entry.sfz" });
    // By path: the caller's next step is to fetch it, and it needs a URL, not a message.
    expect(result.missing).toEqual(["gone.sfz"]);
    // And the sentence is still there, because a human reading a log needs one.
    expect(result.problems.join("\n")).toMatch(/gone\.sfz/);
  });

  it("reports nothing missing when everything resolves", () => {
    const files: Record<string, string> = { "entry.sfz": '#include "a.sfz"\n', "a.sfz": "<region> sample=a.wav key=38\n" };
    const result = expandIncludes(files["entry.sfz"]!, (path) => files[path], { path: "entry.sfz" });
    // An empty list is what ends the wave loop, so it has to be empty rather than merely problem-free.
    expect(result.missing).toEqual([]);
    expect(result.problems).toEqual([]);
  });
});

/**
 * `missing` must survive recursion — the bug that made an asynchronous caller see `missing: []` while `problems` listed 119 unresolvable includes.
 *
 * The synchronous reader only suffered a worse message, so nothing failed. The **asynchronous** caller is driven by `missing`: it fetched the first level, every level below stayed unfetched, and the
 * library parsed to **zero regions** while reporting nothing wrong at the top. A real library is 126 includes deep, so "one level worked" was indistinguishable from "nothing worked".
 */
describe("missing paths propagate out of nested includes", () => {
  it("reports a missing include two levels down, not just the first level", () => {
    const files: Record<string, string> = { "entry.sfz": '#include "a.sfz"\n', "a.sfz": '#include "b.sfz"\n' };
    const result = expandIncludes(files["entry.sfz"]!, (path) => files[path], { path: "entry.sfz" });
    // `b.sfz` was fetched by nobody, and the caller that could have fetched it only reads this list. **Before the fix this array was empty** — the parent collected `nested.problems` and
    // `nested.included` but dropped `nested.missing`, so an asynchronous caller resolved exactly one level and the library parsed to zero regions.
    expect(result.missing).toContain("b.sfz");
  });
});

/**
 * The order of the two candidates, which is what decides how many 404s a real library costs.
 *
 * The owner's report: fetching `virtuosity_drums` threw a wall of 404s, among them
 * `Programs/mappings/mappings/oh/kick_snon_map.sfz`, and then fetched `Programs/mappings/oh/kick_snon_map.sfz` and got a 200. The doubled request was ours — the documented file-relative rule tried first, then the root fallback — and it is not a resolution *failure*, only a wasted round trip repeated across hundreds of includes.
 *
 * What makes it avoidable is that the doubled spelling is **visibly** doubled: a file in `mappings/` including `mappings/…` would mean entering `mappings` twice. So the reading that cannot be intended is asked for last, without refusing it.
 */
describe("expandIncludes — the doubled candidate is asked for last", () => {
  const files = (map: Record<string, string>) => (path: string) => map[path];

  it("prefers the root reading when the file-relative one would repeat a directory", () => {
    // ⭐ The exact case from the report, with the file that produced it.
    const asked: string[] = [];
    const recording = (map: Record<string, string>) => (path: string) => {
      asked.push(path);
      return map[path];
    };
    /**
     * The chain is written **as the real one is nested**, and that is what makes this criterion able to fail: when the two-level file is called as the top level, the root and its own directory are the same path, there is nothing to order, and the criterion would pass against the broken code.
     */
    const result = expandIncludes('#include "mappings/kickmic_basic.sfz"', recording({
      "Programs/mappings/kickmic_basic.sfz": '#include "mappings/oh/kick_snon_map.sfz"',
      "Programs/mappings/oh/kick_snon_map.sfz": "<region> sample=kick.wav",
    }), { path: "Programs/01-basic-kit.sfz" });
    expect(result.included).toEqual(["Programs/mappings/kickmic_basic.sfz", "Programs/mappings/oh/kick_snon_map.sfz"]);
    // The doubled spelling is never *read* — the reader is only ever asked for the one that exists.
    expect(asked).not.toContain("Programs/mappings/mappings/oh/kick_snon_map.sfz");
    expect(result.missing, "the doubled path was reported missing to the caller, which is what caused the 404").toEqual([]);
  });

  it("still reads a file whose path really is doubled, because nothing was refused", () => {
    // The rule only reorders: a library that genuinely keeps a doubled directory still resolves, one request later.
    const result = expandIncludes('#include "mappings/kickmic_basic.sfz"', files({
      "Programs/mappings/kickmic_basic.sfz": '#include "mappings/mappings/x.sfz"',
      "Programs/mappings/mappings/mappings/x.sfz": "<region> sample=x.wav",
    }), { path: "Programs/01-basic-kit.sfz" });
    expect(result.text).toContain("sample=x.wav");
  });

  it("keeps the documented rule first when no directory would repeat", () => {
    // Unchanged from before: the including file's own directory wins when both readings are possible.
    const result = expandIncludes('#include "shared.sfz"', files({
      "Programs/keymaps/shared.sfz": "<region> sample=keymap.wav",
      "Programs/shared.sfz": "<region> sample=root.wav",
    }), { path: "Programs/keymaps/keymap.sfz" });
    expect(result.included).toEqual(["Programs/keymaps/shared.sfz"]);
  });
});

/**
 * **An include that does not own its line, and a line that carries two.**
 *
 * Muse, using the MCP server to build a nine-movement piece, reported that Salamander Grand Piano's pitched regions never expanded. The reason was here: the expander required the whole line to be nothing but an include, and the real file writes
 *
 * ```
 * <group> #include "Data/vel_01.txt" lovel=1 hivel=26 #include "Data/region.txt"
 * ```
 *
 * so every include in that file was ignored — and the file still parsed well enough to look as though it had worked. Measured against the real library after the fix: **7 files expanded instead of 49**, **161 regions instead of 1121**.
 */
describe("expandIncludes — includes inside a line", () => {
  const files = (map: Record<string, string>) => (path: string) => map[path];

  it("replaces an include in place and keeps the rest of the line", () => {
    // ⭐ The exact shape from the real file, including the two includes and the opcodes between them.
    const result = expandIncludes('<group> #include "Data/vel_01.txt" lovel=1 hivel=26 #include "Data/region.txt"', files({
      "Data/vel_01.txt": "amp_velcurve_1=0.2",
      "Data/region.txt": "<region> sample=a.wav",
    }), { path: "Program.instrument.sfz" });
    expect(result.problems).toEqual([]);
    expect(result.included).toEqual(["Data/vel_01.txt", "Data/region.txt"]);
    // The line's own content survives, in order, around what each include brought.
    expect(result.text).toBe("<group> amp_velcurve_1=0.2 lovel=1 hivel=26 <region> sample=a.wav");
  });

  it("still expands an include that owns its line, which is the common case", () => {
    const result = expandIncludes('#include "a.sfz"', files({ "a.sfz": "<region> sample=a.wav" }), { path: "p.sfz" });
    expect(result.text).toBe("<region> sample=a.wav");
  });

  it("reports a missing include without losing the line it was on", () => {
    // A line that keeps working around a broken include is a library that half-loads, which is worth seeing rather than guessing at.
    const result = expandIncludes('<group> #include "gone.sfz" lovel=1', files({}), { path: "p.sfz" });
    expect(result.missing).toEqual(["gone.sfz"]);
    expect(result.text).toBe("<group>  lovel=1");
    expect(result.problems.join(" ")).toContain("gone.sfz");
  });
});
