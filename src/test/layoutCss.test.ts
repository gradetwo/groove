/**
 * The layout tokens and the stylesheet they are written into (U13).
 *
 * The point of the round was to stop keeping the same number twice and pinning the copies with a
 * test. What replaces that is a rewrite plus a gate, and both need to be *fail-able* or the round has
 * only moved the duplication: these tests feed the rewriter stylesheets that disagree on purpose, so a
 * gate that silently accepted everything would fail here.
 *
 * The last two cases read the real `src/index.css`, because "the shipped stylesheet is in sync" is
 * the claim `npm run check:layout` makes in `verify`, and a test that never touches the real file
 * would not notice a rule being deleted.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MANAGED_CSS_VALUES,
  findLayoutCssDrift,
  syncLayoutCss,
} from "../platform/layoutCss";
import {
  PHONE_MAX_HEIGHT_PX,
  PHONE_MAX_WIDTH_PX,
  TRANSPORT_ROW_WIDTH_PX,
} from "../platform/layoutTokens";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realCss = readFileSync(path.join(SRC_DIR, "index.css"), "utf8");

/** A stylesheet with the three managed rules, so each case can break exactly one of them. */
const stylesheet = (phoneW = PHONE_MAX_WIDTH_PX, shortH = PHONE_MAX_HEIGHT_PX, rowW = TRANSPORT_ROW_WIDTH_PX) => `
:root {
  --mobile-tab-bar-h: 0px;
  --mobile-transport-row-w: ${rowW}px;
  --trk-head-w: 142px;
}

@media (max-width: ${phoneW}px) {
  .trk-head-desktop-only { display: none !important; }
}

@media (max-height: ${shortH}px) and (orientation: landscape) {
  .landscape-compact-bar { display: flex; }
}
`;

describe("layout tokens · the values themselves", () => {
  it("keeps the phone boundaries consistent with each other", () => {
    // A phone that is wider than it is tall is the whole reason `isShortLandscape` exists; the
    // reverse would make the two checks unable to disagree, which is not what the code means.
    expect(PHONE_MAX_WIDTH_PX).toBeGreaterThan(320);
    expect(PHONE_MAX_WIDTH_PX).toBeLessThan(768);
    expect(PHONE_MAX_HEIGHT_PX).toBeLessThan(PHONE_MAX_WIDTH_PX);
  });

  it("keeps the shared row wide enough for the transport's own controls", () => {
    // Five 44 px controls, four 4 px gaps and the 12 px container padding.
    const needed = 5 * 44 + 4 * 4 + 12;
    expect(TRANSPORT_ROW_WIDTH_PX).toBeGreaterThanOrEqual(needed);
  });
});

describe("layout css · drift is reported, not tolerated", () => {
  it("finds nothing in a stylesheet that agrees", () => {
    expect(findLayoutCssDrift(stylesheet())).toEqual([]);
  });

  it("names every place a hand-edited number disagrees", () => {
    const drift = findLayoutCssDrift(stylesheet(640, 480, 300));
    expect(drift.map((d) => d.label)).toEqual([
      "the phone portrait media query",
      "the short-landscape media query",
      "--mobile-transport-row-w",
    ]);
    expect(drift.map((d) => d.found)).toEqual([640, 480, 300]);
    expect(drift.every((d) => d.expected === PHONE_MAX_WIDTH_PX || d.expected === PHONE_MAX_HEIGHT_PX || d.expected === TRANSPORT_ROW_WIDTH_PX)).toBe(true);
  });

  it("reports a deleted rule instead of passing because there is nothing left to compare", () => {
    // The failure mode a naive check has: remove the media query and the comparison vacuously holds.
    const withoutMedia = stylesheet().replace(/^@media \(max-height.*$/m, "/* gone */");
    const drift = findLayoutCssDrift(withoutMedia);
    expect(drift).toHaveLength(1);
    expect(drift[0].label).toBe("the short-landscape media query");
    expect(drift[0].found).toBeNull();
  });

  it("does not touch a number that only talks about a boundary", () => {
    // Prose and unrelated lengths must survive: an unanchored `\d+` search would rewrite the 639 in
    // a comment, or the 142 px of the frozen column, and the gate would then be about itself.
    const css = `/* the 639 px boundary hides the desktop controls */\n${stylesheet()}`;
    const { css: next, changed } = syncLayoutCss(css);
    expect(changed).toEqual([]);
    expect(next).toBe(css);
  });
});

describe("layout css · the rewrite is surgical", () => {
  it("writes the token value into every drifted rule and nothing else", () => {
    const before = stylesheet(640, 480, 300);
    const { css: after, changed } = syncLayoutCss(before);
    expect(changed).toHaveLength(3);
    expect(after).toContain(`@media (max-width: ${PHONE_MAX_WIDTH_PX}px) {`);
    expect(after).toContain(`@media (max-height: ${PHONE_MAX_HEIGHT_PX}px) and (orientation: landscape) {`);
    expect(after).toContain(`--mobile-transport-row-w: ${TRANSPORT_ROW_WIDTH_PX}px;`);
    // The untouched values stay untouched, byte for byte.
    expect(after).toContain("--trk-head-w: 142px;");
    expect(after).toContain(".trk-head-desktop-only { display: none !important; }");
    // And the rewrite is idempotent: a second pass has nothing left to do.
    expect(syncLayoutCss(after).changed).toEqual([]);
  });
});

describe("layout css · the shipped stylesheet", () => {
  it("has every managed rule, so the gate is not comparing an empty set", () => {
    expect(MANAGED_CSS_VALUES).toHaveLength(3);
    for (const value of MANAGED_CSS_VALUES) {
      expect(value.pattern.test(realCss), `${value.label} is missing from index.css`).toBe(true);
    }
  });

  it("agrees with the tokens (`npm run check:layout` asserts the same thing)", () => {
    expect(findLayoutCssDrift(realCss)).toEqual([]);
  });
});
