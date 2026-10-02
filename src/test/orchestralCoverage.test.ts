/**
 * **The orchestral instruments, requested by name, held to behaviour.**
 *
 * An MCP client asked for violin, viola, cello, contrabass, horn, trumpet, trombone, tuba, flute, oboe, clarinet, bassoon, harp and timpani. A list that merely *counts* instruments cannot
 * answer that: the count was already 135, and the answer was still "no". So the roster below is written in the requested words, and every entry must be **played** — the exposed id is
 * fetched from its pinned source, the file parsed, and a note resolved to a sample the manifest really lists.
 *
 * ## What changed, and why the shape is the same
 *
 * The first version of this file recorded an **absence**: VCSL, the library mirrored at the time, holds none of these words except timpani, and the test said so in the strong form — not
 * merely "no exposed instrument is called violin" but "no mirrored file path contains the word", so that the day bytes for one arrived the test would go red until the instrument was
 * claimed in `servedBy` *and* proved to resolve. That is what happened when VSCO 2 CE was mirrored: all fourteen words now have bytes, so the roster moved every one of them into
 * `servedBy` and the strong form is applied **in both directions** below rather than deleted — an instrument claimed as served must hold bytes and be exposed, and one claimed absent
 * must hold none. The day a gap reappears, the check is already there.
 *
 * The measurement behind the original absences is in `docs/SAMPLE_LIBRARY_INTEGRATION.md`: pinned tree `sgossner/VCSL@dfcf4a4918771eee884b96ad4493de82ef84daf6` has 4739 blobs and
 * **zero** matching violin/viola/cello/contrabass/trumpet/trombone/tuba/horn/flute/oboe/clarinet/bassoon; its `Chordophones` is harps, pianos and harpsichords, not bowed strings.
 * The fourteen are now served by `schollz/VSCO-2-CE` at its `SFZ` branch, which its own `LICENSE` puts under **CC0 1.0 Universal**.
 *
 * ## The articulation slice
 *
 * The mirror has since taken **one articulation program per instrument for twelve of the fourteen** — pizzicato for the bowed strings, staccato for the winds and the
 * tenor trombone, a mute for the horn and the trumpet — with `Harp` and `Timpani` left at one program each. Every one of the twelve is in the roster's `articulations`
 * column and is proved by the same case as the sustained programs: fetch the program from its pinned source, parse it, resolve notes across the velocity layers, and
 * require every resolved sample to be a path the `vsco2ce` entry itself lists. `TimpaniRolls.sfz` is the one program the work order's "no articulation for timpani"
 * row gets wrong — it exists upstream and its ten samples are already in the mirror from the sustained set's directory take — so the absence is asserted against the
 * **declared program files**, which is the thing that would actually change.
 *
 * ## The network, stated honestly
 *
 * The proof needs `raw.githubusercontent.com`, so it is **skipped, not failed, when the network is not there** — the pattern `sfizzAgreement.test.ts` and the other real-library tests
 * already use, because a criterion that fails for a missing network teaches people to ignore it. A *partial* failure is not treated as "offline": if some programs fetch and others do
 * not, the first case below names the ones that did not.
 *
 * ⭐ **Every velocity layer is resolved, not just the loudest.** The mirror deliberately includes all of a program's layers rather than one, because a one-layer mirror leaves the SFZ's
 * other `lovel`/`hivel` regions naming files that were never uploaded: the instrument sounds at velocity 100 and 404s at velocity 40. Resolving each note at velocities 1/32/64/96/127 is
 * the criterion that keeps that from being reintroduced as a size optimisation.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseManifest } from "../data/sampleManifest";
import { catalogueFromManifestText } from "../data/sampleCatalogue";
import { listCatalogueInstruments, listSampleLibraries } from "../../mcp/instruments";
import { expandRemoteIncludes } from "../audio/sfz/remoteIncludes";
import { parseSfz } from "../audio/sfz/parse";
import { resolveSamplePath } from "../audio/sfz/defaultPath";
import { resolveInstrumentNote } from "../audio/sfz/instrument";

interface RequestedInstrument {
  /** The word the client used, matched against the mirrored file list and the exposed names. */
  name: string;
  /** The exposed ids that serve it. Empty means nothing serves it, and the both-directions check below says so in the strong form. */
  servedBy: string[];
  /**
   * The **articulation** program this instrument gained when the mirror took one per instrument, or `[]` for an instrument with none.
   *
   * Kept apart from `servedBy` because the two claims are different ones: `servedBy` is the sustained program the mirror has had since the fourteen were taken, and this
   * is the pizzicato/staccato/muted program added on top. Both are proved the same way below, and the empty lists are asserted rather than left implicit.
   */
  articulations: string[];
}

