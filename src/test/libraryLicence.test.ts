import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalLicence, checkLibraryLicence, checkManifestLicences, requiresAttribution } from "../data/libraryLicence";

/**
 * The licence check that runs **before** four libraries are downloaded — because attribution is an obligation of the licence and the mirror is the redistribution.
 *
 * The failure it prevents is not hypothetical: `salamander-grand` was chosen to exercise the attribution path, and with four libraries that path stops being a demonstration and becomes a requirement.
 */
describe("library licences", () => {
  it("refuses a CC-BY library that carries no attribution", () => {
    const check = checkLibraryLicence({ id: "salamander-grand", licence: "CC-BY-4.0", sourceUrl: "https://example.org/piano" });
    // Mirroring a CC-BY library without its credit redistributes it wrongly — the obligation, not a courtesy.
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toMatch(/requires attribution/);
  });

  it("accepts a CC0 library without attribution, because that licence asks for none", () => {
    expect(checkLibraryLicence({ id: "vsco2-ce", licence: "CC0-1.0", sourceUrl: "https://example.org/vsco" }).ok).toBe(true);
  });

  it("refuses an unknown licence, so a new library cannot slip in unlabelled", () => {
    const check = checkLibraryLicence({ id: "mystery", licence: "free-ish", sourceUrl: "https://example.org/x" });
    expect(check.ok).toBe(false);
    expect(check.problems.join(" ")).toMatch(/unknown licence/);
  });

  it("requires a source for every library, because without one the licence claim is trust rather than a check", () => {
    expect(checkLibraryLicence({ id: "x", licence: "CC0-1.0" }).problems.join(" ")).toMatch(/no source URL/);
  });

  it("reports every bad library rather than stopping at the first", () => {
    const check = checkManifestLicences([
      { id: "a", licence: "CC-BY-4.0" },
      { id: "b", licence: "CC0-1.0", sourceUrl: "https://example.org/b" },
      { id: "c", licence: "CC-BY-SA-4.0", sourceUrl: "https://example.org/c" },
    ]);
    // A run should be able to refuse the whole manifest at once: fixing one library and re-running to find the next is a slow way to learn.
    expect(check.problems.some((problem) => problem.startsWith("a:"))).toBe(true);
    expect(check.problems.some((problem) => problem.startsWith("c:"))).toBe(true);
    expect(check.problems.some((problem) => problem.startsWith("b:"))).toBe(false);
  });

});

describe("the manifest this repository ships", () => {
  it("satisfies every licence it claims, which is the rule the two vocabularies kept breaking", () => {
    /**
     * The end-to-end rule the checker exists for, applied to the real file. Two gaps lived here and neither was visible: the manifest spells licences `CC0`/`CC-BY` while this checker knew only the SPDX forms, so every entry read as an unknown licence;
     * and the two hand-written entries carried no `sourceUrl`, without which a licence claim cannot be checked against where the bytes came from. Both are fixed, and this is the assertion that keeps them fixed.
     */
    const manifest = JSON.parse(readFileSync("public/samples/manifest.json", "utf8")) as {
      entries: { id: string; licence: string; attribution?: string; sourceUrl?: string; excludedReason?: string }[];
    };
    const shippable = manifest.entries.filter((entry) => !entry.excludedReason);
    const check = checkManifestLicences(shippable);
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(true);
    // And the entries a licence obliges credit for are the ones that declare it.
    for (const entry of shippable.filter((candidate) => requiresAttribution(canonicalLicence(candidate.licence)))) {
      expect(entry.attribution, `${entry.id} needs attribution`).toBeTruthy();
    }
  });
});
