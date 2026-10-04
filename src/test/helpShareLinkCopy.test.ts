/**
 * ⭐ **The share-link sentence says what the codec does** (docs/OPEN_WORK.md: the owed item at `help.ts:74`).
 *
 * The English half said "an ultra-compact compressed link" and that is what the codec was measured to produce. The
 * Chinese half said the link contains **all the synth parameters**, which contradicts "ultra-compact" in the same
 * sentence and was measured false. The Chinese now agrees with the English, and this holds it: putting the old phrase
 * back fails.
 *
 * ⚠️ The second half of the same line, about a lane carrying the synth's own GS-1 patch, is **unverified** and is
 * deliberately not asserted either way; it is recorded in the ledger rather than endorsed here.
 */
import { describe, expect, it } from "vitest";
import { DICTIONARY } from "../i18n/locales";

const entry = (DICTIONARY as unknown as Record<string, { zh: string; en: string }>)["tut_maker_s3"];

describe("the share link sentence", () => {
  it("⭐ does not claim the link carries every synth parameter", () => {
    expect(entry, "tut_maker_s3 is gone").toBeDefined();
    expect({ claim: entry!.zh.includes("全部合成参数") }).toEqual({ claim: false });
    // The true half is the compact link, and it has to stay said.
    expect(entry!.zh).toContain("压缩");
    expect(entry!.en.toLowerCase()).toContain("compact");
  });
});
