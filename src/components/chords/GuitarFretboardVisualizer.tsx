import React from "react";
import { getGuitarFretboardChord, ChordQuality, GUITAR_TUNING_MIDI, midiToNoteName } from "../../utils/chordTheory";
import { triggerHaptic, HapticPatterns } from "../../utils/haptics";
import { useLanguage } from "../../i18n/LanguageContext";

interface GuitarFretboardVisualizerProps {
  rootNote: string;
  quality: ChordQuality;
  onStringClick?: (midi: number) => void;
  language?: "zh" | "en";
}

export const GuitarFretboardVisualizer: React.FC<GuitarFretboardVisualizerProps> = ({
  rootNote,
  quality,
  onStringClick,
  language: _propLanguage,
}) => {
  const { t } = useLanguage();
  const fretChord = getGuitarFretboardChord(rootNote, quality);
  const totalFrets = 12;
  const stringNames = ["6 (E)", "5 (A)", "4 (D)", "3 (G)", "2 (B)", "1 (e)"];
  const fretMarkers = [3, 5, 7, 9, 12];

  const handleStringTap = (midi: number) => {
    triggerHaptic(HapticPatterns.tap);
    if (onStringClick) {
      onStringClick(midi);
    }
  };

  return (
    <div className="w-full bg-[#0e1117] rounded-xl p-3 border border-line shadow-inner select-none overflow-x-auto overscroll-contain-all">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 text-xs text-text-sub">
          <span className="w-2 h-2 rounded-full bg-[#e5a93c] shadow-[0_0_6px_#e5a93c]" />
          <span className="font-semibold text-[#eae6dc]">
            {t("guitar_fretboard_title")}
          </span>
          <span className="text-[10px] text-text-dim">
            {t("guitar_fretboard_sub")}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-text-sub">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-accent text-black font-bold flex items-center justify-center text-[8px]">●</span>
            <span>{t("guitar_fretted")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#4ad8c8] font-bold">O</span>
            <span>{t("guitar_open_string")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[#e84855] font-bold">✕</span>
            <span>{t("guitar_muted")}</span>
          </div>
        </div>
      </div>

      {/* Fretboard Container */}
      <div className="relative min-w-[620px] bg-[#1a1410] border-y-2 border-[#3d2b20] rounded-sm py-2 px-3 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]">
        {/* Fret Number Header */}
        <div className="flex items-center ml-14 mb-1 text-[10px] font-mono text-text-sub">
          <div className="w-8 text-center text-[#d8b988] font-bold">Open</div>
          {Array.from({ length: totalFrets }, (_, i) => i + 1).map((f) => (
            <div key={f} className="flex-1 text-center">
              {f}
            </div>
          ))}
        </div>

        {/* Fret Inlay Markers (3, 5, 7, 9, 12) */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 ml-20 flex pointer-events-none z-0">
          <div className="w-8" />
          {Array.from({ length: totalFrets }, (_, i) => i + 1).map((f) => (
            <div key={f} className="flex-1 flex justify-center items-center">
              {fretMarkers.includes(f) && (
                <span className={`rounded-full bg-[#eae6dc]/15 shadow-sm ${f === 12 ? "w-1.5 h-1.5 ring-4 ring-[#eae6dc]/10" : "w-2 h-2"}`} />
              )}
            </div>
          ))}
        </div>

        {/* 6 Guitar Strings (from 6th low E to 1st high E) */}
        <div className="flex flex-col gap-3 relative z-10">
          {fretChord.frets.map((pressedFret, stringIdx) => {
            const stringName = stringNames[stringIdx];
            const baseMidi = GUITAR_TUNING_MIDI[stringIdx];
            const isMuted = pressedFret === -1;
            const isOpen = pressedFret === 0;
            const isPressed = pressedFret > 0;

            // Compute active note MIDI
            const activeMidi = isMuted ? null : baseMidi + pressedFret;
            const noteName = activeMidi ? midiToNoteName(activeMidi).note : "";

            // Visual string thickness: 6th string thickest (3.5px), 1st thinnest (1px)
            const stringHeight = Math.max(1, 3.5 - stringIdx * 0.45);

            return (
              <div key={stringIdx} className="flex items-center h-4 group">
                {/* String Label & Status */}
                <div className="w-14 flex items-center justify-between pr-2 text-[10px] font-mono shrink-0">
                  <span className="text-text-sub group-hover:text-white transition-colors">{stringName}</span>
                  {isMuted && <span className="text-[#e84855] font-bold text-xs">✕</span>}
                  {isOpen && <span className="text-[#4ad8c8] font-bold text-xs">○</span>}
                  {isPressed && <span className="text-accent font-bold text-xs">●</span>}
                </div>

                {/* Open String Action Zone */}
                <button
                  type="button"
                  onClick={() => activeMidi && handleStringTap(activeMidi)}
                  disabled={isMuted}
                  className={`w-8 h-6 flex items-center justify-center rounded border border-[#2b2420] text-[10px] font-mono transition-all mr-1 touch-action-none select-none ${
                    isOpen 
                      ? "bg-[#4ad8c8]/20 border-[#4ad8c8] text-[#4ad8c8] font-bold shadow-[0_0_8px_rgba(74,216,200,0.4)]"
                      : isMuted
                      ? "opacity-30 cursor-not-allowed text-text-dim"
                      : "bg-[#1f1915] text-text-sub hover:bg-[#2e2520]"
                  }`}
                >
                  {isOpen ? noteName : "—"}
                </button>

                {/* Fretted Neck Grid */}
                <div className="relative flex-1 flex items-center h-full touch-action-none">
                  {/* Metal String Wire */}
                  <div 
                    className="absolute inset-x-0 bg-gradient-to-r from-[#d8b988] via-[#e5e3dc] to-[#c2b9a7] shadow-[0_1px_2px_rgba(0,0,0,0.8)] pointer-events-none"
                    style={{ height: `${stringHeight}px` }}
                  />

                  {/* Fret Wire Columns & Touch targets */}
                  {Array.from({ length: totalFrets }, (_, i) => i + 1).map((f) => {
                    const isCurrentFret = pressedFret === f;
                    const fretMidi = baseMidi + f;
                    const fNoteName = midiToNoteName(fretMidi).note;

                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => handleStringTap(fretMidi)}
                        className="relative flex-1 h-6 border-r border-[#695d52]/60 hover:bg-white/5 flex items-center justify-center transition-colors group/fret touch-action-none select-none"
                      >
                        {isCurrentFret && (
                          <div className="w-5 h-5 rounded-full bg-accent text-zinc-950 font-bold text-[10px] flex items-center justify-center shadow-[0_0_12px_rgba(245,183,61,0.9)] animate-pulse z-20">
                            {fNoteName}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
