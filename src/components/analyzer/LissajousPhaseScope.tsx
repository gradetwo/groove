import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  calculatePhaseCorrelation,
  calculateStereoWidth,
} from "../../utils/audioAnalysis";

export interface LissajousPhaseScopeProps {
  analyserL: AnalyserNode | null;
  analyserR: AnalyserNode | null;
  isPlaying?: boolean;
  theme?: "obsidian" | "cyberpunk" | "heat" | "phosphor";
  className?: string;
  isZh?: boolean;
}

export const LissajousPhaseScope: React.FC<LissajousPhaseScopeProps> = ({
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

  const [correlation, setCorrelation] = useState<number>(1.0);
  const [stereoWidth, setStereoWidth] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);

  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.floor(Math.min(rect.width, rect.height || 280));

    if (size > 0 && (canvas.width !== size * dpr || canvas.height !== size * dpr)) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
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
    const timeDataL = new Float32Array(bufLen);
    const timeDataR = new Float32Array(bufLen);

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

      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(cx, cy) - 16;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Analog Phosphor Persistence Decay
      ctx.fillStyle = "rgba(7, 8, 12, 0.25)";
      ctx.fillRect(0, 0, width, height);

      // Draw Diamond & Polar Graticule
      ctx.lineWidth = 1;

      // Concentric circular graticules
      const rings = [0.33, 0.66, 1.0];
      for (const rFrac of rings) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.beginPath();
        ctx.arc(cx, cy, radius * rFrac, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 45-degree diagonal axes: Left (L) and Right (R) channels
      // L: (-45° = top-left to bottom-right), R: (+45° = top-right to bottom-left)
      const diagLen = radius * 1.05;
      const cos45 = Math.SQRT1_2;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      // -L / +L diagonal (rotated 45deg: Left channel axis)
      ctx.moveTo(cx - diagLen * cos45, cy - diagLen * cos45);
      ctx.lineTo(cx + diagLen * cos45, cy + diagLen * cos45);
      // -R / +R diagonal (Right channel axis)
      ctx.moveTo(cx + diagLen * cos45, cy - diagLen * cos45);
      ctx.lineTo(cx - diagLen * cos45, cy + diagLen * cos45);
      // Center vertical Mid (M) axis & horizontal Side (S) axis
      ctx.moveTo(cx, cy - radius * 1.1);
      ctx.lineTo(cx, cy + radius * 1.1);
      ctx.moveTo(cx - radius * 1.1, cy);
      ctx.lineTo(cx + radius * 1.1, cy);
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillText("+M (Mono)", cx - 22, cy - radius * 1.1 - 4);
      ctx.fillText("-S", cx - radius * 1.1 - 16, cy + 3);
      ctx.fillText("+S", cx + radius * 1.1 + 4, cy + 3);
      ctx.fillText("+L", cx - diagLen * cos45 - 14, cy - diagLen * cos45 - 2);
      ctx.fillText("+R", cx + diagLen * cos45 + 4, cy - diagLen * cos45 - 2);

      // Extract time domain waveforms if playing
      let currentR = 1.0;
      let currentWidth = 0;
      let currentBal = 0;

      if (analyserL && analyserR && isPlaying) {
        if (typeof analyserL.getFloatTimeDomainData === "function") {
          analyserL.getFloatTimeDomainData(timeDataL);
          analyserR.getFloatTimeDomainData(timeDataR);
        }

        currentR = calculatePhaseCorrelation(timeDataL, timeDataR);
        const stereoInfo = calculateStereoWidth(timeDataL, timeDataR);
        currentWidth = stereoInfo.width;
        currentBal = stereoInfo.balance;

        // Draw Lissajous Beam Particles and Lines
        const samplesToDraw = Math.min(bufLen, 512);
        const scale = radius * 1.25;

        // Choose beam color based on phase correlation & theme
        let strokeColor = "rgba(245, 183, 61, 0.75)";
        if (currentR < 0) {
          // Warning red when out of phase!
          strokeColor = "rgba(239, 68, 68, 0.85)";
        } else if (theme === "cyberpunk") {
          strokeColor = "rgba(6, 182, 212, 0.8)";
        } else if (theme === "phosphor") {
          strokeColor = "rgba(74, 222, 128, 0.85)";
        } else if (theme === "heat") {
          strokeColor = "rgba(245, 158, 11, 0.85)";
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        let started = false;
        for (let i = 0; i < samplesToDraw; i += 2) {
          const l = timeDataL[i];
          const r = timeDataR[i];

          // 45-degree rotation transformation:
          // X = Side = (L - R) / sqrt(2)
          // Y = Mid = (L + R) / sqrt(2)
          const side = (l - r) * cos45;
          const mid = (l + r) * cos45;

          const px = cx + side * scale;
          const py = cy - mid * scale;

          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();

        // Draw bright core nodes
        ctx.fillStyle = currentR < 0 ? "#ef4444" : "#ffffff";
        for (let i = 0; i < samplesToDraw; i += 16) {
          const l = timeDataL[i];
          const r = timeDataR[i];
          const side = (l - r) * cos45;
          const mid = (l + r) * cos45;
          const px = cx + side * scale;
          const py = cy - mid * scale;
          ctx.fillRect(px - 1, py - 1, 2, 2);
        }
      } else {
        // Idle central phosphor spot
        ctx.fillStyle = "rgba(245, 183, 61, 0.4)";
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      setCorrelation(currentR);
      setStereoWidth(currentWidth);
      setBalance(currentBal);
    };

    render();

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserL, analyserR, isPlaying, theme]);

  // Determine status message and color based on correlation coefficient
  const isOutOfPhase = correlation < 0;
  const isWide = correlation >= 0 && correlation < 0.5;
  const isSolidMono = correlation >= 0.5;

  const statusText = isOutOfPhase
    ? isZh
      ? "⚠️ 相位抵消风险 (Anti-Phase)"
      : "⚠️ Phase Cancellation Risk"
    : isWide
    ? isZh
      ? "宽广立体声场 (Wide Stereo)"
      : "Wide Stereo Field"
    : isZh
    ? "稳固单声道兼容 (Solid Mono)"
    : "Solid Mono Compatibility";

  const statusColor = isOutOfPhase
    ? "text-red-400 border-red-500/40 bg-red-500/10"
    : isWide
    ? "text-cyan-400 border-cyan-500/40 bg-cyan-500/10"
    : "text-accent border-accent/40 bg-accent/10";

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col items-center justify-between bg-[#050609] border border-line-subtle rounded-xl p-3 select-none ${className}`}
    >
      {/* Top Header: Phase Correlation Status Badge */}
      <div className="w-full flex items-center justify-between mb-2">
        <span className="text-[11px] font-['JetBrains_Mono'] font-bold text-text-sub tracking-wider uppercase">
          {isZh ? "李萨如图示波器" : "Lissajous Scope"}
        </span>
        <div
          className={`px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border transition-colors ${statusColor}`}
        >
          {statusText}
        </div>
      </div>

      {/* Scope Canvas */}
      <div className="relative flex items-center justify-center my-auto">
        <canvas ref={canvasRef} className="block rounded-lg shadow-inner" />
      </div>

      {/* Bottom Meter Bar: Phase Correlation (-1.0 to +1.0) & Stereo Width */}
      <div className="w-full mt-3 pt-2 border-t border-line-subtle flex flex-col gap-2">
        {/* Correlation Meter (-1 to +1) */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-['JetBrains_Mono'] text-text-dim">
            <span>{isZh ? "相位相关系数 (r)" : "Correlation (r)"}</span>
            <span
              className={`font-bold ${
                isOutOfPhase
                  ? "text-red-400"
                  : isWide
                  ? "text-cyan-400"
                  : "text-accent"
              }`}
            >
              {correlation >= 0 ? `+${correlation.toFixed(2)}` : correlation.toFixed(2)}
            </span>
          </div>

          <div className="relative w-full h-2 bg-[#12141c] rounded-full overflow-hidden border border-white/5">
            {/* Center Zero Marker */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30 z-10" />

            {/* Left side: -1 to 0 (Negative Correlation / Red zone) */}
            {correlation < 0 && (
              <div
                className="absolute top-0 bottom-0 bg-red-500 transition-all duration-75"
                style={{
                  left: `${((correlation + 1) / 2) * 100}%`,
                  width: `${(-correlation / 2) * 100}%`,
                }}
              />
            )}

            {/* Right side: 0 to +1 (Positive Correlation / Cyan to Gold) */}
            {correlation >= 0 && (
              <div
                className="absolute top-0 bottom-0 transition-all duration-75"
                style={{
                  left: "50%",
                  width: `${(correlation / 2) * 100}%`,
                  backgroundColor: isWide ? "#06b6d4" : "#f5b73d",
                }}
              />
            )}
          </div>

          <div className="flex justify-between text-[8px] font-['JetBrains_Mono'] text-text-dim px-0.5">
            <span className="text-red-400/80">-1 (反相)</span>
            <span>0</span>
            <span className="text-accent">+1 (单声道)</span>
          </div>
        </div>

        {/* Stereo Width & Balance Readout */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="flex items-center justify-between bg-[#0f1118] px-2 py-1 rounded border border-white/5 text-[10px] font-['JetBrains_Mono']">
            <span className="text-text-dim">{isZh ? "立体声宽" : "Width"}:</span>
            <span className="text-text font-bold">{stereoWidth}%</span>
          </div>
          <div className="flex items-center justify-between bg-[#0f1118] px-2 py-1 rounded border border-white/5 text-[10px] font-['JetBrains_Mono']">
            <span className="text-text-dim">{isZh ? "左右平衡" : "Balance"}:</span>
            <span className="text-text font-bold">
              {balance === 0
                ? "C"
                : balance < 0
                ? `L ${Math.abs(Math.round(balance * 100))}%`
                : `R ${Math.round(balance * 100)}%`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
