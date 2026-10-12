import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { clipForGenre, readClipManifest, staleClips, type GenreClip } from "../data/genreClips";

/**
 * ⭐ **The pre-generated clip player** (owner's decisions ② and ③, 2026-10-10: *15–30 秒主题片段* rendered offline and served
 * from a Cloudflare Worker).
 *
 * Why it exists next to the live engine rather than instead of it: the shell's own player renders through the real engine,
 * which costs about **ten times real time** — fine when the phone is idle, wrong when a person taps a genre card to hear what
 * it sounds like. Measured on this machine: a single 16.6-second clip took **165.8 seconds** to render. A clip is already cut,
 * so it starts immediately; the engine stays for the full experience.
 *
 * Two deliberate semantics:
 *
 *  - **Speed changes pitch** (`preservesPitch = false`). The owner's phone shell is built around a record — `VinylCanvas`,
 *    `VinylScrub`, play modes — so speeding a clip up behaves like speeding a record up, and the label says so rather than
 *    letting a listener wonder why the key moved.
 *  - **A missing clip says why.** An empty manifest carries `emptyReason`; a manifest that names a file the Worker does not
 *    serve is exactly the silence this project keeps finding, so the control is absent and the reason is printed.
 */
const RATES = [0.75, 1, 1.25] as const;

/**
 * ⭐ **The clip cache: the bytes we already have, so a second press is not a second download.**
 *
 * Measured 2026-10-12 on the R2 mirror: `clips/chicago-house.mp3` answers `content-length: 400030`, **no
 * `cache-control`**, `cf-cache-status: DYNAMIC` and no `Last-Modified` — so a browser has no basis to reuse the clip and a
 * replay re-downloads 400 KB. Because the media element does the fetching, that download was also **invisible**: nothing
 * in the app could count it. This is the countable handle.
 *
 * A **blob URL**, not `decodeAudioData` into an `AudioBuffer`: the element has to receive a resource it can stream, so the
 * only work here is moving bytes the browser is going to decode anyway. Decoding a 16.6 s stereo clip to PCM would hold
 * ~5 MB in memory against the media element's own decode, for a cache that exists to avoid a download.
 *
 * Keyed by URL, and **revoked on unmount** — an object URL's backing store lives until it is revoked, which is the leak
 * this guards against.
 */
export class ClipPrefetch {
  private readonly blobs = new Map<string, string>();
  private pending?: Promise<string | undefined>;

  /** The cached blob URL for `url`, or undefined rather than a guess. */
  cached(url: string): string | undefined {
    return this.blobs.get(url);
  }

  /**
   * Fetch the clip and hold it as an object URL. At most **one** request is in flight, and never a second for a URL that
   * has already arrived: both are what makes "one prefetch, one download" true rather than likely.
   */
  load(url: string): Promise<string | undefined> {
    const cached = this.cached(url);
    if (cached) return Promise.resolve(cached);
    if (!this.pending) {
      this.pending = this.fetchAsObjectUrl(url).finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
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
      this.blobs.set(url, objectUrl);
      return objectUrl;
    } catch {
      return undefined;
    }
  }

  /** Release everything: unmount must not leave a blob pinned for the life of the document. */
  dispose(): void {
    for (const objectUrl of this.blobs.values()) URL.revokeObjectURL(objectUrl);
    this.blobs.clear();
  }
}

/** Run something when the browser is idle, falling back to a macrotask (jsdom has no `requestIdleCallback`). */
const whenIdle = (run: () => void): (() => void) => {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof idle === "function") {
    const id = idle(run, { timeout: 800 });
    return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 0);
  return () => window.clearTimeout(id);
};

export interface MobileClipPlayerProps {
  /** The genre whose clip plays. */
  genreId: string;
  /** Optional second genre, which turns the control into an A/B comparison (owner: *曲风对比*). */
  compareGenreId?: string;
  /**
   * ⭐ **Start as soon as the clip is ready.** The owner's rule for the phone (2026-10-11): every module except 即兴 (jam)
   * and 探索 (explore) plays the pre-cut MP3, so on those modules the clip *is* the transport and needs no second press.
   * It must be reached from a user gesture — the shell sets this in the same click that starts playback.
   */
  autoPlay?: boolean;
  /** Optional callback giving the host access to the underlying HTMLAudioElement for synchronization / clock. */
  onAudioRef?: (audio: HTMLAudioElement | null) => void;
  /** Callback when playback reaches the end of the clip. */
  onEnded?: () => void;
}

