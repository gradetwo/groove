import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  frequencyToX,
  xToFrequency,
  frequencyToNoteName,
  getFrequencyBandInfo,
  FREQUENCY_BANDS,
} from "../../utils/audioAnalysis";

export type SpectrogramTheme = "obsidian" | "cyberpunk" | "heat" | "phosphor";

export interface WaterfallSpectrogramProps {
  analyser: AnalyserNode | null;
  isPlaying?: boolean;
  theme?: SpectrogramTheme;
  isFrozen?: boolean;
  showBandsBar?: boolean;
  showPeaks?: boolean;
  className?: string;
  isZh?: boolean;
}

interface HoverInfo {
  x: number;
  freq: number;
  db: number;
  note: string;
  cents: number;
  bandName: string;
  bandColor: string;
}

// Color palette mapping functions for waterfall time-slice pixels
function getPaletteColor(
  theme: SpectrogramTheme,
  val: number
): [number, number, number, number] {
  if (val < 4) return [5, 6, 10, 255];
  const norm = val / 255;

  if (theme === "obsidian") {
    // Groove signature: Black -> Bronze -> Gold -> Brilliant White
    if (norm < 0.3) {
      const t = norm / 0.3;
      return [Math.floor(t * 140), Math.floor(t * 60), Math.floor(t * 15), 255];
    } else if (norm < 0.75) {
      const t = (norm - 0.3) / 0.45;
      return [
        Math.floor(140 + t * 105),
        Math.floor(60 + t * 123),
        Math.floor(15 + t * 46),
        255,
      ];
    } else {
      const t = (norm - 0.75) / 0.25;
      return [
        Math.floor(245 + t * 10),
        Math.floor(183 + t * 72),
        Math.floor(61 + t * 194),
        255,
      ];
    }
  }

  if (theme === "cyberpunk") {
    // Indigo -> Hot Cyan -> Neon Magenta -> Crisp White
    if (norm < 0.35) {
      const t = norm / 0.35;
      return [Math.floor(t * 20), Math.floor(t * 180), Math.floor(t * 220), 255];
    } else if (norm < 0.75) {
      const t = (norm - 0.35) / 0.4;
      return [
        Math.floor(20 + t * 220),
        Math.floor(180 - t * 80),
        Math.floor(220 + t * 30),
        255,
      ];
    } else {
      const t = (norm - 0.75) / 0.25;
      return [255, Math.floor(100 + t * 155), 255, 255];
    }
  }

  if (theme === "heat") {
    // Dark Space -> Crimson Red -> Fire Amber -> Incandescent White
    if (norm < 0.33) {
      const t = norm / 0.33;
      return [Math.floor(t * 220), Math.floor(t * 20), Math.floor(t * 20), 255];
    } else if (norm < 0.66) {
      const t = (norm - 0.33) / 0.33;
      return [Math.floor(220 + t * 35), Math.floor(20 + t * 180), 0, 255];
    } else {
      const t = (norm - 0.66) / 0.34;
      return [255, Math.floor(200 + t * 55), Math.floor(t * 255), 255];
    }
  }

  // phosphor: Retro Analog Green CRT
  if (norm < 0.4) {
    const t = norm / 0.4;
    return [0, Math.floor(t * 140), Math.floor(t * 40), 255];
  } else if (norm < 0.8) {
    const t = (norm - 0.4) / 0.4;
    return [Math.floor(t * 80), Math.floor(140 + t * 110), Math.floor(40 + t * 60), 255];
  } else {
    const t = (norm - 0.8) / 0.2;
    return [Math.floor(80 + t * 175), 255, Math.floor(100 + t * 155), 255];
  }
}