/**
 * Every entry is served now, and the ids are the `vsco2ce` programs' own ids: the manifest writes `entryId:programSlug`, so `ViolinEnsSusVib.sfz` under the `vsco2ce` entry is
 * `vsco2ce:ViolinEnsSusVib`. Timpani keeps the two VCSL keyswitch ids as well, because that proof existed before this library did and dropping it would silently lose coverage.
 *
 * ⭐ **The articulations column is measured, and it corrected the work order on one row.** The order said VSCO has no articulation program for `Harp` *or* `Timpani`; the
 * pinned tree says otherwise for one of them: it ships `TimpaniRolls.sfz` (a roll/tremolo program, 1,336 bytes) whose ten samples were already mirrored when the whole
 * `Percussion/Timpani` directory came across with the sustained set (`docs/SAMPLE_LIBRARY_INTEGRATION.md` §⑤). **Harp has no second program at all.** That roll program
 * file is not mirrored in this slice, so both rows read `[]` — and the absence check below is written against the *program files*, so the day `TimpaniRolls.sfz`
 * is mirrored this roster goes red and has to claim it rather than letting an unregistered program sit in the mirror.
 */
const REQUESTED: RequestedInstrument[] = [
  { name: "violin", servedBy: ["vsco2ce:ViolinEnsSusVib"], articulations: ["vsco2ce:ViolinEnsPizz"] },
  { name: "viola", servedBy: ["vsco2ce:ViolaEnsSusVib"], articulations: ["vsco2ce:ViolaEnsPizz"] },
  { name: "cello", servedBy: ["vsco2ce:CelloEnsSusVib"], articulations: ["vsco2ce:CelloEnsPizz"] },
  { name: "contrabass", servedBy: ["vsco2ce:ContrabassSusVB"], articulations: ["vsco2ce:ContrabassPizz"] },
  { name: "horn", servedBy: ["vsco2ce:FHornSus"], articulations: ["vsco2ce:FHornMute"] },
  { name: "trumpet", servedBy: ["vsco2ce:TrumpetSus"], articulations: ["vsco2ce:TrumpetHarmonMuteSus"] },
  { name: "trombone", servedBy: ["vsco2ce:TromboneSus"], articulations: ["vsco2ce:TromboneStac"] },
  { name: "tuba", servedBy: ["vsco2ce:TubaSus"], articulations: ["vsco2ce:TubaStac"] },
  { name: "flute", servedBy: ["vsco2ce:FluteSusVib"], articulations: ["vsco2ce:FluteStac"] },
  { name: "oboe", servedBy: ["vsco2ce:OboeSusVib"], articulations: ["vsco2ce:OboeStac"] },
  { name: "clarinet", servedBy: ["vsco2ce:ClarinetSus"], articulations: ["vsco2ce:ClarinetStac"] },
  { name: "bassoon", servedBy: ["vsco2ce:BassoonSus"], articulations: ["vsco2ce:BassoonStac"] },
  { name: "harp", servedBy: ["vsco2ce:Harp"], articulations: [] },
  { name: "timpani", servedBy: ["vsco2ce:Timpani", "vcsl:Timpani-1-Keyswitch", "vcsl:Timpani-2-Keyswitch"], articulations: [] },
];

/** Every id the roster claims, both kinds — a sustained program and an articulation are proved by the same fetch-and-resolve case. */
const CLAIMED = REQUESTED.flatMap((instrument) => [...instrument.servedBy, ...instrument.articulations]);

/** The velocities a note is resolved at, so a layer with no bytes cannot hide behind the one that has them. */
const VELOCITIES = [1, 32, 64, 96, 127];

const manifestText = readFileSync("public/samples/manifest.json", "utf8");
const manifest = parseManifest(manifestText).manifest!;
/** The files each entry says the mirror holds, keyed by entry id — a resolved sample must be one of its own library's. */
const filesByEntry = new Map(manifest.entries.map((entry) => [entry.id, entry.files.map((file) => file.path)]));
const catalogue = catalogueFromManifestText(manifestText, process.env.GROOVE_SAMPLE_ROOT ?? "");
const list = listCatalogueInstruments();

/** The program's URL, source first and mirror second, exactly as the loader resolves it. */
const fetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
};

