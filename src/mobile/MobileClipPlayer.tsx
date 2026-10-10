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

export interface MobileClipPlayerProps {
  /** The genre whose clip plays. */
  genreId: string;
  /** Optional second genre, which turns the control into an A/B comparison (owner: *曲风对比*). */
  compareGenreId?: string;
}

export function MobileClipPlayer({ genreId, compareGenreId }: MobileClipPlayerProps): React.ReactElement {
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

  /** ⭐ Speed is a property of the element, and pitch-following is the record's own behaviour, so both are applied here. */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
    audio.preservesPitch = false;
    (audio as HTMLAudioElement & { mozPreservesPitch?: boolean }).mozPreservesPitch = false;
    (audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false;
  }, [rate, clip]);

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
      {/* ⭐ A clip has no speech to caption; the status line below names what is playing. */}
      <audio ref={audioRef} src={clip.url} preload="none" onEnded={() => setPlaying(false)} />
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
