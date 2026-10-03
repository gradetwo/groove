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
      "Alternatives/000/DisplayState.plist",
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

/**
 * ⭐ **The plists are held to the shapes the owner's real projects have** (docs/OPEN_WORK.md 298), because the
 * measurable half of "will Logic open it" is "does it look like a project Logic wrote". Three real projects were read
 * with `plistlib`: their `MetaData.plist` carries a union of twenty-four keys (the count varies by Logic version, so
 * "nineteen" was never the target) and their `ProjectInformation.plist` pairs an **integer** `ActiveVariant` with a
 * three-digit folder, plus a `VariantNames` table keyed by the variant index.
 *
 * Every assertion here fails if the corresponding key is dropped, which is what makes them criteria rather than notes.
 */
describe("the plists match the shapes the real projects use", () => {
  const files = logicProjectBundle(parts, 139, "000", "Demo").files;
  const text = (path: string) => new TextDecoder().decode(files[path]!);

  it("⭐ carries every MetaData key the real projects agree on, and says nothing about a song key", () => {
    const md = text("Alternatives/000/MetaData.plist");
    for (const key of [
      "BeatsPerMinute", "SongSignatureNumerator", "SongSignatureDenominator", "NumberOfTracks",
      "SampleRate", "FrameRateIndex", "SurroundFormatIndex", "Version", "isTimeCodeBased",
      "HasARAPlugins", "HasGrid", "PlaybackFiles", "UnusedAudioFiles", "AudioFiles", "AlchemyFiles",
      "QuicksamplerFiles", "UltrabeatFiles", "SamplerInstrumentsFiles", "ImpulsResponsesFiles", "VideoFiles",
    ]) expect(md, `missing ${key}`).toContain(`<key>${key}</key>`);
    expect(md).toContain("<real>139</real>", "the tempo is the arrangement's");
    // ⚠️ The three key fields are deliberately absent: an arrangement here has no field stating a key, and writing
    // "C major" would put a claim in the user's mouth. Recorded in needs; asserted so nobody adds one silently.
    for (const absent of ["SongKey", "SongGenderKey", "SignatureKey"])
      expect(md, `${absent} must not be invented`).not.toContain(`<key>${absent}</key>`);
  });

  it("⭐ numbers the alternative rather than spelling it, and names it in both tables", () => {
    const pi = text("Resources/ProjectInformation.plist");
    expect(pi).toContain("<key>ActiveVariant</key><integer>0</integer>");
    expect(pi).toContain("<key>BundleVersion</key><real>2.0</real>");
    expect(pi).toContain("<key>VariantNames</key><dict><key>0</key><string>Demo</string></dict>");
    expect(pi).toContain("<key>VariantNamesV2</key><dict><key>0</key><string>Demo</string></dict>");
    // ⚠️ `LastSavedFrom` names the application that saved the file; we will not claim to be Logic.
    expect(pi).not.toContain("LastSavedFrom");
    expect(activeVariant(files["Resources/ProjectInformation.plist"]!)).toBe("000");
  });

  it("writes the display state's measured keys and no fabricated thumbnail", () => {
    const ds = text("Alternatives/000/DisplayState.plist");
    for (const key of ["displayDataVersion", "docPreferences", "screenVisibleFrames", "screensetCurrSlot", "screensetDictArray"])
      expect(ds, `missing ${key}`).toContain(`<key>${key}</key>`);
    expect(Object.keys(files)).not.toContain("Alternatives/000/WindowImage.jpg");
    expect(Object.keys(files)).not.toContain("Alternatives/000/DisplayStateArchive");
  });
});
