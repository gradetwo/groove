import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { Header, NavTab } from "./components/Header";
import { useGs1Setting } from "./features/sequencer/useGs1Setting";
import { GlobalSearch } from "./components/GlobalSearch";
import { Genre, SequencerPattern } from "./types/genre";
import { GENRE_INDEX_MAP } from "./data/index/genresIndex";
/**
 * Side-effect import on purpose: it must run before the first `loadGenre`, and this module is the
 * first thing the shell pulls in. See the file for why the wiring lives in `src/app`.
 */
import "./app/installCustomGenreResolver";
import { loadGenre } from "./data/index/loader";
import { AudioEngine } from "./audio/AudioEngine";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ChordDefinition } from "./utils/chordTheory";
import { BakedArpeggioResult } from "./utils/arpeggiatorTheory";
import { UpdatesModal, CURRENT_CLIENT_VERSION } from "./components/UpdatesModal";
import { ShortcutsModal } from "./components/ShortcutsModal";
import type { HelpCategory } from "./components/help/HelpCenterModal";
import {
  NewUserOnboardingModal,
  ONBOARDING_COMPLETED_KEY,
} from "./components/help/NewUserOnboardingModal";
import { InteractiveTutorialCoach } from "./components/help/InteractiveTutorialCoach";
import { useAppShortcuts } from "./hooks/useAppShortcuts";
import { useDeviceCapabilities } from "./hooks/useDeviceCapabilities";
import { MobileTabBar } from "./components/MobileTabBar";
import { MobileMoreSheet } from "./components/MobileMoreSheet";
import type { MobileSheetAction } from "./components/MobileTabBar";
import { ToastContainer, Skeleton, AriaLiveRegion, announcer } from "./ui";
import { RouterProvider, useRouter } from "./app/router";

// Code splitting & lazy loading chunks for optimal performance
/**
 * The settings panel is lazy, for the same reason every view is.
 *
 * It carries five tabs, their copy, and (since the desktop got the phone's skins) the skin catalogue with its
 * preview swatches. None of that is in the first paint's job: the panel opens on a click. Moving it out is
 * what kept the initial route inside its budget after the six-skin round added the eager default palette.
 */
const SettingsModal = React.lazy(() =>
  import("./components/settings/SettingsModal").then((m) => ({ default: m.SettingsModal }))
);
const StudioView = React.lazy(() => import("./views/StudioView").then((m) => ({ default: m.StudioView })));
const ChordProgressionsView = React.lazy(() => import("./views/ChordProgressionsView").then((m) => ({ default: m.ChordProgressionsView })));
const GalaxyView = React.lazy(() => import("./views/GalaxyView").then((m) => ({ default: m.GalaxyView })));
const HorizontalTimelineView = React.lazy(() => import("./views/HorizontalTimelineView").then((m) => ({ default: m.HorizontalTimelineView })));
const VerticalTimelineView = React.lazy(() => import("./views/VerticalTimelineView").then((m) => ({ default: m.VerticalTimelineView })));
const CompareView = React.lazy(() => import("./views/CompareView").then((m) => ({ default: m.CompareView })));
const ChallengeView = React.lazy(() => import("./views/ChallengeView").then((m) => ({ default: m.ChallengeView })));
const GenreDetailView = React.lazy(() => import("./views/GenreDetailView").then((m) => ({ default: m.GenreDetailView })));
const KickAnatomyView = React.lazy(() => import("./views/KickAnatomyView").then((m) => ({ default: m.KickAnatomyView })));
const MasterclassView = React.lazy(() => import("./views/MasterclassView").then((m) => ({ default: m.MasterclassView })));
const AnalyzerView = React.lazy(() => import("./views/AnalyzerView").then((m) => ({ default: m.AnalyzerView })));
const CustomGenreMakerView = React.lazy(() => import("./views/CustomGenreMakerView").then((m) => ({ default: m.CustomGenreMakerView })));
/**
 * The phone shell (M-series). Lazy for the same reason every view is: it pulls the genre database,
 * which must not be in the first paint (redline R8).
 */
const MobileApp = React.lazy(() => import("./mobile/MobileApp").then((m) => ({ default: m.MobileApp })));
// The cutover rule lives with the module vocabulary, where it can be tested without App.
import { shouldEnterPhoneShell, type MobileModule } from "./mobile/mobileModules";
// The phone's four 更多 panels are siblings of the shell, so their skin lives in its own scoped sheet.
const HardwareConsoleView = React.lazy(() => import("./views/HardwareConsoleView").then((m) => ({ default: m.HardwareConsoleView })));
const HelpCenterModal = React.lazy(() => import("./components/help/HelpCenterModal").then((m) => ({ default: m.HelpCenterModal })));

