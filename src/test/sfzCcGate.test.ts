/**
 * The CC gates, and the boundaries sfizz settled.
 *
 * A gate is not a modulation: a region outside its range is absent rather than quiet, so getting the comparison wrong removes a sound instead of changing one. Every boundary below was measured by rendering one tone per case with sfizz at
 * CC1 = 0, 63, 64 and 127 — the numbers are in `ccGate.ts` and the reason each is what it is.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expandIncludes } from "../audio/sfz/includes";
import { existsSync } from "node:fs";
import { parseSfz } from "../audio/sfz/parse";
import { readControlDefaults, regionSoundsAtCc, regionsAtCc } from "../audio/sfz/ccGate";
import { ccTuneCents } from "../audio/sfz/parse";

const region = (opcodes: string) => parseSfz(`<region> sample=tone.wav pitch_keycenter=60 ${opcodes}`)[0]!;

describe("the CC gates", () => {
  it("lets a region without any gate sound, whatever the controllers are", () => {
    // The common case, and the one that must not become conditional by accident.
    expect(regionSoundsAtCc(region("lokey=0 hikey=127"), new Map())).toBe(true);
    expect(regionSoundsAtCc(region("lokey=0 hikey=127"), new Map([[1, 0]]))).toBe(true);
  });

  it("applies `locc` as `cc >= value`, both ends inclusive", () => {
    const gated = region("locc1=64");
    expect(regionSoundsAtCc(gated, new Map([[1, 63]]))).toBe(false);
    // Exactly at the boundary it sounds: that is the measurement, not a rounding choice.
    expect(regionSoundsAtCc(gated, new Map([[1, 64]]))).toBe(true);
    expect(regionSoundsAtCc(gated, new Map([[1, 127]]))).toBe(true);
  });

  it("applies `hicc` as `cc <= value`, both ends inclusive", () => {
    const gated = region("hicc1=64");
    expect(regionSoundsAtCc(gated, new Map([[1, 0]]))).toBe(true);
    expect(regionSoundsAtCc(gated, new Map([[1, 64]]))).toBe(true);
    // And one step above the boundary it is gone, where a `locc` at the same value would still sound.
    expect(regionSoundsAtCc(gated, new Map([[1, 65]]))).toBe(false);
  });

  it("treats a controller nobody has set as zero", () => {
    // Measured with no CC sent at all: `locc1=64` is silent and `hicc1=0` sounds.
    expect(regionSoundsAtCc(region("locc1=64"), new Map())).toBe(false);
    expect(regionSoundsAtCc(region("hicc1=0"), new Map())).toBe(true);
  });

  it("reads initial values from `<control>`, including on the header line, and lets later ones win", () => {
    const defaults = readControlDefaults("<control> set_cc1=64\nset_cc4=63.5\n<control>\nset_cc1=127\n");
    expect(defaults.get(1)).toBe(127);
    // Fractional values are real in this format: `virtuosity_drums` sets CC90 to 63.5 as its "no detune" value.
    expect(defaults.get(4)).toBe(63.5);
    // A CC the file never mentions is absent rather than zero, so the caller's "unset is 0" rule stays in one place.
    expect(defaults.has(7)).toBe(false);
  });

  it("gates each region by its own conditions, keeping the ones that pass", () => {
    const regions = parseSfz("<region> sample=always.wav pitch_keycenter=60\n<region> sample=high.wav pitch_keycenter=60 locc1=64\n<region> sample=low.wav pitch_keycenter=60 hicc1=63\n");
    expect(regionsAtCc(regions, new Map([[1, 64]])).map((entry) => entry.sample)).toEqual(["always.wav", "high.wav"]);
    expect(regionsAtCc(regions, new Map([[1, 0]])).map((entry) => entry.sample)).toEqual(["always.wav", "low.wav"]);
  });

  it("keeps a real library's gated regions at the defaults that library declares", () => {
    /**
     * The case that makes `<control>` load-bearing. `virtuosity_drums` gates every microphone on a controller it sets to 127 — `locc101=1`, `locc102=43` — and with no CC sent those regions must still sound, because the file's own
     * `<control>` says those controllers start at 127. Read the defaults, or silence the entire kit.
     */
    const ROOT = "src/test/fixtures/sfz/virtuosity-drums";
    const read = (relative: string) => {
      const full = path.join(ROOT, relative);
      return existsSync(full) ? readFileSync(full, "utf8") : undefined;
    };
    const program = readFileSync(path.join(ROOT, "01-basic-kit.sfz"), "utf8");
    const expanded = expandIncludes(program, read);
    const defaults = readControlDefaults(program);
    expect(defaults.get(101)).toBe(127);
    const regions = parseSfz(expanded.text);
    expect(regions.length).toBeGreaterThan(0);
    // Every region carries `locc101=1` from the program's first `<global>`, and it passes at rest.
    expect(regions.every((entry) => entry.opcodes.locc101 === "1")).toBe(true);
    expect(regionsAtCc(regions, defaults)).toHaveLength(regions.length);
    // And the gate is doing something: with the controllers at zero, the same regions are gone.
    expect(regionsAtCc(regions, new Map())).toHaveLength(0);
  });

});

