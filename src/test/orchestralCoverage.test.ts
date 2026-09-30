/**
 * **The orchestral instruments, requested by name, held to behaviour.**
 *
 * An MCP client asked for violin, viola, cello, contrabass, horn, trumpet, trombone, tuba, flute, oboe, clarinet, bassoon, harp and timpani. A list that merely *counts* instruments cannot
 * answer that: the count was already 135, and the answer was still "no". So the roster below is written in the requested words, and every entry that claims coverage has to be
 * **played** — the exposed id is fetched from its pinned source, its includes expanded, the file parsed, and a note resolved to a sample the manifest really lists.
 *
 * The entries that claim **no** coverage are checked too, and in the strong form: not merely "no exposed instrument is called that", but "the mirrored library holds no file whose
 * path contains the word". That is the measured fact this roster exists to keep honest — two fifths of the request is not under-registered, it is **absent**, and the difference
 * decides whether the next move is a manifest edit or a different library. When bytes for one of them arrive, this fails until the entry moves up into `servedBy` and proves itself.
 *
 * The measurement behind the absences is in `docs/SAMPLE_LIBRARY_INTEGRATION.md`: pinned tree `sgossner/VCSL@dfcf4a4918771eee884b96ad4493de82ef84daf6` has 4739 blobs and **zero**
 * matching violin/viola/cello/contrabass/trumpet/trombone/tuba/horn/flute/oboe/clarinet/bassoon; its `Chordophones` is harps, pianos and harpsichords, not bowed strings. The
 * mirrored `vcsl` entry covers four families, and no file in it matches those words either.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseManifest } from "../data/sampleManifest";
import { catalogueFromManifestText } from "../data/sampleCatalogue";
import { listCatalogueInstruments } from "../../mcp/instruments";
import { expandRemoteIncludes } from "../audio/sfz/remoteIncludes";
import { parseSfz } from "../audio/sfz/parse";
import { resolveInstrumentNote } from "../audio/sfz/instrument";

interface RequestedInstrument {
  /** The word the client used, matched against the mirrored file list and the exposed names. */
  name: string;
  /** The exposed ids that serve it. Empty means nothing serves it, and the test says so in the strong form. */
  servedBy: string[];
  /** Why nothing serves it, in one line — a gap with a reason rather than a blank. */
  absentBecause?: string;
}

const REQUESTED: RequestedInstrument[] = [
  { name: "violin", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "viola", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "cello", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "contrabass", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "horn", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "trumpet", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "trombone", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "tuba", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "flute", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "oboe", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "clarinet", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  { name: "bassoon", servedBy: [], absentBecause: "not in the pinned VCSL tree at all" },
  {
    name: "harp",
    servedBy: [],
    absentBecause: "upstream has Concert and Folk Harp under Chordophones/Composite Chordophones, which is not in this entry's `paths`, so no byte is mirrored",
  },
  { name: "timpani", servedBy: ["vcsl:Timpani-1-Keyswitch", "vcsl:Timpani-2-Keyswitch"] },
];

const TIMPANI_ASSET_ID = "vcsl:Timpani-1-Keyswitch";

const manifestText = readFileSync("public/samples/manifest.json", "utf8");
const manifest = parseManifest(manifestText);
const mirroredPaths = manifest.manifest!.entries.find((candidate) => candidate.id === "vcsl")!.files.map((file) => file.path);
const catalogue = catalogueFromManifestText(manifestText, process.env.GROOVE_SAMPLE_ROOT ?? "");
const list = listCatalogueInstruments();

/** The program's URL, source first and mirror second, exactly as the loader resolves it. */
const fetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
};

/**
 * The instrument's asset and its fully expanded SFZ, or `null` when the network is not there — the pattern `realLibrary.test.ts` already uses, because a criterion that fails for a
 * missing network teaches people to ignore it. The include base is the library root, which is the program's own address minus its path.
 */
async function expandedProgram(assetId: string): Promise<{ url: string; text: string } | null> {
  const asset = catalogue.assets.find((candidate) => candidate.assetId === assetId);
  if (!asset?.sfz) return null;
  try {
    const text = await fetchText(asset.sfz.url);
    const programme = new URL(asset.sfz.url);
    const libraryBase = new URL("./".repeat(asset.sfz.path!.split("/").length), programme).toString();
    const expanded = await expandRemoteIncludes(text, { fetchText, programUrl: asset.sfz.path!, baseUrl: libraryBase });
    return { url: asset.sfz.url, text: expanded.text };
  } catch {
    return null;
  }
}

