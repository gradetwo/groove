/**
 * Note transforms: the pure half of the note editor.
 *
 * Everything here takes notes and returns notes. No audio, no store, no DOM — which is what makes the editor's behaviour
 * testable and, more importantly, what makes it possible to say **what** quantise or swing does without listening to it.
 * The view layer will call these; nothing in the render path changes because of them.
 *
 * The definitions are the ones a reader coming from a DAW expects, and they are written down because "quantise" and
 * "swing" each mean several things:
 *
 * * **quantise** moves a note's *start* towards the nearest grid line by `strength` (1 = onto it, 0.5 = halfway). It never
 *   touches pitch, length or velocity, and it never *shortens* a note below the grid unless the caller asked (see the
 *   `keepLength` note below).
 * * **swing** delays every note whose start is on an off-beat odd position by up to `amount` of a step. Extreme values
 *   turn a straight pair into a triplet feel, which is the point, so `amount` is clamped to 2/3 rather than to 1.
 * * **scale snapping** moves a pitch to the nearest degree of a scale without changing the octave it sits in.
 */
import type { LaneNote, NoteTrackId } from "./noteLayer";

const EPSILON = 1e-6;

/** The nearest grid line to a position, and how far away it is. */
function nearestGrid(startStep: number, grid: number): { line: number; distance: number } {
  const line = Math.round(startStep / grid) * grid;
  return { line, distance: Math.abs(startStep - line) };
}

/**
 * Move note starts towards a grid.
 *
 * `grid` is in steps (1 = every step, 0.25 = 16th-of-a-step triplets, 2 = every other step) and `strength` is 0…1.
 * A note already on the grid does not move at all, whatever the strength, which is what makes the transform idempotent —
 * the property the tests lean on.
 */
export function quantiseNotes(notes: readonly LaneNote[], grid: number, strength = 1): LaneNote[] {
  if (!(grid > 0) || !Number.isFinite(grid)) return [...notes];
  const amount = Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 1));
  return notes.map((note) => {
    const { line } = nearestGrid(note.startStep, grid);
    if (Math.abs(note.startStep - line) < EPSILON || amount === 0) return { ...note };
    return { ...note, startStep: note.startStep + (line - note.startStep) * amount };
  });
}

/**
 * Delay the off-beats.
 *
 * The classic definition, stated so it cannot drift: with `stepsPerBeat` steps in a beat, a note sitting on the **half
 * beat** is late by `amount × stepsPerBeat / 6`; everything else is untouched. That divisor is the whole definition: at
 * `amount` 1 the off-beat moves from half a beat to two thirds of one (`stepsPerBeat/6` is exactly the difference), which
 * is the triplet feel swing is *for*, and it is therefore also the maximum. `amount` is clamped to 0…1, so no value can
 * push the off-beat past the next downbeat.
 */
export function swingNotes(notes: readonly LaneNote[], amount: number, stepsPerBeat = 4): LaneNote[] {
  if (!(stepsPerBeat > 0) || !Number.isFinite(stepsPerBeat)) return [...notes];
  const halfBeat = stepsPerBeat / 2;
  const requested = Number.isFinite(amount) ? amount : 0;
  if (requested === 0) return notes.map((note) => ({ ...note }));
  // 0…1 of the way from half a beat to two thirds of one, which is `stepsPerBeat / 6` steps at full amount.
  const delay = Math.min(1, Math.abs(requested)) * (stepsPerBeat / 6);
  return notes.map((note) => {
    const withinBeat = ((note.startStep % stepsPerBeat) + stepsPerBeat) % stepsPerBeat;
    const isOffBeat = Math.abs(withinBeat - halfBeat) < EPSILON;
    if (!isOffBeat) return { ...note };
    return { ...note, startStep: note.startStep + delay };
  });
}

/** A scale as semitone degrees from the root, ascending, within one octave (e.g. minor pentatonic `[0, 3, 5, 7, 10]`). */
export type ScaleDegrees = readonly number[];

/**
 * Snap pitches to a scale, keeping each note in the octave it was in.
 *
 * A pitch already in the scale is returned untouched, so snapping twice is the same as snapping once. The scan runs
 * upwards from six semitones below, and only a strictly closer degree replaces the current best, so a tie resolves to the
 * **lower** degree — a decision rather than an accident, since the lower degree keeps a melody under the note before it
 * instead of leaping over. (With integer pitches and integer degrees a tie cannot actually arise; the order is what makes
 * that a stated property rather than a coincidence.)
 */
export function snapNotesToScale(notes: readonly LaneNote[], degrees: ScaleDegrees): LaneNote[] {
  const set = [...new Set(degrees.filter((degree) => Number.isFinite(degree)).map((degree) => ((degree % 12) + 12) % 12))];
  if (set.length === 0) return [...notes];
  return notes.map((note) => {
    if (note.pitch <= 0) return { ...note }; // a drum has no key
    const pitchClass = ((note.pitch % 12) + 12) % 12;
    if (set.includes(pitchClass)) return { ...note };
    let best = note.pitch;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let delta = -6; delta <= 6; delta += 1) {
      const candidate = note.pitch + delta;
      const candidateClass = ((candidate % 12) + 12) % 12;
      if (!set.includes(candidateClass)) continue;
      // Strictly closer wins, and the scan is ascending, so an exact tie keeps the lower degree.
      const distance = Math.abs(delta);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return { ...note, pitch: best };
  });
}

/** Move every note by semitones. Clamped to the MIDI range rather than silently wrapping an octave. */
export function transposeNotes(notes: readonly LaneNote[], semitones: number): LaneNote[] {
  const delta = Math.round(Number.isFinite(semitones) ? semitones : 0);
  if (delta === 0) return notes.map((note) => ({ ...note }));
  return notes.map((note) => {
    if (note.pitch <= 0) return { ...note }; // a drum has no key
    return { ...note, pitch: Math.min(127, Math.max(1, note.pitch + delta)) };
  });
}

/**
 * Give a selection one length, keeping each note's start.
 *
 * The transform a "make these staccato/legato" command is built from, and the reason it is here rather than in a view: the
 * minimum is a *musical* choice (an editor should not be able to write a zero-length note that the scheduler then has to
 * invent a floor for), and it is stated once.
 */
export function setNoteLength(notes: readonly LaneNote[], durationSteps: number, minimum = 1 / 32): LaneNote[] {
  const length = Number.isFinite(durationSteps) ? Math.max(minimum, durationSteps) : minimum;
  return notes.map((note) => ({ ...note, durationSteps: length }));
}

/** Keep a note's identity when a transform is applied to a subset — the shape a selection has. */
export function notesForTrack(notes: readonly LaneNote[], trackId: NoteTrackId): LaneNote[] {
  return notes.filter((note) => note.trackId === trackId);
}
