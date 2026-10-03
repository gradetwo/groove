/**
 * The onboarding line that tells a new user what this app can export names the formats it actually has.
 *
 * ## The report
 *
 * `help.ts`'s `onboarding_s7_desc` — the last card of the first-run tour — said "export lossless WAV/MIDI/ALS
 * projects". Measured on this tree that is three of **seven**, and one of the three names (`ALS`) is not even
 * the label the menu uses (`Ableton Set`, `.als`). The word "lossless" is also not true of the set: MP3 is the
 * menu's own lossy option, so the sentence made a claim the surface does not support.
 *
 * The seven, derived below rather than typed twice: the arrangement menu's six items (`MIDI`, `Ableton Set`,
 * `.groove`, `WAV`, `MP3`, `stems` — `ArrangementFileEntriesV2.tsx`) and the score tab's `MusicXML`
 * (`ScoreV2.tsx`). The workbench menu (`Toolbar.tsx`) holds the same six formats, and
 * `exportSurfaceCopy.test.ts` already holds the same seven for `package.json` and `index.html`; this file
 * holds the third sentence that made the same three-format claim.
 *
 * ## Scope, and what is deliberately not counted
 *
 * The sentence is about exporting a *project*, so the piano roll's clip-level dropdown
 * (`piano-roll-export-json`, `piano-roll-export-midi`) is out of scope: it saves one track's steps as clip
 * data or one track as `.mid`, which the seven project formats already cover as MIDI. The two menu
 * *containers* (`arrangement-export-menu`, `arrangement-export-items`) are excluded the same way: they wrap
 * the list rather than choose a format, and a new item must appear in the table below by name.
 *
 * ## Why the table is anchored three ways
 *
 * The id set is derived from the component, so a new menu item fails here by name instead of silently
 * outgrowing the prose. Each word must already appear in **that control's own shipped label**, so the copy
 * cannot invent a format name the UI does not use. And the onboarding line must carry one word per format in
 * **both** languages. Reverting the sentence to the old one fails on the five formats it dropped, and the
 * last test pins the old phrasing so it cannot come back.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DICTIONARY, type MessageKey } from "../i18n/locales";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const HELP = "src/i18n/locales/help.ts";
const ARRANGEMENT_MENU = "src/components/arrangement/ArrangementFileEntriesV2.tsx";
const SCORE = "src/components/arrangement/ScoreV2.tsx";

/**
 * The measured surface: one row per exported format, with the anchor that proves it exists, the shipped
 * label it must sound like, and the word each language's copy has to use.
 */
const FORMATS: Array<{ id: string; source: string; labelKey: MessageKey; en: string; zh: string }> = [
  { id: "arrangement-export-midi", source: ARRANGEMENT_MENU, labelKey: "toolbar_export_midi", en: "MIDI", zh: "MIDI" },
  { id: "arrangement-export-als", source: ARRANGEMENT_MENU, labelKey: "toolbar_export_als", en: "Ableton", zh: "Ableton" },
  { id: "arrangement-export-groove", source: ARRANGEMENT_MENU, labelKey: "toolbar_export_groove", en: ".groove", zh: ".groove" },
  { id: "arrangement-export-wav", source: ARRANGEMENT_MENU, labelKey: "toolbar_export_wav", en: "WAV", zh: "WAV" },
  { id: "arrangement-export-mp3", source: ARRANGEMENT_MENU, labelKey: "toolbar_export_mp3", en: "MP3", zh: "MP3" },
  { id: "arrangement-export-stems", source: ARRANGEMENT_MENU, labelKey: "toolbar_export_stems", en: "stems", zh: "分轨" },
  { id: "score-export-musicxml", source: SCORE, labelKey: "arrangement_musicxml_export", en: "MusicXML", zh: "MusicXML" },
];

/** Anchors that wrap the menu rather than choose a format. Named so the derived set below stays exact. */
const MENU_CONTAINERS = ["arrangement-export-menu", "arrangement-export-items"];

