import React, { useState, useEffect, useRef } from "react";
import { Search, X, Music, Sliders, ExternalLink, Sparkles, Compass, Columns, History, Trash2 } from "lucide-react";
import { GENRE_INDEX, GenreIndexItem } from "../data/index/genresIndex";
import { useLanguage } from "../i18n/LanguageContext";
import { isBpmInRange } from "../utils/bpm";
import { Modal } from "../ui";

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGenre: (genre: { id: string }, action?: "detail" | "studio" | "galaxy" | "compare") => void;
}

const RECENT_SEARCHES_KEY = "groove_search_history_v1";

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  isOpen,
  onClose,
  onSelectGenre,
}) => {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  const saveRecentSearch = (term: string) => {
    if (!term || !term.trim()) return;
    const trimmed = term.trim();
    setRecentSearches((prev) => {
      const updated = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleClearHistory = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
  };

  // Global hotkey: Cmd+K or Ctrl+K & Escape (P0-23)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered genres with full match count (P3-18)
  const { filteredGenres, totalMatches } = React.useMemo(() => {
    if (!query.trim()) {
      return { filteredGenres: GENRE_INDEX.slice(0, 8), totalMatches: 8 };
    }
    const q = query.trim().toLowerCase();
    const numQ = parseInt(q, 10);

    const matches = GENRE_INDEX.filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true;
      if (g.aliases.some((a) => a.toLowerCase().includes(q))) return true;
      if (g.category.toLowerCase().includes(q)) return true;
      if (g.subgenres && g.subgenres.some((s) => s.toLowerCase().includes(q))) return true;
      if (!isNaN(numQ) && numQ > 20 && numQ < 400) {
        if (isBpmInRange(numQ, g.bpm_range, 4)) return true;
      }
      if (!isNaN(numQ) && g.origin_year.includes(q)) return true;
      return false;
    });

    return {
      filteredGenres: matches.slice(0, 15),
      totalMatches: matches.length,
    };
  }, [query]);

  const handleExecuteSelect = (genre: GenreIndexItem, action: "detail" | "studio" | "galaxy" | "compare") => {
    saveRecentSearch(genre.name);
    onSelectGenre(genre, action);
    onClose();
  };

  // Keyboard navigation & quick action shortcuts (P3-18)
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredGenres.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredGenres.length) % Math.max(1, filteredGenres.length));
    } else if (filteredGenres[selectedIndex]) {
      const activeGenre = filteredGenres[selectedIndex];
      if (e.key === "Enter") {
        e.preventDefault();
        handleExecuteSelect(activeGenre, "detail");
      } else if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleExecuteSelect(activeGenre, "studio");
      } else if (e.altKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleExecuteSelect(activeGenre, "galaxy");
      } else if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleExecuteSelect(activeGenre, "compare");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      showCloseButton={false}
      overlayClassName="items-start pt-16 sm:pt-24"
      initialFocusRef={inputRef}
      ariaLabel={t("search_placeholder")}
      className="max-h-[85vh] flex flex-col"
    >
      {/* Search Input Bar */}
      <div className="flex items-center px-4 py-3.5 border-b border-line bg-panel2 shrink-0">
        <Search className="w-5 h-5 text-accent mr-3 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          className="w-full bg-transparent text-text placeholder-text-dim text-base sm:text-lg focus:outline-none"
          placeholder={t("search_placeholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-text-sub hover:text-white p-1 mr-1 transition-colors"
            title="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded bg-panel2 text-text-sub hover:text-text border border-line"
        >
          ESC
        </button>
      </div>

      {/* Recent Searches Header (P3-18) */}
      {!query && recentSearches.length > 0 && (
        <div className="px-4 py-2 bg-[#121319] border-b border-line-subtle flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center space-x-1.5 text-text-sub">
            <History className="w-3.5 h-3.5 text-accent" />
            <span className="font-bold">{t("search_recent_title")}</span>
          </div>
          <button
            onClick={handleClearHistory}
            className="text-text-dim hover:text-rose-400 flex items-center space-x-1 transition-colors"
            title={t("search_clear_history")}
          >
            <Trash2 className="w-3 h-3" />
            <span>{t("search_clear_history")}</span>
          </button>
        </div>
      )}

      {/* Recent Searches Tags (P3-18) */}
      {!query && recentSearches.length > 0 && (
        <div className="px-4 py-2.5 bg-[#0e0f14] border-b border-line-subtle flex flex-wrap gap-1.5 shrink-0">
          {recentSearches.map((term, tIdx) => (
            <button
              key={tIdx}
              onClick={() => {
                setQuery(term);
                setSelectedIndex(0);
              }}
              className="px-2.5 py-1 rounded-lg bg-panel2 hover:bg-[#1e202a] text-text-sub hover:text-accent border border-line text-xs font-medium transition-colors"
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {/* Results List */}
      <div className="overflow-y-auto divide-y divide-[#1a1c21] p-2 space-y-1 flex-1">
        {filteredGenres.length === 0 ? (
          <div className="py-12 text-center text-neutral-500">
            <p className="text-base">{t("search_no_results")}</p>
            <p className="text-xs text-neutral-600 mt-1">Try searching "128", "House", "贝斯", "London", or "1994"</p>
          </div>
        ) : (
          filteredGenres.map((genre, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={genre.id}
                className={`group flex items-center justify-between p-2.5 rounded-xl transition-all duration-150 ${
                  isSelected
                    ? "bg-accent/10 border border-accent/40 text-text"
                    : "hover:bg-panel2 text-[#b9b7b0]"
                }`}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <button
                  type="button"
                  onClick={() => handleExecuteSelect(genre, "detail")}
                  aria-label={`${t("view_detail")}: ${genre.name}`}
                  className="flex items-center space-x-3 min-w-0 flex-1 text-left bg-transparent border-0 p-0.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
                >
                  <div className="w-9 h-9 rounded-lg bg-panel2 border border-line flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-[#0a0b0d] transition-colors shrink-0">
                    <Music className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 truncate">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-white tracking-wide truncate">{genre.name}</span>
                      {genre.aliases.length > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-800 text-text-sub border border-line-subtle shrink-0">
                          {genre.aliases[0]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-neutral-400 mt-0.5">
                      <span className="text-accent font-medium">{genre.category}</span>
                      <span>•</span>
                      <span>{genre.bpm_range.includes("BPM") ? genre.bpm_range : `${genre.bpm_range} BPM`}</span>
                      <span>•</span>
                      <span>{genre.origin_year}</span>
                    </div>
                  </div>
                </button>

                {/* Actions: Galaxy Locate, Add to Compare, Open Studio, View Detail (P3-18) */}
                <div className="flex items-center space-x-1 shrink-0 ml-2">
                  <button
                    type="button"
                    title={t("search_locate_galaxy")}
                    aria-label={`${t("search_locate_galaxy")} ${genre.name}`}
                    onClick={() => handleExecuteSelect(genre, "galaxy")}
                    className="p-1.5 rounded-lg bg-panel2 border border-line hover:border-cyan-400 text-text-sub hover:text-cyan-300 transition-colors text-xs flex items-center"
                  >
                    <Compass className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t("search_add_compare")}
                    aria-label={`${t("search_add_compare")} ${genre.name}`}
                    onClick={() => handleExecuteSelect(genre, "compare")}
                    className="p-1.5 rounded-lg bg-panel2 border border-line hover:border-amber-400 text-text-sub hover:text-amber-300 transition-colors text-xs flex items-center"
                  >
                    <Columns className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t("open_in_studio")}
                    aria-label={`${t("open_in_studio")} ${genre.name}`}
                    onClick={() => handleExecuteSelect(genre, "studio")}
                    className="p-1.5 rounded-lg bg-panel2 border border-line hover:border-accent text-text-sub hover:text-accent transition-colors text-xs flex items-center space-x-1"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">{t("open_in_studio")}</span>
                  </button>
                  <button
                    type="button"
                    title={t("view_detail")}
                    aria-label={`${t("view_detail")} ${genre.name}`}
                    onClick={() => handleExecuteSelect(genre, "detail")}
                    className="p-1.5 rounded-lg bg-panel2 border border-line hover:border-line-strong text-text-sub hover:text-text transition-colors text-xs flex items-center space-x-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Results > 15 Hint (P3-18) */}
        {totalMatches > 15 && (
          <div className="p-3 text-center text-xs text-text-sub bg-[#121319] rounded-xl border border-line-subtle my-1">
            <span>{t("search_more_results", { count: totalMatches - 15 })}</span>
          </div>
        )}
      </div>

      {/* Footer shortcuts info (P3-18) */}
      <div className="px-4 py-2.5 bg-panel2 border-t border-line text-xs text-text-dim flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span><kbd className="px-1 py-0.5 rounded bg-panel text-text-sub border border-line">↑↓</kbd> Select</span>
          <span><kbd className="px-1 py-0.5 rounded bg-panel text-text-sub border border-line">Enter</kbd> Detail</span>
          <span><kbd className="px-1 py-0.5 rounded bg-panel text-text-sub border border-line">Alt+S</kbd> Studio</span>
          <span><kbd className="px-1 py-0.5 rounded bg-panel text-text-sub border border-line">Alt+G</kbd> Star Map</span>
          <span><kbd className="px-1 py-0.5 rounded bg-panel text-text-sub border border-line">Alt+C</kbd> Compare</span>
        </div>
        <div className="flex items-center space-x-1 text-accent font-mono text-[11px]">
          <Sparkles className="w-3 h-3" />
          <span>159 Curated Genres</span>
        </div>
      </div>
    </Modal>
  );
};
