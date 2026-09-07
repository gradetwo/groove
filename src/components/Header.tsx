import React, { useState } from "react";
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
  Disc3,
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
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenSearch,
  onRandomGenre,
}) => {
  const { t, language, toggleLanguage } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ tab: NavTab; labelKey: string; icon: React.ReactNode }> = [
    { tab: "studio", labelKey: "nav_studio", icon: <Sliders className="w-4 h-4" /> },
    { tab: "galaxy", labelKey: "nav_galaxy", icon: <Orbit className="w-4 h-4" /> },
    { tab: "horizontal-timeline", labelKey: "nav_timeline_h", icon: <Clock className="w-4 h-4" /> },
    { tab: "vertical-timeline", labelKey: "nav_timeline_v", icon: <AlignVerticalJustifyStart className="w-4 h-4" /> },
    { tab: "compare", labelKey: "nav_compare", icon: <Columns className="w-4 h-4" /> },
    { tab: "challenge", labelKey: "nav_challenge", icon: <HelpCircle className="w-4 h-4" /> },
  ];

  const handleRandom = () => {
    const randomIndex = Math.floor(Math.random() * ALL_GENRES.length);
    const g = ALL_GENRES[randomIndex];
    onRandomGenre(g);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800/80">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand / Logo */}
        <div 
          onClick={() => onSelectTab("studio")} 
          className="flex items-center space-x-2.5 cursor-pointer group select-none"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform duration-200">
            <Disc3 className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-lg tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-100 to-neutral-400">
                GROOVE
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                ODYSSEY
              </span>
            </div>
            <p className="text-[10px] text-neutral-400 hidden sm:block leading-none">
              159 Genres & Realtime Synthesizer
            </p>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav className="hidden lg:flex items-center space-x-1 bg-neutral-900/60 p-1 rounded-xl border border-neutral-800/60">
          {navItems.map((item) => {
            const isActive = currentTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => onSelectTab(item.tab)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                }`}
              >
                {item.icon}
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Tools: Search, Random, i18n, Mobile Toggle */}
        <div className="flex items-center space-x-2">
          {/* Quick Search Button */}
          <button
            onClick={onOpenSearch}
            className="flex items-center space-x-2 px-2.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white text-xs sm:text-sm transition-colors"
            title="Search Genres (Cmd+K)"
          >
            <Search className="w-4 h-4 text-indigo-400" />
            <span className="hidden md:inline">{t("search_placeholder").slice(0, 8)}...</span>
            <kbd className="hidden md:inline px-1.5 py-0.5 text-[10px] rounded bg-neutral-800 border border-neutral-700 text-neutral-400">
              ⌘K
            </kbd>
          </button>

          {/* Random Genre */}
          <button
            onClick={handleRandom}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-amber-400 transition-colors"
            title={t("random_genre")}
          >
            <Shuffle className="w-4 h-4" />
          </button>

          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-colors"
            title="Toggle Language / 切换语言"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-400" />
            <span>{language === "zh" ? "中" : "EN"}</span>
          </button>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-neutral-950/95 border-b border-neutral-800 px-4 pt-2 pb-4 space-y-1 backdrop-blur-xl">
          {navItems.map((item) => {
            const isActive = currentTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => {
                  onSelectTab(item.tab);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-900"
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
