import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { clipForGenre, readClipManifest, staleClips, type GenreClip } from "../data/genreClips";
import { ClipPrefetch, prefetchClipForGenre, whenIdle } from "./clipPrefetch";

/** Re-exported for the tests that drive the cache directly; the implementation moved to `./clipPrefetch`. */
export { ClipPrefetch, type ClipPrefetchOptions } from "./clipPrefetch";

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

export interface MobileClipPlayerProps {
  /** The genre whose clip plays. */
  genreId: string;
  /**
   * The genre that plays after this one, when the shell knows it — the queue moves with `nextGenreForMode`.
   * Warming its clip during this record is what makes an advance a cache hit instead of ~400 KB of silence.
   */
  upNextGenreId?: string | null;
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
  /**
   * ⭐ **The element could not produce sound, so the host must stop saying it does.**
   *
   * `autoPlay`'s comment above assumes the `play()` is inside the gesture that asked for it. It is not: the call happens
   * in an effect, after the clip manifest resolves, so iOS can refuse it with `NotAllowedError`, and a clip whose URL
   * 404s fails the same way. Until this callback existed the only reaction was this component's own `playing` state —
   * which nothing outside it reads — so the shell's `clipGenreId` stayed set and the record, the bottom bar and the timer
   * all reported a playback that was not happening (owner, 2026-10-13). The host clears its playing state on this.
   */
  onPlayFailed?: (reason: string) => void;
}

