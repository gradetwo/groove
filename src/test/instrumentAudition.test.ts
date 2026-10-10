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
    const audition = list.indexOf("instrument-audition-");
    expect(li, "the row wrapper").toBeGreaterThan(-1);
    expect(audition, "the audition control exists").toBeGreaterThan(rowClose);
  });

  it("⭐ is thumb-sized and names what it will play", () => {
    const at = list.indexOf("instrument-audition-");
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
