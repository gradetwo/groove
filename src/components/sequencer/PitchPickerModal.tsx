import React, { useState, useMemo, useEffect } from "react";
import { X, Check, Volume2, Lock, Unlock, Sparkles } from "lucide-react";
import { Modal } from "../../ui";
import { useLanguage } from "../../i18n/LanguageContext";
import {
  SCALES,
  NOTE_NAMES,
  NoteName,
  parseScaleString,
  isNoteInScale,
  getScaleDegree,
  quantizePitchToScale,
  quantizeTrackPitches,
} from "../../utils/scaleTheory";

export interface PitchPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackName: string;
  trackColor: string;
  stepIdx: number;
  initialNote?: number | null;
  onSelectPitch: (stepIdx: number, midiNote: number) => void;
  onPreviewNote: (midiNote: number) => void;
  language?: "zh" | "en";
  currentScale?: string;
  trackPitches?: (number | null)[];
  onQuantizeTrack?: (quantizedPitches: (number | null)[]) => void;
  onScaleChange?: (scaleString: string) => void;
}

export function midiToNoteName(midi: number): string {
  if (!midi || midi <= 0) return "--";
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
  language: propLanguage,
  currentScale = "C minor",
  trackPitches,
  onQuantizeTrack,
  onScaleChange,
}) => {
  const { t, language: contextLang } = useLanguage();
  const lang = propLanguage || contextLang || "zh";
  const isZh = lang === "zh";

  const isBass = trackName.toLowerCase().includes("bass");
  const defaultOctave = isBass ? 2 : 4;

  // Parse initial scale
  const initialScaleInfo = useMemo(() => parseScaleString(currentScale), [currentScale]);
  const [rootNote, setRootNote] = useState<NoteName>(initialScaleInfo.root);
  const [scaleId, setScaleId] = useState<string>(initialScaleInfo.scaleId);
  const [isScaleLocked, setIsScaleLocked] = useState<boolean>(initialScaleInfo.scaleId !== "chromatic");

  // Keep in sync if currentScale prop changes
  useEffect(() => {
    const parsed = parseScaleString(currentScale);
    setRootNote(parsed.root);
    setScaleId(parsed.scaleId);
    setIsScaleLocked(parsed.scaleId !== "chromatic");
  }, [currentScale]);

  const [octave, setOctave] = useState<number>(() => {
    if (initialNote && initialNote > 0) {
      return Math.max(1, Math.min(6, Math.floor(initialNote / 12) - 1));
    }
    return defaultOctave;
  });

  const [selectedNote, setSelectedNote] = useState<number>(() => initialNote || (isBass ? 36 : 60));

  const activeScale = SCALES[scaleId] || SCALES.minor;

  // Number of out-of-scale notes across the track
  const outOfScaleTrackNotesCount = useMemo(() => {
    if (!trackPitches || isScaleLocked === false || scaleId === "chromatic") return 0;
    return trackPitches.filter(
      (p) => p !== null && p !== undefined && p > 0 && !isNoteInScale(p, rootNote, scaleId)
    ).length;
  }, [trackPitches, rootNote, scaleId, isScaleLocked]);

  if (!isOpen) return null;

  const handleRootChange = (newRoot: NoteName) => {
    setRootNote(newRoot);
    if (isScaleLocked && !isNoteInScale(selectedNote, newRoot, scaleId)) {
      const q = quantizePitchToScale(selectedNote, newRoot, scaleId);
      setSelectedNote(q);
      onPreviewNote(q);
    }
    onScaleChange?.(`${newRoot} ${scaleId}`);
  };

  const handleScaleIdChange = (newScaleId: string) => {
    setScaleId(newScaleId);
    if (newScaleId === "chromatic") {
      setIsScaleLocked(false);
    } else if (isScaleLocked && !isNoteInScale(selectedNote, rootNote, newScaleId)) {
      const q = quantizePitchToScale(selectedNote, rootNote, newScaleId);
      setSelectedNote(q);
      onPreviewNote(q);
    }
    onScaleChange?.(`${rootNote} ${newScaleId}`);
  };

  const handleToggleScaleLock = () => {
    const next = !isScaleLocked;
    setIsScaleLocked(next);
    if (next && !isNoteInScale(selectedNote, rootNote, scaleId)) {
      const q = quantizePitchToScale(selectedNote, rootNote, scaleId);
      setSelectedNote(q);
      onPreviewNote(q);
    }
  };

  const handleQuantizeTrack = () => {
    if (!trackPitches || !onQuantizeTrack) return;
    const quantized = quantizeTrackPitches(trackPitches, rootNote, scaleId);
    onQuantizeTrack(quantized);
    if (!isNoteInScale(selectedNote, rootNote, scaleId)) {
      const q = quantizePitchToScale(selectedNote, rootNote, scaleId);
      setSelectedNote(q);
      onPreviewNote(q);
    }
  };

  const handleKeyClick = (noteIndex: number) => {
    const midi = (octave + 1) * 12 + noteIndex;
    const inScale = isNoteInScale(midi, rootNote, scaleId);

    if (isScaleLocked && !inScale) {
      const quantized = quantizePitchToScale(midi, rootNote, scaleId);
      setSelectedNote(quantized);
      onPreviewNote(quantized);
      return;
    }

    setSelectedNote(midi);
    onPreviewNote(midi);
  };

  const handleApply = () => {
    let finalNote = selectedNote;
    if (isScaleLocked && !isNoteInScale(finalNote, rootNote, scaleId)) {
      finalNote = quantizePitchToScale(finalNote, rootNote, scaleId);
    }
    onSelectPitch(stepIdx, finalNote);
    onClose();
  };

  const currentNoteName = midiToNoteName(selectedNote);
  const currentDegree = getScaleDegree(selectedNote, rootNote, scaleId);
  const isSelectedInScale = isNoteInScale(selectedNote, rootNote, scaleId);

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
      maxWidth="lg"
      showCloseButton={false}
      ariaLabel={t("pitch_modal_aria")}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f222b]">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-7 rounded" style={{ backgroundColor: trackColor }} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Space_Grotesk'] text-sm font-bold text-text">
                {trackName} · Step {stepIdx + 1} {t("pitch_modal_title")}
              </h3>
              {isScaleLocked ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#f5b73d]/20 text-[#f5b73d] border border-[#f5b73d]/40 shadow-[0_0_8px_rgba(245,183,61,0.2)]">
                  <Lock className="w-2.5 h-2.5" />
                  {isZh ? "调式已锁定" : "Scale Locked"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-text-sub bg-[#1a1c24] border border-[#272935]">
                  <Unlock className="w-2.5 h-2.5" />
                  {isZh ? "半音阶自由" : "Chromatic"}
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-text-sub flex items-center gap-2 mt-0.5">
              <span>
                MIDI: <b className="text-accent">{currentNoteName}</b> ({selectedNote})
              </span>
              <span className="text-text-dim">|</span>
              <span>
                {t("pitch_scale_type")}{" "}
                <b className="text-text">{rootNote} {activeScale.name[isZh ? "zh" : "en"]}</b>
              </span>
              <span className="text-text-dim">|</span>
              <span className={isSelectedInScale ? "text-[#45e0c9] font-bold" : "text-[#ff5964]"}>
                {isSelectedInScale
                  ? currentDegree === "R"
                    ? (isZh ? "★ 根音 (Root)" : "★ Root (1st)")
                    : `${isZh ? "度数:" : "Degree:"} ${currentDegree}`
                  : (isZh ? "⚠ 离调音" : "⚠ Out of scale")}
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close"
          className="p-1.5 rounded-lg text-text-sub hover:text-text hover:bg-line-subtle transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* Scale Theory Settings Bar */}
        <div className="bg-[#0f1117] border border-[#212430] rounded-xl p-3 space-y-3">
          {/* Top row: Root Note pills & Scale Mode select & Lock toggle */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Root Note Selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono text-text-sub shrink-0">
                {t("pitch_root_note")}
              </span>
              <div className="flex items-center gap-1 flex-wrap">
                {NOTE_NAMES.map((note) => {
                  const isSelected = rootNote === note;
                  return (
                    <button
                      key={note}
                      type="button"
                      onClick={() => handleRootChange(note)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all ${
                        isSelected
                          ? "bg-[#f5b73d] text-black shadow-[0_0_8px_rgba(245,183,61,0.4)] scale-105"
                          : "bg-[#171922] text-text-sub hover:text-text hover:bg-[#222533] border border-[#282b3a]"
                      }`}
                    >
                      {note}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lock Toggle & Quantize button */}
            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              <button
                type="button"
                onClick={handleToggleScaleLock}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all border ${
                  isScaleLocked
                    ? "bg-[#f5b73d]/20 text-[#f5b73d] border-[#f5b73d]/60 shadow-[0_0_10px_rgba(245,183,61,0.25)]"
                    : "bg-[#181a24] text-text-sub hover:text-text border-[#282c3c]"
                }`}
                title={isScaleLocked ? t("pitch_scale_locked_desc") : t("pitch_scale_unlocked_desc")}
              >
                {isScaleLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                <span>{t("pitch_scale_lock")}</span>
              </button>

              {onQuantizeTrack && trackPitches && (
                <button
                  type="button"
                  onClick={handleQuantizeTrack}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-[#1d2333] hover:bg-[#252e42] text-[#45e0c9] border border-[#45e0c9]/30 transition-colors shadow-sm"
                  title={t("pitch_quantize_track")}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{t("pitch_quantize_track")}</span>
                  {outOfScaleTrackNotesCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-[#ff5964]/20 text-[#ff5964] border border-[#ff5964]/40">
                      {outOfScaleTrackNotesCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Bottom row: Scale dropdown & Scale description */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-[#1c1f2b]">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono text-text-sub shrink-0">
                {t("pitch_scale_type")}
              </span>
              <select
                value={scaleId}
                onChange={(e) => handleScaleIdChange(e.target.value)}
                className="bg-[#171922] border border-[#2b2f40] text-text rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-accent"
              >
                {Object.values(SCALES).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name[isZh ? "zh" : "en"]}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-[11px] text-text-sub font-mono italic truncate text-right flex-1 min-w-0">
              {activeScale.desc[isZh ? "zh" : "en"]}
            </p>
          </div>
        </div>

        {/* Octave Range Selector */}
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-text-sub">{t("pitch_octave_range")}</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6].map((oct) => (
              <button
                key={oct}
                type="button"
                onClick={() => setOctave(oct)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  octave === oct
                    ? "bg-accent text-black font-bold shadow-[0_0_8px_rgba(245,183,61,0.3)]"
                    : "bg-bg text-text-sub hover:text-text border border-line"
                }`}
              >
                C{oct}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Piano Keyboard Visualizer */}
        <div className="relative flex justify-center py-2 px-1 bg-[#090a0d] border border-[#1c1e26] rounded-xl overflow-hidden h-36 select-none shadow-inner">
          {/* White keys */}
          <div className="flex w-full h-full">
            {keys
              .filter((k) => !k.isBlack)
              .map((k) => {
                const midi = (octave + 1) * 12 + k.idx;
                const isCurrent = selectedNote === midi;
                const inScale = isNoteInScale(midi, rootNote, scaleId);
                const degree = getScaleDegree(midi, rootNote, scaleId);
                const isRoot = degree === "R";
                const isLockedOut = isScaleLocked && !inScale;

                return (
                  <button
                    key={k.idx}
                    type="button"
                    disabled={isLockedOut}
                    onClick={() => handleKeyClick(k.idx)}
                    className={`flex-1 h-full rounded-b-md border transition-all flex flex-col justify-end items-center pb-2 relative group ${
                      isLockedOut
                        ? "opacity-25 bg-[#12141a] border-[#1d202b] cursor-not-allowed text-neutral-600"
                        : isCurrent
                        ? "bg-accent text-black shadow-[0_0_14px_rgba(245,183,61,0.55)] font-bold scale-[0.98] border-accent z-10"
                        : inScale
                        ? "bg-[#eae8e1] text-neutral-900 hover:bg-white active:bg-neutral-300 border-[#2a2d36]"
                        : "bg-[#d8d6ce] text-neutral-700 hover:bg-white border-[#2a2d36]"
                    }`}
                  >
                    <span className="text-[11px] font-mono font-bold leading-none">{k.name}</span>
                    {inScale && (
                      <span
                        className={`mt-1 px-1 py-0.2 rounded text-[8px] font-mono font-extrabold leading-none ${
                          isRoot
                            ? isCurrent
                              ? "bg-black text-[#f5b73d]"
                              : "bg-[#f5b73d] text-black shadow-sm"
                            : isCurrent
                            ? "bg-black/25 text-black"
                            : "bg-black/10 text-neutral-700"
                        }`}
                      >
                        {degree}
                      </span>
                    )}
                    {isLockedOut && (
                      <span className="mt-1 w-1 h-1 rounded-full bg-neutral-600" />
                    )}
                  </button>
                );
              })}
          </div>

          {/* Black keys positioned overlay */}
          <div className="absolute inset-x-3 top-2 flex justify-between pointer-events-none h-[62%]">
            <div className="flex gap-4 w-full px-2">
              {/* C# (idx 1) */}
              {(() => {
                const midi = (octave + 1) * 12 + 1;
                const isCurrent = selectedNote === midi;
                const inScale = isNoteInScale(midi, rootNote, scaleId);
                const degree = getScaleDegree(midi, rootNote, scaleId);
                const isRoot = degree === "R";
                const isLockedOut = isScaleLocked && !inScale;

                return (
                  <button
                    type="button"
                    disabled={isLockedOut}
                    onClick={() => handleKeyClick(1)}
                    className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1.5 ml-4 ${
                      isLockedOut
                        ? "opacity-20 bg-[#0d0e12] border-black cursor-not-allowed text-neutral-600"
                        : isCurrent
                        ? "bg-accent text-black font-bold shadow-[0_0_12px_#f5b73d] scale-[0.98] z-20"
                        : inScale
                        ? "bg-[#18191f] text-white hover:bg-[#252833] border-[#252833]"
                        : "bg-[#121318] text-neutral-400 hover:bg-[#20222a]"
                    }`}
                  >
                    <span className="text-[8px] font-mono leading-none">C#</span>
                    {inScale && (
                      <span
                        className={`mt-0.5 px-0.5 py-0.2 rounded text-[7px] font-mono font-bold leading-none ${
                          isRoot
                            ? "bg-[#f5b73d] text-black"
                            : isCurrent
                            ? "bg-black text-white"
                            : "bg-white/20 text-text"
                        }`}
                      >
                        {degree}
                      </span>
                    )}
                  </button>
                );
              })()}

              {/* D# (idx 3) */}
              {(() => {
                const midi = (octave + 1) * 12 + 3;
                const isCurrent = selectedNote === midi;
                const inScale = isNoteInScale(midi, rootNote, scaleId);
                const degree = getScaleDegree(midi, rootNote, scaleId);
                const isRoot = degree === "R";
                const isLockedOut = isScaleLocked && !inScale;

                return (
                  <button
                    type="button"
                    disabled={isLockedOut}
                    onClick={() => handleKeyClick(3)}
                    className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1.5 ml-2 ${
                      isLockedOut
                        ? "opacity-20 bg-[#0d0e12] border-black cursor-not-allowed text-neutral-600"
                        : isCurrent
                        ? "bg-accent text-black font-bold shadow-[0_0_12px_#f5b73d] scale-[0.98] z-20"
                        : inScale
                        ? "bg-[#18191f] text-white hover:bg-[#252833] border-[#252833]"
                        : "bg-[#121318] text-neutral-400 hover:bg-[#20222a]"
                    }`}
                  >
                    <span className="text-[8px] font-mono leading-none">D#</span>
                    {inScale && (
                      <span
                        className={`mt-0.5 px-0.5 py-0.2 rounded text-[7px] font-mono font-bold leading-none ${
                          isRoot
                            ? "bg-[#f5b73d] text-black"
                            : isCurrent
                            ? "bg-black text-white"
                            : "bg-white/20 text-text"
                        }`}
                      >
                        {degree}
                      </span>
                    )}
                  </button>
                );
              })()}

              {/* Gap between E and F */}
              <div className="w-5" />

              {/* F# (idx 6) */}
              {(() => {
                const midi = (octave + 1) * 12 + 6;
                const isCurrent = selectedNote === midi;
                const inScale = isNoteInScale(midi, rootNote, scaleId);
                const degree = getScaleDegree(midi, rootNote, scaleId);
                const isRoot = degree === "R";
                const isLockedOut = isScaleLocked && !inScale;

                return (
                  <button
                    type="button"
                    disabled={isLockedOut}
                    onClick={() => handleKeyClick(6)}
                    className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1.5 ${
                      isLockedOut
                        ? "opacity-20 bg-[#0d0e12] border-black cursor-not-allowed text-neutral-600"
                        : isCurrent
                        ? "bg-accent text-black font-bold shadow-[0_0_12px_#f5b73d] scale-[0.98] z-20"
                        : inScale
                        ? "bg-[#18191f] text-white hover:bg-[#252833] border-[#252833]"
                        : "bg-[#121318] text-neutral-400 hover:bg-[#20222a]"
                    }`}
                  >
                    <span className="text-[8px] font-mono leading-none">F#</span>
                    {inScale && (
                      <span
                        className={`mt-0.5 px-0.5 py-0.2 rounded text-[7px] font-mono font-bold leading-none ${
                          isRoot
                            ? "bg-[#f5b73d] text-black"
                            : isCurrent
                            ? "bg-black text-white"
                            : "bg-white/20 text-text"
                        }`}
                      >
                        {degree}
                      </span>
                    )}
                  </button>
                );
              })()}

              {/* G# (idx 8) */}
              {(() => {
                const midi = (octave + 1) * 12 + 8;
                const isCurrent = selectedNote === midi;
                const inScale = isNoteInScale(midi, rootNote, scaleId);
                const degree = getScaleDegree(midi, rootNote, scaleId);
                const isRoot = degree === "R";
                const isLockedOut = isScaleLocked && !inScale;

                return (
                  <button
                    type="button"
                    disabled={isLockedOut}
                    onClick={() => handleKeyClick(8)}
                    className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1.5 ml-2 ${
                      isLockedOut
                        ? "opacity-20 bg-[#0d0e12] border-black cursor-not-allowed text-neutral-600"
                        : isCurrent
                        ? "bg-accent text-black font-bold shadow-[0_0_12px_#f5b73d] scale-[0.98] z-20"
                        : inScale
                        ? "bg-[#18191f] text-white hover:bg-[#252833] border-[#252833]"
                        : "bg-[#121318] text-neutral-400 hover:bg-[#20222a]"
                    }`}
                  >
                    <span className="text-[8px] font-mono leading-none">G#</span>
                    {inScale && (
                      <span
                        className={`mt-0.5 px-0.5 py-0.2 rounded text-[7px] font-mono font-bold leading-none ${
                          isRoot
                            ? "bg-[#f5b73d] text-black"
                            : isCurrent
                            ? "bg-black text-white"
                            : "bg-white/20 text-text"
                        }`}
                      >
                        {degree}
                      </span>
                    )}
                  </button>
                );
              })()}

              {/* A# (idx 10) */}
              {(() => {
                const midi = (octave + 1) * 12 + 10;
                const isCurrent = selectedNote === midi;
                const inScale = isNoteInScale(midi, rootNote, scaleId);
                const degree = getScaleDegree(midi, rootNote, scaleId);
                const isRoot = degree === "R";
                const isLockedOut = isScaleLocked && !inScale;

                return (
                  <button
                    type="button"
                    disabled={isLockedOut}
                    onClick={() => handleKeyClick(10)}
                    className={`pointer-events-auto w-6 h-full rounded-b border border-black transition-all flex flex-col justify-end items-center pb-1.5 ml-2 ${
                      isLockedOut
                        ? "opacity-20 bg-[#0d0e12] border-black cursor-not-allowed text-neutral-600"
                        : isCurrent
                        ? "bg-accent text-black font-bold shadow-[0_0_12px_#f5b73d] scale-[0.98] z-20"
                        : inScale
                        ? "bg-[#18191f] text-white hover:bg-[#252833] border-[#252833]"
                        : "bg-[#121318] text-neutral-400 hover:bg-[#20222a]"
                    }`}
                  >
                    <span className="text-[8px] font-mono leading-none">A#</span>
                    {inScale && (
                      <span
                        className={`mt-0.5 px-0.5 py-0.2 rounded text-[7px] font-mono font-bold leading-none ${
                          isRoot
                            ? "bg-[#f5b73d] text-black"
                            : isCurrent
                            ? "bg-black text-white"
                            : "bg-white/20 text-text"
                        }`}
                      >
                        {degree}
                      </span>
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[#1f222b] bg-[#0d0e13]">
        <button
          type="button"
          onClick={() => onPreviewNote(selectedNote)}
          className="flex items-center gap-1.5 text-xs text-text-sub hover:text-text font-mono transition-colors"
        >
          <Volume2 className="w-4 h-4 text-accent" />
          <span>{t("pitch_audition")}</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-mono text-text-sub hover:text-text hover:bg-line-subtle transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-accent text-black hover:brightness-110 flex items-center gap-1.5 shadow-[0_0_10px_rgba(245,183,61,0.3)] transition-all"
          >
            <Check className="w-4 h-4" />
            <span>{t("pitch_set")}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
