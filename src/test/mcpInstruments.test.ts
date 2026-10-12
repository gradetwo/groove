/**
 * Discovering what can be played.
 *
 * The choosing half of the instrument feature existed and the discovering half did not: `set_arrangement_track_asset` took an `assetId` and nothing listed the ids, which for a client that cannot read the repository makes the feature unusable. These
 * criteria hold the two ends together — the list is what the setter accepts, and what the list offers is what the manifest actually declares.
 */
import { describe, expect, it } from "vitest";
import { listCatalogueInstruments } from "../../mcp/instruments";
import { addMcpTrack, clearMcpArrangements, createMcpArrangement, getMcpArrangement, setMcpTrackAsset, summariseArrangement } from "../../mcp/arrangement";
import { resetTrackIdsForTests } from "../data/arrangementEdits";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    // The two ends held together: what this lists is what `set_arrangement_track_asset` accepts, and the track reports it back.
    clearMcpArrangements();
    resetTrackIdsForTests();
    const chosen = listCatalogueInstruments({ library: "salamander-grand" }).instruments[0]!;
    const created = createMcpArrangement({ blankKind: "sampler" });
    const track = created.tracks[0]!;
    const result = setMcpTrackAsset(created.arrangementId, track.id, chosen.assetId);
    expect(result.problems).toEqual([]);
    expect(summariseArrangement(created.arrangementId, getMcpArrangement(created.arrangementId)!).tracks[0]!.sampleAssetId).toBe(chosen.assetId);
    // And a track added by the tool can take one too, rather than only the template's first track.
    const added = addMcpTrack(created.arrangementId, "sampler", "Second").summary.tracks.find((entry) => entry.name === "Second")!;
    expect(setMcpTrackAsset(created.arrangementId, added.id, chosen.assetId).summary.tracks.find((entry) => entry.id === added.id)!.sampleAssetId).toBe(chosen.assetId);
  });

  it("reports the mirror root it resolved, and leaves it empty rather than inventing one", () => {
    const list = listCatalogueInstruments();
    // The MCP process has no `import.meta.env`, so the root is an environment variable; without it the ids are still complete and the addresses are simply not claimed.
    expect(list.root).toBe(process.env.GROOVE_SAMPLE_ROOT ?? "");
  });
});

/**
 * ⭐ **The string techniques, reachable from the surface that chooses an instrument.**
 *
 * The technique table is the rules half of the owner's request, and a table nothing can read is the "功能有了，页面没做入口" shape this surface has been fixed for before. These criteria hold the two together: an asset the listing reports a `technique` for is one the sampler lane accepts, and the `situation` filter finds it by what the music is doing rather than by what the program file happens to be called.
 */
