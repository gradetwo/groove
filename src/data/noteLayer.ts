/**
 * The note layer: a lane's music as **notes**, not as a step lattice.
 *
 * ## Why this exists
 *
 * Every lane in the catalogue is a step array — `steps`, `pitch`, `velocity`, `gate` — which caps a note's length at
 * multiples of a 16th, puts every onset on the grid, and binds a note's velocity and duration to a *cell*. The product's
 * direction (see `docs/PRO_EDITOR_PLAN.md`) is a Logic-style editor in which the step sequencer is **one view**, so the
 * lane's truth has to be a note list and the grid has to be a projection of it.
 *
 * ## The shape
 *
 * A note carries what the engine can already address per note — `noteAt` / `noteOnAt` / `noteOffAt` are frame-based, and
 * velocity, pan and tuning are per note since ABI 9 — plus a duration and a start, **both in steps as a float**. Steps
 * rather than seconds because the tempo can change and because the grid is expressed in steps; the conversion to frames
 * happens once, where the schedule is built (`planGs1Notes`, the exporter), which is also where the latency compensation
 * already lives.
 *
 * ## Migration, which is the part that has to be honest
 *
 * `notesFromLane` expands an existing lane and `laneFromNotes` writes it back. The write-back **refuses** when the notes
 * are not expressible as a step array — an off-grid start, a duration that is not a whole number of steps, a step with two
 * different velocities — and returns `null` instead of rounding. A lane that round-trips keeps working with everything
 * that reads the old shape (genre files, share links, the piano roll, the exports); a lane that does not is exactly the
 * lane that needs the note layer, and silently quantising it would be the bug this module exists to prevent.
 */
import type { SequencerTrack } from "../types/genre";

/** The eight lanes a project has. Kept as the track type's own union so a note cannot name a lane that is not one. */
export type NoteTrackId = SequencerTrack["track_id"];

export interface LaneNote {
  trackId: NoteTrackId;
  /** MIDI note number. */
  pitch: number;
  /** Start position in steps from the lane's loop start. Fractional is the point: 4.5 is a note between two 16ths. */
  startStep: number;
  /** Sounding length in steps. Fractional for the same reason. */
  durationSteps: number;
  /** 0–1, as the engine's renderers take it (`velocity / 127` for pattern data). */
  velocity: number;
  pan?: number;
  /** Per-note microtuning in cents (ABI 9). */
  cents?: number;
}

/** The step count a lane loops over: its own length when it has one (polymeter), else the pattern's. */
export function laneLength(track: SequencerTrack, patternSteps: number): number {
  const own = Number(track.trackLength);
  return Number.isFinite(own) && own > 0 ? Math.floor(own) : Math.max(1, Math.floor(patternSteps));
}

/** The velocity a step plays at, normalised: pattern data is 0–127, a missing value is the engine's 100. */
export function stepVelocity(track: SequencerTrack, step: number): number {
  const value = track.velocity?.[step];
  return (Number.isFinite(value) ? (value as number) : 100) / 127;
}

/** The gate (sounding length in steps) a step plays at: a missing value is the engine's 0.8. */
export function stepDuration(track: SequencerTrack, step: number): number {
  const value = track.gate?.[step];
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0.8;
}

/** The pitch of a step: a stored stack wins, then the step's root, then nothing (a drum has no key). */
export function stepPitches(track: SequencerTrack, step: number): number[] {
  const stack = track.pitches?.[step];
  if (Array.isArray(stack) && stack.length > 0) {
    return stack.filter((note): note is number => Number.isFinite(note) && note > 0);
  }
  const root = track.pitch?.[step];
  return Number.isFinite(root) && (root as number) > 0 ? [root as number] : [];
}

/**
 * Expand a lane into notes.
 *
 * A step that is on contributes one note per pitch on it: the stored stack when the genre has one, otherwise the step's
 * root. A ratchet (subdivisions inside one step) becomes several notes evenly spaced across it — that is what a ratchet
 * *is*, and expressing it as notes rather than as a special case is the point of this module.
 *
 * A step with no pitch produces a **drum note** at pitch 0, which is how the engine voices percussion.
 */
export function notesFromLane(track: SequencerTrack, patternSteps: number): LaneNote[] {
  const length = laneLength(track, patternSteps);
  const notes: LaneNote[] = [];
  for (let step = 0; step < length; step += 1) {
    if (!(track.steps?.[step] > 0)) continue;
    const velocity = stepVelocity(track, step);
    const duration = stepDuration(track, step);
    const pitches = stepPitches(track, step);
    const subdivisions = ratchetSubdivisions(track, step);
    const span = duration / subdivisions;
    for (let hit = 0; hit < subdivisions; hit += 1) {
      const startStep = step + (hit * duration) / subdivisions;
      for (const pitch of pitches.length ? pitches : [0]) {
        notes.push({ trackId: track.track_id, pitch, startStep, durationSteps: span, velocity });
      }
    }
  }
  return notes;
}

