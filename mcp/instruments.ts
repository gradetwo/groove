/**
 * Which instruments an agent may choose.
 *
 * `set_arrangement_track_instrument` takes an `assetId`, and nothing listed the ids that exist — so the choosing half of the feature was reachable and the discovering half was not, which for a client that cannot read the repository means the feature is
 * unusable in practice. This module answers it from the same manifest the application loads.
 *
 * **It reads `public/samples/manifest.json` from disk rather than from the network.** The id list is a property of the repository at the version being run, and an agent asking "what can I play" should get the same answer offline as online; only the
 * addresses need a root, and they are omitted rather than guessed when one is not configured.
 */
import { readFileSync } from "node:fs";
import { catalogueFromManifestText } from "../src/data/sampleCatalogue";

const MANIFEST_PATH = "public/samples/manifest.json";

export interface CatalogueInstrument {
  assetId: string;
  name: string;
  /** The longest sample, measured by `ffprobe` when the library was mirrored. */
  seconds: number;
  /** The library the entry came from, which is the part of the id before the colon for a multi-instrument one. */
  library: string;
  /** The SFZ program this instrument is, when it is one. */
  program?: string;
}

export interface InstrumentList {
  instruments: CatalogueInstrument[];
  /** Every library the manifest declares, including any that contribute nothing — a gap worth seeing rather than inferring. */
  libraries: string[];
  /** Why a declared library is not in the list: no measured duration, or a licence that forbids redistribution. */
  problems: string[];
  /** Where the bytes are served from, empty when no root is configured. */
  root: string;
}

/**
 * The instruments a caller may name, optionally narrowed to one library.
 *
 * `limit` exists because `vcsl` alone declares 88 instruments and a reply carrying all of them is a lot of text for a question that is often "what is there"; the caller can page or narrow instead.
 */
export function listCatalogueInstruments({ library, limit }: { library?: string; limit?: number } = {}): InstrumentList {
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
        ...(asset.sfz ? { program: asset.sfz.path } : {}),
      };
    })
    .sort((a, b) => a.library.localeCompare(b.library) || a.name.localeCompare(b.name));

  const narrowed = library ? all.filter((instrument) => instrument.library === library) : all;
  return {
    instruments: limit !== undefined && limit >= 0 ? narrowed.slice(0, limit) : narrowed,
    libraries,
    problems,
    root,
  };
}