export function MobileClipPlayer({
  genreId,
  upNextGenreId,
  compareGenreId,
  autoPlay = false,
  onAudioRef,
  onEnded,
  onPlayFailed,
}: MobileClipPlayerProps): React.ReactElement {
  const { t } = useLanguage();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /**
   * The clip URL whose refusal has already been reported to the host, so the two attempt paths (the autoplay effect and
   * `toggle`) cannot report the same clip twice.
   */
  const refusedPlayFor = useRef<string | null>(null);
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

  /**
   * ⭐ **The app-wide cache, not a per-mount one**, because the up-next warm-up writes into it too: a genre prefetched
   * while the previous record played has to be found here as a cache hit, which is the whole point of it. It is created
   * once by the module and never disposed by a component — disposing it would revoke the blobs another player is using.
   */
  const prefetch = ClipPrefetch.forApp();
  const [cachedUrl, setCachedUrl] = useState<string | undefined>(undefined);

  /**
   * The rail reports the element's own position, and a reading only counts for the clip it came from — so selecting
   * another clip shows zero without an effect to reset it (an effect on the render path would clobber a position the
   * element has just reported).
   */
  const [position, setPosition] = useState<{ url: string; current: number; duration: number }>({
    url: "",
    current: 0,
    duration: 0,
  });
  const railUrl = clip?.url ?? "";
  const railCurrent = position.url === railUrl ? position.current : 0;
  const railDuration =
    position.url === railUrl && position.duration > 0 && Number.isFinite(position.duration) ? position.duration : 0;
  const railRatio = railDuration ? Math.min(1, Math.max(0, railCurrent / railDuration)) : 0;
  const readPosition = useCallback((audio: HTMLAudioElement, url: string) => {
    setPosition({ url, current: audio.currentTime, duration: audio.duration });
  }, []);
  const seekToRatio = useCallback((audio: HTMLAudioElement, next: number, url: string) => {
    const total = audio.duration > 0 && Number.isFinite(audio.duration) ? audio.duration : 0;
    if (!total) return;
    audio.currentTime = Math.min(total, Math.max(0, next * total));
    // Read the element straight back: a press on the rail applies now, not when `seeked` arrives.
    setPosition({ url, current: audio.currentTime, duration: total });
  }, []);

  /**
   * ⭐ **Prefetch the clip that is next to play, off the critical path.** This is the natural hook point: the selected clip
   * changes, so the bytes it will need are known before the gesture that asks for them. Only this one clip is fetched —
   * never the manifest's whole list, and never every mounted element, which is how 400 KB per genre would become 400 KB
   * times the library.
   *
   * The prefetch is scheduled in an idle callback (a macrotask where there is none) and the element keeps `preload="none"`:
   * the media element is not what pays for this, and if the fetch fails or arrives late, the component plays the clip's
   * own URL exactly as before.
   *
   * ⭐ **The double download this closes** (measured 2026-10-12, `scratch/verify-live-phone.mjs`: the same clip requested
   * twice): press play quickly and the element starts its own fetch of `clip.url` before the prefetch has. Then the
   * prefetch is skipped outright, and if it was already in flight when the element's load began, its blob is released
   * rather than swapped in — swapping `src` mid-load restarts the media pipeline for bytes the element is already
   * fetching, and the download has been paid for either way.
   */
  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    const cancelIdle = whenIdle(() => {
      const element = audioRef.current;
      void prefetch.load(clip.url, { element, url: clip.url }).then((objectUrl) => {
        if (!objectUrl) return; // skipped because the element is already loading it, or the fetch failed
        if (cancelled) {
          prefetch.release(clip.url);
          return;
        }
        const current = audioRef.current;
        if (current && current.networkState === HTMLMediaElement.NETWORK_LOADING) {
          prefetch.release(clip.url, current.src);
          return;
        }
        setCachedUrl(objectUrl);
      });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [clip, prefetch]);

  /** A different clip's blob must never be the element's source, so the pointer clears when the selection moves. */
  useEffect(() => () => setCachedUrl(undefined), [prefetch, clip]);

  /**
   * ⭐ **A warm-up for the record after this one, which `prefetchClipForGenre` has already put in the shared cache.**
   *
   * The effect above only ever fetched the clip in front of you, so an advance — the record ending and the queue moving
   * — pulled the next clip over the network at the moment it was needed, and every switch paid that silence first
   * (owner, 2026-10-13). Warming it during this record turns the advance into a cache hit. Scheduled when idle and
   * never awaited: a late or failed warm-up costs nothing, because the element falls back to `clip.url` as it always did.
   */
  useEffect(() => {
    if (!upNextGenreId || !clips || upNextGenreId === genreId) return;
    return prefetchClipForGenre({ clips }, upNextGenreId);
  }, [upNextGenreId, genreId, clips]);

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

  /**
   * ⭐ **A `play()` the browser refused is reported to the host, once per clip.**
   *
   * The element is asked to play from an effect (above) and from `toggle` — both outside the gesture that asked for the
   * sound, which on iOS is a `NotAllowedError`; a clip URL that 404s fails the same way. This component's own `playing`
   * state is private to it, so without this report the host's `clipGenreId` keeps the record, the bottom bar and the
   * elapsed timer saying "playing" over silence, with nothing on screen to say otherwise (owner, 2026-10-13).
   *
   * Reported straight from the rejection rather than from a `paused` watcher: a ref is not a render, so an effect keyed
   * on one would never run, and `paused` is also true in the moment before a legitimate start.
   */
  const reportRefused = useCallback(
    (audio: HTMLAudioElement) => {
      setPlaying(false);
      const url = clip?.url ?? "";
      if (refusedPlayFor.current === url) return;
      refusedPlayFor.current = url;
      onPlayFailed?.(audio.error ? `the clip could not be loaded (code ${audio.error.code})` : "the browser refused to start playback");
    },
    [clip, onPlayFailed]
  );

  useEffect(() => {
    if (!autoPlay) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    // Starting from the top is itself a position: show it now, without waiting for the element to report one.
    setPosition({ url: clip?.url ?? "", current: 0, duration: audio.duration });
    void audio.play().then(() => setPlaying(true)).catch(() => reportRefused(audio));
  }, [autoPlay, clip, reportRefused]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setPlaying(true)).catch(() => reportRefused(audio));
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [reportRefused]);

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
        onTimeUpdate={(event) => readPosition(event.currentTarget, railUrl)}
        onLoadedMetadata={(event) => readPosition(event.currentTarget, railUrl)}
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
      <div
        role="progressbar"
        aria-label="clip position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(railRatio * 100)}
        data-testid="mobile-clip-progress"
        tabIndex={0}
        className="relative h-11 min-w-[72px] flex-1 cursor-pointer"
        onClick={(event) => {
          const audio = audioRef.current;
          if (!audio) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width) return;
          seekToRatio(audio, (event.clientX - rect.left) / rect.width, railUrl);
        }}
        onKeyDown={(event) => {
          const audio = audioRef.current;
          if (!audio) return;
          if (event.key === "ArrowLeft") { event.preventDefault(); seekToRatio(audio, railRatio - 0.05, railUrl); }
          else if (event.key === "ArrowRight") { event.preventDefault(); seekToRatio(audio, railRatio + 0.05, railUrl); }
          else if (event.key === "Home") { event.preventDefault(); seekToRatio(audio, 0, railUrl); }
          else if (event.key === "End") { event.preventDefault(); seekToRatio(audio, 1, railUrl); }
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded bg-[rgb(var(--m-line-2))]" />
        <div
          data-testid="mobile-clip-progress-fill"
          className="pointer-events-none absolute left-0 top-1/2 h-[3px] w-full origin-left -translate-y-1/2 rounded bg-[rgb(var(--m-gold))]"
          style={{ transform: `scaleX(${railRatio})` }}
        />
      </div>
      <span data-testid="mobile-clip-status" className="truncate text-[11px] opacity-70">
        {label} · {rate}× · {t("mobile_clip_pitch_note")}
      </span>
    </div>
  );
}
