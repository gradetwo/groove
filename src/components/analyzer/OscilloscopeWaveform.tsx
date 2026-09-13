import React, { useEffect, useRef, useState, useCallback } from "react";
import { findZeroCrossing } from "../../utils/audioAnalysis";

export interface OscilloscopeWaveformProps {
  analyserL: AnalyserNode | null;
  analyserR: AnalyserNode | null;
  isPlaying?: boolean;
  theme?: "obsidian" | "cyberpunk" | "heat" | "phosphor";
  className?: string;
  isZh?: boolean;
}

export const OscilloscopeWaveform: React.FC<OscilloscopeWaveformProps> = ({
  analyserL,
  analyserR,
  isPlaying = false,
  theme = "obsidian",
  className = "",
  isZh = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [timebaseZoom, setTimebaseZoom] = useState<number>(1); // 1x, 2x, 4x
  const [triggerLocked, setTriggerLocked] = useState<boolean>(true);

  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height || 220);

    if (w > 0 && h > 0 && (canvas.width !== w * dpr || canvas.height !== h * dpr)) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
  }, []);

  useEffect(() => {
    updateCanvasSize();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => updateCanvasSize());
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    }
  }, [updateCanvasSize]);

  useEffect(() => {
    let active = true;

    const bufLen = analyserL ? analyserL.fftSize : 1024;
    const dataL = new Float32Array(bufLen);
    const dataR = new Float32Array(bufLen);

    const render = () => {
      if (!active) return;
      animFrameRef.current = requestAnimationFrame(render);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      if (width <= 0 || height <= 0) return;

      const midY = height / 2;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Phosphor decay background
      ctx.fillStyle = "#07080c";
      ctx.fillRect(0, 0, width, height);

      // Draw Voltage Graticule Grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";

      // Horizontal lines (+1.0, +0.5, 0.0, -0.5, -1.0)
      const vLines = [-1, -0.5, 0, 0.5, 1];
      for (const v of vLines) {
        const y = midY - v * (midY - 14);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText(`${v >= 0 ? "+" : ""}${v.toFixed(1)}V`, 6, y - 2);
      }

      // Center reference zero axis
      ctx.strokeStyle = "rgba(245, 183, 61, 0.25)";
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();

      // Vertical time div lines (10 divisions across width)
      const numDivs = 10;
      for (let i = 1; i < numDivs; i++) {
        const x = (i / numDivs) * width;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Waveform rendering
      if (analyserL && analyserR && isPlaying) {
        if (typeof analyserL.getFloatTimeDomainData === "function") {
          analyserL.getFloatTimeDomainData(dataL);
          analyserR.getFloatTimeDomainData(dataR);
        }

        // Find Zero Crossing for synchronization
        const startIdx = triggerLocked ? findZeroCrossing(dataL) : 0;
        const visibleSamples = Math.floor(bufLen / timebaseZoom);
        const step = Math.max(1, Math.floor(visibleSamples / width));

        // Draw Left Channel Waveform (Cyan)
        ctx.lineWidth = 1.5;
        ctx.strokeStyle =
          theme === "phosphor"
            ? "rgba(74, 222, 128, 0.9)"
            : "rgba(6, 182, 212, 0.85)";
        ctx.beginPath();

        let drewL = false;
        for (let x = 0; x < width; x++) {
          const sampleIdx = startIdx + Math.floor((x / width) * visibleSamples);
          if (sampleIdx < bufLen) {
            const val = dataL[sampleIdx];
            const y = midY - val * (midY - 14);
            if (!drewL) {
              ctx.moveTo(x, y);
              drewL = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();

        // Draw Right Channel Waveform (Gold / Magenta)
        ctx.lineWidth = 1.5;
        ctx.strokeStyle =
          theme === "phosphor"
            ? "rgba(163, 230, 53, 0.7)"
            : theme === "cyberpunk"
            ? "rgba(240, 110, 196, 0.8)"
            : "rgba(245, 183, 61, 0.85)";
        ctx.beginPath();

        let drewR = false;
        for (let x = 0; x < width; x++) {
          const sampleIdx = startIdx + Math.floor((x / width) * visibleSamples);
          if (sampleIdx < bufLen) {
            const val = dataR[sampleIdx];
            const y = midY - val * (midY - 14);
            if (!drewR) {
              ctx.moveTo(x, y);
              drewR = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      } else {
        // Idle flat line
        ctx.strokeStyle = "rgba(245, 183, 61, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();
      }

      ctx.restore();
    };

    render();

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserL, analyserR, isPlaying, timebaseZoom, triggerLocked, theme]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-[#050609] border border-line-subtle rounded-xl overflow-hidden select-none ${className}`}
    >
      {/* Top Toolbar */}
      <div className="w-full flex items-center justify-between px-3 py-2 bg-[#0c0e14] border-b border-line-subtle">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-['JetBrains_Mono'] font-bold text-text-sub uppercase">
            {isZh ? "双轨时域波形示波器" : "Dual-Trace Waveform"}
          </span>
          <div className="flex items-center gap-2 text-[10px] font-['JetBrains_Mono']">
            <span className="text-cyan-400 font-bold flex items-center gap-1">
              <span className="w-2 h-0.5 bg-cyan-400 inline-block" /> CH-1 (L)
            </span>
            <span className="text-accent font-bold flex items-center gap-1">
              <span className="w-2 h-0.5 bg-accent inline-block" /> CH-2 (R)
            </span>
          </div>
        </div>

        {/* Timebase Zoom & Trigger Controls */}
        <div className="flex items-center gap-2">
          {/* Trigger Lock */}
          <button
            type="button"
            onClick={() => setTriggerLocked(!triggerLocked)}
            className={`h-6 px-2 rounded text-[10px] font-['JetBrains_Mono'] border transition-colors ${
              triggerLocked
                ? "bg-accent/20 border-accent text-accent font-bold"
                : "bg-panel border-line text-text-sub hover:text-text"
            }`}
            title={isZh ? "过零锁相触发（防止波形漂移）" : "Zero-Crossing Trigger Lock"}
          >
            {isZh ? "锁相触发" : "SYNC"}
          </button>

          {/* Zoom Multipliers */}
          <div className="flex items-center bg-panel rounded border border-line p-0.5">
            {([1, 2, 4] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setTimebaseZoom(z)}
                className={`h-5 px-1.5 rounded text-[9px] font-['JetBrains_Mono'] ${
                  timebaseZoom === z
                    ? "bg-accent text-[#0a0b0d] font-bold"
                    : "text-text-sub hover:text-text"
                }`}
              >
                {z}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full h-52 sm:h-60">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};
