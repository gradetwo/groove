import React, { useRef, useState, useCallback, useEffect } from "react";
import { SequencerTrack } from "../../types/genre";
import { Sliders, Sparkles, TrendingUp, TrendingDown, X } from "lucide-react";

interface VelocityLaneProps {
  tracks: SequencerTrack[];
  activeTrackIdx: number;
  onSelectTrack: (trackIdx: number) => void;
  onUpdateVelocity: (trackIdx: number, stepIdx: number, newVel: number) => void;
  onBatchUpdateVelocity: (trackIdx: number, newVelocities: number[]) => void;
  onClose: () => void;
  currentStep: number;
  isPlaying: boolean;
  language: "zh" | "en";
  stepCount: number;
  stepsPerBar: number;
  groupSize: number;
  tracksConfig: Array<{ id: string; name: string; color: string }>;
}

export const VelocityLane: React.FC<VelocityLaneProps> = ({
  tracks,
  activeTrackIdx,
  onSelectTrack,
  onUpdateVelocity,
  onBatchUpdateVelocity,
  onClose,
  currentStep,
  isPlaying,
  language,
  stepCount,
  stepsPerBar,
  groupSize,
  tracksConfig,
}) => {
  const currentTrack = tracks[activeTrackIdx] || tracks[0];
  const meta = tracksConfig[activeTrackIdx % tracksConfig.length];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPainting, setIsPainting] = useState(false);

  // Velocity values for active track, defaulting to 100
  const velocities = Array.from({ length: stepCount }, (_, i) => {
    return currentTrack?.velocity?.[i] !== undefined ? currentTrack.velocity[i] : 100;
  });

  const updateFromPointer = useCallback(
    (e: React.PointerEvent | PointerEvent, stepIdx: number, targetRect: DOMRect) => {
      const clientY = e.clientY;
      const bottom = targetRect.bottom;
      const height = targetRect.height;
      const ratio = Math.max(0, Math.min(1, (bottom - clientY) / height));
      const newVel = Math.round(ratio * 127);
      onUpdateVelocity(activeTrackIdx, stepIdx, Math.max(1, Math.min(127, newVel)));
    },
    [activeTrackIdx, onUpdateVelocity]
  );

  const handlePointerDown = (stepIdx: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsPainting(true);
    const rect = e.currentTarget.getBoundingClientRect();
    updateFromPointer(e, stepIdx, rect);
  };

  const handlePointerEnter = (stepIdx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPainting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    updateFromPointer(e, stepIdx, rect);
  };

  useEffect(() => {
    const handleGlobalPointerUp = () => setIsPainting(false);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => window.removeEventListener("pointerup", handleGlobalPointerUp);
  }, []);

  // Preset Handlers
  const handlePresetFlat = () => {
    onBatchUpdateVelocity(activeTrackIdx, new Array(stepCount).fill(100));
  };

  const handlePresetAccent = () => {
    const updated = velocities.map((_, i) => (i % 4 === 0 ? 122 : 90));
    onBatchUpdateVelocity(activeTrackIdx, updated);
  };

  const handlePresetRampUp = () => {
    const updated = velocities.map((_, i) => Math.round(40 + (i / (stepCount - 1 || 1)) * 85));
    onBatchUpdateVelocity(activeTrackIdx, updated);
  };

  const handlePresetRampDown = () => {
    const updated = velocities.map((_, i) => Math.round(125 - (i / (stepCount - 1 || 1)) * 85));
    onBatchUpdateVelocity(activeTrackIdx, updated);
  };

  const handlePresetHumanize = () => {
    const updated = velocities.map((v) => {
      const jitter = Math.round((Math.random() - 0.5) * 24);
      return Math.max(20, Math.min(127, v + jitter));
    });
    onBatchUpdateVelocity(activeTrackIdx, updated);
  };

  return (
    <div className="bg-[#0e1014] border-t border-[#23262d] p-3 sm:p-4 rounded-b-2xl select-none animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1c1e26]">
        {/* Track Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 scrollbar-none">
          <div className="flex items-center gap-1.5 mr-2 font-['JetBrains_Mono'] text-xs font-bold text-[#f5b73d] shrink-0">
            <Sliders className="w-3.5 h-3.5" />
            <span>{language === "zh" ? "力度抽屉 (0-127)" : "VELOCITY (0-127)"}</span>
          </div>

          {tracks.map((t, idx) => {
            const trackMeta = tracksConfig[idx % tracksConfig.length];
            const isSelected = idx === activeTrackIdx;
            return (
              <button
                key={t.track_id}
                onClick={() => onSelectTrack(idx)}
                className={`px-2.5 py-1 rounded-lg text-xs font-['JetBrains_Mono'] font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
                  isSelected
                    ? "bg-[#181a22] text-[#f0ede6] shadow-[0_0_10px_rgba(0,0,0,0.5)] scale-105"
                    : "bg-[#0a0b0d] text-[#717684] border-[#1e212b] hover:text-[#e9e7e0]"
                }`}
                style={{
                  borderColor: isSelected ? trackMeta.color : undefined,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: trackMeta.color }} />
                <span>{trackMeta.name}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Shape Presets & Close */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={handlePresetFlat}
            className="px-2 py-1 rounded bg-[#151720] border border-[#23262d] hover:border-[#3a3e48] text-[#8b8f99] hover:text-[#e9e7e0] text-[11px] font-mono transition-colors"
            title={language === "zh" ? "重置为标准力度 100" : "Reset flat 100"}
          >
            Flat 100
          </button>
          <button
            onClick={handlePresetAccent}
            className="px-2 py-1 rounded bg-[#151720] border border-[#23262d] hover:border-[#3a3e48] text-[#8b8f99] hover:text-[#e9e7e0] text-[11px] font-mono transition-colors"
            title={language === "zh" ? "正拍重音 (122/90)" : "Accent downbeats"}
          >
            Accent
          </button>
          <button
            onClick={handlePresetRampUp}
            className="p-1 rounded bg-[#151720] border border-[#23262d] hover:border-[#3a3e48] text-[#8b8f99] hover:text-[#e9e7e0] transition-colors"
            title={language === "zh" ? "渐强曲线" : "Crescendo"}
          >
            <TrendingUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handlePresetRampDown}
            className="p-1 rounded bg-[#151720] border border-[#23262d] hover:border-[#3a3e48] text-[#8b8f99] hover:text-[#e9e7e0] transition-colors"
            title={language === "zh" ? "渐弱曲线" : "Decrescendo"}
          >
            <TrendingDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handlePresetHumanize}
            className="px-2 py-1 rounded bg-[#151720] border border-[#23262d] hover:border-[#3a3e48] text-[#8b8f99] hover:text-[#e9e7e0] text-[11px] font-mono transition-colors flex items-center gap-1"
            title={language === "zh" ? "微随机人性化" : "Humanize ±15%"}
          >
            <Sparkles className="w-3 h-3 text-[#45e0c9]" />
            <span>Jitter</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#20222a] text-[#8b8f99] hover:text-[#ff5964] transition-colors ml-1"
            title={language === "zh" ? "关闭力度抽屉" : "Close drawer"}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Interactive Velocity Slider Columns */}
      <div className="pt-3 flex items-center gap-3 overflow-x-auto min-w-max pb-1">
        {/* Left Track Label Space aligned with 172px matrix headers */}
        <div className="w-[172px] flex-none text-right pr-3 font-mono text-[11px] text-[#6b7280]">
          <span className="font-bold text-[#e9e7e0]">{meta.name}</span>
          <span className="block text-[10px] text-[#4a5060]">
            {language === "zh" ? "滑动绘制力度" : "Drag to paint"}
          </span>
        </div>

        {/* Step Velocity Bar Grid */}
        <div ref={containerRef} className="flex-1 flex gap-1 items-end h-24 sm:h-28 bg-[#090a0d] p-2 rounded-xl border border-[#1a1c22]">
          {velocities.map((vel, stepIdx) => {
            const stepVal = currentTrack?.steps?.[stepIdx] || 0;
            const isOn = stepVal > 0;
            const isPlayhead = isPlaying && currentStep === stepIdx;
            const isBarStart = stepIdx % stepsPerBar === 0 && stepIdx !== 0;
            const isGroupStart = stepIdx % groupSize === 0 && stepIdx !== 0;
            const heightPercent = (vel / 127) * 100;
            const isAcc = vel >= 115;

            return (
              <div
                key={stepIdx}
                onPointerDown={(e) => handlePointerDown(stepIdx, e)}
                onPointerEnter={(e) => handlePointerEnter(stepIdx, e)}
                className={`min-w-[28px] sm:min-w-[32px] flex-1 h-full flex flex-col justify-end items-center relative cursor-ns-resize group select-none ${
                  isBarStart ? "ml-3 sm:ml-4 border-l border-[#3a3e48]" : isGroupStart ? "ml-1.5 sm:ml-2" : ""
                }`}
              >
                {/* Numeric readout tooltip on hover or playhead */}
                <div
                  className={`absolute -top-5 font-mono text-[9px] font-bold px-1 rounded transition-opacity ${
                    isPlayhead
                      ? "opacity-100 bg-[#f5b73d] text-black"
                      : "opacity-0 group-hover:opacity-100 bg-[#23262d] text-[#e9e7e0]"
                  }`}
                >
                  {vel}
                </div>

                {/* Background Track Guide Line */}
                <div className="w-full h-full absolute inset-0 rounded bg-[#12141a]/60 pointer-events-none" />

                {/* Vertical Bar Column */}
                <div
                  className={`w-full rounded-t-sm transition-all duration-75 relative z-10 ${
                    isOn
                      ? isAcc
                        ? "shadow-[0_0_10px_var(--tc)]"
                        : "opacity-90"
                      : "opacity-25"
                  } ${isPlayhead ? "ring-1 ring-white" : ""}`}
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor: meta.color,
                    ["--tc" as any]: meta.color,
                  }}
                >
                  {/* Top LED pip */}
                  <span className={`w-full h-1 block rounded-t-sm ${isAcc ? "bg-white" : "bg-white/40"}`} />
                </div>

                {/* Step index subscript */}
                <span className="font-mono text-[8px] text-[#4a5060] mt-1">
                  {stepIdx + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
