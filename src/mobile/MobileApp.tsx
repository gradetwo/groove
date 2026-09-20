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
import React, { Suspense, useCallback } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useGenreAudition } from "../hooks/useGenreAudition";
import { MobileModuleTabBar } from "./MobileModuleTabBar";
import { MobilePlayerBar } from "./MobilePlayerBar";
import { MOBILE_MODULE_PLAN_KEYS, type MobileModule } from "./mobileModules";
import type { Genre } from "../types/genre";
import "./mobile.css";

const MobileHomeScreen = React.lazy(() =>
  import("./screens/MobileHomeScreen").then((m) => ({ default: m.MobileHomeScreen }))
);
const MobileGenreDetailScreen = React.lazy(() =>
  import("./screens/MobileGenreDetailScreen").then((m) => ({ default: m.MobileGenreDetailScreen }))
);

export interface MobileAppProps {
  module: MobileModule;
  genreId?: string;
  onSelectModule: (module: MobileModule) => void;
  /** Navigate to a genre's detail page (`/m/home?genre=`). */
  onOpenGenre?: (genreId: string) => void;
  /** Leave the shell for the module that owns a genre's editable surface. */
  onOpenJam?: (genreId: string) => void;
  onCloseGenre?: () => void;
}

export function MobileApp({ module, genreId, onSelectModule, onOpenGenre, onOpenJam, onCloseGenre }: MobileAppProps) {
  const { t } = useLanguage();

  /**
   * One audition engine for the whole shell.
   *
   * The hook used to live inside the home screen, which was fine while the home screen was the only
   * thing playing audio. The player bar has to show and stop the same sound, and two instances of the
   * hook mean two engines — so the state is lifted here and passed down, and the bar reads it.
   */
  const { playingGenreId, toggleAudition, stopAudition } = useGenreAudition();

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
  const showPlayerBar = module === "home" && Boolean(playingGenreId);
  const isDetail = module === "home" && Boolean(genreId);

  return (
    <div className="mobile-root relative min-h-[100dvh] w-full" data-testid="mobile-shell" data-module={module}>
      {/* Scroll container: the bar is fixed, so the content reserves its height plus the safe area. */}
      <main
        className="relative z-10 mx-auto min-h-[100dvh] w-full max-w-[432px]"
        style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom))" }}
      >
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

        <Suspense
          fallback={
            <div className="px-4 py-6 text-[12px] text-[var(--m-ink-3)]" data-testid="mobile-shell-loading">
              …
            </div>
          }
        >
          {isDetail ? (
            <MobileGenreDetailScreen
              genreId={genreId}
              isPlaying={playingGenreId === genreId}
              onBack={() => onCloseGenre?.()}
              onToggleAudition={handleToggleAudition}
              onOpenGenre={(id) => onOpenGenre?.(id)}
              onOpenJam={(id) => onOpenJam?.(id)}
            />
          ) : module === "home" ? (
            <MobileHomeScreen
              playingGenreId={playingGenreId}
              onToggleAudition={handleToggleAudition}
              onOpenGenre={(id) => onOpenGenre?.(id)}
            />
          ) : (
            <ModulePlaceholder module={module} />
          )}
        </Suspense>
      </main>

      {/* The bar sits above the tab bar; the content above reserves room for both. */}
      {showPlayerBar && (
        <MobilePlayerBar
          genreId={playingGenreId}
          isPlaying
          onToggle={stopAudition}
          onOpen={() => playingGenreId && onOpenGenre?.(playingGenreId)}
        />
      )}

      <MobileModuleTabBar active={module} onSelect={onSelectModule} />
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
