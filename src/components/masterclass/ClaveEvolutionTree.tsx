import React, { useState, useEffect, useRef, useCallback } from "react";
import { MasterclassAudioEngine, TapAccuracyResult } from "../../audio/MasterclassAudioEngine";
import { Play, Square, GitBranch, ArrowRight, Zap, Volume2, Sparkles, Award } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

interface ClaveEvolutionTreeProps {
  engine: MasterclassAudioEngine;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onTapResult?: (result: TapAccuracyResult) => void;
}

interface ClaveVariant {
  id: string;
  nameZh: string;
  nameEn: string;
  region: string;
  timeFeel: string;
  steps: number[]; // 16 steps (or 12 for west african)
  sound: "clave" | "bell";
  highlightStrokeIndex?: number;
  notesZh: string;
  notesEn: string;
}

const CLAVE_VARIANTS: ClaveVariant[] = [
  {
    id: "west_african_bell",
    nameZh: "西非 12/8 铁钟原体 (Sacred Bell)",
    nameEn: "West African 12/8 Bell",
    region: "加纳 / 尼日利亚",
    timeFeel: "12/8 复三连音",
    // Normalized to 12 steps, padded or mapped to 16 for visual alignment
    steps: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0],
    sound: "bell",
    notesZh: "古老口传母题，12 拍圆环划分 7 记钟声 (2+2+1+2+2+2+1)",
    notesEn: "Original arch-pattern in 12/8 compound meter with 7 bell strikes",
  },
  {
    id: "son_clave_32",
    nameZh: "古巴 Son Clave 3-2",
    nameEn: "Cuban Son Clave 3-2",
    region: "古巴哈瓦那",
    timeFeel: "4/4 偶数网格",
    steps: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
    sound: "clave",
    notesZh: "前三后二，第 3 击落于第 7 个十六分音符（step 6），端庄稳重",
    notesEn: "3-side + 2-side: 3rd hit on step 6. The majestic standard of Cuban Son & Salsa",
  },
  {
    id: "rumba_clave_32",
    nameZh: "古巴 Rumba Clave 3-2",
    nameEn: "Cuban Rumba Clave 3-2",
    region: "古巴马坦萨斯",
    timeFeel: "4/4 偶数网格 (黑人街头变奏)",
    steps: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
    sound: "clave",
    highlightStrokeIndex: 7,
    notesZh: "关键微移！第 3 击往后延迟一格（从 step 6 移到 step 7），产生强烈的伦巴摇摆推力！",
    notesEn: "Crucial shift! Stroke 3 is delayed by 1 step (to step 7), creating intense Afro-Cuban swing!",
  },
  {
    id: "bossa_nova_clave",
    nameZh: "巴西 Bossa Nova Clave",
    nameEn: "Brazilian Bossa Nova Clave",
    region: "巴西里约热内卢",
    timeFeel: "2/4 桑巴流动",
    steps: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    sound: "clave",
    highlightStrokeIndex: 13,
    notesZh: "二面（Dos）尾击提前切分（移至 step 13/14），营造如海浪般的悬浮轻盈",
    notesEn: "Final stroke anticipates to the offbeat, creating floating breezy Brazilian lift",
  },
];

