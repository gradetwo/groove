import React, { useState, useEffect, useRef, useCallback } from "react";
import { MasterclassAudioEngine, TapAccuracyResult } from "../../audio/MasterclassAudioEngine";
import { Play, Square, Zap, Sliders, Sparkles, MoveHorizontal, Disc } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

interface DillaMicrotimingProps {
  engine: MasterclassAudioEngine;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onTapResult?: (result: TapAccuracyResult) => void;
}

export const DillaMicrotiming: React.FC<DillaMicrotimingProps> = ({
  engine,
  bpm,
  onBpmChange,
  onTapResult,
}) => {
  const { t } = useLanguage();
  const [kickShiftMs, setKickShiftMs] = useState(-20); // -20ms rush
  const [snareShiftMs, setSnareShiftMs] = useState(35); // +35ms drag
  const [swingAmount, setSwingAmount] = useState(58); // 58% Dilla swing
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [lastTapResult, setLastTapResult] = useState<TapAccuracyResult | null>(null);
  const [streak, setStreak] = useState(0);

  const timerRef = useRef<number | null>(null);
  const stepIndexRef = useRef(0);

  // Standard Dilla pattern template (16 steps)
  const kickSteps =  [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0];
  const snareSteps = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  const hatSteps =   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];

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

        // Apply swing offset to odd steps
        const isSwingStep = step % 2 === 1;
        const swingOffsetMs = isSwingStep ? ((swingAmount - 50) / 100) * (stepDurationMs * 0.5) : 0;

        // Kick trigger with micro-shift
        if (kickSteps[step]) {
          const delay = Math.max(0, (kickShiftMs + swingOffsetMs) / 1000);
          engine.triggerSound("kick", engine.getCurrentTime() + delay, 0.95);
          engine.registerPulseTimestamp(engine.getCurrentTime() + delay);
        }

        // Snare trigger with laid-back shift
        if (snareSteps[step]) {
          const delay = Math.max(0, (snareShiftMs + swingOffsetMs) / 1000);
          engine.triggerSound("snare", engine.getCurrentTime() + delay, 0.9);
          engine.registerPulseTimestamp(engine.getCurrentTime() + delay);
        }

        // Hi-hat trigger
        if (hatSteps[step]) {
          const delay = Math.max(0, swingOffsetMs / 1000);
          engine.triggerSound("hihat", engine.getCurrentTime() + delay, 0.65);
        }

        stepIndexRef.current = (stepIndexRef.current + 1) % 16;
      }, stepDurationMs);
    }
  }, [isPlaying, bpm, kickShiftMs, snareShiftMs, swingAmount, engine]);

  // Live adjustments while playing
  useEffect(() => {
    if (isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      const stepDurationMs = ((60 / bpm) / 4) * 1000;
      timerRef.current = window.setInterval(() => {
        const step = stepIndexRef.current;
        setCurrentStep(step);

        const isSwingStep = step % 2 === 1;
        const swingOffsetMs = isSwingStep ? ((swingAmount - 50) / 100) * (stepDurationMs * 0.5) : 0;

        if (kickSteps[step]) {
          const delay = Math.max(0, (kickShiftMs + swingOffsetMs) / 1000);
          engine.triggerSound("kick", engine.getCurrentTime() + delay, 0.95);
          engine.registerPulseTimestamp(engine.getCurrentTime() + delay);
        }
        if (snareSteps[step]) {
          const delay = Math.max(0, (snareShiftMs + swingOffsetMs) / 1000);
          engine.triggerSound("snare", engine.getCurrentTime() + delay, 0.9);
          engine.registerPulseTimestamp(engine.getCurrentTime() + delay);
        }
        if (hatSteps[step]) {
          const delay = Math.max(0, swingOffsetMs / 1000);
          engine.triggerSound("hihat", engine.getCurrentTime() + delay, 0.65);
        }

        stepIndexRef.current = (stepIndexRef.current + 1) % 16;
      }, stepDurationMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, bpm, kickShiftMs, snareShiftMs, swingAmount, engine]);

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
      {/* Top Bar: Presets & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-panel2 p-3.5 rounded-2xl border border-line">
        <div className="flex items-center gap-2">
          <Disc className="w-4 h-4 text-accent" />
          <span className="text-xs font-mono font-semibold text-text-sub uppercase">
            {t("dilla_presets_label")}:
          </span>
          {[
            { name: "Dilla Drunk", kick: -20, snare: 35, swing: 58 },
            { name: "MPC 62%", kick: 0, snare: 0, swing: 62 },
            { name: "Rigid 0ms", kick: 0, snare: 0, swing: 50 },
            { name: "Neo-Soul Lag", kick: -10, snare: 45, swing: 64 },
          ].map((preset) => (
            <button
              key={preset.name}
              onClick={() => {
                setKickShiftMs(preset.kick);
                setSnareShiftMs(preset.snare);
                setSwingAmount(preset.swing);
              }}
              className={`px-2.5 py-1 text-xs rounded-lg font-mono font-medium transition-colors ${
                kickShiftMs === preset.kick && snareShiftMs === preset.snare && swingAmount === preset.swing
                  ? "bg-accent text-black font-bold shadow-[0_0_10px_rgba(245,183,61,0.4)]"
                  : "bg-surface text-text-sub hover:text-text border border-line"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-text-sub">
            <span>BPM</span>
            <input
              type="range"
              min={70}
              max={110}
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
                <span>{t("dilla_stop")}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t("dilla_play")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Interactive Microtiming Sliders & Grid Displacement */}
      <div className="p-6 rounded-3xl bg-[#0b0c10] border border-line space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
          <div>
            <h4 className="text-base font-bold text-text flex items-center gap-2">
              <span>{t("dilla_engine_title")}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-mono">
                Detroit 1996
              </span>
            </h4>
            <p className="text-xs text-text-sub mt-1">
              {t("dilla_engine_desc")}
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
            <span>{t("dilla_tap_btn")}</span>
            {streak > 0 && <span className="text-emerald-400 font-bold">({streak}x)</span>}
          </button>
        </div>

        {/* 3 Parameter Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Kick Shift */}
          <div className="p-4 rounded-2xl bg-surface/70 border border-line space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-rose-400">{t("masterclass_dilla_kick_shift")}</span>
              <span className="text-text font-bold">{kickShiftMs > 0 ? `+${kickShiftMs}` : kickShiftMs} ms</span>
            </div>
            <input
              type="range"
              min={-50}
              max={50}
              step={1}
              value={kickShiftMs}
              onChange={(e) => setKickShiftMs(Number(e.target.value))}
              className="w-full accent-rose-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-text-dim">
              <span>{t("dilla_kick_minus50")}</span>
              <span>0ms</span>
              <span>{t("dilla_kick_plus50")}</span>
            </div>
          </div>

          {/* Snare Shift */}
          <div className="p-4 rounded-2xl bg-surface/70 border border-line space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-amber-400">{t("dilla_snare_title")}</span>
              <span className="text-text font-bold">{snareShiftMs > 0 ? `+${snareShiftMs}` : snareShiftMs} ms</span>
            </div>
            <input
              type="range"
              min={-50}
              max={50}
              step={1}
              value={snareShiftMs}
              onChange={(e) => setSnareShiftMs(Number(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-text-dim">
              <span>-50ms</span>
              <span>0ms</span>
              <span>{t("dilla_snare_plus50")}</span>
            </div>
          </div>

          {/* Swing Amount */}
          <div className="p-4 rounded-2xl bg-surface/70 border border-line space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-accent">{t("dilla_swing_label")}</span>
              <span className="text-text font-bold">{swingAmount}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={75}
              step={1}
              value={swingAmount}
              onChange={(e) => setSwingAmount(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] font-mono text-text-dim">
              <span>50% 直拍</span>
              <span>62% BoomBap</span>
              <span>75% 三连音</span>
            </div>
          </div>
        </div>

        {/* Visual Micro-Displacement Comparison Lane */}
        <div className="p-4 rounded-2xl bg-[#090a0e] border border-line space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-text-dim">
            <span className="flex items-center gap-1.5">
              <MoveHorizontal className="w-3.5 h-3.5 text-accent" />
              <span>{t("dilla_visualizer_title")}</span>
            </span>
            <span className="text-[10px] text-text-dim">
              {t("dilla_visualizer_legend")}
            </span>
          </div>

          {/* 16-step visual displacement lane */}
          <div className="grid grid-cols-16 gap-1 h-20 bg-[#12141c] rounded-xl p-2 items-center relative overflow-hidden border border-line/60">
            {Array.from({ length: 16 }).map((_, stepIdx) => {
              const isKick = kickSteps[stepIdx] === 1;
              const isSnare = snareSteps[stepIdx] === 1;
              const isActive = currentStep === stepIdx;

              // Calculate visual pixel offset based on ms shift
              const shift = isKick ? kickShiftMs : isSnare ? snareShiftMs : 0;
              const translateX = Math.max(-12, Math.min(12, shift * 0.25));

              return (
                <div key={stepIdx} className="h-full flex flex-col items-center justify-center relative">
                  {/* Dashed rigid grid tick */}
                  <div className="absolute inset-y-0 w-[1px] bg-[#2a2f3f] border-dashed" />

                  {/* Active scan line */}
                  {isActive && <div className="absolute inset-y-0 w-1 bg-accent shadow-[0_0_8px_#f5b73d] z-20" />}

                  {/* Hit element shifted */}
                  {(isKick || isSnare) && (
                    <div
                      style={{ transform: `translateX(${translateX}px)` }}
                      className={`w-6 h-10 rounded-lg flex flex-col items-center justify-center font-mono text-[9px] z-10 transition-transform ${
                        isKick
                          ? "bg-rose-500 text-white font-bold shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                          : "bg-amber-400 text-black font-bold shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                      }`}
                    >
                      <span>{isKick ? "K" : "S"}</span>
                      <span className="text-[7px] opacity-80">
                        {shift !== 0 ? `${shift > 0 ? "+" : ""}${shift}` : "0"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
