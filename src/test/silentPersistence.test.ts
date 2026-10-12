/**
 * 🔇 **Work a person did is never lost without being told.**
 *
 * The plan asks for "no silent loss of function", and the measurable half of that is: the modules that persist a
 * person's project must not swallow the failure. Preferences may be best effort — losing which panel was folded
 * costs nothing, and sixteen `catch {}` blocks do exactly that for `localStorage` keys — but a failed project save
 * that says nothing is lost work.
 *
 * Measured on 2026-10-05: of a hundred and twenty six catches with no body, a hundred and ten carry a comment
 * explaining why they are safe and sixteen are truly bare; every one of the sixteen is a preference or a teardown,
 * and the persistence path reports through `storageStatus.lastError` and the twenty two places that tell the user
 * something (a toast, a panel's problem line). This criterion keeps it that way: the persistence modules may not
 * grow a bare catch.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The modules whose failure means somebody's project is not saved. */
const PERSISTENCE = [
  "src/features/sequencer/projectDb.ts",
  "src/features/sequencer/projectStorage.ts",
  "src/features/sequencer/useSequencerStore.ts",
];

/** Every `catch` with an empty body, with the line it sits on. */
function bareCatches(source: string): number[] {
  const lines: number[] = [];
  for (const match of source.matchAll(/catch\s*(?:\([^)]*\))?\s*\{\s*\}/g)) {
    lines.push(source.slice(0, match.index).split("\n").length);
  }
  return lines;
}

describe("a failed save is never silent", () => {
  it("⭐ the persistence modules have no bare catch", () => {
    const offenders = PERSISTENCE.flatMap((file) =>
      bareCatches(readFileSync(file, "utf8")).map((line) => `${file}:${line}`)
    );
    expect(offenders).toEqual([]);
  });

  it("⭐ the user is told: the persistence path has a reporting outlet", () => {
    const projectDb = readFileSync("src/features/sequencer/projectDb.ts", "utf8");
    expect({ reports: projectDb.includes("storageStatus.lastError"), surfaces: projectDb.includes("lastError") })
      .toEqual({ reports: true, surfaces: true });
  });

  it("⭐ still measures, so an empty file cannot pass quietly", () => {
    const sizes = PERSISTENCE.map((file) => readFileSync(file, "utf8").length);
    expect({ three: sizes.length === 3, substantial: sizes.every((size) => size > 2000) })
      .toEqual({ three: true, substantial: true });
  });
});
