import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard, X, Volume2, Music, Layers, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";
import { type SequencerPattern } from "../../types/genre";
import { midiToNoteName } from "./PitchPickerModal";
import { chordVoicingForStep } from "../../audio/chordVoicing";

export interface MusicalTypingModalProps {
  isOpen: boolean;
  onClose: () => void;
  pattern: SequencerPattern;
  activeTrackIdx: number;
  onSelectTrack: (idx: number) => void;
  onAudition: (trackIdx: number, midi: number, velocity: number, gate: number) => void;
  isZh: boolean;
}

interface KeyDef {
  key: string;
  offset: number; // semitone offset from baseMidi
  isBlack: boolean;
}

// Logic Pro QWERTY Musical Typing layout (2 full octaves: C to C, 15 white keys)
const WHITE_KEYS: KeyDef[] = [
  { key: "a", offset: 0, isBlack: false },
  { key: "s", offset: 2, isBlack: false },
  { key: "d", offset: 4, isBlack: false },
  { key: "f", offset: 5, isBlack: false },
  { key: "g", offset: 7, isBlack: false },
  { key: "h", offset: 9, isBlack: false },
  { key: "j", offset: 11, isBlack: false },
  { key: "k", offset: 12, isBlack: false },
  { key: "l", offset: 14, isBlack: false },
  { key: ";", offset: 16, isBlack: false },
  { key: "'", offset: 17, isBlack: false },
  { key: "", offset: 19, isBlack: false },
  { key: "", offset: 21, isBlack: false },
  { key: "", offset: 23, isBlack: false },
  { key: "", offset: 24, isBlack: false },
];

const BLACK_KEYS: Array<KeyDef & { boundaryIndex: number; leftPercent: number }> = [
  { key: "w", offset: 1, isBlack: true, boundaryIndex: 1, leftPercent: (1 / 15) * 100 },
  { key: "e", offset: 3, isBlack: true, boundaryIndex: 2, leftPercent: (2 / 15) * 100 },
  // no key between E and F (boundary 3)
  { key: "t", offset: 6, isBlack: true, boundaryIndex: 4, leftPercent: (4 / 15) * 100 },
  { key: "y", offset: 8, isBlack: true, boundaryIndex: 5, leftPercent: (5 / 15) * 100 },
  { key: "u", offset: 10, isBlack: true, boundaryIndex: 6, leftPercent: (6 / 15) * 100 },
  // no key between B and C (boundary 7)
  { key: "o", offset: 13, isBlack: true, boundaryIndex: 8, leftPercent: (8 / 15) * 100 },
  { key: "p", offset: 15, isBlack: true, boundaryIndex: 9, leftPercent: (9 / 15) * 100 },
  // no key between E and F (boundary 10)
  { key: "", offset: 18, isBlack: true, boundaryIndex: 11, leftPercent: (11 / 15) * 100 },
  { key: "", offset: 20, isBlack: true, boundaryIndex: 12, leftPercent: (12 / 15) * 100 },
  { key: "", offset: 22, isBlack: true, boundaryIndex: 13, leftPercent: (13 / 15) * 100 },
];

const QWERTY_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
  "'": 17,
};

