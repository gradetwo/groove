import React, { useState, useEffect, useMemo } from "react";
import { Modal } from "../../ui/Modal";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  BookOpen,
  Search,
  Sliders,
  Music,
  Activity,
  SlidersHorizontal,
  Download,
  HelpCircle,
  Keyboard,
  Compass,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Layers,
  Volume2,
} from "lucide-react";
import type { NavTab } from "../Header";

export interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab?: (tab: NavTab) => void;
  onOpenShortcuts?: () => void;
  initialCategory?: HelpCategory;
}

export type HelpCategory =
  | "quickstart"
  | "tutorials"
  | "sequencer"
  | "mixing"
  | "theory"
  | "export"
  | "faq"
  | "shortcuts";

export const HelpCenterModal: React.FC<HelpCenterModalProps> = ({
  isOpen,
  onClose,
  onSelectTab,
  onOpenShortcuts,
  initialCategory,
}) => {
  const { t, language } = useLanguage();
  const isZh = language === "zh";

  const [activeCategory, setActiveCategory] = useState<HelpCategory>(initialCategory ?? "quickstart");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory, isOpen]);


  // Tutorial progression state for interactive step-throughs
  const [tutorialStep, setTutorialStep] = useState<Record<string, number>>({
    drum: 0,
    piano: 0,
    mixer: 0,
    acoustics: 0,
    maker: 0,
  });

  const categories: Array<{ id: HelpCategory; label: string; icon: React.ReactNode }> = [
    { id: "quickstart", label: t("help_tab_quickstart"), icon: <BookOpen className="w-4 h-4" /> },
    { id: "tutorials", label: t("help_tab_tutorials"), icon: <Sparkles className="w-4 h-4" /> },
    { id: "sequencer", label: t("help_tab_sequencer"), icon: <Sliders className="w-4 h-4" /> },
    { id: "mixing", label: t("help_tab_mixing"), icon: <SlidersHorizontal className="w-4 h-4" /> },
    { id: "theory", label: t("help_tab_theory"), icon: <Music className="w-4 h-4" /> },
    { id: "export", label: t("help_tab_export"), icon: <Download className="w-4 h-4" /> },
    { id: "faq", label: t("help_tab_faq"), icon: <HelpCircle className="w-4 h-4" /> },
    { id: "shortcuts", label: t("help_tab_shortcuts"), icon: <Keyboard className="w-4 h-4" /> },
  ];

  const handleNavigate = (tab: NavTab) => {
    onClose();
    if (onSelectTab) {
      onSelectTab(tab);
    }
  };

  const tutorialsData = [
    {
      id: "drum",
      title: t("tut_drum_title"),
      desc: t("tut_drum_desc"),
      targetTab: "studio" as NavTab,
      targetBtn: isZh ? "进入编曲台编排鼓机" : "Launch Sequencer Grid",
      steps: [
        { label: t("tut_drum_s1"), tip: isZh ? "四四拍是 House、Techno 和 Funk 的经典基底" : "Four-on-the-floor is the backbone of House & Techno" },
        { label: t("tut_drum_s2"), tip: isZh ? "军鼓提供清晰的反拍律动点" : "Snare drives the essential rhythmic backbeat" },
        { label: t("tut_drum_s3"), tip: isZh ? "欧几里得律动利用最大公约数算法分布节奏点" : "Euclidean math distributes hits across steps evenly" },
        { label: t("tut_drum_s4"), tip: isZh ? "高对比度力度通道提供从 p 到 fff 的动态控制" : "Dynamic velocity shaping from p to fff adds realism" },
      ],
    },
    {
      id: "piano",
      title: t("tut_piano_title"),
      desc: t("tut_piano_desc"),
      targetTab: "studio" as NavTab,
      targetBtn: isZh ? "打开钢琴卷帘编曲" : "Open Piano Roll Canvas",
      steps: [
        { label: t("tut_piano_s1"), tip: isZh ? "支持黑白键全音域纵向排布与音符拖拽" : "High-contrast full-range pitch canvas with dragging" },
        { label: t("tut_piano_s2"), tip: isZh ? "22 种音阶高亮辅助避免写出离调音" : "In-scale lanes and ROOT watermarks guide harmonic writing" },
        { label: t("tut_piano_s3"), tip: isZh ? "和弦印章支持三和弦、七和弦、九和弦与挂留和弦" : "Multi-note chord ghost preview stamps full voicings" },
        { label: t("tut_piano_s4"), tip: isZh ? "升序 (Arp ▲) 与降序 (Arp ▼) 琶音器一键展开" : "Arpeggiate selected chord notes chronologically across steps" },
      ],
    },
    {
      id: "mixer",
      title: t("tut_mixer_title"),
      desc: t("tut_mixer_desc"),
      targetTab: "console" as NavTab,
      targetBtn: isZh ? "进入独立硬件调音台" : "Open Console Mixer",
      steps: [
        { label: t("tut_mixer_s1"), tip: isZh ? "具备多轨独立推子、声像平衡与静音独奏" : "Full channel strips with precision faders and mute/solo" },
        { label: t("tut_mixer_s2"), tip: isZh ? "立体声乒乓延迟与算法混响总线发送" : "Dedicated stereo ping-pong delay and algorithmic reverb buses" },
        { label: t("tut_mixer_s3"), tip: isZh ? "母带级真实峰值砖墙限制器杜绝爆音" : "True-peak brickwall limiter protects master output" },
      ],
    },
    {
      id: "acoustics",
      title: t("tut_acoustics_title"),
      desc: t("tut_acoustics_desc"),
      targetTab: "analyzer" as NavTab,
      targetBtn: isZh ? "查看全景声谱分析仪" : "Open Panoramic Analyzer",
      steps: [
        { label: t("tut_acoustics_s1"), tip: isZh ? "可在底鼓实验室解构击打瞬态与低频下潜" : "Inspect kick transient clicks, pitch drop, and resonance" },
        { label: t("tut_acoustics_s2"), tip: isZh ? "32 频段高精频谱与李萨如立体声相位椭圆" : "Real-time FFT spectrogram and Lissajous phase scope" },
        { label: t("tut_acoustics_s3"), tip: isZh ? "内置 440Hz 纯音与粉红噪声校准发生器" : "Reference sine wave and pink noise signal generator" },
      ],
    },
    {
      id: "maker",
      title: t("tut_maker_title"),
      desc: t("tut_maker_desc"),
      targetTab: "maker" as NavTab,
      targetBtn: isZh ? "进入曲风制作工坊" : "Open Genre Maker",
      steps: [
        { label: t("tut_maker_s1"), tip: isZh ? "可自由分叉 159 种曲风或从零构建全新流派" : "Fork existing genres or craft hybrid musical styles" },
        { label: t("tut_maker_s2"), tip: isZh ? "定制 BPM、摇摆律动、合成器参数与打击乐" : "Customize tempo, swing, synth timbres, and step patterns" },
        { label: t("tut_maker_s3"), tip: isZh ? "生成包含完整参数的无损压缩 URL 链接分享" : "Share lossless compressed URLs or export GS1 patch bundles" },
      ],
    },
  ];

  const shortcutsList = [
    { category: isZh ? "全局导航" : "Navigation", keys: ["G", "S"], desc: isZh ? "跳转至编曲工作台" : "Go to Sequencer Studio" },
    { category: isZh ? "全局导航" : "Navigation", keys: ["G", "C"], desc: isZh ? "跳转至和弦工坊" : "Go to Chord Progressions" },
    { category: isZh ? "全局导航" : "Navigation", keys: ["G", "Z"], desc: isZh ? "跳转至声谱分析仪" : "Go to Acoustic Analyzer" },
    { category: isZh ? "全局导航" : "Navigation", keys: ["G", "K"], desc: isZh ? "跳转至底鼓实验室" : "Go to Kick Anatomy" },
    { category: isZh ? "全局导航" : "Navigation", keys: ["G", "G"], desc: isZh ? "跳转至曲风星系图谱" : "Go to Genre Galaxy" },
    { category: isZh ? "全局导航" : "Navigation", keys: ["⌘ / Ctrl", "K"], desc: isZh ? "全局曲风与功能搜索" : "Global Search Modal" },
    { category: isZh ? "全局导航" : "Navigation", keys: ["?"], desc: isZh ? "打开用户手册与帮助中心" : "Open Manual & Help Center" },
    { category: isZh ? "编曲操作" : "Sequencing", keys: ["Space"], desc: isZh ? "走带播放 / 暂停" : "Play / Pause playback" },
    { category: isZh ? "编曲操作" : "Sequencing", keys: ["⌘ / Ctrl", "Z"], desc: isZh ? "撤销上一步操作" : "Undo pattern change" },
    { category: isZh ? "编曲操作" : "Sequencing", keys: ["⌘ / Ctrl", "⇧Z / Y"], desc: isZh ? "重做下一步操作" : "Redo pattern change" },
    { category: isZh ? "编曲操作" : "Sequencing", keys: ["↑", "↓", "←", "→"], desc: isZh ? "步进单元格高亮移动" : "Navigate step cells" },
    { category: isZh ? "编曲操作" : "Sequencing", keys: ["Enter"], desc: isZh ? "切换激活当前步进" : "Toggle active step" },
    { category: isZh ? "编曲操作" : "Sequencing", keys: ["V"], desc: isZh ? "展开 / 收起力度通道" : "Toggle velocity lane" },
    { category: isZh ? "编曲操作" : "Sequencing", keys: ["E"], desc: isZh ? "打开欧几里得律动生成器" : "Open Euclidean generator" },
    { category: isZh ? "编曲操作" : "Sequencing", keys: ["⌥ / Alt", "K"], desc: isZh ? "打开虚拟打字键盘" : "Toggle Musical Typing" },
  ];

  // Search filter
  const isMatch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase().trim());
  };

  const filteredTutorials = useMemo(() => {
    if (!searchQuery.trim()) return tutorialsData;
    return tutorialsData.filter(
      (t) =>
        isMatch(t.title) ||
        isMatch(t.desc) ||
        t.steps.some((s) => isMatch(s.label) || isMatch(s.tip))
    );
  }, [searchQuery, tutorialsData]);

  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) return shortcutsList;
    return shortcutsList.filter(
      (s) =>
        isMatch(s.category) ||
        isMatch(s.desc) ||
        s.keys.some((k) => isMatch(k))
    );
  }, [searchQuery, shortcutsList]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-accent">
          <BookOpen className="w-5 h-5" />
          <span className="font-bold text-base sm:text-lg">{t("help_center_title")}</span>
        </div>
      }
      maxWidth="4xl"
      className="p-0 overflow-hidden bg-[#0a0b10] border-line-strong"
    >
      <div className="flex flex-col h-[78vh] max-h-[850px]">
        {/* Top bar: Subtitle & Real-time Search */}
        <div className="p-4 sm:p-5 border-b border-line/60 bg-[#0d0f17] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs text-text-sub max-w-xl">
              {t("help_center_subtitle")}
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("help_search_placeholder")}
              className="w-full bg-[#141724] border border-line/80 rounded-xl pl-9 pr-8 py-2 text-xs text-text placeholder:text-text-dim focus:outline-none focus:border-accent/60 transition-colors"
              data-testid="help-center-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Body: Category Sidebar (or horizontal wrap) + Content Pane */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Category Tabs Sidebar */}
          <nav
            aria-label={t("help_quick_nav")}
            className="w-full md:w-56 p-2 md:p-3 border-b md:border-b-0 md:border-r border-line/60 bg-[#0b0c13] flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0"
          >
            {categories.map((cat) => {
              const isActive = activeCategory === cat.id && !searchQuery.trim();
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setSearchQuery("");
                  }}
                  data-testid={`help-category-${cat.id}`}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all text-left ${
                    isActive
                      ? "bg-accent/15 text-accent border border-accent/40 font-semibold shadow-[0_0_12px_rgba(245,183,61,0.12)]"
                      : "text-text-sub hover:text-text hover:bg-white/[0.04] border border-transparent"
                  }`}
                >
                  <span className={isActive ? "text-accent" : "text-text-dim"}>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Content Pane */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 bg-[#090a0f]" data-testid="help-center-content-pane">
            {/* Search results view if searching */}
            {searchQuery.trim() ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-line/40">
                  <span className="text-xs font-mono text-accent font-semibold">
                    {isZh ? `搜索结果: "${searchQuery}"` : `Search Results for "${searchQuery}"`}
                  </span>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-[11px] text-text-dim hover:text-accent underline"
                  >
                    {isZh ? "清除筛选" : "Clear Filter"}
                  </button>
                </div>

                {filteredTutorials.length === 0 && filteredShortcuts.length === 0 ? (
                  <div className="py-12 text-center text-text-dim text-xs">
                    {t("help_search_no_results")}
                  </div>
                ) : (
                  <>
                    {filteredTutorials.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{t("help_tab_tutorials")}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {filteredTutorials.map((tut) => (
                            <div key={tut.id} className="p-4 rounded-xl bg-[#111420] border border-line/70 space-y-2">
                              <h4 className="text-sm font-semibold text-text">{tut.title}</h4>
                              <p className="text-xs text-text-sub">{tut.desc}</p>
                              <button
                                onClick={() => handleNavigate(tut.targetTab)}
                                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/40 text-accent text-xs font-medium hover:bg-accent/25 transition-all"
                              >
                                <span>{tut.targetBtn}</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {filteredShortcuts.length > 0 && (
                      <div className="space-y-3 pt-4 border-t border-line/40">
                        <div className="text-xs font-bold uppercase tracking-wider text-[#45e0c9] flex items-center gap-1.5">
                          <Keyboard className="w-3.5 h-3.5" />
                          <span>{t("help_tab_shortcuts")}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {filteredShortcuts.map((sc, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-[#111420] border border-line/60">
                              <span className="text-xs text-text-sub">{sc.desc}</span>
                              <div className="flex items-center gap-1">
                                {sc.keys.map((k, kIdx) => (
                                  <kbd key={kIdx} className="px-1.5 py-0.5 text-[11px] font-mono font-bold bg-[#1b1f2e] border border-line text-text rounded">
                                    {k}
                                  </kbd>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {/* 1. QUICK START */}
                {activeCategory === "quickstart" && (
                  <div className="space-y-6">
                    <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-accent/10 via-[#131726] to-[#0c0e17] border border-accent/30 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent text-[11px] font-mono font-bold">
                          GROOVE WORKSTATION
                        </span>
                        <span className="text-xs text-text-dim">Pure Web Audio DAW</span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-text">
                        {isZh ? "欢迎来到 Groove 纯物理合成编曲工作站" : "Welcome to the Groove Pure-Synthesis DAW"}
                      </h3>
                      <p className="text-xs text-text-sub leading-relaxed">
                        {isZh
                          ? "Groove 是一款基于 W3C Web Audio API 深度打造的全合成、零采样库依赖的专业音频工作站与音乐学探索系统。无论是经典模拟鼓机、FM 合成器还是爵士钢琴和弦，皆在您的浏览器本地由纯正 DSP 振荡器与滤波器实时渲染，提供母带级低延迟无损音质。"
                          : "Groove is a zero-sample, zero-latency DAW and musicology workstation built entirely on W3C Web Audio DSP algorithms. From analog drum machines and FM synths to complex jazz voicings, all audio is synthesized purely in real-time within your browser."}
                      </p>
                      <div className="pt-2 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleNavigate("studio")}
                          className="px-3.5 py-2 rounded-xl bg-accent text-black font-semibold text-xs hover:bg-accent/90 transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,183,61,0.3)]"
                        >
                          <span>{isZh ? "立即前往编曲工作台" : "Open Studio Sequencer"}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setActiveCategory("tutorials")}
                          className="px-3.5 py-2 rounded-xl bg-[#1c2030] hover:bg-[#252a3f] border border-line text-text font-medium text-xs transition-all flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-accent" />
                          <span>{isZh ? "查看 5 堂完整实操课程" : "View 5 Interactive Lessons"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-4 rounded-xl bg-[#10131d] border border-line/60 space-y-2">
                        <div className="flex items-center gap-2 text-accent text-xs font-bold">
                          <span className="w-5 h-5 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center font-mono text-[10px]">1</span>
                          <span>{isZh ? "选择曲风或模板" : "Pick Genre"}</span>
                        </div>
                        <p className="text-xs text-text-sub">
                          {isZh ? "从 159 种曲风库中载入具有历史特征的真实鼓组与和声配器。" : "Load authentic drum and harmonic voicings from 159 historical genres."}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-[#10131d] border border-line/60 space-y-2">
                        <div className="flex items-center gap-2 text-[#45e0c9] text-xs font-bold">
                          <span className="w-5 h-5 rounded-full bg-[#45e0c9]/15 border border-[#45e0c9]/40 flex items-center justify-center font-mono text-[10px]">2</span>
                          <span>{isZh ? "步进与钢琴卷帘创作" : "Sequence & Compose"}</span>
                        </div>
                        <p className="text-xs text-text-sub">
                          {isZh ? "在 16/32 步进网格与高对比黑白键卷帘中盖印和弦与展开琶音。" : "Stamp chord voicings, arpeggiate notes, and craft beats on the DAW grid."}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-[#10131d] border border-line/60 space-y-2">
                        <div className="flex items-center gap-2 text-[#a78bfa] text-xs font-bold">
                          <span className="w-5 h-5 rounded-full bg-[#a78bfa]/15 border border-[#a78bfa]/40 flex items-center justify-center font-mono text-[10px]">3</span>
                          <span>{isZh ? "调音混音与母带导出" : "Mix & Export"}</span>
                        </div>
                        <p className="text-xs text-text-sub">
                          {isZh ? "在独立调音台塑形声道平衡，并一键无损导出 WAV、MIDI 或 Ableton 工程。" : "Balance channel faders and export pristine WAV, MIDI, or Ableton Live .als."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. INTERACTIVE TUTORIALS */}
                {activeCategory === "tutorials" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-text flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-accent" />
                        <span>{isZh ? "交互式实操教学 (按步骤体验)" : "Interactive Step-by-Step Tutorials"}</span>
                      </h3>
                      <span className="text-[11px] font-mono text-text-dim">
                        5 {isZh ? "门实操课程" : "Lessons"}
                      </span>
                    </div>

                    <div className="space-y-4">
                      {tutorialsData.map((tut) => {
                        const currentStepIdx = tutorialStep[tut.id] ?? 0;
                        const totalSteps = tut.steps.length;
                        const currentStep = tut.steps[currentStepIdx];

                        return (
                          <div
                            key={tut.id}
                            className="p-4 sm:p-5 rounded-2xl bg-[#10131f] border border-line/80 space-y-3.5 transition-all hover:border-accent/40"
                            data-testid={`tutorial-card-${tut.id}`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <h4 className="text-sm font-bold text-text">{tut.title}</h4>
                                <p className="text-xs text-text-sub mt-0.5">{tut.desc}</p>
                              </div>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent/10 border border-accent/30 text-accent font-semibold self-start sm:self-center">
                                {t("help_step_label", { step: currentStepIdx + 1, total: totalSteps })}
                              </span>
                            </div>

                            {/* Current Step Display Card */}
                            <div className="p-3.5 rounded-xl bg-[#161a29] border border-line-subtle space-y-1.5">
                              <div className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                                <span className="text-xs font-medium text-text leading-relaxed">
                                  {currentStep.label}
                                </span>
                              </div>
                              {currentStep.tip && (
                                <div className="pl-6 text-[11px] text-accent/80 font-mono">
                                  💡 {currentStep.tip}
                                </div>
                              )}
                            </div>

                            {/* Step Controls and Action Launch */}
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={currentStepIdx === 0}
                                  onClick={() =>
                                    setTutorialStep((prev) => ({
                                      ...prev,
                                      [tut.id]: Math.max(0, currentStepIdx - 1),
                                    }))
                                  }
                                  className="p-1.5 rounded-lg border border-line text-text-sub hover:text-text disabled:opacity-30 disabled:pointer-events-none"
                                  title={t("help_prev_step")}
                                  aria-label={t("help_prev_step")}
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="flex items-center gap-1 px-1">
                                  {tut.steps.map((_, dotIdx) => (
                                    <button
                                      key={dotIdx}
                                      onClick={() =>
                                        setTutorialStep((prev) => ({
                                          ...prev,
                                          [tut.id]: dotIdx,
                                        }))
                                      }
                                      className={`w-2 h-2 rounded-full transition-all ${
                                        dotIdx === currentStepIdx
                                          ? "w-5 bg-accent"
                                          : "bg-white/20 hover:bg-white/40"
                                      }`}
                                      aria-label={`Go to step ${dotIdx + 1}`}
                                    />
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  disabled={currentStepIdx === totalSteps - 1}
                                  onClick={() =>
                                    setTutorialStep((prev) => ({
                                      ...prev,
                                      [tut.id]: Math.min(totalSteps - 1, currentStepIdx + 1),
                                    }))
                                  }
                                  className="p-1.5 rounded-lg border border-line text-text-sub hover:text-text disabled:opacity-30 disabled:pointer-events-none"
                                  title={t("help_next_step")}
                                  aria-label={t("help_next_step")}
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </div>

                              <button
                                onClick={() => handleNavigate(tut.targetTab)}
                                className="px-3 py-1.5 rounded-xl bg-accent text-black font-semibold text-xs hover:bg-accent/90 transition-all flex items-center gap-1 shadow-sm"
                                data-testid={`launch-tutorial-${tut.id}`}
                              >
                                <span>{tut.targetBtn}</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. SEQUENCER & PIANO ROLL */}
                {activeCategory === "sequencer" && (
                  <div className="space-y-5">
                    <div className="border-b border-line/60 pb-3">
                      <h3 className="text-base font-bold text-text flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-accent" />
                        <span>{isZh ? "编曲工作台与专业钢琴卷帘深度手册" : "DAW Sequencer & Piano Roll Guide"}</span>
                      </h3>
                      <p className="text-xs text-text-sub mt-1">
                        {isZh
                          ? "全功能 16/32/64 步进音轨网格、多音高钢琴卷帘、力度通道与欧几里得律动系统。"
                          : "Professional multi-bar DAW grid, high-contrast piano roll, velocity dynamics, and Euclidean rhythms."}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <h4 className="text-xs font-bold text-accent uppercase tracking-wider">
                          {isZh ? "高对比度专业钢琴卷帘 (Piano Roll)" : "High-Contrast Studio Piano Roll"}
                        </h4>
                        <ul className="text-xs text-text-sub space-y-1.5 list-disc pl-4 leading-relaxed">
                          <li>
                            <strong className="text-text">{isZh ? "22 种自然音阶高亮与调式" : "22 Musical Scales & Modes"}</strong>: {isZh ? "在调式下拉框中指定主音与音阶（大调、自然小调、多利亚、弗里几亚、爵士小调、布鲁斯等），网格自然音轨道自动高亮，根音标记「ROOT」指示。" : "Select root and tonality to highlight in-scale lanes and mark ROOT boundaries."}
                          </li>
                          <li>
                            <strong className="text-text">{isZh ? "和弦印章与虚影悬停" : "Chord Stamps & Ghost Preview"}</strong>: {isZh ? "开启 Triad、7th、9th、sus4 等印章后，光标悬停即显示多音符半透明虚影预览，单击直接盖印完整和声。" : "Hovering displays full chord stack ghosts before clicking to stamp."}
                          </li>
                          <li>
                            <strong className="text-text">{isZh ? "连续琶音器 (Arp ▲ / ▼)" : "Multi-Note Arpeggiator (Arp ▲ / ▼)"}</strong>: {isZh ? "选中多音和弦后，点击 Arp ▲ 按升序或 Arp ▼ 按降序将音符依时序展开为连贯步进琶音。" : "Unrolls stacked chord notes chronologically across consecutive steps in ascending or descending pitch."}
                          </li>
                          <li>
                            <strong className="text-text">{isZh ? "半音 (±1) 与八度 (±12) 移调" : "Semitone (±1) & Octave (±12) Transpose"}</strong>: {isZh ? "选中音符后实时移调，并具备精准声学实时试听反馈。" : "Transpose selected notes with instant acoustic audition feedback."}
                          </li>
                          <li>
                            <strong className="text-text">{isZh ? "琴键滑音试听 (Glissando)" : "Keybed Glissando Audition"}</strong>: {isZh ? "在左侧 3D 黑白琴键上按下并上下滑动即可产生流畅滑音试听。" : "Drag across the 3D keybed to audition notes with glissando response."}
                          </li>
                        </ul>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <h4 className="text-xs font-bold text-[#45e0c9] uppercase tracking-wider">
                          {isZh ? "力度通道与微时值 (Velocity Lane)" : "Velocity Dynamics Lane"}
                        </h4>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "按键盘「V」键展开底部力度通道。每根棒棒糖推子顶部标有 fff (127)、f、mf、p 等标准音乐动态记号，悬停即可查看精确数值与步进位置。"
                            : "Press 'V' to expand the velocity lane. Lollipops indicate dynamic marks (fff 127, f, mf, p) with precise hover tooltips."}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <h4 className="text-xs font-bold text-[#f59e0b] uppercase tracking-wider">
                          {isZh ? "独立音轨循环与多节拍 (Polymeter)" : "Track Loop & Polymeter (Polyrhythms)"}
                        </h4>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "每条音轨均可设定独立的步进循环长度（例如全局为 16 步，但某轨设定为 7 步或 12 步），产生不断变换相位的多节拍复节奏。当轨道循环短于总工程时，可通过边界「展开全轨 (Extend Track)」一键同步全长。"
                            : "Each track supports independent loop lengths (e.g. 7 or 12 steps against a 16-step pattern) to create evolving polymeters. Use 'Extend Track' to expand loops with one click."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. MIXING & LABS */}
                {activeCategory === "mixing" && (
                  <div className="space-y-5">
                    <div className="border-b border-line/60 pb-3">
                      <h3 className="text-base font-bold text-text flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-accent" />
                        <span>{isZh ? "混音台、效果器总线与声学实验室" : "Console Mixer & Acoustic Labs"}</span>
                      </h3>
                      <p className="text-xs text-text-sub mt-1">
                        {isZh
                          ? "包含独立硬件调音台、全景声谱示波器、底鼓物理建模以及曲风工坊。"
                          : "Explore the hardware mixer desk, acoustic spectrogram, kick physics, and custom genre maker."}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-accent">{isZh ? "独立硬件调音台 (Console)" : "Console Mixer Desk"}</span>
                          <button
                            onClick={() => handleNavigate("console")}
                            className="text-[11px] text-accent hover:underline flex items-center gap-1"
                          >
                            <span>{t("help_action_try_now")}</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "提供真实调音台声卡级触控推子、左右声像旋钮、单轨静音 (Mute)、独奏 (Solo) 与空间效果发送控制。"
                            : "Hardware-grade channel strips with faders, pan pots, mute/solo, and dedicated FX sends."}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-accent">{isZh ? "全景声谱分析仪 (Analyzer)" : "Acoustic Analyzer"}</span>
                          <button
                            onClick={() => handleNavigate("analyzer")}
                            className="text-[11px] text-accent hover:underline flex items-center gap-1"
                          >
                            <span>{t("help_action_try_now")}</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "32 频段实时 FFT 声谱柱状图、三维瀑布能量图、立体声李萨如 (Lissajous) 相位示波器与多波形发生器。"
                            : "Real-time 32-band FFT spectrogram, 3D waterfall display, Lissajous phase scope, and tone generator."}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-accent">{isZh ? "底鼓解剖实验室 (Kick Anatomy)" : "Kick Anatomy Lab"}</span>
                          <button
                            onClick={() => handleNavigate("kick")}
                            className="text-[11px] text-accent hover:underline flex items-center gap-1"
                          >
                            <span>{t("help_action_try_now")}</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "三段式物理谐振建模：Transient 瞬态打击声、Pitch Drop 音高快速扫频衰减与 Sub-body 超低频共振。"
                            : "Three-tier synthesized kick anatomy: Transient click, pitch sweep, and sub resonance body."}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-accent">{isZh ? "母带真实峰值限制器 (True-Peak)" : "True-Peak Limiter"}</span>
                        </div>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "纯 Web Audio 限制器总线，杜绝 DAC 解码产生的采样间峰值 (Inter-sample Peak) 破音，保证响度与透明度平衡。"
                            : "Zero-latency brickwall limiter preventing inter-sample clipping while maintaining acoustic transparency."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. HARMONY & THEORY */}
                {activeCategory === "theory" && (
                  <div className="space-y-5">
                    <div className="border-b border-line/60 pb-3">
                      <h3 className="text-base font-bold text-text flex items-center gap-2">
                        <Music className="w-4 h-4 text-accent" />
                        <span>{isZh ? "和弦工坊、调式音阶与现代和声学" : "Harmony, Scales & Chord Theory"}</span>
                      </h3>
                      <p className="text-xs text-text-sub mt-1">
                        {isZh
                          ? "探索和弦进行、罗马数字分析、Drop-2 爵士开离配置以及一键烘焙至工程。"
                          : "Explore chord progressions, Roman numeral analysis, Drop-2 voicings, and sequencer baking."}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <h4 className="text-xs font-bold text-accent">{isZh ? "和弦工坊 (Chord Progressions View)" : "Chord Progressions Workshop"}</h4>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "支持流行、爵士、R&B、电子与金属的经典和弦进行（如 I - V - vi - IV、ii - V - I、Andalusian 等）。您可以试听单和弦，也可以点击「烘焙至工作台 (Bake to Sequencer)」直接转换为音轨步进并自动配器。"
                            : "Audition classic chord progressions across jazz, pop, and electronic genres. Click 'Bake to Sequencer' to translate progressions into ready-to-play step patterns."}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <h4 className="text-xs font-bold text-[#45e0c9]">{isZh ? "Drop-2 爵士开离配置 (Drop-2 Voicings)" : "Drop-2 Jazz Voicings"}</h4>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "钢琴卷帘内置 Drop-2 功能：将密集排列和弦从高往低数的第二个音符向下降低一个八度，形成空灵开离的高级和声织体，使低音与旋律线条更加通透分明。"
                            : "Drop-2 lowers the second highest note by one octave, creating spacious, non-muddy jazz chord textures."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6. EXPORT & INTEGRATIONS */}
                {activeCategory === "export" && (
                  <div className="space-y-5">
                    <div className="border-b border-line/60 pb-3">
                      <h3 className="text-base font-bold text-text flex items-center gap-2">
                        <Download className="w-4 h-4 text-accent" />
                        <span>{isZh ? "工程导出、跨平台联动与标准格式" : "Export Formats & Cross-DAW Integrations"}</span>
                      </h3>
                      <p className="text-xs text-text-sub mt-1">
                        {isZh
                          ? "支持无损离线 WAV 母带渲染、标准多轨 MIDI 文件以及 Ableton Live 原生工程导出。"
                          : "Export lossless offline WAV audio, multi-track MIDI files, and native Ableton Live .als projects."}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <div className="text-xs font-bold text-accent">WAV (Audio)</div>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "基于 OfflineAudioContext 高速离线精确渲染，输出 48kHz / 24-bit 无损立体声母带音频，无底噪与爆音。"
                            : "Rendered via OfflineAudioContext at 48kHz / 24-bit studio quality with limiter protection."}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <div className="text-xs font-bold text-[#45e0c9]">MIDI (.mid)</div>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "导出标准的 Format 1 多轨 MIDI 文件，各乐器轨道独立分轨并包含音符时值与力度，可直接拖入任意宿主 DAW。"
                            : "Standard Format 1 multi-track MIDI file with pitch, velocity, and timing preserved for any DAW."}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-2">
                        <div className="text-xs font-bold text-[#a78bfa]">Ableton Live (.als)</div>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "一键生成 Ableton Live 完整工程包，鼓组与乐器 MIDI 剪辑按工程速度与调式对齐，开箱即用。"
                            : "Full Ableton Live set with pre-routed MIDI clips aligned to tempo and song key."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. FAQ & TROUBLESHOOTING */}
                {activeCategory === "faq" && (
                  <div className="space-y-4">
                    <div className="border-b border-line/60 pb-3">
                      <h3 className="text-base font-bold text-text flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-accent" />
                        <span>{isZh ? "常见问题与疑难排障 (FAQ)" : "Frequently Asked Questions & Troubleshooting"}</span>
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-1.5">
                        <h4 className="text-xs font-bold text-text">
                          {isZh ? "Q: 手机 Safari 或微信内置浏览器点击没有声音？" : "Q: No sound on mobile Safari or in-app browsers?"}
                        </h4>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "由于 iOS Webkit 安全策略限制，首次加载需要用户点击屏幕任意位置激活 AudioContext。此外，请检查 iPhone 侧边物理静音拨片是否处于静音状态（物理静音会静音网页音频），请将其拨到响铃模式。"
                            : "iOS Webkit requires a user tap to resume the AudioContext. Also check the physical hardware mute switch on iPhone — if muted, Web Audio will be silenced."}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-1.5">
                        <h4 className="text-xs font-bold text-text">
                          {isZh ? "Q: 导出的音频和 MIDI 可以在商业作品中使用吗？" : "Q: Can I use exported WAV and MIDI files commercially?"}
                        </h4>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "完全可以！Groove 所有音色均为浏览器纯 DSP 算法实时合成，不包含任何受第三方版权限制的音频采样。您通过 Groove 创作并导出的所有乐段、WAV 和 MIDI 资产均为 100% 免版税，可自由商用。"
                            : "Yes, 100%! All sounds in Groove are algorithmic pure synthesis with zero copyrighted samples. All exported WAV, MIDI, and patterns are completely royalty-free for commercial use."}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-[#111422] border border-line/70 space-y-1.5">
                        <h4 className="text-xs font-bold text-text">
                          {isZh ? "Q: 关闭网页后我保存的工程数据会丢失吗？" : "Q: Will my saved projects be lost after closing the browser?"}
                        </h4>
                        <p className="text-xs text-text-sub leading-relaxed">
                          {isZh
                            ? "不会。Groove 内置本地 IndexedDB 与 LocalStorage 持久化工程数据库 (Project Hub)，所有保存的工程和设置均安全保存在您的本地浏览器中。此外，还支持导出为轻量 URL 链接备份。"
                            : "No. Groove uses local IndexedDB storage to persist all your projects. You can also export compressed URL links as backup."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 8. KEYBOARD SHORTCUTS */}
                {activeCategory === "shortcuts" && (
                  <div className="space-y-4">
                    <div className="border-b border-line/60 pb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-text flex items-center gap-2">
                          <Keyboard className="w-4 h-4 text-accent" />
                          <span>{isZh ? "键盘快捷键完整索引" : "Keyboard Shortcuts Reference"}</span>
                        </h3>
                        <p className="text-xs text-text-sub mt-1">
                          {isZh ? "按下「?」键随时唤出快捷键帮助。" : "Press '?' anywhere to bring up shortcuts."}
                        </p>
                      </div>
                      {onOpenShortcuts && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenShortcuts();
                          }}
                          className="text-xs text-accent hover:underline flex items-center gap-1"
                        >
                          <span>{isZh ? "打开浮动卡片面板" : "Floating Shortcuts Card"}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {shortcutsList.map((sc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[#111420] border border-line/60"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-text-dim px-1.5 py-0.5 rounded bg-white/5 border border-line/40">
                              {sc.category}
                            </span>
                            <span className="text-xs text-text-sub font-medium">{sc.desc}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {sc.keys.map((k, kIdx) => (
                              <kbd
                                key={kIdx}
                                className="px-2 py-0.5 min-w-[22px] text-center text-xs font-mono font-bold bg-[#1b1f2e] text-text border border-line rounded shadow-sm"
                              >
                                {k}
                              </kbd>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-line/60 bg-[#0c0e16] flex items-center justify-between text-xs text-text-dim">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span>Pure Web Audio Workstation Manual</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#181c2b] hover:bg-[#202538] border border-line text-text font-medium transition-all"
            data-testid="help-center-close-button"
          >
            {t("help_close_btn")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
