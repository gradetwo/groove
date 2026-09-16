import React, { memo } from "react";
import { midiToNoteName } from "./PitchPickerModal";
import { CHORD_BASE_GATE } from "../../audio/chordVoicing";

export interface StepCellProps {
  trackIdx: number;
  stepIdx: number;
  stepVal: number;
  velocity: number;
  isAcc: boolean;
  isHatRound: boolean;
  isHatTriplet: boolean;
  ratchet: number;
  prob: number;
  isMelodic: boolean;
  midiNote?: number | null;
  gate?: number;
  /**
   * Chord tracks only: the genre's articulation multiplier on the base note length
   * (1 = the historical `block` default). `undefined` means "this role's length is just `gate`".
   */
  articulationGateScale?: number;
  /** Chord tracks only: localized articulation name, used for the length tooltip. */
  articulationLabel?: string;
  isOutsideLoop: boolean;
  isPlayhead: boolean;
  isBarStart: boolean;
  isGroupStart: boolean;
  trackColor: string;
  onClick?: (trackIdx: number, stepIdx: number, e: React.MouseEvent) => void;
  onContextMenu?: (trackIdx: number, stepIdx: number, e: React.MouseEvent) => void;
  onPointerDown?: (trackIdx: number, stepIdx: number, e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  onPointerEnter?: (trackIdx: number, stepIdx: number) => void;
}

export const StepCell = memo<StepCellProps>(function StepCell({
  trackIdx,
  stepIdx,
  stepVal,
  velocity,
  isAcc,
  isHatRound,
  isHatTriplet,
  ratchet,
  prob,
  isMelodic,
  midiNote,
  gate,
  isOutsideLoop,
  isPlayhead,
  isBarStart,
  isGroupStart,
  trackColor,
  articulationGateScale,
  articulationLabel,
  onClick,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerEnter,
}) {
  const isOn = stepVal > 0;

  /**
   * Effective note length as a fraction of one step.
   *
   * For chord tracks the genre decides how long a chord rings: the engine plays
   * `stepDur × gate × CHORD_BASE_GATE × articulation.gateScale`, and the articulation table
   * spans 0.3× (stab) to 3.0× (sustain). The bar used to draw the raw `gate` — which is 0.8 for
   * every genre's defaults — so the studio showed the same one-cell note for a funk stab and an
   * ambient pad. That is the "chord lengths never change" report; this makes the length visible.
   */
  const effectiveStepFraction =
    articulationGateScale === undefined ? (gate ?? 0.8) : (gate ?? 0.8) * CHORD_BASE_GATE * articulationGateScale;
  const lengthBarVisible = isOn && !isOutsideLoop && (gate !== 0.8 || articulationGateScale !== undefined);
  const ringsPastStep = articulationGateScale !== undefined && effectiveStepFraction > 1.02;
  const lengthBarTitle = articulationLabel
    ? `${articulationLabel} · ${effectiveStepFraction.toFixed(2)} × step`
    : undefined;
  // Rounded to a tenth of a percent: `0.8 × 1.5 × 0.3` lands on 36.00000000000001 otherwise.
  const lengthBarWidthPct = Math.round(Math.min(100, Math.max(8, effectiveStepFraction * 100)) * 10) / 10;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const parentGrid = e.currentTarget.closest('[role="grid"]');
    let targetTrack = trackIdx;
    let targetStep = stepIdx;
    let handled = false;

    switch (e.key) {
      case "ArrowRight":
        targetStep = stepIdx + 1;
        handled = true;
        break;
      case "ArrowLeft":
        targetStep = Math.max(0, stepIdx - 1);
        handled = true;
        break;
      case "ArrowDown":
        targetTrack = trackIdx + 1;
        handled = true;
        break;
      case "ArrowUp":
        targetTrack = Math.max(0, trackIdx - 1);
        handled = true;
        break;
      case "Home":
        targetStep = 0;
        handled = true;
        break;
      case "End":
        if (parentGrid) {
          const cellsInRow = parentGrid.querySelectorAll(`[data-track-idx="${trackIdx}"]`);
          if (cellsInRow.length > 0) targetStep = cellsInRow.length - 1;
        }
        handled = true;
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        onClick?.(trackIdx, stepIdx, e as any);
        return;
      default:
        return;
    }

    if (handled && parentGrid) {
      e.preventDefault();
      const targetEl = parentGrid.querySelector<HTMLElement>(
        `[data-track-idx="${targetTrack}"][data-step-idx="${targetStep}"]`
      );
      if (targetEl) {
        targetEl.focus();
      }
    }
  };

  return (
    <div
      role="gridcell"
      tabIndex={0}
      aria-selected={isOn}
      aria-label={`Track ${trackIdx + 1} Step ${stepIdx + 1}, ${isOn ? "Active" : "Empty"}`}
      data-track-idx={trackIdx}
      data-step-idx={stepIdx}
      onClick={onClick ? (e) => onClick(trackIdx, stepIdx, e) : undefined}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu ? (e) => onContextMenu(trackIdx, stepIdx, e) : undefined}
      onPointerDown={onPointerDown ? (e) => onPointerDown(trackIdx, stepIdx, e) : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={onPointerEnter ? () => onPointerEnter(trackIdx, stepIdx) : undefined}
      className={`min-w-[28px] sm:min-w-[36px] flex-1 h-10 sm:h-10 landscape-compact-cell border cursor-pointer relative transition-all duration-75 select-none touch-action-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-20 ${
        isBarStart
          ? "ml-3.5 sm:ml-4.5 border-l-2 border-l-[#f5b73d]/70"
          : isGroupStart
          ? "ml-2 sm:ml-2.5 border-l border-[#3a3e48]"
          : ""
      } ${
        isHatRound ? "rounded-full" : "rounded-md"
      } ${
        isOutsideLoop
          ? "opacity-25 bg-[#0e0f13] border-[#181920] cursor-not-allowed"
          : isOn
          ? "border-transparent shadow-[inset_0_1px_2px_rgba(0,0,0,0.4),0_0_10px_var(--tc)]"
          : "bg-[#141519] border-[#22242c] hover:border-[#383c48] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
      }`}
      style={{
        backgroundColor: !isOutsideLoop && isOn ? trackColor : undefined,
        opacity: isOutsideLoop ? 0.25 : isOn ? 0.45 + (velocity / 127) * 0.55 : 1,
        ["--tc" as any]: trackColor,
      }}
    >
      {/* Tactile hardware bevel specular acrylic highlight */}
      {isOn && !isOutsideLoop && (
        <span
          className={`absolute inset-0 pointer-events-none ${isHatRound ? "rounded-full" : "rounded-md"}`}
          style={{
            background: isAcc
              ? "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.1) 50%, transparent 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 45%)",
          }}
        />
      )}

      {/* Accent LED pip */}
      {isOn && isAcc && !isOutsideLoop && (
        <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#ffffff] pointer-events-none" />
      )}

      {/* Ratchet division tick marks and badge */}
      {isOn && ratchet > 1 && !isOutsideLoop && (
        <>
          <div className="absolute inset-0 flex pointer-events-none">
            {Array.from({ length: ratchet - 1 }).map((_, rIdx) => (
              <div
                key={rIdx}
                className="h-full border-r border-black/40"
                style={{ width: `${100 / ratchet}%` }}
              />
            ))}
          </div>
          <span className="absolute bottom-0.5 right-0.5 px-0.5 rounded text-[7px] font-['JetBrains_Mono'] font-black bg-black/70 text-text leading-none pointer-events-none">
            {ratchet}x
          </span>
        </>
      )}

      {/* Probability badge */}
      {isOn && prob < 100 && !isOutsideLoop && (
        <span className="absolute top-0.5 right-0.5 px-0.5 rounded text-[7px] font-['JetBrains_Mono'] font-bold bg-accent/90 text-black leading-none pointer-events-none">
          {prob}%
        </span>
      )}

      {/* Melodic note name readout */}
      {isOn && isMelodic && typeof midiNote === "number" && midiNote > 0 && !isOutsideLoop && (
        <span className="absolute inset-x-0 bottom-0.5 text-center font-['JetBrains_Mono'] text-[8px] font-extrabold text-[#0a0b0d] tracking-tighter leading-none pointer-events-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]">
          {midiToNoteName(midiNote)}
        </span>
      )}

      {/* Gate Duration Indicator Bar (P3-01), showing the genre's effective chord length */}
      {lengthBarVisible && (
        <span
          title={lengthBarTitle}
          data-testid={ringsPastStep ? "step-length-tail" : "step-length-bar"}
          className={`absolute bottom-0 left-0 h-[2.5px] rounded-b-sm pointer-events-none ${
            ringsPastStep
              ? "bg-amber-300/90 shadow-[0_0_5px_rgba(252,211,77,0.75)]"
              : "bg-white/80 shadow-[0_0_4px_rgba(255,255,255,0.6)]"
          }`}
          style={{ width: `${lengthBarWidthPct}%` }}
        />
      )}

      {/* Triplet roll inner stripes for Hat = 3 */}
      {isHatTriplet && !isOutsideLoop && (
        <span
          className="absolute inset-x-1 inset-y-1.5 pointer-events-none opacity-75"
          style={{
            background: "repeating-linear-gradient(180deg, transparent 0 3px, rgba(10,11,13,0.85) 3px 6px)",
          }}
        />
      )}

    </div>
  );
});
