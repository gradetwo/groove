import React, { memo } from "react";
import { midiToNoteName } from "./PitchPickerModal";

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
  isOutsideLoop: boolean;
  isPlayhead: boolean;
  isBarStart: boolean;
  isGroupStart: boolean;
  trackColor: string;
  onClick: (trackIdx: number, stepIdx: number, e: React.MouseEvent) => void;
  onContextMenu: (trackIdx: number, stepIdx: number, e: React.MouseEvent) => void;
  onPointerDown: (trackIdx: number, stepIdx: number, e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerEnter: (trackIdx: number, stepIdx: number) => void;
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
  isOutsideLoop,
  isPlayhead,
  isBarStart,
  isGroupStart,
  trackColor,
  onClick,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerEnter,
}) {
  const isOn = stepVal > 0;

  return (
    <div
      onClick={(e) => onClick(trackIdx, stepIdx, e)}
      onContextMenu={(e) => onContextMenu(trackIdx, stepIdx, e)}
      onPointerDown={(e) => onPointerDown(trackIdx, stepIdx, e)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={() => onPointerEnter(trackIdx, stepIdx)}
      className={`min-w-[28px] sm:min-w-[36px] flex-1 h-10 sm:h-10 landscape-compact-cell border cursor-pointer relative transition-all duration-75 select-none touch-action-manipulation touch-hit-44 ${
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
          <span className="absolute bottom-0.5 right-0.5 px-0.5 rounded text-[7px] font-['JetBrains_Mono'] font-black bg-black/70 text-[#e9e7e0] leading-none pointer-events-none">
            {ratchet}x
          </span>
        </>
      )}

      {/* Probability badge */}
      {isOn && prob < 100 && !isOutsideLoop && (
        <span className="absolute top-0.5 right-0.5 px-0.5 rounded text-[7px] font-['JetBrains_Mono'] font-bold bg-[#f5b73d]/90 text-black leading-none pointer-events-none">
          {prob}%
        </span>
      )}

      {/* Melodic note name readout */}
      {isOn && isMelodic && typeof midiNote === "number" && midiNote > 0 && !isOutsideLoop && (
        <span className="absolute inset-x-0 bottom-0.5 text-center font-['JetBrains_Mono'] text-[8px] font-extrabold text-[#0a0b0d] tracking-tighter leading-none pointer-events-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]">
          {midiToNoteName(midiNote)}
        </span>
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

      {/* Synchronized Global Laser Playhead Beam on this cell */}
      {isPlayhead && (
        <span className="absolute inset-0 border-2 border-[#f5b73d] bg-[#f5b73d]/25 shadow-[0_0_14px_rgba(245,183,61,0.5)] rounded-md pointer-events-none z-10" />
      )}
    </div>
  );
});
