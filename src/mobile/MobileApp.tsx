/**
 * The phone shell (M-series, `PRODUCT_PLAN_v2.1.0.md` §M).
 *
 * A separate surface from the desktop app: five modules at the bottom, each phone-shaped, sharing one
 * visual language (dark brown ground, one amber accent, monospace numerals). It is reached by its own
 * route (`/m/<module>`, see `src/app/router.tsx`), which is deliberate during the rebuild — the
 * existing phone UI keeps working and keeps being tested while the new one is built up module by
 * module. When every module here is real, the old phone shell is deleted and this becomes the phone
 * application.
 *
 * What this file owns: the frame (ground, gold glow, safe areas, scroll container) and the routing of
 * a module id to a screen. What it does not own: any audio authoring, any genre data.
 */
import React, { Suspense, useCallback, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useGenreAudition } from "../hooks/useGenreAudition";
import { MobileModuleTabBar } from "./MobileModuleTabBar";
import { MobilePlayerBar } from "./MobilePlayerBar";
import { MOBILE_MODULE_PLAN_KEYS, type MobileModule } from "./mobileModules";
import { ALL_GENRES } from "../data/genres";
import { nextGenreForMode, nextPlayMode, normalisePlayMode, type PlayMode } from "./vinyl/vinylMath";
import type { Genre } from "../types/genre";
import "./mobile.css";
/**
 * The skins.
 *
 * Imported *here* rather than from the app entry, and that is the scope decision: only the phone shell
 * wears a skin today, so a desktop visit does not download three stylesheets it will never apply. The
 * moment a skin covers the desktop too, this import moves to `main.tsx` — the CSS itself is already
 * scoped to `:root[data-skin]`, so nothing else would have to change.
 */
import "./skins/minimal.css";
import "./skins/comic.css";
import "./skins/soviet.css";
import "./skins/sovietYears.css";
import "./skins/pixel.css";
/**
 * The reused desktop views (探索) wear the active skin too.
 *
 * The three skin sheets deliberately withdraw from `[data-legacy="desktop"]`; this sheet puts the
 * skin's palette back over that markup without re-applying their decorative passes. Imported after
 * the three of them so it wins the equal-specificity opt-outs.
 *
 * Named `legacySkin.css`, not `legacyViews.css`: there is a *layout* sheet of that name one directory
 * up (`./legacyViews.css`), and two files with one basename in one shell is how the next person edits
 * the wrong one.
 */
import "./skins/legacySkin.css";
/**
 * The panels 更多 opens (更新记录 / 设置 / 手册 / 搜索) wear the skin too.
 *
 * Imported *here*, not from `App.tsx` where those panels are mounted: the initial route has a hard bundle
 * budget and this sheet is phone-only, so it belongs in the shell's own chunk. The scoping (`.m-panels`)
 * does not care which module loads the file — only that it is loaded by the time a phone can open a panel,
 * which is exactly when this chunk is.
 */
import "./skins/panelSkin.css";
/**
 * The phone layout pass over the reused desktop views (探索).
 *
 * Imported last so a same-specificity rule of ours wins, and scoped to `.mobile-root
 * [data-legacy="desktop"]` so nothing here can restyle the desktop app.
 */
import "./legacyViews.css";

const MobileHomeScreen = React.lazy(() =>
  import("./screens/MobileHomeScreen").then((m) => ({ default: m.MobileHomeScreen }))
);
const MobileGenreDetailScreen = React.lazy(() =>
  import("./screens/MobileGenreDetailScreen").then((m) => ({ default: m.MobileGenreDetailScreen }))
);
const MobilePlayerScreen = React.lazy(() =>
  import("./screens/MobilePlayerScreen").then((m) => ({ default: m.MobilePlayerScreen }))
);
const MobileJamScreen = React.lazy(() =>
  import("./screens/MobileJamScreen").then((m) => ({ default: m.MobileJamScreen }))
);
const MobileChallengeScreen = React.lazy(() =>
  import("./screens/MobileChallengeScreen").then((m) => ({ default: m.MobileChallengeScreen }))
);
const MobileExploreScreen = React.lazy(() =>
  import("./screens/MobileExploreScreen").then((m) => ({ default: m.MobileExploreScreen }))
);
const MobileMoreScreen = React.lazy(() =>
  import("./screens/MobileMoreScreen").then((m) => ({ default: m.MobileMoreScreen }))
);

