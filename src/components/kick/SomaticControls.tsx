import React, { useState } from "react";
import { 
  Sliders, 
  Volume2, 
  Download, 
  Sparkles, 
  Disc, 
  ShieldAlert, 
  Cpu, 
  Waves,
  Zap
} from "lucide-react";
import { 
  SomaticKickParams, 
  KICK_PRESETS, 
  KickPreset,
  AnatomyKickEngine 
} from "../../audio/AnatomyKickEngine";

interface SomaticControlsProps {
  engine: AnatomyKickEngine;
  params: SomaticKickParams;
  onParamsChange: (newParams: Partial<SomaticKickParams>) => void;
  onTriggerKick: () => void;
  isZh: boolean;
  className?: string;
}

export const SomaticControls: React.FC<SomaticControlsProps> = ({
  engine,
  params,
  onParamsChange,
  onTriggerKick,
  isZh,
  className = "",
}) => {
  const [activePresetId, setActivePresetId] = useState<string>("berlin-orphic");
  const [isExporting, setIsExporting] = useState(false);

  const handleSelectPreset = (preset: KickPreset) => {
    setActivePresetId(preset.id);
    onParamsChange(preset.params);
  };

  const handleExportWav = async () => {
    try {
      setIsExporting(true);
      const blob = await engine.exportWav(1.2);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kick_anatomy_${activePresetId}_${params.basePitch}Hz.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`space-y-4 font-mono select-none ${className}`}>
      {/* Somatic Preset Browser */}
      <div className="bg-[#080a0f] border border-line/50 rounded-lg p-3 shadow-sm">
        <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-line/40 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#f5b73d]" />
            <span className="font-bold text-text uppercase">
              {isZh ? "声学哲学预设库" : "SOMATIC PRESETS"}
            </span>
          </div>
          <span className="text-[10px] text-text-dim">6 CURATED MODELS</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {KICK_PRESETS.map((preset) => {
            const isSelected = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`flex flex-col text-left px-2.5 py-1.5 rounded transition-all border ${
                  isSelected
                    ? "bg-[#f5b73d]/15 border-[#f5b73d] text-white shadow-[0_0_8px_rgba(245,183,61,0.25)]"
                    : "bg-[#11141c] border-line/40 text-text-sub hover:bg-[#181d28] hover:text-text"
                }`}
              >
                <span className="text-[11px] font-bold truncate">
                  {isZh ? preset.name.zh : preset.name.en}
                </span>
                <span className="text-[8px] text-[#f5b73d]/80 uppercase">
                  {preset.category}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Preset Philosophical Context */}
        {activePresetId && (
          <div className="mt-2.5 pt-2 border-t border-line/30 text-[10px] text-text-sub leading-relaxed italic bg-black/30 p-2 rounded">
            "
            {isZh
              ? KICK_PRESETS.find((p) => p.id === activePresetId)?.philosophy.zh
              : KICK_PRESETS.find((p) => p.id === activePresetId)?.philosophy.en}
            "
          </div>
        )}
      </div>

      {/* 3-Layer Anatomical Channel Strips */}
      <div className="bg-[#080a0f] border border-line/50 rounded-lg p-3 space-y-2.5">
        <div className="flex items-center justify-between pb-1.5 border-b border-line/40 text-xs">
          <div className="flex items-center gap-2">
            <Disc className="w-3.5 h-3.5 text-[#f5b73d]" />
            <span className="font-bold text-text uppercase">
              {isZh ? "三层身体解剖分轨" : "THE SOMATIC TRIAD CHANNELS"}
            </span>
          </div>
          <span className="text-[9px] text-[#f5b73d]">SOLO / MUTE ISOLATION</span>
        </div>

        {/* Layer 1: SUB */}
        <div className={`flex items-center justify-between gap-3 p-2 rounded border transition-colors ${
          params.subSolo ? "bg-[#f5b73d]/10 border-[#f5b73d]" : params.subMute ? "opacity-40 bg-black/40 border-line/20" : "bg-[#10131b] border-line/40"
        }`}>
          <div className="flex items-center gap-2 min-w-[120px]">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-[#f5b73d] border border-[#f5b73d]/40">
              SINE
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text">1. SUB</span>
              <span className="text-[9px] text-text-dim">30–60 Hz · {isZh ? "躯体与内脏" : "Viscera"}</span>
            </div>
          </div>

          {/* Base Pitch Slider */}
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[10px] text-text-dim w-10">PITCH:</span>
            <input
              type="range"
              min={32}
              max={65}
              value={params.basePitch}
              onChange={(e) => onParamsChange({ basePitch: parseInt(e.target.value, 10) })}
              className="flex-1 accent-[#f5b73d] h-1"
            />
            <span className="text-[10px] text-[#f5b73d] font-bold w-12 text-right">
              {params.basePitch} Hz
            </span>
          </div>

          {/* Solo / Mute Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onParamsChange({ subSolo: !params.subSolo, subMute: false })}
              className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                params.subSolo
                  ? "bg-[#f5b73d] text-black shadow-[0_0_6px_#f5b73d]"
                  : "bg-black/40 text-text-sub border border-line/60 hover:text-text"
              }`}
            >
              S
            </button>
            <button
              onClick={() => onParamsChange({ subMute: !params.subMute, subSolo: false })}
              className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                params.subMute
                  ? "bg-red-500 text-white shadow-[0_0_6px_#ef4444]"
                  : "bg-black/40 text-text-sub border border-line/60 hover:text-text"
              }`}
            >
              M
            </button>
          </div>
        </div>

        {/* Layer 2: THUMP */}
        <div className={`flex items-center justify-between gap-3 p-2 rounded border transition-colors ${
          params.thumpSolo ? "bg-[#f5b73d]/10 border-[#f5b73d]" : params.thumpMute ? "opacity-40 bg-black/40 border-line/20" : "bg-[#10131b] border-line/40"
        }`}>
          <div className="flex items-center gap-2 min-w-[120px]">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-white border border-white/30">
              TRI
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text">2. THUMP</span>
              <span className="text-[9px] text-text-dim">100–200 Hz · {isZh ? "肌肉与冲击" : "Mass"}</span>
            </div>
          </div>

          {/* Hit Skin Slider */}
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[10px] text-text-dim w-10">BODY:</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={params.hitSkin}
              onChange={(e) => onParamsChange({ hitSkin: parseFloat(e.target.value) })}
              className="flex-1 accent-white h-1"
            />
            <span className="text-[10px] text-white font-bold w-12 text-right">
              {Math.round(params.hitSkin * 100)}%
            </span>
          </div>

          {/* Solo / Mute Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onParamsChange({ thumpSolo: !params.thumpSolo, thumpMute: false })}
              className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                params.thumpSolo
                  ? "bg-[#f5b73d] text-black shadow-[0_0_6px_#f5b73d]"
                  : "bg-black/40 text-text-sub border border-line/60 hover:text-text"
              }`}
            >
              S
            </button>
            <button
              onClick={() => onParamsChange({ thumpMute: !params.thumpMute, thumpSolo: false })}
              className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                params.thumpMute
                  ? "bg-red-500 text-white shadow-[0_0_6px_#ef4444]"
                  : "bg-black/40 text-text-sub border border-line/60 hover:text-text"
              }`}
            >
              M
            </button>
          </div>
        </div>

        {/* Layer 3: CLICK */}
        <div className={`flex items-center justify-between gap-3 p-2 rounded border transition-colors ${
          params.clickSolo ? "bg-[#f5b73d]/10 border-[#f5b73d]" : params.clickMute ? "opacity-40 bg-black/40 border-line/20" : "bg-[#10131b] border-line/40"
        }`}>
          <div className="flex items-center gap-2 min-w-[120px]">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-[#f5b73d] border border-[#f5b73d]/40">
              SQR
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-text">3. CLICK</span>
              <span className="text-[9px] text-text-dim">1–2.5 kHz · {isZh ? "神经锁相" : "PLV"}</span>
            </div>
          </div>

          {/* Click Amount Slider */}
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[10px] text-text-dim w-10">SPIKE:</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={params.clickAmount}
              onChange={(e) => onParamsChange({ clickAmount: parseFloat(e.target.value) })}
              className="flex-1 accent-[#f5b73d] h-1"
            />
            <span className="text-[10px] text-[#f5b73d] font-bold w-12 text-right">
              {Math.round(params.clickAmount * 100)}%
            </span>
          </div>

          {/* Solo / Mute Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onParamsChange({ clickSolo: !params.clickSolo, clickMute: false })}
              className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                params.clickSolo
                  ? "bg-[#f5b73d] text-black shadow-[0_0_6px_#f5b73d]"
                  : "bg-black/40 text-text-sub border border-line/60 hover:text-text"
              }`}
            >
              S
            </button>
            <button
              onClick={() => onParamsChange({ clickMute: !params.clickMute, clickSolo: false })}
              className={`w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center transition-all ${
                params.clickMute
                  ? "bg-red-500 text-white shadow-[0_0_6px_#ef4444]"
                  : "bg-black/40 text-text-sub border border-line/60 hover:text-text"
              }`}
            >
              M
            </button>
          </div>
        </div>
      </div>

      {/* Somatic Macro Parameters Grid */}
      <div className="bg-[#080a0f] border border-line/50 rounded-lg p-3">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-line/40 text-xs">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-[#f5b73d]" />
            <span className="font-bold text-text uppercase">
              {isZh ? "身体感知化宏控参数" : "SOMATIC MACRO PARAMETERS"}
            </span>
          </div>
          <span className="text-[9px] text-text-dim">NON-LINEAR DSP</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Softness */}
          <div className="flex flex-col gap-1 p-2 rounded bg-black/40 border border-line/30">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-text">{isZh ? "柔软度" : "Softness"}</span>
              <span className="text-[#f5b73d] font-bold">{Math.round(params.softness * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.softness}
              onChange={(e) => onParamsChange({ softness: parseFloat(e.target.value) })}
              className="accent-[#f5b73d] h-1"
            />
            <span className="text-[8px] text-text-dim">
              {isZh ? "音高下潜曲率与起音阻尼" : "Pitch dive curve & attack damping"}
            </span>
          </div>

          {/* Grit */}
          <div className="flex flex-col gap-1 p-2 rounded bg-black/40 border border-line/30">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-text">{isZh ? "砂砾粗糙度" : "Grit / Saturation"}</span>
              <span className="text-red-400 font-bold">{Math.round(params.grit * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.grit}
              onChange={(e) => onParamsChange({ grit: parseFloat(e.target.value) })}
              className="accent-red-400 h-1"
            />
            <span className="text-[8px] text-text-dim">
              {isZh ? "非线性 Tanh 曲线饱和与阶级抵抗" : "Non-linear tanh curve & class revolt"}
            </span>
          </div>

          {/* Boom to Where */}
          <div className="flex flex-col gap-1 p-2 rounded bg-black/40 border border-line/30">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-text">{isZh ? "低频去向" : "Boom to Where"}</span>
              <span className="text-[#f5b73d] font-bold">{Math.round(params.boomToWhere * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.boomToWhere}
              onChange={(e) => onParamsChange({ boomToWhere: parseFloat(e.target.value) })}
              className="accent-[#f5b73d] h-1"
            />
            <span className="text-[8px] text-text-dim">
              {isZh ? "次低频持续衰减与内向建筑尾音" : "Sub-bass decay length & inner architecture"}
            </span>
          </div>

          {/* Tame Highs */}
          <div className="flex flex-col gap-1 p-2 rounded bg-black/40 border border-line/30">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-text">{isZh ? "驯化高频" : "Tame Highs"}</span>
              <span className="text-blue-400 font-bold">{Math.round(params.tameHighs * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.tameHighs}
              onChange={(e) => onParamsChange({ tameHighs: parseFloat(e.target.value) })}
              className="accent-blue-400 h-1"
            />
            <span className="text-[8px] text-text-dim">
              {isZh ? "低通滤波驯服刺耳瞬态" : "Lowpass filter taming harsh transience"}
            </span>
          </div>

          {/* Rumble */}
          <div className="flex flex-col gap-1 p-2 rounded bg-black/40 border border-line/30">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-text">{isZh ? "次低频隆隆感" : "Rumble"}</span>
              <span className="text-purple-400 font-bold">{Math.round(params.rumble * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.rumble}
              onChange={(e) => onParamsChange({ rumble: parseFloat(e.target.value) })}
              className="accent-purple-400 h-1"
            />
            <span className="text-[8px] text-text-dim">
              {isZh ? "35Hz 亚音速副波震荡" : "Sub-harmonic 35Hz secondary vibration"}
            </span>
          </div>

          {/* Master Volume */}
          <div className="flex flex-col gap-1 p-2 rounded bg-black/40 border border-line/30">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-text">{isZh ? "输出总电平" : "Master Level"}</span>
              <span className="text-emerald-400 font-bold">{Math.round(params.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={1.5}
              step={0.05}
              value={params.volume}
              onChange={(e) => onParamsChange({ volume: parseFloat(e.target.value) })}
              className="accent-emerald-400 h-1"
            />
            <span className="text-[8px] text-text-dim">
              {isZh ? "总线 DC 隔直与增益控制" : "Bus DC blocker & master gain"}
            </span>
          </div>
        </div>
      </div>

      {/* Trigger & Export Action Bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={onTriggerKick}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-[#f5b73d] text-black font-bold text-xs hover:bg-[#ffc95c] shadow-[0_0_15px_rgba(245,183,61,0.4)] active:scale-98 transition-all"
        >
          <Zap className="w-4 h-4 fill-current" />
          <span>{isZh ? "击发瞬态脉冲 [SPACE]" : "DISPATCH TRANSIENT [SPACE]"}</span>
        </button>

        <button
          onClick={handleExportWav}
          disabled={isExporting}
          className="flex items-center justify-center gap-2 py-2.5 px-4 rounded bg-[#141824] text-text hover:bg-[#1e2436] border border-line/60 text-xs font-semibold disabled:opacity-50 transition-all"
          title="Export offline 24-bit 44.1kHz WAV sample"
        >
          <Download className="w-4 h-4 text-[#f5b73d]" />
          <span>{isExporting ? (isZh ? "正在导出..." : "EXPORTING...") : (isZh ? "导出 WAV" : "EXPORT WAV")}</span>
        </button>
      </div>
    </div>
  );
};
