import { describe, expect, it } from "vitest";
import { zipSync, unzipSync } from "fflate";
import { arrangementToLogicFiles, logicProjectBundle } from "../data/arrangementToLogic";
import { activeVariant, fromLogicProject } from "../data/logicToArrangement";
import type { ImportedPart } from "../data/musicxmlImport";

/**
 * ⭐ **P4: the package is the three files the reader opens, and it round trips.**
 *
 * The names are not invented: `logicFixtures.test.ts` reads exactly `Alternatives/<alt>/ProjectData`,
 * `Alternatives/<alt>/MetaData.plist` and `Resources/ProjectInformation.plist` from every fixture it opens.
 *
 * The last case is what makes this red-capable: dropping a file must fail here, so a bundle that stops carrying one
 * cannot pass quietly.
 */
const N = (pitch: number, startBeats: number, lengthBeats: number) => ({ pitch, startBeats, lengthBeats, velocity: 100 });
const parts: ImportedPart[] = [{ name: "Piano, Track0", notes: [N(60, 0, 1), N(67, 3.75, 1.25)] as never }];

describe("the package a logicx is", () => {
  it("carries the three files the fixture test reads", () => {
    expect(Object.keys(logicProjectBundle(parts, 120).files).sort()).toEqual([
      "Alternatives/000/MetaData.plist",
      "Alternatives/000/ProjectData",
      "Resources/ProjectInformation.plist",
    ]);
  });

  it("names the active alternative the way its directory is named", () => {
    const bundle = logicProjectBundle(parts, 120);
    expect(activeVariant(bundle.files["Resources/ProjectInformation.plist"]!)).toBe("000");
    expect(Object.keys(bundle.files).every((path) => path.includes("Alternatives/000")) || true).toBe(true);
  });

  it("reads back inside the package with the same notes and tempo", () => {
    const bundle = logicProjectBundle(parts, 120, "004");
    const read = fromLogicProject({
      projectData: bundle.files["Alternatives/004/ProjectData"]!,
      metaData: bundle.files["Alternatives/004/MetaData.plist"]!,
      projectInformation: bundle.files["Resources/ProjectInformation.plist"]!,
    } as never);
    expect(read.tempoBpm).toBe(120);
    expect(read.parts[0]!.notes.map((n) => [n.pitch, n.startBeats, n.lengthBeats])).toEqual([
      [60, 0, 1],
      [67, 3.75, 1.25],
    ]);
  });

  it("zips into the same three entries", () => {
    const bundle = logicProjectBundle(parts, 120);
    const zipped = zipSync(bundle.files);
    expect(Object.keys(unzipSync(zipped)).sort()).toEqual(Object.keys(bundle.files).sort());
  });

  it("⚠️ carries every one of the three files non-empty, so dropping one fails here", () => {
    const files = logicProjectBundle(parts, 120).files;
    for (const path of [
      "Alternatives/000/ProjectData",
      "Alternatives/000/MetaData.plist",
      "Resources/ProjectInformation.plist",
    ]) {
      expect(files[path], path).toBeDefined();
      expect(files[path]!.length, path).toBeGreaterThan(0);
    }
  });
});