/** The `{ en, zh }` pair of the onboarding sentence under test. */
function onboardingDesc(): { en: string; zh: string } {
  const match = read(HELP).match(
    /onboarding_s7_desc:\s*\{\s*en:\s*"((?:[^"\\]|\\.)*)"\s*,\s*zh:\s*"((?:[^"\\]|\\.)*)"\s*\}/
  );
  expect(match, "help.ts should still carry a paired onboarding_s7_desc").not.toBeNull();
  return { en: match![1], zh: match![2] };
}

describe("the help copy's export list matches the shipped surface", () => {
  it("derives the format list from the components, so a new format cannot slip past the prose", () => {
    const arrangement = read(ARRANGEMENT_MENU);
    for (const id of MENU_CONTAINERS) {
      expect(arrangement, `${id} was removed: the menu's container anchors changed`).toContain(`data-testid="${id}"`);
    }

    const ids = [...arrangement.matchAll(/data-testid="(arrangement-export-[a-z0-9]+)"/g)].map((match) => match[1]);
    const items = ids.filter((id) => !MENU_CONTAINERS.includes(id)).sort();

    expect(
      items,
      "the arrangement menu's items changed: add or remove a FORMATS row (and update help.ts) rather than this expectation alone"
    ).toEqual(FORMATS.filter((format) => format.source === ARRANGEMENT_MENU).map((format) => format.id).sort());

    for (const format of FORMATS) {
      expect(read(format.source), `${format.id} is listed here but not rendered in ${format.source}`).toContain(
        `data-testid="${format.id}"`
      );
    }
  });

  it("uses, for each format, a word the shipped control itself uses", () => {
    // The check that keeps the prose honest about *names*: a word in the sentence that no label carries is a
    // format the user cannot find.
    for (const format of FORMATS) {
      const label = DICTIONARY[format.labelKey] as { en: string; zh: string };
      expect(label, `${format.labelKey} is referenced but not in the dictionary`).toBeTruthy();
      expect(
        label.en.toLowerCase(),
        `${format.labelKey}'s English label ("${label.en}") does not contain "${format.en}"`
      ).toContain(format.en.toLowerCase());
      expect(label.zh, `${format.labelKey}'s Chinese label ("${label.zh}") does not contain "${format.zh}"`).toContain(
        format.zh
      );
    }
  });

  it("names every measured format in the onboarding line, in both languages", () => {
    const { en, zh } = onboardingDesc();
    for (const format of FORMATS) {
      expect(en, `the English onboarding line no longer names ${format.en}`).toContain(format.en);
      expect(zh, `the Chinese onboarding line no longer names ${format.zh}`).toContain(format.zh);
    }
  });

  it("stays an onboarding sentence rather than a format dump", () => {
    // Seven names is already the longest list on the tour; a length cap keeps the next edit from pasting the
    // menu's hints in behind them.
    const { en, zh } = onboardingDesc();
    expect(en.length, "the English onboarding line grew into a list of instructions").toBeLessThan(220);
    expect(zh.length, "the Chinese onboarding line grew into a list of instructions").toBeLessThan(90);
  });

  it("has dropped the three-format, lossless phrasing that was the defect", () => {
    const { en, zh } = onboardingDesc();
    // The old sentences, verbatim: English "export lossless WAV/MIDI/ALS projects", Chinese
    // "一键无损导出 WAV/MIDI/Ableton 工程". They named three of seven, and MP3 makes "lossless" false.
    expect(en, "the English line still claims losslessness, which MP3 contradicts").not.toContain("lossless");
    expect(zh, "the Chinese line still claims 无损, which MP3 contradicts").not.toContain("无损");
    expect(en, "the English line still advertises the old three-format surface").not.toContain("WAV/MIDI/ALS");
    expect(zh, "the Chinese line still advertises the old three-format surface").not.toContain("WAV/MIDI/Ableton");
  });
});
