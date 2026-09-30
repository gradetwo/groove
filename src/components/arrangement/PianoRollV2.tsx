/**
 * The piano roll: notes entered where they sit in time and pitch.
 *
 * The keyboard beside it **plays**; this **writes**. The owner asked for both, and this is why the model was replaced first: a note has a start, a length, a pitch and a velocity, and a sixteen-step array cannot hold the first two — a roll drawn over a step array would
 * be a picture of something the model could not store.
 *
 * **The grid is fixed and the notes float over it.** The first version widened the cell a note started in, which pushed every later cell in that row to the right — so the same beat landed at a different x on every row and the roll stopped being a grid. Now each row is one
 * absolutely-positioned layer per note over a row of fixed cells, and a note's width is its length without moving anything else.
 *
 * Gestures, and what distinguishes them:
 *
 *   · **click an empty cell** writes a note there, with the length and velocity from the controls above;
 *   · **click a note** removes it;
 *   · **drag a note's body** moves it in pitch and time;
 *   · **drag its right edge** changes how long it is held.
 *
 * A press on a note is not yet a click and not yet a drag, so the two are told apart when the pointer comes up: moving nothing means "delete", moving somewhere means "move". That is the same distinction Logic makes, and it is why a person who meant to delete does not move
 * anything and a person who meant to move does not delete.
 */
