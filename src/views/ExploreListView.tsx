import React, { useState, useMemo, useRef, useEffect } from "react";
import { 
  Search, 
  Sliders, 
  ExternalLink, 
  Columns, 
  Layers, 
  Clock, 
  MapPin, 
  Compass, 
  Sparkles, 
  Music, 
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  Filter
} from "lucide-react";
import { Genre, GenreCategory } from "../types/genre";
import { ALL_GENRES } from "../data/genres";
import { useLanguage } from "../i18n/LanguageContext";

export interface ExploreListViewProps {
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
  onAddToCompare?: (genre: Genre) => void;
  onSwitchTo3D?: () => void;
  isFallback?: boolean;
}

const CATEGORY_COLORS: Record<GenreCategory, { badge: string; text: string; border: string }> = {
  Electronic: { badge: "bg-cyan-500/15 border-cyan-500/40 text-cyan-300", text: "text-cyan-400", border: "border-cyan-500/40" },
  "Rock/Metal": { badge: "bg-rose-500/15 border-rose-500/40 text-rose-300", text: "text-rose-400", border: "border-rose-500/40" },
  "Hip Hop": { badge: "bg-amber-500/15 border-amber-500/40 text-amber-300", text: "text-amber-400", border: "border-amber-500/40" },
  "Jazz/Blues": { badge: "bg-indigo-500/15 border-indigo-500/40 text-indigo-300", text: "text-indigo-400", border: "border-indigo-500/40" },
  "Pop/R&B": { badge: "bg-pink-500/15 border-pink-500/40 text-pink-300", text: "text-pink-400", border: "border-pink-500/40" },
  "Latin/World": { badge: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300", text: "text-emerald-400", border: "border-emerald-500/40" },
};

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

const REGION_TAGS = [
  { key: "all", labelZh: "全部地域", labelEn: "All Regions" },
  { key: "us", labelZh: "北美 (USA / Canada)", labelEn: "North America", match: ["united states", "usa", "us", "chicago", "detroit", "new york", "los angeles", "atlanta", "america", "canada", "toronto"] },
  { key: "uk", labelZh: "英国 (UK / London / Bristol)", labelEn: "United Kingdom", match: ["uk", "united kingdom", "london", "bristol", "manchester", "england", "scotland"] },
  { key: "europe", labelZh: "欧洲大陆 (Berlin / Paris / Netherlands)", labelEn: "Continental Europe", match: ["germany", "berlin", "france", "paris", "netherlands", "amsterdam", "rotterdam", "italy", "spain", "sweden", "europe"] },
  { key: "caribbean", labelZh: "加勒比 / 拉美 (Jamaica / Puerto Rico)", labelEn: "Caribbean & Latin", match: ["jamaica", "kingston", "puerto rico", "cuba", "brazil", "colombia", "caribbean", "latin"] },
  { key: "africa", labelZh: "非洲 (Nigeria / South Africa)", labelEn: "Africa", match: ["nigeria", "south africa", "ghana", "durban", "lagos", "africa"] },
  { key: "asia", labelZh: "亚洲 (Japan / Korea)", labelEn: "Asia", match: ["japan", "tokyo", "korea", "seoul", "asia"] },
];

export const ExploreListView: React.FC<ExploreListViewProps> = ({
  onSelectGenre,
  onOpenStudio,
  onAddToCompare,
  onSwitchTo3D,
  isFallback = false,
}) => {
  const { t, language, isZh } = useLanguage();

  // Filters State
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [decadeFilter, setDecadeFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [subgenreMin, setSubgenreMin] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"year_asc" | "year_desc" | "name_asc" | "subgenres_desc">("year_asc");
  const [groupBy, setGroupBy] = useState<"category" | "decade" | "flat">("category");

  // Keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  // Filter and sort items
  const filteredGenres = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const activeRegion = REGION_TAGS.find((r) => r.key === regionFilter);

    return ALL_GENRES.filter((g) => {
      // 1. Category Filter
      if (categoryFilter !== "all" && g.category !== categoryFilter) return false;

      // 2. Decade Filter
      if (decadeFilter !== "all") {
        const d = parseInt(decadeFilter, 10);
        if (g.origin_decade !== d) return false;
      }

      // 3. Region Filter
      if (regionFilter !== "all" && activeRegion?.match) {
        const placeStr = `${g.origin_place.en} ${g.origin_place.zh}`.toLowerCase();
        const matchesRegion = activeRegion.match.some((keyword) => placeStr.includes(keyword));
        if (!matchesRegion) return false;
      }

      // 4. Subgenre threshold
      if (subgenreMin > 0 && (g.subgenres?.length || 0) < subgenreMin) return false;

      // 5. Search query
      if (q) {
        const matchName = g.name.toLowerCase().includes(q);
        const matchAlias = g.aliases.some((a) => a.toLowerCase().includes(q));
        const matchPlace = `${g.origin_place.en} ${g.origin_place.zh}`.toLowerCase().includes(q);
        const matchYear = g.origin_year.includes(q);
        const matchSubgenre = (g.subgenres || []).some((s) => s.toLowerCase().includes(q));
        if (!matchName && !matchAlias && !matchPlace && !matchYear && !matchSubgenre) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === "year_asc") return (a.origin_decade || 0) - (b.origin_decade || 0);
      if (sortBy === "year_desc") return (b.origin_decade || 0) - (a.origin_decade || 0);
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "subgenres_desc") return (b.subgenres?.length || 0) - (a.subgenres?.length || 0);
      return 0;
    });
  }, [categoryFilter, decadeFilter, regionFilter, subgenreMin, searchQuery, sortBy]);

  // Grouped results map
  const groupedResults = useMemo(() => {
    if (groupBy === "flat") {
      return [{ 
        groupKey: "all", 
        title: isZh ? "全部流派" : "All Genres", 
        color: { badge: "bg-accent/20 border-accent/40 text-accent", text: "text-accent", border: "border-accent/40" },
        genres: filteredGenres 
      }];
    }

    if (groupBy === "category") {
      const categories: GenreCategory[] = [
        "Electronic",
        "Rock/Metal",
        "Hip Hop",
        "Jazz/Blues",
        "Pop/R&B",
        "Latin/World",
      ];
      return categories
        .map((cat) => ({
          groupKey: cat,
          title: cat,
          color: CATEGORY_COLORS[cat],
          genres: filteredGenres.filter((g) => g.category === cat),
        }))
        .filter((group) => group.genres.length > 0);
    }

    // Group by Decade
    const decades = Array.from(new Set(filteredGenres.map((g) => g.origin_decade || 1980))).sort((a, b) => a - b);
    return decades.map((dec) => ({
      groupKey: String(dec),
      title: `${dec}s`,
      color: { badge: "bg-amber-500/20 border-amber-500/40 text-amber-300", text: "text-amber-400", border: "border-amber-500/40" },
      genres: filteredGenres.filter((g) => g.origin_decade === dec),
    }));
  }, [filteredGenres, groupBy, isZh]);

  // Reset all filters
  const handleResetFilters = () => {
    setCategoryFilter("all");
    setDecadeFilter("all");
    setRegionFilter("all");
    setSubgenreMin(0);
    setSearchQuery("");
    setSortBy("year_asc");
    setFocusedIndex(0);
  };

  // Keyboard navigation within list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filteredGenres.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % filteredGenres.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + filteredGenres.length) % filteredGenres.length);
    } else if (e.key === "Enter") {
      const genre = filteredGenres[focusedIndex];
      if (genre) {
        e.preventDefault();
        onSelectGenre(genre);
      }
    }
  };

  return (
    <div 
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 outline-none"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label={t("explore_list_view_title")}
    >
      {/* Header & View Mode Switcher Banner */}
      <div className="bg-panel border border-line rounded-3xl p-6 sm:p-7 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 blur-3xl rounded-full pointer-events-none" />

        <div className="space-y-2 relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-accent/15 text-accent border border-accent/30 flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isFallback ? (isZh ? "WebGL 降级兜底模式" : "WebGL Fallback View") : (isZh ? "无障碍聚合矩阵" : "Accessible Catalog")}</span>
            </span>
            <span className="text-xs text-text-sub font-mono">
              {t("genre_count_matches", { count: filteredGenres.length })}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-text tracking-tight flex items-center space-x-2">
            <Layers className="w-6 h-6 text-accent" />
            <span>{t("explore_list_view_title")}</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#b8b5ad] max-w-2xl leading-relaxed">
            {t("explore_list_view_sub")}
          </p>
        </div>

        {/* View Mode Switching button */}
        {onSwitchTo3D && (
          <div className="shrink-0 relative z-10">
            <button
              onClick={onSwitchTo3D}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-text font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all hover:scale-105"
              title={t("switch_to_3d")}
            >
              <Compass className="w-4 h-4" />
              <span>{t("switch_to_3d")}</span>
            </button>
          </div>
        )}
      </div>

      {/* Multi-Dimensional Filter Deck (P3-20) */}
      <div className="bg-panel border border-line rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-subtle pb-3.5">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-text-sub">
            <Filter className="w-4 h-4 text-accent" />
            <span>{isZh ? "多维筛选器" : "Multi-Dimensional Filters"}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleResetFilters}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-panel2 hover:bg-[#1f222c] text-text-dim hover:text-text text-xs border border-line transition-colors"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isZh ? "重置筛选" : "Reset"}</span>
            </button>
          </div>
        </div>

        {/* Keyword Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-text-dim absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isZh ? "搜索流派名称、别名、地域、年代或代表关键词..." : "Search genres by name, alias, place, year, or keyword..."}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-panel2 border border-line text-sm text-text placeholder-text-dim focus:outline-none focus:border-accent"
          />
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1 text-xs">
          {/* 1. Category Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-sub uppercase tracking-wider block">
              {t("filter_category")}
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent"
            >
              <option value="all">{t("filter_all")} ({isZh ? "全大类" : "All Categories"})</option>
              <option value="Electronic">Electronic (电子舞曲)</option>
              <option value="Rock/Metal">Rock/Metal (摇滚与金属)</option>
              <option value="Hip Hop">Hip Hop (嘻哈与说唱)</option>
              <option value="Jazz/Blues">Jazz/Blues (爵士与蓝调)</option>
              <option value="Pop/R&B">Pop/R&B (流行与节奏蓝调)</option>
              <option value="Latin/World">Latin/World (拉丁与世界节拍)</option>
            </select>
          </div>

          {/* 2. Decade Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-sub uppercase tracking-wider block">
              {t("filter_decade")}
            </label>
            <select
              value={decadeFilter}
              onChange={(e) => setDecadeFilter(e.target.value)}
              className="w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent"
            >
              <option value="all">{t("filter_all")} ({isZh ? "全年代" : "All Decades"})</option>
              {DECADES.map((dec) => (
                <option key={dec} value={String(dec)}>{dec}s</option>
              ))}
            </select>
          </div>

          {/* 3. Region Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-sub uppercase tracking-wider block">
              {t("filter_region")}
            </label>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent"
            >
              {REGION_TAGS.map((r) => (
                <option key={r.key} value={r.key}>
                  {isZh ? r.labelZh : r.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Subgenres Count Threshold Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-sub uppercase tracking-wider block">
              {t("filter_subgenres")}
            </label>
            <select
              value={subgenreMin}
              onChange={(e) => setSubgenreMin(parseInt(e.target.value, 10))}
              className="w-full bg-panel2 border border-line rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent"
            >
              <option value={0}>{t("filter_all")} ({isZh ? "包含全部母体与末梢" : "All Nodes"})</option>
              <option value={1}>{isZh ? "有子流派分支 (≥ 1)" : "Has Subgenres (≥ 1)"}</option>
              <option value={3}>{isZh ? "高衍生谱系分支 (≥ 3)" : "High Derivative (≥ 3)"}</option>
              <option value={5}>{isZh ? "核心源流基石 (≥ 5)" : "Major Family Root (≥ 5)"}</option>
            </select>
          </div>
        </div>

        {/* View Layout & Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line-subtle text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-text-dim font-bold uppercase text-[10px]">
              {isZh ? "分组方式:" : "Group By:"}
            </span>
            <div className="flex items-center bg-panel2 rounded-xl p-1 border border-line">
              <button
                onClick={() => setGroupBy("category")}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors ${
                  groupBy === "category" ? "bg-accent text-black shadow-xs" : "text-text-sub hover:text-text"
                }`}
              >
                {t("filter_category")}
              </button>
              <button
                onClick={() => setGroupBy("decade")}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors ${
                  groupBy === "decade" ? "bg-accent text-black shadow-xs" : "text-text-sub hover:text-text"
                }`}
              >
                {t("filter_decade")}
              </button>
              <button
                onClick={() => setGroupBy("flat")}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors ${
                  groupBy === "flat" ? "bg-accent text-black shadow-xs" : "text-text-sub hover:text-text"
                }`}
              >
                {isZh ? "平铺列表" : "Flat"}
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-text-dim font-bold uppercase text-[10px]">
              {isZh ? "排序:" : "Sort:"}
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-panel2 border border-line rounded-xl px-2.5 py-1 text-xs text-text focus:outline-none focus:border-accent"
            >
              <option value="year_asc">{isZh ? "年份 (从早到晚)" : "Year (Earliest)"}</option>
              <option value="year_desc">{isZh ? "年份 (从新到旧)" : "Year (Latest)"}</option>
              <option value="name_asc">{isZh ? "名称 (A - Z)" : "Name (A-Z)"}</option>
              <option value="subgenres_desc">{isZh ? "子流派数量 (从多到少)" : "Subgenres Count"}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Clustered Results Grid */}
      <div ref={listContainerRef} className="space-y-8" role="list">
        {groupedResults.length === 0 ? (
          <div className="p-12 text-center bg-panel border border-line rounded-3xl text-text-sub space-y-3">
            <Music className="w-8 h-8 text-accent mx-auto opacity-60" />
            <p className="text-base font-bold text-text">
              {isZh ? "未找到符合当前多维筛选条件的音乐流派" : "No genres found matching filters"}
            </p>
            <p className="text-xs text-text-dim">
              {isZh ? "请尝试放宽筛选范围或清空关键词后重试" : "Try relaxing your filters or clearing search query"}
            </p>
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 rounded-xl bg-accent text-black font-bold text-xs hover:bg-[#ffc24b] transition-colors"
            >
              {isZh ? "重置所有筛选器" : "Reset Filters"}
            </button>
          </div>
        ) : (
          groupedResults.map((group) => {
            const groupTheme = group.color || { badge: "bg-panel2 border-line text-text-sub", text: "text-text", border: "border-line" };

            return (
              <div key={group.groupKey} className="space-y-3">
                {/* Group Header */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${groupTheme.badge}`} />
                    <h2 className="text-lg font-black text-text tracking-wide">
                      {group.title}
                    </h2>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-panel2 text-text-sub border border-line">
                      {group.genres.length}
                    </span>
                  </div>
                </div>

                {/* Genres Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {group.genres.map((genre) => {
                    const color = CATEGORY_COLORS[genre.category] || CATEGORY_COLORS.Electronic;
                    const isFocused = filteredGenres[focusedIndex]?.id === genre.id;

                    return (
                      <div
                        key={genre.id}
                        role="listitem"
                        className={`bg-panel border rounded-2xl p-4 shadow-md flex flex-col justify-between space-y-3 transition-all duration-200 group hover:border-accent/60 ${
                          isFocused ? "ring-2 ring-accent border-accent shadow-accent/10" : "border-line"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${color.badge}`}>
                              {genre.category}
                            </span>
                            <span className="text-xs font-mono font-bold text-accent">
                              {genre.bpm_range} BPM
                            </span>
                          </div>

                          <div>
                            <div className="flex items-center space-x-1.5">
                              <h3 
                                onClick={() => onSelectGenre(genre)}
                                className="font-extrabold text-text text-base group-hover:text-accent transition-colors cursor-pointer"
                              >
                                {genre.name}
                              </h3>
                              {genre.aliases && genre.aliases[0] && isZh && (
                                <span className="text-xs text-text-dim">
                                  ({genre.aliases[0]})
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs text-text-sub mt-1">
                              <span className="flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>{genre.origin_year}</span>
                              </span>
                              <span>•</span>
                              <span className="flex items-center space-x-1 truncate max-w-[150px]">
                                <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                                <span className="truncate">{genre.origin_place[language]}</span>
                              </span>
                            </div>
                          </div>

                          {/* Rhythm Features & Subgenres */}
                          {genre.rhythm_features && (
                            <p className="text-xs text-[#9ea3af] line-clamp-2 leading-relaxed">
                              {genre.rhythm_features[language]}
                            </p>
                          )}
                        </div>

                        {/* Card Actions Footer */}
                        <div className="flex items-center justify-between pt-2.5 border-t border-line-subtle text-xs">
                          <span className="text-[11px] font-mono text-text-dim">
                            {genre.subgenres?.length || 0} {isZh ? "分支" : "branches"}
                          </span>

                          <div className="flex items-center space-x-1.5">
                            {onAddToCompare && (
                              <button
                                onClick={() => onAddToCompare(genre)}
                                className="p-1.5 rounded-lg bg-panel2 hover:bg-[#1e202a] text-text-sub hover:text-amber-300 border border-line transition-colors"
                                title={t("compare_add")}
                                aria-label={`${t("compare_add")} ${genre.name}`}
                              >
                                <Columns className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => onOpenStudio(genre)}
                              className="p-1.5 rounded-lg bg-panel2 hover:bg-[#1e202a] text-text-sub hover:text-accent border border-line transition-colors"
                              title={t("open_in_studio")}
                              aria-label={`${t("open_in_studio")} ${genre.name}`}
                            >
                              <Sliders className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => onSelectGenre(genre)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition-colors flex items-center space-x-1"
                              title={t("view_detail")}
                              aria-label={`${t("view_detail")} ${genre.name}`}
                            >
                              <span>{t("view_detail")}</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
