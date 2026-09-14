import React from "react";
import { SequencerPattern } from "../../types/genre";
import type { SequencerAction } from "../../features/sequencer/useSequencerStore";
import type {
  PitchPickerState,
  StepContextMenuState,
} from "../../features/sequencer/hooks/useTransportShortcuts";

export interface StepContextMenuProps {
  state: StepContextMenuState;
  pattern: SequencerPattern;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  onClose: () => void;
  onOpenPitchPicker: React.Dispatch<React.SetStateAction<PitchPickerState>>;
  isZh: boolean;
}

/**
 * A-02: the long-press / right-click step context menu (P-Locks), extracted
 * verbatim from `StudioView`. Position clamping and every dispatch/toast detail
 * are unchanged.
 */
export const StepContextMenu: React.FC<StepContextMenuProps> = ({
  state,
  pattern,
  commit,
  onClose,
  onOpenPitchPicker,
  isZh,
}) => {
  return (
    <div
      className="fixed z-50 bg-[#15171d] border border-line rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] p-3 text-xs w-60 animate-fade-in"
      style={{
        left: Math.min(window.innerWidth - 250, Math.max(10, state.x)),
        top: Math.min(window.innerHeight - 280, Math.max(10, state.y)),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="font-['JetBrains_Mono'] text-[10px] text-accent font-bold pb-2 border-b border-line flex items-center justify-between">
        <span>
          {isZh ? "参数锁 (P-LOCKS)" : "PARAM LOCKS"} - T{state.trackIdx + 1}:S{state.stepIdx + 1}
        </span>
        <button onClick={onClose} className="text-text-dim hover:text-text px-1">
          ✕
        </button>
      </div>

      <div className="space-y-2.5 mt-2.5">
        {/* Ratchet Subdivisions */}
        <div className="flex items-center justify-between">
          <span className="text-text-dim">{isZh ? "连音滚奏" : "Ratchet"}:</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((r) => {
              const cur = pattern.tracks[state.trackIdx]?.ratchet?.[state.stepIdx] || 1;
              return (
                <button
                  key={r}
                  onClick={() => {
                    commit({
                      type: "SET_RATCHET",
                      trackIdx: state.trackIdx,
                      stepIdx: state.stepIdx,
                      ratchet: r,
                    });
                    onClose();
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                    cur === r
                      ? "bg-accent text-black font-bold border-accent"
                      : "bg-panel2 border-line text-text"
                  }`}
                >
                  {r}x
                </button>
              );
            })}
          </div>
        </div>

        {/* Trigger Probability */}
        <div className="flex items-center justify-between">
          <span className="text-text-dim">{isZh ? "触发概率" : "Prob"}:</span>
          <div className="flex gap-1">
            {[100, 75, 50, 25].map((p) => {
              const cur = pattern.tracks[state.trackIdx]?.probability?.[state.stepIdx] ?? 100;
              return (
                <button
                  key={p}
                  onClick={() => {
                    commit({
                      type: "SET_PROBABILITY",
                      trackIdx: state.trackIdx,
                      stepIdx: state.stepIdx,
                      probability: p,
                    });
                    onClose();
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                    cur === p
                      ? "bg-accent text-black font-bold border-accent"
                      : "bg-panel2 border-line text-text"
                  }`}
                >
                  {p}%
                </button>
              );
            })}
          </div>
        </div>

        {/* Pitch Selection for Melodic Tracks */}
        <div className="pt-2 border-t border-line flex items-center justify-between">
          <span className="text-text-dim">{isZh ? "独立音高" : "Pitch"}:</span>
          <button
            onClick={() => {
              const tr = pattern.tracks[state.trackIdx];
              onOpenPitchPicker({
                isOpen: true,
                trackIdx: state.trackIdx,
                stepIdx: state.stepIdx,
                initialNote: tr?.pitch?.[state.stepIdx] ?? 60,
              });
              onClose();
            }}
            className="px-2 py-1 rounded bg-panel2 hover:bg-line border border-line text-accent font-mono text-[10px]"
          >
            {isZh ? "打开音高键盘 ♩" : "Open Keyboard ♩"}
          </button>
        </div>
      </div>
    </div>
  );
};
