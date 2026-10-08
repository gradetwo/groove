import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The interface a Chinese reader sees is Chinese** (third evaluation, F12).
 *
 * The evaluation measured the 390×844 layout and found, among the geometry, three arrangement verbs still in English on a
 * Chinese interface — "Ramp velocity", "Quantise lengths", "Copy selection" — and the sound-library panel English
 * throughout. The strings are named here rather than inferred, because "translate the UI" is not a criterion: these are
 * the islands the report found, and each must be drawn from the dictionary.
 */
const ui = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");
const arrangement = ui("components/arrangement/ArrangementViewV2.tsx");
const libraries = ui("components/settings/SampleLibrariesPanel.tsx");
const dictionary = ui("i18n/locales/common.ts");

describe("the Chinese interface's own islands", () => {
  it("⭐ the three arrangement verbs are dictionary entries, not literals", () => {
    for (const [source, key] of [
      [arrangement, "arrangement_ramp_velocity"],
      [arrangement, "arrangement_quantise_lengths"],
      [arrangement, "arrangement_copy_selection"],
    ] as const) {
      expect(source, `${key} is asked for by name`).toContain(`t("${key}")`);
      // ⭐ And the literal is gone: a button that kept both would still read English.
      expect(source, `the literal that stood where ${key} now is`).not.toMatch(new RegExp(`>\\s*${key.split("_").slice(1).join(" ").replace(/^/, "").replace(/(^| )([a-z])/g, (_m, _s, c) => c.toUpperCase())}\\s*<`));
    }
    expect(arrangement, "the English verb is no longer rendered as text").not.toMatch(/>\s*Ramp velocity\s*</);
    expect(arrangement).not.toMatch(/>\s*Quantise lengths\s*</);
    expect(arrangement).not.toMatch(/>\s*Copy selection\s*</);
  });

  it("⭐ the library panel draws its words from the dictionary too, in both languages", () => {
    expect(libraries, "the heading").toContain('t("sample_libraries_title")');
    expect(libraries, "the sentence that explains what a library is").toContain('t("sample_libraries_intro")');
    expect(libraries, "and the removal message a person reads after removing one").toContain('t("sample_libraries_removed"');
    for (const key of ["sample_libraries_title", "sample_libraries_intro", "sample_libraries_removed"]) {
      /**
       * ⭐ The entry, not the line: an English/Chinese pair is written across lines when the sentence is long, and a
       * line-based check would call a perfectly good entry missing.
       */
      const from = dictionary.indexOf(`  ${key}:`);
      expect(from, `${key} is in the dictionary`).toBeGreaterThan(-1);
      const rest = dictionary.slice(from + key.length + 2);
      const boundary = /\n {2}[a-z][a-z0-9_]*:/.exec(rest);
      const entry = rest.slice(0, boundary === null ? undefined : boundary.index);
      expect(entry, `${key} has English`).toMatch(/en:\s*['"]/);
      const zh = /zh:\s*['"]([^'"]*)['"]/.exec(entry)?.[1] ?? "";
      expect(zh.length, `${key}'s Chinese must not be left to the English fallback`).toBeGreaterThan(1);
      expect(zh, `${key} must not simply repeat the English`).not.toBe(/en:\s*['"]([^'"]*)['"]/.exec(entry)?.[1]);
      expect(/[\u4e00-\u9fa5]/.test(zh), `${key}'s Chinese should be Chinese`).toBe(true);
    }
  });
});
