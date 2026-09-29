/**
 * SFZ's `#define` layer — the thing whose absence makes a whole library silent rather than one opcode wrong.
 *
 * `parse.ts` already records the consequence: an unresolved `key=$KICK_SNRIGHT_KEY` made **every region match every note**, so the parser marks such regions and refuses to match them. That guard is right, and its cost is
 * that a library written with variables does not sound at all. Two facts make the fix worth having now: Salamander Grand Piano is 713.8 MB of samples behind a 2113-byte file that is mostly `#define`s, and the
 * Karoryfer instruments in the plan carry 122 SFZ files between them.
 *
 * **Variables are substituted in keys as well as values.** Reading Salamander showed why that matters: it writes `label_cc$STR_RES=String Res` and `set_hdcc$STR_RES=0.5`, where the variable is part of the opcode's
 * *name*. A parser that only expands values stores those as unknown opcodes named `label_cc$STR_RES` — harmless for sound, but it means the layer is genuinely absent, and if a region's `sample=` is written that way the
 * path would carry a literal `$` and resolve to nothing.
 *
 * **Definitions accumulate while scanning, rather than being collected first.** SFZ practice is that a `#define` applies from its point onward, which is why Salamander puts every define and include at the top; the
 * two readings agree on that file and differ on one that uses a variable before defining it, and the accumulating reading is the one the format specifies.
 */

/** `#define $NAME value` — the name always carries the `$`, which is what makes substitution unambiguous. */
const DEFINE = /^\s*#define\s+(\$[A-Za-z_][A-Za-z0-9_]*)\s+(.*?)\s*$/;

/**
 * Resolve `#define`s and substitute them, returning the text a parser can read plus what it resolved.
 *
 * `problems` names a variable that was used but never defined, because that is the case that turns into silence: a region whose `key` or `sample` keeps a `$` cannot be matched to a note or a file, and the caller should
 * be able to say so rather than discovering it as an instrument that does not play.
 */
export interface DefineResult {
  text: string;
  /** The definitions in the order they were made, so a caller can report what the file actually declared. */
  defines: Array<{ name: string; value: string }>;
  /** Variables used but never defined, deduplicated in order of first use. */
  unresolved: string[];
}

const USED = /\$[A-Za-z_][A-Za-z0-9_]*/g;

export function applyDefines(source: string): DefineResult {
  const defines = new Map<string, string>();
  const declared: Array<{ name: string; value: string }> = [];
  const unresolved = new Set<string>();
  const out: string[] = [];

  for (const line of source.split("\n")) {
    const define = line.match(DEFINE);
    if (define) {
      /**
       * ⭐ **The definition's own value is expanded before it is stored.** That is what "accumulating" has to mean: `#define $PATH $DIR/piano.flac` refers to an earlier define, and storing the text as written leaves
       * `$DIR` inside every later substitution — a criterion caught exactly that, and the fix is to expand at the point of definition rather than at the point of use.
       */
      const value = substitute(define[2]!, defines, unresolved);
      defines.set(define[1]!, value);
      declared.push({ name: define[1]!, value });
      // And the line is replaced by nothing: a `#define` is a directive, not an opcode the parser should see.
      out.push("");
      continue;
    }
    // ⭐ A definition may itself use an earlier one (`#define $A $B/x`), which accumulating resolves and collecting first would not.
    out.push(substitute(line, defines, unresolved));
  }

  return { text: out.join("\n"), defines: declared, unresolved: [...unresolved] };
}

function substitute(line: string, defines: ReadonlyMap<string, string>, unresolved: Set<string>): string {
  return line.replace(USED, (name) => {
    const value = defines.get(name);
    if (value === undefined) {
      // Named rather than left as a literal `$`: a caller can then say which variable is missing, which is the difference between "this file needs work" and "this file is broken".
      unresolved.add(name);
      return name;
    }
    return value;
  });
}
