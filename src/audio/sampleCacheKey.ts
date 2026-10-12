/**
 * ⭐ **What a sample's bytes are called, independently of where they were fetched from.**
 *
 * ## The defect this answers
 *
 * `src/audio/sampleLoader.ts` caches a decode **by `assetId`**, inside one loader instance. That is right, and it is not enough the
 * moment a cache outlives the loader: a cache on disk has to be keyed by something that is the *same* on the next render, the next
 * process, and — this is the part a URL cannot do — the next **mirror**.
 *
 * The owner's requirement is that the bytes be persisted, and the obvious key is the URL the decoder was handed. It is the wrong
 * key, for one reason that is measurable on this repository's own manifest: `GROOVE_SAMPLE_ROOT` (and every library's
 * source/mirror pair) can move the **base** while the relative path stays put. `sampleManifest.ts` builds
 * `mirrorSfzUrl(manifest, entryId, root, programSfz)` — `root + "/" + entryId + "/" + programSfz` — so changing the mirror changes
 * `sfz.url` and therefore every sample URL derived from it (`sampleAssetForPath` resolves a region's `sample=` **against the
 * program URL**). Keyed by URL, that change is a 100 % cache miss and every byte is downloaded again from the new host, which is
 * exactly the duplication this work exists to remove.
 *
 * ## What the key is
 *
 *   · **a catalogue asset** — its own `assetId`, which the manifest declares once and which is the identity the reply, the error
 *     messages and `findSampleAsset` already use;
 *   · **a sample named by an SFZ region** — the region's path **plus the pinned identity of the programme that named it**.
 *     `SampleAsset.url` for such an asset is a full address, so the key takes the URL's **path and query and drops the origin**,
 *     then trims the programme's own path (`SampleAsset.sfz.path`, e.g. `Programs/01-basic-kit.sfz`) off the end when the URL
 *     still carries it. What is left is the library root, and for a pinned library that string **contains the commit** — measured
 *     on this repository's own manifest, `sfz.url` is
 *     `https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/9f04cf9a7345/Programs/01-basic-kit.sfz` — so the pin is
 *     in the key and the host is not. The mirror's copy of the same pinned library keys identically.
 *
 * Two different libraries on one host cannot collide (their paths differ), and two hosts serving one pinned library share a cache
 * entry (their origins differ and nothing else does). That is the direction the key has to be wrong in: a false **hit** would ship
 * the wrong recording, and evertying here is arranged so that the things that could change the bytes — the relative path, the
 * pin, the library — are all in the key, while the one thing that cannot (which host answered) is not.
 *
 * ⚠️ **A catalogue asset and a region that names the same file still produce two keys**, and that is deliberate rather than
 * overlooked: `assetId` is the identity the caller writes in a track and the one every reply quotes, and a second key scheme for
 * "the same bytes reached by another route" would be a second identity for one file. The loader's own decode cache has the same
 * property today (it is keyed by `assetId`), so this makes the disk cache agree with the memory cache instead of inventing a
 * rule that only the disk half follows.
 *
 * This module is **pure**: no `node:fs`, no `fetch`, no clock. It is imported by the browser bundle as well as the Node one, which
 * is also why it lives under `src/audio/` rather than beside the Node cache that uses it.
 */
import type { SampleAsset } from "../data/sampleCatalogue";

/**
 * The version of the key scheme, written into the file name.
 *
 * A file on disk outlives the code that wrote it, so a change to what the key means has to be able to *miss* rather than return
 * yesterday's interpretation. Bumping this is the whole migration, and it is free because the old files are evicted by size.
 */
export const SAMPLE_CACHE_KEY_VERSION = "v1";

/**
 * What a URL contributes to a key: **everything but the host**.
 *
 * The query is kept because this repository's pinned sources carry the pin there as often as in the path
 * (`sfz.url` above puts it in the path; a `?ref=<sha>` form is the other shape a pin takes), and dropping it would make two
 * revisions of one path collide — the one false hit this scheme must not produce. The hash is dropped: it is a fragment the
 * server never sees and nothing here addresses with one.
 */
