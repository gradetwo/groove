import React, { useState, useEffect, useRef } from "react";
import { 
  Sliders, 
  Orbit, 
  Clock, 
  Columns, 
  HelpCircle, 
  Search, 
  Shuffle, 
  Menu, 
  X,
  AlignVerticalJustifyStart,
  Music2,
  History,
  Compass,
  ChevronDown
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { GENRE_INDEX } from "../data/index/genresIndex";
import { CURRENT_CLIENT_VERSION } from "./UpdatesModal";

export type NavTab = 
  | "studio" 
  | "chords"
  | "galaxy" 
  | "horizontal-timeline" 
  | "vertical-timeline" 
  | "compare" 
  | "challenge" 
  | "detail";

interface HeaderProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenSearch: () => void;
  onRandomGenre: (genre: { id: string }) => void;
  onOpenUpdates?: () => void;
  analyser?: AnalyserNode | null;
  isPlaying?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenSearch,
  onRandomGenre,
  onOpenUpdates,
  analyser,
  isPlaying = false,
}) => {
  const { t, language, toggleLanguage } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const exploreRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  // Close explore dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exploreRef.current && !exploreRef.current.contains(e.target as Node)) {
        setExploreOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExploreOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Live frequency visualizer
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      ctx.clearRect(0, 0, 192, 60);

      if (analyser && isPlaying) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < 32; i++) {
          const h = (data[i + 2] / 255) * 54;
          const alpha = 0.25 + (data[i + 2] / 255) * 0.75;
          ctx.fillStyle = `rgba(245, 183, 61, ${alpha})`;
          ctx.fillRect(i * 6, 60 - h, 4, h);
        }
      } else {
        // Idle ambient bars
        for (let i = 0; i < 32; i++) {
          ctx.fillStyle = "rgba(139, 143, 153, 0.15)";
          ctx.fillRect(i * 6, 56, 4, 3);
        }
      }
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [analyser, isPlaying]);

  const exploreItems: Array<{ tab: NavTab; labelKey: string; descZh: string; descEn: string; icon: React.ReactNode }> = [
    { tab: "galaxy", labelKey: "nav_galaxy", descZh: "3D 星系图谱", descEn: "3D Cosmic Map", icon: <Orbit className="w-3.5 h-3.5" /> },
    { tab: "horizontal-timeline", labelKey: "nav_timeline_h", descZh: "年代编年演变轴", descEn: "Chronology", icon: <Clock className="w-3.5 h-3.5" /> },
    { tab: "vertical-timeline", labelKey: "nav_timeline_v", descZh: "流派故事脉络", descEn: "Storylines", icon: <AlignVerticalJustifyStart className="w-3.5 h-3.5" /> },
  ];

  const isExploreActive = ["galaxy", "horizontal-timeline", "vertical-timeline"].includes(currentTab);

  const handleRandom = () => {
    const randomIndex = Math.floor(Math.random() * GENRE_INDEX.length);
    const g = GENRE_INDEX[randomIndex];
    onRandomGenre(g);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-bg/95 backdrop-blur-md border-b border-line px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      {/* Brand / Logo */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => onSelectTab("studio")} 
          aria-label="GROOVE LAB Home"
          className="flex items-center gap-2.5 cursor-pointer select-none group border-0 bg-transparent p-0 text-left"
        >
          {/* Glowing amber dot */}
          <span className="w-2.5 h-2.5 rounded-full bg-accent shadow-[0_0_10px_#f5b73d] shrink-0 group-hover:scale-125 transition-transform" />
          <span className="font-[Space_Grotesk] font-bold text-base sm:text-lg tracking-[0.06em] text-text">
            GROOVE&nbsp;LAB
          </span>
        </button>
      </div>

      {/* Navigation Links: Reorganized IA (P1-09) */}
      <nav className="hidden md:flex items-center gap-1.5" aria-label="Main Navigation">
        {/* 1. Studio */}
        <button
          onClick={() => onSelectTab("studio")}
          title={t("nav_studio")}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
            currentTab === "studio"
              ? "border-accent/50 text-accent bg-accent/10 shadow-[0_0_12px_rgba(245,183,61,0.15)]"
              : "border-line text-text-sub hover:text-text hover:border-line-strong bg-panel2"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="truncate max-w-[84px] whitespace-nowrap select-none">{t("nav_studio")}</span>
        </button>

        {/* 2. Chords */}
        <button
          onClick={() => onSelectTab("chords")}
          title={t("nav_chords")}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
            currentTab === "chords"
              ? "border-accent/50 text-accent bg-accent/10 shadow-[0_0_12px_rgba(245,183,61,0.15)]"
              : "border-line text-text-sub hover:text-text hover:border-line-strong bg-panel2"
          }`}
        >
          <Music2 className="w-3.5 h-3.5" />
          <span className="truncate max-w-[84px] whitespace-nowrap select-none">{t("nav_chords")}</span>
        </button>

        {/* 3. Explore Dropdown (P1-09 IA Reorganization) */}
        <div className="relative" ref={exploreRef}>
          <button
            onClick={() => setExploreOpen(!exploreOpen)}
            aria-expanded={exploreOpen}
            aria-haspopup="true"
            title={t("nav_explore")}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
              isExploreActive
                ? "border-accent/50 text-accent bg-accent/10 shadow-[0_0_12px_rgba(245,183,61,0.15)]"
                : "border-line text-text-sub hover:text-text hover:border-line-strong bg-panel2"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="truncate max-w-[84px] whitespace-nowrap select-none">{t("nav_explore")}</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${exploreOpen ? "rotate-180 text-accent" : "text-text-sub"}`} />
          </button>

          {exploreOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-52 bg-panel2/98 backdrop-blur-md border border-line rounded-xl p-1.5 shadow-2xl z-50 animate-fade-in">
              <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-text-dim select-none">
                {language === "zh" ? "曲风探索视图" : "Exploration Views"}
              </div>
              <div className="space-y-0.5 mt-0.5">
                {exploreItems.map((item) => {
                  const isItemActive = currentTab === item.tab;
                  return (
                    <button
                      key={item.tab}
                      onClick={() => {
                        onSelectTab(item.tab);
                        setExploreOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors text-left ${
                        isItemActive
                          ? "bg-accent/15 text-accent font-medium"
                          : "text-text-sub hover:text-text hover:bg-[#181a22]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {item.icon}
                        <span className="font-medium">{t(item.labelKey)}</span>
                      </div>
                      <span className="text-[10px] font-mono text-text-dim">
                        {language === "zh" ? item.descZh : item.descEn}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 4. Compare */}
        <button
          onClick={() => onSelectTab("compare")}
          title={t("nav_compare")}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
            currentTab === "compare"
              ? "border-accent/50 text-accent bg-accent/10 shadow-[0_0_12px_rgba(245,183,61,0.15)]"
              : "border-line text-text-sub hover:text-text hover:border-line-strong bg-panel2"
          }`}
        >
          <Columns className="w-3.5 h-3.5" />
          <span className="truncate max-w-[84px] whitespace-nowrap select-none">{t("nav_compare")}</span>
        </button>

        {/* 5. Challenge */}
        <button
          onClick={() => onSelectTab("challenge")}
          title={t("nav_challenge")}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
            currentTab === "challenge"
              ? "border-accent/50 text-accent bg-accent/10 shadow-[0_0_12px_rgba(245,183,61,0.15)]"
              : "border-line text-text-sub hover:text-text hover:border-line-strong bg-panel2"
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span className="truncate max-w-[84px] whitespace-nowrap select-none">{t("nav_challenge")}</span>
        </button>
      </nav>

      {/* Right Tools: Spectrum, Search, Dice, Lang, Mobile Menu */}
      <div className="flex items-center gap-2.5">
        {/* Spectrum Canvas */}
        <canvas
          ref={canvasRef}
          width={192}
          height={60}
          className="w-20 h-6 sm:w-24 sm:h-7 opacity-90 hidden sm:block pointer-events-none"
        />

        {/* Global Search Button (P0-23) */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 text-xs text-text-sub hover:text-text px-2.5 py-1.5 border border-line hover:border-line-strong rounded-lg bg-panel2 transition-colors"
          title={`Search (${isMac ? "⌘K" : "Ctrl+K"})`}
        >
          <Search className="w-3.5 h-3.5 text-text-sub" />
          <span className="hidden xl:inline text-text-dim font-mono text-[11px]">{isMac ? "⌘K" : "Ctrl K"}</span>
        </button>

        {/* Random Dice */}
        <button
          onClick={handleRandom}
          className="p-1.5 border border-dashed border-line hover:border-accent rounded-lg text-text-sub hover:text-accent bg-panel2 transition-colors"
          title={t("random_genre")}
        >
          <Shuffle className="w-4 h-4" />
        </button>

        {/* Language Switch */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1 text-xs font-mono font-bold text-text-sub hover:text-text px-2 py-1.5 border border-line hover:border-line-strong rounded-lg bg-panel2 transition-colors"
          title="Switch Language"
        >
          <span className="text-accent">{language === "zh" ? "EN" : "中"}</span>
        </button>

        {/* Updates / Version Button */}
        {onOpenUpdates && (
          <button
            onClick={onOpenUpdates}
            className="flex items-center gap-1.5 text-xs font-mono font-medium text-text-sub hover:text-accent px-2 py-1.5 border border-line hover:border-accent/40 rounded-lg bg-panel2 transition-colors"
            title={language === "zh" ? "检查更新与更新记录" : "Check for updates & changelog"}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="hidden sm:inline">v{CURRENT_CLIENT_VERSION}</span>
          </button>
        )}

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          className="md:hidden p-1.5 border border-line rounded-lg text-text-sub hover:text-text bg-panel2"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-panel2/98 backdrop-blur-lg border-b border-line p-3 space-y-1.5 shadow-2xl max-h-[85vh] overflow-y-auto">
          {/* Primary Tabs */}
          <button
            onClick={() => {
              onSelectTab("studio");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
              currentTab === "studio"
                ? "border-accent/50 text-accent bg-accent/10"
                : "border-line text-text-sub hover:text-text hover:bg-panel"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t("nav_studio")}</span>
          </button>

          <button
            onClick={() => {
              onSelectTab("chords");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
              currentTab === "chords"
                ? "border-accent/50 text-accent bg-accent/10"
                : "border-line text-text-sub hover:text-text hover:bg-panel"
            }`}
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>{t("nav_chords")}</span>
          </button>

          {/* Explore Subgroup */}
          <div className="pt-2 pb-1">
            <div className="px-2 text-[10px] font-mono uppercase tracking-wider text-text-dim flex items-center gap-1.5">
              <Compass className="w-3 h-3 text-accent" />
              <span>{t("nav_explore")}</span>
            </div>
          </div>
          <div className="pl-2 space-y-1 border-l border-line ml-2">
            {exploreItems.map((item) => {
              const isSubActive = currentTab === item.tab;
              return (
                <button
                  key={item.tab}
                  onClick={() => {
                    onSelectTab(item.tab);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                    isSubActive
                      ? "border-accent/50 text-accent bg-accent/10"
                      : "border-transparent text-text-sub hover:text-text hover:bg-panel"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span>{t(item.labelKey)}</span>
                  </div>
                  <span className="text-[10px] font-mono text-text-dim">
                    {language === "zh" ? item.descZh : item.descEn}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Compare & Challenge */}
          <button
            onClick={() => {
              onSelectTab("compare");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
              currentTab === "compare"
                ? "border-accent/50 text-accent bg-accent/10"
                : "border-line text-text-sub hover:text-text hover:bg-panel"
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>{t("nav_compare")}</span>
          </button>

          <button
            onClick={() => {
              onSelectTab("challenge");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
              currentTab === "challenge"
                ? "border-accent/50 text-accent bg-accent/10"
                : "border-line text-text-sub hover:text-text hover:bg-panel"
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{t("nav_challenge")}</span>
          </button>

          {onOpenUpdates && (
            <button
              onClick={() => {
                onOpenUpdates();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-line text-text-sub hover:text-accent hover:bg-panel transition-colors pt-2.5 mt-2 border-t border-t-[#23262d]"
            >
              <History className="w-3.5 h-3.5 text-accent" />
              <span>{language === "zh" ? "检查更新 & 更新记录" : "Updates & Changelog"}</span>
              <span className="ml-auto font-mono text-[10px] text-text-dim">v{CURRENT_CLIENT_VERSION}</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
};