export const WaterfallSpectrogram: React.FC<WaterfallSpectrogramProps> = ({
  analyser,
  isPlaying = false,
  theme = "obsidian",
  isFrozen = false,
  showBandsBar = true,
  showPeaks = true,
  className = "",
  isZh = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Peak hold buffer across display width
  const peakHoldRef = useRef<Float32Array | null>(null);
  const peakFreqRef = useRef<{ freq: number; note: string; db: number }>({
    freq: 0,
    note: "-",
    db: -90,
  });

  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [bandEnergies, setBandEnergies] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  // Handle canvas sizing with devicePixelRatio
  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w > 0 && h > 0 && (canvas.width !== w * dpr || canvas.height !== h * dpr)) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      peakHoldRef.current = new Float32Array(w);
    }
  }, []);

  useEffect(() => {
    updateCanvasSize();
    if (typeof ResizeObserver !== "undefined") {
      /**
       * Deferred by one frame: `updateCanvasSize` writes the canvas' *style* width/height, and the
       * container's size follows the canvas, so a synchronous callback resizes the observed element
       * inside its own notification and the engine reports
       * "ResizeObserver loop completed with undelivered notifications". The handler's own guard makes
       * the second pass a no-op, so one frame of deferral settles it — measured by the E2E, which
       * collected that warning as a page error once the phone gate started visiting this view.
       */
      const ro = new ResizeObserver(() => requestAnimationFrame(() => updateCanvasSize()));
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    }
  }, [updateCanvasSize]);

  useEffect(() => {
    let active = true;

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

      const spectrumHeight = Math.floor(height * 0.42);
      const waterfallHeight = height - spectrumHeight;

      // Extract frequency data from analyser
      const binCount = analyser ? analyser.frequencyBinCount : 1024;
      const freqData = new Uint8Array(binCount);
      if (analyser && isPlaying && !isFrozen) {
        analyser.getByteFrequencyData(freqData);
      }

      const sampleRate = analyser?.context?.sampleRate || 44100;
      const nyquist = sampleRate / 2;

      // Ensure peak hold buffer matches current width
      if (!peakHoldRef.current || peakHoldRef.current.length !== Math.floor(width)) {
        peakHoldRef.current = new Float32Array(Math.floor(width));
      }
      const peakHold = peakHoldRef.current;

      // Setup drawing coordinate system
      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Shift existing waterfall down by 2 pixels (Smooth temporal scrolling)
      if (isPlaying && !isFrozen) {
        ctx.drawImage(
          canvas,
          0,
          Math.floor(spectrumHeight * dpr),
          canvas.width,
          Math.floor(waterfallHeight * dpr) - 2 * dpr,
          0,
          Math.floor(spectrumHeight * dpr) + 2 * dpr,
          canvas.width,
          Math.floor(waterfallHeight * dpr) - 2 * dpr
        );
      }

      // 2. Clear Spectrum Area at top
      ctx.fillStyle = "#08090e";
      ctx.fillRect(0, 0, width, spectrumHeight);

      // 3. Draw Frequency Grid Lines & Labels
      ctx.lineWidth = 1;
      const gridFreqs = [50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000];
      for (const gf of gridFreqs) {
        const x = frequencyToX(gf, 20, 20000, width);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, spectrumHeight);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
        ctx.font = "9px 'JetBrains Mono', monospace";
        const label = gf >= 1000 ? `${gf / 1000}k` : `${gf}`;
        ctx.fillText(label, x + 2, 12);
      }

      // Draw dB horizontal grid lines (-12dB, -24dB, -36dB, -48dB, -60dB, -72dB)
      const dBLines = [-12, -24, -36, -48, -60, -72];
      for (const db of dBLines) {
        const yNorm = (-db) / 90;
        const y = yNorm * spectrumHeight;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText(`${db}dB`, width - 32, y - 2);
      }

      // 4. Sample and Map Frequency Curve (Logarithmic Interpolation)
      const curveY: number[] = new Array(Math.floor(width));
      let maxVal = 0;
      let maxFreq = 0;

      // Accumulate energy across 7 bands
      const bandSums = [0, 0, 0, 0, 0, 0, 0];
      const bandCounts = [0, 0, 0, 0, 0, 0, 0];

      // Newest waterfall slice pixels
      const sliceImg = ctx.createImageData(Math.floor(width), 2);
      const imgData = sliceImg.data;

      const wFloor = Math.floor(width);
      for (let x = 0; x < wFloor; x++) {
        const freq = xToFrequency(x, 20, 20000, width);
        const binIndex = (freq / nyquist) * binCount;
        const bin0 = Math.floor(binIndex);
        const bin1 = Math.min(binCount - 1, bin0 + 1);
        const frac = binIndex - bin0;

        const val0 = freqData[bin0] || 0;
        const val1 = freqData[bin1] || 0;
        const val = val0 * (1 - frac) + val1 * frac;

        if (val > maxVal) {
          maxVal = val;
          maxFreq = freq;
        }

        // Map to dB height (normalized from 0 to 255 -> 0 to spectrumHeight)
        const norm = val / 255;
        const y = spectrumHeight - norm * (spectrumHeight - 16) - 4;
        curveY[x] = y;

        // Peak hold decay
        if (!isFrozen) {
          if (norm >= peakHold[x]) {
            peakHold[x] = norm;
          } else {
            peakHold[x] = Math.max(0, peakHold[x] * 0.985 - 0.002);
          }
        }

        // Band aggregation
        for (let b = 0; b < FREQUENCY_BANDS.length; b++) {
          if (freq >= FREQUENCY_BANDS[b].minFreq && freq <= FREQUENCY_BANDS[b].maxFreq) {
            bandSums[b] += norm;
            bandCounts[b]++;
            break;
          }
        }

        // Generate Waterfall Slice Pixels
        const [pr, pg, pb, pa] = getPaletteColor(theme, val);
        for (let row = 0; row < 2; row++) {
          const pIdx = (row * wFloor + x) * 4;
          imgData[pIdx] = pr;
          imgData[pIdx + 1] = pg;
          imgData[pIdx + 2] = pb;
          imgData[pIdx + 3] = pa;
        }
      }

      // Draw newest slice at top of waterfall section
      if (isPlaying && !isFrozen) {
        ctx.putImageData(
          sliceImg,
          0,
          Math.floor(spectrumHeight * dpr)
        );
      }

      // 5. Draw Spectrum Fill Gradient & Line
      if (wFloor > 1) {
        // Subtle glow under curve
        const grad = ctx.createLinearGradient(0, 0, 0, spectrumHeight);
        if (theme === "obsidian") {
          grad.addColorStop(0, "rgba(245, 183, 61, 0.45)");
          grad.addColorStop(0.7, "rgba(217, 119, 6, 0.15)");
          grad.addColorStop(1, "rgba(217, 119, 6, 0.0)");
        } else if (theme === "cyberpunk") {
          grad.addColorStop(0, "rgba(6, 182, 212, 0.45)");
          grad.addColorStop(0.7, "rgba(168, 85, 247, 0.15)");
          grad.addColorStop(1, "rgba(168, 85, 247, 0.0)");
        } else if (theme === "heat") {
          grad.addColorStop(0, "rgba(239, 68, 68, 0.45)");
          grad.addColorStop(0.7, "rgba(245, 158, 11, 0.15)");
          grad.addColorStop(1, "rgba(245, 158, 11, 0.0)");
        } else {
          grad.addColorStop(0, "rgba(34, 197, 94, 0.45)");
          grad.addColorStop(0.7, "rgba(20, 83, 45, 0.15)");
          grad.addColorStop(1, "rgba(20, 83, 45, 0.0)");
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, spectrumHeight);
        for (let x = 0; x < wFloor; x++) {
          ctx.lineTo(x, curveY[x]);
        }
        ctx.lineTo(wFloor - 1, spectrumHeight);
        ctx.closePath();
        ctx.fill();

        // Stroke the curve line
        ctx.strokeStyle =
          theme === "obsidian"
            ? "#f5b73d"
            : theme === "cyberpunk"
            ? "#06b6d4"
            : theme === "heat"
            ? "#fbbf24"
            : "#4ade80";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, curveY[0]);
        for (let x = 1; x < wFloor; x++) {
          ctx.lineTo(x, curveY[x]);
        }
        ctx.stroke();

        // 6. Draw Peak Hold Dots
        if (showPeaks) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
          for (let x = 0; x < wFloor; x += 3) {
            const pNorm = peakHold[x];
            if (pNorm > 0.05) {
              const pY = spectrumHeight - pNorm * (spectrumHeight - 16) - 4;
              ctx.fillRect(x, pY - 1, 2, 2);
            }
          }
        }
      }

      // Record peak frequency
      if (maxVal > 20) {
        const pNote = frequencyToNoteName(maxFreq);
        const pDb = Math.round(((maxVal / 255) * 90 - 90) * 10) / 10;
        peakFreqRef.current = {
          freq: Math.round(maxFreq * 10) / 10,
          note: pNote.fullNote,
          db: pDb,
        };
      }

      // Update band energy states periodically (for UI gauges)
      const calculatedBands = bandSums.map((sum, i) => {
        const count = bandCounts[i] || 1;
        return Math.min(100, Math.round((sum / count) * 100));
      });
      setBandEnergies(calculatedBands);

      // 7. Draw Divider Line Between Spectrum and Waterfall
      ctx.strokeStyle = "rgba(245, 183, 61, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, spectrumHeight);
      ctx.lineTo(width, spectrumHeight);
      ctx.stroke();

      ctx.restore();
    };

    render();

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyser, isPlaying, theme, isFrozen, showPeaks]);

  // Handle Mouse Move over Canvas to extract inspection details
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const freq = Math.round(xToFrequency(x, 20, 20000, width) * 10) / 10;
    const noteInfo = frequencyToNoteName(freq);
    const band = getFrequencyBandInfo(freq);

    const binCount = analyser ? analyser.frequencyBinCount : 1024;
    const sampleRate = analyser?.context?.sampleRate || 44100;
    const bin = Math.min(
      binCount - 1,
      Math.max(0, Math.round((freq / (sampleRate / 2)) * binCount))
    );

    let db = -90;
    if (analyser) {
      const data = new Uint8Array(binCount);
      analyser.getByteFrequencyData(data);
      const val = data[bin] || 0;
      db = Math.round(((val / 255) * 90 - 90) * 10) / 10;
    }

    setHoverInfo({
      x,
      freq,
      db,
      note: `${noteInfo.note}${noteInfo.octave}`,
      cents: noteInfo.cents,
      bandName: isZh ? band.nameZh : band.nameEn,
      bandColor: band.color,
    });
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full flex flex-col bg-[#050609] border border-line-subtle rounded-xl overflow-hidden select-none ${className}`}
    >
      {/* Canvas viewport */}
      <div className="relative w-full h-64 sm:h-72 cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full block"
        />

        {/* Live Peak Readout Pill (Top Right) */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-2 bg-[#0d0e14]/85 backdrop-blur-md px-2.5 py-1 rounded-md border border-line-subtle text-[11px] font-['JetBrains_Mono'] pointer-events-none shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-text-sub">{isZh ? "峰值:" : "PEAK:"}</span>
          <span className="text-accent font-bold">
            {peakFreqRef.current.freq > 0 ? `${peakFreqRef.current.freq} Hz` : "--"}
          </span>
          <span className="text-text-dim">|</span>
          <span className="text-white font-medium">{peakFreqRef.current.note}</span>
          <span className="text-text-sub text-[10px]">
            {peakFreqRef.current.freq > 0 ? `${peakFreqRef.current.db} dB` : ""}
          </span>
        </div>

        {/* Hover Crosshair Info Tooltip */}
        {hoverInfo && (
          <div
            className="absolute top-10 pointer-events-none z-20 flex flex-col bg-[#0f1118]/95 backdrop-blur-md px-2.5 py-1.5 rounded-md border text-[11px] font-['JetBrains_Mono'] shadow-2xl transition-transform"
            style={{
              borderColor: hoverInfo.bandColor,
              left: `${Math.min(
                Math.max(hoverInfo.x - 70, 8),
                (containerRef.current?.clientWidth || 400) - 150
              )}px`,
            }}
          >
            <div className="flex items-center justify-between gap-3 text-white font-bold">
              <span>{hoverInfo.freq} Hz</span>
              <span style={{ color: hoverInfo.bandColor }}>{hoverInfo.note}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-text-dim text-[10px] mt-0.5">
              <span>{hoverInfo.bandName}</span>
              <span>{hoverInfo.db} dBFS</span>
            </div>
          </div>
        )}
      </div>

      {/* 7 Acoustic Frequency Bands Strip */}
      {showBandsBar && (
        <div className="w-full bg-[#0a0c12] border-t border-line-subtle px-3 py-2 grid grid-cols-7 gap-1.5 text-center">
          {FREQUENCY_BANDS.map((band, idx) => {
            const energy = bandEnergies[idx] || 0;
            return (
              <div
                key={band.bandId}
                className="flex flex-col items-center gap-1 bg-[#10121a] py-1 px-1 rounded border border-white/5"
                title={`${isZh ? band.nameZh : band.nameEn} (${band.rangeZh})\n${
                  isZh ? band.descriptionZh : band.descriptionEn
                }`}
              >
                <div className="flex items-center justify-between w-full px-1 text-[9px] font-['JetBrains_Mono'] text-text-sub">
                  <span className="truncate" style={{ color: band.color }}>
                    {band.nameEn}
                  </span>
                  <span className="text-[8px] text-text-dim">{energy}%</span>
                </div>
                {/* Micro Level Meter */}
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${energy}%`,
                      backgroundColor: band.color,
                      opacity: energy > 0 ? 0.9 : 0.2,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
