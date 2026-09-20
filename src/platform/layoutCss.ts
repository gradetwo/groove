/**
 * The stylesheet half of the layout tokens: where each token appears in `src/index.css`.
 *
 * ## Why a rewriter instead of a check
 *
 * A media query cannot be built from a CSS custom property — `@media (max-width: var(--x))` is not
 * valid — so the phone boundaries have to be *text* in the stylesheet. That leaves two honest
 * options: write the number twice and let a test compare the copies, or keep one copy and let a
 * script write it into the stylesheet. This is the second option, and the reason is the third one:
 * with a test, a *new* pair of copies is invisible until somebody remembers to write the test (the
 * 480/500 short-landscape bug was found by hand, not by a test).
 *
 * So `scripts/layout_tokens.mjs` uses the functions below to rewrite the three places, and
 * `npm run check:layout` (inside `verify`) fails when the stylesheet disagrees with
 * `layoutTokens.ts`. The matching patterns are deliberately anchored to the rule syntax — an
 * ordinary `\d+` search would happily rewrite the number inside a comment that talks *about* the
 * boundary, which is a number nobody needs to keep in sync.
 *
 * Pure functions, no filesystem: the script does the I/O and the test drives these directly.
 */
import {
  PHONE_MAX_HEIGHT_PX,
  PHONE_MAX_WIDTH_PX,
  TRANSPORT_ROW_WIDTH_PX,
} from "./layoutTokens";

export interface ManagedCssValue {
  /** How the drifted value is named to a human. */
  label: string;
  /** Anchored to the rule, with the number in the last capture group. */
  pattern: RegExp;
  /** What the value must be. */
  px: number;
  /** Where the value comes from, for the failure message. */
  source: string;
}

export const MANAGED_CSS_VALUES: ManagedCssValue[] = [
  {
    label: "the phone portrait media query",
    pattern: /^@media \(max-width: (\d+)px\) \{/m,
    px: PHONE_MAX_WIDTH_PX,
    source: "PHONE_MAX_WIDTH_PX",
  },
  {
    label: "the short-landscape media query",
    pattern: /^@media \(max-height: (\d+)px\) and \(orientation: landscape\) \{/m,
    px: PHONE_MAX_HEIGHT_PX,
    source: "PHONE_MAX_HEIGHT_PX",
  },
  {
    label: "--mobile-transport-row-w",
    pattern: /^(\s*--mobile-transport-row-w:\s*)(\d+)px;/m,
    px: TRANSPORT_ROW_WIDTH_PX,
    source: "TRANSPORT_ROW_WIDTH_PX",
  },
];

export interface LayoutCssDrift {
  label: string;
  /** The number found in the stylesheet, or null when the rule is gone entirely. */
  found: number | null;
  expected: number;
  source: string;
}

/** What in this stylesheet disagrees with the tokens. Empty means in sync. */
export function findLayoutCssDrift(css: string): LayoutCssDrift[] {
  const drift: LayoutCssDrift[] = [];
  for (const value of MANAGED_CSS_VALUES) {
    const match = css.match(value.pattern);
    if (!match) {
      // A missing rule is drift too: deleting the media query would otherwise make the gate pass by
      // having nothing left to compare, which is the failure mode this whole file exists to avoid.
      drift.push({
        label: value.label,
        found: null,
        expected: value.px,
        source: value.source,
      });
      continue;
    }
    const found = Number(match[match.length - 1]);
    if (found !== value.px) {
      drift.push({ label: value.label, found, expected: value.px, source: value.source });
    }
  }
  return drift;
}

/**
 * Writes the tokens into the stylesheet, leaving everything else byte-for-byte alone.
 *
 * The managed patterns all put the number first among the digits in the matched text, which is why
 * replacing the first `\d+` inside the match is enough — and why the patterns stay anchored and
 * narrow: this function should not be trusted to rewrite anything it does not recognise.
 */
export function syncLayoutCss(css: string): { css: string; changed: string[] } {
  let next = css;
  const changed: string[] = [];
  for (const value of MANAGED_CSS_VALUES) {
    const match = next.match(value.pattern);
    if (!match) continue;
    const found = Number(match[match.length - 1]);
    if (found === value.px) continue;
    const rewritten = match[0].replace(/\d+/, String(value.px));
    next = next.replace(match[0], rewritten);
    changed.push(`${value.label}: ${found} → ${value.px}`);
  }
  return { css: next, changed };
}
