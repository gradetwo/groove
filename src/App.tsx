import React, { useState, useEffect } from "react";
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
import { Sparkles, Disc3, Music2, Heart } from "lucide-react";

const MainApp: React.FC = () => {
  const { t, language } = useLanguage();

  const [currentTab, setCurrentTab] = useState<NavTab>("studio");
  const [selectedGenre, setSelectedGenre] = useState<Genre>(() => GENRES_MAP["chicago-house"] || ALL_GENRES[0]);
  const [comparePool, setComparePool] = useState<Genre[]>(() => [
    GENRES_MAP["chicago-house"] || ALL_GENRES[0],
    GENRES_MAP["berlin-techno"] || ALL_GENRES[1],
  ]);
  const [searchOpen, setSearchOpen] = useState(false);

  // Sync with browser URL search params on mount or popstate
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenSearch={() => setSearchOpen(true)}
        onRandomGenre={(genre) => {
          setSelectedGenre(genre);
          setCurrentTab("studio");
        }}
      />

      {/* Global Search Dialog */}
      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectGenre={handleSelectGenre}
      />

      {/* Breadcrumbs Navigation */}
      {currentTab !== "studio" && (
        <Breadcrumbs
          genre={currentTab === "detail" ? selectedGenre : null}
          currentSection={
            currentTab === "galaxy"
              ? t("nav_galaxy")
              : currentTab === "horizontal-timeline"
              ? t("nav_timeline_h")
              : currentTab === "vertical-timeline"
              ? t("nav_timeline_v")
              : currentTab === "compare"
              ? t("nav_compare")
              : currentTab === "challenge"
              ? t("nav_challenge")
              : undefined
          }
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
      <footer className="w-full bg-neutral-950 border-t border-neutral-900 py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-500">
          <div className="flex items-center space-x-2">
            <Disc3 className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-neutral-400">
              Groove & Genre Odyssey
            </span>
            <span>•</span>
            <span>159 Genres & Realtime Audio Synthesis</span>
          </div>

          <div className="flex items-center space-x-4 text-neutral-400">
            <button
              onClick={() => setCurrentTab("studio")}
              className="hover:text-white transition-colors"
            >
              {t("nav_studio")}
            </button>
            <button
              onClick={() => setCurrentTab("galaxy")}
              className="hover:text-white transition-colors"
            >
              {t("nav_galaxy")}
            </button>
            <button
              onClick={() => setCurrentTab("compare")}
              className="hover:text-white transition-colors"
            >
              {t("nav_compare")}
            </button>
            <button
              onClick={() => setCurrentTab("challenge")}
              className="hover:text-white transition-colors"
            >
              {t("nav_challenge")}
            </button>
          </div>

          <div className="flex items-center space-x-1 text-neutral-600">
            <span>Crafted with Web Audio API</span>
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
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
