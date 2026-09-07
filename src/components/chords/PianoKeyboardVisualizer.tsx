import React from "react";
import { midiToNoteName } from "../../utils/chordTheory";

interface PianoKeyboardVisualizerProps {
  activeNotes: number[]; // Array of MIDI note numbers
  rootMidi?: number;
  onKeyClick?: (midi: number) => void;
}

export const PianoKeyboardVisualizer: React.FC<PianoKeyboardVisualizerProps> = ({
  activeNotes,
  rootMidi,
  onKeyClick,
}) => {
  // 3 octaves: C3 (48) to B5 (83) -> 36 keys total (21 white, 15 black)
  const startMidi = 48; // C3
  const endMidi = 83;   // B5

  const keys: Array<{
    midi: number;
    note: string;
    octave: number;
    isBlack: boolean;
  }> = [];

  for (let m = startMidi; m <= endMidi; m++) {
    const { note, octave } = midiToNoteName(m);
    const isBlack = note.includes("#");
    keys.push({ midi: m, note, octave, isBlack });
  }

  const whiteKeys = keys.filter(k => !k.isBlack);

  return (
    <div className="w-full bg-[#0a0d14] rounded-xl p-3 border border-[#23262d] shadow-inner select-none overflow-x-auto">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 text-xs text-[#8b8f99]">
          <span className="w-2 h-2 rounded-full bg-[#f5b73d] shadow-[0_0_6px_#f5b73d]" />
          <span className="font-semibold text-[#eae6dc]">88键立体钢琴琴键映射 (C3 - B5)</span>
          <span className="text-[10px] text-[#5a5e68]">· 点亮当前和弦发音键位</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[#8b8f99]">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-[#f5b73d]" />
            <span>根音 (Root)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-[#4ad8c8]" />
            <span>和弦组成音 (Chord Notes)</span>
          </div>
        </div>
      </div>

      {/* Keyboard Container */}
      <div className="relative h-28 sm:h-32 flex justify-center min-w-[560px]">
        {/* White Keys */}
        <div className="flex w-full h-full">
          {whiteKeys.map((k) => {
            const isActive = activeNotes.some(m => m % 12 === k.midi % 12);
            const isExactActive = activeNotes.includes(k.midi);
            const isRoot = rootMidi !== undefined && (rootMidi % 12 === k.midi % 12);
            const isExactRoot = rootMidi !== undefined && rootMidi === k.midi;

            let bgColor = "bg-[#f3f1eb] hover:bg-[#ffffff] text-zinc-700";
            if (isExactRoot) {
              bgColor = "bg-[#f5b73d] text-zinc-950 font-bold shadow-[0_0_12px_rgba(245,183,61,0.8)] z-10";
            } else if (isExactActive) {
              bgColor = "bg-[#4ad8c8] text-zinc-950 font-semibold shadow-[0_0_10px_rgba(74,216,200,0.7)] z-10";
            } else if (isActive) {
              bgColor = "bg-[#e2dfd5] text-zinc-600";
            }

            return (
              <button
                key={k.midi}
                type="button"
                onClick={() => onKeyClick && onKeyClick(k.midi)}
                className={`relative flex-1 h-full rounded-b border border-zinc-400/40 transition-colors flex flex-col justify-end items-center pb-1.5 text-[10px] cursor-pointer active:brightness-90 ${bgColor}`}
              >
                {k.note === "C" && (
                  <span className="absolute bottom-5 text-[8px] font-mono text-zinc-400">
                    C{k.octave}
                  </span>
                )}
                <span className="font-mono leading-none">
                  {k.note}
                </span>
              </button>
            );
          })}
        </div>

        {/* Black Keys */}
        <div className="absolute inset-0 flex pointer-events-none w-full h-full">
          {whiteKeys.map((wk, idx) => {
            // Check if there is a black key between this white key and the next
            const nextWhite = whiteKeys[idx + 1];
            if (!nextWhite) return null;

            const blackMidi = wk.midi + 1;
            const hasBlack = (wk.midi % 12 !== 4) && (wk.midi % 12 !== 11); // Not E or B
            if (!hasBlack) {
              return <div key={`spacer-${wk.midi}`} className="flex-1 invisible" />;
            }

            const bk = keys.find(k => k.midi === blackMidi);
            if (!bk) return <div key={`spacer-${wk.midi}`} className="flex-1 invisible" />;

            const isActive = activeNotes.some(m => m % 12 === bk.midi % 12);
            const isExactActive = activeNotes.includes(bk.midi);
            const isRoot = rootMidi !== undefined && (rootMidi % 12 === bk.midi % 12);
            const isExactRoot = rootMidi !== undefined && rootMidi === bk.midi;

            let bkColor = "bg-[#181a20] hover:bg-[#2c303c] text-white";
            if (isExactRoot) {
              bkColor = "bg-[#f5b73d] text-zinc-950 font-bold shadow-[0_0_14px_rgba(245,183,61,0.9)]";
            } else if (isExactActive) {
              bkColor = "bg-[#4ad8c8] text-zinc-950 font-semibold shadow-[0_0_12px_rgba(74,216,200,0.8)]";
            } else if (isActive) {
              bkColor = "bg-[#252a36] text-[#eae6dc]";
            }

            return (
              <div key={bk.midi} className="relative flex-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => onKeyClick && onKeyClick(bk.midi)}
                  style={{ left: "50%" }}
                  className={`absolute -translate-x-1/2 top-0 w-3/5 h-[62%] rounded-b-sm border border-black/80 pointer-events-auto transition-colors flex flex-col justify-end items-center pb-1 text-[9px] cursor-pointer active:brightness-90 z-20 ${bkColor}`}
                >
                  <span className="font-mono leading-none">
                    {bk.note}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
