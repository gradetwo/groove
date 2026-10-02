/**
 * Which instruments an agent may choose.
 *
 * `set_arrangement_track_asset` takes an `assetId`, and nothing listed the ids that exist — so the choosing half of the feature was reachable and the discovering half was not, which for a client that cannot read the repository means the feature is
 * unusable in practice. This module answers it from the same manifest the application loads.
 *
 * **It reads `public/samples/manifest.json` from disk rather than from the network.** The id list is a property of the repository at the version being run, and an agent asking "what can I play" should get the same answer offline as online; only the
 * addresses need a root, and they are omitted rather than guessed when one is not configured.
 */
import { readFileSync } from "node:fs";
import { catalogueFromManifestText } from "../src/data/sampleCatalogue";
import { parseManifest } from "../src/data/sampleManifest";
import { mergeUserLibraries } from "../src/data/userLibraries";
import { readUserLibraries } from "./sampleLibraries";
import { filterInstruments } from "../src/data/instrumentSearch";
import { SAMPLED_INSTRUMENTS } from "../src/data/sampledInstruments";

const MANIFEST_PATH = "public/samples/manifest.json";

export interface CatalogueInstrument {
  assetId: string;
  name: string;
  /** The longest sample, measured by `ffprobe` when the library was mirrored. */
  seconds: number;
  /** The library the entry came from, which is the part of the id before the colon for a multi-instrument one. */
  library: string;
  /** What kind of instrument it is — "Acoustic Drums", "Bass", "Winds". Absent when the manifest does not say, which a caller should show as "uncategorised" rather than invent. */
  category?: string;
  /** The second level, for a category too long to scan: VCSL's idiophones divide into struck, plucked and friction, a bass library's programs into arco and pizz. */
  subcategory?: string;
  /** The SFZ program this instrument is, when it is one. */
  program?: string;
}

export interface InstrumentList {
  instruments: CatalogueInstrument[];
  /** Every library the manifest declares, including any that contribute nothing — a gap worth seeing rather than inferring. */
  libraries: string[];
  /**
   * The categories the instruments actually carry, **each with the second level underneath it and the counts**, so a caller filters by words that exist rather than ones it guessed, and can see which categories are worth filtering at all.
   */
  categories: Array<{ name: string; count: number; subcategories: Array<{ name: string; count: number }> }>;
  /** Why a declared library is not in the list: no measured duration, or a licence that forbids redistribution. */
  problems: string[];
  /**
   * ⭐ **Which written instrument name plays which catalogue asset** — the table at `src/data/sampledInstruments.ts`,
   * surfaced because it is otherwise a fact only the source code knows.
   *
   * It is the same list the renderer and the live engine consult, so a caller can ask for a recording **by name**
   * (`add_arrangement_track {kind:"synth", instrument:"piano_lead"}`) instead of by asset id, and can see the judgement
   * behind each row (`because`) rather than reverse-engineering it.
   */
  mappedInstruments: Array<{ instrument: string; assetId: string; because: string }>;
  /** Where the bytes are served from, empty when no root is configured. */
  root: string;
}

/**
 * The instruments a caller may name, optionally narrowed to one library.
 *
 * `limit` exists because `vcsl` alone declares 88 instruments and a reply carrying all of them is a lot of text for a question that is often "what is there"; the caller can page or narrow instead.
 */
