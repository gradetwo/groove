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
export interface SampleAsset {
  assetId: string;
  /** What a composer would call it. */
  name: string;
  kind: "loop" | "one-shot";
  seconds: number;
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
