/**
 * Discovering what can be played.
 *
 * The choosing half of the instrument feature existed and the discovering half did not: `set_arrangement_track_instrument` took an `assetId` and nothing listed the ids, which for a client that cannot read the repository makes the feature unusable. These
 * criteria hold the two ends together — the list is what the setter accepts, and what the list offers is what the manifest actually declares.
 */
import { describe, expect, it } from "vitest";
import { listCatalogueInstruments } from "../../mcp/instruments";
import { addMcpTrack, clearMcpArrangements, createMcpArrangement, getMcpArrangement, setMcpTrackInstrument, summariseArrangement } from "../../mcp/arrangement";
import { resetTrackIdsForTests } from "../data/arrangementEdits";
import { readFileSync } from "node:fs";

const manifest = () => JSON.parse(readFileSync("public/samples/manifest.json", "utf8")) as { entries: { id: string; files: unknown[] }[] };

describe("listing the instruments a sampler track can play", () => {
  it("offers every declared library, including one that contributes no instrument yet", () => {
    const list = listCatalogueInstruments();
    // The declared ids, so a library that is planned but unmeasured is visible as a gap rather than absent.
    expect(list.libraries).toEqual(manifest().entries.map((entry) => entry.id));
    expect(list.libraries).toContain("virtuosity-drums-basic");
  });

  it("lists only what is an instrument rather than a bare sample", () => {
    const list = listCatalogueInstruments();
    expect(list.instruments.length).toBeGreaterThan(0);
    expect(list.instruments.every((instrument) => instrument.program !== undefined)).toBe(true);
    // Every instrument names the library it came from, which is what makes `library` filtering meaningful.
    expect(list.instruments.every((instrument) => typeof instrument.library === "string" && instrument.library.length > 0)).toBe(true);
  });

  it("carries the measured duration, which is what the catalogue requires to offer an asset at all", () => {
    const list = listCatalogueInstruments();
    expect(list.instruments.every((instrument) => instrument.seconds > 0)).toBe(true);
  });

  it("narrows to one library, and says so when a library has nothing", () => {
    // `vcsl` declares 88 instruments; asking for one library must not return the other libraries' instruments.
    const vcsl = listCatalogueInstruments({ library: "vcsl" });
    expect(vcsl.instruments.length).toBeGreaterThan(1);
    expect(vcsl.instruments.every((instrument) => instrument.library === "vcsl")).toBe(true);
    // A multi-instrument library's ids are `library:program`, and the program is readable rather than only the id.
    expect(vcsl.instruments.every((instrument) => instrument.assetId.startsWith("vcsl:"))).toBe(true);
    const none = listCatalogueInstruments({ library: "karoryfer-meatbass", limit: 1 });
    expect(none.instruments).toHaveLength(1);
  });

  it("takes an id from the list and puts it on a sampler track, which is the whole point", () => {
    // The two ends held together: what this lists is what `set_arrangement_track_instrument` accepts, and the track reports it back.
    clearMcpArrangements();
    resetTrackIdsForTests();
    const chosen = listCatalogueInstruments({ library: "salamander-grand" }).instruments[0]!;
    const created = createMcpArrangement({ blankKind: "sampler" });
    const track = created.tracks[0]!;
    const result = setMcpTrackInstrument(created.arrangementId, track.id, chosen.assetId);
    expect(result.problems).toEqual([]);
    expect(summariseArrangement(created.arrangementId, getMcpArrangement(created.arrangementId)!).tracks[0]!.sampleAssetId).toBe(chosen.assetId);
    // And a track added by the tool can take one too, rather than only the template's first track.
    const added = addMcpTrack(created.arrangementId, "sampler", "Second").summary.tracks.find((entry) => entry.name === "Second")!;
    expect(setMcpTrackInstrument(created.arrangementId, added.id, chosen.assetId).summary.tracks.find((entry) => entry.id === added.id)!.sampleAssetId).toBe(chosen.assetId);
  });

  it("reports the mirror root it resolved, and leaves it empty rather than inventing one", () => {
    const list = listCatalogueInstruments();
    // The MCP process has no `import.meta.env`, so the root is an environment variable; without it the ids are still complete and the addresses are simply not claimed.
    expect(list.root).toBe(process.env.GROOVE_SAMPLE_ROOT ?? "");
  });
});
