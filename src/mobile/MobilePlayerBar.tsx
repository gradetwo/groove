/**
 * The phone's player bar (M2).
 *
 * One row, above the module tab bar, showing what is playing and nothing else: a colour swatch, the
 * genre name, a monospace meta line, and a pause/play button. Tapping the row opens the genre's
 * detail page; tapping it again from the detail page (or the row's own chevron) is the M3 full-screen
 * player's job, so the row carries an explicit "open" affordance rather than pretending.
 *
 * Why it exists at all: the reference design has no player bar (every screen carries its own transport
 * buttons, and "now playing" lives in three separate globals), which means that on a phone the answer
 * to "what is playing, and how do I stop it" changes as you move between modules. One bar, one state,
 * one place to press stop.
 *
 * It is shown on 首页 only. The 即兴 module deliberately has none (it has its own transport and the user
 * asked for the bar to be removed there), and the other modules have no audio of their own yet.
 */
import React from "react";
import { Pause, Play, Repeat, Repeat1, Shuffle } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { ALL_GENRES } from "../data/genres";
import { CATEGORY_SWATCH } from "./screens/MobileHomeScreen";
import { PLAY_MODE_LABEL_KEYS, type PlayMode } from "./vinyl/vinylMath";

const MODE_ICONS: Record<PlayMode, React.ReactNode> = {
  one: <Repeat1 className="h-4 w-4" />,
  genre: <Repeat className="h-4 w-4" />,
  all: <Shuffle className="h-4 w-4" />,
};

export interface MobilePlayerBarProps {
  /** What is playing. Resolved here so the shell needs no second copy of "the current genre". */
  genreId: string | null;
  isPlaying: boolean;
  playMode: PlayMode;
  onToggle: () => void;
  onCycleMode: () => void;
  onOpen: () => void;
}

export function MobilePlayerBar({
  genreId,
  isPlaying,
  playMode,
  onToggle,
  onCycleMode,
  onOpen,
}: MobilePlayerBarProps) {
  const { t } = useLanguage();
  const genre = ALL_GENRES.find((item) => item.id === genreId);
  // A genre that vanished from the library (an old share link, a custom genre that was deleted) must
  // not leave a bar with no name on it.
  if (!genre) return null;
  return (
    <div
      data-testid="mobile-player-bar"
      data-genre={genre.id}
      className="m-rise fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-1/2 z-20 w-[calc(100%-16px)] max-w-[416px] -translate-x-1/2"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[rgba(20,17,11,0.94)] p-2.5 backdrop-blur-md">
        {/* Left button: the mode cycle (the user's spec colour-codes the *bar's* left control). */}
        <button
          type="button"
          data-testid="mobile-player-mode"
          aria-label={t(PLAY_MODE_LABEL_KEYS[playMode])}
          onClick={onCycleMode}
          className="m-press flex h-12 w-12 flex-none items-center justify-center rounded-full text-[var(--m-gold)]"
        >
          {MODE_ICONS[playMode]}
        </button>

        <button
          type="button"
          data-testid="mobile-player-open"
          onClick={onOpen}
          aria-label={t("mobile_player_open")}
          className="m-press flex min-h-[46px] min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            aria-hidden="true"
            className="h-9 w-9 flex-none rounded-xl"
            style={{ background: CATEGORY_SWATCH[genre.category] }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-bold leading-tight">{genre.name}</span>
            <span className="m-mono block truncate text-[10px] text-[var(--m-ink-3)]">
              {genre.default_bpm} BPM · {genre.category}
            </span>
          </span>
        </button>

        <button
          type="button"
          data-testid="mobile-player-toggle"
          aria-pressed={isPlaying}
          aria-label={isPlaying ? t("mobile_player_pause") : t("mobile_player_play")}
          onClick={onToggle}
          className="m-press flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[var(--m-gold)] text-[var(--m-on-gold)]"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
