import React, { useState, useEffect, useRef, useCallback } from "react";
import { MasterclassAudioEngine, TapAccuracyResult } from "../../audio/MasterclassAudioEngine";
import { Play, Square, Zap, Volume2, Sparkles, Activity, ShieldAlert } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

interface DownbeatOmissionLabProps {
  engine: MasterclassAudioEngine;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onTapResult?: (result: TapAccuracyResult) => void;
}

interface DownbeatPreset {
  id: string;
  nameZh: string;
  nameEn: string;
  origin: string;
  kickSteps: number[];
  snareSteps: number[];
  hatSteps: number[];
  gravityBeats: [number, number, number, number]; // Gravity curve per beat 1, 2, 3, 4
  explanationZh: string;
  explanationEn: string;
}

const DOWNBEAT_PRESETS: DownbeatPreset[] = [
  {
    id: "tony_allen_afrobeat",
    nameZh: "Tony Allen: Afrobeat 避让",
    nameEn: "Tony Allen Afrobeat Omission",
    origin: "尼日利亚拉各斯 (Fela Kuti / Africa 70)",
    kickSteps:  [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    snareSteps: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    hatSteps:   [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0],
    gravityBeats: [5, 80, 45, 90], // Vacuum on beat 1!
    explanationZh: "第 1 拍（Downbeat）底鼓彻底噤声！听觉惯性悬空，身体被强迫向前倾斜，在 2、4 拍爆发推进。",
    explanationEn: "Kick is absent on beat 1. Denying body anchor forces continuous hypnotic forward momentum.",
  },
  {
    id: "reggae_one_drop",
    nameZh: "牙买加经典 One Drop (仅在第3拍下沉)",
    nameEn: "Jamaican Reggae One Drop",
    origin: "牙买加金斯顿 (Bob Marley & The Wailers)",
    kickSteps:  [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snareSteps: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    hatSteps:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    gravityBeats: [0, 20, 100, 15], // Massive singularity on beat 3
    explanationZh: "将避让推向极致：第 1 拍留给贝斯低频悬浮，底鼓与带重混响的军鼓在第 3 拍齐奏重击（One Drop），极具水波下潜感。",
    explanationEn: "Total silence on beat 1. Kick and snare slam simultaneously strictly on beat 3, creating deep dub weight.",
  },
  {
    id: "james_brown_the_one",
    nameZh: "James Brown: The One (对照组)",
    nameEn: "James Brown: The One (Anchor Baseline)",
    origin: "美国放克巡演之路 (The J.B.'s)",
    kickSteps:  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snareSteps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hatSteps:   [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    gravityBeats: [100, 40, 60, 40], // Massive anchor on beat 1
    explanationZh: "放克对照基准：所有乐器极重砸在第 1 拍（The One），构建绝对重力地基，随后 2、3、4 拍自由切分。",
    explanationEn: "Comparison baseline: all voices anchor heavily on 'The One' (beat 1), releasing relaxed syncopation after.",
  },
];

export const DownbeatOmissionLab: React.FC<DownbeatOmissionLabProps> = ({
  engine,
  bpm,
  onBpmChange,
  onTapResult,
}) => {
  const { t, isZh } = useLanguage();
  const [selectedPresetId, setSelectedPresetId] = useState<string>("tony_allen_afrobeat");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [lastTapResult, setLastTapResult] = useState<TapAccuracyResult | null>(null);
  const [streak, setStreak] = useState(0);

  const timerRef = useRef<number | null>(null);
  const stepIndexRef = useRef(0);

  const preset = DOWNBEAT_PRESETS.find((p) => p.id === selectedPresetId) || DOWNBEAT_PRESETS[0];

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setIsPlaying(false);
      setCurrentStep(null);
    } else {
      setIsPlaying(true);
      stepIndexRef.current = 0;
      const stepDurationMs = ((60 / bpm) / 4) * 1000;

      timerRef.current = window.setInterval(() => {
        const step = stepIndexRef.current;
        setCurrentStep(step);

        if (preset.kickSteps[step]) {
          engine.triggerSound("kick", undefined, 0.95);
        }
        if (preset.snareSteps[step]) {
          engine.triggerSound("snare", undefined, 0.85);
        }
        if (preset.hatSteps[step]) {
          engine.triggerSound("hihat", undefined, 0.6);
        }

        // Register pulse timestamp for tap check on primary accent steps
        if (preset.kickSteps[step] || preset.snareSteps[step]) {
          engine.registerPulseTimestamp(engine.getCurrentTime());
        }

        stepIndexRef.current = (stepIndexRef.current + 1) % 16;
      }, stepDurationMs);
    }
  }, [isPlaying, bpm, preset, engine]);

  // Handle live tempo or preset changes
  useEffect(() => {
    if (isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      const stepDurationMs = ((60 / bpm) / 4) * 1000;
      timerRef.current = window.setInterval(() => {
        const step = stepIndexRef.current;
        setCurrentStep(step);

        if (preset.kickSteps[step]) engine.triggerSound("kick", undefined, 0.95);
        if (preset.snareSteps[step]) engine.triggerSound("snare", undefined, 0.85);
        if (preset.hatSteps[step]) engine.triggerSound("hihat", undefined, 0.6);

        if (preset.kickSteps[step] || preset.snareSteps[step]) {
          engine.registerPulseTimestamp(engine.getCurrentTime());
        }

        stepIndexRef.current = (stepIndexRef.current + 1) % 16;
      }, stepDurationMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, bpm, preset, engine]);

  // Tap evaluation
  const handleTap = useCallback(() => {
    const result = engine.evaluateTap();
    setLastTapResult(result);
    if (result.rating === "perfect" || result.rating === "great") {
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }
    if (onTapResult) onTapResult(result);
  }, [engine, onTapResult]);

  const activeBeat = currentStep !== null ? Math.floor(currentStep / 4) : null;

  return (
    <div className="space-y-6">
      {/* Top Bar: Selector & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-panel2 p-3.5 rounded-2xl border border-line">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          <span className="text-xs font-mono font-semibold text-text-sub uppercase">
            {t("downbeat_mode_label")}:
          </span>
          {DOWNBEAT_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPresetId(p.id)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                selectedPresetId === p.id
                  ? "bg-accent text-black font-bold shadow-[0_0_10px_rgba(245,183,61,0.4)]"
                  : "bg-surface text-text-sub hover:text-text border border-line"
              }`}
            >
              {isZh ? p.nameZh.split(" ")[0] : p.nameEn}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-text-sub">
            <span>BPM</span>
            <input
              type="range"
              min={70}
              max={140}
              value={bpm}
              onChange={(e) => {
                const b = Number(e.target.value);
                onBpmChange(b);
              }}
              className="w-20 accent-accent"
            />
            <span className="w-8 text-right font-bold text-accent">{bpm}</span>
          </div>

          <button
            onClick={handleTogglePlay}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md ${
              isPlaying
                ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                : "bg-accent text-black hover:bg-[#ffc65c] shadow-[0_0_12px_rgba(245,183,61,0.3)]"
            }`}
          >
            {isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{t("downbeat_stop")}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t("downbeat_play")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metric Gravity Curve & Drum Strips */}
      <div className="p-6 rounded-3xl bg-[#0b0c10] border border-line space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
          <div>
            <h4 className="text-base font-bold text-text flex items-center gap-2">
              <span>{isZh ? preset.nameZh : preset.nameEn}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-mono">
                {preset.origin}
              </span>
            </h4>
            <p className="text-xs text-text-sub mt-1">
              {isZh ? preset.explanationZh : preset.explanationEn}
            </p>
          </div>

          <button
            onClick={handleTap}
            disabled={!isPlaying}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 ${
              isPlaying
                ? "bg-accent/20 border border-accent text-accent hover:bg-accent/30 active:scale-95 shadow-[0_0_15px_rgba(245,183,61,0.25)]"
                : "bg-surface border border-line text-text-dim cursor-not-allowed"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{t("downbeat_tap_btn")}</span>
            {streak > 0 && <span className="text-emerald-400 font-bold">({streak}x)</span>}
          </button>
        </div>

        {/* Dynamic Metric Gravity Curve (4 Beats) */}
        <div>
          <div className="flex items-center justify-between text-xs font-mono text-text-dim mb-2">
            <span>{t("downbeat_curve_title")}</span>
            <span>{t("downbeat_curve_subtitle")}</span>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((bIdx) => {
              const gravity = preset.gravityBeats[bIdx];
              const isCurrentBeat = activeBeat === bIdx;
              const isBeat1 = bIdx === 0;

              return (
                <div
                  key={bIdx}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    isCurrentBeat
                      ? "bg-accent/15 border-accent shadow-[0_0_16px_rgba(245,183,61,0.2)]"
                      : "bg-surface/70 border-line"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className={`font-bold ${isBeat1 && gravity < 20 ? "text-rose-400 flex items-center gap-1" : "text-text"}`}>
                      {isBeat1 && gravity < 20 && <ShieldAlert className="w-3.5 h-3.5" />}
                      Beat {bIdx + 1}
                    </span>
                    <span className="text-[10px] text-text-dim">{gravity}%</span>
                  </div>

                  {/* Energy bar visualizer */}
                  <div className="h-20 w-full flex items-end bg-[#0f1118] rounded-xl p-1 mt-3 relative overflow-hidden">
                    <div
                      className={`w-full rounded-lg transition-all duration-150 ${
                        isBeat1 && gravity < 20
                          ? "bg-rose-500/30 border border-dashed border-rose-500/50"
                          : isCurrentBeat
                          ? "bg-gradient-to-t from-accent to-[#ffc65c] shadow-[0_0_12px_rgba(245,183,61,0.5)]"
                          : "bg-accent/40"
                      }`}
                      style={{ height: `${Math.max(8, gravity)}%` }}
                    />
                  </div>

                  <div className="mt-2 text-[10px] font-mono text-center text-text-dim">
                    {isBeat1 && gravity < 20
                      ? t("downbeat_omitted_rest")
                      : bIdx === 2 && gravity > 80
                      ? t("downbeat_one_drop")
                      : t("downbeat_propulsion")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 16-step Drum Track Strips */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-text-dim px-2">
            <span className="w-24">{t("downbeat_track")}</span>
            <div className="flex-1 grid grid-cols-16 gap-1.5 text-center">
              {Array.from({ length: 16 }).map((_, i) => (
                <span
                  key={i}
                  className={`text-[10px] ${
                    i === currentStep
                      ? "text-accent font-bold"
                      : i % 4 === 0
                      ? "text-text font-bold"
                      : "text-text-dim"
                  }`}
                >
                  {i + 1}
                </span>
              ))}
            </div>
          </div>

          {/* Kick Track */}
          <div className="flex items-center gap-3">
            <div className="w-24 text-xs font-mono font-bold text-rose-400">KICK</div>
            <div className="flex-1 grid grid-cols-16 gap-1.5">
              {preset.kickSteps.map((hit, stepIdx) => {
                const isActive = currentStep === stepIdx;
                return (
                  <div
                    key={stepIdx}
                    className={`h-8 rounded-lg flex items-center justify-center font-mono text-[10px] transition-all ${
                      hit
                        ? isActive
                          ? "bg-white text-black font-extrabold shadow-[0_0_16px_rgba(255,255,255,0.9)] scale-105"
                          : "bg-rose-500 text-white font-bold shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                        : isActive
                        ? "bg-rose-500/20 border border-rose-500/40"
                        : stepIdx % 4 === 0
                        ? "bg-[#161922] border border-line"
                        : "bg-[#0f1118]"
                    }`}
                  >
                    {hit ? "●" : stepIdx === 0 && !hit ? "∅" : ""}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Snare Track */}
          <div className="flex items-center gap-3">
            <div className="w-24 text-xs font-mono font-bold text-amber-400">SNARE</div>
            <div className="flex-1 grid grid-cols-16 gap-1.5">
              {preset.snareSteps.map((hit, stepIdx) => {
                const isActive = currentStep === stepIdx;
                return (
                  <div
                    key={stepIdx}
                    className={`h-8 rounded-lg flex items-center justify-center font-mono text-[10px] transition-all ${
                      hit
                        ? isActive
                          ? "bg-white text-black font-extrabold shadow-[0_0_16px_rgba(255,255,255,0.9)] scale-105"
                          : "bg-amber-400 text-black font-bold shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                        : isActive
                        ? "bg-amber-400/20 border border-amber-400/40"
                        : stepIdx % 4 === 0
                        ? "bg-[#161922] border border-line"
                        : "bg-[#0f1118]"
                    }`}
                  >
                    {hit ? "▲" : ""}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hi-Hat Track */}
          <div className="flex items-center gap-3">
            <div className="w-24 text-xs font-mono font-bold text-[#45e0c9]">HI-HAT</div>
            <div className="flex-1 grid grid-cols-16 gap-1.5">
              {preset.hatSteps.map((hit, stepIdx) => {
                const isActive = currentStep === stepIdx;
                return (
                  <div
                    key={stepIdx}
                    className={`h-8 rounded-lg flex items-center justify-center font-mono text-[10px] transition-all ${
                      hit
                        ? isActive
                          ? "bg-white text-black font-extrabold"
                          : "bg-[#45e0c9] text-black font-bold shadow-[0_0_6px_rgba(69,224,201,0.3)]"
                        : isActive
                        ? "bg-[#45e0c9]/20"
                        : stepIdx % 4 === 0
                        ? "bg-[#161922] border border-line"
                        : "bg-[#0f1118]"
                    }`}
                  >
                    {hit ? "▪" : ""}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
