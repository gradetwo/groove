/**
 * The phone's player bar (M2).
 *
 * One row, above the module tab bar, saying what is playing and offering the three things a thumb wants
 * without leaving the page: change the play mode, play/pause, and open the full player.
 *
 * ## What changed, and why
 *
 * The first version was a dark card with a filled accent circle for play/pause and no sense of position.
 * The user's verdict was "太丑陋", plus a precise objection: **a play/pause button already differs by its
 * icon**, so filling it with the accent colour adds a second, louder signal for something the glyph
 * already says — and it made the bar read as a warning light rather than a transport. So:
 *
 *  - the play/pause control is an **icon only** now: ink on the card, no fill, no glow, no pulse;
 *  - the artwork is a real rounded thumbnail (the genre's own cover, over the category colour while it
 *    loads) with a hairline ring, instead of a flat colour chip;
 *  - a **progress rail** shows where the loop is, read from the same transport clock the record uses, so
 *    the bar answers "how far in am I" — the one thing it could not say before;
 *  - the row is one tappable area (artwork + name + rail + chevron) with the two buttons as siblings, so
 *    the tap targets stay separate and the whole thing does not read as a stack of controls;
 *  - the mode button keeps the reference's "engaged" pip when the mode is not the single-repeat default,
 *    which is information the icon alone cannot carry.
 *
 * ## Why it exists at all
 *
 * The reference design has no player bar (every screen carries its own transport, and "now playing" lives
 * in three separate globals), which means that on a phone the answer to "what is playing, and how do I
 * stop it" changes as you move between modules. One bar, one state, one place to press stop.
 *
 * It is shown on 首页 only. 即兴 deliberately has none (it has its own transport and the user asked for
 * the bar to be removed there), and the other modules have no audio of their own yet.
 */
import React, { useEffect, useRef } from "react";
import { ChevronRight, Pause, Play, Repeat, Repeat1, Shuffle } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { ALL_GENRES } from "../data/genres";
import { genreCoverUrl } from "./genreArt";
import { CATEGORY_SWATCH } from "./screens/MobileHomeScreen";
import { loopProgress, PLAY_MODE_LABEL_KEYS, type PlayMode } from "./vinyl/vinylMath";
import type { VinylClock } from "./vinyl/VinylCanvas";

const MODE_ICONS: Record<PlayMode, React.ReactNode> = {
  one: <Repeat1 className="h-[18px] w-[18px]" />,
  genre: <Repeat className="h-[18px] w-[18px]" />,
  all: <Shuffle className="h-[18px] w-[18px]" />,
};

export interface MobilePlayerBarProps {
  /** What is playing. Resolved here so the shell needs no second copy of "the current genre". */
  genreId: string | null;
  isPlaying: boolean;
  /** When the module bar is on screen the bar floats above it; on a full-screen page it sits at the
      bottom edge (plus the safe area). */
  aboveTabBar?: boolean;
  playMode: PlayMode;
  /** The transport clock, for the progress rail. Omitted (or null) leaves the rail empty. */
  readClock?: () => VinylClock | null;
  /** The engine's live tempo, so the bar cannot disagree with what is playing. */
  readTempo?: () => number | null;
  totalSteps?: number;
  onToggle: () => void;
  onCycleMode: () => void;
  onOpen: () => void;
}

