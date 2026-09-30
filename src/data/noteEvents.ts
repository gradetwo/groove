/**
 * Notes, and the one grid that views them.
 *
 * The model stores **`NoteEvent`s** — start, length, pitch, velocity — because that is what a piano roll writes and what a DAW plays. A sixteen-step array cannot express a note that begins between steps, a note held across four of them, or a chord's second
 * voice, and it was the v1 pattern's shape rather than this model's.
 *
 * The step grid is kept as a **view** rather than as the model: a drum part reads well as a row of squares, and the interface has one, so `stepsFromNotes` renders notes as steps and `notesFromSteps` writes a grid back as notes. Both are pure and both
 * are tested, because a conversion that quietly rounds is how a model change loses a performance.
 */
import type { NoteEvent } from "../types/arrangementV2";

/** Sixteenth notes: the grid the interface draws and the resolution the engine's lanes still trigger at. */
export const STEPS_PER_BEAT = 4;
/** Sixteenth steps in a bar of four beats. Bars are the unit an arrangement's length is stated in, because that is the unit a musician counts in. */
export const STEPS_PER_BAR = 16;
/** A step's length in beats, written once. */
export const STEP_BEATS = 1 / STEPS_PER_BEAT;

/**
 * ⭐ **How many beats a bar holds when the bar is not four beats' worth.**
 *
 * `STEPS_PER_BAR` is sixteen, and its own comment says why: "sixteenth steps in a bar of **four** beats". That is
 * right for 4/4 and wrong for everything else, and Muse — composing a piece with a 3/4 movement — had to convert by
 * hand (`ceil(bars × beatsPerBar / 4)`), arithmetic a caller should not be doing and which nothing was watching.
 *
 * **The model has carried the answer all along**: `timeSignature` on the pattern, whose own comment names `"3/4"`,
 * `"6/8"`, `"5/4"` and `"7/8"`. So this reads it, and nothing else changes yet — the constant stays for the 4/4 paths
 * until the callers that must vary are threaded through, which is the step after this one.
 *
 * **The denominator decides the unit**: in `6/8` a beat is an eighth, so a bar is six eighths — twelve sixteenths, the
 * same twelve as `3/4`. Getting that wrong is how a "6/8" ends up twice as long as it sounds, so it is a criterion
 * rather than a comment.
 *
 * Unreadable or absent means 4/4: a pattern that never said is not a pattern that asked for something unusual.
 */
export function beatsPerBar(timeSignature?: string): number {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec((timeSignature ?? "").trim());
  if (!match) return 4;
  const perBar = Number(match[1]);
  const unit = Number(match[2]);
  if (!Number.isFinite(perBar) || !Number.isFinite(unit) || perBar <= 0 || unit <= 0) return 4;
  // Beats counted in quarters — the step's own unit — so `6/8` is three quarters' worth of steps, not six.
  return (perBar * 4) / unit;
}

/** Sixteenth steps in one bar of the given signature, rounded to whole steps. */
export function stepsPerBarFor(timeSignature?: string): number {
  return Math.max(1, Math.round(beatsPerBar(timeSignature) * STEPS_PER_BEAT));
}

export interface StepView {
  /** One entry per step: 1 where a note starts, 0 where none does. */
  steps: number[];
  /** The pitch at each step, or 0 where there is none — the shape the engine's lanes take. */
  pitches: number[];
}

/**
 * Notes as a step grid.
 *
 * A note's start is **rounded to the nearest step**, and that rounding is the honest limit of this view: the engine's lanes trigger at step boundaries, so a note between two steps will play at one of them. The model keeps the true position, so a future
 * playback path that reads beats would not need this function at all.
 *
 * A note is drawn where it **starts**; its length is not drawn, for the reason above.
 */
export function stepsFromNotes(notes: readonly NoteEvent[], stepCount: number): StepView {
  const steps = new Array<number>(stepCount).fill(0);
  const pitches = new Array<number>(stepCount).fill(0);
  for (const note of notes) {
    const index = Math.round(note.startBeats / STEP_BEATS);
    if (index < 0 || index >= stepCount) continue;
    steps[index] = 1;
    // The lowest pitch wins a column: a chord cannot be one value, and reporting the first-listed one would make the result depend on insertion order.
    pitches[index] = pitches[index] === 0 ? note.pitch : Math.min(pitches[index]!, note.pitch);
  }
  return { steps, pitches };
}

/** A step grid as notes, which is what a drum row's squares mean. */
export function notesFromSteps(
  steps: readonly number[],
  { pitches, velocity = 100, lengthBeats = STEP_BEATS }: { pitches?: readonly number[]; velocity?: number; lengthBeats?: number } = {}
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  steps.forEach((value, index) => {
    if (!value) return;
    notes.push({
      pitch: pitches?.[index] ?? 60,
      startBeats: index * STEP_BEATS,
      lengthBeats,
      velocity,
    });
  });
  return notes;
}