export const ClaveEvolutionTree: React.FC<ClaveEvolutionTreeProps> = ({
  engine,
  bpm,
  onBpmChange,
  onTapResult,
}) => {
  const { isZh } = useLanguage();
  const [selectedVariantId, setSelectedVariantId] = useState<string>("son_clave_32");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [lastTapResult, setLastTapResult] = useState<TapAccuracyResult | null>(null);
  const [streak, setStreak] = useState(0);

  const timerRef = useRef<number | null>(null);
  const stepIndexRef = useRef(0);

  const selectedVariant = CLAVE_VARIANTS.find((v) => v.id === selectedVariantId) || CLAVE_VARIANTS[1];

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

        if (selectedVariant.steps[step]) {
          engine.triggerSound(selectedVariant.sound, undefined, 0.95);
          engine.registerPulseTimestamp(engine.getCurrentTime());
        }

        stepIndexRef.current = (stepIndexRef.current + 1) % 16;
      }, stepDurationMs);
    }
  }, [isPlaying, bpm, selectedVariant, engine]);

  // Handle tempo or variant changes during playback
  useEffect(() => {
    if (isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      const stepDurationMs = ((60 / bpm) / 4) * 1000;
      timerRef.current = window.setInterval(() => {
        const step = stepIndexRef.current;
        setCurrentStep(step);

        if (selectedVariant.steps[step]) {
          engine.triggerSound(selectedVariant.sound, undefined, 0.95);
          engine.registerPulseTimestamp(engine.getCurrentTime());
        }

        stepIndexRef.current = (stepIndexRef.current + 1) % 16;
      }, stepDurationMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, bpm, selectedVariant, engine]);

  // Tap check
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

  return (
    <div className="space-y-6">
      {/* Top Bar: Selector & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-panel2 p-3.5 rounded-2xl border border-line">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-accent" />
          <span className="text-xs font-mono font-semibold text-text-sub uppercase">
            {isZh ? "选择演化分支" : "Select Branch"}:
          </span>
          {CLAVE_VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVariantId(v.id)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                selectedVariantId === v.id
                  ? "bg-accent text-black font-bold shadow-[0_0_10px_rgba(245,183,61,0.4)]"
                  : "bg-surface text-text-sub hover:text-text border border-line"
              }`}
            >
              {isZh ? v.nameZh.split(" ")[0] : v.nameEn}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-text-sub">
            <span>BPM</span>
            <input
              type="range"
              min={70}
              max={160}
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
                <span>{isZh ? "停止" : "Stop"}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isZh ? "试听 Clave" : "Play Clave"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Evolution Tree Comparative Matrix */}
      <div className="p-6 rounded-3xl bg-[#0b0c10] border border-line space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
          <div>
            <h4 className="text-base font-bold text-text flex items-center gap-2">
              <span>{isZh ? selectedVariant.nameZh : selectedVariant.nameEn}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-mono">
                {selectedVariant.region}
              </span>
            </h4>
            <p className="text-xs text-text-sub mt-1">
              {isZh ? selectedVariant.notesZh : selectedVariant.notesEn}
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
            <span>{isZh ? "跟随对拍 (SPACE)" : "TAP CLAVE (SPACE)"}</span>
            {streak > 0 && <span className="text-emerald-400 font-bold">({streak}x)</span>}
          </button>
        </div>

        {/* 16-step Matrix Comparison Grid for All 4 Variants */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[11px] font-mono text-text-dim px-2">
            <span className="w-48">{isZh ? "谱系分支" : "Lineage Branch"}</span>
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

          {CLAVE_VARIANTS.map((variant) => {
            const isSelected = variant.id === selectedVariantId;
            return (
              <div
                key={variant.id}
                onClick={() => setSelectedVariantId(variant.id)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col md:flex-row md:items-center gap-3 ${
                  isSelected
                    ? "bg-[#141720] border-accent/60 shadow-[0_0_16px_rgba(245,183,61,0.12)]"
                    : "bg-surface/60 border-line/70 hover:border-line hover:bg-surface"
                }`}
              >
                {/* Variant Label */}
                <div className="w-48 shrink-0">
                  <div className="text-xs font-bold text-text flex items-center gap-1.5">
                    {isSelected && <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_#f5b73d]" />}
                    <span className={isSelected ? "text-accent" : "text-text"}>
                      {isZh ? variant.nameZh.split(" ")[0] : variant.nameEn}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-text-dim">{variant.timeFeel}</div>
                </div>

                {/* 16-step visual blocks */}
                <div className="flex-1 grid grid-cols-16 gap-1.5">
                  {variant.steps.map((hit, stepIdx) => {
                    const isStepActive = isSelected && currentStep === stepIdx;
                    const isStrokeHighlight = variant.highlightStrokeIndex === stepIdx;

                    return (
                      <div
                        key={stepIdx}
                        className={`h-9 rounded-lg flex items-center justify-center font-mono text-[10px] transition-all ${
                          hit
                            ? isStepActive
                              ? "bg-white text-black font-extrabold shadow-[0_0_16px_rgba(255,255,255,0.9)] scale-105"
                              : isStrokeHighlight
                              ? "bg-gradient-to-t from-rose-600 to-amber-500 text-white font-bold shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                              : isSelected
                              ? "bg-accent text-black font-bold shadow-[0_0_8px_rgba(245,183,61,0.3)]"
                              : "bg-[#2a2e3d] text-text-sub font-semibold"
                            : isStepActive
                            ? "bg-accent/20 border border-accent/40"
                            : stepIdx % 4 === 0
                            ? "bg-[#151720] border border-line"
                            : "bg-[#0f1118]"
                        }`}
                      >
                        {hit ? (isStrokeHighlight ? "★" : "●") : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Son vs Rumba Micro-Displacement Callout Card */}
        <div className="p-4 rounded-2xl bg-accent/5 border border-accent/20 flex flex-col sm:flex-row items-center gap-4 text-xs">
          <div className="p-2.5 rounded-xl bg-accent/15 text-accent shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1 text-text-sub">
            <div className="font-bold text-text flex items-center gap-2">
              <span>{isZh ? "声学解密：Son 与 Rumba 的「半拍之跃」" : "Acoustic Shift: Son vs Rumba Half-Beat Lift"}</span>
              <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
                Step 6 → Step 7
              </span>
            </div>
            <p className="leading-relaxed">
              {isZh
                ? "仔细比对上方第二行与第三行：Son Clave 的第 3 击落在第 7 格（Step 6，正拍前半拍），而在 Rumba Clave 中仅向后挪动了 1 格（Step 7，反拍切分）。这仅仅半拍的迟滞，彻底将律动从欧式平衡推入了西非跨节拍对冲的狂欢漩涡！"
                : "Observe lines 2 and 3 above: Son Clave lands stroke 3 on step 6. Rumba Clave delays stroke 3 to step 7 by exactly one 16th note. This micro-displacement unbalances metric symmetry, creating hypnotic syncopated lift."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
