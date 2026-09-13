import React, { useState } from "react";
import {
  Activity,
  Layers,
  Compass,
  Radio,
  Snowflake,
  Play,
  Palette,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { WaterfallSpectrogram, SpectrogramTheme } from "./WaterfallSpectrogram";
import { LissajousPhaseScope } from "./LissajousPhaseScope";
import { OscilloscopeWaveform } from "./OscilloscopeWaveform";
import { useLanguage } from "../../i18n/LanguageContext";

export type AnalyzerViewMode = "split" | "spectrogram" | "lissajous" | "oscilloscope";

export interface MasterAnalyzerSuiteProps {
  analyser: AnalyserNode | null;
  analyserL?: AnalyserNode | null;
  analyserR?: AnalyserNode | null;
  isPlaying?: boolean;
  onClose?: () => void;
  className?: string;
  defaultMode?: AnalyzerViewMode;
}

export const MasterAnalyzerSuite: React.FC<MasterAnalyzerSuiteProps> = ({
  analyser,
  analyserL = null,
  analyserR = null,
  isPlaying = false,
  onClose,
  className = "",
  defaultMode = "split",
}) => {
  const { isZh } = useLanguage();
  const [viewMode, setViewMode] = useState<AnalyzerViewMode>(defaultMode);
  const [theme, setTheme] = useState<SpectrogramTheme>("obsidian");
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [showPeaks, setShowPeaks] = useState<boolean>(true);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  return (
    <div
      className={`flex flex-col bg-[#0b0d13] border border-line rounded-2xl overflow-hidden shadow-2xl transition-all ${
        isMaximized
          ? "fixed inset-3 sm:inset-6 z-50 max-w-none m-0"
          : "w-full"
      } ${className}`}
    >
      {/* Master Analyzer Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-[#10121a] border-b border-line select-none">
        {/* Left: Title & Mode Tabs */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent font-['JetBrains_Mono'] font-bold text-xs">
            <Activity className="w-3.5 h-3.5" />
            <span>{isZh ? "全景声谱分析仪" : "PANORAMIC ANALYZER"}</span>
            <span className="text-[10px] text-text-sub font-normal hidden md:inline">
              P6-05 · 60 FPS
            </span>
          </div>

          {/* View Mode Buttons */}
          <div className="flex items-center bg-panel2 p-0.5 rounded-lg border border-line">
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-['JetBrains_Mono'] transition-colors ${
                viewMode === "split"
                  ? "bg-accent text-[#0a0b0d] font-bold shadow"
                  : "text-text-sub hover:text-text"
              }`}
              title={isZh ? "双重视图 (瀑布流 + 李萨如)" : "Dual Split View"}
            >
              <Layers className="w-3 h-3" />
              <span className="hidden sm:inline">{isZh ? "双联分屏" : "Split"}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("spectrogram")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-['JetBrains_Mono'] transition-colors ${
                viewMode === "spectrogram"
                  ? "bg-accent text-[#0a0b0d] font-bold shadow"
                  : "text-text-sub hover:text-text"
              }`}
              title={isZh ? "高精瀑布流频谱图" : "Waterfall Spectrogram"}
            >
              <Radio className="w-3 h-3" />
              <span>{isZh ? "瀑布谱" : "FFT"}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("lissajous")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-['JetBrains_Mono'] transition-colors ${
                viewMode === "lissajous"
                  ? "bg-accent text-[#0a0b0d] font-bold shadow"
                  : "text-text-sub hover:text-text"
              }`}
              title={isZh ? "李萨如图立体声示波器" : "Lissajous Phase Scope"}
            >
              <Compass className="w-3 h-3" />
              <span>{isZh ? "李萨如" : "Phase"}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("oscilloscope")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-['JetBrains_Mono'] transition-colors ${
                viewMode === "oscilloscope"
                  ? "bg-accent text-[#0a0b0d] font-bold shadow"
                  : "text-text-sub hover:text-text"
              }`}
              title={isZh ? "双轨时域波形示波器" : "Waveform Oscilloscope"}
            >
              <Activity className="w-3 h-3" />
              <span>{isZh ? "波形" : "Wave"}</span>
            </button>
          </div>
        </div>

        {/* Right: Theme Selector, Freeze, Peak toggle, Maximize, Close */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Theme Switcher */}
          <div className="flex items-center bg-panel2 px-1.5 py-0.5 rounded-lg border border-line text-[11px] font-['JetBrains_Mono']">
            <Palette className="w-3 h-3 text-text-dim mr-1" />
            {(["obsidian", "cyberpunk", "heat", "phosphor"] as const).map((th) => (
              <button
                key={th}
                type="button"
                onClick={() => setTheme(th)}
                className={`px-1.5 py-0.5 rounded uppercase text-[9px] ${
                  theme === th
                    ? "bg-accent/25 text-accent font-bold"
                    : "text-text-dim hover:text-text"
                }`}
                title={`Theme: ${th}`}
              >
                {th === "obsidian"
                  ? "Gold"
                  : th === "cyberpunk"
                  ? "Neon"
                  : th === "heat"
                  ? "Heat"
                  : "CRT"}
              </button>
            ))}
          </div>

          {/* Freeze Frame Button */}
          <button
            type="button"
            onClick={() => setIsFrozen(!isFrozen)}
            className={`h-7 px-2 rounded-lg text-xs font-['JetBrains_Mono'] flex items-center gap-1 border transition-colors ${
              isFrozen
                ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold"
                : "bg-panel2 border-line text-text-sub hover:text-text"
            }`}
            title={isZh ? "冻结当前瞬态波形进行定格分析" : "Freeze Frame for forensic inspection"}
          >
            <Snowflake className="w-3 h-3" />
            <span className="hidden md:inline">{isFrozen ? (isZh ? "定格中" : "Frozen") : (isZh ? "定格" : "Freeze")}</span>
          </button>

          {/* Peak Hold Switch */}
          <button
            type="button"
            onClick={() => setShowPeaks(!showPeaks)}
            className={`h-7 px-2 rounded-lg text-[10px] font-['JetBrains_Mono'] border transition-colors ${
              showPeaks
                ? "bg-accent/15 border-accent text-accent font-bold"
                : "bg-panel2 border-line text-text-dim hover:text-text"
            }`}
            title={isZh ? "显示音轨峰值驻留点" : "Toggle peak hold points"}
          >
            PEAK
          </button>

          {/* Maximize Toggle */}
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="h-7 w-7 rounded-lg bg-panel2 border border-line hover:border-accent text-text-sub hover:text-accent flex items-center justify-center transition-colors"
            title={isMaximized ? (isZh ? "恢复窗口" : "Restore") : (isZh ? "全屏沉浸" : "Maximize")}
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 rounded-lg bg-panel2 border border-line hover:border-red-500 hover:text-red-400 text-text-sub flex items-center justify-center transition-colors"
              title={isZh ? "关闭分析仪" : "Close"}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Analysis Display Viewport */}
      <div className="p-3 sm:p-4">
        {viewMode === "split" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
            {/* Waterfall Spectrogram (Left 7-8 cols) */}
            <div className="lg:col-span-8 flex flex-col">
              <WaterfallSpectrogram
                analyser={analyser}
                isPlaying={isPlaying}
                theme={theme}
                isFrozen={isFrozen}
                showPeaks={showPeaks}
                isZh={isZh}
              />
            </div>

            {/* Lissajous Phase Scope (Right 4-5 cols) */}
            <div className="lg:col-span-4 flex flex-col">
              <LissajousPhaseScope
                analyserL={analyserL}
                analyserR={analyserR}
                isPlaying={isPlaying}
                theme={theme}
                isZh={isZh}
              />
            </div>
          </div>
        )}

        {viewMode === "spectrogram" && (
          <WaterfallSpectrogram
            analyser={analyser}
            isPlaying={isPlaying}
            theme={theme}
            isFrozen={isFrozen}
            showPeaks={showPeaks}
            isZh={isZh}
          />
        )}

        {viewMode === "lissajous" && (
          <div className="max-w-xl mx-auto w-full">
            <LissajousPhaseScope
              analyserL={analyserL}
              analyserR={analyserR}
              isPlaying={isPlaying}
              theme={theme}
              isZh={isZh}
            />
          </div>
        )}

        {viewMode === "oscilloscope" && (
          <OscilloscopeWaveform
            analyserL={analyserL}
            analyserR={analyserR}
            isPlaying={isPlaying}
            theme={theme}
            isZh={isZh}
          />
        )}
      </div>
    </div>
  );
};
