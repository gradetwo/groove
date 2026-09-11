import React, { useState, useEffect, useRef } from "react";
import { Search, X, Music, Sliders, ExternalLink, Sparkles } from "lucide-react";
import { GENRE_INDEX, GenreIndexItem } from "../data/index/genresIndex";
import { useLanguage } from "../i18n/LanguageContext";
import { isBpmInRange } from "../utils/bpm";
import { Modal } from "../ui";

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGenre: (genre: { id: string }, action?: "detail" | "studio") => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({
  isOpen,
  onClose,
  onSelectGenre,
}) => {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery("");
    }
  }, [isOpen]);

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

  // Filtered genres
  const filteredGenres = React.useMemo<GenreIndexItem[]>(() => {
    if (!query.trim()) {
      return GENRE_INDEX.slice(0, 8); // Top recommendations
    }
    const q = query.trim().toLowerCase();
    const numQ = parseInt(q, 10);

    return GENRE_INDEX.filter((g) => {
      // Name match
      if (g.name.toLowerCase().includes(q)) return true;
      // Aliases match (e.g. 中文别名)
      if (g.aliases.some((a) => a.toLowerCase().includes(q))) return true;
      // Category match
      if (g.category.toLowerCase().includes(q)) return true;
      // Subgenres match
      if (g.subgenres && g.subgenres.some((s) => s.toLowerCase().includes(q))) return true;
      // BPM match
      if (!isNaN(numQ) && numQ > 20 && numQ < 400) {
        if (isBpmInRange(numQ, g.bpm_range, 4)) return true;
      }
      // Year match
      if (!isNaN(numQ) && g.origin_year.includes(q)) return true;
      return false;
    }).slice(0, 15);
  }, [query]);

  // Keyboard navigation
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredGenres.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredGenres.length) % Math.max(1, filteredGenres.length));
    } else if (e.key === "Enter" && filteredGenres[selectedIndex]) {
      e.preventDefault();
      onSelectGenre(filteredGenres[selectedIndex], "detail");
      onClose();
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
      className="max-h-[80vh]"
    >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-line bg-panel2">
          <Search className="w-5 h-5 text-accent mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-text placeholder-[#5a5e68] text-base sm:text-lg focus:outline-none"
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
              className="text-neutral-500 hover:text-white p-1 mr-1"
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

        {/* Results List */}
        <div className="overflow-y-auto divide-y divide-[#1a1c21] p-2 space-y-1">
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
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? "bg-accent/10 border border-accent/40 text-text"
                      : "hover:bg-panel2 text-[#b9b7b0]"
                  }`}
                  onClick={() => {
                    onSelectGenre(genre, "detail");
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="flex items-center space-x-3 min-w-0">
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
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1.5 shrink-0 ml-3">
                    <button
                      title={t("open_in_studio")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectGenre(genre, "studio");
                        onClose();
                      }}
                      className="p-2 rounded-lg bg-panel2 border border-line hover:border-accent text-text-sub hover:text-accent transition-colors text-xs flex items-center space-x-1"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t("open_in_studio")}</span>
                    </button>
                    <button
                      title={t("view_detail")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectGenre(genre, "detail");
                        onClose();
                      }}
                      className="p-2 rounded-lg bg-panel2 border border-line hover:border-line-strong text-text-sub hover:text-text transition-colors text-xs flex items-center space-x-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t("view_detail")}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts info */}
        <div className="px-4 py-2 bg-panel2 border-t border-line text-xs text-text-dim flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span><kbd className="px-1 py-0.5 rounded bg-panel text-text-sub border border-line">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-panel text-text-sub border border-line">↓</kbd> Navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-panel text-text-sub border border-line">Enter</kbd> Select</span>
          </div>
          <div className="flex items-center space-x-1 text-accent">
            <Sparkles className="w-3 h-3" />
            <span>159 Curated Genres & Grooves</span>
          </div>
        </div>
    </Modal>
  );
};
