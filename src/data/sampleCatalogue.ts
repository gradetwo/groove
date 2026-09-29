/**
 * The catalogue an audio lane's `sample.assetId` names into (owner decision 2026-09-28, sixth report item VI's neighbourhood).
 *
 * ## Why this file exists before any sample does
 *
 * An audio lane that names nothing plays **nothing**, and a lane that plays nothing is indistinguishable from a lane that is broken — the failure this kind most
 * needs to avoid. So the reference is checked against a catalogue, and the catalogue is **empty today**: nothing ships with the app yet, which means every
 * reference is an error until something does. That is stated here rather than hidden, because the alternative — inventing ids for samples that do not exist —
 * would be a pretend feature, and this project has a rule about those (the SVS interface says "reserved" out loud for the same reason).
 *
 * The catalogue is a **parameter** everywhere it is read, so the shipped-empty case and a populated case are both testable, and so that adding real assets later is
 * an edit to one array rather than a change to the rule.
 */
import { parseManifest, sampleAssetsFromManifest } from "./sampleManifest";

export interface SampleAsset {
  assetId: string;
  /** What a composer would call it. */
  name: string;
  kind: "loop" | "one-shot";
  seconds: number;
  /**
   * Where the bytes are, **inside the app** — a path the app itself serves, not a user's file and not an absolute URL.
   *
   * That indirection is what keeps the `.groove` format unchanged: a song or a shared genre carries the **id**, and the id resolves here. Optional, because an asset
   * may be declared before its audio exists — and an asset without a url is refused, loudly, rather than fetched from nowhere.
   */
  url?: string;
  /**
   * Set when this entry is an **instrument defined by an SFZ** rather than a single sample: `url` then points at the `.sfz`, and the regions inside it name the samples.
   *
   * A separate field rather than a new `kind`, deliberately: `kind` describes a sample's **time shape** (`loop` or `one-shot`), while this describes **how the entry is
   * resolved**. Merging two different questions into one field is the conflation this codebase keeps paying for.
   *
   * Optional, so every existing entry — and every song that references one — behaves exactly as before.
   */
  /**
   * Where this instrument's SFZ lives: `url` is the **pinned source**, `fallbackUrl` the mirror — tried only when the source does not answer.
   *
   * Both are carried because the two hosts fail differently: an upstream reorganisation 404s, a misrouted mirror 403s. A loader with one address cannot tell those apart.
   */
  /**
   * The mirror's address for this asset, used only when `url` fails.
   *
   * It belongs on the asset rather than inside `sfz` because a **sample** needs it too: a region's `sample=` becomes an address (source-first, mirror as fallback), and without this field the mirrored copy
   * of a sample would be unreachable when the upstream library is reorganised.
   */
  fallbackUrl?: string;
  sfz?: {
    url: string;
    fallbackUrl?: string;
    /**
     * The program's own path **relative to the library root** (e.g. `Programs/01-basic-kit.sfz`).
     *
     * Needed because include paths are relative to that root, not to the program's directory: subtracting this from `url` gives the base the includes resolve against, which is the same base the
     * mirror uses. Without it the loader resolved includes against the program's directory and asked for `…/Programs/Programs/…`.
     */
    path?: string;
  };
}

/**
 * The samples that ship with the app. **Empty on purpose and for now** — every `assetId` is therefore an error, and the tests say so on both paths.
 */
export const SAMPLE_CATALOGUE: readonly SampleAsset[] = [];

export function findSampleAsset(assetId: string, catalogue: readonly SampleAsset[] = SAMPLE_CATALOGUE): SampleAsset | null {
  return catalogue.find((asset) => asset.assetId === assetId) ?? null;
}

/** The ids a caller may use, for an error message that can say what exists rather than only what does not. */
export function sampleAssetIds(catalogue: readonly SampleAsset[] = SAMPLE_CATALOGUE): string[] {
  return catalogue.map((asset) => asset.assetId);
}

/**
 * Why a lane's sample reference cannot be used, or `null` when it can.
 *
 * Both halves matter and they are different failures: an audio lane **without** a sample would be silent by construction, and a sample on a lane of another kind is
 * a contradiction — the same rule the share guard enforces on a payload. Returns a reason rather than a boolean, because the caller has to tell a composer what to
 * do next.
 */
export function sampleReferenceProblem(
  track: { track_id?: string; sample?: { assetId?: string } },
  catalogue: readonly SampleAsset[] = SAMPLE_CATALOGUE
): string | null {
  const kind = (track.track_id ?? "").toLowerCase();
  const assetId = track.sample?.assetId;

  if (assetId && kind !== "audio") {
    return `lane "${track.track_id}" carries a sample id, but only an audio lane can play one`;
  }
  if (kind !== "audio") return null;
  if (!assetId) {
    return "an audio lane must name a sample — without one it would play nothing, which is indistinguishable from a broken lane";
  }
  if (!findSampleAsset(assetId, catalogue)) {
    const known = sampleAssetIds(catalogue);
    return known.length
      ? `no sample "${assetId}" — the catalogue holds ${known.join(", ")}`
      : `no sample "${assetId}" — no samples ship with the app yet, so every sample reference is an error until they do`;
  }
  return null;
}

/**
 * The catalogue a **manifest** describes — the last pure link between a library's metadata and the playback path.
 *
 * Both halves already existed: `parseManifest` validates the manifest and `sampleAssetsFromManifest` turns it into catalogue entries. This joins them and returns the problems
 * from both, so a caller gets one answer instead of two partial ones. It is pure — the caller fetches the text, which keeps the network out of the data layer and keeps this
 * testable with a literal string.
 *
 * A manifest that does not parse yields **no catalogue and its errors**, rather than an empty catalogue: those are different facts, and conflating them is how "the library
 * failed to load" becomes "the library has no instruments".
 */
export function catalogueFromManifestText(text: string, root: string): { assets: SampleAsset[]; problems: string[] } {
  const parsed = parseManifest(text);
  if (!parsed.ok || !parsed.manifest) {
    return { assets: [], problems: parsed.errors.map((error) => `manifest: ${error}`) };
  }
  const { assets, problems } = sampleAssetsFromManifest(parsed.manifest, root);
  return { assets, problems };
}
