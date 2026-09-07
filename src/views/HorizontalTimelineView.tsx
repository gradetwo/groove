import React, { useState, useRef, useEffect, useMemo } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Clock, 
  MapPin, 
  Sliders, 
  ExternalLink, 
  Volume2, 
  ChevronRight,
  Filter,
  Layers,
  Sparkles
} from "lucide-react";
import { Genre } from "../types/genre";
import { ALL_GENRES } from "../data/genres";
import { useLanguage } from "../i18n/LanguageContext";

interface HorizontalTimelineViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
}

const DECADES = [1920, 1940, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

const LANES = [
  { id: "house", name: "House Evolution", category: "Electronic", match: (g: Genre) => g.id.includes("house") },
  { id: "techno", name: "Techno Lineage", category: "Electronic", match: (g: Genre) => g.id.includes("techno") },
  { id: "trance", name: "Trance Journey", category: "Electronic", match: (g: Genre) => g.id.includes("trance") },
  { id: "bass", name: "Dubstep & UK Bass", category: "Electronic", match: (g: Genre) => g.id.includes("dubstep") || g.id.includes("uk-") || g.id.includes("grime") || g.id.includes("garage") },
  { id: "dnb", name: "Drum & Bass & Jungle", category: "Electronic", match: (g: Genre) => g.id.includes("dnb") || g.id.includes("jungle") || g.id.includes("breakbeat") },
  { id: "hiphop", name: "Hip Hop & Trap", category: "Hip Hop", match: (g: Genre) => g.category === "Hip Hop" || g.id.includes("trap") || g.id.includes("drill") },
  { id: "rock", name: "Rock & Metal Waves", category: "Rock/Metal", match: (g: Genre) => g.category === "Rock/Metal" },
  { id: "jazz", name: "Jazz & Blues Roots", category: "Jazz/Blues", match: (g: Genre) => g.category === "Jazz/Blues" },
  { id: "pop", name: "Pop, R&B & Synth", category: "Pop/R&B", match: (g: Genre) => g.category === "Pop/R&B" || g.id.includes("synthwave") || g.id.includes("electro") },
  { id: "latin", name: "Latin & World Rhythms", category: "Latin/World", match: (g: Genre) => g.category === "Latin/World" },
];

export const HorizontalTimelineView: React.FC<HorizontalTimelineViewProps> = ({
  onSelectGenre,
  onOpenStudio,
}) => {
  const { t, language } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Animation timeline year
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [currentYear, setCurrentYear] = useState(2024);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // years per tick

  // Active category lane filter
  const [activeLaneFilter, setActiveLaneFilter] = useState<string>("ALL");

  // Filtered lanes
  const displayLanes = useMemo(() => {
    if (activeLaneFilter === "ALL") return LANES;
    return LANES.filter((l) => l.id === activeLaneFilter);
  }, [activeLaneFilter]);

  // Animation player loop
  useEffect(() => {
    let timer: any = null;
    if (animationPlaying) {
      timer = setInterval(() => {
        setCurrentYear((prev) => {
          if (prev >= 2024) {
            setAnimationPlaying(false);
            return 2024;
          }
          return prev + 2;
        });
      }, 300 / playbackSpeed);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [animationPlaying, playbackSpeed]);

  const handleStartEvolution = () => {
    setCurrentYear(1920);
    setAnimationPlaying(true);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
  };

  const handleTogglePlay = () => {
    if (currentYear >= 2024 && !animationPlaying) {
      setCurrentYear(1920);
    }
    setAnimationPlaying(!animationPlaying);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-4">
      {/* Top Header & Evolution Controls Bar */}
      <div className="bg-[#121317] border border-[#23262d] rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-[#f5b73d]" />
            <h2 className="text-lg font-bold text-[#e9e7e0] tracking-wide">
              {t("nav_timeline_h")}
            </h2>
          </div>
          <p className="text-xs text-[#8b8f99] mt-0.5">
            1920 — 2024 Music Genealogy & Family Evolution
          </p>
        </div>

        {/* Evolution Player Transport */}
        <div className="flex items-center space-x-3 bg-[#0d0e12] px-4 py-2 rounded-2xl border border-[#23262d]">
          <button
            onClick={handleTogglePlay}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold text-xs transition-colors ${
              animationPlaying
                ? "bg-amber-500 hover:bg-[#f5b73d] text-black"
                : "bg-indigo-600 hover:bg-indigo-500 text-[#e9e7e0]"
            }`}
          >
            {animationPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{animationPlaying ? t("pause") : "Play Evolution"}</span>
          </button>

          <button
            onClick={handleStartEvolution}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[#b9b7b0] hover:text-[#e9e7e0] transition-colors"
            title="Restart from 1920"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Current Year Display */}
          <div className="flex items-center space-x-2 pl-2 border-l border-[#23262d]">
            <span className="text-xs text-[#5a5e68] font-semibold uppercase">Year:</span>
            <span className="text-sm font-mono font-extrabold text-[#f5b73d] w-12">
              {currentYear}
            </span>
          </div>

          {/* Year Range Slider */}
          <input
            type="range"
            min="1920"
            max="2024"
            value={currentYear}
            onChange={(e) => setCurrentYear(Number(e.target.value))}
            className="w-24 sm:w-40 accent-indigo-500 cursor-pointer"
          />
        </div>

        {/* Lane Selector */}
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-[#5a5e68]" />
          <select
            value={activeLaneFilter}
            onChange={(e) => setActiveLaneFilter(e.target.value)}
            className="bg-[#0d0e12] border border-[#23262d] text-[#b9b7b0] text-xs font-semibold px-3 py-1.5 rounded-xl focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Evolution Lanes ({LANES.length})</option>
            {LANES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Horizontal Scrollable Timeline Matrix */}
      <div 
        ref={scrollContainerRef}
        className="bg-[#121317] border border-[#23262d]/90 rounded-2xl p-4 shadow-2xl overflow-x-auto overflow-y-hidden"
      >
        <div className="min-w-[1900px] space-y-6">
          {/* Decade Header Ruler */}
          <div className="flex items-center border-b border-[#23262d] pb-3 pl-48">
            {DECADES.map((decade, idx) => {
              const isPast = decade <= currentYear;
              return (
                <div 
                  key={decade} 
                  className={`flex-1 flex flex-col items-center relative transition-colors ${
                    isPast ? "text-[#f5b73d] font-bold" : "text-neutral-600 font-medium"
                  }`}
                >
                  <div className="text-sm font-mono tracking-wider">{decade}s</div>
                  <div className={`w-2 h-2 rounded-full mt-1 ${isPast ? "bg-indigo-500 shadow-sm shadow-indigo-500" : "bg-neutral-700"}`} />
                </div>
              );
            })}
          </div>

          {/* Swimlanes */}
          <div className="space-y-4">
            {displayLanes.map((lane) => {
              // Find all genres belonging to this lane
              const laneGenres = ALL_GENRES.filter((g) => lane.match(g));

              return (
                <div 
                  key={lane.id}
                  className="flex items-center p-2 rounded-2xl bg-[#0d0e12] border border-[#23262d]/60 hover:border-neutral-750 transition-colors"
                >
                  {/* Lane Title & Badge */}
                  <div className="w-48 shrink-0 pr-4 pl-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-800 text-[#8b8f99] border border-[#393d46]">
                      {lane.category}
                    </span>
                    <h4 className="font-bold text-[#e9e7e0] text-sm mt-1 truncate" title={lane.name}>
                      {lane.name}
                    </h4>
                    <span className="text-[11px] text-[#5a5e68]">
                      {laneGenres.length} genres
                    </span>
                  </div>

                  {/* Decade Grid Slots for this lane */}
                  <div className="flex-1 flex items-center space-x-2">
                    {DECADES.map((decade) => {
                      // Genres born in this decade
                      const inDecade = laneGenres.filter((g) => {
                        if (decade <= 1940) return g.origin_decade <= 1950;
                        return g.origin_decade === decade;
                      });

                      return (
                        <div 
                          key={decade} 
                          className="flex-1 min-h-[90px] border-r border-[#23262d]/40 p-1 flex flex-wrap gap-1.5 items-center justify-start"
                        >
                          {inDecade.map((genre) => {
                            const isRevealed = (genre.origin_decade || 1980) <= currentYear;

                            return (
                              <div
                                key={genre.id}
                                className={`group relative p-2 rounded-xl transition-all duration-300 ${
                                  isRevealed 
                                    ? "bg-[#121317] border border-[#393d46]/80 hover:border-indigo-500/80 shadow-md cursor-pointer scale-100 opacity-100" 
                                    : "opacity-15 bg-[#0d0e12] border border-neutral-900 scale-90 pointer-events-none"
                                }`}
                                onClick={() => onSelectGenre(genre)}
                              >
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-bold text-xs text-[#e9e7e0] group-hover:text-[#f5b73d] transition-colors">
                                    {genre.name}
                                  </span>
                                  <span className="text-[10px] px-1 py-0.2 rounded bg-neutral-800 text-[#8b8f99] font-mono">
                                    {genre.origin_year}
                                  </span>
                                </div>

                                <div className="flex items-center space-x-2 mt-1 text-[10px] text-[#8b8f99]">
                                  <span>{genre.bpm_range} BPM</span>
                                  <span>•</span>
                                  <span className="truncate max-w-[80px]">{genre.origin_place[language]}</span>
                                </div>

                                {/* Quick Studio open button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenStudio(genre);
                                  }}
                                  className="mt-1.5 w-full flex items-center justify-center space-x-1 py-1 rounded-lg bg-neutral-800/90 group-hover:bg-indigo-600 group-hover:text-[#e9e7e0] text-[10px] text-[#b9b7b0] font-semibold transition-colors"
                                >
                                  <Sliders className="w-3 h-3" />
                                  <span>{t("open_in_studio")}</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
