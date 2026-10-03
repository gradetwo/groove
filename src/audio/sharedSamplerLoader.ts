/**
 * ⭐ **One sample loader per audio context — the session's decode cache and program cache, shared by every recorded-lane play.**
 *
 * ## Why this exists
 *
 * `createSampleLoader` already keeps two caches, and both are **per loader instance**: the decode cache (keyed by asset, holding the
 * *promise*, so two notes asking at once decode once) and the expanded-program cache (keyed by asset, so an instrument's SFZ and its
 * `#include` files are fetched once rather than once per note). What neither cache can do is survive the loader: every call to
 * `createSamplerLanePlayback` without a `loader`/`loaderFor` builds a **new** loader, so pressing play a second time on the same genre
 * re-downloads the instrument's program and every `#include` under it, and re-decodes every sample it needs.
 *
 * Measured on `/genre/bebop`'s recorded lanes: **45 files** — three programs plus 42 `#include`/sample files — so the second press paid all
 * 45 again at our layer. That is the "重复下载／重复请求" the owner asked to remove, and it is the same problem `smplr` answers with its
 * shared `SampleLoader` option: *"Pass the same loader to multiple instruments to cache buffers across them"* /
 * *"Offline render reuses cached buffers — no re-fetch"* (<https://raw.githubusercontent.com/danigb/smplr/main/README.md>, "Buffer reuse").
 *
 * ## The shape, and why a `WeakMap` keyed by context
 *
 * An `AudioContext` is the thing a decoded buffer belongs to — `decodeAudioData` produces buffers that only that context can play — so the
 * context is the correct cache key rather than a module-level singleton. `WeakMap` means a view that tears its engine down and lets the
 * context go takes the loader and every buffer in it with it, with no teardown code to forget.
 *
 * The catalogue is part of the key because `createSampleLoader` resolves a region's sample through it (`findSampleAsset`): a session that
 * has since added a creator's own library must not be answered by a loader built against the older, smaller catalogue. The catalogue the
 * app hands in is the session's own array (`appCatalogueRuntime.assets`), rebuilt only when a library is registered, so the identity check
 * reuses the loader for every ordinary call.
 *
 * ⚠️ **The trade this makes, stated rather than discovered.** The shared loader holds decoded buffers for as long as the context lives, which
 * is the point (that is what stops the second press paying twice) and is also unbounded in principle. It is bounded in practice by the
 * palette: the sixteen libraries the app maps, and the notes a pattern actually names. A session that loaded every program of every library
 * would hold every one of them, so a future eviction policy belongs here rather than in the callers.
 */
import { browserSampleDecoder } from "./browserSampleGraph";
import { createSampleLoader, type SampleLoader } from "./sampleLoader";
import type { SampleAsset } from "../data/sampleCatalogue";

interface CachedLoader {
  catalogue: readonly SampleAsset[];
  loader: SampleLoader;
}

const perContext = new WeakMap<BaseAudioContext, CachedLoader>();

/**
 * How many loaders have been built — the number a criterion reads to prove the sharing rather than trust it.
 *
 * A `WeakMap` cannot be counted or cleared directly, so the count is kept beside it. It is a **build counter**, not a live-object count:
 * "one build for two plays" is the fact worth asserting, and it is the fact that fails when the sharing is removed.
 */
let loaderBuilds = 0;

/**
 * The loader this context has been using, or a new one built on it.
 *
 * Callers that want the same cache must pass the **same catalogue array**; a different array rebuilds the loader, which is the honest
 * answer to "the assets changed underneath it" rather than a stale `findSampleAsset`.
 */
export function sharedSamplerLoader(context: BaseAudioContext, catalogue: readonly SampleAsset[]): SampleLoader {
  const cached = perContext.get(context);
  if (cached && cached.catalogue === catalogue) return cached.loader;
  const loader = createSampleLoader(browserSampleDecoder(context), catalogue);
  perContext.set(context, { catalogue, loader });
  loaderBuilds += 1;
  return loader;
}

/** How many loaders this session has built — `1` after any number of plays that shared one. */
export function sharedSamplerLoaderBuilds(): number {
  return loaderBuilds;
}

/** Starts the counter from a known state, for a criterion that asserts the sharing. */
export function __resetSharedSamplerLoaderBuilds(): void {
  loaderBuilds = 0;
}

