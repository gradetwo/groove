import React, { memo } from "react";
import { Copy } from "lucide-react";
import { useDeviceCapabilities } from "../../hooks/useDeviceCapabilities";

export interface RulerProps {
  stepCount: number;
  timeSignature: string;
  stepsPerBar: number;
  groupSize: number;
  isRulerDragging: boolean;
  isZh: boolean;
  loopRange?: [number, number] | null;
  onSelectLoopRange?: (range: [number, number] | null) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  barCount?: number;
  viewedBar?: number;
  onSelectBar?: (barIdx: number) => void;
  onDuplicateBar1?: () => void;
}

export const Ruler = memo<RulerProps>(function Ruler({
  stepCount,
  timeSignature,
  stepsPerBar,
  groupSize,
  isRulerDragging,
  isZh,
  loopRange,
  onSelectLoopRange,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  barCount = 1,
  viewedBar = 0,
  onSelectBar,
  onDuplicateBar1,
}) {
  const { isMobile } = useDeviceCapabilities();
  return (
    <div className="relative z-20 flex items-center gap-[var(--trk-head-gap)] pb-2 pt-1 border-b border-line-subtle mb-2 min-w-max">
      {/* Solid frozen column, same layer as the track rows: the label is only as tall as its own
          content while the row is taller, and the flex gap after it is outside its box. */}
      <div aria-hidden="true" className="trk-head-solid bg-panel" />

      {/* Left Label aligned with track headers - Sticky Left. `--trk-head-w` is shared
          with TrackRow and VelocityLane; before, this was 138 px against the rows' 142 px,
          so this `z-30` column overlapped the `z-20` track headers by 4 px. */}
      <div className="sticky left-0 z-40 bg-panel flex-none w-[var(--trk-head-w)] pr-1.5 sm:pr-2 flex items-center justify-between font-['JetBrains_Mono'] text-[9px] tracking-[0.14em] text-text-dim uppercase select-none border-r border-line-subtle shadow-[4px_0_12px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-1">
          <span className="font-bold text-accent">{stepCount} STEPS</span>
          {loopRange && (
            <button
              type="button"
              onClick={() => onSelectLoopRange?.(null)}
              className="px-1 py-0.5 rounded bg-accent/20 text-accent hover:bg-accent hover:text-black font-bold text-[8px] transition-colors"
              title={isZh ? "清除循环区间" : "Clear loop"}
            >
              L:{loopRange[0] + 1}-{loopRange[1]} ✕
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {onDuplicateBar1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicateBar1();
              }}
              title={isZh ? "将第 1 小节快速复制到所有小节" : "Duplicate Bar 1 to all bars"}
              /* 44 px tall on a phone: measured at 390×664 this pill was 58×30, and it is one of
                 the few ruler controls that stays on the phone surface. */
              className={`px-1.5 py-0.5 rounded bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 text-[8px] font-bold transition-all shadow-sm flex items-center gap-1 ${
                isMobile ? "min-h-11" : ""
              }`}
            >
              {/*
                A lucide `Copy`, not the 📋 emoji this used to carry.

                The emoji is a full-colour platform glyph: it renders at a different optical weight
                and baseline from the 8 px monospace label beside it, and it is the only colour in a
                pill that is otherwise entirely the accent tint. The piano roll's control for the
                *same action* (`duplicateBar1Notes`) has always used this icon, so the ruler was also
                the odd one out against the app's own vocabulary.
              */}
              <Copy className="w-2.5 h-2.5" />
              {isZh ? "复制B1" : "Dup B1"}
            </button>
          )}
          <span className="text-text-dim">{timeSignature}</span>
        </div>
      </div>

      {/* Dynamic Ruler Step Badges with Drag-to-Scroll & Loop Range Selection */}
      <div
        className={`flex-1 flex gap-1 relative cursor-grab select-none touch-action-manipulation ${
          isRulerDragging ? "cursor-grabbing" : ""
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title={isZh ? "按住左右拖拽平移，双击设置循环区间" : "Drag to scroll, click to set loop range"}
      >
        {Array.from({ length: stepCount }, (_, stepIdx) => {
          const groupIdx = Math.floor(stepIdx / groupSize) + 1;
          const stepInGroup = (stepIdx % groupSize) + 1;
          const barIdx = Math.floor(stepIdx / stepsPerBar) + 1;
          const isBarStart = stepIdx % stepsPerBar === 0 && stepIdx !== 0;
          const isFirstStepOfBar = stepIdx % stepsPerBar === 0;
          const isGroupStart = stepIdx % groupSize === 0 && stepIdx !== 0;
          const isFirstStepOfGroup = stepIdx % groupSize === 0;
          const stepStr = String(stepIdx + 1).padStart(2, "0");

          const isInsideLoop = loopRange ? stepIdx >= loopRange[0] && stepIdx < loopRange[1] : false;
          const isLoopStart = loopRange ? stepIdx === loopRange[0] : false;
          const isLoopEnd = loopRange ? stepIdx === loopRange[1] - 1 : false;

          const handleRulerCellClick = (e: React.MouseEvent) => {
            if (!onSelectLoopRange) return;
            e.stopPropagation();
            if (!loopRange) {
              // Create a 1-bar loop starting at this step
              const end = Math.min(stepCount, stepIdx + stepsPerBar);
              onSelectLoopRange([stepIdx, end]);
            } else if (loopRange[0] === stepIdx) {
              onSelectLoopRange(null);
            } else if (stepIdx > loopRange[0]) {
              onSelectLoopRange([loopRange[0], stepIdx + 1]);
            } else {
              onSelectLoopRange([stepIdx, loopRange[1]]);
            }
          };

          return (
            <div
              key={stepIdx}
              data-ruler-step-idx={stepIdx}
              onClick={handleRulerCellClick}
              className={`min-w-[28px] sm:min-w-[36px] flex-1 h-8 rounded flex flex-col items-center justify-center transition-all select-none border relative touch-action-manipulation touch-hit-44 ruler-cell-${stepIdx} ${
                isBarStart
                  ? "ml-3.5 sm:ml-4.5 border-l-2 border-l-[#f5b73d]/80"
                  : isGroupStart
                  ? "ml-2 sm:ml-2.5 border-l border-[#3a3e48]"
                  : ""
              } ${
                isInsideLoop
                  ? "bg-accent/15 border-accent/70 text-accent font-bold shadow-[0_0_8px_rgba(245,183,61,0.2)]"
                  : isFirstStepOfBar
                  ? "bg-[#1f222b] border-[#3a3e48] text-accent font-bold"
                  : isFirstStepOfGroup
                  ? "bg-[#171920] border-[#2b2e38] text-text"
                  : "bg-[#101115] border-[#1c1d22] text-text-dim"
              }`}
              title={`Step ${stepIdx + 1} (Bar ${barIdx}, Group ${groupIdx}.${stepInGroup}) ${isInsideLoop ? "[Loop]" : ""}`}
            >
              {isLoopStart && (
                <span className="absolute -top-1.5 left-0 text-[9px] text-accent font-black">
                  [
                </span>
              )}
              {isLoopEnd && (
                <span className="absolute -top-1.5 right-0 text-[9px] text-accent font-black">
                  ]
                </span>
              )}
              <span className="font-['JetBrains_Mono'] text-[10px] leading-tight font-bold tracking-tight">
                {stepStr}
              </span>
              <span
                className={`font-['JetBrains_Mono'] text-[7.5px] leading-none ${
                  isInsideLoop
                    ? "text-accent font-bold"
                    : isFirstStepOfBar
                    ? "text-accent font-bold"
                    : isFirstStepOfGroup
                    ? "text-text-sub font-semibold"
                    : "text-text-dim"
                }`}
              >
                {isFirstStepOfBar ? `BAR ${barIdx}` : `.${stepInGroup}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
