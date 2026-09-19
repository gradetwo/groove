import React, { useState, useEffect, useRef } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { TUTORIAL_COURSES, TutorialCourseDef } from "../../data/tutorialCourses";
import { auditionTutorialSound, stopTutorialAudition } from "../../utils/tutorialAudition";
import type { NavTab } from "../Header";
import {
  Sparkles,
  Volume2,
  ChevronLeft,
  ChevronRight,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Sliders,
  Music,
  Activity,
  Compass,
} from "lucide-react";

export interface InteractiveTutorialCoachProps {
  courseId: string;
  stepIndex: number;
  onStepChange: (newStepIndex: number) => void;
  onClose: () => void;
  onNavigateTab: (tab: NavTab) => void;
}

export const InteractiveTutorialCoach: React.FC<InteractiveTutorialCoachProps> = ({
  courseId,
  stepIndex,
  onStepChange,
  onClose,
  onNavigateTab,
}) => {
  const { t, isZh } = useLanguage();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPlayingAudition, setIsPlayingAudition] = useState(false);
  const auditionTimerRef = useRef<any>(null);

  const course: TutorialCourseDef | undefined = TUTORIAL_COURSES.find(
    (c) => c.id === courseId
  );

  const totalSteps = course ? course.steps.length : 1;
  const safeStepIndex = Math.min(Math.max(0, stepIndex), totalSteps - 1);
  const currentStep = course ? course.steps[safeStepIndex] : null;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTutorialAudition();
      if (auditionTimerRef.current) clearTimeout(auditionTimerRef.current);
    };
  }, []);

  // Stop audition when changing step or course
  useEffect(() => {
    stopTutorialAudition();
    if (auditionTimerRef.current) clearTimeout(auditionTimerRef.current);
    setIsPlayingAudition(false);
  }, [courseId, safeStepIndex]);

  const handleAudition = () => {
    if (isPlayingAudition) {
      stopTutorialAudition();
      setIsPlayingAudition(false);
      if (auditionTimerRef.current) clearTimeout(auditionTimerRef.current);
      return;
    }

    if (auditionTimerRef.current) clearTimeout(auditionTimerRef.current);
    setIsPlayingAudition(true);
    auditionTutorialSound(courseId);

    auditionTimerRef.current = setTimeout(() => {
      setIsPlayingAudition(false);
    }, 2800);
  };

  /**
   * Where the current step's control is, in viewport coordinates — or `null` when there is nothing to
   * point at (no anchor on this step, or the control is not on this surface).
   */
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null
  );

  const anchor = currentStep?.anchor;

  /**
   * U2, second half: point at the thing the step is talking about.
   *
   * Measured rather than assumed, and re-measured when the layout can move under the coach (window
   * resize, any scroll — the capture phase catches inner scrollers). A step whose control is missing
   * leaves `anchorRect` null and the panel says so; a ring drawn around nothing would be worse than no
   * ring, because the user would go looking for the control it claims to show.
   */
  useEffect(() => {
    if (!anchor) {
      setAnchorRect(null);
      return;
    }

    const measure = () => {
      const el = document.querySelector<HTMLElement>(
        `[${anchor.attribute}="${anchor.value}"]`
      );
      if (!el) {
        setAnchorRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      setAnchorRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };

    measure();
    // A couple of frames after a step change, because the panel and the target are both settling.
    const frames = [requestAnimationFrame(measure), requestAnimationFrame(() => requestAnimationFrame(measure))];
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      for (const frame of frames) cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchor?.attribute, anchor?.value]);

  const handleStepJump = (targetIdx: number) => {
    if (!course) return;
    const clamped = Math.min(Math.max(0, targetIdx), totalSteps - 1);
    onStepChange(clamped);

    const stepDef = course.steps[clamped];
    if (stepDef?.targetTab) {
      onNavigateTab(stepDef.targetTab);
    }
  };

  const handlePrev = () => {
    if (safeStepIndex > 0) {
      handleStepJump(safeStepIndex - 1);
    }
  };

  const handleNext = () => {
    if (safeStepIndex < totalSteps - 1) {
      handleStepJump(safeStepIndex + 1);
    } else {
      // Completed all steps
      onClose();
    }
  };

  const getCourseIcon = () => {
    switch (courseId) {
      case "drum":
        return <Sliders className="w-4 h-4 text-accent" />;
      case "piano":
      case "chords":
        return <Music className="w-4 h-4 text-[#45e0c9]" />;
      case "acoustics":
        return <Activity className="w-4 h-4 text-[#f472b6]" />;
      case "galaxy":
        return <Compass className="w-4 h-4 text-[#a78bfa]" />;
      default:
        return <Sparkles className="w-4 h-4 text-accent" />;
    }
  };

  if (!course || !currentStep) return null;

  return (
    <>
      {/*
        U2: the control this step is about, dimmed around and ringed.
        `pointer-events: none` on purpose — the app underneath stays clickable, which is the whole
        point: the step says "click a step cell", and the cell it means is lit up and still works.
      */}
      {currentStep.anchor && anchorRect && (
        <div
          data-testid="tutorial-coach-anchor"
          aria-hidden="true"
          className="fixed z-40 rounded-xl border-2 border-accent pointer-events-none transition-all duration-200"
          style={{
            top: Math.max(0, anchorRect.top - 4),
            left: Math.max(0, anchorRect.left - 4),
            width: anchorRect.width + 8,
            height: anchorRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(3, 4, 8, 0.55)",
          }}
        />
      )}
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl z-50 transition-all duration-300 pointer-events-auto select-none"
      data-testid="interactive-tutorial-coach"
      role="region"
      aria-label={t("tutorial_coach_badge")}
    >
      {/* Minimized Pill View */}
      {isMinimized ? (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-[#0e101a]/95 backdrop-blur-xl border-2 border-accent/60 shadow-[0_12px_40px_rgba(0,0,0,0.85)] text-text">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping shrink-0" />
            <span className="text-xs font-bold text-accent">
              {t("tutorial_coach_badge")}
            </span>
            <span className="text-xs text-text-dim">·</span>
            <span className="text-xs font-semibold text-text truncate max-w-[240px] sm:max-w-md">
              {t(course.titleKey)}
            </span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-accent/20 text-accent font-semibold">
              {safeStepIndex + 1}/{totalSteps}
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-2">
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-black font-bold text-xs hover:bg-accent/90 transition-all"
              title={t("tutorial_coach_minimized")}
              data-testid="tutorial-coach-expand"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isZh ? "展开指导" : "Expand"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-dim hover:text-text hover:bg-white/10 transition-colors"
              title={t("tutorial_coach_exit")}
              data-testid="tutorial-coach-close-minimized"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Full Floating Coach Dock */
        <div className="rounded-2xl bg-[#0a0c14]/95 backdrop-blur-xl border-2 border-accent/50 shadow-[0_20px_60px_rgba(0,0,0,0.92),0_0_30px_rgba(245,183,61,0.18)] overflow-hidden">
          {/* Header Strip */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 bg-gradient-to-r from-accent/15 via-[#161a29] to-[#0c0e18] border-b border-line/70">
            <div className="flex items-center gap-2.5">
              <div className="p-1 rounded-lg bg-accent/20 border border-accent/40">
                {getCourseIcon()}
              </div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-accent px-2 py-0.5 rounded bg-accent/10 border border-accent/30">
                {t("tutorial_coach_badge")}
              </span>
              <span className="text-xs sm:text-sm font-bold text-text truncate max-w-[200px] sm:max-w-md">
                {t(course.titleKey)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-accent bg-black/40 px-2.5 py-0.5 rounded-lg border border-accent/20">
                {t("help_step_label", { step: safeStepIndex + 1, total: totalSteps })}
              </span>
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1 rounded-lg text-text-dim hover:text-text hover:bg-white/10 transition-colors"
                title={isZh ? "折叠为迷你小窗" : "Minimize Coach"}
                data-testid="tutorial-coach-minimize"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-text-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title={t("tutorial_coach_exit")}
                data-testid="tutorial-coach-close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Body */}
          <div className="p-4 sm:p-5 space-y-3">
            {/* Step Instruction */}
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-accent shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <div className="text-xs sm:text-sm font-semibold text-text leading-relaxed">
                  {t(currentStep.labelKey)}
                </div>
                {(currentStep.tipZh || currentStep.tipEn) && (
                  <div className="text-[11px] sm:text-xs text-accent/90 font-mono flex items-center gap-1.5 pt-0.5">
                    <span className="px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-[10px] uppercase font-bold tracking-wider">
                      {t("tutorial_coach_tip")}
                    </span>
                    <span>{isZh ? currentStep.tipZh : currentStep.tipEn}</span>
                  </div>
                )}
                {/*
                  The control is not on this surface (a phone layout, a panel that is closed). Say so:
                  a ring drawn around nothing would send the user looking for a control that is not
                  there, which is worse than admitting the step cannot be shown here.
                */}
                {currentStep.anchor && !anchorRect && (
                  <div
                    data-testid="tutorial-coach-anchor-missing"
                    className="text-[11px] text-[#f59e0b] font-mono pt-0.5"
                  >
                    {t("tut_anchor_missing")}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Controls Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-line/60">
              {/* Step Navigation Dots & Arrows */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeStepIndex === 0}
                  onClick={handlePrev}
                  className="px-2.5 py-1.5 rounded-xl border border-line bg-[#131726] text-text-sub hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1 text-xs font-medium"
                  data-testid="tutorial-coach-prev"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>{t("tutorial_coach_prev")}</span>
                </button>

                <div className="flex items-center gap-1 px-1.5">
                  {course.steps.map((_, dotIdx) => (
                    <button
                      key={dotIdx}
                      onClick={() => handleStepJump(dotIdx)}
                      className={`h-2 rounded-full transition-all ${
                        dotIdx === safeStepIndex
                          ? "w-6 bg-accent shadow-[0_0_8px_rgba(245,183,61,0.6)]"
                          : "w-2 bg-white/20 hover:bg-white/50"
                      }`}
                      aria-label={`Step ${dotIdx + 1}`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  className="px-3 py-1.5 rounded-xl border border-accent/40 bg-accent/20 text-accent font-semibold hover:bg-accent hover:text-black transition-all flex items-center gap-1 text-xs shadow-sm"
                  data-testid="tutorial-coach-next"
                >
                  <span>
                    {safeStepIndex === totalSteps - 1
                      ? t("tutorial_coach_finish")
                      : t("tutorial_coach_next")}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Action Buttons: Audition & Exit */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={handleAudition}
                  data-testid="tutorial-coach-audition"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                    isPlayingAudition
                      ? "bg-accent text-black border-accent shadow-[0_0_15px_rgba(245,183,61,0.5)] animate-pulse"
                      : "bg-[#161b2b] hover:bg-[#20273f] text-accent border-accent/40"
                  }`}
                  title={isPlayingAudition ? t("tutorial_coach_audition_stop") : t("tutorial_coach_audition")}
                >
                  <Volume2 className={`w-3.5 h-3.5 ${isPlayingAudition ? "animate-bounce" : ""}`} />
                  <span>
                    {isPlayingAudition
                      ? t("tutorial_coach_audition_stop")
                      : t("tutorial_coach_audition")}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  data-testid="tutorial-coach-exit-btn"
                  className="px-3 py-1.5 rounded-xl bg-[#141722] hover:bg-[#1e2334] border border-line text-text-sub hover:text-text text-xs font-medium transition-all"
                >
                  {t("tutorial_coach_exit")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};
