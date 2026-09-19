import React, { useState } from "react";
import { Modal } from "../../ui/Modal";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  Sparkles,
  Sliders,
  Music,
  SlidersHorizontal,
  Activity,
  Compass,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  BookOpen,
  Play,
} from "lucide-react";

export interface NewUserOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartLesson1?: () => void;
  onStartStudio?: () => void;
  /**
   * U2: the single action the guide offers on its first slide — "hear this genre now".
   *
   * The guide hands this to the host (which owns navigation and the studio) rather than starting
   * anything itself; `App` switches to the studio and asks it to play as soon as its engine exists.
   */
  onAudition?: () => void;
}

export const ONBOARDING_COMPLETED_KEY = "groove_onboarding_completed";

export const NewUserOnboardingModal: React.FC<NewUserOnboardingModalProps> = ({
  isOpen,
  onClose,
  onStartLesson1,
  onStartStudio,
  onAudition,
}) => {
  const { t, isZh } = useLanguage();
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      id: 1,
      icon: <Sparkles className="w-6 h-6 text-accent" />,
      titleKey: "onboarding_s1_title" as const,
      descKey: "onboarding_s1_desc" as const,
      tipKey: "onboarding_s1_tip" as const,
      highlight: isZh ? "0 采样依赖 · 纯 DSP 实时运算" : "Zero Samples · 100% Realtime DSP",
    },
    {
      id: 2,
      icon: <Sliders className="w-6 h-6 text-[#45e0c9]" />,
      titleKey: "onboarding_s2_title" as const,
      descKey: "onboarding_s2_desc" as const,
      tipKey: "onboarding_s2_tip" as const,
      highlight: isZh ? "走带播放 · BPM 40-240 · 22 种调式" : "Transport · BPM Tempo · 22 Scales",
    },
    {
      id: 3,
      icon: <Activity className="w-6 h-6 text-[#f59e0b]" />,
      titleKey: "onboarding_s3_title" as const,
      descKey: "onboarding_s3_desc" as const,
      tipKey: "onboarding_s3_tip" as const,
      highlight: isZh ? "8 轨鼓机 · 力度通道 (V) · 欧几里得 (E)" : "8 Tracks · Velocity (V) · Euclidean (E)",
    },
    {
      id: 4,
      icon: <Music className="w-6 h-6 text-[#a78bfa]" />,
      titleKey: "onboarding_s4_title" as const,
      descKey: "onboarding_s4_desc" as const,
      tipKey: "onboarding_s4_tip" as const,
      highlight: isZh ? "3D 琴键 · 和弦印章 · 琶音展开 (Arp)" : "3D Keybed · Chord Stamp · Arpeggiator",
    },
    {
      id: 5,
      icon: <SlidersHorizontal className="w-6 h-6 text-[#38bdf8]" />,
      titleKey: "onboarding_s5_title" as const,
      descKey: "onboarding_s5_desc" as const,
      tipKey: "onboarding_s5_tip" as const,
      highlight: isZh ? "硬件推子 · 延迟混响 · 砖墙限制器" : "Hardware Faders · FX Sends · Limiter",
    },
    {
      id: 6,
      icon: <Compass className="w-6 h-6 text-[#ec4899]" />,
      titleKey: "onboarding_s6_title" as const,
      descKey: "onboarding_s6_desc" as const,
      tipKey: "onboarding_s6_tip" as const,
      highlight: isZh ? "罗马数字分析 · 烘焙编曲 · 159 曲风星系" : "Roman Analysis · Bake Chords · 3D Galaxy",
    },
    {
      id: 7,
      icon: <CheckCircle2 className="w-6 h-6 text-accent" />,
      titleKey: "onboarding_s7_title" as const,
      descKey: "onboarding_s7_desc" as const,
      tipKey: "onboarding_s7_tip" as const,
      highlight: isZh ? "随时按 ? 查看按键 · 一键无损导出" : "Press '?' for keys · Lossless Export",
    },
  ];

  const total = slides.length;
  const slide = slides[currentSlide];

  const handleFinish = () => {
    try {
      localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
    } catch {
      // Ignore localStorage errors
    }
    onClose();
  };

  /**
   * Closing the overlay is **not** finishing the guide.
   *
   * `Modal`'s `onClose` fires for a click on the mask and for Escape, and it used to be wired
   * straight to `handleFinish` — which writes the "completed" flag. One stray click outside the card
   * therefore dismissed the walkthrough *permanently*, which is how a first-run guide disappears for
   * the users who need it most. The flag is now written only by the explicit Skip button and by the
   * last slide's actions; dismissing leaves the guide to be offered again next time.
   */
  const handleDismiss = () => {
    onClose();
  };

  /**
   * The first slide's action: leave the guide and start playing the current genre.
   *
   * Deliberately *not* `handleFinish`: the user asked to hear the groove, not to be told they have
   * finished reading. The guide comes back next session, and Settings can replay it on demand.
   */
  const handleAuditionNow = () => {
    onClose();
    onAudition?.();
  };

  const handleLaunchLesson1 = () => {
    handleFinish();
    if (onStartLesson1) {
      onStartLesson1();
    }
  };

  const handleLaunchStudio = () => {
    handleFinish();
    if (onStartStudio) {
      onStartStudio();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDismiss}
      maxWidth="2xl"
      className="p-0 overflow-hidden bg-[#0a0b12] border-line-strong"
    >
      <div className="flex flex-col max-h-[85vh]">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-line/60 bg-gradient-to-r from-accent/15 via-[#121522] to-[#0a0c14] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-accent" />
            <span className="font-bold text-sm sm:text-base text-text">
              {t("onboarding_modal_title")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-accent/20 border border-accent/40 text-accent font-bold">
              {currentSlide + 1} / {total}
            </span>
          </div>
        </div>

        {/* Slide Content Body */}
        <div className="p-6 sm:p-8 space-y-6 flex-1 overflow-y-auto">
          {/* Milestone Badge & Title */}
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/30 shadow-inner">
                {slide.icon}
              </div>
              <div>
                <span className="text-[11px] font-mono text-accent font-bold uppercase tracking-wider">
                  {slide.highlight}
                </span>
                <h3 className="text-lg sm:text-xl font-bold text-text">
                  {t(slide.titleKey)}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-text-sub leading-relaxed pt-2">
              {t(slide.descKey)}
            </p>
          </div>

          {/* Practical Callout Tip Box */}
          <div className="p-4 rounded-xl bg-[#111422] border border-accent/30 space-y-1">
            <div className="text-xs font-bold text-accent flex items-center gap-1.5">
              <span>💡</span>
              <span>{isZh ? "核心要领与技巧" : "Core Tip"}</span>
            </div>
            <p className="text-xs text-text-sub leading-relaxed pl-5 font-mono">
              {t(slide.tipKey)}
            </p>
          </div>

          {/* Visual Step Progress Dots */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCurrentSlide(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === currentSlide
                    ? "w-8 bg-accent shadow-[0_0_10px_rgba(245,183,61,0.5)]"
                    : "w-2 bg-white/20 hover:bg-white/40"
                }`}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Footer Navigation Controls */}
        <div className="p-4 sm:p-5 border-t border-line/60 bg-[#0c0e18] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleFinish}
            className="text-xs text-text-dim hover:text-text font-medium underline-offset-4 hover:underline self-start sm:self-center"
            data-testid="onboarding-skip-btn"
          >
            {t("onboarding_skip_btn")}
          </button>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {currentSlide > 0 && (
              <button
                type="button"
                onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
                className="px-3 py-1.5 rounded-xl border border-line bg-[#131624] text-text-sub hover:text-text text-xs font-medium transition-all flex items-center gap-1"
                data-testid="onboarding-prev-btn"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{t("onboarding_prev_btn")}</span>
              </button>
            )}

            {currentSlide === 0 && onAudition && (
              <button
                type="button"
                onClick={handleAuditionNow}
                className="px-3.5 py-1.5 rounded-xl border border-accent/60 bg-accent/15 text-accent text-xs font-bold hover:bg-accent/25 transition-all flex items-center gap-1.5"
                data-testid="onboarding-listen-btn"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{t("onboarding_listen_now")}</span>
              </button>
            )}

            {currentSlide < total - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentSlide((prev) => Math.min(total - 1, prev + 1))}
                className="px-4 py-1.5 rounded-xl bg-accent text-black text-xs font-bold hover:bg-accent/90 transition-all flex items-center gap-1 shadow-[0_0_12px_rgba(245,183,61,0.25)]"
                data-testid="onboarding-next-btn"
              >
                <span>{t("onboarding_next_btn")}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLaunchLesson1}
                  className="px-3.5 py-1.5 rounded-xl bg-accent text-black text-xs font-bold hover:bg-accent/90 transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,183,61,0.35)]"
                  data-testid="onboarding-start-lesson-btn"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t("onboarding_start_lesson_btn")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleLaunchStudio}
                  className="px-3.5 py-1.5 rounded-xl bg-[#1c2236] hover:bg-[#252d47] border border-line text-text text-xs font-semibold transition-all flex items-center gap-1"
                  data-testid="onboarding-start-studio-btn"
                >
                  <span>{t("onboarding_start_studio_btn")}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
