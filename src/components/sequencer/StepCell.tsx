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
  isLoopedRepeat?: boolean;
  isPlayhead: boolean;
  isBarStart: boolean;
  isGroupStart: boolean;
  trackColor: string;
  isAlternateBar?: boolean;
  isCompact?: boolean;
  isSustainTail?: boolean;
  isSustainEnd?: boolean;
  hasSustainFollower?: boolean;
  sustainSourceIdx?: number;
  sustainTotalSteps?: number;
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
  isLoopedRepeat = false,
  isPlayhead,
  isBarStart,
  isGroupStart,
  trackColor,
  isAlternateBar = false,
  isCompact = false,
  isSustainTail = false,
  isSustainEnd = false,
  hasSustainFollower = false,
  sustainSourceIdx,
  sustainTotalSteps,
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
      aria-selected={isOn || isSustainTail}
      aria-label={
        isSustainTail
          ? `Track ${trackIdx + 1} Step ${stepIdx + 1}, Sustained note`
          : `Track ${trackIdx + 1} Step ${stepIdx + 1}, ${isOn ? "Active" : "Empty"}`
      }
      title={
        isSustainTail && sustainSourceIdx !== undefined
          ? `和弦持续音 (来自第 ${sustainSourceIdx + 1} 步)`
          : undefined
      }
      data-track-idx={trackIdx}
      data-step-idx={stepIdx}
      data-testid={`step-cell-${trackIdx}-${stepIdx}`}
      data-active={isOn ? "true" : "false"}
      {...(isSustainTail ? { "data-step-sustain": "tail" } : {})}
      onClick={onClick ? (e) => onClick(trackIdx, stepIdx, e) : undefined}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu ? (e) => onContextMenu(trackIdx, stepIdx, e) : undefined}
      onPointerDown={onPointerDown ? (e) => onPointerDown(trackIdx, stepIdx, e) : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={onPointerEnter ? () => onPointerEnter(trackIdx, stepIdx) : undefined}
      className={`w-9 sm:min-w-[36px] sm:w-auto flex-1 ${isCompact ? "h-step-compact" : "h-step"} landscape-compact-cell border cursor-pointer relative transition-all duration-75 select-none touch-action-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-20 ${
        isBarStart
          ? "ml-3.5 sm:ml-4.5 border-l-2 border-l-[#f5b73d]/70"
          : isGroupStart
          ? "ml-2 sm:ml-2.5 border-l border-[#3a3e48]"
          : ""
      } ${
        isHatRound
          ? "rounded-full"
          : isSustainTail && !isSustainEnd
          ? "rounded-none"
          : isSustainTail && isSustainEnd
          ? "rounded-r-md rounded-l-none"
          : hasSustainFollower
          ? "rounded-l-md rounded-r-none"
          : "rounded-md"
      } ${
        isOutsideLoop
          ? "opacity-35 bg-[#0f111a] border-[#1a1c28] cursor-not-allowed"
          : isOn
          ? isLoopedRepeat
            ? "border-dashed border-white/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.4),0_0_8px_var(--tc)]"
            : hasSustainFollower
            ? "border-t border-t-white/60 border-y-transparent border-l-transparent border-r-0 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),0_0_12px_var(--tc)]"
            : "border-t border-t-white/60 border-transparent shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),0_0_12px_var(--tc)]"
          : isSustainTail
          ? `border-y border-y-[var(--tc)]/40 border-l-0 ${isSustainEnd ? "border-r border-r-[var(--tc)]/40" : "border-r-0"} shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] hover:border-y-accent/60`
          : isAlternateBar
          ? "bg-[#181c2c] border-[#282e42] hover:border-accent/50 hover:bg-[#1f253a] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
          : "bg-[#131522] border-[#202434] hover:border-accent/50 hover:bg-[#191c2c] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
      }`}
      style={{
        backgroundColor:
          !isOutsideLoop && isOn
            ? trackColor
            : !isOutsideLoop && isSustainTail
            ? "color-mix(in srgb, var(--tc) 22%, transparent)"
            : undefined,
        opacity: isOutsideLoop
          ? 0.25
          : isOn
          ? (isLoopedRepeat ? 0.85 : 1) * (0.45 + (velocity / 127) * 0.55)
          : isSustainTail
          ? 0.92
          : 1,
        ["--tc" as any]: trackColor,
      }}
    >
      {/* DAW-grade multi-step chord sustain ribbon */}
      {isSustainTail && !isOutsideLoop && (
        <>
          <div
            data-testid="chord-sustain-tail"
            className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-2.5 sm:h-3 pointer-events-none ${
              isSustainEnd ? "rounded-r-full" : ""
            }`}
            style={{
              backgroundColor: trackColor,
              opacity: 0.55,
              boxShadow: `0 0 8px ${trackColor}`,
            }}
          />
          <span className="absolute inset-x-0 bottom-0.5 text-center font-['JetBrains_Mono'] text-[7.5px] font-bold text-[var(--tc-ink)] opacity-60 tracking-tighter leading-none pointer-events-none">
            {isSustainEnd ? "┤" : "─"}
          </span>
        </>
      )}

      {/* Head-to-tail connector link on the trigger cell */}
      {hasSustainFollower && !isOutsideLoop && (
        <span
          className="absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-2.5 sm:h-3 pointer-events-none z-10"
          style={{
            backgroundColor: trackColor,
            opacity: 0.85,
            boxShadow: `0 0 6px ${trackColor}`,
          }}
        />
      )}
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
        <span className="absolute inset-x-0 bottom-0.5 text-center font-['JetBrains_Mono'] text-[8px] font-black text-[var(--tc-ink)] tracking-tighter leading-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
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