/**
 * Add a note, or replace the one already starting there.
 *
 * Replacing rather than stacking: a click on an occupied cell in a roll means "this note", and two notes at the same pitch and position are one note with a doubled voice — the thing a person would hear as a mistake and could not remove with a second click.
 */
export function addNote(notes: readonly NoteEvent[], note: NoteEvent): NoteEvent[] {
  const kept = notes.filter((existing) => !(existing.pitch === note.pitch && sameGridPosition(existing, note)));
  return sortNotes([...kept, note]);
}

/** Remove the note at a position, if there is one; reports whether anything was removed. */
export function removeNote(notes: readonly NoteEvent[], { pitch, startBeats }: { pitch: number; startBeats: number }): NoteEvent[] {
  return notes.filter((note) => !(note.pitch === pitch && sameGridPosition(note, { pitch, startBeats } as NoteEvent)));
}

/** Move a note in time and pitch, refusing a move onto another note rather than silently merging two into one. */
export function moveNote(
  notes: readonly NoteEvent[],
  from: { pitch: number; startBeats: number },
  to: { pitch: number; startBeats: number }
): NoteEvent[] {
  const moving = notes.find((note) => note.pitch === from.pitch && sameGridPosition(note, { pitch: from.pitch, startBeats: from.startBeats } as NoteEvent));
  if (!moving) return [...notes];
  const occupied = notes.some((note) => note !== moving && note.pitch === to.pitch && sameGridPosition(note, { pitch: to.pitch, startBeats: to.startBeats } as NoteEvent));
  if (occupied) return [...notes];
  const moved: NoteEvent = { ...moving, pitch: to.pitch, startBeats: Math.max(0, to.startBeats) };
  return sortNotes(notes.map((note) => (note === moving ? moved : note)));
}

/** Change how long a note is held, with a floor of one step so a note cannot become invisible. */
export function setNoteLength(
  notes: readonly NoteEvent[],
  at: { pitch: number; startBeats: number },
  lengthBeats: number
): NoteEvent[] {
  return notes.map((note) =>
    note.pitch === at.pitch && sameGridPosition(note, { pitch: at.pitch, startBeats: at.startBeats } as NoteEvent)
      ? { ...note, lengthBeats: Math.max(STEP_BEATS, lengthBeats) }
      : note
  );
}

/**
 * Snap a position to the nearest step boundary.
 *
 * Named `snapToStep` rather than folded into `addNote` so a caller can choose: the roll snaps by default because a person drawing on a grid means the grid, and a caller preserving an imported performance does not.
 */
export function snapToStep(beats: number): number {
  return Math.round(beats / STEP_BEATS) * STEP_BEATS;
}

/** Sorted by position, then pitch, so two arrangements built in different orders compare equal. */
export function sortNotes(notes: readonly NoteEvent[]): NoteEvent[] {
  return [...notes].sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch);
}

/** Whether two positions are the same cell. Compared on the step grid, because that is the grid a person clicks. */
function sameGridPosition(a: NoteEvent, b: NoteEvent): boolean {
  return Math.round(a.startBeats / STEP_BEATS) === Math.round(b.startBeats / STEP_BEATS);
}

/**
 * How many steps an arrangement holds: its stated length, or enough to reach its last note — whichever is longer.
 *
 * **The longer of the two, deliberately.** A stated length that is shorter than the notes is not a compression, it is a deletion: the compile would drop everything past the end. A stated length that is longer than the notes is just silence, which is a legitimate thing for an arrangement to contain. So the length is respected and the content is
 * never cut.
 */
export function stepCountFor(notes: readonly NoteEvent[], bars: number | undefined, stepsPerBar: number = STEPS_PER_BAR): number {
    /**
     * ⭐ **The bar's length is a parameter now, and its default is the constant — so nothing that exists changes.**
     *
     * `STEPS_PER_BAR` is sixteen, right for 4/4 and wrong for a 3/4 movement, and Muse had to convert those by hand
     * because there was no way to say otherwise. Threading it in as an **optional third argument defaulting to the
     * constant** means every existing caller keeps exactly the arithmetic it had, while a caller who knows the
     * signature passes `stepsPerBarFor(signature)` and gets twelve where the bar is three quarters.
     *
     * A signature that says nothing is therefore not a regression: the default **is** the old behaviour, which is why
     * this can land without touching a single existing expectation.
     */
    const perBar = Math.max(1, Math.round(stepsPerBar));
    const stated = Math.max(1, Math.round(bars ?? 0)) * perBar;
    const needed = notes.reduce((longest, note) => Math.max(longest, Math.round(note.startBeats * STEPS_PER_BEAT) + 1), 0);
    /**
     * **Rounded up to a whole bar**, because bars are what an arrangement is measured in and a grid of thirty-three steps is two bars and a step — a loop that ends in the middle of a bar is a loop nobody can play along with. The stated length is already a whole number
     * of bars, so this only ever affects the content's reach.
     */
    const spanned = Math.max(perBar, stated, needed);
    return Math.ceil(spanned / perBar) * perBar;
}
