import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { logicFileFor } from "../features/arrangement/arrangementFiles";
import { arrangementNoteCount } from "../data/arrangementToLogic";
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

/**
 * ⭐ **What the export's guard has to ask, and the scope the producer actually writes** (docs/OPEN_WORK.md 294).
 *
 * The guard used to ask about the track the score view shows, while `logicFileFor` writes every track: an empty
 * selected track therefore refused an export that had content elsewhere. The guard now asks this count, so the
 * count is held to "every track" rather than "one track", and the producer is held to still writing a package when
 * the shown track is empty but another is not.
 *
 * ⚠️ The wiring of that count into the callback is one call and is covered by the type checker, not by a mount here:
 * a mount-based criterion ("the hook proceeds when the shown track is empty") would be stronger and is owed.
 */
describe("the guard asks about the whole arrangement, not the track on screen", () => {
  it("counts every track rather than one", () => {
    expect(arrangementNoteCount(arrangement)).toBe(2);
    const shownEmpty = { notesByTrack: { a: [], b: [1, 2] } } as unknown as ArrangementV2;
    expect(arrangementNoteCount(shownEmpty)).toBe(2);
  });

  it("counts nothing for an arrangement with no notes at all", () => {
    expect(arrangementNoteCount({} as unknown as ArrangementV2)).toBe(0);
  });

  it("⭐ still writes the package when the track on screen holds nothing", () => {
    const shownEmpty = {
      bpm: 137,
      notesByTrack: { a: [], b: [{ pitch: 67, startBeats: 0, lengthBeats: 1, velocity: 90 }] },
      tracks: [
        { id: "a", name: "Empty, Track0", kind: "sampler" },
        { id: "b", name: "Bass", kind: "synth" },
      ],
    } as unknown as ArrangementV2;
    const file = logicFileFor(shownEmpty, "Song");
    expect(file.tracks).toBe(2);
    expect(file.notes).toBe(1);
    expect(file.blob.size).toBeGreaterThan(0);
  });
});