describe("controller-driven tuning", () => {
  it("is linear from zero, with no centre, which sfizz settled", () => {
    /**
     * Measured by rendering one tone through sfizz at four controller values: `tune_cc90=1200` gives 0 cents at CC90 = 0, +1200 at 127, and +600 at 63.5. So the mapping is `span × cc / 127` — a tuning knob that goes up from rest rather than one that
     * sits centred at the middle of the range.
     */
    const region = parseSfz("<region> sample=tone.wav pitch_keycenter=60 tune_cc90=1200")[0]!;
    expect(region.tuneCents).toBe(0);
    expect(ccTuneCents(region.opcodes, new Map([[90, 127]]))).toBe(1200);
    expect(ccTuneCents(region.opcodes, new Map([[90, 63.5]]))).toBeCloseTo(600, 6);
    expect(ccTuneCents(region.opcodes, new Map([[90, 0]]))).toBe(0);
  });

  it("reads the file's own `<control>` defaults, so a region's cents are the cents it plays", () => {
    // This is the case the drum kit is: `tune_cc90=1200` in a `<global>` and `set_cc90=63.5` in its `<control>`, which at rest is +600 cents rather than nothing.
    const regions = parseSfz("<control>\nset_cc90=63.5\n<global>\ntune_cc90=1200\n<region> sample=tone.wav pitch_keycenter=60");
    expect(regions[0]!.tuneCents).toBeCloseTo(600, 6);
  });

  it("adds to a plain `tune` rather than replacing it", () => {
    // `tune` is a fixed detune and `tune_ccN` is a movable one; a file that uses both means both.
    const regions = parseSfz("<control>\nset_cc1=127\n<region> sample=tone.wav pitch_keycenter=60 tune=100 tune_cc1=200");
    expect(regions[0]!.tuneCents).toBe(300);
  });

  it("reads `tune_curveccN=1` as bipolar about 64, which is what the shipped kit needs", () => {
    /**
     * The shape that made the previous implementation an octave wrong. Measured through sfizz: with curve 1, CC 0 is −1200 cents, 64 is 0 and 127 is +1200 — so the neutral position is the middle, which is why `virtuosity_drums` declares 63.5 for both of its tuning
     * knobs and calls them "Master tune" and "Kick tune".
     */
    const regions = parseSfz("<control>\nset_cc90=64\n<region> sample=tone.wav pitch_keycenter=60 tune_cc90=1200 tune_curvecc90=1");
    // Nine cents at 64, not zero: `2 × 64 / 127 − 1` is 0.0079, and the endpoint at 127 is what the formula is pinned to.
    expect(regions[0]!.tuneCents).toBeCloseTo(9.45, 1);
    const low = parseSfz("<control>\nset_cc90=0\n<region> sample=tone.wav pitch_keycenter=60 tune_cc90=1200 tune_curvecc90=1")[0]!;
    expect(low.tuneCents).toBe(-1200);
    const high = parseSfz("<control>\nset_cc90=127\n<region> sample=tone.wav pitch_keycenter=60 tune_cc90=1200 tune_curvecc90=1")[0]!;
    expect(high.tuneCents).toBeCloseTo(1200, 6);
  });

  it("treats a curve it does not model as linear, and says so in the code rather than in silence", () => {
    // Indices beyond 1 are real shapes (index 2 reads +909 cents at CC 32 through sfizz), and none of the mirrored libraries uses them.
    const regions = parseSfz("<control>\nset_cc90=127\n<region> sample=tone.wav pitch_keycenter=60 tune_cc90=1200 tune_curvecc90=2");
    expect(regions[0]!.tuneCents).toBe(1200);
  });

  it("leaves an instrument with no controller tuning at exactly zero", () => {
    // The common case must not acquire a detune by accident.
    expect(parseSfz("<region> sample=tone.wav pitch_keycenter=60")[0]!.tuneCents).toBe(0);
  });
});
