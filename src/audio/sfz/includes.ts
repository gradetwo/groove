/**
 * SFZ's `#include`, resolved as a **pure** function with an injected reader.
 *
 * Measured reason this exists: the first real library this project pulled down (`sfzinstruments/virtuosity_drums`, `Programs/01-basic-kit.sfz`) contained **zero** `<region>`
 * headers, because the regions live in `keymaps/keymap_basic.sfz` and the program reaches them with `#include`. Real libraries separate a program from its keymap, so this
 * is not an optional feature — without it a library parses to nothing at all.
 *
 * `parseSfz` still touches no I/O, and neither does this: the reader is injected, which is what makes the three failure modes that matter here — a **cycle**, a **missing
 * file** and a **nesting depth** — testable without a network and without a browser.
 */
import { splitInlineDefines, substituteVariables } from "./defines";

export interface IncludeReader {
  /** Returns the file's text, or `undefined` when there is no such file. */
  (path: string): string | undefined;
}

export interface ExpandIncludesResult {
  /** The text with every resolvable include replaced **in place**, so included regions land where the directive sat. */
  text: string;
  /** Every problem found, named — never a silent omission. */
  problems: string[];
  /** The paths that were read, in the order they were resolved, so a caller can report what an instrument actually loaded. */
  included: string[];
  /**
   * ⭐ **Which file each line of `text` came from** — the provenance the expander has and a flattened text loses.
   *
   * A sample path is written **inside** the file that declares it, and this project needs to be able to say which file that was: `karoryfer.war-tuba`'s articulation
   * files live in `Programs/legato/` and name their samples `..\Samples\…`, and the reference engine resolves that against the **root program's** directory (measured:
   * sfizz renders the root program at peak 0.0604 and the same file as its own entry point at 0.00003), so this is not what the engine does — it is what a caller who
   * *wants* the declaring file's reading needs in order to have it without a second include expander (`sampleAssetForPath(…, { declaredIn })`).
   *
   * One entry per contiguous run of lines, so it is small: a run of `Programs/legato/staccato_dyn.sfz` covering 200 lines is one entry, not 200. The list is built
   * during the same walk that builds `text`, so the two cannot drift.
   */
  sources: Array<{ from: number; to: number; file: string }>;
  /**
   * **The include paths the reader could not supply**, deduplicated and in the order they were met.
   *
   * `problems` already describes each one in a sentence, but an **asynchronous** caller needs the paths themselves: the browser cannot read synchronously, so it runs this function with whatever it
   * has, fetches exactly what is missing, and runs the same function again. That keeps the include semantics in **one** implementation instead of growing a second, async copy of them.
   */
  missing: string[];
}

