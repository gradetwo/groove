import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  compressorCurve,
  driveCurve,
  eqBandMarker,
  eqResponseCurve,
  hzToRatio,
  ratioToHz,
  type CurvePoint,
} from "../../audio/insertCurves";
import type { TrackInsertParams } from "../../data/trackInsert";

/**
 * The visual half of the effects-page redesign (item ①).
 *
 * Every curve here draws a transfer function computed from the **live parameters** (see
 * `insertCurves.ts`, which mirrors `ChannelStripDsp`). None of them is decorative: the EQ curve is
 * the frequency response of the enabled bands, the compressor curve is the same soft-knee
 * transfer the browser's compressor implements, and the drive curve is sampled from the exact
 * table that fills the `WaveShaperNode`.
 *
 * Rendered as inline SVG rather than canvas so it scales with the panel, stays crisp, and can be
 * asserted in tests by reading path data and marker positions.
 */

const EQ_DB_MIN = -18;
const EQ_DB_MAX = 18;

interface EqCurveViewProps {
  params: TrackInsertParams;
  sampleRate: number;
  /** Which band to emphasise (the one being edited), if any. */
  highlight?: "hpf" | "low" | "mid" | "high" | null;
  /** Called while a band handle is dragged: the new frequency and gain. */
  onBandChange?: (band: "hpf" | "low" | "mid" | "high", patch: { hz: number; gainDb?: number }) => void;
  disabled?: boolean;
  /** Distinguishes the instances that legitimately coexist (the HPF stage and the EQ block). */
  testIdSuffix?: string;
}

/** Bands that can be edited by dragging their handle, with the vertical range each one uses. */
const DRAGGABLE: Record<string, { gain: boolean }> = {
  hpf: { gain: false },
  low: { gain: true },
  mid: { gain: true },
  high: { gain: true },
};