function urlIdentity(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

/**
 * The library root a programme lives under, as a host-independent identity.
 *
 * `SampleAsset.sfz.path` is the programme's path **relative to the library root** (`sampleManifest.ts` writes it, and
 * `sampleLoader.expandedProgram` subtracts it from `sfz.url` to find the base its includes resolve against) — so subtracting it
 * here gives the same root the sample URLs were built on.
 *
 * ⭐ **Both kinds of asset answer, and that is why the `||` is not a fallback for a missing value.** A catalogue asset carries
 * `sfz.url` (the pinned program) and `url` (the program, for an instrument). A sample that a region **named** is built by
 * `sampleAssetForPath`, which sets `url` to the sample's own address and has no `sfz.url` — but its `assetId` is the path the
 * region wrote and its `url` is that path resolved against the program, so the program's own address is recoverable as
 * `url` minus `assetId`'s URL spelling. Taking the first that yields a root is therefore "ask the asset which of its two
 * addresses identifies its library", and both answers are pins.
 */
function libraryIdentity(asset: SampleAsset): string | undefined {
  const candidates: Array<{ url: string; path?: string }> = [];
  if (asset.sfz?.url) candidates.push({ url: asset.sfz.url, ...(asset.sfz.path ? { path: asset.sfz.path } : {}) });
  if (asset.sfz?.fallbackUrl) candidates.push({ url: asset.sfz.fallbackUrl, ...(asset.sfz.path ? { path: asset.sfz.path } : {}) });
  /**
   * The path-derived case: `assetId` is library-relative and `url` is absolute, so the URL's own spelling of the relative path
   * is the suffix to subtract. `encodeSamplePath` is what built the URL, and matching either the encoded or the raw spelling
   * means a space in a sample's name does not silently drop the root and change the key.
   */
  if (asset.url && !isAbsoluteAddress(asset.assetId)) {
    candidates.push({ url: asset.url, path: asset.assetId });
  }

  for (const candidate of candidates) {
    let identity: string;
    try {
      identity = urlIdentity(candidate.url);
    } catch {
      continue;
    }
    const suffix = trimmedSuffix(candidate.path);
    if (suffix && identity.endsWith(suffix)) identity = identity.slice(0, identity.length - suffix.length);
    const root = identity.replace(/\/+$/, "");
    if (root) return root;
  }
  return undefined;
}

/** Whether an `assetId` is an address rather than a library-relative path — a URL, or a path the library does not own. */
function isAbsoluteAddress(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("/");
}

/** A candidate path as the URL would spell it, encoded or raw, so a space in a filename still matches. */
function trimmedSuffix(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/^\/+/, "");
}

/**
 * The stable identity of one asset's bytes — the key a persistent cache is written under.
 *
 * It never contains a scheme or a host, so it survives a mirror move; it never contains provenance that can change, so two
 * renders of one arrangement agree. A `url`-less asset keys by its id alone, which is the only fact it carries (and it is refused
 * loudly by the loader before any bytes are asked for).
 */
export function sampleCacheKey(asset: SampleAsset): string {
  if (asset.sfz) return `${SAMPLE_CACHE_KEY_VERSION}\u0000asset\u0000${asset.assetId}`;
  if (!asset.url) return `${SAMPLE_CACHE_KEY_VERSION}\u0000asset\u0000${asset.assetId}`;
  let url: string;
  try {
    url = urlIdentity(asset.url);
  } catch {
    // A relative or malformed address is not a URL: key it by what it says, which is still stable and still host-free.
    return `${SAMPLE_CACHE_KEY_VERSION}\u0000url\u0000${asset.url}`;
  }
  const library = libraryIdentity(asset);
  return library ? `${SAMPLE_CACHE_KEY_VERSION}\u0000file\u0000${library}\u0000${url}` : `${SAMPLE_CACHE_KEY_VERSION}\u0000file\u0000\u0000${url}`;
}

/**
 * The stable identity of an **SFZ program or include** file, keyed by its address.
 *
 * A program is not a sample and `sampleCacheKey` is not its key: a program is text the loader fetches by URL and expands
 * (`expandRemoteIncludes` follows `#include`), and it has no catalogue entry to be identified by. So the key is the URL with
 * the **host kept** — and the host is kept here on purpose, unlike for a sample, because a program's URL *is* the pin: the
 * manifest builds it as `sourceSfzUrl(manifest, entryId, programSfz)`, which contains the upstream revision
 * (`…/virtuosity_drums/9f04cf9a7345/…`), and the mirror is a **fallback of the same revision**. Two hosts serving one revision
 * therefore key differently, which costs a second fetch in the rare case where both are used in one cache's lifetime and can
 * never serve the wrong text — the direction this key has to be wrong in.
 */
export function programCacheKey(url: string): string {
  return `${SAMPLE_CACHE_KEY_VERSION}\u0000program\u0000${url}`;
}
