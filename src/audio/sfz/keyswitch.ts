/**
 * ⭐ **Choosing an articulation by name, through the file's own `sw_label`.**
 *
 * ## The measured problem this exists for
 *
 * The eight `-KS` programs of the pinned string/wind library
 * (`schollz/VSCO-2-CE@6dd651d55dde97fd4028699be9d4481f26917891`) fold several articulations into one
 * program, each behind its own `sw_last`. Measured with this repository's own `parseSfz`: **44 `sw_last`
 * groups between them**, and only **8 of the 44 are reachable today** — one per file, because each file's
 * effective `sw_default` names exactly one group. The other **36** are out of reach of every note until
 * something presses a keyswitch:
 *
 * | program | regions | `sw_last` groups | groups reachable today | groups in a `<group>` with no `sw_default` |
 * | --- | --- | --- | --- | --- |
 * | `CelloEns-KS.sfz` | 156 | 6 | 1 (`c6` = `C6 Sustain Vibrato`) | 0 |
 * | `Clarinet-KS.sfz` | 97 | 3 | 1 (`c2` = `C2 Sustain Long`) | 2 |
 * | `Contrabass-KS.sfz` | 152 | 7 | 1 (`c6`) | 0 |
 * | `Flute-KS.sfz` | 94 | 5 | 1 (`c2`) | 4 |
 * | `SViolin-KS.sfz` | 161 | 6 | 1 (`c2`) | 0 |
 * | `Tuba-KS.sfz` | 87 | 5 | 1 (`c6`) | 0 |
 * | `ViolaEns-KS.sfz` | 144 | 6 | 1 (`c2`) | 0 |
 * | `ViolinEns-KS.sfz` | 131 | 6 | 1 (`c2`) | 5 |
 * | **total** | **1022** | **44** | **8** | **11** |
 *
 * The 11 in the last column are the groups the task's own reading calls out: a group that writes no
 * `sw_default` at all is unreachable even in principle, while the other 25 unreachable ones lose to a
 * *sibling's* default inside the same file.
 *
 * Every one of those files writes the articulation's **name** beside its switch — `sw_label=C2 Sustain
 * Vibrato`, `sw_label=D#2 Pizzicato`, `sw_label=C#2 Tremolo` — so the file itself already says which
 * articulation each switch selects. What was missing was a way to *ask* for one by that name, and a bug in
 * the reader that made the names unreadable: `scanOpcodes` ended every value at the first whitespace, so
 * `sw_label=C2 Sustain Vibrato` arrived as `C2`. `parse.ts` now reads a label the way the reference engine
 * does (to end of line, or up to the next `name=`), which is what makes this module possible at all.
 *
 * ## The reference engine, for the record
 *
 * sfizz reads the same value: `src/sfizz/parser/Parser.cpp` extracts to end of line and then cuts only
 * before something shaped like an opcode — *"if sequence of identifier chars and then \"=\", an opcode
 * follows"* — so `sw_label=Sine lokey=41 sample=*sine` yields the label `Sine` and
 * `sw_label=C2 Sustain Vibrato` yields the whole name. And `Region.cpp` reads it with
 * `case hash("sw_label"): keyswitchLabel = opcode.value;`, i.e. the value is the whole name.
 *
 * ## What this is not
 *
 * It is **not** a heuristic that guesses an articulation when the file names none. A request that matches
 * no `sw_label` is **refused, with the labels the file does declare**, because picking one anyway is the
 * silent-wrong-answer this workstream keeps removing. And it is not the state machine: this function
 * answers *"which switch value would select the articulation called X"* — the **initial** state a caller
 * chooses before any key is pressed. `KeyswitchState` below is the live one.
 */
import type { SfzRegion } from "./parse";

/** The articulation a name selects, and the file's own spelling of it. */
export interface TechniqueSwitch {
  /** The `sw_last` value of the group the name matched — what a caller passes as `switch`. */
  switch: number;
  /** The `sw_label` exactly as the file wrote it, so a report can quote the file rather than this code. */
  label: string;
}

/** Why a requested articulation could not be selected — always with the file's own labels, never a bare "no". */
export interface TechniqueSwitchRefusal {
  reason: string;
}

export type TechniqueSwitchResult = ({ ok: true } & TechniqueSwitch) | ({ ok: false } & TechniqueSwitchRefusal);