export const EqCurveView: React.FC<EqCurveViewProps> = ({
  params,
  sampleRate,
  highlight = null,
  onBandChange,
  disabled = false,
  testIdSuffix = "",
}) => {
  const { t } = useLanguage();
  const W = 320;
  const H = 132;
  const PAD = 4;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrackInsertParams | null>(null);
  // While a handle is being dragged the view follows the draft, and the single commit happens on
  // release — the same "one gesture, one undo step" rule the piano roll follows.
  const view = draft ?? params;

  const curve = useMemo(() => eqResponseCurve(view, sampleRate, 220), [view, sampleRate]);
  const markers = useMemo(() => eqBandMarker(view), [view]);

  const xOf = (hz: number) => PAD + hzToRatio(hz) * (W - PAD * 2);
  const yOf = (db: number) => {
    const clamped = Math.min(Math.max(db, EQ_DB_MIN), EQ_DB_MAX);
    return PAD + ((EQ_DB_MAX - clamped) / (EQ_DB_MAX - EQ_DB_MIN)) * (H - PAD * 2);
  };

  const path = useMemo(
    () => curve.map((p: CurvePoint, i) => `${i === 0 ? "M" : "L"}${xOf(p.hz).toFixed(2)},${yOf(p.db).toFixed(2)}`).join(" "),
    [curve]
  );

  const readPointer = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const rx = (event.clientX - rect.left) / rect.width;
      const ry = (event.clientY - rect.top) / rect.height;
      const hz = ratioToHz((rx * W - PAD) / (W - PAD * 2));
      const db = EQ_DB_MAX - ((ry * H - PAD) / (H - PAD * 2)) * (EQ_DB_MAX - EQ_DB_MIN);
      return { hz, db };
    },
    [W, H]
  );

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging || !onBandChange) return;
    const point = readPointer(event);
    if (!point) return;
    const band = dragging as "hpf" | "low" | "mid" | "high";
    const spec = DRAGGABLE[band];
    if (!spec) return;
    const gainDb = Math.min(Math.max(point.db, EQ_DB_MIN), EQ_DB_MAX);
    setDraft((prev) => {
      const base = prev ?? params;
      if (band === "hpf") return { ...base, hpfHz: point.hz };
      if (band === "low") return { ...base, low: { ...base.low, hz: point.hz, gainDb } };
      if (band === "mid") return { ...base, mid: { ...base.mid, hz: point.hz, gainDb } };
      return { ...base, high: { ...base.high, hz: point.hz, gainDb } };
    });
  };

  const commitDrag = useCallback(() => {
    const band = dragging as "hpf" | "low" | "mid" | "high" | null;
    setDragging(null);
    if (!band || !draft || !onBandChange) {
      setDraft(null);
      return;
    }
    if (band === "hpf") onBandChange("hpf", { hz: draft.hpfHz });
    else if (band === "low") onBandChange("low", { hz: draft.low.hz, gainDb: draft.low.gainDb });
    else if (band === "mid") onBandChange("mid", { hz: draft.mid.hz, gainDb: draft.mid.gainDb });
    else onBandChange("high", { hz: draft.high.hz, gainDb: draft.high.gainDb });
    setDraft(null);
  }, [dragging, draft, onBandChange]);

  const stopDragging = commitDrag;

  useEffect(() => {
    if (!dragging) return;
    const up = () => commitDrag();
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [dragging, commitDrag]);

  return (
    <div className="rounded-lg border border-line bg-[#0f1116] p-1" data-testid={`insert-eq-curve${testIdSuffix}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-[132px] w-full touch-none select-none"
        role="img"
        aria-label={t("insert_curve_eq_aria")}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerLeave={stopDragging}
        data-disabled={disabled ? "true" : "false"}
      >
        {/* dB grid: ±6 and ±12 plus 0 dB, which is the line that matters. */}
        {[EQ_DB_MAX, 12, 6, 0, -6, -12, EQ_DB_MIN].map((db) => (
          <g key={db}>
            <line
              x1={PAD}
              x2={W - PAD}
              y1={yOf(db)}
              y2={yOf(db)}
              stroke={db === 0 ? "#4b5563" : "#22262e"}
              strokeWidth={db === 0 ? 1 : 0.75}
            />
            {(db === 12 || db === 0 || db === -12) && (
              <text x={PAD + 1} y={yOf(db) - 1.5} fontSize="6" fill="#6b7280">
                {db > 0 ? `+${db}` : db}
              </text>
            )}
          </g>
        ))}
        {/* Frequency grid at the decade marks. */}
        {[100, 1000, 10000].map((hz) => (
          <g key={hz}>
            <line x1={xOf(hz)} x2={xOf(hz)} y1={PAD} y2={H - PAD} stroke="#22262e" strokeWidth={0.75} />
            <text x={xOf(hz) + 1} y={H - PAD - 1} fontSize="6" fill="#6b7280">
              {hz >= 1000 ? `${hz / 1000}k` : hz}
            </text>
          </g>
        ))}

        {/* The response itself. */}
        <path
          d={path}
          fill="none"
          stroke="#f5b73d"
          strokeWidth={1.4}
          strokeLinejoin="round"
          data-testid={`insert-eq-curve-path${testIdSuffix}`}
        />

        {/* Band handles: draggable where a gain makes sense. */}
        {markers.map((marker) => {
          const cx = xOf(marker.hz);
          const cy = yOf(marker.gainDb);
          const emphasised = highlight === marker.id;
          return (
            <g key={marker.id} data-testid={`insert-eq-handle-${marker.id}${testIdSuffix}`}>
              <circle
                cx={cx}
                cy={cy}
                r={emphasised ? 4.4 : 3.4}
                fill={marker.enabled ? "#0f1116" : "#1b1f27"}
                stroke={marker.enabled ? (emphasised ? "#f5b73d" : "#8a939f") : "#3a3f49"}
                strokeWidth={emphasised ? 1.6 : 1}
                style={{ cursor: onBandChange && marker.enabled ? "grab" : "default" }}
                onPointerDown={(e) => {
                  if (disabled || !onBandChange || !marker.enabled) return;
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setDragging(marker.id);
                }}
              />
            </g>
          );
        })}
      </svg>
      <div className="px-1 pb-0.5 text-[9px] leading-tight text-text-dim">{t("insert_curve_eq_hint")}</div>
    </div>
  );
};

interface CompressorCurveViewProps {
  params: TrackInsertParams;
  /**
   * Reads the running compressor's gain reduction (dB, ≤ 0).
   *
   * Passed as a getter rather than a value on purpose: the meter polls it ~20×/s while the
   * transport runs, and a value prop would make the whole inspector (and the studio around it)
   * re-render at that rate. Polling inside this component keeps the churn to the bar itself.
   */
  getGainReductionDb?: () => number;
  isPlaying?: boolean;
}

export const CompressorCurveView: React.FC<CompressorCurveViewProps> = ({
  params,
  getGainReductionDb,
  isPlaying = false,
}) => {
  const { t } = useLanguage();
  const [gainReductionDb, setGainReductionDb] = useState(0);

  useEffect(() => {
    if (!getGainReductionDb) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      // ~20 Hz: fast enough to read as a meter, slow enough to stay off the critical path.
      if (now - last > 50) {
        last = now;
        setGainReductionDb(getGainReductionDb());
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getGainReductionDb]);
  const W = 240;
  const H = 132;
  const PAD = 6;
  const curve = useMemo(() => compressorCurve(params, 80), [params]);
  const { inputMinDb, inputMaxDb } = curve;

  const xOf = (db: number) => PAD + ((db - inputMinDb) / (inputMaxDb - inputMinDb)) * (W - PAD * 2);
  const yOf = (db: number) => PAD + ((inputMaxDb - db) / (inputMaxDb - inputMinDb)) * (H - PAD * 2);

  const path = curve.transfer.map(([x, y], i) => `${i === 0 ? "M" : "L"}${xOf(x).toFixed(2)},${yOf(y).toFixed(2)}`).join(" ");
  const identity = `M${xOf(inputMinDb).toFixed(2)},${yOf(inputMinDb).toFixed(2)} L${xOf(inputMaxDb).toFixed(2)},${yOf(inputMaxDb).toFixed(2)}`;
  const reduction = gainReductionDb;

  return (
    <div className="rounded-lg border border-line bg-[#0f1116] p-1" data-testid="insert-comp-curve">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[132px] w-full" role="img" aria-label={t("insert_curve_comp_aria")}>
        {/* Input/output axes, unit slope as the reference. */}
        <path d={identity} stroke="#2b3038" strokeWidth={1} strokeDasharray="3 3" fill="none" />
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#22262e" strokeWidth={1} />
        <line x1={PAD} x2={PAD} y1={PAD} y2={H - PAD} stroke="#22262e" strokeWidth={1} />
        {/* Threshold. */}
        <line
          x1={xOf(curve.thresholdDb)}
          x2={xOf(curve.thresholdDb)}
          y1={PAD}
          y2={H - PAD}
          stroke="#f5b73d"
          strokeWidth={0.8}
          strokeDasharray="2 2"
          data-testid="insert-comp-threshold-line"
        />
        {/* The transfer function. */}
        <path d={path} fill="none" stroke="#67e8f9" strokeWidth={1.4} data-testid="insert-comp-curve-path" />
        <text x={PAD + 2} y={PAD + 8} fontSize="6.5" fill="#6b7280">
          {t("insert_curve_comp_axes")}
        </text>
      </svg>
      <div className="flex items-center gap-2 px-1 pb-1">
        <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-text-dim">
          {t("insert_comp_reduction")}
        </span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#22262e]" data-testid="insert-comp-gr-track">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-cyan-400/80 transition-[width] duration-75"
            style={{ width: `${Math.min(100, (Math.abs(Math.min(0, reduction)) / 24) * 100)}%` }}
            data-testid="insert-comp-gr-bar"
            data-reduction-db={Math.min(0, reduction).toFixed(2)}
          />
        </div>
        <span className="w-11 text-right font-['JetBrains_Mono'] text-[10px] text-cyan-300" data-testid="insert-comp-gr-value">
          {isPlaying && reduction < -0.05 ? `${reduction.toFixed(1)} dB` : "0.0 dB"}
        </span>
      </div>
    </div>
  );
};

interface DriveCurveViewProps {
  params: TrackInsertParams;
}

export const DriveCurveView: React.FC<DriveCurveViewProps> = ({ params }) => {
  const { t } = useLanguage();
  const W = 240;
  const H = 132;
  const PAD = 6;
  const { pairs } = useMemo(() => driveCurve(params, 120), [params]);
  const xOf = (x: number) => PAD + ((x + 1) / 2) * (W - PAD * 2);
  const yOf = (y: number) => {
    // The drive table can exceed the unit square's lower half (1/k normalisation), so the view
    // scales to ±1 and clips the drawing rather than lying about the axis.
    const clamped = Math.min(Math.max(y, -1), 1);
    return PAD + ((1 - clamped) / 2) * (H - PAD * 2);
  };
  const path = pairs.map(([x, y], i) => `${i === 0 ? "M" : "L"}${xOf(x).toFixed(2)},${yOf(y).toFixed(2)}`).join(" ");
  const identity = `M${xOf(-1)},${yOf(-1)} L${xOf(1)},${yOf(1)}`;

  return (
    <div className="rounded-lg border border-line bg-[#0f1116] p-1" data-testid="insert-drive-curve">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[132px] w-full" role="img" aria-label={t("insert_curve_drive_aria")}>
        <path d={identity} stroke="#2b3038" strokeWidth={1} strokeDasharray="3 3" fill="none" />
        <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} stroke="#22262e" strokeWidth={0.75} />
        <line x1={W / 2} x2={W / 2} y1={PAD} y2={H - PAD} stroke="#22262e" strokeWidth={0.75} />
        <path d={path} fill="none" stroke="#fb7185" strokeWidth={1.4} data-testid="insert-drive-curve-path" />
      </svg>
      <div className="px-1 pb-0.5 text-[9px] leading-tight text-text-dim">{t("insert_curve_drive_hint")}</div>
    </div>
  );
};