/** Joins a directory and a path without inventing a resolver: SFZ paths are relative, and `..` is normal in them. */
function resolvePath(fromPath: string, wanted: string): string {
  if (wanted.startsWith("/") || /^[a-zA-Z]+:/.test(wanted)) return wanted;
  const directory = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const parts = `${directory}/${wanted}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * An include **anywhere in a line**, not only one that owns the whole line: Salamander Grand Piano writes `<group> #include "Data/vel_01.txt" lovel=1 hivel=26 #include "Data/region.txt"`, and the earlier whole-line rule silently ignored every one of them.
 *
 * `#define` is read by the **same rule the pure expander in `defines.ts` uses** — `splitInlineDefines`/`definedNamesAt` live there and are imported here,
 * because a second opinion about where a directive may sit is how the two layers would drift. The real file that needed this is
 * `sfzinstruments/kinwie.dim-cabasa@016457e5`, whose ten definitions ride on the `<group>` header that uses them.
 */
const INCLUDE = /#include\s+"([^"]+)"/g;

/**
 * `$VAR` substitution, scoped **globally and in order** — decided by measurement rather than by taste.
 *
 * The real library defines its keys in `Programs/keymaps/keymap_basic.sfz` (`#define $KICK_SNRIGHT_KEY 36`) and uses them in files reached later, deeper in the include
 * tree, which sfizz resolves. A per-file scope would not reproduce that; a global map that grows as the tree is walked does. Definitions are therefore inherited by
 * includes **and** by whatever the parent expands afterwards, which is the rule that makes this library read the way sfizz reads it.
 *
 * ⭐ **The name boundary is `defines.ts`'s rule too, and it is a defect fix rather than a preference.** A plain `\$([A-Za-z_][A-Za-z0-9_]*)` replace treats `$POS_01`
 * as one name and therefore never substitutes `$POS` where `_01` is literal text — which is exactly what `dim-cabasa` writes. `substituteVariables` picks the
 * longest defined name that prefixes the token and leaves the remainder alone; an undefined name is left as written, so the parser still marks it.
 */
function substitute(line: string, defines: Map<string, string>): string {
  return substituteVariables(line, defines).text;
}

/**
 * Where an include's path is resolved from — and this is **evidence-driven, not guessed**.
 *
 * The first version resolved only against the **including file's directory**, which is what SFZ says and what a synthetic fixture cannot contradict. Running the real
 * library showed it is not enough: `Programs/mappings/kickmic_basic.sfz` contains `#include "mappings/kick_dampen.sfz"`, and that file lives at
 * `Programs/mappings/kick_dampen.sfz` — so resolving from the including file produced `Programs/mappings/mappings/kick_dampen.sfz` and found nothing, 119 times over.
 *
 * So both bases are tried, in this order, and the choice is recorded here because the fallback is not a guess: the file that needs it is a real, pinned library. Trying
 * the including file first keeps the documented behaviour intact for files that follow it; falling back to the root keeps this library working.
 */
function resolveCandidates(rootPath: string, fromPath: string, wanted: string): string[] {
  if (wanted.startsWith("/") || /^[a-zA-Z]+:/.test(wanted)) return [wanted];
  const relative = resolvePath(fromPath, wanted);
  const fromRoot = resolvePath(rootPath, wanted);
  if (relative === fromRoot) return [relative];
  /**
   * ⭐ **The doubled candidate goes last, and that is a fact about the path rather than a guess about the library.**
   *
   * The owner's report: fetching a real library threw a wall of 404s — `Programs/mappings/mappings/oh/kick_snon_map.sfz` among them — and then asked for `Programs/mappings/oh/kick_snon_map.sfz` and got a 200. Both requests were ours: the file-relative reading goes first (the documented rule), then the root-relative fallback, and this library needs the fallback. That order was measured, and it is why the fallback exists.
   *
   * But **when the file-relative reading would enter the same directory twice** — the including file lives in `mappings/` and the include starts with `mappings/` — that candidate cannot be what the line means: it would have to say "go into `mappings`, and then into `mappings` again". So the root-relative candidate is asked for first, the 404 stops happening in the ordinary case, and the doubled reading survives only as a genuine last resort. **Nothing is refused**: both are still tried, in the order the evidence supports.
   */
  const directory = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const fromTail = directory.slice(directory.lastIndexOf("/") + 1);
  const wantedHead = wanted.split("/")[0] ?? "";
  return wantedHead !== "" && wantedHead === fromTail ? [fromRoot, relative] : [relative, fromRoot];
}

/** The file whose run covers output line `line` in a child expansion's map, or `undefined` when the map is empty. */
function sourceFileFor(runs: ReadonlyArray<{ from: number; to: number; file: string }>, line: number): string | undefined {
  for (const run of runs) if (line >= run.from && line < run.to) return run.file;
  return undefined;
}

export function expandIncludes(
  text: string,
  read: IncludeReader,
  {
    path = "",
    maxDepth = 8,
    stack = [] as string[],
    defines = new Map<string, string>(),
  }: { path?: string; maxDepth?: number; stack?: string[]; defines?: Map<string, string> } = {}
): ExpandIncludesResult {
  const problems: string[] = [];
  const included: string[] = [];
  const missing: string[] = [];
  /**
   * Line endings are normalised **first**, because real libraries ship `\r\n`.
   *
   * Measured: eight `#define` lines in `virtuosity_drums`' keymap carry both a trailing comment **and** a carriage return, and none of them matched — leaving
   * `$FLATRIDE_CRASH_KEY` (55) and seven others undefined, which showed up as twelve regions that could not be resolved. Normalising here is justified on its own terms:
   * a parser that only reads the line endings of the machine it was written on is not reading the file.
   */
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  /**
   * The provenance of `out`, appended in the same places the output is, so the two cannot drift.
   *
   * ⭐ **The entry point seeds it, because a region written in the entry file must be attributable too** — a list that only ever named included files would make
   * `sourcePath` absent for the common case and present only for the interesting one, and a caller could not tell "declared in the program" from "provenance not
   * recorded". `path` may be `""` for a caller that passes no path at all, and an empty string is kept rather than dropped: it means the same as "the program",
   * which is what `defaultPath`'s absent case means too.
   */
  const sources: Array<{ from: number; to: number; file: string }> = [];
  /** One output line, attributed to `file` — coalesced with the previous run when it is the same file. `to` is exclusive. */
  const pushLine = (line: string, file: string): void => {
    const last = sources[sources.length - 1];
    if (last && last.file === file && last.to === out.length) last.to = out.length + 1;
    else sources.push({ from: out.length, to: out.length + 1, file });
    out.push(line);
  };

  /**
   * Comments are stripped **before** a directive is recognised, and that is a bug fix rather than tidiness.
   *
   * The real library writes `#define $HH_PPREROLL 1000 //Was effectively 0 up to version 0.925`, and the pattern that reads definitions anchored its end with `\s*$` — so
   * every define carrying a trailing comment was **silently ignored**, which left 48 regions holding unresolved variables. It is the same mistake as the parser's very
   * first one (`<region> sample=… // comment` on a line), one layer down: the line grammar was assumed rather than read.
   */
  const stripComment = (line: string): string => line.replace(/\/\/.*$/, "");

  /**
   * The chain is seeded with the **entry point**, and that seeding is a bug fix rather than tidiness.
   *
   * The fallback resolves a root-relative path against `chain[0]`. With `stack` empty at the top level, the first recursive call was the first thing to populate it — so
   * `chain[0]` became the first *included* file, the root was computed as that file's directory, and the fallback looked in `Programs/keymaps/mappings/…` instead of
   * `Programs/mappings/…`. A criterion written as the real nested chain caught it; the flat version of the same criterion could not have.
   */
  const chain = stack.length > 0 ? stack : [path];

  lines.forEach((rawLine, index) => {
    const line = stripComment(rawLine);
    /**
     * ⭐ **A `#define` is a directive wherever it sits on the line, and what follows it stays part of the line.**
     *
     * The old pattern was `^\s*#define\s+\$NAME\s+(\S+)\s*$` — whole-line, single-token value — so `kinwie.dim-cabasa`'s
     * `<group> #define $POS 1 seq_position=$POS` was read as an ordinary `<group>` line holding an unknown opcode `#define`. The definition was never made, so all 250 of
     * its regions carried a literal `$POS` and none of them could answer a note. The rule now is the format's own: a directive begins a statement (sfizz's parser takes
     * `#` ⇒ directive at the first non-space character of each statement), its value runs to the end of the statement's line, and the rest of the same line is more of
     * the file.
     */
    const { pieces, defines: found, found: anyDefine } = splitInlineDefines(line);
    const withoutDefines = anyDefine ? pieces.map((piece) => piece.text).join("") : line;
    if (anyDefine) {
      /**
       * **Definitions are made in file order, before the rest of the line is rendered** — and that is not a shortcut for the same-line case, it is the semantics:
       * a definition applies from its own point onward, so `seq_position=$POS` on the line that defines `$POS` reads the value just defined, exactly as sfizz's
       * left-to-right statement scan does. The value is stored as written here rather than expanded, because the caller expands it when it renders the rest of the
       * line — `defines.ts` is where that ordering is asserted with a criterion.
       */
      for (const define of found) {
        defines.set(define.name, substitute(define.value, defines));
      }
      // A line that was nothing but a directive produces no output of its own — not even the space where the directive sat. One that shares its line keeps the rest of it.
      if (withoutDefines.trim() === "") return;
    }

    /**
     * ⭐ **Includes are recognised anywhere in a line, and a line may hold several — Salamander Grand Piano writes two, mixed with its own opcodes.**
     *
     * The expander required the whole line to be nothing but an include. The file it was written for has other ideas:
     *
     * ```
     * <group> #include "Data/vel_01.txt" lovel=1 hivel=26 #include "Data/region.txt"
     * ```
     *
     * Every include in that file was ignored — the velocity layers and the region definitions never expanded — while the file still parsed well enough to look as though it had worked. The rule is now the one SFZ states: an include is replaced **in place**, the rest of the line stays, and there may be as many as the file likes.
     */
    const includes = [...withoutDefines.matchAll(INCLUDE)].filter((match) => match.index !== undefined);
    if (includes.length === 0) {
      pushLine(substitute(withoutDefines, defines), path);
      return;
    }

    /**
     * ⭐ **The line is assembled fragment by fragment, and each fragment keeps its own file** — which is the whole point of the map.
     *
     * Fragments are joined with **no separator** (the old `pieces.join("")`), so `cursor` tracks the byte offset in the assembled line and `mine` the bytes belonging
     * to this file. Whenever a fragment of another file interrupts — an included file's text — the current run of this file's own text is closed, and a new one starts
     * after it. A line that is one `#include` on its own therefore has `mine === ""` and contributes nothing, so no output line is ever attributed to a file that did
     * not write it.
     */
    /**
     * ⭐ **A line that is nothing but `#include`s expands into the included lines themselves; a line that carries other text keeps them in place.**
     *
     * Both shapes are real and they need different treatment for the `sources` map to mean anything. The **bare include** is the common case in every library
     * (`#include "legato/staccato_dyn.sfz"` owns its line, and inside that file are hundreds of region lines), and treating its expansion as one output line would
     * claim an entire 4 000-line file was output line 70 — which is exactly what the first version of this map did, and the first lookup of a real region returned
     * `undefined` for it. The **line with an include in the middle** is Salamander Grand Piano's `<group> #include … lovel=1 hivel=26 #include …`, where the include
     * is replaced *in place* and the result is one line, which is the shape `sfzIncludes.test.ts` pins.
     */
    const bare = includes.length > 0 && withoutDefines.replace(INCLUDE, "").trim() === "";
    let cursor = 0;
    let mine = "";
    /** How many characters of this output line the line's own file wrote — the other side of the comparison below. */
    let ownLength = 0;
    const contributions: Array<{ file: string; length: number }> = [];
    const where = `${path || "<root>"}:${index + 1}`;
    for (const match of includes) {
      const start = match.index!;
      const own = substitute(withoutDefines.slice(cursor, start), defines);
      mine += own;
      ownLength += own.length;
      cursor = start + match[0]!.length;
      const candidates = resolveCandidates(chain[0]!, path, match[1]!);
      // The first candidate that exists wins; if none does, the error names the one SFZ's own rule would have chosen, which is the informative one.
      const wanted = candidates.find((candidate) => read(candidate) !== undefined) ?? candidates[0]!;

      if (chain.includes(wanted)) {
        // A cycle is reported rather than followed: includes can legitimately reference each other, and an unguarded resolver recurses until the stack dies.
        problems.push(`${where}: circular include of "${wanted}" (already reading ${chain.join(" → ")})`);
        continue;
      }
      if (chain.length >= maxDepth) {
        problems.push(`${where}: include depth ${chain.length + 1} exceeds maxDepth ${maxDepth} at "${wanted}"`);
        continue;
      }

      const child = read(wanted);
      if (child === undefined) {
        /**
         * **Every candidate, not just the one reported.** The resolver tries the including file's directory first and the root fallback second, and for a real library the **second** is usually the right one: this library writes `#include "mappings/…"` from inside `Programs/mappings/…`, so the file-relative candidate gets a doubled `mappings/` while the root-relative one is correct. Reporting only `candidates[0]` meant an asynchronous caller could never fetch the candidate that would have worked — the loop fetched the wrong path, got a 404, and the library resolved to no regions.
         */
        for (const candidate of candidates) if (!missing.includes(candidate)) missing.push(candidate);
        problems.push(`${where}: included file "${wanted}" was not found`);
        continue;
      }

      const nested = expandIncludes(child, read, { path: wanted, maxDepth, stack: [...chain, wanted], defines });
      if (bare) {
        // Own lines, each attributed to the file that wrote it. A child's own text already carries its own runs, so they are copied rather than rebuilt.
        for (const [offset, line] of nested.text.split("\n").entries()) {
          pushLine(line, sourceFileFor(nested.sources, offset) ?? wanted);
        }
      } else {
        mine += nested.text;
        contributions.push({ file: wanted, length: nested.text.length });
      }
      problems.push(...nested.problems);
      included.push(wanted, ...nested.included);
    /**
     * **`nested.missing` has to be merged too, and it was not.** `nested.problems` and `nested.included` were collected from the recursive call, but the paths a nested file could not read were
     * dropped — so a top-level caller saw `missing: []` while `problems` listed 119 unresolvable includes. For a synchronous reader that only costs a worse message; for an **asynchronous** caller it
     * is fatal, because `missing` is the list it fetches: the first level resolved, every level below it silently stayed unfetched, and the library parsed to **zero regions** while reporting nothing
     * wrong at the top.
     */
    missing.push(...nested.missing);
    missing.splice(0, missing.length, ...new Set(missing));
    }
    // Whatever followed the last include on the line: `<group> #include "…" lovel=1` keeps its `lovel=1`.
    const tail = substitute(withoutDefines.slice(cursor), defines);
    mine += tail;
    ownLength += tail.length;
    /**
     * ⭐ **A line that carried its own text belongs to the file that wrote that text.** The comparison is against the sum of the included fragments, so a
     * `<group> #include "…" lovel=1` line is attributed to the group's own file (which is also the file whose `default_path` governs it), and a line whose own text is
     * a mere space around a mid-line include is attributed to the include that filled it. Ties go to the line's own file, the conservative choice: its `sourcePath` is
     * the one a caller can already infer from the program URL.
     */
    if (!bare) {
      const winner = contributions.reduce<{ file: string; length: number } | null>(
        (best, entry) => (entry.length > (best?.length ?? -1) ? { file: entry.file, length: entry.length } : best),
        null
      );
      pushLine(mine, winner !== null && winner.length > ownLength ? winner.file : path);
    }
  });

  return { text: out.join("\n"), problems, included, missing, sources };
}