export function MobileClipPlayer({
  genreId,
  compareGenreId,
  autoPlay = false,
  onAudioRef,
  onEnded,
}: MobileClipPlayerProps): React.ReactElement {
  const { t } = useLanguage();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [clips, setClips] = useState<GenreClip[] | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const [comparing, setComparing] = useState(false);

  /**
   * ⭐ **The app's own reader reads it**, not a bare parse: `readClipManifest` names the bad field when the shipped list is
   * malformed, which is how a stale or hand-edited manifest becomes a sentence instead of a silent empty player.
   */
  useEffect(() => {
    let cancelled = false;
    const base = (import.meta.env?.BASE_URL ?? "/").replace(/\/+$/, "");
    fetch(`${base}/genre-clips.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((raw) => {
        if (cancelled) return;
        const manifest = readClipManifest(raw);
        setClips(manifest.clips);
        if (manifest.clips.length === 0) setUnavailable(manifest.emptyReason ?? "the manifest lists no clips");
      })
      .catch((error: unknown) => {
        if (!cancelled) setUnavailable(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const genreIds = useMemo(
    () => (comparing && compareGenreId ? [genreId, compareGenreId] : [genreId]),
    [comparing, compareGenreId, genreId]
  );
  /**
   * ⭐ **A pure lookup — no state is written while rendering.** The first version called `setUnavailable(...)` inside this
   * `useMemo`, i.e. it set state during render: React applies that on the **next** render, so the current pass fell through to
   * the "loading" branch and the surface could sit there saying "…" forever even though the manifest had arrived. A render
   * path decides what to draw **from the data it has**; only effects and events change state.
   */
  const clip = useMemo(() => (clips ? clipForGenre({ clips }, genreIds[0]!) : undefined), [clips, genreIds]);

  const prefetch = useMemo(() => new ClipPrefetch(), []);
  const [cachedUrl, setCachedUrl] = useState<string | undefined>(undefined);

  /**
   * ⭐ **Prefetch the clip that is next to play, off the critical path.** This is the natural hook point: the selected clip
   * changes, so the bytes it will need are known before the gesture that asks for them. Only this one clip is fetched —
   * never the manifest's whole list, and never every mounted element, which is how 400 KB per genre would become 400 KB
   * times the library.
   *
   * The prefetch is scheduled in an idle callback (a macrotask where there is none) and the element keeps `preload="none"`:
   * the media element is not what pays for this, and if the fetch fails or arrives late, the component plays the clip's
   * own URL exactly as before.
   */
  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      void prefetch.load(clip.url).then((objectUrl) => {
        if (!cancelled && objectUrl) setCachedUrl(objectUrl);
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [clip, prefetch]);

  /** A different clip's blob must never be the element's source, so the pointer clears when the selection moves. */
  useEffect(() => () => setCachedUrl(undefined), [prefetch, clip]);

  /** Unmount is the only eviction this cache needs: one player, one clip, and the blob is released with it. */
  useEffect(() => () => prefetch.dispose(), [prefetch]);

  // Share audio element with host for clock synchronization
  useEffect(() => {
    onAudioRef?.(audioRef.current);
    return () => {
      onAudioRef?.(null);
    };
  }, [onAudioRef, clip]);

  // Clean up and stop audio cleanly on track change or unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [clip]);

  /** ⭐ Speed is a property of the element, and pitch-following is the record's own behaviour, so both are applied here. */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
    audio.preservesPitch = false;
    (audio as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = false;
    (audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;
  }, [rate, clip]);

  useEffect(() => {
    if (!autoPlay) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [autoPlay, clip]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    else {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  if (unavailable && !clips) {
    return (
      <p data-testid="mobile-clip-missing" className="m-note px-1 py-2 text-[11px] opacity-70">
        {t("mobile_clip_missing")} — {unavailable}
      </p>
    );
  }
  if (!clips) {
    return (
      <p data-testid="mobile-clip-loading" className="m-note px-1 py-2 text-[11px] opacity-70">
        …
      </p>
    );
  }
  /** ⭐ The data has arrived and named no clip for this genre: say so, with the reason, instead of a spinner that never ends. */
  if (!clip) {
    return (
      <p data-testid="mobile-clip-missing" className="m-note px-1 py-2 text-[11px] opacity-70">
        {t("mobile_clip_missing")} — {unavailable ?? `no clip for ${genreIds[0]}`}
      </p>
    );
  }

  const label = comparing && compareGenreId ? `${genreId} ↔ ${compareGenreId}` : genreId;
  return (
    <div data-testid="mobile-clip-player" className="flex items-center gap-2 px-1 py-2">
      <audio
        ref={audioRef}
        src={cachedUrl ?? clip.url}
        preload="none"
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
      />
      <button
        type="button"
        data-testid="mobile-clip-play"
        aria-label={t("mobile_clip_play")}
        onClick={toggle}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-[rgb(var(--m-line-2))] text-sm"
      >
        {playing ? "❚❚" : "▶"}
      </button>
      {RATES.map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`mobile-clip-speed-${String(option).replace(".", "_")}`}
          aria-pressed={rate === option}
          onClick={() => setRate(option)}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded border text-[11px] ${
            rate === option ? "border-[rgb(var(--m-gold))] text-[rgb(var(--m-gold))]" : "border-[rgb(var(--m-line-2))] opacity-70"
          }`}
        >
          {option}×
        </button>
      ))}
      {compareGenreId && (
        <button
          type="button"
          data-testid="mobile-clip-compare"
          aria-pressed={comparing}
          onClick={() => setComparing((value) => !value)}
          className="inline-flex min-h-11 items-center justify-center rounded border border-[rgb(var(--m-line-2))] px-2 text-[11px]"
        >
          {t("mobile_clip_compare")}
        </button>
      )}
      <span data-testid="mobile-clip-status" className="truncate text-[11px] opacity-70">
        {label} · {rate}× · {t("mobile_clip_pitch_note")}
      </span>
    </div>
  );
}