export function listCatalogueInstruments({
  library,
  category,
  subcategory,
  query,
  limit,
}: {
  library?: string;
  category?: string;
  subcategory?: string;
  /** Free text, matched the same way the library panel matches it — one rule, so an agent and a person find the same instruments with the same words. */
  query?: string;
  limit?: number;
} = {}): InstrumentList {
  const root = process.env.GROOVE_SAMPLE_ROOT ?? "";
  const text = readFileSync(MANIFEST_PATH, "utf8");
  const { assets, problems } = catalogueFromManifestText(text, root);

  const manifest = JSON.parse(text) as { entries?: { id: string }[] };
  const libraries = (manifest.entries ?? []).map((entry) => entry.id);

  const all: CatalogueInstrument[] = assets
    // Only what can actually be played: an asset without an SFZ is a sample rather than an instrument, and pointing a sampler track at one would be the silent-sampler mistake.
    .filter((asset) => asset.sfz !== undefined)
    .map((asset) => {
      // A multi-instrument library names its programs `entry:program`, which is where the library part of the id ends.
      const separator = asset.assetId.indexOf(":");
      return {
        assetId: asset.assetId,
        name: asset.name,
        seconds: asset.seconds,
        library: separator === -1 ? asset.assetId : asset.assetId.slice(0, separator),
        ...(asset.category ? { category: asset.category } : {}),
        ...(asset.subcategory ? { subcategory: asset.subcategory } : {}),
        ...(asset.sfz ? { program: asset.sfz.path } : {}),
      };
    })
    .sort((a, b) => a.library.localeCompare(b.library) || a.name.localeCompare(b.name));

  /**
   * Two filters rather than one, because they answer different questions: `library` is "everything from this download" and `category` is "every bass I have", which crosses libraries. The categories are listed so a caller can see what exists before
   * filtering by a word it guessed.
   */
  const narrowed = filterInstruments(all, query ?? "")
    .filter((instrument) => library === undefined || instrument.library === library)
    .filter((instrument) => category === undefined || instrument.category === category)
    .filter((instrument) => subcategory === undefined || instrument.subcategory === subcategory);

  /**
   * The tree, built from the instruments rather than from the manifest: a category with nothing in it is not shown as empty, and a count is the number of things a click would actually reveal.
   */
  const byCategory = new Map<string, Map<string, number>>();
  for (const instrument of all) {
    const name = instrument.category ?? "Uncategorised";
    if (!byCategory.has(name)) byCategory.set(name, new Map());
    const subs = byCategory.get(name)!;
    const sub = instrument.subcategory ?? "";
    subs.set(sub, (subs.get(sub) ?? 0) + 1);
  }
  const categories = [...byCategory.entries()]
    .map(([name, subs]) => ({
      name,
      count: [...subs.values()].reduce((total, value) => total + value, 0),
      subcategories: [...subs.entries()]
        .filter(([sub]) => sub !== "")
        .map(([sub, count]) => ({ name: sub, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /**
   * ⭐ **A mapped row whose asset this manifest does not declare is itself a problem**, and it is reported here rather
   * than discovered at render time: the table is a promise about what a name sounds like, and a mirror that cannot keep
   * it should say so where someone is choosing an instrument rather than where they are listening for one.
   */
  const mappedInstruments = SAMPLED_INSTRUMENTS.map((choice) => ({ ...choice }));
  const knownIds = new Set(all.map((instrument) => instrument.assetId));
  for (const choice of mappedInstruments) {
    if (knownIds.has(choice.assetId)) continue;
    problems.push(
      `the recorded-instrument table maps "${choice.instrument}" to "${choice.assetId}", which public/samples/manifest.json does not declare — that lane falls back to its built-in preset`
    );
  }

  return {
    instruments: limit !== undefined && limit >= 0 ? narrowed.slice(0, limit) : narrowed,
    libraries,
    categories,
    problems,
    mappedInstruments,
    root,
  };
}

/**
 * **What each declared library is, under what licence, and what is missing.**
 *
 * The instrument list answers "what can I play"; this answers the question an agent has to ask *before* it publishes anything — **where the bytes came from and what their licence requires**. The manifest has carried `licence`, `sourceUrl`, `repo` and `pin` all along, and an agent could not see any of it, which is the one gap that matters for the CC-BY library this project pinned on purpose to exercise the attribution path.
 *
 * **A duration is reported only when it was measured.** `durationSeconds` is written by the mirroring step with `ffprobe` after the bytes are downloaded; until then it is absent, and this says so with a reason rather than a zero. That is the same rule the rest of this project follows: a number nobody measured is worse than a stated gap.
 */
export interface SampleLibrary {
  id: string;
  name: string;
  /** The licence the manifest declares, verbatim — `CC0`, `CC-BY`, and whatever else a later entry says. */
  licence: string;
  /** Where the material came from, and where attribution should point. */
  sourceUrl?: string;
  /** The upstream repository and the commit the library was pinned to, so a byte-for-byte reference is reproducible. */
  repo?: string;
  pin?: string;
  /** How many instruments this library contributes to the catalogue, which is zero for a library that declares none. */
  instruments: number;
  /** The longest sample, **measured by `ffprobe` after download**. Absent when nothing has been downloaded. */
  durationSeconds?: number;
  /** ⭐ Whose library this is: shipped with the project, or registered by the creator. */
  source: "built-in" | "user";
  /** Why a field that a caller might expect is not here. */
  problems: string[];
}

export function listSampleLibraries(): { libraries: SampleLibrary[]; root: string; note: string } {
  const root = process.env.GROOVE_SAMPLE_ROOT ?? "";
  const text = readFileSync(MANIFEST_PATH, "utf8");
  /**
   * ⭐ **The creator's own libraries are merged before anything derives an asset id from the manifest.**
   *
   * That position is the whole design, and it is the same one `catalogueFromManifestText` uses: the asset counts
   * below and the asset list itself both come from one merged manifest, so a library someone registered gets
   * its ids from `withProgramIds` like any other and resolves through the one resolver. Merging afterwards would
   * give the same SFZ two ids, or a loading path of its own.
   *
   * `readUserLibraries` never throws: a missing file is an empty list and a malformed one is a problem naming
   * the file, both reported below, because a person who registered a library and cannot see it needs to know
   * whether the file or the entry is at fault.
   */
  const stored = readUserLibraries();
  const parsed = parseManifest(text);
  /** Which ids the shipped manifest itself states, so a library can be reported as the caller's own when it is not. */
  const builtInIds = new Set((parsed.ok && parsed.manifest ? parsed.manifest.entries : []).map((entry) => entry.id));
  const merged =
    parsed.ok && parsed.manifest
      ? mergeUserLibraries(parsed.manifest, stored.libraries)
      : { manifest: { version: 1 as const, entries: [] }, problems: parsed.errors, added: [] as string[] };
  /**
   * The libraries go to the catalogue as well as to the merge, so a registered library's instruments are
   * counted: `list_sample_libraries` is where a caller finds out what is reachable, and a library listed with
   * zero instruments would read as broken when it is merely not registered with a duration yet.
   */
  const { assets, problems: catalogueProblems } = catalogueFromManifestText(text, root, stored.libraries);

  const counts = new Map<string, number>();
  for (const asset of assets) {
    if (!asset.sfz) continue;
    const library = asset.assetId.includes(":") ? asset.assetId.slice(0, asset.assetId.indexOf(":")) : asset.assetId;
    counts.set(library, (counts.get(library) ?? 0) + 1);
  }

  const libraries = merged.manifest.entries.map((entry) => {
    const problems: string[] = [];
    if (entry.licence === undefined) problems.push("the manifest declares no licence, so the material must be treated as all rights reserved");
    if (entry.durationSeconds === undefined) {
      problems.push("no measured duration: nothing has been downloaded, so the manifest reports the gap rather than a number");
    }
    if ((counts.get(entry.id) ?? 0) === 0) {
      problems.push("this library contributes no instrument to the catalogue — either it declares none, or the catalogue could not read its SFZ");
    }
    return {
      id: entry.id,
      name: entry.name ?? entry.id,
      licence: entry.licence ?? "unknown",
      /** ⭐ Whose library this is. A caller deciding whether to trust a label needs to know where it came from. */
      source: builtInIds.has(entry.id) ? ("built-in" as const) : ("user" as const),
      ...(entry.sourceUrl === undefined ? {} : { sourceUrl: entry.sourceUrl }),
      ...(entry.repo === undefined ? {} : { repo: entry.repo }),
      ...(entry.pin === undefined ? {} : { pin: entry.pin }),
      instruments: counts.get(entry.id) ?? 0,
      ...(entry.durationSeconds === undefined ? {} : { durationSeconds: entry.durationSeconds }),
      problems,
    };
  });

  const attribution = libraries.filter((library) => /BY/i.test(library.licence)).map((library) => library.id);
  return {
    libraries,
    root,
    /**
     * ⭐ **What went wrong with the libraries the creator supplied, and what the catalogue made of the manifest.**
     *
     * A registered library that is absent, refused or excluded has to be visible here rather than only in the
     * file: the whole point of the registry is that a person can tell whether the library they added is
     * reachable, and "it is not in the list" answers a different question from "it was refused for this reason".
     */
    ...(stored.problems.length + merged.problems.length + catalogueProblems.length === 0
      ? {}
      : { problems: [...stored.problems, ...merged.problems, ...catalogueProblems] }),
    note:
      attribution.length === 0
        ? "No declared library requires attribution by its licence name."
        : `These libraries require attribution by their licence name: ${attribution.join(", ")}. Point at the \`sourceUrl\` (and the \`repo\`/\`pin\` for a byte-for-byte reference).`,
  };
}
