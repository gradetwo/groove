import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseManifest } from "../data/sampleManifest";

/**
 * The half of the Credit rule that a person can forget: **a manifest entry whose licence requires attribution must be credited in the README's redistributed list.**
 *
 * **This check was hollow twice, and negative controls caught both.** The first version accepted the entry's name appearing **anywhere** in the README — and the planned
 * table already names Accurate-Salamander, so an entry added without being credited passed. The second version searched the whole `## Credits` section, which also
 * contains that planned table, so it passed for the same reason one level down. The diagnostic that settled it printed `cwd`, `existsSync` and the file length — **all
 * correct** — which proved the reading was fine and the **assertion** was wrong.
 *
 * The fix is structural as well as logical: the README now separates `### Redistributed by this project` from `### Planned, not yet included`, because *planning to
 * credit someone is not crediting them*, and the check reads **only the first list**. A negative control now fails as it should (with the entry named in the message) and
 * the positive case passes, and both were run before this comment replaced the warning.
 *
 * The manifest enforces that the attribution *exists* in the data; this enforces that it *reaches the reader*, which is where a licence obligation actually lives — a
 * credit buried in a JSON file nobody opens is not a credit. It reads the real manifest if one has been added and passes vacuously until then, so it also carries a guard
 * on itself: the section must exist, and the extractor must have found something, or the test would be green for the wrong reason.
 */
const README = readFileSync("README.md", "utf8");

const manifestPath = "public/samples/manifest.json";
const manifestText = (() => {
  try {
    return readFileSync(manifestPath, "utf8");
  } catch {
    return null;
  }
})();

describe("credits coverage", () => {
  it("finds the Credits section, so the check below cannot pass for the wrong reason", () => {
    const section = README.split("## Credits")[1];
    expect(section, "README.md has no ## Credits section — the obligation has nowhere to land").toBeDefined();
    // The separating headings must exist, or the coverage check below would search an empty string and pass for that reason instead.
    expect(README).toContain("### Redistributed by this project");
    expect(README).toContain("### Planned, not yet included");
    // And the planned list must still name the libraries — the headings must not have swallowed the content.
    expect(README.split("### Planned")[1]!).toMatch(/VCSL|Salamander|Karoryfer|Virtuosity/);
  });

  it("states the rule rather than relying on whoever adds the next library to remember it", () => {
    const section = README.split("## Credits")[1]!;
    expect(section).toMatch(/bundles or redistributes/);
    expect(section).toMatch(/CC BY/);
  });

  it("credits every manifest entry whose licence requires it", () => {
    if (manifestText === null) {
      // No manifest yet: nothing is redistributed, so there is nothing to credit. Stated rather than silently skipped.
      expect(README).toMatch(/None yet/);
      return;
    }
    const parsed = parseManifest(manifestText);
    expect(parsed.ok, `the manifest does not parse: ${parsed.errors.join("; ")}`).toBe(true);
    /**
     * **The premise refined, and the refinement matters.** The first version checked every CC BY entry in the manifest — and a negative control for that never ran, because
     * the manifest had no CC BY entry. Once `salamander-grand` was declared, this test failed: a library **declared** with a pin, whose samples nobody has downloaded, is
     * not yet redistributed, so demanding its credit in the "redistributed" list was one step too eager.
     *
     * Redistribution begins when an entry can reach the catalogue, which is exactly when `sampleAssetsFromManifest` accepts it — and that requires a `durationSeconds`.
     * So the obligation follows that, no earlier and no later.
     */
    const requiring = parsed.manifest!.entries.filter(
      (entry) =>
        !entry.excludedReason &&
        typeof entry.durationSeconds === "number" &&
        entry.durationSeconds > 0 &&
        (entry.licence === "CC-BY" || entry.licence === "CC-BY-SA")
    );
    /**
     * **Only the first list counts**, and separating them was the fix for the hollow guard.
     *
     * The section used to hold one table that mixed "redistributed" with "planned", so a manifest entry credited nowhere still passed: its name was already there as a
     * **plan**. The diagnostic that settled it printed `cwd`, `existsSync` and the file length — all correct, which proved the fault was in the assertion rather than the
     * reading. Now the obligation is checked against `### Redistributed by this project` **only**, and the planned list is explicitly not evidence.
     */
    const creditsSection = README.split("### Redistributed by this project")[1]!.split("### Planned")[0]!;

    /**
     * **The first version of this check was hollow, and only a negative control caught it.**
     *
     * It asked whether the entry's id or name appeared anywhere in the README — and the README's *planned* table already names Accurate-Salamander, so a manifest entry
     * that had been **added without being credited** passed. A mention of what may arrive one day is not a credit for what is being redistributed today.
     *
     * So the check is now the obligation itself: the entry must be credited **inside the Credits section**, and the **attribution string must be there** — because a
     * CC BY licence requires crediting the *author*, not merely naming the library.
     */
    const missing = requiring.filter((entry) => {
      if (!creditsSection.includes(entry.id) && !creditsSection.includes(entry.name)) return true;
      const attribution = (entry.attribution ?? "").trim();
      if (attribution === "") return true;
      // Every distinct name in the attribution must appear in the section, so half a credit does not count as one.
      return attribution
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 2)
        .some((part) => !creditsSection.includes(part));
    });
    expect(
      missing.map((entry) => entry.id),
      "these entries require attribution and are not credited inside the README's Credits section, with the names their licence requires"
    ).toEqual([]);
  });
});
