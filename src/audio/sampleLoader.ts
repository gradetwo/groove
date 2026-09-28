/**
 * Loading the samples an audio lane names — the part of the graph where the defects actually live.
 *
 * Scheduling a buffer source is a handful of lines; what goes wrong is the bookkeeping around it. Two rules, both learned the hard way by every audio codebase that
 * ever cached a decode:
 *
 *   1. **one decode per asset**, even when two lanes ask at the same instant — so the cache holds the **promise**, not the result, and a second caller awaits the
 *      first one's work rather than starting it again;
 *   2. **a failed decode is not cached** — because a cache that remembers failure turns one transient problem into a permanent one, and the retry that would have
 *      worked never happens.
 *
 * The decoder is injected rather than called directly, which is what lets both rules be tested without an audio context: `decodeAudioData` needs a browser, and the
 * bookkeeping around it does not.
 */
import { findSampleAsset, sampleAssetIds } from "../data/sampleCatalogue";
import type { SampleAsset } from "../data/sampleCatalogue";

/** Decodes one asset. In the browser this wraps `decodeAudioData`; in a test it is a plain function. */
export type SampleDecoder = (asset: SampleAsset) => Promise<AudioBuffer>;

export interface SampleLoader {
  /** Resolves to the decoded buffer, or rejects with a reason a composer can act on. */
  load(assetId: string): Promise<AudioBuffer>;
  /** How many decodes have actually run — for a test, and for a probe that wants to prove rule 1 rather than trust it. */
  decodes(): number;
}

export function createSampleLoader(
  decode: SampleDecoder,
  catalogue: readonly SampleAsset[] = []
): SampleLoader {
  const cache = new Map<string, Promise<AudioBuffer>>();
  let decodes = 0;

  return {
    load(assetId: string): Promise<AudioBuffer> {
      const cached = cache.get(assetId);
      if (cached) return cached;

      const asset = findSampleAsset(assetId, catalogue);
      if (!asset) {
        // Rejected, and deliberately **not** cached: nothing about this attempt can be remembered as a fact about the asset.
        const known = sampleAssetIds(catalogue);
        return Promise.reject(
          new Error(
            known.length
              ? `no sample "${assetId}" — the catalogue holds ${known.join(", ")}`
              : `no sample "${assetId}" — no samples ship with the app yet, so every sample reference is an error until they do`
          )
        );
      }

      decodes += 1;
      const pending = decode(asset).catch((error: unknown) => {
        // Rule 2: a failure leaves the cache as it was, so the next caller gets a real attempt rather than yesterday's error.
        cache.delete(assetId);
        throw error;
      });
      cache.set(assetId, pending);
      return pending;
    },
    decodes: () => decodes,
  };
}
