import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **Hearing an instrument before choosing it** (owner's instruction 2026-10-10: *"chooser 乐器试听也要做…含 44px 触控与音频门控"*).
 *
 * The app already had the hard part: `playArrangementV2`'s player exposes `audition({ assetId, midi })`, which sounds a note
 * from an asset **without touching any state** (measured by reading it: the genre page's audition uses the same door). So this
 * is wiring, and these are the wiring's promises: the control is separate from choosing, it is big enough for a thumb, it
 * sounds *that* row's asset, and it does not exist at all when there is no player to sound it.
 */
const list = readFileSync(resolve(__dirname, "../components/arrangement/InstrumentLibraryV2.tsx"), "utf8");
const browser = readFileSync(resolve(__dirname, "../components/arrangement/InstrumentBrowserV2.tsx"), "utf8");

describe("the chooser's audition", () => {
  it("⭐ is a sibling of the row, because a button cannot be nested in a button", () => {
    const li = list.indexOf("<li key={entry.assetId}>");
    const rowClose = list.indexOf("</button>", li);
    const audition = list.indexOf("instrument-audition-${entry.assetId}");
    expect(li, "the row wrapper").toBeGreaterThan(-1);
    expect(audition, "the audition control exists").toBeGreaterThan(rowClose);
  });

  it("⭐ is thumb-sized and names what it will play", () => {
    const at = list.indexOf("instrument-audition-${entry.assetId}");
    const block = list.slice(at, at + 900);
    expect(block, "44 px for a thumb").toContain("min-h-11 min-w-11");
    expect(block, "an accessible name").toContain("aria-label=");
    expect(block, "and it sounds the row's own asset").toMatch(/onAudition\(entry\.assetId\)/);
  });

  it("⭐ and does not exist when there is nothing to audition with", () => {
    expect(list, "the button is conditional").toMatch(/\{onAudition && \(/);
    expect(browser, "the browser passes it through only when given").toMatch(/\{\.\.\.\(onAudition \? \{ onAudition \} : \{\}\)\}/);
  });
});

/**
 * ⭐ **And it says that it sounded.** Every silent control this project has found failed the same way — the hint's duplicate
 * Listen, the export's first six seconds, the button that looked like it did nothing — so the round that gives the chooser a
 * voice also gives it a sentence.
 */
describe("the audition's words", () => {
  it("⭐ exist in both languages, with a slot for the instrument's name", () => {
    const locale = readFileSync(resolve(__dirname, "../i18n/locales/common.ts"), "utf8");
    for (const key of ["instrument_auditioning:", "instrument_audition_hint:"]) {
      const at = locale.indexOf(key);
      expect(at, `${key} exists`).toBeGreaterThan(-1);
      const block = locale.slice(at, at + 260);
      expect(block, `${key} is English and Chinese`).toMatch(/en: ".*[\u4e00-\u9fff]|zh: "[\u4e00-\u9fff]/);
    }
    expect(locale.slice(locale.indexOf("instrument_auditioning:"), locale.indexOf("instrument_auditioning:") + 160)).toContain("{name}");
  });
});
