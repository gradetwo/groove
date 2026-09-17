import React, { useState, useEffect, useMemo, useCallback } from "react";
import { MASTERCLASSES, MasterclassId, MasterclassLesson } from "../data/masterclasses";
import { MasterclassAudioEngine, TapAccuracyResult } from "../audio/MasterclassAudioEngine";
import { SequencerPattern } from "../types/genre";
import { PolyrhythmCollider } from "../components/masterclass/PolyrhythmCollider";
import { ClaveEvolutionTree } from "../components/masterclass/ClaveEvolutionTree";
import { DownbeatOmissionLab } from "../components/masterclass/DownbeatOmissionLab";
import { BalkanOddMeters } from "../components/masterclass/BalkanOddMeters";
import { DillaMicrotiming } from "../components/masterclass/DillaMicrotiming";
import {
  Compass,
  Sliders,
  Sparkles,
  BookOpen,
  Volume2,
  Share2,
  Award,
  Zap,
  Globe,
  Clock,
  ArrowRight,
  Disc,
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

interface MasterclassViewProps {
  initialLessonId?: string;
  onOpenStudio: (payload: { pattern: SequencerPattern; label: string }) => void;
  onSelectGenre?: (genre: { id: string }) => void;
  onOpenHelp?: () => void;
}

export const MasterclassView: React.FC<MasterclassViewProps> = ({
  initialLessonId,
  onOpenStudio,
  onOpenHelp,
}) => {
  const { t, isZh } = useLanguage();

  // Find initial lesson index or default to 0
  const initialIndex = useMemo(() => {
    if (!initialLessonId) return 0;
    const idx = MASTERCLASSES.findIndex((m) => m.id === initialLessonId);
    return idx !== -1 ? idx : 0;
  }, [initialLessonId]);

  const [activeLessonIndex, setActiveLessonIndex] = useState(initialIndex);
  const [activePresetId, setActivePresetId] = useState<string>(
    MASTERCLASSES[initialIndex]?.presets[0]?.id || ""
  );
  const [bpm, setBpm] = useState<number>(MASTERCLASSES[initialIndex]?.defaultBpm || 108);

  // Audio Engine singleton for Masterclass view
  const engine = useMemo(() => new MasterclassAudioEngine(), []);

  // Clean up engine on unmount
  useEffect(() => {
    return () => {
      engine.destroy();
    };
  }, [engine]);

  const lesson: MasterclassLesson = MASTERCLASSES[activeLessonIndex] || MASTERCLASSES[0];

  // When switching lessons, reset preset and BPM
  const handleSelectLesson = (idx: number) => {
    engine.stop();
    setActiveLessonIndex(idx);
    const nextLesson = MASTERCLASSES[idx];
    if (nextLesson) {
      setActivePresetId(nextLesson.presets[0]?.id || "");
      setBpm(nextLesson.defaultBpm);
      engine.setBpm(nextLesson.defaultBpm);
    }
  };

  // One-click Bake to Studio
  const handleBakeToStudio = () => {
    engine.stop();
    const pattern = lesson.generateStudioPattern(activePresetId);
    const label = isZh ? lesson.title.zh : lesson.title.en;
    onOpenStudio({ pattern, label });
  };

  // Tap stats aggregation
  const [totalTaps, setTotalTaps] = useState(0);
  const [perfectTaps, setPerfectTaps] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);

  const handleTapResult = useCallback((result: TapAccuracyResult) => {
    setTotalTaps((prev) => prev + 1);
    if (result.rating === "perfect") {
      setPerfectTaps((prev) => prev + 1);
      setSessionStreak((s) => s + 1);
    } else if (result.rating === "great") {
      setSessionStreak((s) => s + 1);
    } else {
      setSessionStreak(0);
    }
  }, []);

  const accuracyRate = totalTaps > 0 ? Math.round((perfectTaps / totalTaps) * 100) : 100;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-fade-in">
      {/* Hero Header */}
      <div className="relative rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-[#12141c] via-[#0d0e14] to-[#090a0d] border border-line overflow-hidden shadow-2xl">
        <div className="absolute -right-12 -bottom-12 w-80 h-80 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 text-[11px] font-mono font-bold uppercase rounded-full bg-accent/15 text-accent border border-accent/30 tracking-wider">
                {t("masterclass_hero_title")}
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-mono text-text-dim rounded-md bg-panel border border-line">
                P6-01 · Pure Web Audio
              </span>
            </div>
            {onOpenHelp && (
              <button
                type="button"
                data-testid="masterclass-help-button"
                onClick={onOpenHelp}
                title={t("masterclass_guide_btn")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-accent/40 bg-accent/10 text-accent font-semibold text-xs hover:bg-accent/20 transition-all"
              >
                <BookOpen className="w-3.5 h-3.5 text-accent" />
                <span>{t("masterclass_guide_btn")}</span>
              </button>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-text tracking-tight">
            {t("masterclass_page_title")}
          </h1>

          <p className="text-xs sm:text-sm text-text-sub max-w-3xl leading-relaxed">
            {t("masterclass_page_desc")}
          </p>
        </div>
      </div>

      {/* Curriculum Navigation Tabs (5 Masterclasses) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {MASTERCLASSES.map((item, idx) => {
          const isSelected = idx === activeLessonIndex;
          return (
            <button
              key={item.id}
              onClick={() => handleSelectLesson(idx)}
              className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between select-none ${
                isSelected
                  ? "bg-accent/15 border-accent text-accent shadow-[0_0_20px_rgba(245,183,61,0.2)] scale-[1.02]"
                  : "bg-panel border-line text-text-sub hover:text-text hover:border-line-strong hover:bg-panel2"
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                <span className={isSelected ? "text-accent font-bold" : "text-text-dim"}>
                  0{item.index}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-line text-text-dim">
                  {item.defaultBpm} BPM
                </span>
              </div>
              <div className="font-bold text-xs text-text line-clamp-1">
                {isZh ? item.title.zh : item.title.en}
              </div>
              <div className="text-[10px] text-text-dim line-clamp-1 mt-1 font-mono">
                {isZh ? item.tag.zh : item.tag.en}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Masterclass Content */}
      <div className="space-y-6">
        {/* Lesson Title Banner & Studio Bake CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-panel2 p-5 rounded-2xl border border-line">
          <div>
            <div className="text-xs font-mono text-accent font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span>{t("masterclass_lesson_index", { index: lesson.index })}</span>
              <span>·</span>
              <span>{isZh ? lesson.tag.zh : lesson.tag.en}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-text mt-0.5">
              {isZh ? lesson.title.zh : lesson.title.en}
            </h2>
            <div className="text-xs text-text-sub mt-0.5 font-mono">
              {isZh ? lesson.subtitle.zh : lesson.subtitle.en}
            </div>
          </div>

          <button
            onClick={handleBakeToStudio}
            data-testid="bake-to-studio-btn"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-accent to-[#ffc65c] text-black hover:brightness-110 active:scale-95 transition-all shadow-[0_0_15px_rgba(245,183,61,0.3)] shrink-0 self-start sm:self-auto"
          >
            <Sliders className="w-4 h-4" />
            <span>{t("masterclass_bake_btn")}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Interactive Lab Component */}
        <div className="bg-panel rounded-3xl p-6 border border-line shadow-xl">
          {lesson.id === "polyrhythm" && (
            <PolyrhythmCollider
              engine={engine}
              bpm={bpm}
              onBpmChange={setBpm}
              onTapResult={handleTapResult}
            />
          )}

          {lesson.id === "clave" && (
            <ClaveEvolutionTree
              engine={engine}
              bpm={bpm}
              onBpmChange={setBpm}
              onTapResult={handleTapResult}
            />
          )}

          {lesson.id === "downbeat_omission" && (
            <DownbeatOmissionLab
              engine={engine}
              bpm={bpm}
              onBpmChange={setBpm}
              onTapResult={handleTapResult}
            />
          )}

          {lesson.id === "balkan_odd_meters" && (
            <BalkanOddMeters
              engine={engine}
              bpm={bpm}
              onBpmChange={setBpm}
              onTapResult={handleTapResult}
            />
          )}

          {lesson.id === "dilla_microtiming" && (
            <DillaMicrotiming
              engine={engine}
              bpm={bpm}
              onBpmChange={setBpm}
              onTapResult={handleTapResult}
            />
          )}
        </div>

        {/* Cultural Origins & Acoustic Principles Deep-Dive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cultural Context */}
          <div className="p-6 rounded-3xl bg-panel border border-line space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 text-accent text-sm font-bold">
                <Globe className="w-4 h-4" />
                <span>{t("masterclass_cultural_title")}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-text-dim">
                <Clock className="w-3.5 h-3.5" />
                <span>{lesson.originEra}</span>
              </div>
            </div>

            <div className="text-xs text-text-dim font-mono">
              <span className="text-text-sub font-bold">{t("masterclass_origins_label")}: </span>
              {isZh ? lesson.originPlace.zh : lesson.originPlace.en}
            </div>

            <p className="text-xs text-text-sub leading-relaxed">
              {isZh ? lesson.culturalContext.zh : lesson.culturalContext.en}
            </p>
          </div>

          {/* Acoustic Principles */}
          <div className="p-6 rounded-3xl bg-panel border border-line space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 text-[#45e0c9] text-sm font-bold">
                <BookOpen className="w-4 h-4" />
                <span>{t("masterclass_acoustic_title")}</span>
              </div>
              <div className="text-xs font-mono text-text-dim">
                {lesson.defaultBpm} BPM
              </div>
            </div>

            <p className="text-xs text-text-sub leading-relaxed">
              {isZh ? lesson.acousticPrinciple.zh : lesson.acousticPrinciple.en}
            </p>

            {/* Session Tap Stats Badge */}
            <div className="p-3 rounded-2xl bg-surface/80 border border-line flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-accent" />
                <span className="text-text-sub">{t("masterclass_tap_stats_title")}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>{t("masterclass_tap_stats_total")}: <b className="text-text">{totalTaps}</b></span>
                <span>{t("masterclass_tap_stats_perfect")}: <b className="text-emerald-400">{accuracyRate}%</b></span>
                <span>{t("masterclass_tap_stats_streak")}: <b className="text-accent">{sessionStreak}x</b></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MasterclassView;
