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

/* ------------------------------------------------------------------ tools & selection (v2.0.22) */

/**
 * Editing tools, borrowed from Logic's piano roll.
 *
 * The names are Logic's; what each one does here is adapted to a **step grid**: a note occupies
 * one integer step and its length is `gate` (0.1–2.0 steps), so several of Logic's operations have
 * no meaning in the same form and are deliberately reinterpreted rather than faked:
 *
 *   - **quantise starts** cannot be offered, because starts *are* grid steps already. What is
 *     offered instead is quantising **lengths** and **legato** (fill the gap to the next note),
 *     which is where a step pattern actually drifts.
 *   - **scissors** splits a note that rings past its step into two notes, which requires a free
 *     slot at the split point — a monophonic grid has nowhere to put an overlapping note.
 */
export type RollTool = "pointer" | "pencil" | "eraser" | "scissors" | "marquee";

/** Snap grid for drawing and dragging, in steps. `off` means "free" (integer steps anyway). */
export type RollSnap = "off" | "1/4" | "1/8" | "1/16" | "1/32";

export const ROLL_SNAP_STEPS: Record<RollSnap, number> = {
  off: 0,
  "1/4": 1,
  "1/8": 0.5,
  "1/16": 0.25,
  "1/32": 0.125,
};

/** Snaps a fractional step position to the snap grid (used for lengths, which may be fractional). */
export function snapValue(value: number, snap: RollSnap): number {
  const grid = ROLL_SNAP_STEPS[snap];
  if (!grid) return value;
  return Math.round(value / grid) * grid;
}

/** The selected steps, sorted, with duplicates removed. */
export function normalizeSelection(selection: readonly number[]): number[] {
  return [...new Set(selection)].sort((a, b) => a - b);
}

/** Notes whose (step, pitch) falls inside a marquee rectangle. */
export function notesInRect(
  notes: readonly RollStepNote[],
  rect: { stepFrom: number; stepTo: number; pitchFrom: number; pitchTo: number }
): number[] {
  const lo = Math.min(rect.stepFrom, rect.stepTo);
  const hi = Math.max(rect.stepFrom, rect.stepTo);
  const pitchLo = Math.min(rect.pitchFrom, rect.pitchTo);
  const pitchHi = Math.max(rect.pitchFrom, rect.pitchTo);
  return normalizeSelection(
    notes.filter((n) => n.stepIdx >= lo && n.stepIdx <= hi && n.midi >= pitchLo && n.midi <= pitchHi).map((n) => n.stepIdx)
  );
}

/**
 * Move a whole selection in time and pitch, as one operation.
 *
 * Occupied steps the selection lands on are **replaced** (the grid is monophonic), and the move is
 * refused as a whole if any destination falls outside the pattern — a partial move would silently
 * lose notes.
 */
export function moveNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly number[],
  deltaSteps: number,
  deltaPitch: number,
  stepCount: number
): { pattern: SequencerPattern; selection: number[] } {
  const selected = normalizeSelection(selection);
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const moving = notes.filter((n) => selected.includes(n.stepIdx));
  if (moving.length === 0) return { pattern, selection: selected };

  const destinations = moving.map((n) => n.stepIdx + deltaSteps);
  if (destinations.some((d) => d < 0 || d >= stepCount)) return { pattern, selection: selected };

  const moved = moving.map((n) => ({
    ...n,
    stepIdx: n.stepIdx + deltaSteps,
    midi: Math.max(0, Math.min(127, n.midi + deltaPitch)),
  }));
  const destinationSet = new Set(destinations);
  const kept = notes.filter((n) => !selected.includes(n.stepIdx) && !destinationSet.has(n.stepIdx));
  return {
    pattern: withTrackNotes(pattern, trackIdx, [...kept, ...moved], stepCount),
    selection: normalizeSelection(destinations),
  };
}

/** Duplicate a selection `deltaSteps` later (Alt-drag in Logic), leaving the originals in place. */
export function copyNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly number[],
  deltaSteps: number,
  stepCount: number
): { pattern: SequencerPattern; selection: number[] } {
  const selected = normalizeSelection(selection);
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const copies = notes
    .filter((n) => selected.includes(n.stepIdx))
    .map((n) => ({ ...n, stepIdx: n.stepIdx + deltaSteps }))
    .filter((n) => n.stepIdx >= 0 && n.stepIdx < stepCount);
  if (copies.length === 0) return { pattern, selection: selected };

  const copySet = new Set(copies.map((n) => n.stepIdx));
  const kept = notes.filter((n) => !copySet.has(n.stepIdx));
  return {
    pattern: withTrackNotes(pattern, trackIdx, [...kept, ...copies], stepCount),
    selection: normalizeSelection(copies.map((n) => n.stepIdx)),
  };
}

