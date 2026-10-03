import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { logicFileFor } from "../features/arrangement/arrangementFiles";
import { fromLogicProject } from "../data/logicToArrangement";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **The Logic export the browser can actually hand over.**
 *
 * A `.logicx` is a directory, so what leaves the browser is a zip whose name says both extensions
 * (docs/OPEN_WORK.md 266) — asserting that name is deliberate: a file called `… .logicx` would tell the user they had
 * been given the directory.
 *
 * The function reads only `tracks`, `notesByTrack` and `bpm`, so the fixture carries exactly those: a smaller
 * arrangement is a truer test than a large one built to satisfy unrelated fields.
 */
const arrangement = {
  bpm: 137,
  notesByTrack: {
    a: [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }],
    b: [{ pitch: 67, startBeats: 3.75, lengthBeats: 1.25, velocity: 90 }],
  },
  tracks: [
    { id: "a", name: "Piano, Track0", kind: "sampler" },
    { id: "b", name: "Bass", kind: "synth" },
    { id: "f", name: "Folder", kind: "folder" },
  ],
} as unknown as ArrangementV2;

describe("a logicx for the browser to download", () => {
  it("names itself with both extensions, because what it is is a zip", () => {
    expect(logicFileFor(arrangement, "Song").filename).toBe("song.logicx.zip");
  });

  it("counts the tracks and notes it was given, and produces bytes", () => {
    const file = logicFileFor(arrangement, "Song");
    expect(file.tracks).toBe(2);
    expect(file.notes).toBe(2);
    expect(file.problems).toEqual([]);
    expect(file.blob.size).toBeGreaterThan(0);
  });

  it("⭐ unzips into a package our own reader opens with the same notes and tempo", async () => {
    const file = logicFileFor(arrangement, "Song");
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual([
      "Alternatives/000/MetaData.plist",
      "Alternatives/000/ProjectData",
      "Resources/ProjectInformation.plist",
    ]);
    const read = fromLogicProject({
      projectData: files["Alternatives/000/ProjectData"]!,
      metaData: files["Alternatives/000/MetaData.plist"]!,
      projectInformation: files["Resources/ProjectInformation.plist"]!,
    } as never);
    expect(read.tempoBpm).toBe(137);
    expect(read.parts.map((part) => part.name)).toEqual(["Piano, Track0", "Bass"]);
    expect(read.parts.flatMap((part) => part.notes).map((note) => [note.pitch, note.startBeats, note.lengthBeats])).toEqual([
      [60, 0, 1],
      [67, 3.75, 1.25],
    ]);
  });
});
