import React, { useEffect, useRef, useState } from "react";
import { Layers, Zap } from "lucide-react";
import { canvasRgba, mixCanvasColors } from "../../utils/canvasPalette";
import {
  DESKTOP_CANVAS_FALLBACKS,
  useCanvasPalette,
  type CanvasPaletteFallbacks,
} from "./useCanvasPalette";

/**
 * The desktop palette this waterfall painted with before a skin could reach the canvas.
 *
 * The magnitude ramp has three anchors and the code below interpolates between them exactly as it
 * did with the numbers inline: `signalLow` is the faint bronze shadow, `signal` the bright gold, and
 * `peak` the incandescent top; `grid` is the neutral band marker and its labels, and `ground` is the
 * near-black the history is cleared onto. With no `.mobile-root` ancestor each resolves to the value
 * it replaced, so the desktop render is unchanged.
 */
const PALETTE_FALLBACKS: CanvasPaletteFallbacks = {
  ...DESKTOP_CANVAS_FALLBACKS,
  signalLow: "rgb(180, 80, 20)",
  ground: "#030407",
};

interface WaterfallSpectrogramProps {
  analyser: AnalyserNode | null;
  lastHitTime: number;
  className?: string;
}

export const WaterfallSpectrogram: React.FC<WaterfallSpectrogramProps> = ({
  analyser,
  lastHitTime,
  className = "",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** The skin's colours for the ramp and its guides, read off `.mobile-root`; desktop keeps the literals. */
  const paletteRef = useCanvasPalette(canvasRef, PALETTE_FALLBACKS);
  const historyRef = useRef<Uint8Array[]>([]);
  const maxHistory = 60;
  const shockRef = useRef(0);

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

    const binCount = analyser ? analyser.frequencyBinCount : 512;
    const freqData = new Uint8Array(binCount);

    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;
      /** The palette resolved for this skin; read per frame but *resolved* only on mount / skin / resize. */
      const colours = paletteRef.current;

      shockRef.current *= 0.9;
      const shock = shockRef.current;

      // Sample current frequency slice
      if (analyser) {
        analyser.getByteFrequencyData(freqData);
        // Only keep lower half of bins (0 to ~11kHz) where kick energy lives
        const slice = new Uint8Array(128);
        for (let i = 0; i < 128; i++) {
          slice[i] = freqData[i];
        }
        historyRef.current.unshift(slice);
        if (historyRef.current.length > maxHistory) {
          historyRef.current.pop();
        }
      }

      // Clear with the skin's ground
      ctx.fillStyle = canvasRgba(colours.ground);
      ctx.fillRect(0, 0, width, height);

      const history = historyRef.current;
      const numSlices = history.length;
      if (numSlices === 0) return;

      const sliceHeight = height / maxHistory;

      // Draw waterfall waterfall lines
      for (let s = 0; s < numSlices; s++) {
        const slice = history[s];
        const y = s * sliceHeight;
        const binWidth = width / slice.length;

        for (let b = 0; b < slice.length; b++) {
          const val = slice[b];
          if (val < 4) continue;

          const norm = val / 255;
          // Palette: the skin's ground -> the faint end of the signal -> the signal -> the peak.
          // The three anchors are resolved colours now, but the interpolation is the arithmetic it
          // always was, so the desktop (bronze -> gold -> white) renders exactly as before.
          const low = colours.signalLow;
          const mid = colours.signal;
          const high = colours.peak;
          let r = 0;
          let g = 0;
          let bCol = 0;
          const a = Math.min(1, norm * (1.1 - s / maxHistory * 0.7));

          if (norm < 0.35) {
            // The faint end: the low anchor scaled by how faint the cell is. `min(255)` only ever
            // bites when the low anchor *is* the accent (a bright signal), never on the desktop.
            r = Math.min(255, Math.floor(norm * 3 * low.r));
            g = Math.min(255, Math.floor(norm * 3 * low.g));
            bCol = Math.min(255, Math.floor(norm * 3 * low.b));
          } else if (norm < 0.75) {
            // Rising through the signal colour.
            const t = (norm - 0.35) / 0.4;
            const mixed = mixCanvasColors(low, mid, t);
            r = Math.floor(mixed.r);
            g = Math.floor(mixed.g);
            bCol = Math.floor(mixed.b);
          } else {
            // Blown out at the peak — the most prominent tone the surface has.
            const t = (norm - 0.75) / 0.25;
            const mixed = mixCanvasColors(mid, high, t);
            r = Math.floor(mixed.r);
            g = Math.floor(mixed.g);
            bCol = Math.floor(mixed.b);
          }

          ctx.fillStyle = `rgba(${r}, ${g}, ${bCol}, ${a})`;
          ctx.fillRect(b * binWidth, y, binWidth + 0.5, sliceHeight + 0.5);
        }
      }

      // Draw Anatomical Frequency Zone Marker Guides.
      // The kick bands a signal *belongs* to are the accent; the one neutral marker is the graticule
      // ink, which is what "neither sub nor click" reads as on every skin.
      ctx.save();
      // Band 1: Sub 30-60 Hz (approx bin 1 to 4)
      const subX1 = (1 / 128) * width;
      const subX2 = (5 / 128) * width;
      ctx.strokeStyle = canvasRgba(colours.signal, 0.4);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(subX2, 0);
      ctx.lineTo(subX2, height);
      ctx.stroke();

      // Band 2: Thump 100-200 Hz (approx bin 8 to 18)
      const thumpX2 = (18 / 128) * width;
      ctx.strokeStyle = canvasRgba(colours.grid, 0.25);
      ctx.beginPath();
      ctx.moveTo(thumpX2, 0);
      ctx.lineTo(thumpX2, height);
      ctx.stroke();

      // Band 3: Click 1-2.5 kHz (approx bin 40 to 75)
      const clickX2 = (75 / 128) * width;
      ctx.strokeStyle = canvasRgba(colours.signal, 0.3);
      ctx.beginPath();
      ctx.moveTo(clickX2, 0);
      ctx.lineTo(clickX2, height);
      ctx.stroke();

      // Text labels
      ctx.setLineDash([]);
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = canvasRgba(colours.signal, 0.85);
      ctx.fillText("SUB: 30-60Hz", subX1 + 2, height - 8);
      ctx.fillStyle = canvasRgba(colours.grid, 0.75);
      ctx.fillText("THUMP: 100-200Hz", subX2 + 4, height - 8);
      ctx.fillStyle = canvasRgba(colours.signal, 0.85);
      ctx.fillText("CLICK: 1-2.5kHz", thumpX2 + 6, height - 8);

      // Kinetic shock flash on border
      if (shock > 0.05) {
        ctx.strokeStyle = canvasRgba(colours.signal, shock * 0.5);
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, width, height);
      }

      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyser]);

  return (
    <div className={`relative bg-black rounded-lg border border-line/60 overflow-hidden font-mono shadow-[0_0_20px_rgba(0,0,0,0.8)] ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0c10] border-b border-line/40 text-[10px] text-text-sub select-none">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-[#f5b73d]" />
          <span className="font-bold tracking-wider text-text uppercase">
            3D WATERFALL SPECTROGRAM // FFT FLOW
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-text-dim">
          <span>TIME FLOW: T → T-60</span>
          <span>·</span>
          <span className="text-[#f5b73d]">FFT 1024</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] max-h-[280px]">
        <canvas
          /**
           * A canvas has no text, so without a role and a label it is announced as nothing at all. This component takes no
           * language hook (its parent does), so the label is written once in English rather than threading i18n through the
           * DSP visualisers.
           */
          role="img"
          aria-label="Waterfall spectrogram of the kick: frequency over time, brightness is energy."
          ref={canvasRef}
          width={800}
          height={340}
          className="w-full h-full block bg-black"
        />
        {/* Subtle grid lines */}
        <div
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "12.5% 100%",
          }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#06070a] border-t border-line/30 text-[9px] text-text-dim">
        <span className="flex items-center gap-1">
          <Zap className="w-2.5 h-2.5 text-[#f5b73d]" />
          <span>VISCERA (SUB) · MUSCULAR (THUMP) · NEURAL (CLICK)</span>
        </span>
        <span className="text-[#f5b73d]/80">LOGARITHMIC FREQUENCY WATERFALL</span>
      </div>
    </div>
  );
};
