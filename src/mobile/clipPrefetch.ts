import { clipForGenre, type GenreClip, type GenreClipManifest } from "../data/genreClips";
import { nextGenreForMode, type PlayMode } from "./vinyl/vinylMath";

/**
 * ⭐ **The clip cache: the bytes we already have, so a second press is not a second download.**
 *
 * Measured 2026-10-12 on the R2 mirror: `clips/chicago-house.mp3` answers `content-length: 400030`, **no
 * `cache-control`**, `cf-cache-status: DYNAMIC` and no `Last-Modified` — so a browser has no basis to reuse the clip and
 * a replay re-downloads 400 KB. Because the media element does the fetching, that download was also **invisible**:
 * nothing in the app could count it. This is the countable handle.
 *
 * A **blob URL**, not `decodeAudioData` into an `AudioBuffer`: the element has to receive a resource it can stream, so
 * the only work here is moving bytes the browser is going to decode anyway. Decoding a 16.6 s stereo clip to PCM would
 * hold ~5 MB in memory against the media element's own decode, for a cache that exists to avoid a download.
 *
 * Keyed by URL, and **revoked on dispose** — an object URL's backing store lives until it is revoked, which is the leak
 * this guards against.
 *
 * ⭐ **This lives in its own module because two callers need the same cache**: the player (the clip in front of you) and
 * the up-next prefetch below (the one after it). Sharing the instance is what makes the second caller's bytes arrive as
 * a cache hit rather than a third download.
 */
export interface ClipPrefetchOptions {
  /**
   * The media element that may already be fetching the clip. When it is, the prefetch must stand down rather than pull
   * the same bytes a second time.
   */
  element?: HTMLMediaElement | null;
  /** The URL the element is playing. `element.src` is compared against it, because a relative URL resolves differently. */
  url?: string;
}

export class ClipPrefetch {
  private readonly blobs = new Map<string, string>();
  private pending?: Promise<string | undefined>;
  /** Set by `dispose`, so a fetch still in flight cannot pin a blob after unmount. */
  private disposed = false;

  /** The cached blob URL for `url`, or undefined rather than a guess. */
  cached(url: string): string | undefined {
    return this.blobs.get(url);
  }

  /**
   * ⭐ **Is the element already asking for this URL?** `NETWORK_LOADING` is the precise reading: the element has
   * `preload="none"`, so it only enters that state when a gesture starts the load. `paused` alone would answer for a
   * paused *mid-download* element too, which is not the same thing.
   */
  private isLoading(element: HTMLMediaElement | null | undefined, clipUrl: string | undefined): boolean {
    if (!element || !clipUrl) return false;
    return element.src === clipUrl && element.networkState === HTMLMediaElement.NETWORK_LOADING;
  }

  /**
   * ⭐ **Release a prefetch that arrived too late**, i.e. one the element began loading `clip.url` past. `keep` is the
   * object URL the caller did use (if any) or the one the element has already been handed; revoking it would break
   * playback.
   */
  release(url: string, keep?: string): void {
    const objectUrl = this.blobs.get(url);
    if (!objectUrl || objectUrl === keep) return;
    URL.revokeObjectURL(objectUrl);
    this.blobs.delete(url);
  }