/** How many hits one step holds. Clamped to the engine's own set (1, 2, 3, 4, 8) so the layer cannot invent a value. */
function ratchetSubdivisions(track: SequencerTrack, step: number): number {
  const value = Math.round(Number(track.ratchet?.[step] ?? 1));
  return [1, 2, 3, 4, 8].includes(value) ? value : 1;
}

/** A step array's worth of values, or `null` when the notes cannot be expressed that way. */
interface LaneArrays {
  steps: number[];
  pitch: (number | null)[];
  velocity: number[];
  /** Present only when a step's length differs from the engine's default of 0.8 steps. */
  gate?: number[];
  /**
   * The stored stack, when a step holds a chord.
   *
   * `SequencerTrack.pitches` is the app's own shape for "several notes on one step", and the renderers play it verbatim;
   * a write-back that could not produce it would refuse to round-trip every genre whose chords are stored, which is most
   * of them (`applyGenreExpression` writes them at load time).
   */
  pitches?: (number[] | null)[];
}

const EPSILON = 1e-6;
const isWholeStep = (value: number): boolean => Math.abs(value - Math.round(value)) < EPSILON;

/**
 * Write notes back as a step array, or `null` when that would lose something.
 *
 * The rule is narrow on purpose, and it is narrower than it first looks: **durations are free, starts are not**. A gate
 * of 0.5 or 2.5 steps is exactly what `gate` is for, so a fractional length round-trips; a start between two steps is the
 * one thing the grid cannot say. The notes sharing a step must also agree on velocity and duration — they are one *event*
 * with a stack of pitches, not a sequence — so two hits on one step with different velocities, like an off-grid start, is
 * the note layer's business and the caller is told so rather than handed a rounded lane.
 */
export function laneFromNotes(notes: readonly LaneNote[], length: number): LaneArrays | null {
  if (!Number.isFinite(length) || length <= 0) return null;
  const size = Math.max(1, Math.floor(length));
  const steps: number[] = new Array(size).fill(0);
  const pitch: (number | null)[] = new Array(size).fill(null);
  /**
   * Inactive steps carry **velocity 0**, which is the catalogue's own convention (every genre's arrays have zeros
   * there), and the gate array is emitted only when it says something: a lane with no `gate` uses the engine's 0.8.
   */
  const velocity: number[] = new Array(size).fill(0);
  const gate: number[] = new Array(size).fill(0.8);
  const stacks: Array<Map<number, LaneNote>> = Array.from({ length: size }, () => new Map());

  for (const note of notes) {
    if (!isWholeStep(note.startStep)) return null;
    if (!(note.durationSteps > 0)) return null;
    const step = Math.round(note.startStep);
    if (step < 0 || step >= size) return null;
    const stack = stacks[step];
    if (stack.has(note.pitch)) return null;
    for (const other of stack.values()) {
      if (Math.abs(other.velocity - note.velocity) > EPSILON) return null;
      if (Math.abs(other.durationSteps - note.durationSteps) > EPSILON) return null;
    }
    stack.set(note.pitch, note);
  }

  const stacksOut: (number[] | null)[] = new Array(size).fill(null);
  for (let step = 0; step < size; step += 1) {
    const stack = stacks[step];
    if (stack.size === 0) continue;
    const [first] = stack.values();
    const pitches = [...stack.keys()].sort((a, b) => a - b);
    // A drum step has no key; a melodic step's `pitch` is its **root**, with the stack beside it (the track type's own
    // contract, so everything that reads "the note of this step" keeps working).
    const isDrum = pitches[0] === 0;
    if (isDrum && pitches.length > 1) return null;
    steps[step] = 1;
    velocity[step] = Math.round(first.velocity * 127);
    gate[step] = first.durationSteps;
    pitch[step] = isDrum ? null : pitches[0];
    if (pitches.length > 1) stacksOut[step] = pitches;
  }

  const hasStack = stacksOut.some((entry) => entry !== null);
  const hasGate = gate.some((value) => Math.abs(value - 0.8) > EPSILON);
  return {
    steps,
    pitch,
    velocity,
    ...(hasGate ? { gate } : {}),
    ...(hasStack ? { pitches: stacksOut } : {}),
  };
}

/**
 * Whether a lane's notes are expressible as a step array — the question a caller asks before choosing which shape to
 * store. Thin wrapper over the write-back so there is one rule, not two.
 */
export function laneStaysOnGrid(notes: readonly LaneNote[], length: number): boolean {
  return laneFromNotes(notes, length) !== null;
}