/**
 * The instrument's asset and its fully expanded SFZ, or `null` when it could not be fetched. The include base is the library root, which is the program's own address minus its path.
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

/** One fetch per id the roster claims — 28 today (16 sustained ids plus 12 articulation ids), and none of them is skipped silently. */
const proofs = await Promise.all(CLAIMED.map(async (assetId) => ({ assetId, program: await expandedProgram(assetId) })));
/** Nothing fetched at all is a missing network; *something* failing while others succeed is a real failure and is asserted below. */
const offline = proofs.every((proof) => proof.program === null);

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

  it("exposes the ids it claims, for the sustained programs and the articulations alike", () => {
    const exposed = new Set(list.instruments.map((instrument) => instrument.assetId));
    for (const instrument of REQUESTED) {
      for (const assetId of [...instrument.servedBy, ...instrument.articulations]) {
        expect(exposed.has(assetId), `${instrument.name} claims ${assetId}, which is not in the exposed list`).toBe(true);
      }
    }
  });

  it("matches the roster against the mirror in both directions, and in the strong form on the absent side", () => {
    const vsco = filesByEntry.get("vsco2ce")!;
    const problems: string[] = [];
    for (const instrument of REQUESTED) {
      /**
       * **The strong form, kept from the version that recorded the gap.** It is checked against the manifest's file list rather than against the exposed names, because bytes
       * sitting in the mirror unregistered is the exact failure this workstream keeps meeting — a word appearing in `files` without an instrument claiming it is a gap, and an
       * instrument claiming a word with no bytes is a claim with nothing behind it.
       */
      const holdsBytes = vsco.some((path) => path.toLowerCase().includes(instrument.name));
      const exposed = list.instruments.filter((candidate) =>
        `${candidate.name} ${candidate.assetId} ${candidate.program ?? ""}`.toLowerCase().includes(instrument.name)
      );
      if (instrument.servedBy.length > 0) {
        if (!holdsBytes) problems.push(`${instrument.name} is claimed as served, but no mirrored file path contains the word`);
        if (exposed.length === 0) problems.push(`${instrument.name} is claimed as served, but nothing in the exposed list is called it`);
      } else {
        if (holdsBytes) problems.push(`the mirror now holds ${instrument.name}; claim it in servedBy and prove it resolves`);
        if (exposed.length > 0) problems.push(`${instrument.name} is served but the roster says it is not`);
      }
    }
    expect(problems, "the roster and the mirror disagree; one of them is wrong").toEqual([]);
    // And the roster's own claim is checked, so "all served" cannot quietly become "all absent and therefore vacuously fine".
    expect(REQUESTED.filter((instrument) => instrument.servedBy.length === 0).map((instrument) => instrument.name)).toEqual([]);
  });

  it("keeps harp and timpani at the one program each the mirror took, so a mirrored articulation cannot arrive unclaimed", () => {
    /**
     * ⭐ **The deliberate absence, written so that filling it breaks the test rather than passing quietly.**
     *
     * The work order said VSCO has no articulation for `Harp` or `Timpani`, and the mirror matches that: this slice took one articulation for each of the other
     * twelve and none for these two. The upstream tree only *nearly* agrees — it also ships `TimpaniRolls.sfz` (a roll program, 1,336 bytes) whose ten samples
     * were **already mirrored** when the sustained set took the whole `Percussion/Timpani` directory (`docs/SAMPLE_LIBRARY_INTEGRATION.md` §⑤), while `Harp` has
     * no second program at all. So the assertion is on the **declared program files**, not on sample bytes: the timpani roll samples are legitimately present,
     * and what must not happen is a roll/pizzicato/muted `.sfz` appearing in `instruments` without the roster claiming it and proving it resolves a note.
     */
    const entry = manifest.entries.find((candidate) => candidate.id === "vsco2ce")!;
    const programs = (entry.instruments ?? []).map((program) => program.sfz);
    const only: Record<string, string> = { harp: "Harp.sfz", timpani: "Timpani.sfz" };
    const problems: string[] = [];
    for (const [instrument, expected] of Object.entries(only)) {
      const mine = programs.filter((sfz) => sfz.toLowerCase().includes(instrument));
      if (mine.length !== 1 || mine[0] !== expected) {
        problems.push(`${instrument} should be declared by exactly ${expected}, but the entry declares ${mine.join(", ") || "nothing"}`);
      }
      const roster = REQUESTED.find((candidate) => candidate.name === instrument)!;
      if (roster.articulations.length > 0) {
        problems.push(`${instrument} now carries an articulation (${roster.articulations.join(", ")}) — claim it here and in the document, this test is what noticed`);
      }
    }
    expect(problems, "the deliberate articulation absence for harp/timpani changed; say so everywhere rather than letting it pass").toEqual([]);
    // The roster's own half of the same claim, so an empty `articulations` cannot become "forgotten" instead of "decided".
    expect(REQUESTED.filter((instrument) => instrument.articulations.length === 0).map((instrument) => instrument.name)).toEqual(["harp", "timpani"]);
  });

  it("keeps the families visible in the tool's own answer, because that is what a caller reads", () => {
    // The family the previously-missing instruments file under, so a caller sees the coverage it has rather than a bare absence.
    const winds = list.categories.find((category) => category.name === "Winds");
    expect(winds, "the Winds category vanished, so the orchestral coverage is no longer visible in the tool's answer").toBeDefined();
    expect(list.categories.find((category) => category.name === "Percussion")?.subcategories.map((sub) => sub.name)).toContain("Struck Membranophones");
    /**
     * ⭐ **The count grew twice, and the number is the point of the assertion rather than an inconvenience.**
     *
     * `Orchestral` held 26 — VSCO 2 CE's fourteen sustained programs and twelve articulations. The Sonatina brass library mirrored that day declares the same category (it is the same
     * kind of library: an orchestra sampled instrument by instrument), and adds **48** programs, so a caller read 74. The 2026-10-02 string-articulation round added VSCO's four section
     * tremolos, four section spiccatos, four section `-Quiet` takes and five solo-violin programs — **17 more** — so the category now answers 91. Asserting a literal would have made this
     * test fail for the right reason and been "fixed" by deleting a library from the category; asserting the sum says what the tool answers and why it changed.
     */
    expect(list.categories.find((category) => category.name === "Orchestral")?.count).toBe(26 + 48 + 17);
  });

  it("answers what VSCO 2 CE is, where it came from, and under what licence", () => {
    /**
     * The question an agent has to ask before it publishes anything. The licence was the one thing that could have stopped this work: an earlier note in this repository called VSCO 2 CE
     * "CC Sampling Plus 1.0, not redistributable", and the owner said that was wrong. **The upstream repository's own `LICENSE`, at the pinned commit, is CC0 1.0 Universal**, and the
     * assertion below is that the catalogue reports the licences and the pin it actually declares.
     */
    const vsco = listSampleLibraries().libraries.find((library) => library.id === "vsco2ce");
    expect(vsco, "vsco2ce is not in the library list, so its provenance cannot be asked for").toBeDefined();
    expect(vsco!.licence).toBe("CC0");
    expect(vsco!.repo).toBe("schollz/VSCO-2-CE");
    expect(vsco!.pin).toBe("6dd651d55dde97fd4028699be9d4481f26917891");
    expect(vsco!.sourceUrl).toContain("schollz/VSCO-2-CE");
    expect(vsco!.instruments).toBe(43);
    expect(vsco!.durationSeconds).toBeGreaterThan(0);
    expect(vsco!.problems).toEqual([]);
  });
});