const timpani = await expandedProgram(TIMPANI_ASSET_ID);

describe("the orchestral instruments a catalogue entry could serve", () => {
  it("names every instrument the client asked for, so a request in those words has an answer", () => {
    expect(REQUESTED.map((instrument) => instrument.name)).toEqual([
      "violin",
      "viola",
      "cello",
      "contrabass",
      "horn",
      "trumpet",
      "trombone",
      "tuba",
      "flute",
      "oboe",
      "clarinet",
      "bassoon",
      "harp",
      "timpani",
    ]);
  });

  it("exposes the ids it claims serve an instrument", () => {
    const exposed = new Set(list.instruments.map((instrument) => instrument.assetId));
    for (const instrument of REQUESTED) {
      for (const assetId of instrument.servedBy) {
        expect(exposed.has(assetId), `${instrument.name} claims ${assetId}, which is not in the exposed list`).toBe(true);
      }
    }
  });

  it("says what is absent, and the manifest backs the claim rather than the roster", () => {
    for (const instrument of REQUESTED.filter((candidate) => candidate.servedBy.length === 0)) {
      /**
       * **The strong form.** "No exposed instrument is called violin" would pass for bytes sitting in the mirror unregistered, which is the exact failure this workstream keeps
       * meeting. The manifest lists the files the mirror holds, so "there are no violin bytes" is checkable against it.
       */
      const matchingFiles = mirroredPaths.filter((path) => path.toLowerCase().includes(instrument.name));
      expect(matchingFiles, `the mirror now holds ${instrument.name}; claim it in servedBy and prove it resolves`).toEqual([]);
      const matchingInstruments = list.instruments.filter((candidate) =>
        `${candidate.name} ${candidate.assetId} ${candidate.program ?? ""}`.toLowerCase().includes(instrument.name)
      );
      expect(matchingInstruments.map((candidate) => candidate.assetId), `${instrument.name} is served but the roster says it is not`).toEqual([]);
      expect(instrument.absentBecause, `${instrument.name} is not served and the roster gives no reason`).toBeTruthy();
    }
  });

  it("keeps the gap visible in the tool's own answer, because that is what a caller reads", () => {
    // The family the missing instruments would file under, so a caller sees the coverage it has rather than a bare absence.
    const winds = list.categories.find((category) => category.name === "Winds");
    expect(winds, "the Winds category vanished, so the orchestral gap is no longer visible in the tool's answer").toBeDefined();
    // Percussion is where timpani lives, and it is the one requested instrument that is exposed.
    expect(list.categories.find((category) => category.name === "Percussion")?.subcategories.map((sub) => sub.name)).toContain("Struck Membranophones");
  });
});

describe.skipIf(timpani === null)("an exposed orchestral instrument proves itself by resolving a note", () => {
  it("has regions, which is the precondition", () => {
    expect(parseSfz(timpani!.text).length).toBeGreaterThan(0);
  });

  it("resolves at least one note to a sample file the manifest actually lists", () => {
    const resolved = new Set<string>();
    for (let note = 0; note <= 127; note += 1) {
      const resolution = resolveInstrumentNote({ assetId: TIMPANI_ASSET_ID, sfz: { url: timpani!.url } }, timpani!.text, note);
      if (!resolution.ok) continue;
      const path = resolution.note!.samplePath;
      resolved.add(path);
      /**
       * ⭐ **A region is not enough; the file has to exist.** The defect this replaces: the parser truncated `Timpani 1/Hit/…wav` at the first space, so `resolveInstrumentNote`
       * answered `ok` with `samplePath: "Timpani"` — a name that is a directory. "It resolves" was true and the instrument was silent.
       */
      const absolute = decodeURIComponent(new URL(path.replace(/#/g, "%23"), timpani!.url).pathname);
      const known = mirroredPaths.find((mirroredPath) => absolute.endsWith(`/${mirroredPath}`));
      expect(known, `note ${note} resolved to "${path}", which the manifest does not list`).toBeDefined();
    }

    expect(resolved.size, "the exposed timpani resolved no note at all").toBeGreaterThan(0);
    expect(resolved.size, "every note resolved to the same sample, which is not an instrument").toBeGreaterThan(1);
    // The specific failure, named: a "sample" that is not a file at all.
    expect([...resolved].every((path) => /\.(wav|flac|aif|aiff|ogg)$/i.test(path))).toBe(true);
  });
});
