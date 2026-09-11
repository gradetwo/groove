import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { Header, NavTab } from "./components/Header";
import { GlobalSearch } from "./components/GlobalSearch";
import { Genre } from "./types/genre";
import { ALL_GENRES, GENRES_MAP } from "./data/genres";
import { AudioEngine } from "./audio/AudioEngine";
import { Disc3, Sparkles } from "lucide-react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ChordDefinition } from "./utils/chordTheory";
import { UpdatesModal, CURRENT_CLIENT_VERSION } from "./components/UpdatesModal";

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
    <div className="min-h-screen bg-[#0a0b0d] text-[#e9e7e0] flex flex-col font-sans selection:bg-[#f5b73d]/25 selection:text-[#f5b73d]">
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
            <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-[#f5b73d]">
              <div className="w-8 h-8 rounded-full border-2 border-[#f5b73d]/30 border-t-[#f5b73d] animate-spin" />
              <span className="font-mono text-xs tracking-widest text-[#8b8f99] uppercase">
                {language === "zh" ? "正在按需加载曲风模块..." : "Loading Chunk..."}
              </span>
            </div>
          }
        >
          <ErrorBoundary>
            {currentTab === "studio" && (
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
            )}

            {currentTab === "chords" && (
              <ChordProgressionsView
                onOpenStudioWithChords={(chords) => {
                  setInitialChords(chords);
                  setCurrentTab("studio");
                }}
              />
            )}

            {currentTab === "galaxy" && (
              <GalaxyView
                onSelectGenre={(g) => {
                  setSelectedGenre(g);
                  setCurrentTab("detail");
                }}
                onOpenStudio={handleOpenStudioWithGenre}
              />
            )}

            {currentTab === "horizontal-timeline" && (
              <HorizontalTimelineView
                onSelectGenre={(g) => {
                  setSelectedGenre(g);
                  setCurrentTab("detail");
                }}
                onOpenStudio={handleOpenStudioWithGenre}
              />
            )}

            {currentTab === "vertical-timeline" && (
              <VerticalTimelineView
                onSelectGenre={(g) => {
                  setSelectedGenre(g);
                  setCurrentTab("detail");
                }}
                onOpenStudio={handleOpenStudioWithGenre}
              />
            )}

            {currentTab === "compare" && (
              <CompareView
                initialGenres={comparePool}
                onSelectGenre={(g) => {
                  setSelectedGenre(g);
                  setCurrentTab("detail");
                }}
                onOpenStudio={handleOpenStudioWithGenre}
              />
            )}

            {currentTab === "challenge" && (
              <ChallengeView
                onSelectGenre={(g) => {
                  setSelectedGenre(g);
                  setCurrentTab("detail");
                }}
                onOpenStudio={handleOpenStudioWithGenre}
              />
            )}

            {currentTab === "detail" && (
              <GenreDetailView
                genre={selectedGenre}
                onBack={() => setCurrentTab("studio")}
                onSelectGenre={(g) => setSelectedGenre(g)}
                onOpenStudio={handleOpenStudioWithGenre}
                onAddToCompare={handleAddToCompare}
              />
            )}
          </ErrorBoundary>
        </React.Suspense>
      </main>

      {/* Persistent Footer */}
      <footer className="w-full bg-[#0a0b0d] border-t border-[#23262d] py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#5a5e68]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#f5b73d] shadow-[0_0_8px_#f5b73d]" />
            <span className="font-[Space_Grotesk] font-bold text-[#e9e7e0]">
              GROOVE LAB
            </span>
            <span>·</span>
            <span>159 Synthetic Genres & Realtime Audio Synthesis</span>
          </div>

          <div className="flex items-center gap-4 text-[#8b8f99]">
            <button
              onClick={() => setCurrentTab("studio")}
              className="hover:text-[#e9e7e0] transition-colors"
            >
              {t("nav_studio")}
            </button>
            <button
              onClick={() => setCurrentTab("galaxy")}
              className="hover:text-[#e9e7e0] transition-colors"
            >
              {t("nav_galaxy")}
            </button>
            <button
              onClick={() => setCurrentTab("compare")}
              className="hover:text-[#e9e7e0] transition-colors"
            >
              {t("nav_compare")}
            </button>
            <button
              onClick={() => setCurrentTab("challenge")}
              className="hover:text-[#e9e7e0] transition-colors"
            >
              {t("nav_challenge")}
            </button>
          </div>

          <div className="flex items-center gap-3 text-[#5a5e68]">
            <button
              onClick={() => setUpdatesOpen(true)}
              className="hover:text-[#f5b73d] transition-colors flex items-center gap-1.5 font-mono text-[11px]"
              title={language === "zh" ? "检查更新与版本记录" : "Check updates & changelog"}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#f5b73d] animate-pulse" />
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
