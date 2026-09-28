import { describe, expect, it } from "vitest";
import { parseSfz } from "../audio/sfz/parse";
import { resolveSamplePath, samplePathsFor } from "../audio/sfz/mirrorPlan";

/**
 * The mirror plan, derived from the SFZ rather than written by hand.
 *
 * A hand-written file list would be a second, drifting copy of what the SFZ already says — and the failure mode is quiet: a new instrument ships, one sample is missing from
 * the list, and the note is silent with nothing to point at. Deriving the list means an instrument cannot silently omit a sample.
 */
describe("resolveSamplePath", () => {
  it("resolves a relative sample against the directory of the file that named it", () => {
    /**
     * `..` climbs out of **one** directory, which is what the real library relies on and what my first expectations got wrong.
     *
     * `Programs/mappings/kickmic_basic.sfz` plus `../Samples/kick/a.wav` lands at `Programs/Samples/kick/a.wav` — one level up, not two. The real kit's entry program is
     * `Programs/01-basic-kit.sfz`, and its `../Samples/…` resolves to `Samples/…`, which is exactly where the sample files were fetched from. The implementation was right
     * and the test was wrong, which is the useful direction for that to happen in.
     */
    expect(resolveSamplePath("Programs/mappings/kickmic_basic.sfz", "../Samples/kick/a.wav")).toBe("Programs/Samples/kick/a.wav");
    expect(resolveSamplePath("Programs/mappings/kickmic_basic.sfz", "Samples/b.wav")).toBe("Programs/mappings/Samples/b.wav");
    // And from the entry program, one level up is the mirror root — the case the real library exercises.
    expect(resolveSamplePath("Programs/01-basic-kit.sfz", "../Samples/kick.wav")).toBe("Samples/kick.wav");
    // An absolute path is left alone, which is the one case where the SFZ author meant exactly what they wrote.
    expect(resolveSamplePath("Programs/x.sfz", "/opt/samples/c.wav")).toBe("/opt/samples/c.wav");
  });
});

describe("samplePathsFor", () => {
  it("lists each file once with how many regions use it, and skips what cannot be trusted", () => {
    const regions = parseSfz(`
<region> sample=../Samples/kick.wav
<region> sample=../Samples/kick.wav
<region> sample=../Samples/snare.wav
<region> sample=../Samples/var.wav key=$UNDEFINED
<region> sample=
`);
    const plan = samplePathsFor(regions, "Programs/mappings/kit.sfz");
    expect(plan).toEqual([
      { path: "Programs/Samples/kick.wav", regions: 2 },
      { path: "Programs/Samples/snare.wav", regions: 1 },
    ]);
    // The unresolved region is excluded for the same reason it is never selectable: its file cannot be trusted to be the one it names.
    expect(plan.some((file) => file.path.includes("var"))).toBe(false);
    // And a region with no sample contributes nothing rather than an empty path.
    expect(plan.every((file) => file.path !== "")).toBe(true);
  });

  it("is empty for regions that name nothing, rather than inventing a file", () => {
    expect(samplePathsFor([], "Programs/a.sfz")).toEqual([]);
    expect(samplePathsFor(parseSfz("<region> pitch_keycenter=60"), "Programs/a.sfz")).toEqual([]);
  });
});
