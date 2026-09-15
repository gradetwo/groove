/**
 * Regression tests for the update-record pipeline.
 *
 * The bug being pinned: a client that had just updated opened the release history
 * and saw no record of the release it had just installed. Two mechanisms combined:
 *
 *   1. `/changelog.json` was fetched unversioned and cacheable, so the archive
 *      could be served one release behind.
 *   2. The modal rendered the archive *instead of* the `latest` entry from the
 *      never-stale `version.json`, so the newest entry was discarded rather than
 *      merged.
 *
 * These tests cover rule (2) directly — it is the part that makes a stale archive
 * survivable — plus the version-keyed URL that removes (1) by construction.
 */
import { describe, it, expect } from "vitest";
import {
  changelogArchiveUrl,
  compareVersionsDesc,
  isNewerVersion,
  mergeChangelog,
  type ChangelogEntry,
} from "../utils/changelog";

function entry(version: string): ChangelogEntry {
  return {
    version,
    date: "2026-01-01",
    category: "feature",
    title: { zh: `v${version}`, en: `v${version}` },
    highlights: [{ zh: "h", en: "h" }],
  };
}

describe("compareVersionsDesc", () => {
  it("orders newer versions first", () => {
    expect(compareVersionsDesc("1.16.19", "1.16.18")).toBeLessThan(0);
    expect(compareVersionsDesc("1.16.18", "1.16.19")).toBeGreaterThan(0);
    expect(compareVersionsDesc("1.16.19", "1.16.19")).toBe(0);
  });

  it("compares numeric segments, not strings", () => {
    // "1.9.0" < "1.10.0" numerically, though "9" > "1" lexically.
    expect(compareVersionsDesc("1.10.0", "1.9.0")).toBeLessThan(0);
    expect(compareVersionsDesc("2.0.0", "1.99.99")).toBeLessThan(0);
  });

  it("tolerates ragged segment counts", () => {
    expect(compareVersionsDesc("1.17", "1.16.19")).toBeLessThan(0);
    expect(compareVersionsDesc("1.16", "1.16.0")).toBe(0);
  });
});

describe("isNewerVersion", () => {
  it("is strict about equality", () => {
    expect(isNewerVersion("1.16.20", "1.16.19")).toBe(true);
    expect(isNewerVersion("1.16.19", "1.16.19")).toBe(false);
  });

  it("reports a rollback as not-an-update", () => {
    // A downgrade must not be advertised, otherwise "update" reloads in a loop.
    expect(isNewerVersion("1.16.18", "1.16.19")).toBe(false);
  });
});

describe("mergeChangelog", () => {
  it("surfaces the newest entry even when the archive is stale", () => {
    // The archive is what a stale cache returns: it stops at 1.16.18.
    const staleArchive = [entry("1.16.18"), entry("1.16.17"), entry("1.16.16")];
    // `latest` comes from version.json, which is fetched with `no-store`.
    const merged = mergeChangelog(staleArchive, entry("1.16.19"));

    expect(merged[0].version).toBe("1.16.19");
    expect(merged.map((e) => e.version)).toEqual(["1.16.19", "1.16.18", "1.16.17", "1.16.16"]);
  });

  it("does not duplicate an entry the archive already contains", () => {
    const merged = mergeChangelog([entry("1.16.19"), entry("1.16.18")], entry("1.16.19"));
    expect(merged.map((e) => e.version)).toEqual(["1.16.19", "1.16.18"]);
  });

  it("prefers the archive's fuller entry over the condensed check payload", () => {
    // `version.json` carries only a summary of the newest entry (it has an 8 KB budget);
    // the archive carries the whole thing. If the summary won, opening the history would
    // show a truncated release note for the very release the user just installed.
    const archiveEntry = { ...entry("1.16.19"), category: "feature" as const, highlights: [
      { zh: "a", en: "a" }, { zh: "b", en: "b" }, { zh: "c", en: "c" }, { zh: "d", en: "d" },
    ] };
    const condensed = { ...entry("1.16.19"), category: "fix" as const, highlights: [{ zh: "a", en: "a" }] };
    const merged = mergeChangelog([archiveEntry], condensed);
    expect(merged[0].highlights).toHaveLength(4);
    expect(merged[0].category).toBe("feature");
  });

  it("still renders the newest entry when the archive is unavailable", () => {
    // Offline / 404 on changelog.json: version.json alone must be enough to show
    // that the update landed.
    expect(mergeChangelog(null, entry("1.16.19")).map((e) => e.version)).toEqual(["1.16.19"]);
    expect(mergeChangelog(undefined, entry("1.16.19"))).toHaveLength(1);
  });

  it("sorts an out-of-order archive newest-first", () => {
    const merged = mergeChangelog([entry("1.2.0"), entry("1.10.0"), entry("1.9.0")], null);
    expect(merged.map((e) => e.version)).toEqual(["1.10.0", "1.9.0", "1.2.0"]);
  });

  it("handles an empty archive with no latest entry", () => {
    expect(mergeChangelog([], undefined)).toEqual([]);
    expect(mergeChangelog(null, null)).toEqual([]);
  });
});

describe("changelogArchiveUrl", () => {
  it("keys the archive URL by version so a release invalidates it", () => {
    expect(changelogArchiveUrl("1.16.19")).toBe("/changelog.json?v=1.16.19");
    expect(changelogArchiveUrl("1.16.20")).not.toBe(changelogArchiveUrl("1.16.19"));
  });

  it("escapes the version segment", () => {
    expect(changelogArchiveUrl("1.16.19+build 1")).toBe("/changelog.json?v=1.16.19%2Bbuild%201");
  });
});
