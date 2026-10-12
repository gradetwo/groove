/**
 * ⭐ **What a chip shows: the instrument, in words a person can use** (owner's instructions, 2026-10-09: "只显示乐器名",
 * then "three 那些我也不知道原来意思，你去分析下自己决定").
 *
 * Two rules, and the second one only translates words **I could check**:
 *
 * 1. **Drop the library prefix.** The catalogue joins library and program with a spaced em dash
 *    (`Virtuosity Drums — Basic Kit`). In a 10 px chip inside a narrow column that prefix is what gets read and the
 *    instrument is what gets truncated; the panel behind already names the library and category, and the chip's own
 *    comment has claimed this since it was written. A hyphen is left alone: `Hi-Hat - Closed` carries one as part of the
 *    instrument's own name.
 *
 * 2. **Translate the library's developer terms, and nothing else.** Each replacement below was verified against the
 *    library's own data through the mirror:
 *      · `arco` → **Bowed**, `pizz` → **Plucked** — the SFZ programs read their samples out of `Samples\arco\` and
 *        `Samples\pizz\`;
 *      · `3vel`/`5vel` → **3 layers** / **5 layers** — the sample names carry `vl1`…`vl5`;
 *      · `… map` → **· keyswitch map** — `arco_basic_map.sfz` is `<group> lokey=12 hikey=22` mapping that key range onto
 *        articulations, so it is a switcher, **not** a sound. It stays listed because someone may want it, but the label
 *        now says what it is instead of leaving a silent choice;
 *      · `modwheel`/`mw` → **mod wheel**, `sus` → **sustain**, `stac` → **staccato**.
 *
 *    ⚠️ **`three`, `six`, `basic` and `looped` are deliberately left exactly as the library writes them.** I fetched their
 *    programs and counted: `arco_six` has 660 regions over `vl1…vl5`, `pizz_three` has 576 over `vl1…vl4` with `rr1…rr4` —
 *    neither matches "three" or "six" in any way I can defend, so renaming them would be **inventing a meaning**, which is
 *    the one thing a name must never do. They are variant words until the library or its author says otherwise.
 */
const TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bpizz\b/gi, "Plucked"],
  [/\barco\b/gi, "Bowed"],
  [/\bmodwheel\b/gi, "mod wheel"],
  [/\bmw\b/gi, "mod wheel"],
  [/\b(\d)vel\b/gi, "$1 layers"],
  [/\bsus\b/gi, "sustain"],
  [/\bstac\b/gi, "staccato"],
];

/** ⭐ A map is a switcher, not a sound — said in the label rather than hidden behind a silent choice. */
const MAP = /\bmaps?\b/i;

export function instrumentDisplayName(name: string): string {
  const separator = " — ";
  const at = name.indexOf(separator);
  let text = at === -1 ? name : name.slice(at + separator.length).trim() || name;

  const wasMap = MAP.test(text);
  for (const [pattern, replacement] of TERMS) text = text.replace(pattern, replacement);
  text = text.replace(/\s+/g, " ").trim();
  // Sentences in a 10 px chip: capitalise the first letter only, and keep terms like "mod wheel" lower-case.
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (wasMap) text = `${text.replace(/\s*\bmaps?\b\s*/gi, " ").trim()} · keyswitch map`;
  return text;
}
