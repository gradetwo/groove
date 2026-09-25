import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The changelog is a short list, kept short by the release tooling and held short here.
 *
 * Two rules from the project owner (2026-09-24): the archive keeps the **newest ten** entries, and the writing is
 * plain and short — this repository had grown 214 entries, several of them long enough to be a release note for a
 * change nobody can hear. `version:sync` does the trimming (a release cannot quietly regrow the file), and this
 * case is what catches an entry written by hand that would blow past the limit.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = JSON.parse(readFileSync(path.join(ROOT, "public", "changelog.json"), "utf8")) as {
  changelog: Array<{ version: string; date: string; category: string; title: { zh: string; en: string }; highlights?: Array<{ zh: string; en: string }> }>;
};

/** A size a reader can take in at a glance: the whole entry, both languages excluded (Chinese only, it is the shorter). */
const MAX_ENTRY_ZH_CHARS = 200;

describe("the changelog stays a short list", () => {
  it("keeps at most ten entries", () => {
    expect(file.changelog.length).toBeLessThanOrEqual(10);
    expect(file.changelog.length, "an empty archive would pass the limit and fail the reader").toBeGreaterThan(0);
  });

  it("keeps every entry short enough to read, and bilingual", () => {
    const tooLong: string[] = [];
    for (const entry of file.changelog) {
      const zh = entry.title.zh.length + (entry.highlights ?? []).reduce((n, h) => n + h.zh.length, 0);
      if (zh > MAX_ENTRY_ZH_CHARS) tooLong.push(`${entry.version} (${zh} chars)`);
      expect(entry.title.en.length, entry.version).toBeGreaterThan(0);
      for (const highlight of entry.highlights ?? []) expect(highlight.en.length, entry.version).toBeGreaterThan(0);
    }
    expect(tooLong).toEqual([]);
  });
});