/**
 * ⭐ **The switch value that selects an articulation called `technique`, from the file's own `sw_label`s.**
 *
 * Matching is **word-by-word on the normalised label**, not a substring test: `non vibrato` must not be
 * found inside `vibrato`, and `-`／`_` are word separators because the library writes both (`Non-Vibrato`,
 * `SusVib`). Case is ignored because SFZ labels are capitalised for a panel, not for a parser.
 *
 * **Two matches are broken by the file's own `sw_default`, and only then refused.** `Flute-KS` labels its
 * groups `C2 Sustain Non-Vibrato` and `C#2 Sustain Vibrato`, so the word `sustain` genuinely names two
 * articulations in that file; the file's `sw_default=c2` is its author saying which one a patch should load
 * with, so that group wins. A file whose tie the default cannot break is **refused by name** rather than
 * guessed at.
 *
 * Returns `undefined` when the file has **no `sw_last` regions at all** — such a program is not a keyswitch
 * program, so a technique name is not a keyswitch question and the caller must fall through to its ordinary
 * resolution (this is what keeps a dedicated `ViolinEnsSpic.sfz` playing when a caller asks for `spiccato`).
 */
export function techniqueSwitchFor(regions: readonly SfzRegion[], technique: string): TechniqueSwitchResult | undefined {
  const wanted = words(technique);
  if (wanted.length === 0) return undefined;
  const gated = regions.filter((region) => region.swLast !== undefined);
  if (gated.length === 0) return undefined;

  /** One entry per distinct switch value, keeping the file's first spelling of its label. */
  const matched = new Map<number, string>();
  const declared = new Set<string>();
  for (const region of gated) {
    const label = region.opcodes.sw_label;
    if (label === undefined || label.trim() === "") continue;
    declared.add(label);
    if (!containsWords(words(label), wanted)) continue;
    const value = region.swLast!;
    if (!matched.has(value)) matched.set(value, label);
  }

  if (matched.size === 0) {
    const labels = [...declared].sort();
    return {
      ok: false,
      reason:
        `no articulation called "${technique}" in this file: its sw_label values are ` +
        `${labels.length === 0 ? "absent (no region declares sw_label)" : labels.map((label) => `"${label}"`).join(", ")}`,
    };
  }
  if (matched.size === 1) {
    const [value, label] = [...matched.entries()][0]!;
    return { ok: true, switch: value, label };
  }

  /**
   * More than one articulation answered to the name. The file's own `sw_default` is the author's answer to
   * "which one loads", so it settles the tie when it names one of the candidates.
   */
  const preferred = matched.get(defaultOf(regions) ?? -1);
  if (preferred !== undefined) {
    const value = [...matched.entries()].find(([, label]) => label === preferred)![0];
    return { ok: true, switch: value, label: preferred };
  }
  return {
    ok: false,
    reason:
      `"${technique}" names ${matched.size} articulations in this file (` +
      `${[...matched.entries()].map(([value, label]) => `sw_last=${value} "${label}"`).join(", ")}) ` +
      `and the file's sw_default does not choose between them`,
  };
}

/**
 * The file's power-on default, read **last declaration wins** to match the reference engine, or `undefined`.
 *
 * sfizz's `Synth::Impl::buildRegion` ends with `if (lastRegion->defaultSwitch) setCurrentSwitch(*lastRegion->defaultSwitch);`
 * and `buildRegion` is called once per `<region>` **in file order** (`onParseEvent`, `case hash("region"):
 * buildRegion(members); break;`) — so the value left in `currentSwitch_` is the one from the **last region
 * built whose effective `sw_default` is defined**, not the first. `declaredSwitchDefault` in `parse.ts` is
 * the same rule and this function defers to it.
 *
 * Measured on the pinned files: it costs nothing there, because every `-KS` file that repeats `sw_default`
 * repeats **one value** (`CelloEns-KS` writes `c6` six times), so first and last agree. It is still the
 * reference engine's rule rather than ours, and a file with two different defaults is the case that tells
 * them apart.
 */
function defaultOf(regions: readonly SfzRegion[]): number | undefined {
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const value = regions[index]!.swDefault;
    if (value !== undefined) return value;
  }
  return undefined;
}

/** A label or a technique name as comparable words: case folded, `-`／`_` treated as separators. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[-_/\\]+/g, " ")
    .split(/\s+/)
    .filter((word) => word !== "");
}

/** Whether `haystack` contains `needle` as a contiguous run of words. */
function containsWords(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
}
