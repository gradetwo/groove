/**
 * Keyboard model for the piano roll (U10).
 *
 * ## Why a cursor instead of 200 tab stops
 *
 * The roll draws one absolutely-positioned div per sounding note inside one scrolling surface. That
 * DOM is not a table: there are no rows that could be `role="row"`, so calling each note a
 * `gridcell` would be invalid ARIA rather than better ARIA — a `gridcell` has to sit inside a row.
 * Restructuring the layers into per-pitch rows is not a small change, and it would move the
 * hit-testing surface that the pointer tools and `probe:grid-gutter` both depend on.
 *
 * So the editor is exposed the way a canvas-like widget has to be: **one focusable surface with a
 * cursor inside it**. The cursor is the same thing the pointer already has — the row guideline
 * follows `hoverCell` today — and every key acts on whatever note sits under it. That gives each
 * editing operation a keyboard path (create, delete, change velocity) without inventing semantics
 * the DOM cannot honestly carry. What a screen reader hears is the live region describing the cell
 * the cursor is on, not two hundred unlabelled divs.
 *
 * The mapping lives here, as a pure function, so the component only has to dispatch the intent.
 */

export interface RollCursor {
  stepIdx: number;
  midi: number;
}

/** What the cursor is allowed to be, and how far one keypress moves it. */
export interface RollKeyboardBounds {
  stepCount: number;
  /** Steps per bar: Shift+Left/Right moves a bar at a time. */
  barSteps: number;
  /** Inclusive pitch range of the drawn rows. */
  loMidi: number;
  hiMidi: number;
}

export type RollKeyboardIntent =
  | { kind: "move"; cursor: RollCursor }
  | { kind: "toggle" }
  | { kind: "delete" }
  | { kind: "velocity"; delta: number }
  | { kind: "length"; delta: number };

const SEMITONES_PER_OCTAVE = 12;
const VELOCITY_STEP = 1;
/** Shift+`+`/`-`: big enough to be worth a modifier, small enough to stay controllable. */
const VELOCITY_STEP_LARGE = 10;
/** `[`/`]` lengthen and shorten a note by a step; Shift does a beat (four steps). */
const LENGTH_STEP = 1;
const LENGTH_STEP_LARGE = 4;
/** Gate used for a note created by the keyboard, matching the pencil's own default. */
export const KEYBOARD_DEFAULT_GATE = 0.8;

/**
 * Keeps the cursor inside the clip and the drawn rows.
 *
 * The bounds are the *rendered* pitch range rather than the whole MIDI range: a cursor that walked
 * onto a pitch with no row would move somewhere the user cannot see.
 */
export function clampCursor(cursor: RollCursor, bounds: RollKeyboardBounds): RollCursor {
  const loMidi = Math.min(bounds.loMidi, bounds.hiMidi);
  const hiMidi = Math.max(bounds.loMidi, bounds.hiMidi);
  const lastStep = Math.max(0, bounds.stepCount - 1);
  return {
    stepIdx: Math.min(Math.max(0, Math.round(cursor.stepIdx)), lastStep),
    midi: Math.min(Math.max(loMidi, Math.round(cursor.midi)), hiMidi),
  };
}

/**
 * The intent behind a keypress, or null when the roll should not touch the key.
 *
 * `null` is deliberate for anything with ⌘/Ctrl held: those combinations belong to the browser or
 * the platform (⌘←, Ctrl+Delete), and swallowing them in an editor that is one panel of a larger
 * app is how a keyboard shortcut stops working everywhere else.
 */
export function rollKeyboardIntent(
  key: string,
  modifiers: { shift?: boolean; meta?: boolean; ctrl?: boolean },
  cursor: RollCursor,
  bounds: RollKeyboardBounds
): RollKeyboardIntent | null {
  if (modifiers.meta || modifiers.ctrl) return null;
  const shift = Boolean(modifiers.shift);
  const move = (dStep: number, dMidi: number): RollKeyboardIntent => ({
    kind: "move",
    cursor: clampCursor(
      { stepIdx: cursor.stepIdx + dStep, midi: cursor.midi + dMidi },
      bounds
    ),
  });

  switch (key) {
    case "ArrowLeft":
      return move(-(shift ? bounds.barSteps : 1), 0);
    case "ArrowRight":
      return move(shift ? bounds.barSteps : 1, 0);
    case "ArrowUp":
      return move(0, shift ? SEMITONES_PER_OCTAVE : 1);
    case "ArrowDown":
      return move(0, shift ? -SEMITONES_PER_OCTAVE : -1);
    case "Home":
      return { kind: "move", cursor: clampCursor({ ...cursor, stepIdx: 0 }, bounds) };
    case "End":
      return {
        kind: "move",
        cursor: clampCursor({ ...cursor, stepIdx: bounds.stepCount - 1 }, bounds),
      };
    case "Enter":
    case " ":
      return { kind: "toggle" };
    case "Delete":
    case "Backspace":
      return { kind: "delete" };
    case "+":
    case "=":
      return { kind: "velocity", delta: shift ? VELOCITY_STEP_LARGE : VELOCITY_STEP };
    case "-":
    case "_":
      return { kind: "velocity", delta: shift ? -VELOCITY_STEP_LARGE : -VELOCITY_STEP };
    case "[":
      return { kind: "length", delta: shift ? -LENGTH_STEP_LARGE : -LENGTH_STEP };
    case "]":
      return { kind: "length", delta: shift ? LENGTH_STEP_LARGE : LENGTH_STEP };
    default:
      return null;
  }
}

