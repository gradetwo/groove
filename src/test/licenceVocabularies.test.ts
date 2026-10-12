/**
 * **The manifest vocabulary and the library-licence vocabulary are one decision, not two.**
 *
 * ## Why this file exists
 *
 * `src/data/sampleManifest.ts` spells licences the way a manifest writes them (`CC0`, `CC-BY`) and
 * `src/data/libraryLicence.ts` holds the canonical spellings (`CC0-1.0`, `CC-BY-4.0`), joined by that file's
 * `LICENCE_SYNONYMS` map. A comment in the manifest already said the two "must agree" — and one value proved the
 * difference between saying it and checking it: **`public-domain` was accepted by the library checker and could not be
 * written in a manifest at all**, so a public-domain library could be cleared for mirroring and then fail to be
 * declared. Nothing failed; the direction of the gap is what made it hard to see.
 *
 * ## ⚠️ The first version of this file failed on a correct tree, twice, and both are worth keeping
 *
 * 1. Its synthetic library entry asked `requiresAttribution` with the **manifest** spelling
 *    (`CC-Sampling-Plus`) while that function compares the **canonical** one (`CC Sampling Plus 1.0`), so the entry
 *    arrived without the credit the checker demands and the criterion failed on correct code. A helper that models
 *    another module's rule has to call that module, not restate it.
 * 2. And the walk found **`unknown`**, which the checker deliberately rejects. That is not a defect: `unknown` means
 *    "somebody must decide before this is mirrored" and `unknown-mirrored` means "the decision was made and the terms
 *    were not found", so a value that is *not* mirrorable must not satisfy the mirroring check. The exclusion is
 *    therefore asserted rather than filtered — the one value that is allowed to fail here has to keep failing.
 *
 * ## What is asserted
 *
 * 1. **A public-domain entry parses** — the assertion that fails on the code as it was.
 * 2. **Every mirrorable value the manifest can spell canonicalises into one the checker accepts** — the durable half,
 *    which walks the list rather than naming values, so adding a value to one side alone fails here.
 * 3. **`unknown` is rejected, and `public-domain` is not** — so the exclusion above cannot quietly become a filter.
 * 4. **The shipped manifest parses and every entry it declares clears the checker.**
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseManifest, LICENCES, type SampleLicence, type SampleManifestEntry } from "../data/sampleManifest";
import { checkLibraryLicence, requiresAttribution } from "../data/libraryLicence";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const shipped = JSON.parse(readFileSync(path.join(ROOT, "public", "samples", "manifest.json"), "utf8")) as {
  entries: SampleManifestEntry[];
};

/** A manifest entry of the shape the shipped file already uses, with the licence swapped — so no field is guessed. */
function entryWithLicence(licence: SampleLicence): SampleManifestEntry {
  return { ...shipped.entries[0], id: "licence-probe", licence };
}

/**
 * A library entry that is valid apart from its licence. Attribution is always supplied, which the checker ignores
 * where nothing is owed — cheaper and more honest than restating `requiresAttribution`'s rule in a second place.
 */
function libraryEntry(licence: string) {
  return { id: "licence-probe", licence, sourceUrl: "https://example.test/library", attribution: "an author" };
}

/** The one value that is *meant* to fail the mirroring check: it says the decision has not been made yet. */
const NOT_MIRRORABLE = "unknown";

describe("the licence vocabularies", () => {
  it("parses a public-domain manifest entry, which is the value that used to be unwritable", () => {
    const result = parseManifest(JSON.stringify({ version: 1, entries: [entryWithLicence("public-domain")] }));
    expect(result.errors, `public-domain must be spellable in a manifest: ${result.errors.join("; ")}`).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("walks every mirrorable licence the manifest can spell through the library checker", () => {
    const unknown: string[] = [];
    for (const licence of LICENCES) {
      if (licence === NOT_MIRRORABLE) continue;
      const verdict = checkLibraryLicence(libraryEntry(licence));
      if (!verdict.ok) unknown.push(`${licence} → ${verdict.problems.join("; ")}`);
    }
    expect(unknown, "these manifest licences are not ones the library checker knows how to satisfy").toEqual([]);
  });

  it("keeps the one allowed failure failing, and does not let it spread to the value that was just added", () => {
    expect(checkLibraryLicence(libraryEntry(NOT_MIRRORABLE)).ok, "unknown is not a licence to mirror under").toBe(false);
    expect(checkLibraryLicence(libraryEntry("public-domain")).ok, "public-domain asks nothing, so nothing can be unmet").toBe(true);
    expect(requiresAttribution("public-domain")).toBe(false);
  });

  it("parses the shipped manifest and clears every entry it declares", () => {
    const text = readFileSync(path.join(ROOT, "public", "samples", "manifest.json"), "utf8");
    const parsed = parseManifest(text);
    expect(parsed.errors, `the shipped manifest must parse: ${parsed.errors.slice(0, 3).join("; ")}`).toEqual([]);
    for (const entry of shipped.entries) {
      const verdict = checkLibraryLicence({
        id: entry.id,
        licence: entry.licence,
        sourceUrl: entry.sourceUrl ?? "",
        attribution: entry.attribution
      });
      expect(verdict.problems, `${entry.id} (${entry.licence}) must clear the library checker`).toEqual([]);
    }
  });
});
