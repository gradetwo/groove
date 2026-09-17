import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { Header, NavTab } from "./components/Header";
import { SettingsModal } from "./components/settings/SettingsModal";
import { useGs1Setting } from "./features/sequencer/useGs1Setting";
import { GlobalSearch } from "./components/GlobalSearch";
import { Genre, SequencerPattern } from "./types/genre";
import { GENRE_INDEX_MAP } from "./data/index/genresIndex";
import { loadGenre } from "./data/index/loader";
import { AudioEngine } from "./audio/AudioEngine";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ChordDefinition } from "./utils/chordTheory";
import { BakedArpeggioResult } from "./utils/arpeggiatorTheory";
import { UpdatesModal, CURRENT_CLIENT_VERSION } from "./components/UpdatesModal";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { HelpCenterModal, type HelpCategory } from "./components/help/HelpCenterModal";
import { useAppShortcuts } from "./hooks/useAppShortcuts";
import { ToastContainer, Skeleton, AriaLiveRegion, announcer } from "./ui";
import { RouterProvider, useRouter } from "./app/router";

// Code splitting & lazy loading chunks for optimal performance
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
const HardwareConsoleView = React.lazy(() => import("./views/HardwareConsoleView").then((m) => ({ default: m.HardwareConsoleView })));

const MainApp: React.FC = () => {
  const { t, isZh } = useLanguage();
  const { route, navigate } = useRouter();

  const currentTab = route.tab;

  // On-demand asynchronous genre loading (P1-13)
  const targetGenreId = route.genreId || "chicago-house";
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);

  useEffect(() => {
    let isMounted = true;
    loadGenre(targetGenreId).then((g) => {
      if (isMounted && g) {
        setSelectedGenre(g);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [targetGenreId]);

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

  const handleOpenHelp = useCallback((category?: string) => {
    setHelpCategory(category as HelpCategory | undefined);
    setHelpOpen(true);
  }, []);

  const handleSelectTab = useCallback((tab: NavTab) => {
    navigate({ tab, genreId: tab === "detail" || tab === "console" ? selectedGenre?.id : undefined });
  }, [navigate, selectedGenre?.id]);


  // Global Keyboard Shortcuts (P2-20: '?' help panel and 'g'+key navigation)
  const { shortcutsOpen, setShortcutsOpen } = useAppShortcuts({
    onNavigateTab: handleSelectTab,
    isZh,
  });

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

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col font-sans selection:bg-accent/25 selection:text-accent">
      {/* Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onOpenSearch={() => setSearchOpen(true)}
        onRandomGenre={handleOpenStudioWithGenre}
        onOpenUpdates={() => setUpdatesOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
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
      <main className="flex-1 w-full pb-12">
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

          <div className="flex items-center gap-4 text-text-sub">
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
      />


      {/* Global settings panel (item ⑤): the app-level, non-per-track parameters. */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        engine={engineInstance}
        gs1Enabled={gs1Enabled}
        onToggleGs1={() => setGs1Enabled(!gs1Enabled)}
        onOpenUpdates={() => {
          setSettingsOpen(false);
          setUpdatesOpen(true);
        }}
      />

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
