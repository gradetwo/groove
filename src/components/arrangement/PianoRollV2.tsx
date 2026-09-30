/**
 * The piano roll: notes entered where they sit in time and pitch.
 *
 * The keyboard next to it **plays**; this **writes**. The owner asked for both, and the reason the model was replaced before this component exists is here: a note has a start, a length, a pitch and a velocity, and a sixteen-step array cannot hold the first two — so a
 * roll drawn over a step array would have been a picture of something the model could not store.
 *
 * **What this version does, stated plainly rather than implied by its shape**: click an empty cell to write a note at that pitch and position, click a note to remove it. Length comes from the control above, not from dragging an edge — dragging is the next piece of work, and a roll
 * that looked draggable and was not would be worse than one that plainly is not.
 */
import { useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { STEPS_PER_BEAT, STEP_BEATS } from "../../data/noteEvents";
import type { NoteEvent } from "../../types/arrangementV2";

export interface PianoRollV2Props {
  notes: readonly NoteEvent[];
  /** Write one. The parent owns the arrangement, so the roll reports rather than mutates. */
  onAddNote: (note: NoteEvent) => void;
  onRemoveNote: (at: { pitch: number; startBeats: number }) => void;
  /** How much time to show. Four bars of sixteenths is 64 steps, which fits a screen without horizontal scrolling at this pitch range. */
  beats?: number;
  /** The lowest and highest pitch drawn. A window rather than the whole 128, because 128 rows is a scroll bar where a melody is a glance. */
  lowPitch?: number;
  highPitch?: number;
}

/** The pitch rows, highest first — the way a roll reads, and the way a keyboard is laid out. */
function pitchRows(low: number, high: number): number[] {
  return Array.from({ length: high - low + 1 }, (_, index) => high - index);
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** Note name for a row label, so a pitch is readable without counting semitones from C4. */
export function noteName(pitch: number): string {
  return `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function PianoRollV2({ notes, onAddNote, onRemoveNote, beats = 16, lowPitch = 48, highPitch = 84 }: PianoRollV2Props) {
  const { t } = useLanguage();
  const [lengthBeats, setLengthBeats] = useState(1);
  const [velocity, setVelocity] = useState(100);

  const steps = Math.round(beats * STEPS_PER_BEAT);
  const rows = useMemo(() => pitchRows(lowPitch, highPitch), [lowPitch, highPitch]);

  /**
   * Notes indexed by the cell they start in. A note between steps is drawn at the step it rounds to, which is the same rounding the playback path does — so what a person sees is what will be heard.
   */
  const byCell = useMemo(() => {
    const map = new Map<string, NoteEvent>();
    for (const note of notes) {
      const step = Math.round(note.startBeats / STEP_BEATS);
      if (step < 0 || step >= steps) continue;
      map.set(`${note.pitch}:${step}`, note);
    }
    return map;
  }, [notes, steps]);

  return (
    <div data-testid="piano-roll-v2" className="flex flex-col gap-2 p-3 rounded border border-[var(--d-border,rgba(255,255,255,0.15))]">
      <div className="flex flex-wrap items-center gap-3 text-xs text-text opacity-80">
        <span>{t("roll_hint")}</span>
        <label className="flex items-center gap-2">
          {t("roll_length")}
          <input
            type="number"
            min={STEP_BEATS}
            max={8}
            step={STEP_BEATS}
            value={lengthBeats}
            aria-label={t("roll_length")}
            onChange={(event) => setLengthBeats(Math.max(STEP_BEATS, Number(event.target.value)))}
            className="w-16 px-1 py-0.5 rounded bg-transparent border border-[var(--d-border,rgba(255,255,255,0.15))] text-text"
          />
        </label>
        <label className="flex items-center gap-2">
          {t("keyboard_velocity")}
          <input
            type="range"
            min={1}
            max={127}
            value={velocity}
            aria-label={t("keyboard_velocity")}
            onChange={(event) => setVelocity(Number(event.target.value))}
            className="w-24"
          />
          <span data-testid="roll-velocity-value" className="w-8 text-right font-['JetBrains_Mono']">{velocity}</span>
        </label>
      </div>
      <div className="overflow-x-auto">
        <div className="flex flex-col" style={{ minWidth: steps * 12 + 48 }}>
          {rows.map((pitch) => (
            <div key={pitch} className="flex items-stretch">
              <span
                className={`w-12 shrink-0 pr-1 text-right font-['JetBrains_Mono'] text-[9px] leading-4 ${
                  pitch % 12 === 0 ? "text-text" : "text-text opacity-50"
                }`}
              >
                {noteName(pitch)}
              </span>
              <div className="flex flex-1">
                {Array.from({ length: steps }, (_, step) => {
                  const note = byCell.get(`${pitch}:${step}`);
                  // A black key's row is shaded, which is what makes a roll readable at a glance rather than a grid of identical squares.
                  const black = [1, 3, 6, 8, 10].includes(pitch % 12);
                  return (
                    <button
                      key={step}
                      type="button"
                      data-testid={`roll-cell-${pitch}-${step}`}
                      data-note={note ? "true" : "false"}
                      aria-label={note ? t("roll_remove_note", { note: noteName(pitch) }) : t("roll_add_note", { note: noteName(pitch) })}
                      onClick={() =>
                        note
                          ? onRemoveNote({ pitch, startBeats: note.startBeats })
                          : onAddNote({ pitch, startBeats: step * STEP_BEATS, lengthBeats, velocity })
                      }
                      /**
                       * The width is the note's own length when it has one, so a whole note looks like a whole note; an empty cell is one step wide, which is the grid a click lands on.
                       */
                      style={note ? { width: Math.max(1, note.lengthBeats / STEP_BEATS) * 12 } : { width: 12 }}
                      className={`h-4 shrink-0 border-r border-b border-[var(--d-border,rgba(255,255,255,0.06))] ${
                        note
                          ? "rounded-sm bg-[var(--d-accent)]"
                          : black
                          ? "bg-[var(--d-panel2,rgba(255,255,255,0.06))]"
                          : "bg-transparent"
                      } ${step % STEPS_PER_BEAT === 0 ? "border-l border-l-[var(--d-border,rgba(255,255,255,0.2))]" : ""}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
