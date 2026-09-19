/**
 * A release note's category must never be able to take the updates panel down.
 *
 * The defect: a release shipped with `category: "refactor"`, the modal's badge lookup was a `switch`
 * with cases for feature/audio/fix and **no `default`**, so it returned `undefined` and the render
 * threw `Cannot read properties of undefined (reading 'classes')`. Clicking the version number put
 * the whole app into its error boundary.
 *
 * The type was written as a closed union of three, which made this *look* impossible — but the
 * archive is JSON fetched from the network, so the type was a promise the runtime never made. Two
 * guards come out of that:
 *
 *  1. **The data is checked against the type**, not assumed to satisfy it: every category in the
 *     committed `public/changelog.json` must be one `CHANGELOG_CATEGORIES` names. This is the
 *     assertion that would have caught the bug at authoring time, on the release that introduced it.
 *  2. **Unknown categories degrade instead of throwing**: `normalizeChangelogCategory` maps anything
 *     unrecognised to a known one, and `mergeChangelog` applies it to everything it accepts, so no
 *     entry reaches a badge lookup with a category the UI cannot render.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CHANGELOG_CATEGORIES,
  mergeChangelog,
  normalizeChangelogCategory,
  type ChangelogEntry,
} from "../utils/changelog";

const entry = (over: Partial<ChangelogEntry> & { version: string }): ChangelogEntry =>
  ({
    date: "2026-01-01",
    category: "feature",
    title: { zh: "标题", en: "Title" },
    highlights: [],
    ...over,
  }) as ChangelogEntry;

describe("normalizeChangelogCategory", () => {
  it("keeps every category the UI knows about", () => {
    for (const category of CHANGELOG_CATEGORIES) {
      expect(normalizeChangelogCategory(category)).toBe(category);
    }
  });

  it("maps an unknown category to one the UI can render, instead of returning undefined", () => {
    // The regression in one line: this must never be `undefined`.
    for (const unknown of ["refactor", "docs", "security", "", "FEATURE", null, undefined, 42, {}]) {
      const result = normalizeChangelogCategory(unknown);
      expect(CHANGELOG_CATEGORIES as readonly string[]).toContain(result);
    }
  });

  it("is case-sensitive on purpose, and normalises rather than guessing", () => {
    // "Feature" is not a category we ship; mapping it to `fix` is deliberate — guessing at intent
    // from casing is how a typo becomes a silently wrong badge.
    expect(normalizeChangelogCategory("Feature")).toBe("fix");
  });
});

describe("mergeChangelog normalises what it accepts", () => {
  it("normalises an unknown category on both the archive and `latest`", () => {
    const merged = mergeChangelog(
      [entry({ version: "1.0.0", category: "refactor" as ChangelogEntry["category"] })],
      entry({ version: "1.1.0", category: "nonsense" as ChangelogEntry["category"] })
    );
    for (const e of merged) {
      expect(CHANGELOG_CATEGORIES as readonly string[]).toContain(e.category);
    }
  });

  it("still drops malformed entries rather than passing them through", () => {
    const merged = mergeChangelog(
      [entry({ version: "1.0.0" }), { category: "feature" } as unknown as ChangelogEntry],
      null
    );
    expect(merged.map((e) => e.version)).toEqual(["1.0.0"]);
  });
});

describe("the committed archive only uses categories the UI can render", () => {
  /**
   * The authoring-time half of the guard, and the one that would have caught the original bug: the
   * release that introduced `refactor` would have failed here instead of in a user's browser.
   *
   * Reads the real file rather than a fixture, because the failure mode was a *data* change made by
   * whoever wrote the release notes — a fixture would keep passing while the shipped archive broke.
   */
  const archive = JSON.parse(
    readFileSync(path.join(process.cwd(), "public", "changelog.json"), "utf8")
  ) as { changelog: ChangelogEntry[] };

  it("uses only known categories across every entry", () => {
    const unknown = archive.changelog
      .map((e) => e.category)
      .filter((c) => !(CHANGELOG_CATEGORIES as readonly string[]).includes(c));
    expect([...new Set(unknown)], "add the category to CHANGELOG_CATEGORIES and to the badge record, or fix the note").toEqual([]);
  });

  it("gives every entry a version, a date, a bilingual title and at least one highlight", () => {
    for (const e of archive.changelog) {
      expect(typeof e.version, `version for ${JSON.stringify(e).slice(0, 60)}`).toBe("string");
      expect(typeof e.date).toBe("string");
      expect(typeof e.title?.zh).toBe("string");
      expect(typeof e.title?.en).toBe("string");
      expect(Array.isArray(e.highlights)).toBe(true);
      expect(e.highlights.length).toBeGreaterThan(0);
    }
  });
});
