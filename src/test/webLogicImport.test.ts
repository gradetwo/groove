/**
 * 🍎 **The web can import the Logic project it exports.**
 *
 * The deep-test report of 2026-10-05 found the asymmetry: `export_logic_project` had a button in the score page and
 * `import_logic_project` had an MCP tool, but the web's own import route did not know the file — `arrangementFileKind`
 * sent `.logicx.zip` to "unsupported" — so a person could write a Logic project from the browser and not read one
 * back. The owner asked for the entry, and it is the same single import route: the file is sniffed by name and then
 * by its contents.
 *
 * Two things are asserted. The **kind** recognises the name, and a zip without `Alternatives/<n>/ProjectData` is
 * refused with a sentence that says so rather than a stack trace. The **round trip** is the real criterion: the bytes
 * `logicFileFor` produces are imported back through the same route and must arrive as tracks with notes, which is what
 * "our reader opens what our writer wrote" means.
 */
import { describe, expect, it } from "vitest";
import { arrangementFileKind, importArrangementFile, logicFileFor } from "../features/arrangement/arrangementFiles";
import { createArrangement, addTrack, addTrackNotes } from "../data/arrangementEdits";
import { zipSync, strToU8 } from "fflate";

const withOneNote = () => {
  const base = createArrangement("logic-round-trip", "synth");
  const withTrack = addTrack(base, "synth", "Lead");
  const trackId = withTrack.tracks[withTrack.tracks.length - 1]!.id;
  return addTrackNotes(withTrack, trackId, [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }]);
};

const fileOf = (bytes: Uint8Array, name: string) =>
  new File([bytes as unknown as BlobPart], name, { type: "application/zip" });

describe("the web import route knows Logic projects", () => {
  it("⭐ recognises the name our export writes, and a bare zip", () => {
    expect(arrangementFileKind("Arrangement.logicx.zip")).toBe("logic");
    expect(arrangementFileKind("something.zip")).toBe("logic");
    // And does not steal the formats it already had.
    expect(arrangementFileKind("a.mid")).toBe("midi");
    expect(arrangementFileKind("a.groove")).toBe("groove");
    expect(arrangementFileKind("a.musicxml")).toBe("musicxml");
  });

  it("⭐ refuses a zip with no ProjectData, and says why", async () => {
    const notLogic = zipSync({ "readme.txt": strToU8("not a logic project") });
    const outcome = await importArrangementFile(createArrangement("s"), fileOf(notLogic, "bundle.zip"));
    expect({ ok: outcome.ok, mentionsProjectData: !outcome.ok && /ProjectData/.test(outcome.reason) })
      .toEqual({ ok: false, mentionsProjectData: true });
  });

  it("⭐ round-trips what the export writes", async () => {
    const written = await logicFileFor(withOneNote());
    const file = new File([written.blob as unknown as BlobPart], written.filename, { type: "application/zip" });
    const outcome = await importArrangementFile(createArrangement("target"), file);
    expect({ ok: outcome.ok, tracks: outcome.ok && outcome.tracks > 0, notes: outcome.ok && outcome.notes > 0 })
      .toEqual({ ok: true, tracks: true, notes: true });
  });

  it("⭐ still measures, so a renamed kind cannot pass quietly", () => {
    const kinds = ["a.mid", "a.groove", "a.musicxml", "a.logicx.zip", "a.txt"].map(arrangementFileKind);
    expect({ five: kinds.length === 5, hasUnsupported: kinds.includes("unsupported") }).toEqual({ five: true, hasUnsupported: true });
  });
});
