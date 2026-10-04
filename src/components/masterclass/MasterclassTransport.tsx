/**
 * The transport row shared by the masterclass labs: a BPM slider with its readout, and a play/stop button.
 *
 * Four labs had copied this out byte for byte — thirty-six lines each, differing only in the slider's range and
 * in the two labels — which the duplication measure counted as three cross-file blocks and one same-file one.
 * Extracting it keeps every lab's own range and wording (they are passed in, so the i18n keys and the bilingual
 * strings are unchanged) while removing the copies.
 */
import { Play, Square } from "lucide-react";
import type { ReactNode } from "react";

export function MasterclassTransport({
  bpm,
  min,
  max,
  onBpmChange,
  isPlaying,
  onTogglePlay,
  stopLabel,
  playLabel,
}: {
  bpm: number;
  min: number;
  max: number;
  onBpmChange: (bpm: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  stopLabel: ReactNode;
  playLabel: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-2 text-xs font-mono text-text-sub">
        <span>BPM</span>
        <input
          type="range"
          min={min}
          max={max}
          value={bpm}
          onChange={(e) => {
            const b = Number(e.target.value);
            onBpmChange(b);
          }}
          className="w-20 accent-accent"
        />
        <span className="w-8 text-right font-bold text-accent">{bpm}</span>
      </div>

      <button
        onClick={onTogglePlay}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md ${
          isPlaying
            ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
            : "bg-accent text-black hover:bg-[#ffc65c] shadow-[0_0_12px_rgba(245,183,61,0.3)]"
        }`}
      >
        {isPlaying ? (
          <>
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>{stopLabel}</span>
          </>
        ) : (
          <>
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{playLabel}</span>
          </>
        )}
      </button>
    </>
  );
}
