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
 *
 * **Writing is heard, and the keys are this editor's.** A roll that silently wrote a note made a person guess whether the pitch was the one they meant, which is the one thing a roll exists to answer — so a write and a move that lands on a **new pitch** report the pitch through `onAudition`, and the caller sounds it with the engine's own audition path. And `Space`/`Delete` are handled **here, on the editor**, rather than by a second window listener: Cubase's own editor commands are worded "if the editor has the focus" and Live's "when the MIDI Note Editor is focused", because a transport key that also fires while the pointer is in a toolbar is a key that belongs to no surface at all.
 *
 * **The pointer gesture has a backstop.** The destination of a drag is the cell the pointer reaches, so the gesture is read from the cells rather than by capturing the pointer — capture retargets every subsequent event to the capturing element, and the browser then stops running hit tests, which is precisely what a cell-based destination is made of (measured: with capture on, the cells' `pointerenter` never fires). What capture would have bought — a release that always comes home — is bought instead by a window-level `pointerup`: without it, a release over another panel left the drag armed and the *next* gesture moved a note nobody touched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { STEPS_PER_BEAT, STEP_BEATS } from "../../data/noteEvents";
import type { NoteEvent } from "../../types/arrangementV2";
import { DEFAULT_NOTE_CONVENTION, noteName as sharedNoteName, type NoteConvention } from "../../data/pitchTruth";

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
  /**
   * ⭐ **Sound one pitch, right now.** The roll reports and the caller sounds, for the same reason it reports every edit: the player is the view's, and a roll that reached for it could not be rendered as a picture of the notes. Absent means "no instrument to hear", which is a drum or effect track's honest answer rather than a silent write.
   */
  onAudition?: (midi: number) => void;
  /**
   * ⭐ **What the roll has marked, reported outward.** The roll owns the selection; the panel owns the arrangement, so the
   * panel hears about the rectangle it would otherwise have to guess.
   */
  onSelectionChange?: (at: readonly { pitch: number; startBeats: number }[]) => void;
  /**
   * ⭐ **The whole selection removed at once.** Without it the roll reports one note at a time, as it always has; with it the
   * panel commits a single command, so one press is one undo.
   */
  onRemoveSelection?: (at: readonly { pitch: number; startBeats: number }[]) => void;
  /**
   * ⭐ **The velocity of what is selected, and how to change it — inside the roll.**
   *
   * The independent evaluation's finding D4 was "no per-note velocity input": the only velocity on this surface was the
   * slider for notes **not yet written** (below) and the panel's whole-track ramp. The value and the setter are passed
   * in rather than derived here, because the panel already derives "the selection's velocity" for its own toolbar
   * control — one derivation, two places to use it, and no chance of the two readings disagreeing.
   */
  selectionVelocity?: number;
  onSetSelectionVelocity?: (velocity: number) => void;
  /**
   * ⭐ **What `Space` means while this editor has focus.** Optional like the rest: a host with no transport draws a roll whose Space does nothing rather than one that lies about playing.
   */
  onToggleTransport?: () => void;
}

/** Pixels per sixteenth step — the grid's unit, and the scale every position is computed in. */
const CELL = 12;
const ROW_HEIGHT = 16;

/**
 * Whether a keystroke belongs to a text control rather than to the roll.
 *
 * The roll is a focusable editor, so `Space` and `Delete` are its own — but the panel it draws **contains two controls of its own**, a length field and a velocity slider. A key handler on the panel sees every keystroke that bubbles out of them, so without this guard typing a space in the length field would start the transport and `Backspace` in it would delete a note. The shape is the one `useTransportShortcuts.isTextEntryTarget` established, including the `range` exemption (U-09: a focused slider must not permanently kill transport keys), so the two surfaces cannot disagree about what a text field is.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== "function") return false;
  if (element.isContentEditable) return true;
  const editableHost = element.closest<HTMLElement>("[contenteditable]");
  if (editableHost && editableHost.isContentEditable) return true;
  const control = element.closest<HTMLElement>("input, textarea, select");
  if (!control) return false;
  if (control.tagName === "TEXTAREA" || control.tagName === "SELECT") return true;
  const type = (control as HTMLInputElement).type?.toLowerCase() || "text";
  return type !== "range";
}

/** The pitch rows, highest first — the way a roll reads, and the way a keyboard is laid out. */
function pitchRows(low: number, high: number): number[] {
  return Array.from({ length: high - low + 1 }, (_, index) => high - index);
}

