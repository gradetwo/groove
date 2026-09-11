import React, { memo } from "react";

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
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 pb-2 pt-1 border-b border-line-subtle mb-2 min-w-max">
      {/* Left Label aligned with track headers - Sticky Left */}
      <div className="sticky left-0 z-30 bg-panel flex-none w-[138px] sm:w-[172px] pr-1.5 sm:pr-2 flex items-center justify-between font-['JetBrains_Mono'] text-[9px] tracking-[0.14em] text-text-dim uppercase select-none border-r border-line-subtle shadow-[4px_0_12px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-1">
          <span>{stepCount} STEPS</span>
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
        <span className="text-[#3a3e48]">{timeSignature}</span>
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
                    : "text-[#3e424d]"
                }`}
              >
                {isFirstStepOfBar ? `M${barIdx}` : `.${stepInGroup}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
