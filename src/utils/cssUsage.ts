/**
 * Pure helpers behind `scripts/check_css_usage.mjs`.
 *
 * Extracted so the sweep's two non-obvious behaviours are testable without running a script:
 *
 *  1. **Comments are stripped, preserving offsets.** A comment that merely names a class must not
 *     count as a reference — otherwise the note left behind when a dead rule is deleted suppresses
 *     the very finding it describes. And a *commented-out* rule must not count as a live declaration,
 *     or commenting a rule out keeps it in the "referenced" pile forever.
 *
 *  2. **Only real selectors declare classes.** A `.name` inside a declaration value, or inside an
 *     at-rule's prelude, is not a class this sweep should judge.
 *
 * Comment stripping replaces characters with spaces rather than deleting them, so every line number
 * and offset in the parsed result still refers to the original file — which is what lets the script
 * report "line 379" and have that line contain the rule.
 */

/** Blanks out block and whole-line `//` comments, preserving length and line count. */
export function stripCssComments(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/[^\n]*$/gm, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * Class selectors declared in a stylesheet, mapped to their 1-based line number.
 *
 * A depth-aware scan rather than a selector regex. The regex version got two things wrong on the real
 * stylesheet, both of which the tests pin:
 *
 *  - **Line numbers were off**, because they were derived from the index of a match that included the
 *    preceding `}` — so every reported line was wrong by whatever whitespace followed it.
 *  - **Nested rules were invisible.** Its selector character class excluded `}`, so a rule inside
 *    `@media (prefers-reduced-motion: reduce) { … }` never matched — which is exactly where the
 *    reduced-motion arms live, and part of why the first sweep over-reported.
 *
 * A *declaration* body and a *nested rule* are told apart by what has been accumulated when the brace
 * opens: text accumulated before the brace is a selector (or an at-rule prelude); no text at all means
 * the brace opened immediately after another block's `}`, so it is a declaration body.
 */
export function declaredClasses(cssCode: string): Map<string, number> {
  const found = new Map<string, number>();
  const lineAt = (index: number) => cssCode.slice(0, index).split("\n").length;

  const record = (block: string, index: number) => {
    const line = lineAt(index);
    for (const cls of block.matchAll(/\.([a-z][a-z0-9_-]*)/gi)) {
      if (!found.has(cls[1])) found.set(cls[1], line);
    }
  };

  let buf = "";
  let inComment = false;

  for (let i = 0; i < cssCode.length; i += 1) {
    const ch = cssCode[i];

    if (inComment) {
      if (ch === "*" && cssCode[i + 1] === "/") {
        inComment = false;
        i += 1;
      }
      continue;
    }
    if (ch === "/" && cssCode[i + 1] === "*") {
      inComment = true;
      i += 1;
      continue;
    }

    if (ch === "{") {
      const prelude = buf.trim();
      // No prelude means this brace opens a declaration body, not a rule.
      if (prelude && !prelude.startsWith("@")) record(prelude, i);
      buf = "";
      continue;
    }

    // `}` ends a block and `;` ends a declaration; either way the accumulated text is spent, so the
    // next `{` cannot mistake it for a selector.
    if (ch === "}" || ch === ";") {
      buf = "";
      continue;
    }

    // An at-rule keyword is never a class; drop it so `@media`/`@supports` preludes record nothing.
    if (ch === "@") {
      buf = "";
      continue;
    }

    buf += ch;
  }
  return found;
}

/** Class selectors declared in a stylesheet source, comments already removed. */
export function declaredClassesInSource(css: string): Map<string, number> {
  return declaredClasses(stripCssComments(css));
}

/**
 * Splits declared classes into those referenced somewhere in `corpus` and those not.
 *
 * Reference detection is a plain substring search rather than a `className` parse, because a class
 * name is frequently assembled from fragments (`"track-row-" + idx`). A substring search errs towards
 * "referenced", which is the safe direction: a missed dead rule costs nothing, while deleting a live
 * one is a visual regression.
 */
export function partitionByUsage(
  declared: Map<string, number>,
  corpus: string
): {
  referenced: Array<{ cls: string; line: number }>;
  unreferenced: Array<{ cls: string; line: number }>;
} {
  const referenced: Array<{ cls: string; line: number }> = [];
  const unreferenced: Array<{ cls: string; line: number }> = [];
  for (const [cls, line] of [...declared.entries()].sort((a, b) => a[1] - b[1])) {
    (corpus.includes(cls) ? referenced : unreferenced).push({ cls, line });
  }
  return { referenced, unreferenced };
}
