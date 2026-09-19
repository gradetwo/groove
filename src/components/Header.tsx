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
  ChevronDown,
  Activity,
  Disc,
  Wand2,
  Keyboard,
  SlidersHorizontal,
  Settings,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { useDeviceCapabilities } from "../hooks/useDeviceCapabilities";
import { GENRE_INDEX } from "../data/index/genresIndex";
import { CURRENT_CLIENT_VERSION } from "./UpdatesModal";

/**
 * Re-exported from `src/app/navigation.ts` so existing importers keep working. New code — and
 * especially anything below the UI layer — should import the union from there: a destination is
 * shared vocabulary, not part of this component's contract.
 */
import type { NavTab } from "../app/navigation";
export type { NavTab };

interface HeaderProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenSearch: () => void;
  onRandomGenre: (genre: { id: string }) => void;
  onOpenUpdates?: () => void;
  onOpenShortcuts?: () => void;
  onOpenHelp?: () => void;
  onOpenOnboarding?: () => void;
  /** Opens the global settings panel (item ⑤). */
  onOpenSettings?: () => void;
  /**
   * Opens the app's phone "sections" sheet (search, settings, help, updates, every tab).
   *
   * The phone header needs this because the sheet's own tab-bar opener is unreachable in portrait:
   * measured at 390×664, the 48×48 virtual-keyboard FAB sits exactly over the centre of the "You"
   * tab (`elementFromPoint` at the tab's centre returns `virtual-keyboard-fab`), leaving two ~15 px
   * slivers. The header's own 44 px button is the reliable way in — and `MobileTabBar.tsx` is
   * reserved by the design freeze, so the FAB overlap itself is recorded rather than moved.
   */
  onOpenMore?: () => void;
  analyser?: AnalyserNode | null;
  isPlaying?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenSearch,
  onRandomGenre,
  onOpenUpdates,
  onOpenShortcuts,
  onOpenHelp,
  onOpenOnboarding,
  onOpenSettings,
  onOpenMore,
  analyser,
  isPlaying = false,
}) => {
  const { t, toggleLanguage, isZh } = useLanguage();
  /** Phone shell: the header keeps the brand and nothing else (see the right-tools block below). */
  const { isMobile } = useDeviceCapabilities();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const exploreRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  /**
   * A device that becomes a phone mid-session (a touch laptop resized below the breakpoint, a
   * convertible) must not keep a drawer state that has no visible toggle any more.
   */
  useEffect(() => {
    if (isMobile) setMobileMenuOpen(false);
  }, [isMobile]);

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

    // A-07: allocate once per effect instead of ~60 times per second.
    let frequencyData: Uint8Array<ArrayBuffer> | null = null;

    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      ctx.clearRect(0, 0, 192, 60);

      if (analyser && isPlaying) {
        if (!frequencyData || frequencyData.length !== analyser.frequencyBinCount) {
          frequencyData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        }
        const data = frequencyData;
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

  const labItems: Array<{ tab: NavTab; labelKey: string; descKey: string; icon: React.ReactNode }> = [
    { tab: "console", labelKey: "console_nav_label", descKey: "console_nav_desc", icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
    { tab: "analyzer", labelKey: "nav_analyzer", descKey: "nav_analyzer_desc", icon: <Activity className="w-3.5 h-3.5" /> },
    { tab: "masterclass", labelKey: "nav_masterclass", descKey: "nav_masterclass_desc", icon: <Disc className="w-3.5 h-3.5" /> },
    { tab: "maker", labelKey: "nav_maker", descKey: "nav_maker_desc", icon: <Wand2 className="w-3.5 h-3.5" /> },
  ];

  const exploreItems: Array<{ tab: NavTab; labelKey: string; descKey: string; icon: React.ReactNode }> = [
    { tab: "galaxy", labelKey: "nav_galaxy", descKey: "nav_galaxy_desc", icon: <Orbit className="w-3.5 h-3.5" /> },
    { tab: "horizontal-timeline", labelKey: "nav_timeline_h", descKey: "nav_timeline_h_desc", icon: <Clock className="w-3.5 h-3.5" /> },
    { tab: "vertical-timeline", labelKey: "nav_timeline_v", descKey: "nav_timeline_v_desc", icon: <AlignVerticalJustifyStart className="w-3.5 h-3.5" /> },
  ];

  const isExploreActive = ["console", "analyzer", "maker", "masterclass", "galaxy", "horizontal-timeline", "vertical-timeline"].includes(currentTab);

  const handleRandom = () => {
    const randomIndex = Math.floor(Math.random() * GENRE_INDEX.length);
    const g = GENRE_INDEX[randomIndex];
    onRandomGenre(g);
  };

  return (
    <header 
      className={`sticky top-0 z-50 w-full ${mobileMenuOpen ? "bg-[#0a0b0d]" : "bg-bg/95 backdrop-blur-md"} border-b border-line px-4 sm:px-6 pb-3 flex items-center justify-between gap-4`}
      style={{
        paddingTop: "max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.375rem))",
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      {/* Brand / Logo */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => onSelectTab("studio")} 
          aria-label="GROOVE LAB Home"
          /* 44 px tall on a phone: the brand link is the header's only control there. */
          className="flex min-h-11 items-center gap-2.5 cursor-pointer select-none group border-0 bg-transparent p-0 text-left"
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

        {/* 3. Kick Anatomy */}
        <button
          onClick={() => onSelectTab("kick")}
          title={t("nav_kick")}
          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
            currentTab === "kick"
              ? "border-accent/50 text-accent bg-accent/10 shadow-[0_0_12px_rgba(245,183,61,0.15)]"
              : "border-line text-text-sub hover:text-text hover:border-line-strong bg-panel2"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span className="truncate max-w-[84px] whitespace-nowrap select-none">{t("nav_kick")}</span>
        </button>

        {/* 4. Explore Dropdown (P1-09 IA Reorganization) */}
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
            <div className="absolute top-full left-0 mt-1.5 w-56 bg-[#0d0e12] border border-line rounded-xl p-1.5 shadow-2xl z-50 animate-fade-in">
              <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-text-dim select-none flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-accent" />
                <span>{isZh ? "高级与实验室" : "Pro & Labs"}</span>
              </div>
              <div className="space-y-0.5 mt-0.5 mb-1.5">
                {labItems.map((item) => {
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
                        {t(item.descKey)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-text-dim select-none flex items-center gap-1.5 pt-1.5 border-t border-line/60">
                <Compass className="w-3 h-3 text-accent" />
                <span>{t("header_explore_title")}</span>
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
                        {t(item.descKey)}
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

      {/*
        Phone header: the brand, and one 44 px way into the app's own sections sheet — search,
        settings, help, updates and every tab live there behind big rows. Measured at 390×664, the
        nine desktop controls this replaces were 24–36 px each, and the sheet's tab-bar opener is
        covered by the keyboard FAB in portrait (see `onOpenMore` above), which is why this button
        exists rather than relying on that tab.
      */}
      {isMobile && onOpenMore && (
        <button
          type="button"
          onClick={onOpenMore}
          data-testid="header-more"
          aria-haspopup="dialog"
          aria-label={t("mobile_more_title")}
          title={t("mobile_more_title")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-panel2 text-text-sub transition-colors hover:border-accent hover:text-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/*
        Right Tools: Spectrum, Search, Dice, Lang, Settings, Updates, Help, Onboarding, Menu.

        **Not on a phone.** Every one of these has a bigger twin behind the phone's own chrome:
        search, settings, help and updates are rows in the tab bar's "More" sheet; the language
        switch is inside Settings; the onboarding tour opens from the Help centre; a random genre
        is the Explore view's own button; and navigation is the tab bar plus that same sheet, which
        already lists every tab this header's dropdown lists. Measured at 390×664 before this
        change: nine controls here, seven of them 24–36 px — under the 44 px a thumb needs, and
        exactly the "wall of buttons" a phone should not have. What is left on a phone is the brand
        link, which the audit reports at 126×44.
      */}
      {!isMobile && (
        <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Spectrum Canvas - click opens full Panoramic Analyzer */}
        <button
          type="button"
          onClick={() => onSelectTab("analyzer")}
          className="cursor-pointer group flex items-center hidden 2xl:block p-0.5 rounded hover:bg-white/5 transition-all"
          title={isZh ? "点击打开全景声谱分析仪与示波器 (P6-05)" : "Open Panoramic Spectrogram & Lissajous Scope (P6-05)"}
          aria-label="Open Analyzer"
        >
          <canvas
            ref={canvasRef}
            width={192}
            height={60}
            className="w-20 h-6 sm:w-24 sm:h-7 opacity-90 group-hover:opacity-100 group-hover:brightness-125 transition-all pointer-events-none"
          />
        </button>

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
          type="button"
          onClick={handleRandom}
          className="p-1.5 border border-dashed border-line hover:border-accent rounded-lg text-text-sub hover:text-accent bg-panel2 transition-colors"
          title={t("random_genre")}
          aria-label={t("random_genre")}
        >
          <Shuffle className="w-4 h-4" />
        </button>

        {/* Language Switch */}
        <button
          onClick={toggleLanguage}
          data-testid="header-language-switch"
          className="flex items-center gap-1 text-xs font-mono font-bold text-text-sub hover:text-text px-2 py-1.5 border border-line hover:border-line-strong rounded-lg bg-panel2 transition-colors"
          title={t("lang_switch_title")}
        >
          <span className="text-accent">{t("lang_switch_target")}</span>
        </button>

        {/* Global settings (item ⑤). Deliberately between the language switch and the version
            button: those three are the app-level controls, and it is where the user looked. */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            data-testid="header-settings-open"
            className="flex items-center justify-center p-1.5 border border-line hover:border-accent rounded-lg text-text-sub hover:text-accent bg-panel2 transition-colors"
            title={t("settings_open")}
            aria-label={t("settings_open")}
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {/* Updates / Version Button */}
        {onOpenUpdates && (
          <button
            onClick={onOpenUpdates}
            data-testid="header-version-button"
            className="flex items-center gap-1.5 text-xs font-mono font-medium text-text-sub hover:text-accent px-2 py-1.5 border border-line hover:border-accent/40 rounded-lg bg-panel2 transition-colors"
            title={t("header_check_updates_title")}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="hidden sm:inline">v{CURRENT_CLIENT_VERSION}</span>
          </button>
        )}

        {/* User Manual & Help Center Button */}
        {onOpenHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            data-testid="header-help-button"
            className="hidden sm:flex items-center justify-center p-1.5 border border-line hover:border-accent rounded-lg text-text-sub hover:text-accent bg-panel2 transition-colors"
            title={t("help_manual_title")}
            aria-label="User Manual & Help Center"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        )}

        {/* New User Onboarding Tour Button */}
        {onOpenOnboarding && (
          <button
            type="button"
            onClick={onOpenOnboarding}
            data-testid="header-onboarding-button"
            className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 border border-accent/40 hover:border-accent rounded-lg text-accent hover:bg-accent/10 bg-panel2 transition-all text-xs font-medium shadow-[0_0_8px_rgba(245,183,61,0.12)]"
            title={t("onboarding_header_btn")}
            aria-label="New User Onboarding Tour"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span className="hidden 2xl:inline">{t("onboarding_header_btn")}</span>
          </button>
        )}

        {/* Keyboard Shortcuts Guide Button (P2-20) */}
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="hidden sm:flex items-center justify-center p-1.5 border border-line hover:border-accent rounded-lg text-text-sub hover:text-accent bg-panel2 transition-colors"
            title={t("shortcuts_guide_title") || "Keyboard Shortcuts (?)"}
            aria-label="Keyboard Shortcuts Guide"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        )}

        {/* Mobile menu toggle. Kept for a *narrow desktop window* (the nav above is `md:flex`), and
            still shown to phones by width — but not when `isMobile`, where the tab bar's More sheet
            already lists every entry this dropdown has. */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
          className="md:hidden p-1.5 border border-line rounded-lg text-text-sub hover:text-text bg-panel2"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
        </div>
      )}

      {/* Mobile backdrop scrim (completely solid dimming layer) */}
      {!isMobile && mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 top-0 bg-black/85 z-40"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile dropdown: 100% opaque solid dark panel with solid button cards */}
      {!isMobile && mobileMenuOpen && (
        <div 
          className="md:hidden absolute top-full left-0 right-0 bg-[#090b10] border-b-2 border-line-strong p-3 space-y-2 shadow-[0_25px_60px_rgba(0,0,0,0.98)] max-h-[85vh] overflow-y-auto z-50 overscroll-contain"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
            paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
          }}
        >
          {/* Primary Tabs */}
          <button
            onClick={() => {
              onSelectTab("studio");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 text-xs font-medium px-3.5 py-2.5 rounded-xl border transition-all ${
              currentTab === "studio"
                ? "border-accent/60 text-accent bg-accent/15 font-semibold shadow-[0_0_12px_rgba(245,183,61,0.2)]"
                : "border-line text-text hover:text-accent bg-[#13151d] hover:bg-[#1a1d27]"
            }`}
          >
            <Sliders className="w-4 h-4 text-accent shrink-0" />
            <span className="font-semibold">{t("nav_studio")}</span>
          </button>

          <button
            onClick={() => {
              onSelectTab("chords");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 text-xs font-medium px-3.5 py-2.5 rounded-xl border transition-all ${
              currentTab === "chords"
                ? "border-accent/60 text-accent bg-accent/15 font-semibold shadow-[0_0_12px_rgba(245,183,61,0.2)]"
                : "border-line text-text hover:text-accent bg-[#13151d] hover:bg-[#1a1d27]"
            }`}
          >
            <Music2 className="w-4 h-4 text-accent shrink-0" />
            <span className="font-semibold">{t("nav_chords")}</span>
          </button>

          <button
            onClick={() => {
              onSelectTab("kick");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 text-xs font-medium px-3.5 py-2.5 rounded-xl border transition-all ${
              currentTab === "kick"
                ? "border-accent/60 text-accent bg-accent/15 font-semibold shadow-[0_0_12px_rgba(245,183,61,0.2)]"
                : "border-line text-text hover:text-accent bg-[#13151d] hover:bg-[#1a1d27]"
            }`}
          >
            <Activity className="w-4 h-4 text-accent shrink-0" />
            <span className="font-semibold">{t("nav_kick")}</span>
          </button>

          {/* Explore Subgroup */}
          <div className="pt-2 pb-0.5">
            <div className="px-2 text-[10px] font-mono uppercase tracking-wider text-text-dim flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-accent" />
              <span className="font-bold">{t("nav_explore")}</span>
            </div>
          </div>
          <div className="space-y-1.5 pl-2.5 border-l-2 border-[#262a38] ml-1">
            {exploreItems.map((item) => {
              const isSubActive = currentTab === item.tab;
              return (
                <button
                  key={item.tab}
                  onClick={() => {
                    onSelectTab(item.tab);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                    isSubActive
                      ? "border-accent/60 text-accent bg-accent/15 font-semibold shadow-[0_0_10px_rgba(245,183,61,0.15)]"
                      : "border-line/70 text-text-sub hover:text-text bg-[#0f1118] hover:bg-[#161922]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-accent">{item.icon}</span>
                    <span className={isSubActive ? "text-accent font-semibold" : "text-text font-medium"}>{t(item.labelKey)}</span>
                  </div>
                  <span className="text-[10px] font-mono text-text-dim">
                    {t(item.descKey)}
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
            className={`w-full flex items-center gap-2 text-xs font-medium px-3.5 py-2.5 rounded-xl border transition-all ${
              currentTab === "compare"
                ? "border-accent/60 text-accent bg-accent/15 font-semibold shadow-[0_0_12px_rgba(245,183,61,0.2)]"
                : "border-line text-text hover:text-accent bg-[#13151d] hover:bg-[#1a1d27]"
            }`}
          >
            <Columns className="w-4 h-4 text-accent shrink-0" />
            <span className="font-semibold">{t("nav_compare")}</span>
          </button>

          <button
            onClick={() => {
              onSelectTab("challenge");
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-2 text-xs font-medium px-3.5 py-2.5 rounded-xl border transition-all ${
              currentTab === "challenge"
                ? "border-accent/60 text-accent bg-accent/15 font-semibold shadow-[0_0_12px_rgba(245,183,61,0.2)]"
                : "border-line text-text hover:text-accent bg-[#13151d] hover:bg-[#1a1d27]"
            }`}
          >
            <HelpCircle className="w-4 h-4 text-accent shrink-0" />
            <span className="font-semibold">{t("nav_challenge")}</span>
          </button>

          {/* Pro Tools: Console, Analyzer, Maker */}
          <div className="pt-2 pb-0.5">
            <div className="px-2 text-[10px] font-mono uppercase tracking-wider text-text-dim flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-accent" />
              <span className="font-bold">{isZh ? "高级与实验室" : "Pro & Labs"}</span>
            </div>
          </div>
          <div className="space-y-1.5 pl-2.5 border-l-2 border-[#262a38] ml-1">
            {labItems.map((item) => {
              const isSubActive = currentTab === item.tab;
              return (
                <button
                  key={item.tab}
                  onClick={() => {
                    onSelectTab(item.tab);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between text-xs font-medium px-3 py-2 rounded-lg border transition-all ${
                    isSubActive
                      ? "border-accent/60 text-accent bg-accent/15 font-semibold shadow-[0_0_10px_rgba(245,183,61,0.15)]"
                      : "border-line/70 text-text-sub hover:text-text bg-[#0f1118] hover:bg-[#161922]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-accent">{item.icon}</span>
                    <span className={isSubActive ? "text-accent font-semibold" : "text-text font-medium"}>{t(item.labelKey)}</span>
                  </div>
                  <span className="text-[10px] font-mono text-text-dim">
                    {t(item.descKey)}
                  </span>
                </button>
              );
            })}
          </div>

          {onOpenOnboarding && (
            <button
              onClick={() => {
                onOpenOnboarding();
                setMobileMenuOpen(false);
              }}
              data-testid="mobile-onboarding-button"
              className="w-full flex items-center gap-2 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-accent/50 text-accent bg-accent/15 hover:bg-accent/25 transition-all mt-2"
            >
              <Sparkles className="w-4 h-4 text-accent shrink-0" />
              <span>{t("onboarding_header_btn")}</span>
              <span className="ml-auto text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/30 text-accent font-bold">
                GUIDE
              </span>
            </button>
          )}

          {onOpenHelp && (
            <button
              onClick={() => {
                onOpenHelp();
                setMobileMenuOpen(false);
              }}
              data-testid="mobile-help-button"
              className="w-full flex items-center gap-2 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-accent/40 text-accent bg-accent/10 hover:bg-accent/20 transition-all mt-2"
            >
              <BookOpen className="w-4 h-4 text-accent shrink-0" />
              <span>{t("help_mobile_entry_label")}</span>
              <span className="ml-auto text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent font-bold">
                {t("help_mobile_entry_tag")}
              </span>
            </button>
          )}

          {onOpenShortcuts && (
            <button
              onClick={() => {
                onOpenShortcuts();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 text-xs font-medium px-3.5 py-2.5 rounded-xl border border-line text-text hover:text-accent bg-[#13151d] hover:bg-[#1a1d27] transition-all"
            >
              <Keyboard className="w-4 h-4 text-accent shrink-0" />
              <span>{isZh ? "键盘快捷键指南 (?)" : "Keyboard Shortcuts (?)"}</span>
              <kbd className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#1c1f2b] border border-line text-text-sub">?</kbd>
            </button>
          )}

          {onOpenUpdates && (
            <button
              onClick={() => {
                onOpenUpdates();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 text-xs font-medium px-3.5 py-2.5 rounded-xl border border-line text-text hover:text-accent bg-[#13151d] hover:bg-[#1a1d27] transition-all pt-2.5 mt-2 border-t border-t-[#2b2f3d]"
            >
              <History className="w-4 h-4 text-accent shrink-0" />
              <span>{t("header_updates_btn")}</span>
              <span className="ml-auto font-mono text-[10px] text-accent font-semibold px-2 py-0.5 rounded bg-accent/10 border border-accent/30">v{CURRENT_CLIENT_VERSION}</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
};

