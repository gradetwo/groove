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
import { expandRemoteIncludes } from "./sfz/remoteIncludes";
import { sampleAssetForPath } from "./sfz/instrument";
import { resolveSamplePath } from "./sfz/defaultPath";
import { readDefaultPath } from "./sfz/parse";

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
  /**
   * One note, resolved and decoded: **the buffer and the rate it must be played at.**
   *
   * It used to return the buffer alone, and the ratio `resolveInstrumentNote` had just computed was discarded — so the sampler path had no pitch at all and nothing in the application called this method. Returning both is what makes a
   * sampler play the note rather than the recording.
   */
  loadNote(assetId: string, note: number, options?: { velocity?: number; nth?: number }): Promise<LoadedNote>;
  /** How many decodes have actually run — for a test, and for a probe that wants to prove rule 1 rather than trust it. */
  decodes(): number;
}

export interface LoadedNote {
  buffer: AudioBuffer;
  /** The playback rate this sample needs to sound at the requested note: `2^((note − root)/12) × 2^(cents/1200)`. */
  ratio: number;
  /** The sample the note resolved to, relative to the library root — so a diagnostic can name the file rather than the buffer. */
  samplePath: string;
  /** The region's key centre, absent when the file sets none — which means "no transposition" rather than 60. */
  rootKey?: number;
  /**
   * The region's choke group and what it silences, passed through from the resolver.
   *
   * Carried here rather than looked up again by the player, because **the player never sees the SFZ text**: it gets a decoded buffer, and the file's opinion about which hat silences which is not recoverable from a buffer.
   */
  group?: number;
  offBy?: number;
  /**
   * Whether the sample ignores a key release — SFZ's `loop_mode=one_shot`.
   *
   * Measured with sfizz rather than inferred from the opcode's name: the same 0.1-second note on a one-second sample renders **2.091 s** with `one_shot` and **0.341 s** without, and the energy 0.2–0.6 s after the note-off is nonzero only in the first case.
   */
  oneShot?: boolean;
  /** The file's `note_polyphony`: a cap on how many voices of this note may sound at once. Measured — see the resolver, where the numbers are. */
  notePolyphony?: number;
  /** The controller-driven level scale the region asked for (`amplitude_onccN`), applied when the note is started. */
  gainScale?: number;
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

  /**
   * Decode an **asset**, with the single-flight rule in one place.
   *
   * Extracted so a region's sample can be decoded without a catalogue lookup: the catalogue holds instruments while a region names a file, so the sample path becomes an address
   * (`sampleAssetForPath`) and must still share this cache — a sample used by several notes is decoded once whichever route reached it.
   */
  const decodeAsset = (asset: SampleAsset): Promise<AudioBuffer> => {
    const cached = cache.get(asset.assetId);
    if (cached) return cached;
    decodes += 1;
    const pending = decode(asset).catch((error: unknown) => {
      // Rule 2: a failure leaves the cache as it was, so the next caller gets a real attempt rather than yesterday's error.
      cache.delete(asset.assetId);
      throw error;
    });
    cache.set(asset.assetId, pending);
    return pending;
  };

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