/** Where the play mode is remembered between sessions. */
export const MOBILE_PLAY_MODE_KEY = "groove_mobile_play_mode";

export interface MobileAppProps {
  module: MobileModule;
  /** Show the full-screen player (`/m/home?player=1&genre=`). */
  mobilePlayer?: boolean;
  genreId?: string;
  onSelectModule: (module: MobileModule) => void;
  /** Navigate to a genre's detail page (`/m/home?genre=`). */
  onOpenGenre?: (genreId: string) => void;
  /** Leave the shell for the module that owns a genre's editable surface. */
  onOpenJam?: (genreId: string) => void;
  onCloseGenre?: () => void;
  /** Expand the player bar into the full-screen player, and collapse it back. */
  onOpenPlayer?: (genreId: string) => void;
  onCollapsePlayer?: () => void;
  /** The panels the 更多 module opens; they live in App, not in the shell. */
  onOpenSettings?: () => void;
  onOpenUpdates?: () => void;
  onOpenHelp?: () => void;
  onOpenSearch?: () => void;
}

export function MobileApp({
  module,
  mobilePlayer,
  genreId,
  onSelectModule,
  onOpenGenre,
  onOpenJam,
  onCloseGenre,
  onOpenPlayer,
  onCollapsePlayer,
  onOpenSettings,
  onOpenUpdates,
  onOpenHelp,
  onOpenSearch,
}: MobileAppProps) {
  const { t } = useLanguage();

  /**
   * One audition engine for the whole shell.
   *
   * The hook used to live inside the home screen, which was fine while the home screen was the only
   * thing playing audio. The player bar has to show and stop the same sound, and two instances of the
   * hook mean two engines — so the state is lifted here and passed down, and the bar reads it.
   */
  const { playingGenreId, toggleAudition, stopAudition, readClock, applyPattern, setTempo, setSwingValue,
    startVinylScrub,
    stopVinylScrub,
    auditionTrack,
    readTempo } =
    useGenreAudition();

  /**
   * The play mode is the shell's, not the screen's: the bar's left button and the full-screen player
   * cycle the same value, and it survives a reload (a mode that resets every visit is a mode the user
   * has to set again every visit).
   */
  const [playMode, setPlayMode] = useState<PlayMode>(() => {
    try {
      return normalisePlayMode(localStorage.getItem(MOBILE_PLAY_MODE_KEY));
    } catch {
      return "one";
    }
  });
  const cyclePlayMode = useCallback(() => {
    setPlayMode((current) => {
      const next = nextPlayMode(current);
      try {
        localStorage.setItem(MOBILE_PLAY_MODE_KEY, next);
      } catch {
        /* private mode: the mode simply does not persist */
      }
      return next;
    });
  }, []);

  /**
   * Previous/next follow the mode: the same genre on `one`, the same category on `genre`, the whole
   * library on `all`. Continuous auto-advance when a pattern ends is deferred to the module that owns
   * the transport (M4) — the mode already governs the queue here, and pretending otherwise would be a
   * control that does nothing.
   */
  const skip = useCallback(
    (direction: 1 | -1) => {
      const from = genreId ?? playingGenreId;
      if (!from) return;
      const nextId = nextGenreForMode(playMode, from, ALL_GENRES, direction);
      const genre = ALL_GENRES.find((item) => item.id === nextId);
      if (!genre) return;
      stopAudition();
      void toggleAudition(genre);
      if (mobilePlayer) onOpenPlayer?.(genre.id);
    },
    [genreId, mobilePlayer, onOpenPlayer, playMode, playingGenreId, stopAudition, toggleAudition]
  );

  /**
   * Switch the record to another genre *without* leaving the player — the pull-down list's action.
   *
   * Deliberately not `openGenreAndPlay`: that one opens the genre's page, which is right from the
   * library and wrong from inside the player (the whole point of the list is to stay on the record).
   */
  const playGenreInPlayer = useCallback(
    (genre: Genre) => {
      if (playingGenreId === genre.id) return;
      stopAudition();
      void toggleAudition(genre);
      onOpenPlayer?.(genre.id);
    },
    [onOpenPlayer, playingGenreId, stopAudition, toggleAudition]
  );

  const handleToggleAudition = useCallback(
    (genre: Genre) => {
      if (playingGenreId === genre.id) {
        stopAudition();
        return;
      }
      void toggleAudition(genre);
    },
    [playingGenreId, stopAudition, toggleAudition]
  );

  /**
   * The bar is driven by `playingGenreId` alone.
   *
   * It briefly needed a separate "current genre" state because the bar took a `Genre` object, which
   * meant a shell that mounted while something was already playing had no genre to show — and two
   * copies of "what is playing" is one too many. The bar resolves the genre from the id instead.
   */
  /**
   * Tapping a card opens its page *and* plays it.
   *
   * This is the redesign the user asked for: the library no longer repeats one identical play button
   * per row (ugly, and two taps for one intention), so the card is the target and the shell starts the
   * genre as it navigates.
   */
  const openGenreAndPlay = useCallback(
    (genre: Genre) => {
      if (playingGenreId !== genre.id) handleToggleAudition(genre);
      onOpenGenre?.(genre.id);
    },
    [handleToggleAudition, onOpenGenre, playingGenreId]
  );

  const isPlayer = module === "home" && Boolean(mobilePlayer) && Boolean(genreId);
  const isDetail = module === "home" && Boolean(genreId) && !mobilePlayer;
  // The bar is the collapsed *form* of the player, so it is hidden while the full player is open.
  const showPlayerBar = module === "home" && !isPlayer && Boolean(playingGenreId);
  /**
   * The module bar belongs to browsing, not to a full-screen surface.
   *
   * The player and a genre's page both take the whole screen (the user's rule): the player has its own
   * transport, and the genre page is a reading page with the player bar as its only bottom chrome.
   */
  const showTabBar = !isPlayer && !isDetail;
  /**
   * …and so does the shell's own wordmark header.
   *
   * It used to sit above every module, which on a full-screen surface meant *two* bars saying GROOVE:
   * the shell's and the player's own top bar (the reference's). A full-screen page owns its chrome, so
   * the shell steps out of the way for both of them.
   */
  const showShellHeader = !isPlayer && !isDetail;

  return (
    <div className="mobile-root relative min-h-[100dvh] w-full" data-testid="mobile-shell" data-module={module}>
      {/* Scroll container: the bar is fixed, so the content reserves its height plus the safe area. */}
      <main
        className="relative z-10 mx-auto min-h-[100dvh] w-full max-w-[432px]"
        style={{
          paddingBottom: showTabBar
            ? "calc(72px + env(safe-area-inset-bottom))"
            : isDetail
              ? "calc(84px + env(safe-area-inset-bottom))"
              : "env(safe-area-inset-bottom)",
        }}
      >
        {showShellHeader && (
          <header className="flex items-center justify-between px-4 pt-4 pb-1">
            <div className="flex items-baseline gap-2">
              <span className="m-mono text-[12px] font-bold tracking-[0.24em] text-[var(--m-gold)]">
                GROOVE
              </span>
              <span className="text-[10px] tracking-[0.1em] text-[var(--m-ink-2)]">
                {t("mobile_shell_title")}
              </span>
            </div>
          </header>
        )}

        <Suspense
          fallback={
            <div className="px-4 py-6 text-[12px] text-[var(--m-ink-3)]" data-testid="mobile-shell-loading">
              …
            </div>
          }
        >
          {isPlayer ? (
            <MobilePlayerScreen
              genreId={genreId!}
              isPlaying={playingGenreId === genreId}
              playMode={playMode}
              readClock={readClock}
              onTogglePlay={handleToggleAudition}
              onPlayGenre={playGenreInPlayer}
              onCycleMode={cyclePlayMode}
              onSkip={skip}
              onTempo={setTempo}
              onScrubSound={startVinylScrub}
              onScrubSoundEnd={stopVinylScrub}
              onCollapse={() => onCollapsePlayer?.()}
              onOpenDetail={(id) => onOpenGenre?.(id)}
            />
          ) : isDetail ? (
            <MobileGenreDetailScreen
              genreId={genreId}
              isPlaying={playingGenreId === genreId}
              onBack={() => onCloseGenre?.()}
              onOpenGenre={(id) => onOpenGenre?.(id)}
            />
          ) : module === "jam" ? (
            /* The jam module has no player bar by design: its transport is the loop itself. */
            <MobileJamScreen
              genreId={genreId}
              isPlaying={Boolean(playingGenreId) && playingGenreId === (genreId ?? playingGenreId)}
              readClock={readClock}
              onTogglePlay={handleToggleAudition}
              onApplyPattern={applyPattern}
              onTempo={setTempo}
              onSwing={setSwingValue}
              onAuditionTrack={auditionTrack}
              onOpenGenre={(id) => onOpenGenre?.(id)}
            />
          ) : module === "challenge" ? (
            <MobileChallengeScreen
              isPlaying={Boolean(playingGenreId)}
              onTogglePlay={handleToggleAudition}
              onOpenGenre={(id) => onOpenGenre?.(id)}
            />
          ) : module === "explore" ? (
            <MobileExploreScreen
              genreId={genreId}
              isPlaying={Boolean(playingGenreId)}
              onTogglePlay={handleToggleAudition}
              onApplyPattern={applyPattern}
            />
          ) : module === "more" ? (
            <MobileMoreScreen
              onOpenSettings={() => onOpenSettings?.()}
              onOpenUpdates={() => onOpenUpdates?.()}
              onOpenHelp={() => onOpenHelp?.()}
              onOpenSearch={() => onOpenSearch?.()}
            />
          ) : module === "home" ? (
            <MobileHomeScreen playingGenreId={playingGenreId} onSelectGenre={openGenreAndPlay} />
          ) : (
            <ModulePlaceholder module={module} />
          )}
        </Suspense>
      </main>

      {/* The bar sits above the tab bar; the content above reserves room for both. */}
      {showPlayerBar && playingGenreId && (
        <MobilePlayerBar
          genreId={playingGenreId}
          isPlaying
          aboveTabBar={showTabBar}
          playMode={playMode}
          onToggle={stopAudition}
          onCycleMode={cyclePlayMode}
          onOpen={() => onOpenPlayer?.(playingGenreId)}
          /* The rail and the tempo both come from the transport, so the bar cannot disagree with it. */
          readClock={readClock}
          readTempo={readTempo}
          totalSteps={ALL_GENRES.find((item) => item.id === playingGenreId)?.sequencer_pattern?.totalSteps || 16}
        />
      )}

      {showTabBar && <MobileModuleTabBar active={module} onSelect={onSelectModule} />}
    </div>
  );
}

/**
 * What a not-yet-rebuilt module shows.
 *
 * A placeholder is honest; a stripped-down desktop view would not be. The card names the module's
 * planned contents from the plan itself, so the screen tells the reader what is coming instead of
 * looking broken.
 */
function ModulePlaceholder({ module }: { module: MobileModule }) {
  const { t } = useLanguage();
  return (
    <section className="m-rise px-4 pt-2" data-testid={`mobile-module-${module}-placeholder`}>
      <h1 className="text-[22px] font-bold leading-none">{t(`mobile_module_${module}`)}</h1>
      <div className="mt-4 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-4">
        <p className="m-mono text-[10px] uppercase tracking-[0.24em] text-[var(--m-gold)]">
          {t("mobile_module_building")}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--m-ink-2)]">
          {t(MOBILE_MODULE_PLAN_KEYS[module])}
        </p>
      </div>
    </section>
  );
}
