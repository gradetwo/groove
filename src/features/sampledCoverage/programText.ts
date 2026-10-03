/**
 * **The program text a key-coverage reading needs — obtained the way the sampler obtains it, with no second table and no
 * second include algorithm.**
 *
 * ## Why this exists at all
 *
 * `src/audio/sampleLoader.ts` already fetches and expands an instrument's program, and it caches the result per asset
 * (`expandedProgram`, `sampleLoader.ts:274-299`). What it does **not** do is hand that text to anyone: `SampleLoader`
 * exposes `load`, `loadNote` and `decodes`, and nothing else (`sampleLoader.ts:57-83`). The one engine entry point that
 * answers "does this key sound" over text is the pure `resolveInstrumentNote` (`src/audio/sfz/instrument.ts:178`), and
 * it needs the text.
 *
 * So a surface that wants to show coverage has two honest options:
 *
 *   1. sweep `loader.loadNote(assetId, key)` for keys 0–127 and read the refusals — which **downloads and decodes every
 *      sample the instrument covers** just to answer a mapping question (a full-range piano is ~88 decodes);
 *   2. fetch the program **once**, expand its includes with the engine's own `expandRemoteIncludes`, and then let the
 *      engine answer all 128 keys over that held text — which is this module plus {@link sampledKeyCoverage}.
 *
 * This is (2). The one thing it duplicates from `sampleLoader` is the **address rule** — source first, mirror second,
 * and the include base is the library root derived by subtracting the program's own path from its url. Both are written
 * here against the same lines they come from, and a change there should change this file with it; the alternative
 * (editing `src/audio/**`) is out of this change's territory.
 *
 * ⚠️ **What this does not do: it is not a cache of the sampler's own.** If a lane has already played, the loader holds
 * the program too, and this module's fetch is a second read of the same file. That is stated rather than hidden — the
 * fix is an accessor on `SampleLoader`, which belongs to the audio workstream, not here.
 */
import { expandRemoteIncludes } from "../../audio/sfz/remoteIncludes";
import type { SampleAsset } from "../../data/sampleCatalogue";

/** A catalogue entry that really is an instrument: `sfz` present, so a program can be fetched for it. */
export type InstrumentAsset = SampleAsset & { sfz: NonNullable<SampleAsset["sfz"]> };

/** How one file is read. Injected for the same reason the loader injects it: a criterion must not need a network. */
export type ProgramTextFetcher = (url: string) => Promise<string>;

/** One asset's expanded program text. */
export type ProgramTextSource = (asset: InstrumentAsset) => Promise<string>;

/** The loader's own default reader, byte for byte (`sampleLoader.ts:158-161`). */
export const fetchProgramText: ProgramTextFetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`SFZ "${url}" could not be fetched (${response.status})`);
  return response.text();
};

/**
 * The catalogue's own address rule, as a {@link ProgramTextSource}.
 *
 * Source first, mirror second, and **the first answer wins** — the try order is `sampleLoader.ts:279-296`. The include
 * base is the library root, computed from the **source** url regardless of which address served
 * (`sampleLoader.ts:297-298`); copying that asymmetry is deliberate, because the mirrors serve the same tree at the
 * same relative paths and a "more correct-looking" base computed from the serving url would be a different rule.
 */
export function catalogueProgramText(fetchText: ProgramTextFetcher = fetchProgramText): ProgramTextSource {
  return async (asset) => {
    const addresses = [asset.sfz.url, asset.sfz.fallbackUrl].filter(
      (url): url is string => typeof url === "string" && url.length > 0
    );
    let raw: string | undefined;
    let firstFailure: unknown;
    for (const url of addresses) {
      try {
        raw = await fetchText(url);
        break;
      } catch (error) {
        if (firstFailure === undefined) firstFailure = error;
      }
    }
    if (raw === undefined) {
      throw firstFailure instanceof Error
        ? firstFailure
        : new Error(`no address served the program for "${asset.assetId}"`);
    }
    const programPath = asset.sfz.path;
    const baseUrl = programPath ? asset.sfz.url.slice(0, asset.sfz.url.length - programPath.length) : asset.sfz.url;
    const expanded = await expandRemoteIncludes(raw, {
      fetchText,
      programUrl: programPath || asset.sfz.url,
      baseUrl,
    });
    return expanded.text;
  };
}

/**
 * A session-wide, single-flight cache over a {@link ProgramTextSource}.
 *
 * The same two rules the loader's own caches state (`sampleLoader.ts:1-11`): the cache holds the **promise**, so two
 * rows pointing at one asset share one download, and a **failure is not cached**, so a transient 502 does not become a
 * permanently silent instrument. It is per source, so a criterion that injects fixture text cannot be served a real
 * fetch's answer.
 */
export function cachedProgramText(source: ProgramTextSource): ProgramTextSource {
  const cache = new Map<string, Promise<string>>();
  return (asset) => {
    const cached = cache.get(asset.assetId);
    if (cached) return cached;
    const pending = source(asset).catch((error: unknown) => {
      cache.delete(asset.assetId);
      throw error;
    });
    cache.set(asset.assetId, pending);
    return pending;
  };
}