      return decodeAsset(asset);
    },
    async loadNote(assetId, note, options = {}) {
      const asset = findSampleAsset(assetId, catalogue);
      if (!asset) {
        const known = sampleAssetIds(catalogue);
        throw new Error(known.length ? `no sample "${assetId}" — the catalogue holds ${known.join(", ")}` : `no sample "${assetId}" — no samples ship with the app yet`);
      }
      if (!asset.sfz) throw new Error(`sample "${assetId}" is not an instrument (it has no sfz), so a note cannot select a sample from it`);

      /**
       * **The source first, the mirror only if the source does not answer** — the owner's decision, and the reason both addresses are carried in the catalogue.
       *
       * The trigger is **any failure**, not a 404: the two hosts fail differently (an upstream reorganisation answers 404, a misrouted mirror answers 403 or times out), and a rule that only
       * recognised one of those would give up on the address that would have worked. What matters is that the instrument resolves, not which host served it.
       *
       * **And both failures are reported when both fail**, naming each address, because "the source is gone and the mirror is misrouted" and "the instrument does not exist anywhere" send a
       * reader to different places.
       */
      let sfzText: string;
      try {
        sfzText = await fetchSfzText(asset.sfz.url);
      } catch (primaryError) {
        const fallback = asset.sfz.fallbackUrl;
        if (!fallback) throw primaryError;
        try {
          sfzText = await fetchSfzText(fallback);
        } catch (fallbackError) {
          const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
          throw new Error(`${asset.assetId}: neither address served the SFZ — source ${asset.sfz.url}: ${reason(primaryError)}; mirror ${fallback}: ${reason(fallbackError)}`);
        }
      }
      /**
       * **The program's includes have to be fetched before it can be parsed**, and this is the step that was missing: the entry file of a real library contains **zero `<region>` occurrences** and
       * only `#include` directives, so handing its raw text to the resolver produced "defines no regions" — which reads as an empty library rather than an unexpanded one.
       */
            // The include paths are relative to the **library root**, which is the program's address with its own path removed — the same base the mirror uses, so both layouts agree.
      const programPath = asset.sfz.path;
      const baseUrl = programPath ? asset.sfz.url.slice(0, asset.sfz.url.length - programPath.length) : asset.sfz.url;
      /**
       * **The expander is given a plain path, not a URL.** It works by string arithmetic on paths — the directory of the including file, a root fallback — and `https://` contains a `//` that its
       * arithmetic reads as a separator: passing the full URL produced candidates like `https:/raw.githubusercontent.com/…` with **one** slash, which then 404'd and looked exactly like a missing file.
       * The address is therefore assembled **only at the moment of fetching**, and every path the expander sees stays plain.
       */
      const expanded = await expandRemoteIncludes(sfzText, { fetchText: fetchSfzText, programUrl: programPath || asset.sfz.url, baseUrl });
      const resolution = resolveInstrumentNote(asset, expanded.text, note, options);
      if (!resolution.ok || !resolution.note) throw new Error(resolution.reason ?? `note ${note} could not be resolved for "${assetId}"`);

      // Through `load`, so a sample shared by several notes is decoded once — the single-flight rule applies to the sample, not to the note.
      /**
       * **A region names a file; the catalogue holds instruments** — so a miss here is expected, not an error. When the catalogue does have it, the id route is still used (it is what the app's own
       * bundled samples rely on); otherwise the path becomes an address, source-first with the mirror as fallback, and goes through the **same** decode cache.
       */
      /**
       * ⭐ **`default_path` joins the region's `sample` before anything resolves it.** Salamander declares `default_path=Samples/` and names its samples `harmLA0.flac`, so without this the address is one directory too high — not an
       * error, a missing file, and an instrument that simply does not sound. It is read from the same expanded text the note was resolved against, which is the only place it exists.
       */
      const defaultPath = readDefaultPath(expanded.text);
      const samplePath = resolveSamplePath(resolution.note.samplePath, defaultPath);
      const noteInfo = {
        ratio: resolution.note.ratio,
        samplePath,
        ...(resolution.note.rootKey === undefined ? {} : { rootKey: resolution.note.rootKey }),
        // The choke group travels with the note, because only the resolver knew which region answered it.
        ...(resolution.note.group === undefined ? {} : { group: resolution.note.group }),
        ...(resolution.note.offBy === undefined ? {} : { offBy: resolution.note.offBy }),
        // The release behaviour travels with the note for the same reason the choke group does: only the resolver saw the region that answered.
        ...(resolution.note.oneShot === undefined ? {} : { oneShot: resolution.note.oneShot }),
        ...(resolution.note.notePolyphony === undefined ? {} : { notePolyphony: resolution.note.notePolyphony }),
        ...(resolution.note.gainScale === undefined ? {} : { gainScale: resolution.note.gainScale }),
      };
      const buffer = findSampleAsset(samplePath, catalogue)
        ? await api.load(samplePath)
        : await decodeAsset(sampleAssetForPath(samplePath, { programUrl: asset.sfz.url, programFallbackUrl: asset.sfz.fallbackUrl }));
      return { buffer, ...noteInfo };
    },
    decodes: () => decodes,
  };
  return api;
}
