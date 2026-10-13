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
import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useGenreAudition } from "../hooks/useGenreAudition";
import { auditionArrangementFor } from "./mobileGenreData";
import { MobileModuleTabBar } from "./MobileModuleTabBar";
import { MobilePlayerBar } from "./MobilePlayerBar";
import { MobileClipPlayer } from "./MobileClipPlayer";
import { useCoverWarmupBothSizes } from "../hooks/useCoverWarmup";
import { MOBILE_MODULE_PLAN_KEYS, usesClipPlayback, type MobileModule } from "./mobileModules";
import { GENRE_INDEX, loadGenre } from "./mobileGenreData";
import { nextGenreForMode, nextPlayMode, normalisePlayMode, type PlayMode } from "./vinyl/vinylMath";
import type { VinylClock } from "./vinyl/VinylCanvas";
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

/**
 * The genre the phone shell falls back to, and the one the persistent player bar starts on.
 *
 * It is the same id every route without a genre resolves to (`App.tsx`: `route.genreId || "chicago-house"`), so the bar, the
 * full player and the desktop studio all name the same default instead of three opinions about "nothing chosen yet".
 */
const DEFAULT_MOBILE_GENRE = "chicago-house";

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
  /**
   * `onPatternEnd` is read through a ref, so the engine's callback sees the *current* mode and queue instead of
   * the ones captured when the engine was built. The advance itself is deferred (the hook already defers it out
   * of the scheduler) and skipped for `one`, which is the engine's own loop and needs no help.
   */
  const advanceRef = useRef<(() => void) | null>(null);
  const { playingGenreId, toggleAudition, stopAudition, readClock, applyPattern, setTempo, setSwingValue,
    startVinylScrub,
    stopVinylScrub,
    auditionTrack,
    setMetronome,
    readMetronome,
    readTempo } =
    /**
     * The phone plays **songs**, not loops: a genre's own pattern is a 4–16 second pass, so the play modes had
     * nothing long enough to wait for and 全部随机 read as continuous switching (the report that started this).
     * `auditionArrangementFor` picks the form from the genre's category — club for Electronic, song for the rest —
     * and the pass end then means the end of the track.
     */
    useGenreAudition({
      onPatternEnd: () => advanceRef.current?.(),
      arrangement: auditionArrangementFor(
        genreId ? GENRE_INDEX.find((item) => item.id === genreId)?.category : undefined
      ),
      /**
       * ⭐ **The shell owns its own clip transport, so this hook stays the engine here** (owner's decision, 2026-10-11).
       *
       * On every module but jam and explore the sound is `MobileClipPlayer` (`clipMode` below), and this hook is the
       * **jam / explore** path, which the owner's rule keeps live. Letting the hook also play clips would give the shell
       * two transports: the player's `isPlaying` follows the shell's `clipGenreId`, so a hook-owned clip would play
       * while the screen said "idle" — the disagreement `MobilePlayerScreen`'s own comment warns against.
       */
      clips: false,
    });

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
   *
   * The queue is the **index** (`id` + `category`, which is all `nextGenreForMode` reads), and only the
   * chosen id is resolved to a full record before the transport gets it.
   */
  /** ⭐ Modules but jam and explore play the rendered clip (owner, 2026-10-11). */
  const clipMode = usesClipPlayback(module);
  const [clipGenreId, setClipGenreId] = useState<string | null>(null);
  const clipAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopClipAudio = useCallback(() => {
    if (clipAudioRef.current) {
      clipAudioRef.current.pause();
      clipAudioRef.current.currentTime = 0;
    }
  }, []);

  useEffect(() => {
    if (!clipMode && clipGenreId) {
      stopClipAudio();
      setClipGenreId(null);
    } else if (clipMode && playingGenreId) {
      stopAudition();
    }
  }, [clipMode, clipGenreId, playingGenreId, stopAudition, stopClipAudio]);

  /**
   * ⭐ **A refused `play()` clears `clipGenreId`, because that is what every clip surface reads as "playing".**
   * The press sets it before the element has done anything, so a refusal (iOS, outside the gesture; or a 404) used to
   * leave the record, the bar and the timer reporting playback over silence (owner, 2026-10-13). Cleared, the transport
   * reads "idle" and the next press is a fresh attempt.
   */
  const onClipPlayFailed = useCallback(() => {
    setClipGenreId(null);
  }, []);

  useEffect(() => () => { stopAudition(); stopClipAudio(); }, [stopAudition, stopClipAudio]);

  const activeGenreId = clipMode ? clipGenreId : playingGenreId;

  const skip = useCallback(
    (direction: 1 | -1) => {
      const from = activeGenreId ?? genreId ?? DEFAULT_MOBILE_GENRE;
      if (!from) return;
      const nextId = nextGenreForMode(playMode, from, GENRE_INDEX, direction);
      if (clipMode) {
        stopAudition();
        stopClipAudio();
        setClipGenreId(nextId);
      } else {
        stopClipAudio();
        setClipGenreId(null);
        stopAudition();
        void loadGenre(nextId).then((record) => {
          if (record) void toggleAudition(record);
        });
      }
      if (mobilePlayer) onOpenPlayer?.(nextId);
    },
    [activeGenreId, clipMode, genreId, mobilePlayer, onOpenPlayer, playMode, stopAudition, stopClipAudio, toggleAudition]
  );

  /**
   * Auto-advance when a pass ends: 大曲风内循环 walks the category, 全部随机 shuffles, 单曲循环 does nothing
   * (the engine's own loop is the repeat). This is what the mode button governs and, until now, nothing did.
   */
  useEffect(() => {
    advanceRef.current =
      playMode === "one"
        ? null
        : () => {
            skip(1);
          };
    return () => {
      advanceRef.current = null;
    };
  }, [playMode, skip]);

  /**
   * Switch the record to another genre *without* leaving the player — the pull-down list's action.
   */
  const playGenreInPlayer = useCallback(
    (id: string) => {
      if (clipMode) {
        if (clipGenreId === id) return;
        stopAudition();
        stopClipAudio();
        setClipGenreId(id);
      } else {
        if (playingGenreId === id) return;
        stopClipAudio();
        setClipGenreId(null);
        stopAudition();
        void loadGenre(id).then((record) => {
          if (record) void toggleAudition(record);
        });
      }
      onOpenPlayer?.(id);
    },
    [clipMode, clipGenreId, onOpenPlayer, playingGenreId, stopAudition, stopClipAudio, toggleAudition]
  );

  /**
   * One id in, one audition out.
   */
  const handleToggleAudition = useCallback(
    (id: string) => {
      if (clipMode) {
        stopAudition();
        if (clipGenreId === id) {
          stopClipAudio();
          setClipGenreId(null);
        } else {
          stopClipAudio();
          setClipGenreId(id);
        }
        return;
      }
      stopClipAudio();
      setClipGenreId(null);
      if (playingGenreId === id) {
        stopAudition();
        return;
      }
      void loadGenre(id).then((record) => {
        if (record) void toggleAudition(record);
      });
    },
    [clipMode, clipGenreId, playingGenreId, stopAudition, stopClipAudio, toggleAudition]
  );

  const openGenreAndPlay = useCallback(
    (id: string) => {
      if (clipMode) {
        stopAudition();
        if (clipGenreId !== id) {
          stopClipAudio();
          setClipGenreId(id);
        }
      } else {
        stopClipAudio();
        setClipGenreId(null);
        if (playingGenreId !== id) handleToggleAudition(id);
      }
      onOpenGenre?.(id);
    },
    [clipMode, clipGenreId, handleToggleAudition, onOpenGenre, playingGenreId, stopAudition, stopClipAudio]
  );

  const isPlayer = module === "home" && Boolean(mobilePlayer) && Boolean(genreId);
  const isDetail = module === "home" && Boolean(genreId) && !mobilePlayer;

  const defaultGenreId = genreId ?? activeGenreId ?? DEFAULT_MOBILE_GENRE;
  const lastBarGenreRef = useRef<string | null>(null);
  const barGenreId = activeGenreId ?? lastBarGenreRef.current ?? defaultGenreId;
  lastBarGenreRef.current = barGenreId;

  useCoverWarmupBothSizes(barGenreId);
  const barIsPlaying = clipMode
    ? Boolean(clipGenreId) && clipGenreId === barGenreId
    : Boolean(playingGenreId) && playingGenreId === barGenreId;

  const readClipClock = useCallback((): VinylClock | null => {
    const audio = clipAudioRef.current;
    if (!audio || audio.paused || !clipGenreId) return null;
    const currentGenre = GENRE_INDEX.find((g) => g.id === clipGenreId);
    const bpm = currentGenre?.default_bpm ?? 120;
    const stepDuration = 15 / bpm;
    // `currentTime` already advances at `playbackRate` — it is the record position, so scaling by rate again doubled it.
    const totalStepsElapsed = audio.currentTime / stepDuration;
    const step = Math.floor(totalStepsElapsed);
    const fraction = Math.min(1, Math.max(0, totalStepsElapsed - step));
    return { step, fraction };
  }, [clipGenreId]);

  const currentReadClock = useCallback((): VinylClock | null => (clipMode && clipGenreId ? readClipClock() : readClock()), [clipMode, clipGenreId, readClipClock, readClock]);

  const currentReadTempo = useCallback((): number | null => (clipMode && clipGenreId ? (GENRE_INDEX.find((g) => g.id === clipGenreId)?.default_bpm ?? 120) : readTempo()), [clipMode, clipGenreId, readTempo]);
  // The bar is the collapsed *form* of the player, so it is hidden while the full player is open.
  const showPlayerBar = module === "home" && !isPlayer;
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
    <div
      className="mobile-root relative min-h-[100dvh] w-full"
      data-surface="phone"
      data-testid="mobile-shell"
      data-module={module}
    >
      {/* Scroll container: the bar is fixed, so the content reserves its height plus the safe area. */}
      <main
        /**
         * 即兴 is the one module that must not scroll: it is a step editor with a transport, and a screen that
         * pans under a thumb mid-take is how a take is lost. Every other module keeps the scrolling shell.
         */
        className={`relative z-10 mx-auto w-full max-w-[432px] ${
          module === "jam" && showTabBar ? "h-[100dvh] overflow-hidden" : "min-h-[100dvh]"
        }`}
        style={{
          /**
           * The bar is fixed and always on the home module, so its height is always reserved.
           *
           * It used to be `72px` for the tab bar alone, which was right only while the bar was conditional — and it meant
           * that as soon as something played, the last row of the library slid under the bar. The tab bar is 56px, the bar
           * sits 56px up from the bottom and is ~62px tall, so the home module needs 56 + 62 + a 12px gap.
           */
          paddingBottom: showTabBar
            ? "calc(130px + env(safe-area-inset-bottom))"
            : isDetail
              ? "calc(84px + env(safe-area-inset-bottom))"
              : "calc(72px + env(safe-area-inset-bottom))",
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
              /**
               * ⭐ The screen and the sound must agree. On modules that play the clip, the transport is the clip, so
               * `isPlaying` follows the clip's own genre rather than the engine's audition — otherwise the full player
               * would say "idle" while the MP3 was playing (owner, 2026-10-11).
               */
              isPlaying={clipMode ? clipGenreId === genreId : playingGenreId === genreId}
              playMode={playMode}
              readClock={currentReadClock}
              onTogglePlay={(id: string) => handleToggleAudition(id)}
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
              onMetronome={setMetronome}
              metronome={readMetronome()}
            />
          ) : module === "challenge" ? (
            <MobileChallengeScreen
              isPlaying={clipMode ? Boolean(clipGenreId) : Boolean(playingGenreId)}
              /**
               * ⭐ The distinction the owner asked for (2026-10-11): on the modules that play the rendered clip, the
               * challenge screen's own transport is the clip too — its play button is a module transport, not the bar.
               */
              onTogglePlay={(id: string) => handleToggleAudition(id)}
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
            <MobileHomeScreen playingGenreId={clipMode ? null : playingGenreId} onSelectGenre={openGenreAndPlay} />
          ) : (
            <ModulePlaceholder module={module} />
          )}
        </Suspense>
      </main>

      {/* ⭐ The clip slot: on modules but jam and explore, the sound comes from the rendered clip. */}
      {clipMode && clipGenreId && (
        <div className="px-4 pb-2" data-testid="mobile-clip-bar-slot">
          <MobileClipPlayer
            genreId={clipGenreId}
            autoPlay
            onPlayFailed={onClipPlayFailed}
            onAudioRef={(el) => {
              clipAudioRef.current = el;
            }}
            onEnded={() => {
              if (playMode === "one") {
                if (clipAudioRef.current) {
                  clipAudioRef.current.currentTime = 0;
                  void clipAudioRef.current.play().catch(() => {});
                }
              } else {
                advanceRef.current?.();
              }
            }}
          />
        </div>
      )}

      {/* The bar sits above the tab bar; the content above reserves room for both. */}
      {showPlayerBar && (
        <MobilePlayerBar
          genreId={barGenreId}
          isPlaying={barIsPlaying}
          aboveTabBar={showTabBar}
          playMode={playMode}
          onToggle={() => handleToggleAudition(barGenreId)}
          onCycleMode={cyclePlayMode}
          onOpen={() => onOpenPlayer?.(barGenreId)}
          /* The rail and the tempo both come from the transport, so the bar cannot disagree with it. */
          readClock={currentReadClock}
          readTempo={currentReadTempo}
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
