import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { Header, NavTab } from "./components/Header";
import { GlobalSearch } from "./components/GlobalSearch";
import { Genre } from "./types/genre";
import { GENRE_INDEX_MAP } from "./data/index/genresIndex";
import { loadGenre } from "./data/index/loader";
import { AudioEngine } from "./audio/AudioEngine";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ChordDefinition } from "./utils/chordTheory";
import { UpdatesModal, CURRENT_CLIENT_VERSION } from "./components/UpdatesModal";
import { ToastContainer, Skeleton } from "./ui";
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

const MainApp: React.FC = () => {
  const { t, language } = useLanguage();
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
  const [initialChords, setInitialChords] = useState<ChordDefinition[] | null>(null);

  // Audio analyser for Header live spectrum visualizer
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
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

  const handleSelectTab = useCallback((tab: NavTab) => {
    navigate({ tab, genreId: tab === "detail" ? selectedGenre?.id : undefined });
  }, [navigate, selectedGenre?.id]);

  const handleSelectGenre = useCallback((genre: { id: string }, action?: "detail" | "studio") => {
    const targetTab: NavTab = action === "studio" ? "studio" : "detail";
    navigate({ tab: targetTab, genreId: genre.id });
  }, [navigate]);

  const handleOpenStudioWithGenre = useCallback((genre: { id: string }) => {
    navigate({ tab: "studio", genreId: genre.id });
  }, [navigate]);

  const handleAddToCompare = useCallback((genre: Genre) => {
    setComparePool((prev) => {
      const next = prev.some((g) => g.id === genre.id) ? prev : [...prev, genre].slice(0, 4);
      navigate({ tab: "compare", compareIds: next.map((g) => g.id) });
      return next;
    });
  }, [navigate]);

  const handleEngineReady = (engine: AudioEngine) => {
    setAnalyser(engine.getAnalyser());
    const id = setInterval(() => {
      setIsPlaying(engine.getIsPlaying());
    }, 100);
    return () => {
      clearInterval(id);
      setIsPlaying(false);
      setAnalyser(null);
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
            <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-accent">
              <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-[#f5b73d] animate-spin" />
              <span className="font-mono text-xs tracking-widest text-text-sub uppercase">
                {language === "zh" ? "正在按需加载曲风模块..." : "Loading Chunk..."}
              </span>
            </div>
          }
        >
            {currentTab === "studio" && (
              <ErrorBoundary
                fallbackTitle={language === "zh" ? "编曲工作台运行异常" : "Studio View Error"}
                fallbackDescription={
                  language === "zh"
                    ? "音频引擎或音序矩阵遇到意外异常，您可以尝试重试。"
                    : "Audio engine or sequencer matrix encountered an unexpected error."
                }
              >
                {selectedGenre ? (
                  <StudioView
                    selectedGenre={selectedGenre}
                    onSelectGenre={(g) => handleSelectGenre(g, "studio")}
                    onViewDetail={(g) => handleSelectGenre(g, "detail")}
                    onAddToCompare={handleAddToCompare}
                    onAudioEngineReady={handleEngineReady}
                    initialChords={initialChords}
                    onClearInitialChords={() => setInitialChords(null)}
                  />
                ) : (
                  <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
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
                fallbackTitle={language === "zh" ? "和弦工作台运行异常" : "Chord Studio Error"}
                fallbackDescription={
                  language === "zh"
                    ? "和弦走向或理论分析模块遇到异常，可重试或返回主工作台。"
                    : "Chord progression analysis encountered an error. You can retry or return to Studio."
                }
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={language === "zh" ? "返回工作台" : "Studio"}
              >
                <ChordProgressionsView
                  onOpenStudioWithChords={(chords) => {
                    setInitialChords(chords);
                    handleSelectTab("studio");
                  }}
                />
              </ErrorBoundary>
            )}

            {currentTab === "galaxy" && (
              <ErrorBoundary
                fallbackTitle={language === "zh" ? "3D 星系星云运行异常" : "3D Galaxy View Error"}
                fallbackDescription={
                  language === "zh"
                    ? "WebGL 3D 渲染器或粒子系统遇到异常，可尝试重试或切换至时间线浏览曲风。"
                    : "WebGL renderer encountered an issue. You can retry or switch to Timeline view."
                }
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={language === "zh" ? "返回工作台" : "Studio"}
                onNavigateAlternative={() => handleSelectTab("horizontal-timeline")}
                alternativeLabel={language === "zh" ? "浏览时间线" : "Timeline"}
              >
                <GalaxyView
                  onSelectGenre={(g) => handleSelectGenre(g, "detail")}
                  onOpenStudio={handleOpenStudioWithGenre}
                />
              </ErrorBoundary>
            )}

            {currentTab === "horizontal-timeline" && (
              <ErrorBoundary
                fallbackTitle={language === "zh" ? "年代演化时间线异常" : "Timeline View Error"}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={language === "zh" ? "返回工作台" : "Studio"}
              >
                <HorizontalTimelineView
                  onSelectGenre={(g) => handleSelectGenre(g, "detail")}
                  onOpenStudio={handleOpenStudioWithGenre}
                />
              </ErrorBoundary>
            )}

            {currentTab === "vertical-timeline" && (
              <ErrorBoundary
                fallbackTitle={language === "zh" ? "纵向编年史异常" : "Vertical Timeline Error"}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={language === "zh" ? "返回工作台" : "Studio"}
              >
                <VerticalTimelineView
                  onSelectGenre={(g) => handleSelectGenre(g, "detail")}
                  onOpenStudio={handleOpenStudioWithGenre}
                />
              </ErrorBoundary>
            )}

            {currentTab === "compare" && (
              <ErrorBoundary
                fallbackTitle={language === "zh" ? "双曲风对比工作台异常" : "Compare View Error"}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={language === "zh" ? "返回工作台" : "Studio"}
              >
                <CompareView
                  initialGenres={comparePool}
                  onSelectGenre={(g) => handleSelectGenre(g, "detail")}
                  onOpenStudio={handleOpenStudioWithGenre}
                />
              </ErrorBoundary>
            )}

            {currentTab === "challenge" && (
              <ErrorBoundary
                fallbackTitle={language === "zh" ? "听辨挑战模块异常" : "Challenge View Error"}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={language === "zh" ? "返回工作台" : "Studio"}
              >
                <ChallengeView
                  onSelectGenre={(g) => handleSelectGenre(g, "detail")}
                  onOpenStudio={handleOpenStudioWithGenre}
                />
              </ErrorBoundary>
            )}

            {currentTab === "detail" && (
              <ErrorBoundary
                fallbackTitle={language === "zh" ? "曲风档案详情异常" : "Genre Detail Error"}
                onNavigateHome={() => handleSelectTab("studio")}
                homeLabel={language === "zh" ? "返回工作台" : "Studio"}
              >
                {selectedGenre ? (
                  <GenreDetailView
                    genre={selectedGenre}
                    onBack={() => handleSelectTab("studio")}
                    onSelectGenre={(g) => handleSelectGenre(g, "detail")}
                    onOpenStudio={handleOpenStudioWithGenre}
                    onAddToCompare={handleAddToCompare}
                  />
                ) : (
                  <div className="max-w-5xl mx-auto px-4 py-12 space-y-6">
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
              title={language === "zh" ? "检查更新与版本记录" : "Check updates & changelog"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span>v{CURRENT_CLIENT_VERSION}</span>
              <span className="ml-1">{language === "zh" ? "更新记录" : "Updates"}</span>
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

      {/* Global Singleton Toast Container */}
      <ToastContainer position="bottom" />
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
