import React, { useState } from "react";
import { Music, X, Check, Volume2 } from "lucide-react";
import { Modal } from "../../ui";
import { useLanguage } from "../../i18n/LanguageContext";

interface PitchPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackName: string;
  trackColor: string;
  stepIdx: number;
  initialNote?: number | null;
  onSelectPitch: (stepIdx: number, midiNote: number) => void;
  onPreviewNote: (midiNote: number) => void;
  language?: "zh" | "en";
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToNoteName(midi: number): string {
  const noteIdx = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteIdx]}${octave}`;
}

export const PitchPickerModal: React.FC<PitchPickerModalProps> = ({
  isOpen,
  onClose,
  trackName,
  trackColor,
  stepIdx,
  initialNote = 36,
  onSelectPitch,
  onPreviewNote,
  language: _propLanguage,
}) => {
  const { t } = useLanguage();
  const isBass = trackName.toLowerCase().includes("bass");
  const defaultOctave = isBass ? 2 : 4;
  const [octave, setOctave] = useState<number>(() => {
    if (initialNote && initialNote > 0) {
      return Math.max(1, Math.min(6, Math.floor(initialNote / 12) - 1));
    }
    return defaultOctave;
  });
  const [selectedNote, setSelectedNote] = useState<number>(() => initialNote || (isBass ? 36 : 60));

  if (!isOpen) return null;

  const handleKeyClick = (noteIndex: number) => {
    const midi = (octave + 1) * 12 + noteIndex;
    setSelectedNote(midi);
    onPreviewNote(midi);
  };

  const handleApply = () => {
    onSelectPitch(stepIdx, selectedNote);
    onClose();
  };

  const currentNoteName = midiToNoteName(selectedNote);

  // White and black keys layout
  const keys = [
    { name: "C", isBlack: false, idx: 0 },
    { name: "C#", isBlack: true, idx: 1 },
    { name: "D", isBlack: false, idx: 2 },
    { name: "D#", isBlack: true, idx: 3 },
    { name: "E", isBlack: false, idx: 4 },
    { name: "F", isBlack: false, idx: 5 },
    { name: "F#", isBlack: true, idx: 6 },
    { name: "G", isBlack: false, idx: 7 },
    { name: "G#", isBlack: true, idx: 8 },
    { name: "A", isBlack: false, idx: 9 },
    { name: "A#", isBlack: true, idx: 10 },
    { name: "B", isBlack: false, idx: 11 },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      showCloseButton={false}
      ariaLabel={t("pitch_modal_aria")}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f222b]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-6 rounded" style={{ backgroundColor: trackColor }} />
            <div>
              <h3 className="font-['Space_Grotesk'] text-sm font-bold text-text">
                {trackName} · Step {stepIdx + 1} {t("pitch_modal_title")}
              </h3>
              <p className="text-[11px] font-mono text-text-sub">
                MIDI Note: <b className="text-accent">{currentNoteName}</b> ({selectedNote})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-sub hover:text-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Octave Selector */}
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-text-sub">{t("pitch_octave_range")}</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6].map((oct) => (
                <button
                  key={oct}
                  onClick={() => setOctave(oct)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    octave === oct
                      ? "bg-accent text-black font-bold"
                      : "bg-bg text-text-sub hover:text-text border border-line"
                  }`}
                >
                  C{oct}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Keyboard Visualizer */}
          <div className="relative flex justify-center py-2 px-1 bg-[#090a0d] border border-[#1c1e26] rounded-xl overflow-hidden h-32 select-none">
            {/* White keys */}
            <div className="flex w-full h-full">
              {keys
                .filter((k) => !k.isBlack)
                .map((k) => {
                  const midi = (octave + 1) * 12 + k.idx;
                  const isCurrent = selectedNote === midi;
                  return (
                    <button
                      key={k.idx}
                      onClick={() => handleKeyClick(k.idx)}
                      className={`flex-1 h-full rounded-b-md border border-[#2a2d36] transition-all flex flex-col justify-end items-center pb-2 ${
                        isCurrent
                          ? "bg-accent text-black shadow-[0_0_12px_rgba(245,183,61,0.5)] font-bold scale-[0.98]"
                          : "bg-[#e5e3dc] text-neutral-800 hover:bg-white active:bg-neutral-300"
                      }`}
                    >
                      <span className="text-[10px] font-mono font-bold">{k.name}</span>
                    </button>
                  );
                })}
            </div>

            {/* Black keys positioned overlay */}
            <div className="absolute inset-x-3 top-2 flex justify-between pointer-events-none h-[62%]">
              <div className="flex gap-4 w-full px-2">
                {/* C# */}
                <button
                  onClick={() => handleKeyClick(1)}
                  className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1 ml-4 ${
                    selectedNote === (octave + 1) * 12 + 1
                      ? "bg-accent text-black font-bold shadow-[0_0_10px_#f5b73d]"
                      : "bg-[#18191f] text-white hover:bg-[#252833]"
                  }`}
                >
                  <span className="text-[8px] font-mono">C#</span>
                </button>
                {/* D# */}
                <button
                  onClick={() => handleKeyClick(3)}
                  className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1 ml-2 ${
                    selectedNote === (octave + 1) * 12 + 3
                      ? "bg-accent text-black font-bold shadow-[0_0_10px_#f5b73d]"
                      : "bg-[#18191f] text-white hover:bg-[#252833]"
                  }`}
                >
                  <span className="text-[8px] font-mono">D#</span>
                </button>

                {/* Gap between E and F */}
                <div className="w-5" />

                {/* F# */}
                <button
                  onClick={() => handleKeyClick(6)}
                  className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1 ${
                    selectedNote === (octave + 1) * 12 + 6
                      ? "bg-accent text-black font-bold shadow-[0_0_10px_#f5b73d]"
                      : "bg-[#18191f] text-white hover:bg-[#252833]"
                  }`}
                >
                  <span className="text-[8px] font-mono">F#</span>
                </button>
                {/* G# */}
                <button
                  onClick={() => handleKeyClick(8)}
                  className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1 ml-2 ${
                    selectedNote === (octave + 1) * 12 + 8
                      ? "bg-accent text-black font-bold shadow-[0_0_10px_#f5b73d]"
                      : "bg-[#18191f] text-white hover:bg-[#252833]"
                  }`}
                >
                  <span className="text-[8px] font-mono">G#</span>
                </button>
                {/* A# */}
                <button
                  onClick={() => handleKeyClick(10)}
                  className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1 ml-2 ${
                    selectedNote === (octave + 1) * 12 + 10
                      ? "bg-accent text-black font-bold shadow-[0_0_10px_#f5b73d]"
                      : "bg-[#18191f] text-white hover:bg-[#252833]"
                  }`}
                >
                  <span className="text-[8px] font-mono">A#</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#1f222b] bg-[#0d0e13]">
          <button
            onClick={() => onPreviewNote(selectedNote)}
            className="flex items-center gap-1.5 text-xs text-text-sub hover:text-text font-mono"
          >
            <Volume2 className="w-3.5 h-3.5 text-accent" />
            <span>{t("pitch_audition")}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-mono text-text-sub hover:text-text"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-accent text-black hover:brightness-110 flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t("pitch_set")}</span>
            </button>
          </div>
        </div>
    </Modal>
  );
};
