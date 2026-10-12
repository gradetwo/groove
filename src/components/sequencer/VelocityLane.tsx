import { trackColour, type TrackColourRole } from "../../utils/trackColours";
import React, { memo, useId, useRef, useState, useCallback, useEffect } from "react";
import { SequencerTrack } from "../../types/genre";
import { Sliders, Sparkles, TrendingUp, TrendingDown, X, Dices, Repeat, Clock } from "lucide-react";
import { triggerHaptic, HapticPatterns } from "../../utils/haptics";
import { useLanguage } from "../../i18n/LanguageContext";
import type { MessageKey } from "../../i18n/LanguageContext";
import { subscribePlayhead } from "../../features/sequencer/playheadBus";
import { LANE_SPECS, laneKeyboardIntent } from "../../features/sequencer/laneValues";

/**
 * The union lives in `src/features/sequencer/stepParameters.ts`; re-exported so existing importers
 * keep working. Imported as well as re-exported, because this component uses it in its own props.
 */
import type { ParameterDimension } from "../../features/sequencer/stepParameters";
export type { ParameterDimension };

/**
 * The parameter's own name, for the slider labels and the live region.
 *
 * The dimension buttons spell their own tooltips, but a screen reader needs the same word in the
 * rotating cursor's announcements, so the four names live in one map.
 */
const DIMENSION_LABEL_KEY: Record<ParameterDimension, MessageKey> = {
  velocity: "dim_velocity",
  gate: "dim_gate",
  probability: "dim_probability",
  ratchet: "dim_ratchet",
};

export interface VelocityLaneProps {
  tracks: SequencerTrack[];
  activeTrackIdx: number;
  dimension?: ParameterDimension;
  onSelectDimension?: (dim: ParameterDimension) => void;
  onSelectTrack: (trackIdx: number) => void;
  onUpdateVelocity: (trackIdx: number, stepIdx: number, newVel: number) => void;
  onBatchUpdateVelocity: (trackIdx: number, newVelocities: number[]) => void;
  onUpdateProbability?: (trackIdx: number, stepIdx: number, prob: number) => void;
  onBatchUpdateProbability?: (trackIdx: number, probs: number[]) => void;
  onUpdateRatchet?: (trackIdx: number, stepIdx: number, ratchet: number) => void;
  onBatchUpdateRatchet?: (trackIdx: number, ratchets: number[]) => void;
  onUpdateGate?: (trackIdx: number, stepIdx: number, gate: number) => void;
  onBatchUpdateGate?: (trackIdx: number, gates: number[]) => void;
  onClose: () => void;
  currentStep: number;
  isPlaying: boolean;
  language?: "zh" | "en";
  stepCount: number;
  stepsPerBar: number;
  groupSize: number;
  tracksConfig: Array<{ id: string; name: string; colourRole: TrackColourRole }>;
}

