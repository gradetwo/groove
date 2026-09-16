import type { SequencerPattern, SequencerTrack } from "../../types/genre";

/**
 * Piano-roll <-> step-grid model (item ⑦).
 *
 * Groove Lab's pattern is a per-step grid: `steps[i] > 0` means "a note at step i", `pitch[i]` is
 * its MIDI note and `gate[i]` its length in steps (clamped 0.1–2.0 by the engine). A piano roll
 * wants (pitch, start, length) rectangles. This module is the whole translation between the two,
 * kept pure and free of React so the roll's gestures can be tested without a browser.
 *
 * ## What is deliberately *not* supported
 *
 * A step grid is monophonic per track and quantised: one note per step, no sub-step start, and
 * note length is a multiplier of one step rather than free time. Reshaping the data model to fit a
 * DAW piano roll would change how the engine, the exporters and the genre data all work, so the
 * roll edits the data that exists instead: **start = step index** (snapped), **pitch = MIDI note**,
 * **length = gate**. The limitations are stated in the UI rather than hidden.
 */

/** One note as the roll sees it: a step index plus that step's pitch and length. */
export interface RollStepNote {
  /** Step index — this is the note's start, and it is always on the grid. */
  stepIdx: number;
  /** MIDI note number. */
  midi: number;
  /** Length in steps (the track's `gate` value). */
  gate: number;
  /** 0..127, for the note's opacity/size. */
  velocity: number;
}

/** Tracks the roll can edit: pitch is musically meaningful only for these roles. */
export const ROLL_EDITABLE_ROLES = ["bass", "chords", "lead"] as const;

export function isRollEditableTrack(track: SequencerTrack | undefined): boolean {
  if (!track) return false;
  return (ROLL_EDITABLE_ROLES as readonly string[]).includes(track.track_id);
}

/**
 * Notes of a track, with the pitch fallback the engine uses.
 *
 * The engine defaults a missing/0 pitch to C4 (60) — see `AudioEngine.triggerInstrument` — so the
 * roll shows the same note the user is already hearing instead of an empty row.
 */
export function notesFromTrack(track: SequencerTrack | undefined, fallbackMidi = 60): RollStepNote[] {
  if (!track?.steps) return [];
  const notes: RollStepNote[] = [];
  track.steps.forEach((value, stepIdx) => {
    if (!(value > 0)) return;
    const raw = track.pitch?.[stepIdx];
    const midi = typeof raw === "number" && raw > 0 ? raw : fallbackMidi;
    const gate = track.gate?.[stepIdx] ?? 0.8;
    notes.push({ stepIdx, midi, gate, velocity: track.velocity?.[stepIdx] ?? 100 });
  });
  return notes;
}

/** The step index a note ends at (exclusive), for drawing its width. */
export function noteEndStep(note: RollStepNote): number {
  return note.stepIdx + Math.max(0.1, note.gate);
}

/** Lowest and highest note to show, with padding, so a one-note track is not a single row. */
export function visiblePitchRange(notes: readonly RollStepNote[], padSemitones = 2, minRows = 13): [number, number] {
  const pitches = notes.map((n) => n.midi);
  const lo = pitches.length ? Math.min(...pitches) : 60;
  const hi = pitches.length ? Math.max(...pitches) : 72;
  let min = lo - padSemitones;
  let max = hi + padSemitones;
  while (max - min + 1 < minRows) {
    // Grow symmetrically, but never past the MIDI range.
    if (min > 0) min -= 1;
    if (max - min + 1 < minRows && max < 127) max += 1;
    if (min === 0 && max === 127) break;
  }
  return [Math.max(0, min), Math.min(127, max)];
}

