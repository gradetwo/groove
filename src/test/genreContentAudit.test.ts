import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_GENRES } from "../data/genres";
import { auditGenreContent, MIN_GENRE_SOURCES, TEMPLATE_TEXT_MARKERS } from "../data/schema";

/** Deep-clone a real genre so each fixture is isolated. */
function cloneGenre(index = 0): any {
  return JSON.parse(JSON.stringify(ALL_GENRES[index]));
}

describe("Genre content audit (E-11b)", () => {
  const realAudit = auditGenreContent(ALL_GENRES);

  it("keeps the hard source-citation rule green on the shipped database", () => {
    expect(MIN_GENRE_SOURCES).toBe(2);
    expect(realAudit.insufficientSources.count).toBe(0);
    expect(realAudit.hardViolations).toEqual([]);
    expect(realAudit.passed).toBe(true);
  });

  it("reports the empty-taxonomy baseline as a warning count, not a failure", () => {
    // Documented baseline: every shipped genre currently has empty taxonomy.
    expect(realAudit.emptyTaxonomy.count).toBe(ALL_GENRES.length);
    expect(realAudit.emptyTaxonomy.genreIds.length).toBe(ALL_GENRES.length);
    expect(realAudit.warnings.some((w) => w.includes("empty parent_genres"))).toBe(true);
    expect(realAudit.hardViolations.some((v) => v.includes("taxonomy"))).toBe(false);
    expect(realAudit.passed).toBe(true);
  });

  it("reports templated placeholder copy as a warning count, not a failure", () => {
    expect(TEMPLATE_TEXT_MARKERS).toContain("signature kick character");
    // Documented baseline: every shipped genre contains the templated kick copy.
    expect(realAudit.templatedText.count).toBe(ALL_GENRES.length);
    expect(realAudit.warnings.some((w) => w.includes("templated copy"))).toBe(true);
    expect(realAudit.passed).toBe(true);
  });

  it("flags fewer than 2 sources as a HARD violation", () => {
    const thin = cloneGenre();
    thin.id = "fixture-thin-sources";
    thin.sources = ["Only One Source"];

    const audit = auditGenreContent([thin]);
    expect(audit.insufficientSources.count).toBe(1);
    expect(audit.insufficientSources.genreIds).toEqual(["fixture-thin-sources"]);
    expect(audit.hardViolations.length).toBeGreaterThan(0);
    expect(audit.passed).toBe(false);
  });

  it("treats empty or non-string sources as insufficient", () => {
    const empty = cloneGenre();
    empty.id = "fixture-empty-sources";
    empty.sources = ["   ", ""];

    const audit = auditGenreContent([empty]);
    expect(audit.insufficientSources.genreIds).toEqual(["fixture-empty-sources"]);
    expect(audit.passed).toBe(false);
  });

  it("detects templated copy in a synthetic genre but stays report-only", () => {
    const templated = cloneGenre();
    templated.id = "fixture-templated";
    templated.drum_pattern.kick.en = "Fixture signature kick character.";

    const audit = auditGenreContent([templated]);
    expect(audit.templatedText.genreIds).toContain("fixture-templated");
    expect(audit.passed).toBe(true);
  });

  it("detects an all-empty taxonomy triple as a warning while still passing", () => {
    const noTaxonomy = cloneGenre();
    noTaxonomy.id = "fixture-no-taxonomy";
    noTaxonomy.parent_genres = [];
    noTaxonomy.subgenres = [];
    noTaxonomy.related_genres = [];

    const audit = auditGenreContent([noTaxonomy]);
    expect(audit.emptyTaxonomy.genreIds).toEqual(["fixture-no-taxonomy"]);
    expect(audit.warnings.length).toBeGreaterThan(0);
    expect(audit.passed).toBe(true);
  });

  it("passes a clean genre with populated taxonomy, distinct copy and >= 2 sources", () => {
    const clean = cloneGenre();
    clean.id = "fixture-clean";
    clean.parent_genres = ["chicago-house"];
    clean.subgenres = ["deep-house"];
    clean.related_genres = ["garage-house"];
    clean.sources = ["Book A", "Journal B"];
    clean.drum_pattern.kick.en = "Tight analog kick with a short decay.";

    const audit = auditGenreContent([clean]);
    expect(audit.emptyTaxonomy.count).toBe(0);
    expect(audit.templatedText.count).toBe(0);
    expect(audit.insufficientSources.count).toBe(0);
    expect(audit.warnings).toEqual([]);
    expect(audit.passed).toBe(true);
  });

  it("is wired into the lint:data gate and the standalone linter script", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["lint:data"]).toContain("genreContentAudit.test.ts");

    const linter = readFileSync(resolve(process.cwd(), "scripts/lint_genres.ts"), "utf8");
    expect(linter).toContain("auditGenreContent");
    expect(linter).toContain("hardViolations");
  });
});
