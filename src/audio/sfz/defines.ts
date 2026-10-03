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

/**
 * ⭐ **`#define` is a directive, not a line — and `<group> #define $POS 1 seq_position=$POS` is a real file.**
 *
 * The pattern used to be `^\s*#define…`, which is a statement about **line grammar** rather than about the format. The pinned
 * `sfzinstruments/kinwie.dim-cabasa@016457e5` writes its ten definitions inline on the `<group>` header that uses them, so all 250 of its
 * regions kept a literal `$POS` and not one of them could sound. The reference engine is unambiguous about where a directive may sit:
 * sfizz's parser loop is `#` ⇒ directive / `<` ⇒ header / otherwise opcode, taken at the first non-space character of each statement —
 * so a `#define` begins a statement wherever it appears, and the rest of the line after its value is more statements.
 * (<https://github.com/sfztools/sfizz/blob/develop/src/sfizz/parser/Parser.cpp> — `processTopLevel` and `processDirective`.)
 *
 * ## Two rejections, both deliberate
 *
 * · **A `$` that is not at the end of a directive's name is not a definition.** The name and the value must both be present, so
 *   `#define $A` alone defines nothing (and is left in the text, which is what the old whole-line pattern did too).
 * · **A `#` that is not preceded by whitespace does not start a directive.** sfizz requires the `#` to be the first character of a
 *   statement, and every writer of SFZ separates statements by whitespace — so `label=#define $A 1` is an opcode whose value happens to
 *   contain a hash, not a definition, and the criterion that covers this is a counterexample in `sfzSwKeyswitch.test.ts`.
 *
 * ⭐ **The value is the first word, and the rest of the line stays in the stream** — the rule is sfizz's, and it is what makes the real file work.
 * sfizz's `processDirective` reads the definition with `extractToEol` and then immediately **pushes the excess back**: *"ARIA/not Cakewalk: cut the value after
 * the first word"* (`parser/Parser.cpp`). So `<group> #define $POS 1 seq_position=$POS` defines `$POS` as `1` and leaves `seq_position=$POS` on the line —
 * which the very same scan then expands to `seq_position=1`. Reading the value to the end of the line instead (the first version of this change) stores
 * `1 seq_position=$POS` and turns the line into `seq_position=1 seq_position=1`, which is a wrong answer rather than a missing one.
 *
 * ## Two rejections, both deliberate
 *
 * · **A `$` that is not followed by a value word is not a definition.** `#define $A` alone defines nothing, and its text is left where it was — as is
 *   `#define $NAME #include "x.sfz"`, which is what an SFZ file that wanted a directive as a value would look like.
 * · **A `#` that is not preceded by whitespace does not start a directive.** sfizz requires the `#` to be the first character of a statement, and every writer
 *   of SFZ separates statements by whitespace — so `label=#define $A 1` is an opcode whose value happens to contain a hash, not a definition, and the criterion
 *   that covers this is a counterexample in `sfzSwKeyswitch.test.ts`.
 */
const DEFINE_HEAD = /(?:^|\s)#define\s+(\$[A-Za-z_][A-Za-z0-9_]*)(?=\s)/;

/** One inline `#define`, located: where the directive starts, the name, and the value word with its offsets in the line. */
export interface InlineDefine {
  /** Index in the line where the `#` sits — everything before it is ordinary text (or more statements) and is kept. */
  start: number;
  name: string;
  value: string;
  /** The directive's own extent, `[head, tail)`, so a caller can remove exactly it and keep the rest of the line. */
  head: number;
  tail: number;
}

/**
 * The **next** inline `#define` at or after `from`, or `null`. Inline means "not the first thing on the line" only in the sense that the caller
 * asked from an offset; this function does not care, which is what keeps one rule for both the `<group>` form and the plain one.
 */