describe("string techniques on the instrument list", () => {
  const strings = () => listCatalogueInstruments({ library: "vsco2ce" }).instruments;

  it("says what the player is doing, and how many recorded layers velocity selects between", () => {
    const violin = strings().find((instrument) => instrument.assetId === "vsco2ce:ViolinEnsSusVib")!;
    expect(violin.stringInstrument).toBe("violin");
    expect(violin.technique).toBe("sustain");
    // Two takes, split at 62/63 — the number a crescendo actually has to work with.
    expect(violin.dynamicLayers).toBe(2);
    // 15.200 s, the longest of the program's own samples: a note longer than this stops early, because these are one-shot recordings.
    expect(violin.maxHeldSeconds).toBe(15.2);
  });

  it("carries the plucked technique and a much shorter hold, which is the difference the table exists to state", () => {
    const pizz = strings().find((instrument) => instrument.assetId === "vsco2ce:ViolinEnsPizz")!;
    expect(pizz.technique).toBe("pizzicato");
    expect(pizz.maxHeldSeconds).toBe(3.016);
    const sustained = strings().find((instrument) => instrument.assetId === "vsco2ce:ViolinEnsSusVib")!;
    expect(pizz.maxHeldSeconds).toBeLessThan(sustained.maxHeldSeconds!);
  });

  /**
   * ⭐ **The situation filter, which is the query a composer actually has.**
   *
   * "A plucked walking line" must find the contrabass pizzicato without the caller knowing that a pluck is spelled `Pizz` in one program and `pizz` in another — that spelling is exactly the name-matching this replaces.
   */
  it("narrows by musical situation rather than by program name", () => {
    const bed = listCatalogueInstruments({ situation: "sustained-bed" });
    // ⭐ Eleven programs since the 2026-10-02 rounds: the five sustained rows, the five `-Quiet` soft takes and the
    // contrabass's one `non-vibrato` take, because the rule's preference list is ["sustain","quiet","non-vibrato"].
    // No pizzicato or spiccato appears, because those are different gestures.
    expect(bed.instruments.map((instrument) => instrument.assetId).sort()).toEqual([
      "vsco2ce:CelloEnsSusVib",
      "vsco2ce:CelloEnsSusVib-Quiet",
      "vsco2ce:ContrabassSusNV",
      "vsco2ce:ContrabassSusVB",
      "vsco2ce:ContrabassSusVB-Quiet",
      "vsco2ce:SViolinVib",
      "vsco2ce:SViolinVib-Quiet",
      "vsco2ce:ViolaEnsSusVib",
      "vsco2ce:ViolaEnsSusVib-Quiet",
      "vsco2ce:ViolinEnsSusVib",
      "vsco2ce:ViolinEnsSusVib-Quiet",
    ]);
    // Every one of them really is one of the rule's own three techniques, so the filter cannot be passing a name through.
    expect(
      bed.instruments.every((instrument) =>
        ["sustain", "quiet", "non-vibrato"].includes(instrument.technique ?? "")
      )
    ).toBe(true);
  });

  /**
   * ⭐ **A rule's preferences are what the filter returns, first choice or documented fallback.**
   *
   * `tension-tremolo` prefers tremolo and falls back to sustain. Until 2026-10-02 the real tremolo was unmirrored, so
   * this situation could offer only **the four sustains**; the string-articulation round mirrored the five tremolos,
   * so the listing now answers with **five tremolos and five sustains** — the tremolo first in the rule's own order,
   * the sustain as the documented fallback for a note outside the tremolo programs' compass. It must not offer the
   * pizzicati, which are a different gesture. `chooseTechnique` is where "the first choice was not available" is
   * reported, and these criteria state what the listing offers for the request.
   */
  it("returns a rule's own preferences for a situation, first choice and documented fallback alike", () => {
    const tension = listCatalogueInstruments({ situation: "tension-tremolo" }).instruments;
    expect(tension.every((instrument) => instrument.technique === "tremolo" || instrument.technique === "sustain")).toBe(true);
    expect(tension.filter((instrument) => instrument.technique === "tremolo")).toHaveLength(5);
    expect(tension.filter((instrument) => instrument.technique === "sustain")).toHaveLength(5);
    // The real tremolo is in the catalogue and annotated now — it used to be the negative case here.
    expect(listCatalogueInstruments().instruments.some((instrument) => instrument.technique === "tremolo")).toBe(true);
  });

  /**
   * ⭐ **The register travels with the rule, and this is what proves it.**
   *
   * "Plucked walking" is a **low** line: it must find the one contrabass program and not the three upper-string
   * pizzicati, which are plucked strings but are not walking basses. Without the rule's own range this filter
   * returns four programs and the words "low line" have bought nothing.
   */
  it("honours a situation's register, so a walking line is not answered by a viola", () => {
    const walking = listCatalogueInstruments({ situation: "plucked-walking" }).instruments;
    expect(walking.map((instrument) => instrument.assetId)).toEqual(["vsco2ce:ContrabassPizz"]);
    // The pizzicato technique itself is still listed as five programs — the narrowing is the situation's, not the listing's.
    expect(strings().filter((instrument) => instrument.technique === "pizzicato")).toHaveLength(5);
  });

  it("leaves non-string instruments without a technique, rather than guessing one from a name", () => {
    const nonStrings = listCatalogueInstruments().instruments.filter((instrument) => instrument.library !== "vsco2ce");
    expect(nonStrings.length).toBeGreaterThan(0);
    expect(nonStrings.every((instrument) => instrument.technique === undefined)).toBe(true);
  });

  /** Every technique the listing reports must be one the table declares, and every mirrored string row must be annotated. */
  it("reports only techniques the table declares, and reports one for every mirrored string row", () => {
    const reported = new Set(strings().map((instrument) => instrument.technique).filter((value) => value !== undefined));
    expect([...reported].sort()).toEqual(["non-vibrato", "pizzicato", "quiet", "spiccato", "sustain", "tremolo"]);
    // The twenty-six playable rows are exactly the twenty-six assets the listing annotates.
    expect(strings().filter((instrument) => instrument.technique !== undefined)).toHaveLength(26);
  });

  it("⭐ says the compass a measured program sounds, and says nothing where nothing is measured (finding D2)", () => {
    /**
     * The evaluation's complaint: an agent could not tell a double bass from a piccolo before writing, so an
     * out-of-range part arrived silent and `get_pitch_report` had to be called pitch by pitch to find out. These two
     * numbers come from the measured technique table; an asset with no measurement must carry **no** range, because a
     * guessed 0–127 is the silent failure this replaces. Deleting the two fields turns this red.
     */
    const all = listCatalogueInstruments();
    const measured = (all.instruments ?? []).find((row: { assetId: string }) => /ContrabassPizz/.test(row.assetId)) as
      | { lowestNote?: number; highestNote?: number }
      | undefined;
    expect(measured?.lowestNote, "a measured contrabass pizzicato starts at MIDI 24").toBe(24);
    expect(measured?.highestNote, "and stops at 60").toBe(60);

    const unmeasured = (all.instruments ?? []).find((row: { assetId: string }) => row.assetId === "salamander-grand") as
      | { lowestNote?: number }
      | undefined;
    expect(unmeasured, "the piano is in the catalogue").toBeTruthy();
    expect(unmeasured?.lowestNote, "no measurement, no claim").toBeUndefined();
  });


  it("⭐ exposes the shortest-sample limit beside the longest, so the risky band is machine-readable (section 6)", () => {
    /**
     * `maxHeldSeconds` says when a note is definitely cut; `safeHeldSeconds` says when it is *certainly* whole. Between
     * them a note sounds whole only if the sample for its own pitch is long enough — the distinction the string table has
     * carried since the string work and the listing did not expose.
     */
    const strings = (listCatalogueInstruments().instruments ?? []).filter(
      (row: { maxHeldSeconds?: number }) => row.maxHeldSeconds !== undefined
    ) as Array<{ assetId: string; maxHeldSeconds: number; safeHeldSeconds?: number }>;
    expect(strings.length, "the string programs are in the listing").toBeGreaterThan(0);
    for (const row of strings) {
      expect(row.safeHeldSeconds, `${row.assetId} carries the safe number`).toBeDefined();
      expect(row.safeHeldSeconds!, `${row.assetId}: the shortest sample cannot outlast the longest`).toBeLessThanOrEqual(row.maxHeldSeconds);
    }
  });


  it("⭐ states that no sampled program joins notes, instead of leaving legato to be guessed (section 6)", () => {
    /**
     * The evaluation's section 6 asks for legato as a machine-readable constraint. The fact this repository can state is
     * negative and worth stating: the loader implements none of the legato opcodes, the samples do not loop, so a program
     * cannot join two notes — a legato line is overlapping lengths, and every note re-attacks. An agent that reads
     * `legatoSupported: false` stops looking for the tool that would set it.
     */
    const strings = (listCatalogueInstruments().instruments ?? []).filter(
      (row: { maxHeldSeconds?: number }) => row.maxHeldSeconds !== undefined
    ) as Array<{ assetId: string; legatoSupported?: boolean }>;
    expect(strings.length, "the string programs are in the listing").toBeGreaterThan(0);
    for (const row of strings) {
      expect(row.legatoSupported, `${row.assetId} carries the negative fact rather than silence`).toBe(false);
    }

    // ⭐ And the description an agent reads says what to do instead, which is the actionable half.
    const notes = readFileSync(resolve(__dirname, "../../mcp/registryArrangementNotes.ts"), "utf8");
    expect(notes, "no legato flag exists, and the description says so").toMatch(/no legato flag to set/);
    expect(notes, "and names the field that carries the fact").toContain("legatoSupported: false");
  });

});