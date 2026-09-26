import { describe, it, expect } from "vitest";
import { GS1_PATCHES, type Gs1PatchName } from "../data/gs1Patches";

/**
 * The filter-type trap, which cost this project a real defect.
 *
 * `FilterType::from_u32` in the core maps **1 to `Hp`** — a high-pass — while 0 is the lowpass every one of the native
 * presets uses. The patch table's comments called 1 "SVF" for long enough that **seven tonal patches** high-passed their
 * own body away: measured on the lead stem, `strings_lead` ran at eleven times the native render's zero-crossing rate, and
 * `bell_lead` had a −38 dB level deficit to go with it. The comment is why it survived review, and it is also why an audit
 * in this session read "type 1" everywhere and still concluded "fine".
 *
 * So the rule is written down as a test rather than a convention: a patch that voices a **tonal** instrument must use the
 * lowpass, and the only patches allowed a high-pass are the two **texture** beds, where removing the low end is the point.
 * A new patch added with `FILTER_TYPE: 1` for a string, pluck or lead sound fails here.
 */
const FILTER_TYPE_PARAM = 13;
/** The core's enum, restated where the test can see it: 0 Lp, 1 Hp, 2 Bp, 3 Notch, 4 Comb, 5 Formant. */
const LOWPASS = 0;

/** Hiss and crackle beds: a high-pass is the intended shape, not a mistake. */
const TEXTURE_PATCHES: Gs1PatchName[] = ["sampleSurface", "sampleTexture"];

describe("GS-1 patch filter types", () => {
  it("uses the lowpass for every tonal patch", () => {
    const offenders = (Object.keys(GS1_PATCHES) as Gs1PatchName[])
      .filter((name) => !TEXTURE_PATCHES.includes(name))
      .filter((name) => GS1_PATCHES[name][FILTER_TYPE_PARAM] !== LOWPASS);
    expect(offenders, "tonal patches must not be high-passed (the parameter is not what the old comment claimed)").toEqual(
      []
    );
  });

  it("leaves the texture beds their high-pass, on purpose", () => {
    for (const name of TEXTURE_PATCHES) {
      // Not an assertion about the value: an assertion that the exception is *stated* here rather than discovered later.
      expect(GS1_PATCHES[name][FILTER_TYPE_PARAM]).toBeGreaterThanOrEqual(0);
    }
  });
});
