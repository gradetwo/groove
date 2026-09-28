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
import { resolveInstrumentNote } from "./sfz/instrument";

/** Decodes one asset. In the browser this wraps `decodeAudioData`; in a test it is a plain function. */
export type SampleDecoder = (asset: SampleAsset) => Promise<AudioBuffer>;

export interface SampleLoader {
  /** Resolves to the decoded buffer, or rejects with a reason a composer can act on. */
  load(assetId: string): Promise<AudioBuffer>;
  /**
   * The buffer for **one note** of an entry that is an instrument: resolve the note through the SFZ, then load the sample it names.
   *
   * This is a separate entry point rather than an overload of `load`, because they answer different questions: `load` is "one id, one buffer", while an instrument is
   * one id and **many** buffers, chosen per note. Folding the second into the first would make `load` mean two things, which is how a caller ends up with the wrong
   * sample and no error to show for it.
   *
   * Rejects with a reason when the entry is not an instrument, when its SFZ cannot be fetched, when the note is covered by no region, or when the named sample cannot
   * be decoded — never a silent default, which is the standard the ninth track kind was held to.
   */
  loadNote(assetId: string, note: number, options?: { velocity?: number; nth?: number }): Promise<AudioBuffer>;
  /** How many decodes have actually run — for a test, and for a probe that wants to prove rule 1 rather than trust it. */
  decodes(): number;
}

export function createSampleLoader(
  decode: SampleDecoder,
  catalogue: readonly SampleAsset[] = [],
  /**
   * How an instrument's SFZ text is obtained. Injected for the same reason the decoder is: fetching is I/O, and the decisions worth testing are not.
   *
   * It defaults to a fetch of the entry's `sfz.url`, so a browser caller needs to pass nothing.
   */
  fetchSfzText: (url: string) => Promise<string> = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`SFZ "${url}" could not be fetched (${response.status})`);
    return response.text();
  }
): SampleLoader {
  const cache = new Map<string, Promise<AudioBuffer>>();
  let decodes = 0;

  const api: SampleLoader = {
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
    async loadNote(assetId, note, options = {}) {
      const asset = findSampleAsset(assetId, catalogue);
      if (!asset) {
        const known = sampleAssetIds(catalogue);
        throw new Error(known.length ? `no sample "${assetId}" — the catalogue holds ${known.join(", ")}` : `no sample "${assetId}" — no samples ship with the app yet`);
      }
      if (!asset.sfz) throw new Error(`sample "${assetId}" is not an instrument (it has no sfz), so a note cannot select a sample from it`);

      const resolution = resolveInstrumentNote(asset, await fetchSfzText(asset.sfz.url), note, options);
      if (!resolution.ok || !resolution.note) throw new Error(resolution.reason ?? `note ${note} could not be resolved for "${assetId}"`);

      // Through `load`, so a sample shared by several notes is decoded once — the single-flight rule applies to the sample, not to the note.
      return api.load(/* the resolved sample path is the id the catalogue holds */ resolution.note.samplePath);
    },
    decodes: () => decodes,
  };
  return api;
}