/**
 * Keyboard on the pitch gutter — the on-screen piano (U10).
 *
 * The gutter could only be played with a pointer: press a key, hear the pitch, slide across the
 * keys to glissando. A keyboard user had no way to hear a pitch without *writing* a note first,
 * which is backwards — the point of the gutter is to listen before deciding.
 *
 * So the keys become a roving tab stop: arrows walk one key at a time (Shift or PageUp/PageDown an
 * octave) and audition as they move, exactly what a pointer drag across the keys does, and
 * Enter/Space re-auditions the key under focus. Anything with ⌘/Ctrl held is left to the platform,
 * as everywhere else in this editor.
 */
export interface KeybedBounds {
  loMidi: number;
  hiMidi: number;
}

export type KeybedIntent =
  /** Walk to another key and sound it on the way. */
  | { kind: "move"; midi: number }
  /** Sound the key that already has focus. */
  | { kind: "audition"; midi: number };

export function keybedIntent(
  key: string,
  modifiers: { shift?: boolean; meta?: boolean; ctrl?: boolean },
  midi: number,
  bounds: KeybedBounds
): KeybedIntent | null {
  if (modifiers.meta || modifiers.ctrl) return null;
  const shift = Boolean(modifiers.shift);
  const lo = Math.min(bounds.loMidi, bounds.hiMidi);
  const hi = Math.max(bounds.loMidi, bounds.hiMidi);
  const to = (target: number): KeybedIntent => ({
    kind: "move",
    midi: Math.min(hi, Math.max(lo, Math.round(target))),
  });

  switch (key) {
    case "ArrowUp":
      return to(midi + (shift ? SEMITONES_PER_OCTAVE : 1));
    case "ArrowDown":
      return to(midi - (shift ? SEMITONES_PER_OCTAVE : 1));
    case "PageUp":
      return to(midi + SEMITONES_PER_OCTAVE);
    case "PageDown":
      return to(midi - SEMITONES_PER_OCTAVE);
    case "Home":
      return to(lo);
    case "End":
      return to(hi);
    case "Enter":
    case " ":
      return { kind: "audition", midi: Math.min(hi, Math.max(lo, Math.round(midi))) };
    default:
      return null;
  }
}

/** The measured cell grid and scroll viewport, for keeping the cursor on screen. */
export interface RollRevealInput {
  stepIdx: number;
  rowIdx: number;
  cellW: number;
  rowH: number;
  viewW: number;
  viewH: number;
  scrollLeft: number;
  scrollTop: number;
}

/**
 * The scroll offsets that bring the cursor's cell into view, or the current ones when it already is.
 *
 * A pointer never needed this — the user drags the viewport themselves — but a keyboard cursor that
 * walks out of the viewport looks like a keypress that did nothing. One cell of margin keeps the
 * cursor off the very edge so the next step is already visible instead of scrolling one cell at a
 * time. An unmeasured viewport (0) returns the inputs untouched rather than scrolling into nowhere.
 */
export function scrollToRevealCursor(input: RollRevealInput): { left: number; top: number } {
  const { cellW, rowH, viewW, viewH, scrollLeft, scrollTop } = input;
  if (viewW <= 0 || viewH <= 0) return { left: scrollLeft, top: scrollTop };

  const cellLeft = input.stepIdx * cellW;
  const cellRight = cellLeft + cellW;
  const cellTop = input.rowIdx * rowH;
  const cellBottom = cellTop + rowH;

  let left = scrollLeft;
  let top = scrollTop;
  if (cellLeft < scrollLeft + cellW) left = Math.max(0, cellLeft - cellW);
  else if (cellRight > scrollLeft + viewW - cellW) left = Math.max(0, cellRight + cellW - viewW);
  if (cellTop < scrollTop + rowH) top = Math.max(0, cellTop - rowH);
  else if (cellBottom > scrollTop + viewH - rowH) top = Math.max(0, cellBottom + rowH - viewH);

  return { left, top };
}