export const MusicalTypingModal: React.FC<MusicalTypingModalProps> = ({
  isOpen,
  onClose,
  pattern,
  activeTrackIdx,
  onSelectTrack,
  onAudition,
  isZh,
}) => {
  const { t } = useLanguage();
  const [baseOctave, setBaseOctave] = useState(4); // C4 = 60
  const [velocity, setVelocity] = useState(100);
  const [chordMode, setChordMode] = useState(false);
  const [sustain, setSustain] = useState(false);
  const [activeMidis, setActiveMidis] = useState<Set<number>>(new Set());

  const baseMidi = useMemo(() => (baseOctave + 1) * 12, [baseOctave]);
  const currentTrack = pattern.tracks[activeTrackIdx] || pattern.tracks[0];

  const playNote = useCallback(
    (midi: number) => {
      if (chordMode) {
        const stack = chordVoicingForStep(midi, pattern.scale);
        for (const note of stack) {
          onAudition(activeTrackIdx, note, velocity, sustain ? 3.0 : 0.9);
        }
        setActiveMidis((prev) => new Set([...prev, ...stack]));
      } else {
        onAudition(activeTrackIdx, midi, velocity, sustain ? 3.0 : 0.9);
        setActiveMidis((prev) => new Set([...prev, midi]));
      }
    },
    [activeTrackIdx, chordMode, onAudition, pattern.scale, sustain, velocity]
  );

  const releaseNote = useCallback(
    (midi: number) => {
      if (sustain) return;
      setActiveMidis((prev) => {
        const next = new Set(prev);
        if (chordMode) {
          const stack = chordVoicingForStep(midi, pattern.scale);
          for (const note of stack) next.delete(note);
        } else {
          next.delete(midi);
        }
        return next;
      });
    },
    [chordMode, pattern.scale, sustain]
  );

  useEffect(() => {
    if (!isOpen) {
      setActiveMidis(new Set());
      return;
    }

    const heldKeys = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (
        (e.altKey && (e.code === "KeyK" || e.key === "k" || e.key === "K" || e.key === "˚")) ||
        e.key === "Escape"
      ) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (heldKeys.has(key)) return; // Prevent key repeat

      if (key in QWERTY_MAP) {
        e.preventDefault();
        heldKeys.add(key);
        const offset = QWERTY_MAP[key];
        playNote(baseMidi + offset);
        return;
      }

      // Octave shifts
      if (key === "z") {
        e.preventDefault();
        setBaseOctave((v) => Math.max(1, v - 1));
        return;
      }
      if (key === "x") {
        e.preventDefault();
        setBaseOctave((v) => Math.min(7, v + 1));
        return;
      }

      // Velocity adjustments
      if (key === "c") {
        e.preventDefault();
        setVelocity((v) => Math.max(10, v - 16));
        return;
      }
      if (key === "v") {
        e.preventDefault();
        setVelocity((v) => Math.min(127, v + 16));
        return;
      }

      // Sustain hold
      if (key === "tab") {
        e.preventDefault();
        setSustain((v) => !v);
        return;
      }

      if (e.key === "Escape") {
        onClose();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      heldKeys.delete(key);
      if (key in QWERTY_MAP) {
        const offset = QWERTY_MAP[key];
        releaseNote(baseMidi + offset);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [baseMidi, isOpen, onClose, playNote, releaseNote]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("virtual_keyboard_title")}
      data-testid="musical-typing-modal"
      className="fixed inset-x-0 bottom-0 z-[9999] w-full flex justify-center p-0 pointer-events-none select-none"
      style={{ zIndex: 9999 }}
    >
      <div className="w-full sm:max-w-[760px] md:max-w-[820px] mx-auto rounded-t-2xl sm:border-x sm:border-line border-t border-line bg-[#101217]/98 backdrop-blur-2xl px-3 py-2 sm:px-5 sm:py-2 shadow-[0_-12px_36px_rgba(0,0,0,0.9)] pointer-events-auto ring-1 ring-white/10 animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header HUD */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-subtle pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-accent/20 text-accent">
              <Keyboard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <div>
              <h3 className="font-['JetBrains_Mono'] text-xs font-bold text-text flex items-center gap-1.5">
                {t("virtual_keyboard_title")}
                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] text-accent">⌥K</span>
              </h3>
              <p className="font-['JetBrains_Mono'] text-[9.5px] text-text-dim">
                {pattern.scale ? `${pattern.scale} · ` : ""}{currentTrack.name}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Track Selector */}
            <select
              value={activeTrackIdx}
              onChange={(e) => onSelectTrack(Number(e.target.value))}
              aria-label="Target track"
              data-testid="musical-typing-track-select"
              className="rounded-lg border border-line bg-panel2 px-2 py-0.5 sm:py-1 font-['JetBrains_Mono'] text-[10px] sm:text-[11px] text-text outline-none hover:border-accent/50"
            >
              {pattern.tracks.map((tr, idx) => (
                <option key={`${tr.track_id}-${idx}`} value={idx}>
                  {tr.name} ({tr.instrument || tr.track_id})
                </option>
              ))}
            </select>

            {/* Chord Mode Toggle */}
            <button
              type="button"
              onClick={() => setChordMode((v) => !v)}
              aria-pressed={chordMode}
              data-testid="musical-typing-chord-toggle"
              className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 sm:py-1 font-['JetBrains_Mono'] text-[10px] font-semibold transition-all ${
                chordMode
                  ? "border-accent bg-accent/25 text-accent shadow-[0_0_10px_rgba(245,183,61,0.3)]"
                  : "border-line bg-panel2 text-text-sub hover:text-text"
              }`}
            >
              <Layers className="h-3 w-3" />
              {t("virtual_keyboard_chord_mode")}
            </button>

            {/* Sustain Toggle */}
            <button
              type="button"
              onClick={() => setSustain((v) => !v)}
              aria-pressed={sustain}
              data-testid="musical-typing-sustain-toggle"
              className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 sm:py-1 font-['JetBrains_Mono'] text-[10px] font-semibold transition-all ${
                sustain
                  ? "border-emerald-500 bg-emerald-500/25 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                  : "border-line bg-panel2 text-text-sub hover:text-text"
              }`}
            >
              <Sparkles className="h-3 w-3" />
              {t("virtual_keyboard_sustain")} (Tab)
            </button>

            <button
              type="button"
              onClick={onClose}
              data-testid="musical-typing-close"
              aria-label="Close"
              className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg border border-line bg-panel2 text-text-sub hover:border-accent/50 hover:text-accent transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Quick parameters bar: Octave, Velocity */}
        <div className="my-1.5 flex flex-wrap items-center justify-between gap-2 font-['JetBrains_Mono'] text-[10px] text-text-sub">
          <div className="flex items-center gap-3">
            {/* Octave Controls */}
            <div className="flex items-center gap-1">
              <span className="text-text-dim">{t("virtual_keyboard_octave")}:</span>
              <button
                type="button"
                onClick={() => setBaseOctave((v) => Math.max(1, v - 1))}
                title="Octave down (Z)"
                className="flex h-5 w-5 items-center justify-center rounded border border-line bg-panel2 hover:bg-line text-text"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span data-testid="musical-typing-octave-display" className="w-8 text-center font-bold text-accent">
                C{baseOctave}
              </span>
              <button
                type="button"
                onClick={() => setBaseOctave((v) => Math.min(7, v + 1))}
                title="Octave up (X)"
                className="flex h-5 w-5 items-center justify-center rounded border border-line bg-panel2 hover:bg-line text-text"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
              <span className="text-[9px] text-text-dim">(Z / X)</span>
            </div>

            {/* Velocity Controls */}
            <div className="flex items-center gap-1.5">
              <span className="text-text-dim">{t("virtual_keyboard_velocity")}:</span>
              <input
                type="range"
                min={1}
                max={127}
                value={velocity}
                onChange={(e) => setVelocity(Number(e.target.value))}
                className="h-1.5 w-20 accent-accent bg-line-subtle rounded cursor-pointer"
              />
              <span data-testid="musical-typing-velocity-display" className="w-7 text-right font-bold text-text">{velocity}</span>
              <span className="text-[9px] text-text-dim">(C / V)</span>
            </div>
          </div>

          <div className="hidden sm:block text-[9px] text-text-dim">
            {t("virtual_keyboard_hint")}
          </div>
        </div>

        {/* Piano Keyboard bed (100% responsive width, Logic Pro style) */}
        <div
          data-testid="musical-typing-keybed"
          className="relative h-24 sm:h-28 md:h-28 w-full select-none rounded-xl border border-black/80 bg-[#0c0e12] p-0.5 sm:p-1 shadow-inner overflow-hidden flex"
          style={{ width: "100%" }}
        >
          {/* White keys container */}
          <div className="relative flex h-full w-full">
            {WHITE_KEYS.map(({ key, offset }) => {
              const midi = baseMidi + offset;
              const isActive = activeMidis.has(midi);
              const noteLabel = midiToNoteName(midi);
              return (
                <div
                  key={`white-${key || offset}`}
                  data-testid={key ? `musical-key-${key}` : undefined}
                  data-midi={midi}
                  data-active={isActive ? "true" : "false"}
                  onPointerDown={() => playNote(midi)}
                  onPointerUp={() => releaseNote(midi)}
                  onPointerLeave={() => releaseNote(midi)}
                  style={{ flex: "1 0 auto", minWidth: "24px" }}
                  className={`relative flex-1 rounded-b-[6px] border-r border-b border-[#b0b3ba] transition-all duration-75 flex flex-col justify-end items-center pb-1.5 cursor-pointer select-none ${
                    isActive
                      ? "bg-gradient-to-t from-accent to-[#ffe28a] text-black shadow-[inset_0_-4px_12px_rgba(0,0,0,0.3),0_0_16px_rgba(245,183,61,0.6)] translate-y-0.5"
                      : "bg-gradient-to-b from-[#f2f3f7] via-[#ffffff] to-[#e0e2e8] text-[#1c1f26] shadow-[0_3px_5px_rgba(0,0,0,0.3)] hover:from-white hover:to-[#ebedf2]"
                  }`}
                >
                  <span className="font-['JetBrains_Mono'] text-[8.5px] sm:text-[9.5px] font-bold tracking-tight">
                    {noteLabel}
                  </span>
                  {key ? (
                    <span className="mt-0.5 flex h-3.5 w-3.5 sm:h-4 sm:w-4 items-center justify-center rounded-full bg-black/10 font-['JetBrains_Mono'] text-[8px] sm:text-[8.5px] font-bold uppercase text-black/70">
                      {key}
                    </span>
                  ) : (
                    <span className="h-3 sm:h-3.5" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Black keys overlaid on top */}
          <div className="pointer-events-none absolute inset-0 px-0.5 sm:px-1">
            {BLACK_KEYS.map(({ key, offset, boundaryIndex }) => {
              const midi = baseMidi + offset;
              const isActive = activeMidis.has(midi);
              const noteLabel = midiToNoteName(midi);
              const leftPercent = (boundaryIndex / WHITE_KEYS.length) * 100;
              return (
                <div
                  key={`black-${key || offset}`}
                  data-testid={key ? `musical-key-${key}` : undefined}
                  data-midi={midi}
                  data-active={isActive ? "true" : "false"}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    playNote(midi);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    releaseNote(midi);
                  }}
                  onPointerLeave={(e) => {
                    e.stopPropagation();
                    releaseNote(midi);
                  }}
                  style={{
                    left: `${leftPercent}%`,
                    transform: "translateX(-50%)",
                    width: `calc(100% / ${WHITE_KEYS.length} * 0.60)`,
                  }}
                  className={`pointer-events-auto absolute top-0.5 sm:top-1 h-[62%] rounded-b-[5px] transition-all duration-75 flex flex-col justify-end items-center pb-1 cursor-pointer z-20 select-none ${
                    isActive
                      ? "bg-gradient-to-t from-accent to-[#ffd060] text-black shadow-[0_0_16px_rgba(245,183,61,0.8)] translate-y-0.5"
                      : "bg-gradient-to-b from-[#2a2d36] via-[#1a1c23] to-[#0d0e12] text-[#b9bdc9] shadow-[0_4px_8px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-[#353945] hover:to-[#171920]"
                  }`}
                >
                  <span className="font-['JetBrains_Mono'] text-[7.5px] sm:text-[8.5px] font-bold text-white/90">
                    {noteLabel}
                  </span>
                  {key ? (
                    <span className="mt-0.5 flex h-3 w-3 sm:h-3.5 sm:w-3.5 items-center justify-center rounded-full bg-white/20 font-['JetBrains_Mono'] text-[7px] sm:text-[7.5px] font-bold uppercase text-white/90">
                      {key}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