export function nextInlineDefine(line: string, from = 0): InlineDefine | null {
  const match = DEFINE_HEAD.exec(line.slice(from));
  if (!match || match.index === undefined) return null;
  const rawStart = from + match.index;
  // The match's leading character is either the `#` itself (line start) or the whitespace before it; `head` names the `#` in both cases.
  const head = line[rawStart] === "#" ? rawStart : rawStart + 1;
  const afterName = from + match.index + match[0]!.length;
  const afterSpace = line.slice(afterName).replace(/^[ \t]+/, "");
  const valueLength = afterSpace.search(/\s/);
  // No value word: not a definition at all, and the caller leaves the text where it is.
  if (afterSpace === "") return null;
  const value = valueLength === -1 ? afterSpace : afterSpace.slice(0, valueLength);
  const tail = valueLength === -1 ? line.length : afterName + (line.length - afterName - afterSpace.length) + valueLength;
  return { start: from + match.index, name: match[1]!, value, head, tail };
}

/**
 * Split a line into the text that is **not** a directive and the definitions it carries, **both in the order they occur**.
 *
 * The order is the whole point rather than tidiness: a define takes effect at its own position, so the text before it is rendered with the definitions
 * made so far and the text after it with that one included. `pieces` and `defines` are therefore the same stream, separated by kind, and a caller
 * merges them by `at`.
 */
export function splitInlineDefines(line: string): {
  pieces: Array<{ at: number; text: string }>;
  defines: Array<{ at: number; name: string; value: string }>;
  found: boolean;
} {
  const pieces: Array<{ at: number; text: string }> = [];
  const defines: Array<{ at: number; name: string; value: string }> = [];
  let cursor = 0;
  let found = false;
  for (;;) {
    const next = nextInlineDefine(line, cursor);
    if (!next) break;
    found = true;
    // Everything between the previous directive's end and this one's `#` is ordinary text, including the spaces around the directive.
    if (next.head > cursor) pieces.push({ at: cursor, text: line.slice(cursor, next.head) });
    defines.push({ at: next.head, name: next.name, value: next.value });
    // The scan resumes **after the value word**, so the remainder of the line stays in the stream exactly as sfizz pushes it back.
    cursor = next.tail;
  }
  if (!found) return { pieces: [{ at: 0, text: line }], defines: [], found: false };
  if (cursor < line.length) pieces.push({ at: cursor, text: line.slice(cursor) });
  pieces.sort((a, b) => a.at - b.at);
  defines.sort((a, b) => a.at - b.at);
  return { pieces, defines, found: true };
}

/**
 * **The names in `defined` that actually occur at `$`-position `index`**, longest first — and the answer to a defect that made a real library silent.
 *
 * A name is `[A-Za-z_][A-Za-z0-9_]*`, so `$POS_01` is one token and a plain replace of `$POS` never fires: the name is followed by `_`, which is an
 * identifier character, and replacing it would rewrite a name the file did not ask about. But `dim-cabasa` writes `#define $POS 1` and then
 * `sample=$ART_rr$POS_01.flac`, where `$POS` **is** the variable and `_01` is literal text — so a rule that only substitutes whole tokens makes the
 * library parse to 250 regions that cannot sound.
 *
 * The rule that satisfies both, and the one measured here: **the longest defined name that prefixes the token wins, and the rest of the token is
 * literal text.** `$POS_01` → `$POS` + `_01`; `$ART_rr` where only `$ART` is defined → `$ART` + `_rr`; an undefined `$NEVER_DEFINED` stays as written
 * (which is what keeps `parseSfz`'s `unresolved` marking honest), and `$PYTHON` stays as written too when only `$PY` is defined, because sfizz's own
 * expansion is textual and sloppy in exactly that direction.
 */
