/**
 * The full-screen phone player (M3).
 *
 * Look, animation and interaction follow `player2.html`: a canvas vinyl with a tonearm that swings in
 * when playback starts, everything derived from the audio clock (never a CSS rotation), and the
 * tempo/level decoration driven by the transport. Three interactions are the user's spec rather than
 * the reference's:
 *
 *  - the **down chevron** at the top left collapses back to the player bar;
 *  - **tapping the record** switches to that genre's detail page and tapping again comes back
 *    (the NetEase "show lyrics" toggle);
 *  - the **mode button** cycles 单曲循环 → 大曲风内循环 → 全部随机, and the mode decides what the
 *    previous/next buttons pick.
 *
 * The drawer exists because the user asked for the player-bar content to be hidden behind one: the
 * progress and the genre's facts live in a panel that slides up from the bottom, so the screen itself
 * is the record and three controls.
 */
import React, { useMemo, useState } from "react";
import { ChevronDown, ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { patternFromGenre } from "../../data/genreMix";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre } from "../../types/genre";
import { CATEGORY_SWATCH } from "./MobileHomeScreen";
import { VinylCanvas, type VinylClock } from "../vinyl/VinylCanvas";
import { loopProgress, PLAY_MODE_LABEL_KEYS, type PlayMode } from "../vinyl/vinylMath";

const MODE_ICONS: Record<PlayMode, React.ReactNode> = {
  one: <Repeat1 className="h-4 w-4" />,
  genre: <Repeat className="h-4 w-4" />,
  all: <Shuffle className="h-4 w-4" />,
};

export interface MobilePlayerScreenProps {
  genreId: string;
  /** Applied to the engine by the shell; the jog and the ± buttons both report through it. */
  onTempo?: (bpm: number) => void;
  isPlaying: boolean;
  playMode: PlayMode;
  readClock: () => VinylClock | null;
  onTogglePlay: (genre: Genre) => void;
  onCycleMode: () => void;
  onSkip: (direction: 1 | -1) => void;
  onCollapse: () => void;
  onOpenDetail: (genreId: string) => void;
}