import { useMemo, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { STEPS_PER_BEAT, STEP_BEATS } from "../../data/noteEvents";
import type { NoteEvent } from "../../types/arrangementV2";

export interface PianoRollV2Props {
  notes: readonly NoteEvent[];
  /** Write one. The parent owns the arrangement, so the roll reports rather than mutates. */
  onAddNote: (note: NoteEvent) => void;
  onRemoveNote: (at: { pitch: number; startBeats: number }) => void;
  /** Drag a note to a new pitch and position. Optional, so the roll can be rendered as a picture of the notes rather than as an editor. */
  onMoveNote?: (from: { pitch: number; startBeats: number }, to: { pitch: number; startBeats: number }) => void;
  /** Drag a note's right edge. Separate from moving because they are separate intentions, and a body that resized is a control nobody can aim. */
  onResizeNote?: (at: { pitch: number; startBeats: number }, lengthBeats: number) => void;
  /** How much time to show — the arrangement's own length, so the roll and the transport agree about where the end is. */
  beats?: number;
  /** Adding and removing bars, when the caller can change the arrangement's length. Optional, so the roll can still be a picture. */
  onSetBars?: (bars: number) => void;
  /** The lowest and highest pitch drawn. A window rather than all 128, because 128 rows is a scroll bar where a melody is a glance. */
  lowPitch?: number;
  highPitch?: number;
}

/** Pixels per sixteenth step — the grid's unit, and the scale every position is computed in. */
const CELL = 12;
const ROW_HEIGHT = 16;

/** The pitch rows, highest first — the way a roll reads, and the way a keyboard is laid out. */
function pitchRows(low: number, high: number): number[] {
  return Array.from({ length: high - low + 1 }, (_, index) => high - index);
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** Note name for a row label, so a pitch is readable without counting semitones from C4. */
export function noteName(pitch: number): string {
  return `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

const isBlackKey = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);

export function PianoRollV2({ notes, onAddNote, onRemoveNote, onMoveNote, onResizeNote, beats = 16, onSetBars, lowPitch = 48, highPitch = 84 }: PianoRollV2Props) {
  const { t } = useLanguage();
  const [lengthBeats, setLengthBeats] = useState(1);
  const [velocity, setVelocity] = useState(100);
  /** Where a drag started, and which cell it is over. Only the first is a property of an element, and the pointer moves between cells. */
  const drag = useRef<{ kind: "move" | "resize"; from: { pitch: number; startBeats: number }; to: { pitch: number; startBeats: number } } | undefined>(undefined);
  /** The cell a press started in, so a press that slides without a note under it does not write somewhere the person did not press. */
  const pressed = useRef<{ pitch: number; step: number } | undefined>(undefined);

  const steps = Math.round(beats * STEPS_PER_BEAT);
  const rows = useMemo(() => pitchRows(lowPitch, highPitch), [lowPitch, highPitch]);
  /** Notes by the cell they start in: a note between steps is drawn where the playback path will place it, so the picture and the sound agree. */
  const byRow = useMemo(() => {
    const map = new Map<number, NoteEvent[]>();
    for (const note of notes) {
      const step = Math.round(note.startBeats / STEP_BEATS);
      if (step < 0 || step >= steps) continue;
      const list = map.get(note.pitch) ?? [];
      list.push(note);
      map.set(note.pitch, list);
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
        {onSetBars && (
          /**
           * **The length is edited where it is felt.** Logic puts the end of the arrangement on the timeline; here the roll is what shows the whole thing, so the two buttons that change it belong at its head rather than in a settings panel somewhere else.
           */
          <span className="flex items-center gap-1">
            <button
              type="button"
              data-testid="roll-remove-bar"
              aria-label={t("roll_remove_bar")}
              onClick={() => onSetBars(Math.max(1, Math.round(beats / 4) - 1))}
              className="px-2 py-0.5 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] text-text"
            >
              −
            </button>
            <span data-testid="roll-bars" className="font-['JetBrains_Mono']">
              {Math.round(beats / 4)} {t("roll_bars_unit")}
            </span>
            <button
              type="button"
              data-testid="roll-add-bar"
              aria-label={t("roll_add_bar")}
              onClick={() => onSetBars(Math.round(beats / 4) + 1)}
              className="px-2 py-0.5 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] text-text"
            >
              +
            </button>
          </span>
        )}
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
        <div className="flex flex-col" style={{ minWidth: steps * CELL + 48 }} data-testid="roll-grid">
          {rows.map((pitch) => {
            const rowNotes = byRow.get(pitch) ?? [];
            return (
              <div key={pitch} className="flex items-stretch">
                <span
                  className={`w-12 shrink-0 pr-1 text-right font-['JetBrains_Mono'] text-[9px] leading-4 ${
                    pitch % 12 === 0 ? "text-text" : "text-text opacity-50"
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  {noteName(pitch)}
                </span>
                {/* One positioned layer per row: the cells are the click grid, and the notes sit above them without moving any of them. */}
                <div className="relative" style={{ width: steps * CELL, height: ROW_HEIGHT }}>
                  <div className="absolute inset-0 flex">
                    {Array.from({ length: steps }, (_, step) => (
                      <button
                        key={step}
                        type="button"
                        data-testid={`roll-cell-${pitch}-${step}`}
                        data-note="false"
                        aria-label={t("roll_add_note", { note: noteName(pitch) })}
                        /**
                         * **Every gesture is a pointer gesture**, because the destination of a drag is read from the cell the pointer reaches — and a cell that only listened for clicks could not be a destination. Press and release in one cell writes a note; a drag that ends here moves the note
                         * that was dragged.
                         */
                        onPointerDown={() => {
                          pressed.current = { pitch, step };
                        }}
                        onPointerEnter={() => {
                          if (drag.current) drag.current = { ...drag.current, to: { pitch, startBeats: step * STEP_BEATS } };
                        }}
                        onPointerUp={() => {
                          const started = drag.current;
                          drag.current = undefined;
                          if (started) {
                            // A drag that ended on a cell rather than on the note it started from still moves it — the pointer is where the person is looking.
                            if (started.to.pitch !== started.from.pitch || Math.round(started.to.startBeats / STEP_BEATS) !== Math.round(started.from.startBeats / STEP_BEATS)) {
                              onMoveNote?.(started.from, { pitch, startBeats: step * STEP_BEATS });
                            }
                            return;
                          }
                          const from = pressed.current;
                          pressed.current = undefined;
                          // Written where the press started, not where the pointer happens to be: a press that slid across cells without a note under it was not a drag of anything.
                          if (from && from.pitch === pitch && from.step === step) {
                            onAddNote({ pitch, startBeats: step * STEP_BEATS, lengthBeats, velocity });
                          }
                        }}
                        style={{ width: CELL, height: ROW_HEIGHT }}
                        className={`shrink-0 border-r border-b border-[var(--d-border,rgba(255,255,255,0.06))] ${
                          isBlackKey(pitch) ? "bg-[var(--d-panel2,rgba(255,255,255,0.06))]" : "bg-transparent"
                        } ${step % STEPS_PER_BEAT === 0 ? "border-l border-l-[var(--d-border,rgba(255,255,255,0.2))]" : ""}`}
                      />
                    ))}
                  </div>
                  {rowNotes.map((note) => {
                    const step = Math.round(note.startBeats / STEP_BEATS);
                    return (
                      <div
                        key={`${note.pitch}-${note.startBeats}`}
                        data-testid={`roll-note-${pitch}-${step}`}
                        data-note="true"
                        data-length={note.lengthBeats}
                        aria-label={t("roll_remove_note", { note: noteName(pitch) })}
                        onPointerDown={() => {
                          drag.current = { kind: "move", from: { pitch, startBeats: note.startBeats }, to: { pitch, startBeats: note.startBeats } };
                        }}
                        onPointerEnter={() => {
                          if (drag.current) drag.current = { ...drag.current, to: { pitch, startBeats: step * STEP_BEATS } };
                        }}
                        onPointerUp={() => {
                          const started = drag.current;
                          drag.current = undefined;
                          if (!started) return;
                          const samePlace = started.to.pitch === pitch && Math.round(started.to.startBeats / STEP_BEATS) === step;
                          if (samePlace) onRemoveNote({ pitch, startBeats: note.startBeats });
                          else onMoveNote?.(started.from, { pitch, startBeats: step * STEP_BEATS });
                        }}
                        style={{ left: step * CELL, width: Math.max(CELL, (note.lengthBeats / STEP_BEATS) * CELL), height: ROW_HEIGHT }}
                        className="absolute top-0 z-10 cursor-grab rounded-sm bg-[var(--d-accent)]"
                      >
                        {onResizeNote && (
                          <span
                            data-testid={`roll-resize-${pitch}-${step}`}
                            aria-label={t("roll_resize_note", { note: noteName(pitch) })}
                            onPointerDown={(event) => {
                              // The handle is inside the note, so the body's drag must not also start: the intention here is length, not position.
                              event.stopPropagation();
                              drag.current = { kind: "resize", from: { pitch, startBeats: note.startBeats }, to: { pitch, startBeats: note.startBeats } };
                            }}
                            onPointerEnter={() => {
                              if (drag.current?.kind === "resize") drag.current = { ...drag.current, to: { pitch, startBeats: step * STEP_BEATS } };
                            }}
                            onPointerUp={(event) => {
                              event.stopPropagation();
                              const started = drag.current;
                              drag.current = undefined;
                              if (!started || started.kind !== "resize") return;
                              // A drag whose end is the note's own start is a click, and a zero-length note is not a note.
                              if (started.to.startBeats <= note.startBeats) return;
                              // The edge lands at the **start** of the cell the pointer is over, which makes a drag to step 12 a twelve-step note rather than a thirteen-step one — the reading a person gets from watching the note's right edge sit under the pointer.
                              onResizeNote(note, Math.round((started.to.startBeats - note.startBeats) / STEP_BEATS) * STEP_BEATS);
                            }}
                            style={{ width: 4, height: ROW_HEIGHT }}
                            className="absolute right-0 top-0 cursor-col-resize bg-[var(--d-ink,rgba(0,0,0,0.4))]"
                          />
                        )}
                      </div>
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
}
