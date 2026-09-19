import React, { useEffect, useRef, useState } from "react";
import { Activity, Radio } from "lucide-react";
import { useDeviceCapabilities } from "../../hooks/useDeviceCapabilities";

interface PhosphorOscilloscopeProps {
  analyser: AnalyserNode | null;
  plv: number;
  lastHitTime: number;
  mode?: "time" | "lissajous";
  onToggleMode?: () => void;
  className?: string;
}

export const PhosphorOscilloscope: React.FC<PhosphorOscilloscopeProps> = ({
  analyser,
  plv,
  lastHitTime,
  mode = "time",
  onToggleMode,
  className = "",
}) => {
  /** Phone surface: measured at 390×664 the mode toggle was 57×33. */
  const { isMobile } = useDeviceCapabilities();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [internalMode, setInternalMode] = useState<"time" | "lissajous">(mode);
  const shockRef = useRef(0);

  // Sync mode
  useEffect(() => {
    setInternalMode(mode);
  }, [mode]);

  // Kinetic shock trigger
  useEffect(() => {
    if (lastHitTime > 0) {
      shockRef.current = 1.0;
    }
  }, [lastHitTime]);

  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let bufferLength = 1024;
    if (analyser) {
      bufferLength = analyser.fftSize;
    }
    const dataArray = new Float32Array(bufferLength);

    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;

      // Exponential decay of shockwave
      shockRef.current *= 0.88;
      const currentShock = shockRef.current;

      // Phosphor persistence: black background with semi-transparent sweep
      ctx.fillStyle = "rgba(4, 5, 8, 0.26)";
      ctx.fillRect(0, 0, width, height);

      // Draw Precision Reticle & Scale Markings
      ctx.save();
      ctx.strokeStyle = currentShock > 0.08 ? `rgba(245, 183, 61, ${0.12 + currentShock * 0.3})` : "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);

      // Grid columns (time divisions)
      const cols = 8;
      for (let i = 1; i < cols; i++) {
        const x = (width / cols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Grid rows (voltage divisions)
      const rows = 6;
      for (let j = 1; j < rows; j++) {
        const y = (height / rows) * j;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center crosshairs
      ctx.setLineDash([]);
      ctx.strokeStyle = currentShock > 0.08 ? `rgba(245, 183, 61, ${0.35 + currentShock * 0.4})` : "rgba(255, 255, 255, 0.15)";
      const midX = width / 2;
      const midY = height / 2;
      ctx.beginPath();
      ctx.moveTo(midX - 12, midY);
      ctx.lineTo(midX + 12, midY);
      ctx.moveTo(midX, midY - 12);
      ctx.lineTo(midX, midY + 12);
      ctx.stroke();

      // Corner technical calibrations
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.fillText("+1.0V", 6, 14);
      ctx.fillText(" 0.0V", 6, midY + 3);
      ctx.fillText("-1.0V", 6, height - 6);
      ctx.fillText("0ms", 28, height - 6);
      ctx.fillText("25ms", midX - 10, height - 6);
      ctx.fillText("50ms", width - 36, height - 6);

      ctx.restore();

      // Get audio data
      let hasSignal = false;
      if (analyser) {
        analyser.getFloatTimeDomainData(dataArray);
        for (let i = 0; i < dataArray.length; i++) {
          if (Math.abs(dataArray[i]) > 0.005) {
            hasSignal = true;
            break;
          }
        }
      }

      // Draw Phosphor Beam
      ctx.save();
      const beamGlow = currentShock > 0.05 ? "#ffffff" : "#f5b73d";
      ctx.strokeStyle = beamGlow;
      ctx.shadowBlur = 8 + currentShock * 12;
      ctx.shadowColor = "#f5b73d";
      ctx.lineWidth = 2 + currentShock * 1.5;

      if (!hasSignal) {
        // Idle flat beam with subtle vacuum cathode noise
        ctx.beginPath();
        const idleY = midY + (Math.random() - 0.5) * 1.2;
        ctx.moveTo(0, idleY);
        ctx.lineTo(width, idleY);
        ctx.stroke();
      } else if (internalMode === "time") {
        // Time Domain (YT) Waveform
        ctx.beginPath();
        const sliceWidth = width / (bufferLength / 2);
        let x = 0;
        for (let i = 0; i < bufferLength / 2; i++) {
          const v = dataArray[i];
          const y = midY - v * (height * 0.42);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }
        ctx.stroke();
      } else {
        // Lissajous / Phase Vectorscope Mode (X = data[i], Y = data[i + offset])
        ctx.beginPath();
        const offset = Math.floor(bufferLength / 8);
        const scale = height * 0.38;
        for (let i = 0; i < bufferLength / 2; i++) {
          const x = midX + dataArray[i] * scale;
          const y = midY - dataArray[(i + offset) % bufferLength] * scale;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyser, internalMode]);

  const handleToggle = () => {
    const next = internalMode === "time" ? "lissajous" : "time";
    setInternalMode(next);
    if (onToggleMode) onToggleMode();
  };

  return (
    <div className={`relative bg-black rounded-lg border border-line/60 overflow-hidden font-mono shadow-[0_0_20px_rgba(0,0,0,0.8)] ${className}`}>
      {/* Header Bar with Academic Indicators */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0c10] border-b border-line/40 text-[10px] text-text-sub select-none">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[#f5b73d] animate-pulse" />
          <span className="font-bold tracking-wider text-text uppercase">
            OSCILLOSCOPE // {internalMode === "time" ? "YT TIME DOMAIN" : "XY LISSAJOUS PHASE"}
          </span>
          <span className="text-[#f5b73d]/70 text-[9px]">CALIB: ~15nm / 5mm</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-text-dim">PLV:</span>
            <span className="text-[#f5b73d] font-bold">{plv.toFixed(3)}</span>
          </div>
          <button
            onClick={handleToggle}
            className={`flex items-center gap-1 px-2 py-0.5 rounded bg-[#141824] hover:bg-[#1f2638] text-text border border-line/50 text-[9px] transition-colors ${isMobile ? "min-h-11" : ""}`}
            title="Toggle YT Waveform vs XY Lissajous Vectorscope"
          >
            <Radio className="w-2.5 h-2.5 text-[#f5b73d]" />
            <span>{internalMode === "time" ? "XY PHASE" : "YT TIME"}</span>
          </button>
        </div>
      </div>

      {/* High-Resolution Canvas */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] max-h-[280px]">
        <canvas
          ref={canvasRef}
          width={800}
          height={340}
          className="w-full h-full block cursor-crosshair bg-black"
        />
        {/* Subtle CRT Phosphor Scanline Overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-transparent to-black"
          style={{
            backgroundImage: "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)",
            backgroundSize: "100% 4px",
          }}
        />
      </div>

      {/* Footer calibration notes */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#06070a] border-t border-line/30 text-[9px] text-text-dim">
        <span>SAMPLING: 48.0 kHz · 32-BIT FLOAT</span>
        <span className="hidden sm:inline">TOUCHDESIGNER CRT EMULATION · DUB TECHNO ORPHIC AESTHETIC</span>
        <span className="text-[#f5b73d]/80">SUB / THUMP / CLICK PHASE LOCK</span>
      </div>
    </div>
  );
};