describe.skipIf(offline)("every exposed orchestral instrument proves itself by resolving a note to bytes the manifest lists", () => {
  it("fetched every program it is about to prove", () => {
    const missing = proofs.filter((proof) => proof.program === null).map((proof) => proof.assetId);
    expect(missing, "these programs did not fetch, and something did, so this is a failure rather than a missing network").toEqual([]);
  });

  for (const { assetId, program } of proofs) {
    it(`${assetId} resolves notes across its velocity layers to files its own entry lists`, () => {
      const owned = filesByEntry.get(assetId.split(":")[0]!)!;
      expect(owned, `${assetId} names a library the manifest does not declare`).toBeDefined();
      const regions = parseSfz(program!.text);
      expect(regions.length, `${assetId} parsed to no regions at all`).toBeGreaterThan(0);

      /**
       * `default_path` joins the region's `sample` before it becomes an address, exactly as the loader does it — VSCO 2 CE declares `default_path=Strings\Violin Section\susVib\` and names its
       * samples `VlnEns_susVib_A2_v1.wav`, so a test that skipped this step would resolve to a path one directory too high and "prove" a file that does not exist.
       *
       * The path comes from the **note's own region** rather than from one read of the file: the keyswitch programs of this same library declare 2–5 paths, and a single
       * file-level value would send most of their regions into a directory their samples are not in.
       */
      const resolved = new Set<string>();
      for (let note = 0; note <= 127; note += 1) {
        for (const velocity of VELOCITIES) {
          const resolution = resolveInstrumentNote({ assetId, sfz: { url: program!.url } }, program!.text, note, { velocity });
          if (!resolution.ok) continue;
          const sample = resolveSamplePath(resolution.note!.samplePath, resolution.note!.defaultPath);
          resolved.add(sample);
          /**
           * A region is not enough; the file has to exist. `#` and `?` are escaped because a filename like `VlnEns_susVib_F#3_v1.wav` otherwise becomes a URL fragment — the defect Muse
           * reported as samples that never fetched.
           */
          const absolute = decodeURIComponent(new URL(sample.replace(/#/g, "%23").replace(/\?/g, "%3F"), program!.url).pathname);
          const known = owned.find((mirroredPath) => absolute.endsWith(`/${mirroredPath}`));
          expect(known, `note ${note} at velocity ${velocity} resolved to "${sample}", which the entry for ${assetId.split(":")[0]} does not list`).toBeDefined();
          expect(sample, `note ${note} resolved to "${sample}", which is not a sample file`).toMatch(/\.(wav|flac|aif|aiff|ogg)$/i);
        }
      }

      expect(resolved.size, `${assetId} resolved no note at all`).toBeGreaterThan(1);
    });
  }
});