/** Remove every selected note. */
export function deleteNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly number[],
  stepCount: number
): SequencerPattern {
  const selected = new Set(normalizeSelection(selection));
  const kept = notesFromTrack(pattern.tracks[trackIdx]).filter((n) => !selected.has(n.stepIdx));
  return withTrackNotes(pattern, trackIdx, kept, stepCount);
}

/** Set an absolute velocity on every selected note (the velocity lane's click behaviour). */
export function setNotesVelocity(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly number[],
  velocity: number,
  stepCount: number
): SequencerPattern {
  const selected = new Set(normalizeSelection(selection));
  const next = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    selected.has(n.stepIdx) ? { ...n, velocity: Math.max(1, Math.min(127, Math.round(velocity))) } : n
  );
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}

/** Scale selected velocities (the lane's drag behaviour), clamped to the MIDI range. */
export function scaleNotesVelocity(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly number[],
  deltaVelocity: number,
  stepCount: number
): SequencerPattern {
  const selected = new Set(normalizeSelection(selection));
  const next = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    selected.has(n.stepIdx) ? { ...n, velocity: Math.max(1, Math.min(127, Math.round(n.velocity + deltaVelocity))) } : n
  );
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}

/**
 * Quantise the **lengths** of the selection to the snap grid.
 *
 * Starts are already steps, so this is where quantisation has something to do: a length that was
 * dragged to 0.73 steps becomes 0.75 at 1/16, or 1.0 at 1/4.
 */
export function quantizeLengths(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly number[],
  snap: RollSnap,
  stepCount: number
): SequencerPattern {
  const selected = new Set(normalizeSelection(selection));
  const next = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    selected.has(n.stepIdx) ? { ...n, gate: Math.max(0.1, Math.min(2, snapValue(n.gate, snap))) } : n
  );
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}

/**
 * Legato: extend each selected note to the next note's start (or to the end of the loop).
 *
 * `maxGate` is the engine's own clamp (2 steps), so a long gap cannot produce a length the audio
 * path would silently ignore.
 */
export function legatoNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly number[],
  stepCount: number,
  loopLength = stepCount,
  maxGate = 2
): SequencerPattern {
  const selected = new Set(normalizeSelection(selection));
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const next = notes.map((n) => {
    if (!selected.has(n.stepIdx)) return n;
    const later = notes.filter((other) => other.stepIdx > n.stepIdx).map((other) => other.stepIdx);
    const boundary = later.length ? Math.min(...later) : loopLength;
    return { ...n, gate: Math.max(0.1, Math.min(maxGate, boundary - n.stepIdx)) };
  });
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}

/**
 * Scissors: split the note at `stepIdx` into a shortened note plus a new one at the next step.
 *
 * A step grid has no room for an overlapping note, so the split needs a **free** step right after
 * the cut; if there is none (or the note is shorter than a step) this is a no-op and says so
 * through the returned flag rather than pretending to cut something.
 */
export function splitNote(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  stepCount: number
): { pattern: SequencerPattern; split: boolean } {
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const note = notes.find((n) => n.stepIdx === stepIdx);
  if (!note) return { pattern, split: false };
  const at = stepIdx + 1;
  if (at >= stepCount) return { pattern, split: false };
  if (notes.some((n) => n.stepIdx === at)) return { pattern, split: false };
  const half = Math.max(0.1, Math.min(2, note.gate / 2));
  const next = [
    ...notes.filter((n) => n.stepIdx !== stepIdx),
    { ...note, gate: half },
    { ...note, stepIdx: at, gate: half },
  ];
  return { pattern: withTrackNotes(pattern, trackIdx, next, stepCount), split: true };
}

/** Rows of a scale, for the pitch gutter's highlighting (root, in-scale, out-of-scale). */
export function scaleHighlightFor(scale: string | undefined | null): { rootPc: number; pcs: Set<number> } {
  const text = (scale ?? "C major").trim();
  const match = /^([A-Ga-g])([#b]?)/.exec(text);
  const letters: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let root = 0;
  if (match) {
    root = letters[match[1].toUpperCase()] ?? 0;
    if (match[2] === "#") root += 1;
    if (match[2] === "b") root -= 1;
  }
  const rootPc = ((root % 12) + 12) % 12;
  const minor = /minor|m\b|dorian|phrygian|aeolian|locrian/i.test(text);
  const intervals = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return { rootPc, pcs: new Set(intervals.map((i) => (rootPc + i) % 12)) };
}