export function MobilePlayerBar({
  genreId,
  isPlaying,
  aboveTabBar = true,
  playMode,
  readClock,
  readTempo,
  totalSteps = 16,
  onToggle,
  onCycleMode,
  onOpen,
}: MobilePlayerBarProps) {
  const { t } = useLanguage();
  const progressRef = useRef<HTMLSpanElement | null>(null);
  /** The meta line's tempo, written by the same interval as the rail. */
  const tempoRef = useRef<HTMLSpanElement | null>(null);
  const genre = ALL_GENRES.find((item) => item.id === genreId);

  /**
   * The rail is written straight to the DOM, at the 5 Hz a bar this size can justify.
   *
   * Not React state: a progress bar that re-rendered the shell five times a second would re-run the
   * module's own effects for a decoration. It reads the same clock the record does, so the rail and the
   * disc cannot disagree.
   */
  useEffect(() => {
    if (!isPlaying || !readClock) return;
    const write = () => {
      const clock = readClock();
      if (clock && progressRef.current) {
        progressRef.current.style.width = `${(loopProgress(clock.step, clock.fraction, totalSteps) * 100).toFixed(2)}%`;
      }
      /**
       * The tempo comes from the engine rather than from the genre's declared default.
       *
       * The declared value was the bug the user reported: jog the tempo (or let the queue skip to the
       * next genre) and the bar kept printing the number from the data file. The engine is the only
       * thing that knows what is playing.
       */
      const live = readTempo?.();
      if (tempoRef.current && typeof live === "number" && Number.isFinite(live)) {
        tempoRef.current.textContent = String(Math.round(live));
      }
    };
    write();
    const id = window.setInterval(write, 200);
    return () => window.clearInterval(id);
  }, [isPlaying, readClock, readTempo, totalSteps]);

  // A genre that vanished from the library (an old share link, a custom genre that was deleted) must
  // not leave a bar with no name on it.
  if (!genre) return null;

  const accent = CATEGORY_SWATCH[genre.category];

  return (
    <div
      data-testid="mobile-player-bar"
      data-genre={genre.id}
      className={`m-rise fixed left-1/2 z-20 w-[calc(100%-16px)] max-w-[416px] -translate-x-1/2 ${
        aboveTabBar ? "bottom-[calc(56px+env(safe-area-inset-bottom))]" : "bottom-[env(safe-area-inset-bottom)]"
      }`}
    >
      {/*
        `m-player-bar-plate` is a *stable* hook for the skins.

        They used to target the bar's ground by its literal utility (`[class~="bg-[rgba(20,20,31,0.94)]"]`),
        so the day this class's alpha changed from 0.94 to 0.9 the comic skin's paper override silently
        stopped matching and the minimised bar went back to a dark plate under dark ink — the user found
        it before any gate did. A named class cannot drift like that.
      */}
      <div className="m-player-bar-plate flex items-center gap-1 rounded-[22px] border border-[var(--m-line)] bg-[rgba(20,20,31,0.9)] py-2 pl-2 pr-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        {/* The mode cycle: the reference's "left button", with a pip when it is not the default. */}
        <button
          type="button"
          data-testid="mobile-player-mode"
          aria-label={t(PLAY_MODE_LABEL_KEYS[playMode])}
          onClick={onCycleMode}
          className="m-press relative flex h-11 w-11 flex-none flex-col items-center justify-center rounded-full text-[var(--m-ink-2)]"
        >
          {MODE_ICONS[playMode]}
          {playMode !== "one" && (
            <span aria-hidden="true" className="absolute bottom-[9px] h-[3px] w-[3px] rounded-full bg-[var(--m-gold)]" />
          )}
        </button>

        {/* One area: artwork, name, meta and the progress rail. Tapping it opens the full player. */}
        <button
          type="button"
          data-testid="mobile-player-open"
          onClick={onOpen}
          aria-label={t("mobile_player_open")}
          className="m-press flex min-h-[46px] min-w-0 flex-1 items-center gap-2.5 px-0.5 text-left"
        >
          <span
            aria-hidden="true"
            className="relative h-10 w-10 flex-none overflow-hidden rounded-[13px] ring-1 ring-[rgba(232,232,255,0.14)]"
            style={{ background: accent }}
          >
            {/* The genre's own cover when one is on disk, over the category colour while it loads. */}
            <img
              src={genreCoverUrl(genre.id)}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold leading-tight">{genre.name}</span>
            <span className="relative mt-1.5 block h-[3px] w-full overflow-hidden rounded-full bg-[rgba(232,232,255,0.14)]">
              <span
                ref={progressRef}
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-0 rounded-full bg-[var(--m-gold)]"
              />
            </span>
            <span className="m-mono mt-1 block truncate text-[9px] leading-none tracking-[0.14em] text-[var(--m-ink-3)]">
              {/* The engine's tempo when there is one, the genre's own default before that. */}
              <span ref={tempoRef}>{genre.default_bpm}</span> BPM · {genre.category}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-none text-[var(--m-ink-3)]" />
        </button>

        {/*
          Play/pause: the glyph is the signal.
          
          Deliberately *not* an accent-filled circle — see the file header. Still a 48 px tap target, with
          the press feedback coming from the shell's `.m-press` and nothing else.
        */}
        <button
          type="button"
          data-testid="mobile-player-toggle"
          aria-pressed={isPlaying}
          aria-label={isPlaying ? t("mobile_player_pause") : t("mobile_player_play")}
          onClick={onToggle}
          className="m-press flex h-12 w-11 flex-none items-center justify-center rounded-full text-[var(--m-ink)]"
        >
          {isPlaying ? (
            <Pause className="h-[18px] w-[18px]" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-[18px] w-[18px]" fill="currentColor" />
          )}
        </button>
      </div>
    </div>
  );
}