  /**
   * Fetch the clip and hold it as an object URL. At most **one** request is in flight, and never a second for a URL that
   * has already arrived: both are what makes "one prefetch, one download" true rather than likely.
   *
   * ⭐ **But never a second request for a URL the element is already loading.** Measured on the live phone path
   * (`scratch/verify-live-phone.mjs`): a quick press beat the idle prefetch, so the element fetched `clip.url` and the
   * prefetch then fetched it again — two downloads of ~400 KB for one clip. When the element is already loading the
   * URL there is nothing left for the prefetch to win, so the fetch is **skipped** and `undefined` is returned; the
   * element's own request is the download. A skip is deliberately **not** cached, so a later call can still prefetch.
   */
  load(url: string, options: ClipPrefetchOptions = {}): Promise<string | undefined> {
    const cached = this.cached(url);
    if (cached) return Promise.resolve(cached);
    if (this.disposed) return Promise.resolve(undefined);
    if (this.isLoading(options.element, options.url ?? url)) return Promise.resolve(undefined);
    if (!this.pending) {
      this.pending = this.fetchAsObjectUrl(url).finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  /** The shared instance: one cache, so the up-next prefetch and the player cannot download the same clip twice. */
  private static shared: ClipPrefetch | null = null;
  static forApp(): ClipPrefetch {
    if (!ClipPrefetch.shared) ClipPrefetch.shared = new ClipPrefetch();
    return ClipPrefetch.shared;
  }

  private async fetchAsObjectUrl(url: string): Promise<string | undefined> {
    try {
      const response = await fetch(url);
      if (!response.ok) return undefined;
      const blob = await response.blob();
      /**
       * `URL.createObjectURL` is absent in jsdom and in some embedded webviews; when it is missing the prefetch is
       * simply not usable, and the element falls back to the clip's own URL — the same path a failed fetch takes.
       */
      if (typeof URL.createObjectURL !== "function") return undefined;
      const objectUrl = URL.createObjectURL(blob);
      /**
       * The dispose may land while the bytes are in flight; an object URL created after `dispose` would never be
       * revoked, so it is released here instead of being handed to a component that no longer exists.
       */
      if (this.disposed) {
        URL.revokeObjectURL(objectUrl);
        return undefined;
      }
      this.blobs.set(url, objectUrl);
      return objectUrl;
    } catch {
      return undefined;
    }
  }

  /** Release everything: unmount must not leave a blob pinned for the life of the document. */
  dispose(): void {
    this.disposed = true;
    for (const objectUrl of this.blobs.values()) URL.revokeObjectURL(objectUrl);
    this.blobs.clear();
  }
}

/** Run something when the browser is idle, falling back to a macrotask (jsdom has no `requestIdleCallback`). */
export const whenIdle = (run: () => void): (() => void) => {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof idle === "function") {
    const id = idle(run, { timeout: 800 });
    return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 0);
  return () => window.clearTimeout(id);
};

/**
 * ⭐ **Warm the clip for the record that is next in the queue, while the current one plays.**
 *
 * The player's own prefetch only ever fetched the clip **in front of you** (`MobileClipPlayer`'s effect takes the
 * selected clip), which is no help at the moment it matters most: a record that ends switches to the next genre and the
 * new clip has to be pulled over the network *then*, so every advance pays ~400 KB of silence first (owner,
 * 2026-10-13: 「不然切歌体验太差」).
 *
 * The next genre is knowable long before that — it is the same `nextGenreForMode` the shell's `skip(1)` uses, and the
 * queue only moves when the user moves it — so this fetches it during the current record and the advance becomes a cache
 * hit. Scheduled in an idle callback so it never competes with the clip that is playing, and **never awaited**: a failure
 * or a late arrival costs nothing, because the player falls back to the clip's own URL exactly as it does today.
 *
 * Returns a cancel function, so an effect can drop a queued warm-up when the queue moves again first.
 */
export function prefetchClipForGenre(manifest: GenreClipManifest | null | undefined, genreId: string | null | undefined): () => void {
  if (!genreId || !manifest) return () => {};
  const clip: GenreClip | undefined = clipForGenre(manifest, genreId);
  if (!clip) return () => {};
  let cancelled = false;
  const cancel = whenIdle(() => {
    if (cancelled) return;
    // The shared cache, so when this genre becomes the current one the player finds the bytes already here.
    void ClipPrefetch.forApp().load(clip.url).catch(() => {});
  });
  return () => {
    cancelled = true;
    cancel();
  };
}

/** Test seam: a fresh shared cache, so one criterion's blobs cannot answer another's. */
export function resetSharedClipPrefetch(): void {
  ClipPrefetch.forApp().dispose();
  (ClipPrefetch as unknown as { shared: ClipPrefetch | null }).shared = null;
}

/**
 * ⭐ **Which genre the shell should warm: the one the queue moves to, or none.**
 *
 * Kept as a function rather than written inline in the shell so the rule itself can be held to a criterion — the shell's
 * JSX is not something a test can run. `repeat-one` has no next record, so it warms nothing; a missing selection warms
 * nothing either. The direction is always `+1`: the queue moves forward on its own, and a manual skip backwards is a
 * gesture that already has the user's attention, so it does not need the bytes in advance.
 */
export function nextClipToWarm(
  playMode: PlayMode,
  currentGenreId: string | null | undefined,
  index: readonly { id: string; category: string }[]
): string | null {
  if (playMode === "one" || !currentGenreId) return null;
  return nextGenreForMode(playMode, currentGenreId, index, 1);
}
