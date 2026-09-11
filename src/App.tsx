import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { Header, NavTab } from "./components/Header";
import { GlobalSearch } from "./components/GlobalSearch";
import { Genre } from "./types/genre";
import { ALL_GENRES, GENRES_MAP } from "./data/genres";
import { AudioEngine } from "./audio/AudioEngine";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ChordDefinition } from "./utils/chordTheory";
import { UpdatesModal, CURRENT_CLIENT_VERSION } from "./components/UpdatesModal";
import { ToastContainer } from "./ui";

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

  const VALID_TABS: NavTab[] = useMemo(() => [
    "studio",
    "chords",
    "galaxy",
    "horizontal-timeline",
    "vertical-timeline",
    "compare",
    "challenge",
    "detail",
  ], []);

  // Initialize currentTab from URL search param if present
  const [currentTab, setCurrentTab] = useState<NavTab>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab") as NavTab | null;
      if (tab && [
        "studio",
        "chords",
        "galaxy",
        "horizontal-timeline",
        "vertical-timeline",
        "compare",
        "challenge",
        "detail",
      ].includes(tab)) {
        return tab;
      }
      if (params.get("genre") && GENRES_MAP[params.get("genre")!]) {
        return "detail";
      }
    }
    return "studio";
  });

  // Initialize selectedGenre from URL search param if present
  const [selectedGenre, setSelectedGenre] = useState<Genre>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const genreId = params.get("genre");
      if (genreId && GENRES_MAP[genreId]) {
        return GENRES_MAP[genreId];
      }
    }
    return GENRES_MAP["future-bass"] || GENRES_MAP["chicago-house"] || ALL_GENRES[0];
  });

  const [comparePool, setComparePool] = useState<Genre[]>(() => [
    GENRES_MAP["chicago-house"] || ALL_GENRES[0],
    GENRES_MAP["berlin-techno"] || ALL_GENRES[1],
  ]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [initialChords, setInitialChords] = useState<ChordDefinition[] | null>(null);

  // Audio analyser for Header live spectrum visualizer
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Synchronize state changes to browser address bar URL (P1-08)
  const syncUrl = useCallback((tab: NavTab, genreId?: string, replace = false) => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (tab === "studio" && !genreId) {
        url.searchParams.delete("tab");
        url.searchParams.delete("genre");
      } else {
        url.searchParams.set("tab", tab);
        if (genreId) {
          url.searchParams.set("genre", genreId);
        } else if (tab !== "detail") {
          url.searchParams.delete("genre");
        }
      }
      const newUrl = url.pathname + (url.search ? url.search : "");
      const currentUrl = window.location.pathname + (window.location.search ? window.location.search : "");
      if (replace) {
        window.history.replaceState({ tab, genreId }, "", newUrl);
      } else if (newUrl !== currentUrl) {
        window.history.pushState({ tab, genreId }, "", newUrl);
      }
    } catch {
      // Ignored in environments where window.history is restricted
    }
  }, []);

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

  // Sync with browser URL search params & back/forward navigation (P1-08)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const genreId = params.get("genre");
      const tabParam = params.get("tab") as NavTab | null;

      if (genreId && GENRES_MAP[genreId]) {
        setSelectedGenre(GENRES_MAP[genreId]);
      }
      if (tabParam && VALID_TABS.includes(tabParam)) {
        setCurrentTab(tabParam);
      } else if (genreId && GENRES_MAP[genreId]) {
        setCurrentTab("detail");
      } else {
        setCurrentTab("studio");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [VALID_TABS]);

  // Normalize URL on initial mount
  useEffect(() => {
    syncUrl(currentTab, currentTab === "detail" ? selectedGenre.id : undefined, true);
  }, [currentTab, selectedGenre.id, syncUrl]);

  const handleSelectTab = useCallback((tab: NavTab) => {
    setCurrentTab(tab);
    syncUrl(tab, tab === "detail" ? selectedGenre.id : undefined);
  }, [selectedGenre.id, syncUrl]);

  const handleSelectGenre = useCallback((genre: Genre, action?: "detail" | "studio") => {
    setSelectedGenre(genre);
    const targetTab: NavTab = action === "studio" ? "studio" : "detail";
    setCurrentTab(targetTab);
    syncUrl(targetTab, genre.id);
  }, [syncUrl]);

  const handleOpenStudioWithGenre = useCallback((genre: Genre) => {
    setSelectedGenre(genre);
    setCurrentTab("studio");
    syncUrl("studio", genre.id);
  }, [syncUrl]);

  const handleAddToCompare = useCallback((genre: Genre) => {
    setComparePool((prev) => {
      if (prev.some((g) => g.id === genre.id)) return prev;
      return [...prev, genre].slice(0, 4);
    });
    setCurrentTab("compare");
    syncUrl("compare");
  }, [syncUrl]);

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
                <StudioView
                  selectedGenre={selectedGenre}
                  onSelectGenre={(g) => setSelectedGenre(g)}
                  onViewDetail={(g) => {
                    setSelectedGenre(g);
                    setCurrentTab("detail");
                  }}
                  onAddToCompare={handleAddToCompare}
                  onAudioEngineReady={handleEngineReady}
                  initialChords={initialChords}
                  onClearInitialChords={() => setInitialChords(null)}
                />
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
                    setCurrentTab("studio");
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
                  onSelectGenre={(g) => {
                    setSelectedGenre(g);
                    setCurrentTab("detail");
                  }}
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
                  onSelectGenre={(g) => {
                    setSelectedGenre(g);
                    setCurrentTab("detail");
                  }}
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
                  onSelectGenre={(g) => {
                    setSelectedGenre(g);
                    setCurrentTab("detail");
                  }}
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
                  onSelectGenre={(g) => {
                    setSelectedGenre(g);
                    setCurrentTab("detail");
                  }}
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
                  onSelectGenre={(g) => {
                    setSelectedGenre(g);
                    setCurrentTab("detail");
                  }}
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
                <GenreDetailView
                  genre={selectedGenre}
                  onBack={() => setCurrentTab("studio")}
                  onSelectGenre={(g) => setSelectedGenre(g)}
                  onOpenStudio={handleOpenStudioWithGenre}
                  onAddToCompare={handleAddToCompare}
                />
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
              onClick={() => setCurrentTab("studio")}
              className="hover:text-text transition-colors"
            >
              {t("nav_studio")}
            </button>
            <button
              onClick={() => setCurrentTab("galaxy")}
              className="hover:text-text transition-colors"
            >
              {t("nav_galaxy")}
            </button>
            <button
              onClick={() => setCurrentTab("compare")}
              className="hover:text-text transition-colors"
            >
              {t("nav_compare")}
            </button>
            <button
              onClick={() => setCurrentTab("challenge")}
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
        <MainApp />
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
