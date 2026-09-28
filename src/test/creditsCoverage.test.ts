import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseManifest } from "../data/sampleManifest";

/**
 * ⚠️ **KNOWN HOLLOW — the third check does not yet read the manifest, and must not be trusted until it does.**
 *
 * A negative control proves it: with a `public/samples/manifest.json` containing a **CC-BY entry credited nowhere**, the suite still reports 3 passed. So the file is not
 * reaching the assertion — most likely the read at module scope — and the check currently passes for the wrong reason. That is worse than having no check, because it
 * looks like protection.
 *
 * The stronger rule it is *meant* to enforce is already written and was itself a correction: the entry must be credited **inside the Credits section** and the
 * **attribution's own names** must appear there, because "Accurate-Salamander" is mentioned in the planned table and a mention of what may arrive one day is not a credit
 * for what is redistributed today.
 *
 * Next step is a diagnostic, not a guess: have the test **print what it reads** and compare it with the file on disk. Fixing this is a prerequisite for shipping any
 * library with an attribution obligation.
 *
 * The half of the Credit rule that a person can forget: **a manifest entry whose licence requires attribution must be credited in the README.**
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
    // The section must actually name the libraries, not merely exist as a heading.
    expect(section!).toMatch(/VCSL|Salamander|Karoryfer|Virtuosity/);
  });

  it("states the rule rather than relying on whoever adds the next library to remember it", () => {
    const section = README.split("## Credits")[1]!;
    expect(section).toMatch(/bundles or redistributes/);
    expect(section).toMatch(/CC BY/);
  });

  it("credits every manifest entry whose licence requires it", () => {
    if (manifestText === null) {
      // No manifest yet: nothing is redistributed, so there is nothing to credit. Stated rather than silently skipped.
      expect(README).toMatch(/No audio library is bundled today/);
      return;
    }
    const parsed = parseManifest(manifestText);
    expect(parsed.ok, `the manifest does not parse: ${parsed.errors.join("; ")}`).toBe(true);
    const requiring = parsed.manifest!.entries.filter(
      (entry) => !entry.excludedReason && (entry.licence === "CC-BY" || entry.licence === "CC-BY-SA")
    );
    const creditsSection = README.split("## Credits")[1]!.split("\n## ")[0]!;

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
