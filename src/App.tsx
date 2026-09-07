import React, { useState, useEffect, useRef } from "react";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { Header, NavTab } from "./components/Header";
import { GlobalSearch } from "./components/GlobalSearch";
import { Breadcrumbs } from "./components/Breadcrumbs";
import { StudioView } from "./views/StudioView";
import { GalaxyView } from "./views/GalaxyView";
import { HorizontalTimelineView } from "./views/HorizontalTimelineView";
import { VerticalTimelineView } from "./views/VerticalTimelineView";
import { CompareView } from "./views/CompareView";
import { ChallengeView } from "./views/ChallengeView";
import { GenreDetailView } from "./views/GenreDetailView";
import { Genre } from "./types/genre";
import { ALL_GENRES, GENRES_MAP } from "./data/genres";
import { AudioEngine } from "./audio/AudioEngine";
import { Disc3, Sparkles } from "lucide-react";

const MainApp: React.FC = () => {
  const { t, language } = useLanguage();

  const [currentTab, setCurrentTab] = useState<NavTab>("studio");
  const [selectedGenre, setSelectedGenre] = useState<Genre>(() => GENRES_MAP["future-bass"] || GENRES_MAP["chicago-house"] || ALL_GENRES[0]);
  const [comparePool, setComparePool] = useState<Genre[]>(() => [
    GENRES_MAP["chicago-house"] || ALL_GENRES[0],
    GENRES_MAP["berlin-techno"] || ALL_GENRES[1],
  ]);
  const [searchOpen, setSearchOpen] = useState(false);

  // Audio analyser for Header live spectrum visualizer
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Sync with browser URL search params
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const genreId = params.get("genre");
      const tabParam = params.get("tab") as NavTab | null;

      if (genreId && GENRES_MAP[genreId]) {
        setSelectedGenre(GENRES_MAP[genreId]);
        if (tabParam === "detail") {
          setCurrentTab("detail");
        }
      } else if (tabParam) {
        setCurrentTab(tabParam);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleSelectGenre = (genre: Genre, action?: "detail" | "studio") => {
    setSelectedGenre(genre);
    if (action === "studio") {
      setCurrentTab("studio");
    } else {
      setCurrentTab("detail");
    }
  };

  const handleOpenStudioWithGenre = (genre: Genre) => {
    setSelectedGenre(genre);
    setCurrentTab("studio");
  };

  const handleAddToCompare = (genre: Genre) => {
    setComparePool((prev) => {
      if (prev.some((g) => g.id === genre.id)) return prev;
      return [...prev, genre].slice(0, 4);
    });
    setCurrentTab("compare");
  };

  const handleEngineReady = (engine: AudioEngine) => {
    setAnalyser(engine.getAnalyser());
    // Interval check for playing state for header visualizer
    const checkPlaying = () => {
      setIsPlaying(engine.getIsPlaying());
    };
    const id = setInterval(checkPlaying, 100);
    return () => clearInterval(id);
  };

  return (
    <div className="min-h-screen bg-[#0a0b0d] text-[#e9e7e0] flex flex-col font-sans selection:bg-[#f5b73d]/25 selection:text-[#f5b73d]">
      {/* Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenSearch={() => setSearchOpen(true)}
        onRandomGenre={(genre) => {
          setSelectedGenre(genre);
          setCurrentTab("studio");
        }}
        analyser={analyser}
        isPlaying={isPlaying}
      />

      {/* Global Search Dialog */}
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectGenre={handleSelectGenre}
      />

      {/* Breadcrumbs Navigation - Only shown on genre detail view to avoid redundancy with top navbar */}
      {currentTab === "detail" && (
        <Breadcrumbs
          genre={selectedGenre}
          onNavigateHome={() => setCurrentTab("studio")}
        />
      )}

      {/* Main Viewport */}
      <main className="flex-1 w-full pb-12">
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
      </main>

      {/* Persistent Footer */}
      <footer className="w-full bg-[#0a0b0d] border-t border-[#23262d] py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#5a5e68]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#f5b73d] shadow-[0_0_8px_#f5b73d]" />
            <span className="font-[Space_Grotesk] font-bold text-[#e9e7e0]">
              GROOVE ATLAS
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

          <div className="flex items-center gap-1 text-[#5a5e68]">
            <span>Web Audio Pure Synthesis</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export function App() {
  return (
    <LanguageProvider>
      <MainApp />
    </LanguageProvider>
  );
}

export default App;