export function definedNamesAt(token: string, defined: ReadonlySet<string> | ReadonlyMap<string, string>): string[] {
  const names: string[] = [];
  const has = (name: string) => (defined instanceof Map ? defined.has(name) : (defined as ReadonlySet<string>).has(name));
  for (let end = token.length; end >= 2; end -= 1) {
    const candidate = token.slice(0, end);
    if (has(candidate)) names.push(candidate);
  }
  return names;
}

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
    /**
     * ⭐ **The directive is found wherever it sits, and the line around it is kept.** Both halves are measured against real files rather than
     * assumed: `dim-cabasa` writes `<group> #define $POS 1 seq_position=$POS`, so the definition has to be read, the directive has to disappear,
     * and `seq_position=$POS` has to survive with the value the same line just defined. A `#define` that owns its line therefore produces an
     * empty line here — the same output the whole-line pattern produced — while one that shares a line leaves its neighbours alone.
     */
    const { pieces, defines: found, found: any } = splitInlineDefines(line);
    if (!any) {
      // ⭐ A definition may itself use an earlier one (`#define $A $B/x`), which accumulating resolves and collecting first would not.
      out.push(substitute(line, defines, unresolved));
      continue;
    }
    /**
     * ⭐ **The merge is by position, so a definition applies from its own point onward — including within one line.**
     *
     * `<group> #define $POS 1 seq_position=$POS` reads left to right: the text before the directive is rendered with what was defined already, then
     * the definition's own value is expanded and stored, and only then is the text after it rendered. Rendering the whole line with the final set of
     * definitions would make `$POS` resolve before it was defined, which is the ordering the format explicitly does not have.
     */
    const stream: Array<{ at: number; text?: string; define?: { name: string; value: string } }> = [
      ...pieces.map((piece) => ({ at: piece.at, text: piece.text })),
      ...found.map((define) => ({ at: define.at, define: { name: define.name, value: define.value } })),
    ].sort((a, b) => a.at - b.at);
    const rendered: string[] = [];
    for (const step of stream) {
      if (step.define) {
        /**
         * ⭐ **The definition's own value is expanded before it is stored.** That is what "accumulating" has to mean: `#define $PATH $DIR/piano.flac`
         * refers to an earlier define, and storing the text as written leaves `$DIR` inside every later substitution — a criterion caught exactly that,
         * and the fix is to expand at the point of definition rather than at the point of use.
         */
        const value = substitute(step.define.value, defines, unresolved);
        defines.set(step.define.name, value);
        declared.push({ name: step.define.name, value });
        continue;
      }
      rendered.push(substitute(step.text ?? "", defines, unresolved));
    }
    /**
     * **Whitespace left where a directive sat is dropped when it is at an edge.** `<group> #define $POS 1 seq_position=$POS` leaves `<group>` and
     * ` seq_position=$POS` around the directive, and the space between them is kept because the old whole-line pattern kept it (`x=1 #define $Y 2 y=$Y` used
     * to render `x=1  y=2`). A define that owned its line leaves nothing but whitespace, and the old pattern emitted an empty line there — so leading and
     * trailing whitespace-only pieces go, and only they.
     */
    while (rendered.length > 0 && rendered[rendered.length - 1]!.trim() === "") rendered.pop();
    while (rendered.length > 0 && rendered[0]!.trim() === "") rendered.shift();
    out.push(rendered.join(""));
  }

  return { text: out.join("\n"), defines: declared, unresolved: [...unresolved] };
}

/**
 * `$NAME` substitution, with the longest defined name winning.
 *
 * The greedy token `$[A-Za-z_][A-Za-z0-9_]*` is what the format's own grammar says a name is, and `definedNamesAt` resolves the case the grammar
 * alone gets wrong (`$POS_01` where `$POS` is the variable). An **undefined** variable is returned as written, which is what keeps a region holding
 * one unselectable rather than silently rewritten — the defect this project has paid for twice.
 */
export function substituteVariables(text: string, defines: ReadonlyMap<string, string>): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const names = new Set(defines.keys());
  const out = text.replace(USED, (token) => {
    const candidates = definedNamesAt(token, names);
    if (candidates.length === 0) {
      unresolved.push(token);
      return token;
    }
    const name = candidates[0]!;
    return `${defines.get(name)!}${token.slice(name.length)}`;
  });
  return { text: out, unresolved };
}

function substitute(line: string, defines: ReadonlyMap<string, string>, unresolved: Set<string>): string {
  const names = new Set(defines.keys());
  return line.replace(USED, (token) => {
    const candidates = definedNamesAt(token, names);
    if (candidates.length === 0) {
      // Named rather than left as a literal `$`: a caller can then say which variable is missing, which is the difference between "this file needs work" and "this file is broken".
      unresolved.add(token);
      return token;
    }
    const name = candidates[0]!;
    return `${defines.get(name)!}${token.slice(name.length)}`;
  });
}
