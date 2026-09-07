import React, { useState, useEffect, useRef } from "react";
import { 
  Sliders, 
  Orbit, 
  Clock, 
  Columns, 
  HelpCircle, 
  Search, 
  Globe, 
  Shuffle, 
  Menu, 
  X,
  AlignVerticalJustifyStart
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { ALL_GENRES } from "../data/genres";
import { Genre } from "../types/genre";

export type NavTab = 
  | "studio" 
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
  onRandomGenre: (genre: Genre) => void;
  analyser?: AnalyserNode | null;
  isPlaying?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenSearch,
  onRandomGenre,
  analyser,
  isPlaying = false,
}) => {
  const { t, language, toggleLanguage } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  const navItems: Array<{ tab: NavTab; labelKey: string; icon: React.ReactNode }> = [
    { tab: "studio", labelKey: "nav_studio", icon: <Sliders className="w-3.5 h-3.5" /> },
    { tab: "galaxy", labelKey: "nav_galaxy", icon: <Orbit className="w-3.5 h-3.5" /> },
    { tab: "horizontal-timeline", labelKey: "nav_timeline_h", icon: <Clock className="w-3.5 h-3.5" /> },
    { tab: "vertical-timeline", labelKey: "nav_timeline_v", icon: <AlignVerticalJustifyStart className="w-3.5 h-3.5" /> },
    { tab: "compare", labelKey: "nav_compare", icon: <Columns className="w-3.5 h-3.5" /> },
    { tab: "challenge", labelKey: "nav_challenge", icon: <HelpCircle className="w-3.5 h-3.5" /> },
  ];

  const handleRandom = () => {
    const randomIndex = Math.floor(Math.random() * ALL_GENRES.length);
    const g = ALL_GENRES[randomIndex];
    onRandomGenre(g);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0a0b0d]/95 backdrop-blur-md border-b border-[#23262d] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      {/* Brand / Logo */}
      <div className="flex items-center gap-4">
        <div 
          onClick={() => onSelectTab("studio")} 
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          {/* Glowing amber dot */}
          <span className="w-2.5 h-2.5 rounded-full bg-[#f5b73d] shadow-[0_0_10px_#f5b73d] shrink-0 group-hover:scale-125 transition-transform" />
          <span className="font-[Space_Grotesk] font-bold text-base sm:text-lg tracking-[0.06em] text-[#e9e7e0]">
            GROOVE&nbsp;ATLAS
          </span>
        </div>

        {/* Tagline */}
        <div className="hidden lg:block text-xs text-[#8b8f99] border-l border-[#23262d] pl-4 leading-none">
          {language === "zh" ? "曲风步进实验室 · 159 种全合成音源" : "Genre Groove Lab · 159 Synthetic Genres"}
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="hidden md:flex items-center gap-1.5">
        {navItems.map((item) => {
          const isActive = currentTab === item.tab;
          return (
            <button
              key={item.tab}
              onClick={() => onSelectTab(item.tab)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                isActive
                  ? "border-[#f5b73d]/50 text-[#f5b73d] bg-[#f5b73d]/10 shadow-[0_0_12px_rgba(245,183,61,0.15)]"
                  : "border-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] hover:border-[#393d46] bg-[#0d0e12]"
              }`}
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
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

        {/* Global Search Button */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 text-xs text-[#8b8f99] hover:text-[#e9e7e0] px-2.5 py-1.5 border border-[#23262d] hover:border-[#393d46] rounded-lg bg-[#0d0e12] transition-colors"
          title="Search (Cmd+K)"
        >
          <Search className="w-3.5 h-3.5 text-[#8b8f99]" />
          <span className="hidden xl:inline text-[#5a5e68]">Cmd+K</span>
        </button>

        {/* Random Dice */}
        <button
          onClick={handleRandom}
          className="p-1.5 border border-dashed border-[#23262d] hover:border-[#f5b73d] rounded-lg text-[#8b8f99] hover:text-[#f5b73d] bg-[#0d0e12] transition-colors"
          title={t("random_genre")}
        >
          <Shuffle className="w-4 h-4" />
        </button>

        {/* Language Switch */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1 text-xs font-mono font-bold text-[#8b8f99] hover:text-[#e9e7e0] px-2 py-1.5 border border-[#23262d] hover:border-[#393d46] rounded-lg bg-[#0d0e12] transition-colors"
          title="Switch Language"
        >
          <span className="text-[#f5b73d]">{language === "zh" ? "EN" : "中"}</span>
        </button>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-1.5 border border-[#23262d] rounded-lg text-[#8b8f99] hover:text-[#e9e7e0] bg-[#0d0e12]"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-[#0d0e12] border-b border-[#23262d] p-3 space-y-1.5 shadow-2xl">
          {navItems.map((item) => {
            const isActive = currentTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => {
                  onSelectTab(item.tab);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                  isActive
                    ? "border-[#f5b73d]/50 text-[#f5b73d] bg-[#f5b73d]/10"
                    : "border-[#23262d] text-[#8b8f99] hover:text-[#e9e7e0] hover:bg-[#121317]"
                }`}
              >
                {item.icon}
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