const MainApp: React.FC = () => {
  const { t, isZh } = useLanguage();
  const { route, navigate } = useRouter();

  /**
   * Phone shell. `isMobile` is capability-based (see `useDeviceCapabilities`), not a width test,
   * so a landscape phone gets the phone UI instead of the desktop editor squeezed into 390 px of
   * height.
   *
   * Declared here rather than next to the cutover effect because the studio's genre load asks the
   * same question ("is this a phone?") on its first render, and a hook cannot be called from below
   * the code that needs it.
   */
  const { isMobile, isShortLandscape } = useDeviceCapabilities();

  const currentTab = route.tab;

  // On-demand asynchronous genre loading (P1-13)
  const targetGenreId = route.genreId || "chicago-house";
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);

  /**
   * The default studio genre, resolved on demand — **except on a phone route**.
   *
   * `route.genreId || "chicago-house"` means every route without a genre resolves the studio's default,
   * and the studio is not rendered at all when the phone shell owns the screen. That cost the phone
   * profile one category chunk on its first paint (a genre it will never show), which the performance
   * gate counts: the shell's own data path is index-based precisely so that landing in `/m/…` downloads
   * no library chunks, and this was the last one.
   */
  useEffect(() => {
    /**
     * On a phone the studio never renders, and on a *bare* route the cutover below has not run yet, so
     * `route.mobile` alone is not enough to know that: the first render of `/` still looks like the
     * desktop. Asking the same question the cutover asks — `shouldEnterPhoneShell` — is what makes this
     * correct on that first render, and it is why the phone profile downloads **zero** library chunks
     * before the shell appears (it used to fetch the studio's default genre, and the performance gate
     * counted it).
     */
    /**
     * `shellIsTheSurface`, not `shouldEnterPhoneShell`: see that constant's comment — by the time this
     * effect runs on a phone the URL already names a module, so the cutover rule answers "no" while the
     * shell is exactly what is on screen.
     */
    if (shellIsTheSurface) {
      setSelectedGenre(null);
      return;
    }
    let isMounted = true;
    loadGenre(targetGenreId).then((g) => {
      if (isMounted && g) {
        setSelectedGenre(g);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [isMobile, route.mobile, targetGenreId]);

  const [comparePool, setComparePool] = useState<Genre[]>([]);

  useEffect(() => {
    // A-01 follow-up: this used to run on every app mount, so landing on the studio
    // tab still downloaded two genre chunks for a comparison view the user had not
    // opened. Only resolve the compare pool when that tab is actually shown.
    if (route.tab !== "compare" && (!route.compareIds || route.compareIds.length === 0)) {
      return;
    }

    let isMounted = true;
    const ids = route.compareIds && route.compareIds.length > 0
      ? route.compareIds
      : ["chicago-house", "detroit-techno"];

    Promise.all(ids.map(loadGenre)).then((loaded) => {
      if (isMounted) {
        const valid = loaded.filter(Boolean) as Genre[];
        if (valid.length > 0) {
          setComparePool(valid.slice(0, 4));
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [route.compareIds]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpCategory, setHelpCategory] = useState<HelpCategory | undefined>(undefined);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState<{
    courseId: string;
    stepIndex: number;
  } | null>(null);

  // Auto-launch onboarding tour for first-time visitors
  useEffect(() => {
    try {
      const hasCompleted = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
      if (!hasCompleted) {
        const timer = setTimeout(() => {
          setOnboardingOpen(true);
        }, 700);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, []);

  const [initialChords, setInitialChords] = useState<ChordDefinition[] | null>(null);
  const [initialArpeggio, setInitialArpeggio] = useState<{
    baked: BakedArpeggioResult;
    label?: string;
  } | null>(null);
  const [initialMasterclassPattern, setInitialMasterclassPattern] = useState<{
    pattern: SequencerPattern;
    label: string;
  } | null>(null);
  const [initialOpenPianoRollTrack, setInitialOpenPianoRollTrack] = useState<number | string | null>(null);
  /**
   * U2: the new-user guide's first slide offers one action — hear the current genre. It sets this and
   * switches to the studio; `StudioView` consumes it once its engine exists (`useInitialAutoPlay`).
   */
  const [initialAutoPlay, setInitialAutoPlay] = useState(false);

  const handleOpenHelp = useCallback((category?: string) => {
    setHelpCategory(category as HelpCategory | undefined);
    setHelpOpen(true);
  }, []);

  const handleStartTutorial = useCallback((courseId: string, initialStep?: number) => {
    setActiveTutorial({ courseId, stepIndex: initialStep ?? 0 });
  }, []);

  const handleSelectTab = useCallback((tab: NavTab) => {
    navigate({ tab, genreId: tab === "detail" || tab === "console" ? selectedGenre?.id : undefined });
  }, [navigate, selectedGenre?.id]);


  // Global Keyboard Shortcuts (P2-20: '?' help panel and 'g'+key navigation)
  const { shortcutsOpen, setShortcutsOpen } = useAppShortcuts({
    onNavigateTab: handleSelectTab,
    isZh,
  });

  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  /**
   * Whether the phone's navigation bar is currently a fixed bottom bar.
   *
   * Published as `data-bottom-bar="tab"` on the document element because CSS needs it and a width
   * media query cannot answer it: in a landscape studio the bar is merged into the row *inside* the
   * view, and in a landscape non-studio view it is fixed at the bottom, yet both are 844 px wide.
   * Everything that has to clear the bar (the track inspector's `bottom`) reads the variable this
   * drives. See the rule's comment in `index.css` for the measured defect it fixes.
   */
  const hasFixedTabBar = isMobile && !(isShortLandscape && currentTab === "studio");
  useEffect(() => {
    const root = document.documentElement;
    if (hasFixedTabBar) root.setAttribute("data-bottom-bar", "tab");
    else root.removeAttribute("data-bottom-bar");
  }, [hasFixedTabBar]);

  /**
   * The phone navigation bar, built once and placed in one of two containers.
   *
   * Portrait (and every tall viewport): rendered fixed at the bottom, as it always was. Short
   * landscape studio: handed to `StudioView`, which puts it on the same row as the transport so the
   * two bars stop costing 102 px of a 390 px-tall viewport. Built here rather than in the view so
   * that `App` remains the only thing that knows how navigation works.
   */
  const mobileTabBar = (
    <MobileTabBar
      activeTab={currentTab}
      onSelectTab={handleSelectTab}
      onOpenSheet={() => setMobileSheetOpen(true)}
    />
  );

  /** The same bar, in flow, for the shared bottom row. See `MobileTabBar`'s `embedded` prop. */
  const embeddedMobileTabBar = (
    <MobileTabBar
      activeTab={currentTab}
      onSelectTab={handleSelectTab}
      onOpenSheet={() => setMobileSheetOpen(true)}
      embedded
    />
  );

  const handleMobileSheetAction = useCallback(
    (action: MobileSheetAction["id"]) => {
      setMobileSheetOpen(false);
      if (action === "search") setSearchOpen(true);
      else if (action === "settings") setSettingsOpen(true);
      else if (action === "help") setHelpOpen(true);
      else if (action === "updates") setUpdatesOpen(true);
    },
    []
  );

  // Audio analyser for Header live spectrum visualizer
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [engineInstance, setEngineInstance] = useState<AudioEngine | null>(null);
  // Global settings panel (item ⑤), and the one shared source of truth for the GS-1 switch so
  // the header/settings surfaces can never disagree with the studio toolbar.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gs1Enabled, setGs1Enabled] = useGs1Setting(engineInstance);
  const [isPlaying, setIsPlaying] = useState(false);

  // Global hotkey: Cmd+K / Ctrl+K opens search dialog from ANY page (P0-23)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const handleAddToCompare = useCallback((genre: Genre) => {
    setComparePool((prev) => {
      const next = prev.some((g) => g.id === genre.id) ? prev : [...prev, genre].slice(0, 4);
      navigate({ tab: "compare", compareIds: next.map((g) => g.id) });
      return next;
    });
  }, [navigate]);

  const handleSelectGenre = useCallback((genre: { id: string; name?: string }, action?: "detail" | "studio" | "galaxy" | "compare") => {
    if (action === "compare") {
      loadGenre(genre.id).then((g) => {
        if (g) handleAddToCompare(g);
      });
      return;
    }
    const targetTab: NavTab = action === "studio" ? "studio" : action === "galaxy" ? "galaxy" : "detail";
    navigate({ tab: targetTab, genreId: genre.id });
    const gName = genre.name || genre.id;
    announcer.announce(isZh ? `已切换至曲风：${gName}` : `Switched to genre: ${gName}`);
  }, [navigate, isZh, handleAddToCompare]);

  const handleOpenStudioWithGenre = useCallback((genre: { id: string }) => {
    navigate({ tab: "studio", genreId: genre.id });
  }, [navigate]);

  /**
   * Stable callbacks for the views.
   *
   * These used to be inline arrows at each call site, so every App render allocated new functions —
   * which fed a re-render loop through `StudioView`'s genre-sync effect (see the comment there).
   * One `useCallback` per destination removes that class of churn at the source.
   */
  const handleSelectStudioGenre = useCallback(
    (genre: { id: string; name?: string }) => handleSelectGenre(genre, "studio"),
    [handleSelectGenre]
  );
  const handleSelectDetailGenre = useCallback(
    (genre: { id: string; name?: string }) => handleSelectGenre(genre, "detail"),
    [handleSelectGenre]
  );

  const handleEngineReady = (engine: AudioEngine) => {
    setEngineInstance(engine);
    setAnalyser(engine.getAnalyser());
    const id = setInterval(() => {
      setIsPlaying(engine.getIsPlaying());
    }, 100);
    return () => {
      clearInterval(id);
      setIsPlaying(false);
      setAnalyser(null);
      setEngineInstance(null);
    };
  };

  /**
   * The cutover, decided **during render**, not only in the effect below.
   *
   * `shouldEnterPhoneShell` says "this is a phone, and it asked for nothing in particular" — bare `/`
   * on a touch device. The effect below reacts to it by naming the home module in the URL, but an
   * effect runs *after* a render, so the desktop composition used to mount for one frame first: the
   * studio's own hooks then resolved a genre, and the phone paid for a category chunk it would never
   * show (the performance gate counts genre chunks fetched on first paint, and this was the last one —
   * the shell's own data path is index-based on purpose).
   *
   * Reading it here makes the shell the phone's *first* render as well as its destination: no flash of
   * the desktop toolbar, and no chunk for a surface the user will never see.
   */
  const bareRouteWantsShell =
    typeof window !== "undefined" &&
    shouldEnterPhoneShell({
      isMobile,
      mobileRoute: route.mobile,
      pathname: window.location.pathname,
      search: window.location.search,
    });

  /**
   * Is the phone shell the surface on screen?
   *
   * Two ways to be true, and the difference is the whole point: a named module route (`/m/jam`) *is* the
   * shell, while a **bare route on a phone** only asks to become one. The router rewrites `/` to
   * `/m/home` during the first commit, so by the time an effect runs the URL already names a module and
   * `shouldEnterPhoneShell` answers `false` — asking only that question let the studio's genre effect
   * through and the phone downloaded a category chunk for a surface it never shows. The shell is on
   * screen in **both** cases, so this is what the render branch and the studio's load guard ask.
   */
  const shellIsTheSurface = route.mobile !== undefined || bareRouteWantsShell;

  /**
   * A phone that opens the app bare lands in the new shell.
   *
   * This is the cutover, staged: the shell is the phone's *default entry*, while `?tab=...` and
   * `?genre=...` links keep rendering what they name (an old bookmark or a desktop-oriented test must
   * not be silently rewritten). `shouldEnterPhoneShell` is the rule, unit-tested on its own.
   */
  useEffect(() => {
    if (!bareRouteWantsShell) return;
    navigate({ tab: "studio", mobile: "home" }, { replace: true });
  }, [bareRouteWantsShell, navigate]);

  /**
   * The phone shell owns its own route space (`/m/<module>`). When one is requested, the desktop
   * composition is not rendered at all — that is what makes the two surfaces independently
   * replaceable while the phone UI is rebuilt module by module.
   *
   * This sits after every hook call (the shell is a different tree, but React still requires the hook
   * order in *this* component to be unconditional).
   */
  if (shellIsTheSurface) {
    return (
      <React.Suspense fallback={null}>
        <MobileApp
          /* A bare route on a phone: the effect above is about to name the home module, and until it
             does the shell still needs one. */
          module={route.mobile ?? "home"}
          mobilePlayer={route.mobilePlayer}
          genreId={route.genreId}
          onSelectModule={(module) =>
            navigate({ tab: "studio", mobile: module, mobilePlayer: false, genreId: undefined })
          }
          onOpenGenre={(genreId) =>
            navigate({ tab: "studio", mobile: "home", genreId, mobilePlayer: false })
          }
          /* `undefined` clears the genre: the shell reads `?genre=` as "show that genre's detail". */
          onCloseGenre={() => navigate({ tab: "studio", mobile: "home", genreId: undefined })}
          onOpenJam={(genreId) =>
            navigate({ tab: "studio", mobile: "jam", genreId, mobilePlayer: false })
          }
          /* The bar and the player are two forms of one thing: the flag decides which. */
          onOpenPlayer={(genreId) =>
            navigate({ tab: "studio", mobile: "home", genreId, mobilePlayer: true })
          }
          /* Collapsing returns to the list (the bar, when something is playing, sits above it)
             rather than to the genre's page, so the chevron is always "back to browsing". */
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenUpdates={() => setUpdatesOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onCollapsePlayer={() =>
            navigate({ tab: "studio", mobile: "home", genreId: undefined, mobilePlayer: false })
          }
        />

        {/*
          The phone's panels — the same components the desktop renders.

          They used to be mounted *only* in the desktop branch below, so every row in 更多 set state that
          nothing rendered: 设置, 更新记录, 手册 and 搜索 were all empty on the phone. Reusing the panels
          rather than writing phone copies is the decision the 更多 screen already documents (those panels
          are responsive, and a second copy is how a phone and a desktop come to disagree about what a
          setting means).

          The one thing that cannot simply be reused is navigation *out* of a panel: `handleSelectTab`
          moves the desktop route space, which on a phone would drop the user into the desktop UI. So a
          link out of the help centre goes to the phone's own module instead.
        */}
        {/*
          `m-panels` is the phone's scope for these four desktop panels.
          
          They are siblings of the shell rather than children of it (the shell renders its own root), so
          they cannot be reached by `.mobile-root …` selectors — and `data-skin` alone is too wide a net,
          because it is on `<html>` for the whole app. One explicit wrapper gives the panels a scope the
          skins can address without touching the same dialogs when the desktop opens them.
        */}
        <div className="m-panels">
        <UpdatesModal isOpen={updatesOpen} onClose={() => setUpdatesOpen(false)} />
        <React.Suspense fallback={null}>
          <SettingsModal
            isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          engine={engineInstance}
          gs1Enabled={gs1Enabled}
          onToggleGs1={() => setGs1Enabled(!gs1Enabled)}
          onReplayOnboarding={() => {
            try {
              localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
            } catch {
              // A storage that refuses to forget is not a reason to refuse the replay.
            }
            setSettingsOpen(false);
          }}
            onOpenUpdates={() => {
              setSettingsOpen(false);
              setUpdatesOpen(true);
            }}
          />
        </React.Suspense>
        <GlobalSearch
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          /* A result opens that genre in the phone shell, not in the desktop studio. */
          onSelectGenre={(genre) => {
            setSearchOpen(false);
            navigate({ tab: "studio", mobile: "home", genreId: genre.id, mobilePlayer: false });
          }}
        />
        {helpOpen && (
          <React.Suspense fallback={null}>
            <HelpCenterModal
              isOpen={helpOpen}
              initialCategory={helpCategory}
              onClose={() => {
                setHelpOpen(false);
                setHelpCategory(undefined);
              }}
              /* The theory tools this help centre links to now live in 探索; everything else is 首页. */
              onSelectTab={(tab) => {
                setHelpOpen(false);
                const module: MobileModule = tab === "chords" || tab === "kick" || tab === "masterclass" ? "explore" : "home";
                navigate({ tab: "studio", mobile: module, genreId: undefined, mobilePlayer: false });
              }}
            />
          </React.Suspense>
        )}
        </div>
      </React.Suspense>
    );
  }

  return (
    /*
      `data-surface` names which of the two apps this is.
      
      The phone shell and the desktop render from the same components but they are separate surfaces, and a
      skin's *character* (a texture, a font, a cut corner) is written for one of them: the desktop's
      character sheets are scoped to `[data-surface="desktop"]` so they cannot leak into the phone shell,
      whose own sheets are scoped to `.mobile-root` and were tuned separately.
    */
    <div
      data-surface="desktop"
      className="min-h-screen bg-bg text-text flex flex-col font-sans selection:bg-accent/25 selection:text-accent"
    >
      {/* Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onOpenSearch={() => setSearchOpen(true)}
        onRandomGenre={handleOpenStudioWithGenre}
        onOpenUpdates={() => setUpdatesOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenOnboarding={() => setOnboardingOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        /* The phone header's entry point: the sections sheet the tab bar also opens. */
        onOpenMore={() => setMobileSheetOpen(true)}
        analyser={analyser}
        isPlaying={isPlaying}
      />

      {/* Global Search Dialog */}
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectGenre={handleSelectGenre}
      />

      {/* Main Viewport with Suspense fallback for async chunks */}
      <main
        className="flex-1 w-full pb-12"
        /**
         * On a phone the tab bar is fixed over the bottom of the viewport, so the document needs
         * enough padding to scroll its last row above it. `env(safe-area-inset-bottom)` is added
         * because on a notched/dock-less phone the bar itself grows by the safe-area inset.
         */
        style={
          isMobile
            ? { paddingBottom: "calc(4.25rem + env(safe-area-inset-bottom, 0px))" }
            : undefined
        }
      >
        <React.Suspense
          fallback={
            /* Reserve a full viewport while the lazy chunk loads. With a 50vh box the
               footer sat at ~683px (inside an 844px phone viewport) and was then pushed
               to ~2446px once StudioView mounted — a 0.19 layout shift on mobile. Keeping
               the placeholder at least one viewport tall means the footer starts and
               stays below the fold, so the swap produces no CLS. */
            <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 text-accent">
              <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-[#f5b73d] animate-spin" />
              <span className="font-mono text-xs tracking-widest text-text-sub uppercase">
                {t("loading_chunk")}
              </span>
            </div>
          }
        >
            {currentTab === "studio" && (
              <ErrorBoundary
                fallbackTitle={t("error_studio_title")}
                fallbackDescription={t("error_studio_desc")}
              >
                {selectedGenre ? (
                  <StudioView
                    selectedGenre={selectedGenre}
                    onSelectGenre={handleSelectStudioGenre}
                    onViewDetail={handleSelectDetailGenre}
                    onOpenChords={() => handleSelectTab("chords")}
                    mobileBottomBar={
                      isShortLandscape && isMobile ? embeddedMobileTabBar : undefined
                    }
                    onAddToCompare={handleAddToCompare}
                    onAudioEngineReady={handleEngineReady}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenGenreMaker={() => navigate({ tab: "maker", customGenreFork: selectedGenre?.id })}
                    onOpenHelp={handleOpenHelp}
                    initialChords={initialChords}
                    onClearInitialChords={() => setInitialChords(null)}
                    initialArpeggio={initialArpeggio}
                    onClearInitialArpeggio={() => setInitialArpeggio(null)}
                    initialMasterclassPattern={initialMasterclassPattern}
                    onClearInitialMasterclassPattern={() => setInitialMasterclassPattern(null)}
                    initialOpenPianoRollTrack={initialOpenPianoRollTrack}
                    onClearInitialOpenPianoRollTrack={() => setInitialOpenPianoRollTrack(null)}
                    initialAutoPlay={initialAutoPlay}
                    onClearInitialAutoPlay={() => setInitialAutoPlay(false)}
                  />
                ) : (
                  <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 min-h-[100dvh]">
                    <div className="flex items-center justify-between">
                      <Skeleton variant="line" className="w-48 h-10" />
                      <Skeleton variant="rect" className="w-32 h-10" />
                    </div>
                    <Skeleton variant="card" className="h-96" />
                  </div>
                )}
              </ErrorBoundary>
            )}

            {currentTab === "chords" && (
              <ErrorBoundary
                fallbackTitle={t("error_chord_title")}
                fallbackDescription={t("error_chord_desc")}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                <ChordProgressionsView
                  onOpenStudioWithChords={(chords, options) => {
                    setInitialChords(chords);
                    if (options?.openPianoRoll) {
                      setInitialOpenPianoRollTrack("chords");
                    }
                    handleSelectTab("studio");
                  }}
                  onOpenStudioWithArpeggio={(baked, label) => {
                    setInitialArpeggio({ baked, label });
                    handleSelectTab("studio");
                  }}
                  onOpenHelp={() => handleOpenHelp("theory")}
                />
              </ErrorBoundary>
            )}

            {currentTab === "kick" && (
              <ErrorBoundary
                fallbackTitle={isZh ? "底鼓设计实验室运行异常" : "Kick Design View Error"}
                fallbackDescription={isZh ? "音频引擎或可视化渲染异常，可尝试重试或返回主工作台。" : "Audio engine or visualizer encountered an error."}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                <KickAnatomyView
                  onOpenHelp={() => handleOpenHelp("mixing")}
                  onOpenStudio={() => handleSelectTab("studio")}
                />
              </ErrorBoundary>
            )}

            {currentTab === "analyzer" && (
              <ErrorBoundary
                fallbackTitle={isZh ? "全景声谱分析仪加载异常" : "Analyzer Loading Error"}
                fallbackDescription={isZh ? "声学分析模块初始化发生错误" : "An error occurred initializing the acoustic analyzer."}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                <AnalyzerView
                  onOpenStudio={() => handleSelectTab("studio")}
                  onOpenHelp={() => handleOpenHelp("mixing")}
                  externalAnalyser={engineInstance?.getMasterAnalyser()}
                  externalAnalyserL={engineInstance?.getStereoAnalysers().left}
                  externalAnalyserR={engineInstance?.getStereoAnalysers().right}
                  isExternalPlaying={isPlaying}
                />
              </ErrorBoundary>
            )}

            {currentTab === "console" && (
              <ErrorBoundary
                fallbackTitle={t("console_title")}
                fallbackDescription={t("console_subtitle")}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                {selectedGenre ? (
                  <HardwareConsoleView
                    selectedGenre={selectedGenre}
                    onOpenStudio={handleOpenStudioWithGenre}
                    onOpenHelp={() => handleOpenHelp("mixing")}
                  />
                ) : (
                  <div className="max-w-7xl mx-auto px-4 py-8">
                    <Skeleton variant="card" className="h-96" />
                  </div>
                )}
              </ErrorBoundary>
            )}

            {currentTab === "masterclass" && (
              <ErrorBoundary
                fallbackTitle={t("error_masterclass_title")}
                fallbackDescription={t("error_masterclass_desc")}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                <MasterclassView
                  initialLessonId={route.masterclassId}
                  onOpenStudio={({ pattern, label }) => {
                    setInitialMasterclassPattern({ pattern, label });
                    handleSelectTab("studio");
                  }}
                  onSelectGenre={handleSelectDetailGenre}
                  onOpenHelp={() => handleOpenHelp("tutorials")}
                />
              </ErrorBoundary>
            )}

            {currentTab === "galaxy" && (
              <ErrorBoundary
                fallbackTitle={t("error_galaxy_title")}
                fallbackDescription={t("error_galaxy_desc")}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
                onNavigateAlternative={() => handleSelectTab("horizontal-timeline")}
                alternativeLabel={t("btn_browse_timeline")}
              >
                <GalaxyView
                  onSelectGenre={handleSelectDetailGenre}
                  onOpenStudio={handleOpenStudioWithGenre}
                  onOpenHelp={() => handleOpenHelp("tutorials")}
                />
              </ErrorBoundary>
            )}

            {currentTab === "horizontal-timeline" && (
              <ErrorBoundary
                fallbackTitle={t("error_timeline_h_title")}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                <HorizontalTimelineView
                  onSelectGenre={handleSelectDetailGenre}
                  onOpenStudio={handleOpenStudioWithGenre}
                  onOpenHelp={() => handleOpenHelp("tutorials")}
                />
              </ErrorBoundary>
            )}

            {currentTab === "vertical-timeline" && (
              <ErrorBoundary
                fallbackTitle={t("error_timeline_v_title")}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                <VerticalTimelineView
                  onSelectGenre={handleSelectDetailGenre}
                  onOpenStudio={handleOpenStudioWithGenre}
                  onOpenHelp={() => handleOpenHelp("tutorials")}
                />
              </ErrorBoundary>
            )}

            {currentTab === "compare" && (
              <ErrorBoundary
                fallbackTitle={t("error_compare_title")}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                <CompareView
                  initialGenres={comparePool}
                  onSelectGenre={handleSelectDetailGenre}
                  onOpenStudio={handleOpenStudioWithGenre}
                />
              </ErrorBoundary>
            )}

            {currentTab === "challenge" && (
              <ErrorBoundary
                fallbackTitle={t("error_challenge_title")}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                <ChallengeView
                  onSelectGenre={handleSelectDetailGenre}
                  onOpenStudio={handleOpenStudioWithGenre}
                />
              </ErrorBoundary>
            )}

            {currentTab === "maker" && (
              <ErrorBoundary
                fallbackTitle={isZh ? "曲风工坊加载异常" : "Custom Genre Maker Error"}
                fallbackDescription={isZh ? "工坊工作区初始化异常，可尝试返回主工作台。" : "Custom Genre Maker failed to initialize."}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                <CustomGenreMakerView
                  initialSharePayload={route.customGenreShare}
                  initialForkId={route.customGenreFork}
                  onOpenStudio={handleOpenStudioWithGenre}
                  onSelectGenre={handleSelectDetailGenre}
                  onOpenHelp={() => handleOpenHelp("tutorials")}
                />
              </ErrorBoundary>
            )}

            {currentTab === "detail" && (
              <ErrorBoundary
                fallbackTitle={t("error_detail_title")}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={t("btn_return_studio")}
              >
                {selectedGenre ? (
                  <GenreDetailView
                    genre={selectedGenre}
                    onBack={() => handleSelectTab("studio")}
                    onSelectGenre={handleSelectDetailGenre}
                    onOpenStudio={handleOpenStudioWithGenre}
                    onAddToCompare={handleAddToCompare}
                    onForkInMaker={(g) => navigate({ tab: "maker", customGenreFork: g.id })}
                  />
                ) : (
                  <div className="max-w-5xl mx-auto px-4 py-12 space-y-6 min-h-[100dvh]">
                    <Skeleton variant="line" className="w-1/3 h-8" />
                    <Skeleton variant="card" className="h-64" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Skeleton variant="card" className="h-48" />
                      <Skeleton variant="card" className="h-48" />
                    </div>
                  </div>
                )}
              </ErrorBoundary>
            )}
        </React.Suspense>
      </main>

      {/**
       * Phone shell. The tab bar is a sibling of `main` rather than inside it so it is unaffected
       * by any view's own layout, and `main` gets matching bottom padding so the bar never covers
       * the last row of a view — the classic fixed-bar bug.
       */}
      {isMobile && (
        <>
          {/*
            In a short landscape viewport the studio puts this bar on the *same* bottom row as its
            transport (via `mobileBottomBar`), so rendering it fixed here too would show two copies.
            Every other view keeps it fixed.
          */}
          {!(isShortLandscape && currentTab === "studio") && mobileTabBar}
          <MobileMoreSheet
            open={mobileSheetOpen}
            onClose={() => setMobileSheetOpen(false)}
            onSelectTab={(tab) => {
              setMobileSheetOpen(false);
              handleSelectTab(tab);
            }}
            onAction={handleMobileSheetAction}
          />
        </>
      )}

      {/* Persistent Footer */}
      <footer className="w-full bg-bg border-t border-line py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-dim">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_#f5b73d]" />
            <span className="font-[Space_Grotesk] font-bold text-text">
              GROOVE LAB
            </span>
            <span>·</span>
            <span>159 Synthetic Genres & Realtime Audio Synthesis</span>
          </div>

          <div className="hidden md:flex items-center gap-4 text-text-sub">
            <button
              onClick={() => handleSelectTab("studio")}
              className="hover:text-text transition-colors"
            >
              {t("nav_studio")}
            </button>
            <button
              onClick={() => handleSelectTab("masterclass")}
              className="hover:text-text transition-colors"
            >
              {t("nav_masterclass")}
            </button>
            <button
              onClick={() => handleSelectTab("analyzer")}
              className="hover:text-text transition-colors"
            >
              {t("nav_analyzer")}
            </button>
            <button
              onClick={() => handleSelectTab("galaxy")}
              className="hover:text-text transition-colors"
            >
              {t("nav_galaxy")}
            </button>
            <button
              onClick={() => handleSelectTab("compare")}
              className="hover:text-text transition-colors"
            >
              {t("nav_compare")}
            </button>
            <button
              onClick={() => handleSelectTab("challenge")}
              className="hover:text-text transition-colors"
            >
              {t("nav_challenge")}
            </button>
          </div>

          <div className="flex items-center gap-3 text-text-dim">
            <button
              onClick={() => setUpdatesOpen(true)}
              className="hover:text-accent transition-colors flex items-center gap-1.5 font-mono text-[11px]"
              title={t("footer_check_updates")}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>v{CURRENT_CLIENT_VERSION}</span>
              <span className="ml-1">{t("footer_updates_btn")}</span>
            </button>
            <span>•</span>
            <span>Web Audio Pure Synthesis</span>
          </div>
        </div>
      </footer>

      {/* In-App Check Updates & Changelog Modal */}
      <UpdatesModal
        isOpen={updatesOpen}
        onClose={() => setUpdatesOpen(false)}
      />

      {/* Keyboard Shortcuts Guide Modal (P2-20) */}
      <ShortcutsModal
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        onOpenHelp={() => {
          setShortcutsOpen(false);
          handleOpenHelp("shortcuts");
        }}
      />

      {/* User Manual & Interactive Learning Center Modal */}
      {helpOpen && (
        <React.Suspense fallback={null}>
          <HelpCenterModal
            isOpen={helpOpen}
            initialCategory={helpCategory}
            onClose={() => {
              setHelpOpen(false);
              setHelpCategory(undefined);
            }}
            onSelectTab={handleSelectTab}
            onOpenShortcuts={() => {
              setHelpOpen(false);
              setShortcutsOpen(true);
            }}
            onStartTutorial={handleStartTutorial}
            onOpenOnboarding={() => {
              setHelpOpen(false);
              setOnboardingOpen(true);
            }}
          />
        </React.Suspense>
      )}

      {/* Interactive Hands-on Tutorial Coach Dock */}
      {activeTutorial && (
        <InteractiveTutorialCoach
          courseId={activeTutorial.courseId}
          stepIndex={activeTutorial.stepIndex}
          onStepChange={(newStep) =>
            setActiveTutorial((prev) => (prev ? { ...prev, stepIndex: newStep } : null))
          }
          onClose={() => setActiveTutorial(null)}
          onNavigateTab={handleSelectTab}
        />
      )}

      {/* New User Onboarding Tour Modal */}
      <NewUserOnboardingModal
        isOpen={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        onStartLesson1={() => {
          setOnboardingOpen(false);
          handleSelectTab("studio");
          setActiveTutorial({ courseId: "drum", stepIndex: 0 });
        }}
        onStartStudio={() => {
          setOnboardingOpen(false);
          handleSelectTab("studio");
        }}
        /**
         * U2: the guide's single action. One click gets the user to a sound: switch to the studio and
         * ask it to play as soon as its engine is up. Deliberately does not mark the guide completed —
         * hearing the groove is not the same as finishing it, and the guide can be replayed from
         * Settings.
         */
        onAudition={() => {
          setOnboardingOpen(false);
          handleSelectTab("studio");
          setInitialAutoPlay(true);
        }}
      />


      {/* Global settings panel (item ⑤): the app-level, non-per-track parameters. */}
      <React.Suspense fallback={null}>
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        engine={engineInstance}
        gs1Enabled={gs1Enabled}
        onToggleGs1={() => setGs1Enabled(!gs1Enabled)}
        /** U2: a guide dismissed without being finished must be recoverable. */
        onReplayOnboarding={() => {
          try {
            localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
          } catch {
            // A storage that refuses to forget is not a reason to refuse the replay.
          }
          setSettingsOpen(false);
          setOnboardingOpen(true);
        }}
        onOpenUpdates={() => {
          setSettingsOpen(false);
          setUpdatesOpen(true);
        }}
      />
      </React.Suspense>

      {/* Global Singleton Toast Container */}
      <ToastContainer position="bottom" />

      {/* Screen Reader Live Region (P2-17) */}
      <AriaLiveRegion />
    </div>
  );
};

export function App() {
  return (
    <ErrorBoundary fallbackTitle="应用遇到未知错误 / Application Error">
      <LanguageProvider>
        <RouterProvider>
          <MainApp />
        </RouterProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