export const VelocityLane = memo<VelocityLaneProps>(function VelocityLane({
  tracks,
  activeTrackIdx,
  dimension = "velocity",
  onSelectDimension,
  onSelectTrack,
  onUpdateVelocity,
  onBatchUpdateVelocity,
  onUpdateProbability,
  onBatchUpdateProbability,
  onUpdateRatchet,
  onBatchUpdateRatchet,
  onUpdateGate,
  onBatchUpdateGate,
  onClose,
  currentStep,
  isPlaying,
  language: _propLanguage,
  stepCount,
  stepsPerBar,
  groupSize,
  tracksConfig,
}) {
  const { t } = useLanguage();
  const currentTrack = tracks[activeTrackIdx] || tracks[0];
  const meta = tracksConfig[activeTrackIdx % tracksConfig.length];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [localDimension, setLocalDimension] = useState<ParameterDimension>(dimension);

  /**
   * U10: the lane's keyboard cursor. Exactly one column is in the tab order at a time — sixteen tab
   * stops for one drawer is not a keyboard path, it is an obstacle course — and Up/Down edit the
   * column it is on (see `features/sequencer/laneValues.ts`).
   */
  const [laneCursor, setLaneCursor] = useState(0);
  const [laneAnnouncement, setLaneAnnouncement] = useState("");
  const laneHintId = useId();

  const activeDim = onSelectDimension ? dimension : localDimension;
  const laneSpec = LANE_SPECS[activeDim];
  const dimLabel = t(DIMENSION_LABEL_KEY[activeDim]);
  const switchDim = (d: ParameterDimension) => {
    setLocalDimension(d);
    onSelectDimension?.(d);
  };

  // Subscribe to playhead bus for real-time laser sync without re-rendering
  useEffect(() => {
    let lastStep = -1;
    return subscribePlayhead((step) => {
      if (!containerRef.current) return;
      if (lastStep >= 0) {
        const prevEl = containerRef.current.querySelector(`[data-step-idx="${lastStep}"]`);
        prevEl?.removeAttribute("data-playhead");
      }
      if (step >= 0) {
        const nextEl = containerRef.current.querySelector(`[data-step-idx="${step}"]`);
        nextEl?.setAttribute("data-playhead", "true");
      }
      lastStep = step;
    });
  }, []);

  // Values array for active track based on dimension
  const values = Array.from({ length: stepCount }, (_, i) => {
    const trackLen = currentTrack?.trackLength && currentTrack.trackLength > 0 ? currentTrack.trackLength : null;
    const activeIdx = trackLen ? i % trackLen : i;
    if (activeDim === "probability") {
      return currentTrack?.probability?.[i] !== undefined 
        ? currentTrack.probability[i] 
        : (currentTrack?.probability?.[activeIdx] !== undefined ? currentTrack.probability[activeIdx] : 100);
    }
    if (activeDim === "ratchet") {
      return currentTrack?.ratchet?.[i] !== undefined 
        ? currentTrack.ratchet[i] 
        : (currentTrack?.ratchet?.[activeIdx] !== undefined ? currentTrack.ratchet[activeIdx] : 1);
    }
    if (activeDim === "gate") {
      return currentTrack?.gate?.[i] !== undefined 
        ? currentTrack.gate[i] 
        : (currentTrack?.gate?.[activeIdx] !== undefined ? currentTrack.gate[activeIdx] : 0.8);
    }
    return currentTrack?.velocity?.[i] !== undefined 
      ? currentTrack.velocity[i] 
      : (currentTrack?.velocity?.[activeIdx] !== undefined ? currentTrack.velocity[activeIdx] : 100);
  });

  /**
   * Announces a line to the live region.
   *
   * Same trick as the roll's: `aria-live` only re-announces when the text *changes*, and nudging a
   * value into its ceiling produces the identical message twice in a row. Alternating a zero-width
   * space keeps the message identical to a reader while making the DOM text differ.
   */
  const announceLane = useCallback((text: string) => {
    setLaneAnnouncement((prev) => (prev.endsWith("\u200B") ? text : `${text}\u200B`));
  }, []);

  /** The one line a reader hears after a keypress: the column, its parameter, and the new value. */
  const describeLaneStep = useCallback(
    (index: number, value: number) =>
      t("vel_step_value", {
        step: index + 1,
        dimension: dimLabel,
        value: laneSpec.format(value),
      }),
    [t, dimLabel, laneSpec]
  );

  /**
   * Writes one column's value, whatever the dimension.
   *
   * The pointer and the keyboard both land here with a *value*: the pointer converts its 0..1 drag
   * ratio through the dimension's scale first (`laneValues.ts`), so a drag and a keypress are one
   * edit through one switch, and the four callbacks stay in a single place.
   */
  const commitLaneValue = useCallback(
    (stepIdx: number, value: number) => {
      if (activeDim === "probability") {
        onUpdateProbability?.(activeTrackIdx, stepIdx, value);
      } else if (activeDim === "ratchet") {
        onUpdateRatchet?.(activeTrackIdx, stepIdx, value);
      } else if (activeDim === "gate") {
        onUpdateGate?.(activeTrackIdx, stepIdx, value);
      } else {
        onUpdateVelocity(activeTrackIdx, stepIdx, value);
      }
    },
    [activeDim, activeTrackIdx, onUpdateVelocity, onUpdateProbability, onUpdateRatchet, onUpdateGate]
  );

  const commitValue = useCallback(
    (stepIdx: number, rawRatio: number) => {
      const ratio = Math.max(0, Math.min(1, rawRatio));
      commitLaneValue(stepIdx, LANE_SPECS[activeDim].ratioToValue(ratio));
    },
    [activeDim, commitLaneValue]
  );

  const updateFromPointer = useCallback(
    (e: React.PointerEvent | PointerEvent, stepIdx: number, targetRect: DOMRect) => {
      const clientY = e.clientY;
      const bottom = targetRect.bottom;
      const height = targetRect.height;
      const ratio = (bottom - clientY) / height;
      commitValue(stepIdx, ratio);
    },
    [commitValue]
  );

  const handlePointerDown = (stepIdx: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsPainting(true);
    triggerHaptic(HapticPatterns.slider);
    const rect = e.currentTarget.getBoundingClientRect();
    updateFromPointer(e, stepIdx, rect);
  };

  const handlePointerEnter = (stepIdx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPainting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    updateFromPointer(e, stepIdx, rect);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!element) return;
    const stepEl = element.closest("[data-step-idx]") as HTMLElement | null;
    if (stepEl && stepEl.dataset.stepIdx !== undefined) {
      const idx = parseInt(stepEl.dataset.stepIdx, 10);
      const rect = stepEl.getBoundingClientRect();
      const clientY = touch.clientY;
      const bottom = rect.bottom;
      const height = rect.height;
      const ratio = (bottom - clientY) / height;
      commitValue(idx, ratio);
    }
  };

  /** Moves DOM focus with the cursor, so the roving tab stop follows the arrow keys. */
  const focusColumn = useCallback((index: number) => {
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-step-idx="${index}"]`)
      ?.focus();
  }, []);

  /**
   * Keyboard editing on the lane.
   *
   * The lane is one tab stop whose cursor is a column, not sixteen tab stops: Up/Down edit the
   * value under the cursor (the faders are vertical, which is what `aria-orientation` says) and
   * Left/Right move the cursor, focusing the column that moved. Keys the lane does not own — Tab,
   * ⌘/Ctrl combinations, Enter, Delete, letters — are left completely alone, because this drawer is
   * one panel of a larger app and the shortcuts around it have to keep working.
   */
  const handleLaneKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      /**
       * The focused column owns the keypress.
       *
       * Reading the index off the event rather than trusting `laneCursor` keeps one invariant: the
       * column the user can see a focus ring on is the column the arrow key edits. The two can only
       * disagree if focus moved without this component hearing about it, and then the DOM is right.
       */
      const targetEl = (event.target as HTMLElement | null)?.closest?.("[data-step-idx]") as
        | HTMLElement
        | null;
      const fromDom = targetEl?.dataset.stepIdx !== undefined ? Number(targetEl.dataset.stepIdx) : NaN;
      const index = Number.isFinite(fromDom) ? fromDom : laneCursor;
      const value = values[index] ?? laneSpec.preset;
      if (index !== laneCursor) setLaneCursor(index);

      const intent = laneKeyboardIntent(
        event.key,
        { shift: event.shiftKey, meta: event.metaKey, ctrl: event.ctrlKey },
        index,
        value,
        laneSpec,
        { count: values.length }
      );
      if (!intent) return;
      event.preventDefault();
      event.stopPropagation();

      if (intent.kind === "cursor") {
        setLaneCursor(intent.index);
        focusColumn(intent.index);
        announceLane(describeLaneStep(intent.index, values[intent.index] ?? laneSpec.preset));
        return;
      }

      commitLaneValue(index, intent.value);
      announceLane(describeLaneStep(index, intent.value));
    },
    [
      laneCursor,
      laneSpec,
      values,
      commitLaneValue,
      focusColumn,
      announceLane,
      describeLaneStep,
    ]
  );

  useEffect(() => {
    const handleGlobalPointerUp = () => setIsPainting(false);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => window.removeEventListener("pointerup", handleGlobalPointerUp);
  }, []);

  // Preset Handlers tailored to active dimension
  const handlePresetReset = () => {
    if (activeDim === "probability") {
      onBatchUpdateProbability?.(activeTrackIdx, new Array(stepCount).fill(100));
    } else if (activeDim === "ratchet") {
      onBatchUpdateRatchet?.(activeTrackIdx, new Array(stepCount).fill(1));
    } else if (activeDim === "gate") {
      onBatchUpdateGate?.(activeTrackIdx, new Array(stepCount).fill(0.8));
    } else {
      onBatchUpdateVelocity(activeTrackIdx, new Array(stepCount).fill(100));
    }
  };

  const handlePresetAccent = () => {
    if (activeDim === "probability") {
      const updated = values.map((_, i) => (i % 4 === 0 ? 100 : 70));
      onBatchUpdateProbability?.(activeTrackIdx, updated);
    } else if (activeDim === "ratchet") {
      const updated = values.map((_, i) => (i % 8 === 7 ? 4 : i % 4 === 3 ? 2 : 1));
      onBatchUpdateRatchet?.(activeTrackIdx, updated);
    } else if (activeDim === "gate") {
      const updated = values.map((_, i) => (i % 4 === 0 ? 1.4 : 0.6));
      onBatchUpdateGate?.(activeTrackIdx, updated);
    } else {
      const updated = values.map((_, i) => (i % 4 === 0 ? 122 : 90));
      onBatchUpdateVelocity(activeTrackIdx, updated);
    }
  };

  const handlePresetRampUp = () => {
    if (activeDim === "probability") {
      const updated = values.map((_, i) => Math.round(30 + (i / (stepCount - 1 || 1)) * 70));
      onBatchUpdateProbability?.(activeTrackIdx, updated);
    } else if (activeDim === "ratchet") {
      const updated = values.map((_, i) => (i < stepCount / 2 ? 1 : 2));
      onBatchUpdateRatchet?.(activeTrackIdx, updated);
    } else if (activeDim === "gate") {
      const updated = values.map((_, i) => Math.round((0.3 + (i / (stepCount - 1 || 1)) * 1.4) * 10) / 10);
      onBatchUpdateGate?.(activeTrackIdx, updated);
    } else {
      const updated = values.map((_, i) => Math.round(40 + (i / (stepCount - 1 || 1)) * 85));
      onBatchUpdateVelocity(activeTrackIdx, updated);
    }
  };

  const handlePresetRampDown = () => {
    if (activeDim === "probability") {
      const updated = values.map((_, i) => Math.round(100 - (i / (stepCount - 1 || 1)) * 70));
      onBatchUpdateProbability?.(activeTrackIdx, updated);
    } else if (activeDim === "ratchet") {
      const updated = values.map((_, i) => (i < stepCount / 2 ? 2 : 1));
      onBatchUpdateRatchet?.(activeTrackIdx, updated);
    } else if (activeDim === "gate") {
      const updated = values.map((_, i) => Math.round((1.7 - (i / (stepCount - 1 || 1)) * 1.4) * 10) / 10);
      onBatchUpdateGate?.(activeTrackIdx, updated);
    } else {
      const updated = values.map((_, i) => Math.round(125 - (i / (stepCount - 1 || 1)) * 85));
      onBatchUpdateVelocity(activeTrackIdx, updated);
    }
  };

  const handlePresetHumanize = () => {
    if (activeDim === "probability") {
      const updated = values.map(() => Math.round(40 + Math.random() * 60));
      onBatchUpdateProbability?.(activeTrackIdx, updated);
    } else if (activeDim === "ratchet") {
      const updated = values.map(() => (Math.random() > 0.7 ? 2 : 1));
      onBatchUpdateRatchet?.(activeTrackIdx, updated);
    } else if (activeDim === "gate") {
      const updated = values.map((g) => Math.max(0.2, Math.min(1.8, Math.round((g + (Math.random() - 0.5) * 0.4) * 10) / 10)));
      onBatchUpdateGate?.(activeTrackIdx, updated);
    } else {
      const updated = values.map((v) => {
        const jitter = Math.round((Math.random() - 0.5) * 24);
        return Math.max(20, Math.min(127, v + jitter));
      });
      onBatchUpdateVelocity(activeTrackIdx, updated);
    }
  };

  // Label and bar geometry come from the dimension's scale (`laneValues.ts`), so the keyboard, the
  // drag and the drawing cannot disagree about what 100 means.
  const formatValue = (val: number) => laneSpec.format(val);
  const getHeightPercent = (val: number) => laneSpec.heightPercent(val);

  return (
    <div className="bg-[#0e1014] border-t border-line p-3 sm:p-4 rounded-b-2xl select-none animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1c1e26]">
        {/* Dimension Tabs & Track Selector */}
        <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 scrollbar-none">
          {/* Dimension Selector (P3-03) */}
          <div className="flex items-center bg-[#14161f] p-0.5 rounded-lg border border-line-subtle mr-2 shrink-0">
            <button
              type="button"
              onClick={() => switchDim("velocity")}
              className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors flex items-center gap-1 ${
                activeDim === "velocity" ? "bg-accent text-black shadow-sm" : "text-text-dim hover:text-text"
              }`}
              title="Edit Velocity (力度)"
            >
              <Sliders className="w-3 h-3" />
              <span>Vel</span>
            </button>
            <button
              type="button"
              onClick={() => switchDim("gate")}
              className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors flex items-center gap-1 ${
                activeDim === "gate" ? "bg-accent text-black shadow-sm" : "text-text-dim hover:text-text"
              }`}
              title="Edit Gate Duration (音长)"
            >
              <Clock className="w-3 h-3" />
              <span>Gate</span>
            </button>
            <button
              type="button"
              onClick={() => switchDim("probability")}
              className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors flex items-center gap-1 ${
                activeDim === "probability" ? "bg-accent text-black shadow-sm" : "text-text-dim hover:text-text"
              }`}
              title="Edit Probability (概率)"
            >
              <Dices className="w-3 h-3" />
              <span>Prob</span>
            </button>
            <button
              type="button"
              onClick={() => switchDim("ratchet")}
              className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors flex items-center gap-1 ${
                activeDim === "ratchet" ? "bg-accent text-black shadow-sm" : "text-text-dim hover:text-text"
              }`}
              title="Edit Ratchet (滚奏)"
            >
              <Repeat className="w-3 h-3" />
              <span>Roll</span>
            </button>
          </div>

          {/* Track Selector Tabs */}
          <div className="flex items-center gap-1 shrink-0">
            {tracks.map((tItem, idx) => {
              const trackMeta = tracksConfig[idx % tracksConfig.length];
              const isSelected = idx === activeTrackIdx;
              return (
                <button
                  key={tItem.track_id}
                  onClick={() => onSelectTrack(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-['JetBrains_Mono'] font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
                    isSelected
                      ? "bg-[#181a22] text-[#f0ede6] shadow-[0_0_10px_rgba(0,0,0,0.5)] scale-105"
                      : "bg-bg text-text-dim border-[#1e212b] hover:text-text"
                  }`}
                  style={{
                    borderColor: isSelected ? trackColour(trackMeta.colourRole) : undefined,
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: trackColour(trackMeta.colourRole) }} />
                  <span>{trackMeta.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Shape Presets & Close */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={handlePresetReset}
            className="px-2 py-1 rounded bg-[#151720] border border-line hover:border-[#3a3e48] text-text-sub hover:text-text text-[11px] font-mono transition-colors"
            title="Reset to default value"
          >
            {activeDim === "gate" ? "80%" : activeDim === "ratchet" ? "1x" : "100"}
          </button>
          <button
            onClick={handlePresetAccent}
            className="px-2 py-1 rounded bg-[#151720] border border-line hover:border-[#3a3e48] text-text-sub hover:text-text text-[11px] font-mono transition-colors"
            title="Accent Downbeats"
          >
            Accent
          </button>
          <button
            type="button"
            onClick={handlePresetRampUp}
            className="p-1 rounded bg-[#151720] border border-line hover:border-[#3a3e48] text-text-sub hover:text-text transition-colors"
            title="Ramp Up"
            aria-label="Ramp Up"
          >
            <TrendingUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handlePresetRampDown}
            className="p-1 rounded bg-[#151720] border border-line hover:border-[#3a3e48] text-text-sub hover:text-text transition-colors"
            title="Ramp Down"
            aria-label="Ramp Down"
          >
            <TrendingDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handlePresetHumanize}
            className="px-2 py-1 rounded bg-[#151720] border border-line hover:border-[#3a3e48] text-text-sub hover:text-text text-[11px] font-mono transition-colors flex items-center gap-1"
            title="Humanize / Jitter"
          >
            <Sparkles className="w-3 h-3 text-[#45e0c9]" />
            <span>Jitter</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[#20222a] text-text-sub hover:text-[#ff5964] transition-colors ml-1"
            title={t("vel_close")}
            aria-label={t("vel_close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Interactive Parameter Slider Columns */}
      <div className="pt-3 flex items-center gap-3 overflow-x-auto min-w-max pb-1">
        {/* Left Track Label Space aligned with matrix headers. Shares `--trk-head-w` with
            the ruler label and the track headers; it was hardcoded to 126 px, a third
            disagreeing width for the same frozen column. */}
        <div className="w-[var(--trk-head-w)] flex-none text-right pr-2 sm:pr-3 font-mono text-[11px] text-text-dim">
          <span className="font-bold text-text">{meta.name}</span>
          <span className="block text-[10px] text-accent uppercase font-bold">
            {activeDim}
          </span>
          <span className="block text-[9.5px] text-text-dim">
            {t("vel_drag_hint")}
          </span>
        </div>

        {/* Step Parameter Bar Grid */}
        <div 
          ref={containerRef} 
          onTouchMove={handleTouchMove}
          role="group"
          aria-label={t("vel_lane_group")}
          aria-describedby={laneHintId}
          onKeyDown={handleLaneKeyDown}
          className="flex-1 flex gap-1 items-end h-24 sm:h-28 bg-[#090a0d] p-2 rounded-xl border border-[#1a1c22] touch-none"
        >
          <p id={laneHintId} className="sr-only">
            {t("vel_kb_hint")}
          </p>
          <div role="status" aria-live="polite" className="sr-only">
            {laneAnnouncement}
          </div>
          {values.map((val, stepIdx) => {
            const trackLen = currentTrack?.trackLength && currentTrack.trackLength > 0 ? currentTrack.trackLength : stepCount;
            const activeStepIdx = trackLen > 0 ? stepIdx % trackLen : stepIdx;
            const stepVal = currentTrack?.steps?.[stepIdx] !== undefined 
              ? currentTrack.steps[stepIdx] 
              : (currentTrack?.steps?.[activeStepIdx] || 0);
            const isOn = stepVal > 0;
            const isOutsideLoop = stepIdx >= (currentTrack?.steps?.length || stepCount);
            const isLoopedRepeat = currentTrack?.trackLength !== undefined && currentTrack.trackLength > 0 && currentTrack.trackLength < stepCount && stepIdx >= currentTrack.trackLength;
            const isPlayhead = isPlaying && (currentStep === stepIdx);
            const isBarStart = stepIdx % stepsPerBar === 0 && stepIdx !== 0;
            const isGroupStart = stepIdx % groupSize === 0 && stepIdx !== 0;
            const heightPercent = getHeightPercent(val);
            const isHighlighted = activeDim === "velocity" ? val >= 115 : activeDim === "probability" ? val === 100 : activeDim === "ratchet" ? val > 1 : val >= 1.0;

            return (
              <div
                key={stepIdx}
                data-step-idx={stepIdx}
                data-testid={`vel-step-${stepIdx}`}
                role="slider"
                aria-orientation="vertical"
                aria-label={t("vel_step_aria", { step: stepIdx + 1, dimension: dimLabel })}
                aria-valuemin={laneSpec.min}
                aria-valuemax={laneSpec.max}
                aria-valuenow={val}
                aria-valuetext={laneSpec.format(val)}
                tabIndex={stepIdx === laneCursor ? 0 : -1}
                onFocus={() => setLaneCursor(stepIdx)}
                onPointerDown={(e) => {
                  setLaneCursor(stepIdx);
                  handlePointerDown(stepIdx, e);
                }}
                onPointerEnter={(e) => handlePointerEnter(stepIdx, e)}
                className={`min-w-[28px] sm:min-w-[32px] flex-1 h-full flex flex-col justify-end items-center relative cursor-ns-resize group select-none touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset focus-visible:rounded-sm [&[data-playhead=true]]:ring-1 [&[data-playhead=true]]:ring-white [&[data-playhead=true]_.vel-tooltip]:opacity-100 ${
                  isBarStart ? "ml-3 sm:ml-4 border-l border-[#3a3e48]" : isGroupStart ? "ml-1.5 sm:ml-2" : ""
                }`}
              >
                {/* Numeric readout tooltip on hover or playhead */}
                <div
                  className={`vel-tooltip absolute -top-5 font-mono text-[9px] font-bold px-1 rounded transition-opacity pointer-events-none z-20 ${
                    isPlayhead
                      ? "opacity-100 bg-accent text-black"
                      : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 bg-line text-text"
                  }`}
                >
                  {formatValue(val)}
                </div>

                {/* Background Track Guide Line */}
                <div className="w-full h-full absolute inset-0 rounded bg-[#12141a]/60 pointer-events-none" />

                {/* Vertical Bar Column */}
                <div
                  className={`w-full rounded-t-sm transition-all duration-75 relative z-10 ${
                    isOn
                      ? isHighlighted
                        ? "shadow-[0_0_10px_var(--tc)]"
                        : isLoopedRepeat
                        ? "opacity-80"
                        : "opacity-90"
                      : "opacity-25"
                  } ${isPlayhead ? "ring-1 ring-white" : ""}`}
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor: trackColour(meta.colourRole),
                    ["--tc" as any]: trackColour(meta.colourRole),
                  }}
                >
                  {/* Top LED pip */}
                  <span className={`w-full h-1 block rounded-t-sm ${isHighlighted ? "bg-white" : "bg-white/40"}`} />
                </div>

                {/* Step index subscript */}
                <span className="font-mono text-[8px] text-text-dim mt-1 pointer-events-none">
                  {stepIdx + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