export function MobilePlayerScreen({
  genreId,
  onTempo,
  isPlaying,
  playMode,
  readClock,
  onTogglePlay,
  onCycleMode,
  onSkip,
  onCollapse,
  onOpenDetail,
}: MobilePlayerScreenProps) {
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const genre = ALL_GENRES.find((item) => item.id === genreId);
  /**
   * The tempo the record is playing at.
   *
   * Seeded from the genre and moved by the jog (drag the record) and by the ± buttons. Clamped to the
   * engine's own 60-180 range, and reported on every change so what is heard matches what is shown.
   */
  const [bpm, setBpm] = useState(() => genre?.default_bpm ?? 120);
  const changeBpm = React.useCallback(
    (delta: number) => {
      setBpm((current) => {
        const next = Math.min(180, Math.max(60, Math.round(current + delta)));
        if (next !== current) onTempo?.(next);
        return next;
      });
    },
    [onTempo]
  );

  /** The lane dots the record shows: the genre's real step pattern, four lanes. */
  const lanes = useMemo(() => {
    if (!genre) return [] as boolean[][];
    const pattern = patternFromGenre(genre);
    const wanted = ["kick", "snare", "hihat", "bass"];
    return wanted.map((role) => {
      const track = pattern.tracks.find((item) => item.track_id === role) ?? pattern.tracks[0];
      const steps = track?.steps ?? [];
      return Array.from({ length: 16 }, (_, index) => Boolean(steps[index % Math.max(1, steps.length)]));
    });
  }, [genre]);

  /**
   * Progress is sampled on its own timer rather than from the canvas loop: the canvas must not drive
   * React state at 60 fps, and a 4 Hz readout is all a progress bar needs.
   */
  React.useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      const clock = readClock();
      if (clock) setProgress(loopProgress(clock.step, clock.fraction, genre?.sequencer_pattern?.totalSteps || 16));
    }, 250);
    return () => window.clearInterval(id);
  }, [genre, isPlaying, readClock]);

  if (!genre) {
    return (
      <div className="m-rise flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6" data-testid="mobile-player-missing">
        <p className="text-[13px] text-[var(--m-ink-2)]">{t("mobile_detail_missing")}</p>
        <button
          type="button"
          data-testid="mobile-player-collapse"
          onClick={onCollapse}
          className="m-press m-mono min-h-[46px] rounded-full border border-[var(--m-line-2)] px-4 text-[11px] text-[var(--m-gold)]"
        >
          {t("mobile_back")}
        </button>
      </div>
    );
  }

  const accent = CATEGORY_SWATCH[genre.category];

  return (
    <section className="m-rise relative flex min-h-[78dvh] flex-col items-center px-4 pt-1" data-testid="mobile-player" data-genre={genre.id}>
      <header className="flex w-full items-center justify-between">
        <button
          type="button"
          data-testid="mobile-player-collapse"
          aria-label={t("mobile_player_collapse")}
          onClick={onCollapse}
          className="m-press flex h-12 w-12 items-center justify-center rounded-full text-[var(--m-ink-2)]"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
        <span className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
          {t("mobile_player_now")}
        </span>
        <button
          type="button"
          data-testid="mobile-player-mode"
          aria-label={t(PLAY_MODE_LABEL_KEYS[playMode])}
          onClick={onCycleMode}
          className="m-press m-mono flex h-11 items-center gap-1.5 rounded-full px-3 text-[10px] text-[var(--m-gold)]"
        >
          {MODE_ICONS[playMode]}
        </button>
      </header>

      {/* Tapping the record is the NetEase "lyrics" toggle: it opens the genre's page, and tapping
          again (or the back control there) returns to the record. */}
      <button
        type="button"
        data-testid="mobile-player-record"
        aria-label={t("mobile_genre_open_detail")}
        onClick={() => onOpenDetail(genre.id)}
        className="m-press mt-1 flex flex-col items-center"
      >
        <VinylCanvas
          playing={isPlaying}
          readClock={readClock}
          onScrub={changeBpm}
          onScrubEnd={(flickDelta) => changeBpm(flickDelta)}
          lanes={lanes}
          accent={accent}
          title={genre.name}
          subtitle={genre.category}
          totalSteps={genre.sequencer_pattern?.totalSteps || 16}
        />
      </button>

      <div className="mt-2 w-full text-center">
        <h1 className="truncate text-[19px] font-bold">{genre.name}</h1>
        <p className="m-mono mt-1 text-[10px] text-[var(--m-ink-3)]">
          {genre.category} · <span data-testid="mobile-player-bpm">{bpm} BPM</span> ·{" "}
          {t(PLAY_MODE_LABEL_KEYS[playMode])}
        </p>
        {/* The reference's drag hint, kept because the jog is invisible until someone tells you. */}
        <p className="m-mono mt-1 text-[9px] text-[var(--m-ink-3)]" data-testid="mobile-player-scrub-hint">
          {t("mobile_player_scrub_hint")}
        </p>
      </div>

      {/* Progress rail: thin, amber, and read from the same clock as the disc. */}
      <div className="mt-4 w-full">
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-[rgba(232,232,255,0.12)]">
          <div
            data-testid="mobile-player-progress"
            className="h-full rounded-full bg-[var(--m-gold)] transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-center gap-3">
          <button
            type="button"
            data-testid="mobile-player-bpm-down"
            aria-label={`${t("mobile_jam_bpm")} -2`}
            onClick={() => changeBpm(-2)}
            className="m-press m-mono flex h-12 w-12 items-center justify-center rounded-full border border-[var(--m-line-2)] text-[var(--m-ink)]"
          >
            −
          </button>
          <span className="m-mono min-w-[64px] text-center text-[13px] text-[var(--m-gold)]" data-testid="mobile-player-bpm-value">
            {bpm} <span className="text-[8px] tracking-[0.14em] text-[var(--m-ink-3)]">BPM</span>
          </span>
          <button
            type="button"
            data-testid="mobile-player-bpm-up"
            aria-label={`${t("mobile_jam_bpm")} +2`}
            onClick={() => changeBpm(2)}
            className="m-press m-mono flex h-12 w-12 items-center justify-center rounded-full border border-[var(--m-line-2)] text-[var(--m-ink)]"
          >
            +
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            data-testid="mobile-player-skip-back"
            aria-label={t("mobile_back")}
            onClick={() => onSkip(-1)}
            className="m-press flex h-12 w-12 items-center justify-center rounded-full text-[var(--m-ink)]"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            type="button"
            data-testid="mobile-player-play"
            aria-pressed={isPlaying}
            aria-label={isPlaying ? t("mobile_player_pause") : t("mobile_player_play")}
            onClick={() => onTogglePlay(genre)}
            className="m-press flex h-16 w-16 items-center justify-center rounded-full bg-[var(--m-gold)] text-[var(--m-on-gold)]"
          >
            {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </button>
          <button
            type="button"
            data-testid="mobile-player-skip-forward"
            aria-label={t("mobile_player_open")}
            onClick={() => onSkip(1)}
            className="m-press flex h-12 w-12 items-center justify-center rounded-full text-[var(--m-ink)]"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Drawer: the player-bar content (facts, mode, list entry) lives here, not on the record. */}
      <div className="mt-3 w-full" data-testid="mobile-player-drawer">
        <button
          type="button"
          data-testid="mobile-player-drawer-toggle"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((open) => !open)}
          className="m-press m-mono mx-auto flex h-6 w-24 items-center justify-center rounded-full text-[10px] text-[var(--m-ink-3)]"
        >
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-[rgba(232,232,255,0.22)]" />
        </button>
        {drawerOpen && (
          <dl
            data-testid="mobile-player-drawer-panel"
            className="m-rise mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-3.5 text-left"
          >
            <Fact label={t("mobile_detail_origin")} value={genre.origin_year} />
            <Fact label={t("mobile_detail_bpm_range")} value={genre.bpm_range} />
            <Fact label={t("mobile_detail_time_signature")} value={genre.time_signature} />
            <Fact label={t("mobile_player_mode_one")} value={t(PLAY_MODE_LABEL_KEYS[playMode])} />
            <button
              type="button"
              data-testid="mobile-player-drawer-detail"
              onClick={() => onOpenDetail(genre.id)}
              className="m-press m-mono col-span-2 mt-1 flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[var(--m-line-2)] text-[11px] text-[var(--m-gold)]"
            >
              <ListMusic className="h-4 w-4" />
              {t("mobile_genre_open_detail")}
            </button>
          </dl>
        )}
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="m-mono text-[9px] uppercase tracking-[0.18em] text-[var(--m-ink-3)]">{label}</dt>
      <dd className="mt-0.5 text-[12px] text-[var(--m-ink)]">{value}</dd>
    </div>
  );
}
