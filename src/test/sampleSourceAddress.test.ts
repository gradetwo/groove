/**
 * ⭐ **The source address, against the repository the pin names — the criterion for the defect two libraries had.**
 *
 * ## The reading this file is built on
 *
 * The owner reported one address and one address only:
 *
 * ```
 * asked for   …/b4920dc6…/Emilyguitar/notes/c6_mf_rr1.wav   → 404
 * correct     …/b4920dc6…/notes/c6_mf_rr1.wav               → 200
 * ```
 *
 * The extra `Emilyguitar/` was not the *mirror's* `prefix` — commit `7433a89` had already removed that from the source URL and its comment is the record. It was simpler and worse: the **recorded path
 * itself** carries the layer. These two libraries are the only entries whose bytes come from a **release zip** *and* whose zip has a top-level directory, and `upload_samples.mjs` fills `files[].path`
 * from `path.relative(workdir, full)` after unpacking — so the archive's own `Emilyguitar/`／`Meatbass/` folder became part of every recorded path, while the pinned repository is flat at its root.
 *
 * Measured over the whole corpus with the repository's own modules, and the numbers are in the crate at the top of `sampleSourceAddressPins.ts`: **45 of 320** source program addresses answered `404` before,
 * **0 of 320** after, and the 45 were exactly these two libraries' programs.
 *
 * ## What is pinned, and why in that shape
 *
 * A digest of the URL list would be compact and unreadable. Instead each library pins its **program count, its first source URL and its first mirror URL**, and the resolver test below re-derives
 * **every** program's URL and requires it to match the pinned prefix. A library added, a program renamed, a pin moved or a prefix invented all fail here, and the message names the library.
 *
 * ⚠️ **The two rules are asserted in opposite directions on purpose** — the source address must *not* have the extra layer, the mirror address must. A later change that "unifies" the two builders
 * turns one of these red, which is the point.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIRROR_ROOT, programsOf, SOURCE_ADDRESS_PINS } from "./sampleSourceAddressPins";
import { parseManifest, sourceSfzUrl, mirrorSfzUrl, sourceRelativePath, type SampleManifest } from "../data/sampleManifest";

const shipped = (): SampleManifest => {
  const parsed = parseManifest(readFileSync("public/samples/manifest.json", "utf8"));
  expect(parsed.ok, `the shipped manifest must parse: ${parsed.errors.join("; ")}`).toBe(true);
  return parsed.manifest!;
};

describe("the source address is the repository's own path, and the mirror's is not", () => {
  it("asks emilyguitar for `…/<pin>/emily_basic.sfz`, the address the owner gave, and never for the directory layer", () => {
    const manifest = shipped();
    const url = sourceSfzUrl(manifest, "karoryfer-emilyguitar", "Emilyguitar/emily_basic.sfz")!;

    // The literal address the owner measured as correct, character for character.
    expect(url).toBe("https://raw.githubusercontent.com/sfzinstruments/karoryfer.emilyguitar/b4920dc662fd9cad6dcaccdeecffdd91c8725d8c/emily_basic.sfz");
    expect(url).not.toContain("/Emilyguitar/");

    /**
     * ⭐ **And the reading only one candidate produces.** The recorded path still carries the archive's layer — that is a true fact about the mirror and it is kept — so the builder is what must
     * remove it. Calling the same function with the entry's declared `sourcePrefix` stripped out reproduces the broken address exactly, which is what makes this criterion *about* the fix rather
     * than about the string.
     */
    expect(sourceSfzUrl(manifest, "karoryfer-emilyguitar", "Emilyguitar/emily_basic.sfz".replace("Emilyguitar/", ""))).toBe(url);
    const entry = manifest.entries.find((candidate) => candidate.id === "karoryfer-emilyguitar")!;
    const withoutTheField: SampleManifest = { version: 1, entries: [{ ...entry, sourcePrefix: undefined }] };
    expect(sourceSfzUrl(withoutTheField, "karoryfer-emilyguitar")!.endsWith("/Emilyguitar/emily_basic.sfz")).toBe(true);
  });

  it("keeps the mirror's address byte-for-byte what it was — the layer belongs there", () => {
    const manifest = shipped();
    expect(mirrorSfzUrl(manifest, "karoryfer-emilyguitar", MIRROR_ROOT)).toBe(
      `${MIRROR_ROOT}/karoryfer-emilyguitar/Emilyguitar/emily_basic.sfz`
    );
    expect(mirrorSfzUrl(manifest, "karoryfer-meatbass", MIRROR_ROOT)).toBe(
      `${MIRROR_ROOT}/karoryfer-meatbass/Meatbass/Programs/01_arco_modwheel.sfz`
    );
  });

  it("removes only the layer an entry declares, and returns an undeclared path untouched rather than searching for a shorter one", () => {
    expect(sourceRelativePath("Emilyguitar/notes/c6_mf_rr1.wav", "Emilyguitar")).toBe("notes/c6_mf_rr1.wav");
    expect(sourceRelativePath("Emilyguitar/notes/x.wav", "Emilyguitar/")).toBe("notes/x.wav");
    expect(sourceRelativePath("notes/c6_mf_rr1.wav", "Emilyguitar")).toBe("notes/c6_mf_rr1.wav");
    // A path that merely contains the layer is not a path that starts with it: no substring surgery.
    expect(sourceRelativePath("notes/Emilyguitar/x.wav", "Emilyguitar")).toBe("notes/Emilyguitar/x.wav");
    expect(sourceRelativePath("Emilyguitar", "Emilyguitar")).toBe("Emilyguitar");
    expect(sourceRelativePath("a/b.sfz", undefined)).toBe("a/b.sfz");
  });
});