/** A copy of the pattern with one track's notes replaced — the shape every op below works on. */
export function withTrackNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  notes: readonly RollStepNote[],
  stepCount: number
): SequencerPattern {
  const tracks = pattern.tracks.map((track, idx) => {
    if (idx !== trackIdx) return track;
    // Array lengths are preserved: `stepCount` is derived from `tracks[0].steps.length` on
    // COMMIT_PATTERN, so changing them from the roll would silently resize every track.
    const steps = track.steps.slice(0, stepCount);
    while (steps.length < stepCount) steps.push(0);
    const pitch: (number | null)[] = Array.from({ length: stepCount }, (_, i) => track.pitch?.[i] ?? null);
    const gate = Array.from({ length: stepCount }, (_, i) => track.gate?.[i] ?? 0.8);
    const velocity = Array.from({ length: stepCount }, (_, i) => track.velocity?.[i] ?? 100);

    for (let i = 0; i < stepCount; i++) {
      steps[i] = 0;
      pitch[i] = null;
    }
    for (const note of notes) {
      if (note.stepIdx < 0 || note.stepIdx >= stepCount) continue;
      steps[note.stepIdx] = 1;
      pitch[note.stepIdx] = Math.max(0, Math.min(127, Math.round(note.midi)));
      gate[note.stepIdx] = Math.max(0.1, Math.min(2, note.gate));
      velocity[note.stepIdx] = Math.max(0, Math.min(127, Math.round(note.velocity)));
    }
    return { ...track, steps, pitch, gate, velocity };
  });
  return { ...pattern, tracks };
}

/** Add a note, replacing whatever was in that step (the grid is monophonic per track). */
export function addNote(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  midi: number,
  stepCount: number,
  velocity = 100,
  gate = 0.8
): SequencerPattern {
  const track = pattern.tracks[trackIdx];
  const notes = notesFromTrack(track).filter((n) => n.stepIdx !== stepIdx);
  notes.push({ stepIdx, midi, gate, velocity });
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/** Remove the note at a step, if any. */
export function removeNote(pattern: SequencerPattern, trackIdx: number, stepIdx: number, stepCount: number): SequencerPattern {
  const notes = notesFromTrack(pattern.tracks[trackIdx]).filter((n) => n.stepIdx !== stepIdx);
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/**
 * Move one note to another step (and optionally another pitch).
 *
 * Moving onto an occupied step replaces that note — the classic DAW behaviour, and the only one
 * a monophonic grid can express.
 */
export function moveNote(
  pattern: SequencerPattern,
  trackIdx: number,
  fromStep: number,
  toStep: number,
  midi: number | null,
  stepCount: number
): SequencerPattern {
  if (toStep < 0 || toStep >= stepCount) return pattern;
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const moving = notes.find((n) => n.stepIdx === fromStep);
  if (!moving) return pattern;
  const kept = notes.filter((n) => n.stepIdx !== fromStep && n.stepIdx !== toStep);
  kept.push({ ...moving, stepIdx: toStep, midi: midi === null ? moving.midi : Math.max(0, Math.min(127, midi)) });
  return withTrackNotes(pattern, trackIdx, kept, stepCount);
}

/** Resize a note by changing its `gate` (the only length control the engine has). */
export function resizeNote(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  gate: number,
  stepCount: number
): SequencerPattern {
  const notes = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    n.stepIdx === stepIdx ? { ...n, gate: Math.max(0.1, Math.min(2, gate)) } : n
  );
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/** Change one note's velocity (0..127). */
export function setNoteVelocity(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  velocity: number,
  stepCount: number
): SequencerPattern {
  const notes = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    n.stepIdx === stepIdx ? { ...n, velocity: Math.max(0, Math.min(127, Math.round(velocity))) } : n
  );
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/** Transpose every note in the track, clamped to the MIDI range. */
export function transposeTrack(
  pattern: SequencerPattern,
  trackIdx: number,
  semitones: number,
  stepCount: number
): SequencerPattern {
  const notes = notesFromTrack(pattern.tracks[trackIdx]).map((n) => ({
    ...n,
    midi: Math.max(0, Math.min(127, n.midi + semitones)),
  }));
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/**
 * Where the track's independent loop ends (polymeter).
 *
 * Steps at or beyond it are editable but never sound, so the roll must draw the boundary or users
 * will write silent notes.
 */
export function loopLengthOf(track: SequencerTrack | undefined, stepCount: number): number {
  const len = track?.trackLength;
  return len && len > 0 ? Math.min(len, stepCount) : stepCount;
}

/** Beats per step for the pattern's resolution — used for the note-length readout in ms. */
export function stepBeatsFor(resolution: SequencerPattern["resolution"]): number {
  if (resolution === "1/8") return 0.5;
  if (resolution === "1/32") return 0.125;
  return 0.25;
}
