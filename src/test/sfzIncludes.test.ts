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

  it("resolves a nested include against the main program, which is what the format states", () => {
    /**
     * ⭐ **The main file's directory is the base, at every depth** — sfzformat.com's `#include` page, verbatim: *"If the #included files are in another folder, the SFZ is
     * interpreted as if it was in the main SFZ file's path, not the path where the #included files are."* sfizz implements exactly that (`Parser.cpp`: `_originalDirectory`
     * is set once, from the first file opened), and this fixture is written the way the real libraries write it — `Data/group_ten.txt` includes `Data/ten_f_rr2.txt`, both
     * relative to the program.
     *
     * The previous fixture put the deep file under `keymaps/` and claimed the file-relative reading was "the path a real library relies on". No real library in the
     * manifest needs it, and the reading itself is what produced the doubled `Data/Data/…` 404s — see the criterion below.
     */
    const result = expandIncludes('#include "keymaps/basic.sfz"', files({ "keymaps/basic.sfz": '#include "deep/more.sfz"', "deep/more.sfz": "<region> sample=snare.wav" }));
    expect(result.problems).toEqual([]);
    // Relative to the main program (the root here), not to `keymaps/`.
    expect(result.included).toEqual(["keymaps/basic.sfz", "deep/more.sfz"]);
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
 * The base a real library needs, stated by the format and implemented by the reference engine.
 *
 * `Programs/mappings/kickmic_basic.sfz` (pinned commit `9f04cf9a7345`) includes `mappings/kick_dampen.sfz`, and that file sits at `Programs/mappings/kick_dampen.sfz`. That is
 * **`_originalDirectory / path`** — the main program's own directory — which is the one rule both primary sources state, so this library is the *rule's* evidence, not a
 * fallback's. A synthetic fixture could never have found this, which is why the criterion below is written in the shape of the real case rather than the shape I would have
 * invented.
 */
describe("expandIncludes — the real library's resolution rule", () => {
  it("reads the include from the main program's directory, which is where the real library put it", () => {
    const files = (map: Record<string, string>) => (path: string) => map[path];
    /**
     * The chain is written as the real one is **nested**, and that nesting is the whole point: the root is the first file of the chain, not the file being expanded.
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

  it("does not enter the including file's own directory, even when a file sits there", () => {
    const files = (map: Record<string, string>) => (path: string) => map[path];
    const asked: string[] = [];
    const recording = (map: Record<string, string>) => (path: string) => {
      asked.push(path);
      return map[path];
    };
    const result = expandIncludes('#include "keymaps/keymap.sfz"', recording({
      "Programs/keymaps/keymap.sfz": '#include "shared.sfz"',
      "Programs/keymaps/shared.sfz": "<region> sample=local.wav",
      "Programs/shared.sfz": "<region> sample=root.wav",
    }), { path: "Programs/01-basic-kit.sfz" });
    /**
     * ⭐ **SFZ's one rule wins, and the other reading is not even asked about.** The old version preferred the including file's directory here, which is the reading that
     * produces `Data/Data/…`: sfzformat.com says the include *"is interpreted as if it was in the main SFZ file's path, not the path where the #included files are"*, and
     * sfizz never builds the file-relative path at all.
     */
    expect(result.included).toEqual(["Programs/keymaps/keymap.sfz", "Programs/shared.sfz"]);
    expect(result.text).toContain("sample=root.wav");
    expect(asked, "the file-relative reading must not be probed").not.toContain("Programs/keymaps/shared.sfz");
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
 * ⭐ **The doubled path is never asked for — not by the reader, and not by the asynchronous fetch loop.**
 *
 * The owner's measurement on `/genre/bebop` (v2.34.40): the browser requested
 * `…/MTG%20Solo%20Saxophones/Data/Data/ten_f_rr2.txt` (**404**) and then `…/Data/ten_f_rr2.txt` (**200**) — the same shape for all six
 * `Data/ten_{p,f}_rrN.txt` and all sixteen `Data/vel_NN.txt` of Salamander Grand Piano, **22 of the 68 requests in one pass**. Both requests were
 * ours, and the second one came from `missing`: the expander reported **both** readings as "missing", and `remoteIncludes.ts` fetches every entry.
 *
 * The two primary sources state one base, so there is nothing to choose between and nothing to try twice. These criteria are written so that
 * reintroducing a second candidate — in the reader *or* in the `missing` list — fails them.
 */
describe("expandIncludes — one base, so no doubled path is ever asked for", () => {
  const files = (map: Record<string, string>) => (path: string) => map[path];

  it("asks for the MTG-shaped path once, and never for the doubled spelling", () => {
    // ⭐ The real nesting, with the real file names: the program is at the library root, the include is written from the program's directory, and the file that writes it sits one level down in `Data/`.
    const asked: string[] = [];
    const recording = (map: Record<string, string>) => (path: string) => {
      asked.push(path);
      return map[path];
    };
    const result = expandIncludes('#include "Data/group_ten.txt"', recording({
      "MTG Solo Saxophones/Data/group_ten.txt": '#include "Data/ten_f_rr2.txt"',
      "MTG Solo Saxophones/Data/ten_f_rr2.txt": "<region> sample=ten_f_02.flac",
    }), { path: "MTG Solo Saxophones/MTG Tenor Sax.sfz" });
    expect(result.included).toEqual(["MTG Solo Saxophones/Data/group_ten.txt", "MTG Solo Saxophones/Data/ten_f_rr2.txt"]);
    expect(result.text).toContain("sample=ten_f_02.flac");
    // (a) the correct address is the only one read, and (b) the doubled one is not even a candidate.
    expect(asked).toContain("MTG Solo Saxophones/Data/ten_f_rr2.txt");
    expect(asked).not.toContain("MTG Solo Saxophones/Data/Data/ten_f_rr2.txt");
    // ⭐ And the asynchronous caller is told to fetch exactly one path — this is the assertion that fails when `missing` reports both readings.
    expect(result.missing).toEqual([]);
  });

  it("reports one path per unresolvable include, never two readings of the same line", () => {
    /**
     * ⭐ The fetch-list half of the same defect, and the reason the reader assertion above is not enough: a **nested** include is what
     * `missing` carries, and only the file that wrote it can be read. The old code pushed `…/Data/Data/ten_f_rr2.txt` here *beside*
     * `…/Data/ten_f_rr2.txt`, and `remoteIncludes.ts` then fetched both — one guaranteed 404 beside one guaranteed 200. The chain is
     * written as the real one is nested, because at the top level the two readings coincide and this criterion could not fail.
     */
    const files: Record<string, string> = { "MTG Solo Saxophones/Data/group_ten.txt": '#include "Data/ten_f_rr2.txt"' };
    const result = expandIncludes('#include "Data/group_ten.txt"', (path) => files[path], {
      path: "MTG Solo Saxophones/MTG Tenor Sax.sfz",
    });
    expect(result.missing).toEqual(["MTG Solo Saxophones/Data/ten_f_rr2.txt"]);
    expect(result.missing.some((path) => path.includes("/Data/Data/")), "no doubled reading may reach the fetch list").toBe(false);
  });

  it("reads a doubled spelling only when the library really wrote one", () => {
    // Nothing is refused: a library that genuinely keeps a nested directory still resolves, because the written path is taken at face value.
    const result = expandIncludes('#include "mappings/mappings/x.sfz"', files({
      "Programs/mappings/mappings/x.sfz": "<region> sample=x.wav",
    }), { path: "Programs/01-basic-kit.sfz" });
    expect(result.text).toContain("sample=x.wav");
    expect(result.problems).toEqual([]);
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