describe("every library's source and mirror addresses, pinned", () => {
  it("holds exactly the 33 libraries the manifest ships, each with the pinned program count and first addresses", () => {
    const manifest = shipped();
    const ids = manifest.entries.map((entry) => entry.id).sort();
    expect(ids).toEqual(Object.keys(SOURCE_ADDRESS_PINS).sort());
    for (const entry of manifest.entries) {
      const pin = SOURCE_ADDRESS_PINS[entry.id]!;
      expect(programsOf(entry).length, `${entry.id}: program count`).toBe(pin.programs);
      expect(sourceSfzUrl(manifest, entry.id), `${entry.id}: first source address`).toBe(pin.source);
      expect(mirrorSfzUrl(manifest, entry.id, MIRROR_ROOT), `${entry.id}: first mirror address`).toBe(pin.mirror);
    }
  });

  it("derives every one of the corpus's program addresses from repo + pin + the repository-relative path, with no second reading", () => {
    const manifest = shipped();
    let checked = 0;
    for (const entry of manifest.entries) {
      for (const program of programsOf(entry)) {
        const url = sourceSfzUrl(manifest, entry.id, program)!;
        if (!entry.repo || !entry.pin) {
          expect(url, `${entry.id}: no repo/pin means no source address at all`).toBeUndefined();
          continue;
        }
        expect(url.startsWith(`https://raw.githubusercontent.com/${entry.repo}/${entry.pin}/`), `${entry.id}: ${url}`).toBe(true);
        const relative = sourceRelativePath(program, entry.sourcePrefix);
        expect(url.endsWith(relative), `${entry.id}: ${program} must resolve to ${relative}`).toBe(true);
        // The layer the entry declares is gone from the address, and it is the *only* thing removed.
        if (entry.sourcePrefix) {
          expect(url.includes(`/${entry.sourcePrefix}/`), `${entry.id}: ${url} still carries ${entry.sourcePrefix}/`).toBe(false);
          expect(`https://raw.githubusercontent.com/${entry.repo}/${entry.pin}/${program}`).not.toBe(url);
        }
        checked++;
      }
    }
    expect(checked, "the corpus's program count").toBeGreaterThan(200);
  });
});

describe("a declared sourcePrefix is a claim about the data, and it is checked", () => {
  it("every entry that declares one really has it on its sfz, its instruments and every file path", () => {
    const manifest = shipped();
    const declared = manifest.entries.filter((entry) => entry.sourcePrefix !== undefined);
    /**
     * **The two, and they are the two zip libraries the measurement named.** A count rather than "at least one" so an entry that quietly gains or loses the field is visible here.
     */
    expect(declared.map((entry) => entry.id).sort()).toEqual(["karoryfer-emilyguitar", "karoryfer-meatbass"]);

    for (const entry of declared) {
      const layer = entry.sourcePrefix!;
      const paths = [...programsOf(entry), ...entry.files.map((file) => file.path)];
      expect(paths.length, `${entry.id}: nothing to check`).toBeGreaterThan(0);
      const offending = paths.filter((path) => !path.startsWith(`${layer}/`));
      expect(offending.slice(0, 5), `${entry.id}: ${offending.length} of ${paths.length} recorded paths do not begin with ${layer}/`).toEqual([]);
      // And the field must not be a duplicate of the mirror prefix: the two answer different questions.
      expect(layer, `${entry.id}: sourcePrefix must not simply repeat prefix`).not.toBe(entry.prefix);
    }
  });

  it("every library that does not declare one has a flat-at-the-root source, which is the shape that needs no field", () => {
    const manifest = shipped();
    for (const entry of manifest.entries) {
      if (entry.sourcePrefix !== undefined || !entry.repo || !entry.pin) continue;
      // No declaration means the recorded paths are already repository-relative, so the source URL is the recorded path unchanged.
      for (const program of programsOf(entry)) {
        expect(sourceSfzUrl(manifest, entry.id, program)).toBe(`https://raw.githubusercontent.com/${entry.repo}/${entry.pin}/${program}`);
      }
    }
  });
});