/**
 * ⭐ **Note name for a row label, read from the one module that applies a convention.** The roll used to carry its own
 * arithmetic beside it, which is how a project ends up spelling the same number two ways.
 */
export function noteName(pitch: number, convention: NoteConvention = DEFAULT_NOTE_CONVENTION): string {
  return sharedNoteName(pitch, convention);
}

const isBlackKey = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12);

export function PianoRollV2({ notes, onAddNote, onRemoveNote, onMoveNote, onResizeNote, beats = 16, onSetBars, lowPitch = 48, highPitch = 84, onAudition, onSelectionChange, onRemoveSelection, onToggleTransport, selectionVelocity, onSetSelectionVelocity }: PianoRollV2Props) {
  const { t } = useLanguage();
  const [lengthBeats, setLengthBeats] = useState(1);
  const [velocity, setVelocity] = useState(100);
  /**
   * ⭐ **The note a `Delete` would remove — the one the person last put the pointer on**, whether they wrote it or pressed it. The roll had no selection at all, and the keys cannot delete "the selected note" without one; this is the smallest selection that is true, and it never changes what a press means (a press-and-release in place still deletes, as it always did).
   */
  const [selected, setSelected] = useState<readonly { pitch: number; startBeats: number }[]>([]);
  /** ⭐ Whether a note is one of the selected ones, so the mark and the keys agree. */
  /** ⭐ **The one way the selection changes**, so the panel hears about every change and about nothing else. */
  const choose = (next: readonly { pitch: number; startBeats: number }[]) => {
    setSelected(next);
    onSelectionChange?.(next);
  };
  const isSelected = (pitch: number, startBeats: number) =>
    selected.some((c) => c.pitch === pitch && c.startBeats === startBeats);
  /** Where a drag started, and which cell it is over. Only the first is a property of an element, and the pointer moves between cells. */
  const drag = useRef<{ kind: "move" | "resize"; from: { pitch: number; startBeats: number }; to: { pitch: number; startBeats: number } } | undefined>(undefined);
  /** The cell a press started in, so a press that slides without a note under it does not write somewhere the person did not press. */
  const pressed = useRef<{ pitch: number; step: number } | undefined>(undefined);
  /** The panel, so a press on a note can hand it the focus the keys arrive through. */
  const panel = useRef<HTMLDivElement | null>(null);

  /**
   * ⭐ **A gesture that ends anywhere else is cleared, and the clear is unconditional on purpose.**
   *
   * The cells and the notes already clear the gesture themselves when the release is theirs, so a release that did reach one arrives here with nothing left to clear — while a release over the toolbar, over another panel, or outside the window (where no cell can see it) is exactly the case this exists for. Without it the drag stayed armed, and the next press inherited it: measured before the fix, a press on a note released over the grid's own padding, followed by a short slide on two empty cells, **moved the untouched note to a new pitch**.
   *
   * `pointercancel` is the same fact as `pointerup` (the browser suppressing the stream, per the Pointer Events spec) and `blur` is the keyboard's version of it: a gesture is not still in progress because the window went away.
   */
  useEffect(() => {
    const clear = () => {
      drag.current = undefined;
      pressed.current = undefined;
    };
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("blur", clear);
    };
  }, []);

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

  /**
   * One move, in one place: the edit is reported, and **the pitch is heard only when it changed**. A move along the timeline is the same note in another place, and re-sounding it would say the pitch had been edited when nothing about it had.
   */
  const commitMove = useCallback(
    (from: { pitch: number; startBeats: number }, to: { pitch: number; startBeats: number }) => {
      onMoveNote?.(from, to);
      if (to.pitch !== from.pitch) onAudition?.(to.pitch);
    },
    [onMoveNote, onAudition]
  );

  /**
   * ⭐ **`Space` and `Delete`, while this editor has focus** — not on the window, so they cannot be stolen from a field somewhere else, and not from a global listener, so there is no second place that owns them.
   *
   * The two exceptions are both real: a key that arrived in one of the roll's own text controls is left to it, and a **button that is not a grid cell** keeps the Space that activates it (the bar controls). The cells are the editor's own surface, so Space over them is the transport — the same reading Live and Cubase give their editors.
   */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (isTextEntryTarget(event.target)) return;

    if (event.code === "Space" || event.key === " ") {
      const button = (event.target as HTMLElement | null)?.closest?.("button");
      // `data-note` marks the grid's cells; every other button in the panel (add/remove bar) keeps its own Space.
      if (button && button.dataset.note === undefined) return;
      if (onToggleTransport === undefined) return;
      event.preventDefault();
      onToggleTransport();
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      if (selected.length === 0) return;
      // Read from the notes on screen rather than trusted: the selected note may have been removed, moved or never existed as a prop.
      const doomed = notes.filter((candidate) => isSelected(candidate.pitch, candidate.startBeats));
      if (doomed.length === 0) return;
      event.preventDefault();
      choose([]);
      // ⭐ With the whole-selection report the panel commits one command, so one press is one undo; without it the older
      // one-note-at-a-time path stays exactly as it was.
      if (onRemoveSelection) {
        onRemoveSelection(doomed.map((note) => ({ pitch: note.pitch, startBeats: note.startBeats })));
      } else {
        for (const note of doomed) onRemoveNote({ pitch: note.pitch, startBeats: note.startBeats });
      }
    }
  };

  return (
    <div
      ref={panel}
      data-testid="piano-roll-v2"
      /**
       * ⭐ **The editor takes the focus when it is pressed, and is not a tab stop of its own.** `tabIndex={-1}` is deliberate: the cells are already reachable, so the panel needs to be focusable *programmatically* and must not add a second, unlabelled stop to the tab sequence (APG: a composite's tab sequence should carry one entry, and the grid's cells are it).
       */
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-2 p-3 rounded border border-[rgb(var(--d-line))]"
    >
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
            className="w-16 px-1 py-0.5 rounded bg-transparent border border-[rgb(var(--d-line))] text-text"
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
              className="px-2 py-0.5 rounded border border-[rgb(var(--d-line))] text-text"
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
              className="px-2 py-0.5 rounded border border-[rgb(var(--d-line))] text-text"
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
        {/**
          * ⭐ **The selected notes' own velocity, here rather than only in the panel's toolbar.**
          *
          * Finding D4 from the independent evaluation: with a note selected there was no reading and no way to change
          * it — the slider beside this one is for notes not yet written, which is why a probe (and a person) looking
          * *inside the roll* found nothing. Shown only when something is selected, so it cannot be mistaken for the
          * new-note control next to it.
          */}
        {selected.length > 0 && onSetSelectionVelocity !== undefined && (
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-sub">
            {t("roll_selection_velocity")}
            <input
              type="range"
              min={1}
              max={127}
              value={selectionVelocity ?? velocity}
              aria-label={t("roll_selection_velocity")}
              data-testid="roll-selection-velocity"
              onChange={(event) => onSetSelectionVelocity(Number(event.target.value))}
              className="w-24"
            />
            <span data-testid="roll-selection-velocity-value" className="w-8 text-right font-['JetBrains_Mono']">
              {selectionVelocity ?? velocity}
            </span>
          </label>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="flex flex-col" style={{ minWidth: steps * CELL + 48 }} data-testid="roll-grid">
          {rows.map((pitch) => {
            const rowNotes = byRow.get(pitch) ?? [];
            return (
              <div key={pitch} className="flex items-stretch">
                <span
                  className={`w-12 shrink-0 pr-1 text-right font-['JetBrains_Mono'] text-[9px] leading-4 ${
                    /**
                     * ⭐ **A dimmer ink token, not half-transparent ink.** The evaluation measured these 9px labels at
                     * 2.35:1 on the paper skins: `opacity-50` over black ink becomes mid grey, and at 9px the
                     * anti-aliased strokes wash out against the grid. `text-text-sub` is the role for "quieter than
                     * body text" and each skin defines it against its own paper.
                     */
                    pitch % 12 === 0 ? "text-text" : "text-text-sub"
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
                          // Every press in the grid hands the panel the focus, so the keys act on this editor and on nothing else.
                          panel.current?.focus({ preventScroll: true });
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
                              commitMove(started.from, { pitch, startBeats: step * STEP_BEATS });
                            }
                            return;
                          }
                          const from = pressed.current;
                          pressed.current = undefined;
                          // Written where the press started, not where the pointer happens to be: a press that slid across cells without a note under it was not a drag of anything.
                          if (from && from.pitch === pitch && from.step === step) {
                            onAddNote({ pitch, startBeats: step * STEP_BEATS, lengthBeats, velocity });
                            // The note just written is the one the keys act on, and the one worth hearing: a roll that wrote silently made the person guess the pitch.
                            choose([{ pitch, startBeats: step * STEP_BEATS }]);
                            onAudition?.(pitch);
                          } else if (from) {
                            /* ⭐ A drag across cells is a rectangle: one cell writes, more selects what it spanned. */
                            const s0 = Math.min(from.step, step), s1 = Math.max(from.step, step);
                            const p0 = Math.min(from.pitch, pitch), p1 = Math.max(from.pitch, pitch);
                            choose(
                              notes
                                .filter((n) => n.startBeats >= s0 * STEP_BEATS && n.startBeats <= s1 * STEP_BEATS && n.pitch >= p0 && n.pitch <= p1)
                                .map((n) => ({ pitch: n.pitch, startBeats: n.startBeats }))
                            );
                          }
                        }}
                        style={{ width: CELL, height: ROW_HEIGHT }}
                        className={`shrink-0 border-r border-b border-[rgb(var(--d-line))] ${
                          isBlackKey(pitch) ? "bg-[var(--d-panel2,rgba(255,255,255,0.06))]" : "bg-transparent"
                        } ${step % STEPS_PER_BEAT === 0 ? "border-l border-l-[rgb(var(--d-line))]" : ""}`}
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
                        /**
                         * ⭐ **The value the note actually carries.** Measured while authoring: a note element had
                         * `data-length` and **nothing about velocity**, so "the strings are too loud on beat 3" could
                         * not even be *seen* — the only velocity on screen was the slider for notes not yet written.
                         * Exposing it costs one attribute and makes the value readable by a person and by a criterion.
                         */
                        data-velocity={note.velocity}
                        data-selected={isSelected(note.pitch, note.startBeats) ? "true" : "false"}
                        /** No tab stop of its own — the keyboard focuses the one it is asked to, which is what keeps `Delete` aimed at the note a person pressed rather than at the first one in the DOM. */
                        tabIndex={-1}
                        aria-label={t("roll_remove_note", { note: noteName(pitch) })}
                        onPointerDown={() => {
                          drag.current = { kind: "move", from: { pitch, startBeats: note.startBeats }, to: { pitch, startBeats: note.startBeats } };
                          choose([{ pitch, startBeats: note.startBeats }]);
                          panel.current?.focus({ preventScroll: true });
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
                          else commitMove(started.from, { pitch, startBeats: step * STEP_BEATS });
                        }}
                        style={{ left: step * CELL, width: Math.max(CELL, (note.lengthBeats / STEP_BEATS) * CELL), height: ROW_HEIGHT }}
                        className={`absolute top-0 z-10 cursor-grab rounded-sm bg-[rgb(var(--d-accent))] ${
                          isSelected(note.pitch, note.startBeats) ? "outline outline-2 outline-[rgb(var(--d-on-accent))]" : ""
                        }`}
                      >
                        {onResizeNote && (
                          <span
                            data-testid={`roll-resize-${pitch}-${step}`}
                            aria-label={t("roll_resize_note", { note: noteName(pitch) })}
                            onPointerDown={(event) => {
                              // The handle is inside the note, so the body's drag must not also start: the intention here is length, not position.
                              event.stopPropagation();
                              drag.current = { kind: "resize", from: { pitch, startBeats: note.startBeats }, to: { pitch, startBeats: note.startBeats } };
                              // Grabbing the edge is still aiming at this note, so the keys keep acting on it.
                              choose([{ pitch, startBeats: note.startBeats }]);
                              panel.current?.focus({ preventScroll: true });
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
