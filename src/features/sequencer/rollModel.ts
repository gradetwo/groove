import { MAX_NOTE_GATE_STEPS, type SequencerPattern, type SequencerTrack } from "../../types/genre";
import { chordNotesForStep, chordVoicingForStep, type VoicingStyle } from "../../audio/chordVoicing";
import { parseScaleString, SCALES, type NoteName } from "../../utils/scaleTheory";

/** One note as the roll sees it. */
export interface RollStepNote {
  /** Step index — this is the note's start, and it is always on the grid. */
  stepIdx: number;
  /** MIDI note number. */
  midi: number;
  /** Length in steps (the track's `gate` value, shared by every note on the step). */
  gate: number;
  /** 0..127 (the track's `velocity` value, shared by every note on the step). */
  velocity: number;
}

/** Stable identity of a note: `step:midi`. */
export type RollNoteId = string;

export function noteId(note: { stepIdx: number; midi: number }): RollNoteId {
  return `${note.stepIdx}:${note.midi}`;
}

export function parseNoteId(id: RollNoteId): { stepIdx: number; midi: number } {
  const [step, midi] = id.split(":");
  return { stepIdx: Number(step), midi: Number(midi) };
}

/** Tracks the roll can edit: pitch is musically meaningful only for these roles. */
export const ROLL_EDITABLE_ROLES = ["bass", "chords", "lead"] as const;

export function isRollEditableTrack(track: SequencerTrack | undefined): boolean {
  if (!track) return false;
  return (ROLL_EDITABLE_ROLES as readonly string[]).includes(track.track_id);
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/**
 * Identify musical chord name from MIDI notes.
 */
export function detectChordName(midis: number[]): string {
  if (!midis || midis.length === 0) return "";
  const unique = [...new Set(midis.map((n) => Math.round(n)))].sort((a, b) => a - b);
  if (unique.length === 1) {
    const pc = ((unique[0] % 12) + 12) % 12;
    return NOTE_NAMES[pc];
  }
  const rootMidi = unique[0];
  const rootPc = ((rootMidi % 12) + 12) % 12;
  const rootName = NOTE_NAMES[rootPc];
  const intervals = unique.map((m) => ((m - rootMidi) % 12 + 12) % 12);
  const intSet = new Set(intervals);

  if (intSet.has(4) && intSet.has(7) && intSet.has(11) && intSet.has(2)) return `${rootName}maj9`;
  if (intSet.has(3) && intSet.has(7) && intSet.has(10) && intSet.has(2)) return `${rootName}m9`;
  if (intSet.has(4) && intSet.has(7) && intSet.has(10) && intSet.has(2)) return `${rootName}9`;
  if (intSet.has(4) && intSet.has(7) && intSet.has(11)) return `${rootName}maj7`;
  if (intSet.has(3) && intSet.has(7) && intSet.has(10)) return `${rootName}m7`;
  if (intSet.has(4) && intSet.has(7) && intSet.has(10)) return `${rootName}7`;
  if (intSet.has(3) && intSet.has(6) && intSet.has(10)) return `${rootName}m7b5`;
  if (intSet.has(3) && intSet.has(6) && intSet.has(9)) return `${rootName}dim7`;
  if (intSet.has(4) && intSet.has(7) && intSet.has(2)) return `${rootName}add9`;
  if (intSet.has(4) && intSet.has(7)) return rootName;
  if (intSet.has(3) && intSet.has(7)) return `${rootName}m`;
  if (intSet.has(3) && intSet.has(6)) return `${rootName}dim`;
  if (intSet.has(4) && intSet.has(8)) return `${rootName}aug`;
  if (intSet.has(5) && intSet.has(7)) return `${rootName}sus4`;
  if (intSet.has(2) && intSet.has(7)) return `${rootName}sus2`;
  if (intSet.has(7) && intSet.size === 2) return `${rootName}5`;

  return rootName;
}

/**
 * Notes of a track, with the pitch fallback the engine uses.
 *
 * A step whose stack (`pitches`) is present contributes **every** note in it, so a chord appears as
 * a chord. The engine defaults a missing/0 pitch to C4 (60) — see `AudioEngine.triggerInstrument` —
 * so a step with no usable pitch shows the note the user is already hearing rather than nothing.
 */
export function notesFromTrack(
  track: SequencerTrack | undefined,
  fallbackMidi = 60,
  scale?: string
): RollStepNote[] {
  if (!track?.steps) return [];
  const notes: RollStepNote[] = [];
  const isChords = track.track_id === "chords" || (track.name ? track.name.toLowerCase().includes("chord") : false);
  track.steps.forEach((value, stepIdx) => {
    if (!(value > 0)) return;
    const gate = track.gate?.[stepIdx] ?? 0.8;
    const velocity = track.velocity?.[stepIdx] ?? 100;
    const stack = track.pitches?.[stepIdx];
    const midis =
      Array.isArray(stack) && stack.length > 0
        ? [...new Set(stack.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.round(n)))]
        : null;
    if (midis && midis.length > 0) {
      for (const midi of midis) notes.push({ stepIdx, midi, gate, velocity });
      return;
    }
    const raw = track.pitch?.[stepIdx];
    const midi = typeof raw === "number" && raw > 0 ? raw : fallbackMidi;
    if (isChords) {
      const derived = chordNotesForStep(track, stepIdx, midi, scale);
      if (derived && derived.length > 0) {
        for (const m of derived) notes.push({ stepIdx, midi: Math.round(m), gate, velocity });
        return;
      }
    }
    notes.push({ stepIdx, midi, gate, velocity });
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
    if (min > 0) min -= 1;
    if (max - min + 1 < minRows && max < 127) max += 1;
    if (min === 0 && max === 127) break;
  }
  return [Math.max(0, min), Math.min(127, max)];
}

/**
 * A copy of the pattern with one track's notes replaced — the shape every op below works on.
 *
 * Writes **all three** of the step grid's views of a note: `steps` (does it sound), `pitch` (the
 * root, kept for the engine's heuristics and for old readers) and `pitches` (the stack, which is
 * what the renderers play and the roll draws). `pitch` is the **lowest** note of the stack, so
 * "the note of this step" keeps its old meaning and a monophonic track is unchanged.
 */
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
    const pitches: (number[] | null)[] = Array.from(
      { length: stepCount },
      (_, i) => track.pitches?.[i] ?? null
    );
    const gate = Array.from({ length: stepCount }, (_, i) => track.gate?.[i] ?? 0.8);
    const velocity = Array.from({ length: stepCount }, (_, i) => track.velocity?.[i] ?? 100);

    for (let i = 0; i < stepCount; i++) {
      steps[i] = 0;
      pitch[i] = null;
      pitches[i] = null;
    }
    const stacks = new Map<number, number[]>();
    for (const note of notes) {
      if (note.stepIdx < 0 || note.stepIdx >= stepCount) continue;
      const midi = Math.max(0, Math.min(127, Math.round(note.midi)));
      const stack = stacks.get(note.stepIdx);
      if (stack) {
        if (!stack.includes(midi)) stack.push(midi);
      } else {
        stacks.set(note.stepIdx, [midi]);
        steps[note.stepIdx] = 1;
        gate[note.stepIdx] = Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, note.gate));
        velocity[note.stepIdx] = Math.max(0, Math.min(127, Math.round(note.velocity)));
      }
    }
    for (const [stepIdx, stack] of stacks) {
      const sorted = [...stack].sort((a, b) => a - b);
      pitches[stepIdx] = sorted;
      // The root is the lowest note: the meaning `pitch` had before chords existed.
      pitch[stepIdx] = sorted[0];
    }
    const maxAuthoredStep = notes.reduce((max, n) => Math.max(max, n.stepIdx + 1), 0);
    const trackLength =
      track.trackLength && maxAuthoredStep > track.trackLength
        ? Math.max(track.trackLength, maxAuthoredStep, stepCount)
        : track.trackLength;
    return { ...track, steps, pitch, pitches, gate, velocity, ...(trackLength ? { trackLength } : {}) };
  });
  return { ...pattern, tracks };
}

/**
 * Add a note.
 *
 * On a step that already sounds, the note is **added to that step's stack** — that is how a chord
 * is built in a piano roll (draw the root, then draw the third and fifth onto the same step) and
 * why this operation no longer replaces. Drawing the same pitch twice is a no-op rather than a
 * duplicate.
 */
export function addNote(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  midi: number,
  stepCount: number,
  velocity = 100,
  gate = 0.8
): SequencerPattern {
  if (stepIdx < 0 || stepIdx >= stepCount) return pattern;
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const target = Math.round(midi);
  if (notes.some((n) => n.stepIdx === stepIdx && n.midi === target)) return pattern;
  const existing = notes.find((n) => n.stepIdx === stepIdx);
  // Length and velocity belong to the step, so a note added to a sounding step inherits them
  // instead of silently resetting the chord's articulation.
  notes.push({
    stepIdx,
    midi: target,
    gate: existing?.gate ?? gate,
    velocity: existing?.velocity ?? velocity,
  });
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/** Remove **every** note on a step (the eraser's "clear this step" behaviour). */
export function removeNote(pattern: SequencerPattern, trackIdx: number, stepIdx: number, stepCount: number): SequencerPattern {
  const notes = notesFromTrack(pattern.tracks[trackIdx]).filter((n) => n.stepIdx !== stepIdx);
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/** Remove one specific note — how a single chord tone is deleted. */
export function removeNoteAt(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  midi: number,
  stepCount: number
): SequencerPattern {
  const notes = notesFromTrack(pattern.tracks[trackIdx]).filter(
    (n) => !(n.stepIdx === stepIdx && n.midi === midi)
  );
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/**
 * Move one note to another step (and optionally another pitch).
 *
 * Moving onto a step that already sounds replaces that step's stack — the classic DAW behaviour,
 * and the one that keeps a monophonic role monophonic. To *build* a chord, draw onto the step
 * (`addNote`); to drag one chord tone elsewhere, select that note only.
 */
export function moveNote(
  pattern: SequencerPattern,
  trackIdx: number,
  fromStep: number,
  toStep: number,
  midi: number | null,
  stepCount: number,
  fromMidi?: number
): SequencerPattern {
  if (toStep < 0 || toStep >= stepCount) return pattern;
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const moving = notes.find((n) => n.stepIdx === fromStep && (fromMidi === undefined || n.midi === fromMidi));
  if (!moving) return pattern;
  const kept = notes.filter(
    (n) => !(n.stepIdx === fromStep && (fromMidi === undefined || n.midi === fromMidi)) && n.stepIdx !== toStep
  );
  kept.push({ ...moving, stepIdx: toStep, midi: midi === null ? moving.midi : Math.max(0, Math.min(127, midi)) });
  return withTrackNotes(pattern, trackIdx, kept, stepCount);
}

/** The length clamp, in one place: a note is never shorter than a tenth of a step nor longer than a bar. */
export function clampGate(gate: number): number {
  return Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, gate));
}

/** Resize a step by changing its `gate` (the only length control the engine has). */
export function resizeNote(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  gate: number,
  stepCount: number
): SequencerPattern {
  const notes = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    n.stepIdx === stepIdx ? { ...n, gate: clampGate(gate) } : n
  );
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/**
 * Lengthen or shorten every step the selection touches — the roll's `[`/`]` with something selected.
 *
 * `resizeNote` above is the single-note counterpart, and this mirrors `scaleNotesVelocity`: same
 * selection → steps mapping, same relative delta, same clamp. Without it the keyboard could change
 * the velocity of a whole selection but only the length of the one note under the cursor, which is
 * the kind of asymmetry nobody discovers until they need it.
 */
export function scaleNotesLength(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  deltaGate: number,
  stepCount: number
): SequencerPattern {
  const steps = new Set(selectedSteps(selection));
  const next = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    steps.has(n.stepIdx) ? { ...n, gate: clampGate(n.gate + deltaGate) } : n
  );
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}

/** Change the velocity of every note on a step (velocity is per step in this model). */
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
 * Transpose selected notes (or the whole track if no selection) by semitones,
 * returning the updated pattern and new selected note IDs.
 */
export function transposeNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selectedNoteIds: readonly RollNoteId[],
  semitones: number,
  stepCount: number
): { pattern: SequencerPattern; nextSelection: RollNoteId[] } {
  if (selectedNoteIds.length === 0) {
    return {
      pattern: transposeTrack(pattern, trackIdx, semitones, stepCount),
      nextSelection: [],
    };
  }
  const selectedSet = new Set(selectedNoteIds);
  const nextSelection: RollNoteId[] = [];
  const notes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale).map((n) => {
    if (selectedSet.has(noteId(n))) {
      const nextMidi = Math.max(0, Math.min(127, n.midi + semitones));
      const updated: RollStepNote = { ...n, midi: nextMidi };
      nextSelection.push(noteId(updated));
      return updated;
    }
    return n;
  });
  return {
    pattern: withTrackNotes(pattern, trackIdx, notes, stepCount),
    nextSelection,
  };
}

/**
 * Loop length for the track: its own `trackLength` when set (polymeter), else the pattern.
 */
export function loopLengthOf(track: SequencerTrack | undefined, stepCount: number): number {
  const len = track?.trackLength;
  if (typeof len === "number" && len > 0) return Math.min(len, stepCount);
  return stepCount;
}

/** Beats per step for a resolution, used for tempo-aware lengths in the UI. */
export function stepBeatsFor(resolution: SequencerPattern["resolution"]): number {
  if (resolution === "1/8") return 0.5;
  if (resolution === "1/32") return 0.125;
  return 0.25;
}

/* ------------------------------------------------------------------ tools & selection */

/**
 * Editing tools, borrowed from Logic's piano roll.
 *
 * The names are Logic's; what each one does here is adapted to a **step grid**: a note occupies one
 * integer step and its length is `gate` (0.1–2.0 steps), so several of Logic's operations have no
 * meaning in the same form and are deliberately reinterpreted rather than faked:
 *
 *   - **quantise starts** cannot be offered, because starts *are* grid steps already. What is
 *     offered instead is quantising **lengths** and **legato** (fill the gap to the next note),
 *     which is where a step pattern actually drifts.
 *   - **scissors** splits a note that rings past its step into two notes, which requires a free
 *     slot at the split point — a step can hold a chord, but a *split* still needs the next step to
 *     be free of that pitch.
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

/** The selected notes, deduplicated and sorted by (step, midi) so ops are deterministic. */
export function normalizeSelection(selection: readonly RollNoteId[]): RollNoteId[] {
  const unique = [...new Set(selection)].filter((id) => /^\d+:-?\d+$/.test(id));
  return unique.sort((a, b) => {
    const x = parseNoteId(a);
    const y = parseNoteId(b);
    return x.stepIdx - y.stepIdx || x.midi - y.midi;
  });
}

/** Selected ids as the set of steps they occupy (length/velocity/quantise act per step). */
export function selectedSteps(selection: readonly RollNoteId[]): number[] {
  return [...new Set(selection.map((id) => parseNoteId(id).stepIdx))].sort((a, b) => a - b);
}

/** Notes whose (step, pitch) falls inside a marquee rectangle. */
export function notesInRect(
  notes: readonly RollStepNote[],
  rect: { stepFrom: number; stepTo: number; pitchFrom: number; pitchTo: number }
): RollNoteId[] {
  const lo = Math.min(rect.stepFrom, rect.stepTo);
  const hi = Math.max(rect.stepFrom, rect.stepTo);
  const pitchLo = Math.min(rect.pitchFrom, rect.pitchTo);
  const pitchHi = Math.max(rect.pitchFrom, rect.pitchTo);
  return normalizeSelection(
    notes.filter((n) => n.stepIdx >= lo && n.stepIdx <= hi && n.midi >= pitchLo && n.midi <= pitchHi).map(noteId)
  );
}

/**
 * Move a whole selection in time and pitch, as one operation.
 *
 * Notes that end up on the same step **stack** (they are a chord — that is the point of the
 * (step, midi) model), but a step that the selection lands on and that held a note the selection
 * did *not* contain is replaced, so a blind drag cannot silently create a stranger's harmony. The
 * move is refused as a whole if any destination falls outside the pattern: a partial move would
 * lose notes.
 */
export function moveNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  deltaSteps: number,
  deltaPitch: number,
  stepCount: number
): { pattern: SequencerPattern; selection: RollNoteId[] } {
  const selected = normalizeSelection(selection);
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const selectedSet = new Set(selected);
  const moving = notes.filter((n) => selectedSet.has(noteId(n)));
  if (moving.length === 0) return { pattern, selection: selected };

  const destinations = moving.map((n) => n.stepIdx + deltaSteps);
  if (destinations.some((d) => d < 0 || d >= stepCount)) return { pattern, selection: selected };
  if (moving.some((n) => n.midi + deltaPitch < 0 || n.midi + deltaPitch > 127)) {
    return { pattern, selection: selected };
  }

  const destinationSet = new Set(destinations);
  const kept = notes.filter((n) => !selectedSet.has(noteId(n)) && !destinationSet.has(n.stepIdx));
  const moved = moving.map((n) => ({
    ...n,
    stepIdx: n.stepIdx + deltaSteps,
    midi: n.midi + deltaPitch,
  }));
  return {
    pattern: withTrackNotes(pattern, trackIdx, [...kept, ...moved], stepCount),
    selection: normalizeSelection(moved.map(noteId)),
  };
}

/** Duplicate a selection `deltaSteps` later (Alt-drag in Logic), leaving the originals in place. */
export function copyNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  deltaSteps: number,
  stepCount: number
): { pattern: SequencerPattern; selection: RollNoteId[] } {
  const selected = normalizeSelection(selection);
  const selectedSet = new Set(selected);
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const copies = notes
    .filter((n) => selectedSet.has(noteId(n)))
    .map((n) => ({ ...n, stepIdx: n.stepIdx + deltaSteps }))
    .filter((n) => n.stepIdx >= 0 && n.stepIdx < stepCount);
  if (copies.length === 0) return { pattern, selection: selected };

  const copyStepSet = new Set(copies.map((n) => n.stepIdx));
  const kept = notes.filter((n) => !copyStepSet.has(n.stepIdx));
  return {
    pattern: withTrackNotes(pattern, trackIdx, [...kept, ...copies], stepCount),
    selection: normalizeSelection(copies.map(noteId)),
  };
}

/** Remove every selected note. */
export function deleteNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  stepCount: number
): SequencerPattern {
  const selected = new Set(normalizeSelection(selection));
  const kept = notesFromTrack(pattern.tracks[trackIdx]).filter((n) => !selected.has(noteId(n)));
  return withTrackNotes(pattern, trackIdx, kept, stepCount);
}

/** Set an absolute velocity on every step the selection touches (or all notes if selection is empty). */
export function setNotesVelocity(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  velocity: number,
  stepCount: number
): SequencerPattern {
  const selected = selectedSteps(selection);
  const steps = selected.length > 0 ? new Set(selected) : null;
  const next = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    steps === null || steps.has(n.stepIdx) ? { ...n, velocity: Math.max(1, Math.min(127, Math.round(velocity))) } : n
  );
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}

/** Scale the velocity of every step the selection touches (the lane's drag behaviour). */
export function scaleNotesVelocity(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  deltaVelocity: number,
  stepCount: number
): SequencerPattern {
  const steps = new Set(selectedSteps(selection));
  const next = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    steps.has(n.stepIdx) ? { ...n, velocity: Math.max(1, Math.min(127, Math.round(n.velocity + deltaVelocity))) } : n
  );
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}

/**
 * Compresses note velocities toward targetVel (e.g. 85), reducing dynamic extremes.
 * If selection is empty, all sounding notes on the track are compressed.
 */
export function compressNotesVelocity(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  targetVel = 85,
  ratio = 0.5,
  stepCount?: number
): SequencerPattern {
  const selected = selectedSteps(selection);
  const steps = selected.length > 0 ? new Set(selected) : null;
  const allNotes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale);
  const targetStepCount = stepCount ?? pattern.tracks[trackIdx]?.steps.length ?? 16;
  const next = allNotes.map((n) => {
    if (steps !== null && !steps.has(n.stepIdx)) return n;
    const diff = targetVel - n.velocity;
    const newVel = Math.round(n.velocity + diff * ratio);
    return { ...n, velocity: Math.max(1, Math.min(127, newVel)) };
  });
  return withTrackNotes(pattern, trackIdx, next, targetStepCount);
}

/**
 * Adds subtle micro-dynamics jitter to note velocities (±jitter) without changing length/timing.
 * If selection is empty, all sounding notes on the track are humanized.
 */
export function humanizeNotesVelocity(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  jitter = 10,
  stepCount?: number
): SequencerPattern {
  const selected = selectedSteps(selection);
  const steps = selected.length > 0 ? new Set(selected) : null;
  const allNotes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale);
  const targetStepCount = stepCount ?? pattern.tracks[trackIdx]?.steps.length ?? 16;
  const next = allNotes.map((n) => {
    if (steps !== null && !steps.has(n.stepIdx)) return n;
    const seed = (n.stepIdx * 23 + n.midi * 19) % 100;
    const offset = Math.round(((seed / 50) - 1) * jitter);
    return { ...n, velocity: Math.max(1, Math.min(127, n.velocity + offset)) };
  });
  return withTrackNotes(pattern, trackIdx, next, targetStepCount);
}

/** Ramps velocity from startVelocity to endVelocity across selected steps in chronological order. */
export function rampNotesVelocity(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  startVel = 40,
  endVel = 120,
  stepCount: number
): SequencerPattern {
  const rawSteps = selectedSteps(selection);
  const allNotes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale);
  const steps = rawSteps.length > 0 ? rawSteps : [...new Set(allNotes.map((n) => n.stepIdx))].sort((a, b) => a - b);
  if (steps.length === 0) return pattern;
  const velMap = new Map<number, number>();
  if (steps.length === 1) {
    velMap.set(steps[0], Math.round((startVel + endVel) / 2));
  } else {
    steps.forEach((st, idx) => {
      const frac = idx / (steps.length - 1);
      velMap.set(st, Math.max(1, Math.min(127, Math.round(startVel + frac * (endVel - startVel)))));
    });
  }
  const next = allNotes.map((n) => {
    const ramped = velMap.get(n.stepIdx);
    return ramped !== undefined ? { ...n, velocity: ramped } : n;
  });
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}


/**
 * Duplicates notes in Bar 1 (steps 0 .. stepsPerBar - 1) across subsequent bars (bars 2, 3, 4...)
 * for the active track.
 */
export function duplicateBar1Notes(
  pattern: SequencerPattern,
  trackIdx: number,
  stepsPerBar: number,
  stepCount: number
): SequencerPattern {
  if (stepsPerBar <= 0 || stepCount <= stepsPerBar) return pattern;
  const barCount = Math.ceil(stepCount / stepsPerBar);
  const track = pattern.tracks[trackIdx];
  if (!track) return pattern;
  const allNotes = notesFromTrack(track);
  const bar1Notes = allNotes.filter((n) => n.stepIdx < stepsPerBar);
  if (bar1Notes.length === 0) return pattern;

  const nextNotes: RollStepNote[] = [...bar1Notes];
  for (let bar = 1; bar < barCount; bar++) {
    const offset = bar * stepsPerBar;
    for (const n of bar1Notes) {
      const stepIdx = offset + n.stepIdx;
      if (stepIdx < stepCount) {
        nextNotes.push({
          ...n,
          stepIdx,
        });
      }
    }
  }
  return withTrackNotes(pattern, trackIdx, nextNotes, stepCount);
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
  selection: readonly RollNoteId[],
  snap: RollSnap,
  stepCount: number
): SequencerPattern {
  const steps = new Set(selectedSteps(selection));
  const next = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    steps.has(n.stepIdx) ? { ...n, gate: Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, snapValue(n.gate, snap))) } : n
  );
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}

/**
 * Legato: extend each selected step's notes to the next sounding step (or the loop end).
 *
 * `maxGate` is the engine's own clamp (2 steps), so a long gap cannot produce a length the audio
 * path would silently ignore. Legato can *shorten* as well as lengthen — that is what the word
 * means — and the UI says so.
 */
export function legatoNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  stepCount: number,
  loopLength = stepCount,
  maxGate = MAX_NOTE_GATE_STEPS
): SequencerPattern {
  const steps = new Set(selectedSteps(selection));
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const sounding = [...new Set(notes.map((n) => n.stepIdx))];
  const next = notes.map((n) => {
    if (!steps.has(n.stepIdx)) return n;
    const later = sounding.filter((step) => step > n.stepIdx);
    const boundary = later.length ? Math.min(...later) : loopLength;
    return { ...n, gate: Math.max(0.1, Math.min(maxGate, boundary - n.stepIdx)) };
  });
  return withTrackNotes(pattern, trackIdx, next, stepCount);
}

/**
 * Scissors: split the step's notes into a shortened chord plus a new one on the next step.
 *
 * Needs the next step to be **free** (a step can hold a chord, but a split would have to know which
 * of two stacked notes it is cutting); if it is occupied, or the step is the last one, this is a
 * no-op and the caller says so through the returned flag rather than pretending to cut.
 */
export function splitNote(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  stepCount: number
): { pattern: SequencerPattern; split: boolean } {
  const notes = notesFromTrack(pattern.tracks[trackIdx]);
  const onStep = notes.filter((n) => n.stepIdx === stepIdx);
  if (onStep.length === 0) return { pattern, split: false };
  const at = stepIdx + 1;
  if (at >= stepCount) return { pattern, split: false };
  if (notes.some((n) => n.stepIdx === at)) return { pattern, split: false };
  const half = Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, (onStep[0].gate ?? 0.8) / 2));
  const next = [
    ...notes.filter((n) => n.stepIdx !== stepIdx),
    ...onStep.map((n) => ({ ...n, gate: half })),
    ...onStep.map((n) => ({ ...n, stepIdx: at, gate: half })),
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

export type ChordStampType = "note" | "triad" | "seventh" | "ninth" | "sus4" | "sus2" | "power";

/**
 * Resolves the MIDI pitches for a chord stamp type and root note.
 */
export function chordNotesForStamp(
  targetRoot: number,
  scale: string | undefined | null,
  chordType: ChordStampType
): number[] {
  const root = Math.round(targetRoot);
  const normalizedScale = scale ?? undefined;
  if (chordType === "note") return [root];
  if (chordType === "triad") return chordVoicingForStep(root, normalizedScale, { style: "triad" });
  if (chordType === "seventh") return chordVoicingForStep(root, normalizedScale, { style: "seventh" });
  if (chordType === "ninth") return [root, root + 4, root + 7, root + 11, root + 14];
  if (chordType === "sus4") return chordVoicingForStep(root, normalizedScale, { style: "sus" });
  if (chordType === "sus2") return [root, root + 2, root + 7];
  if (chordType === "power") return chordVoicingForStep(root, normalizedScale, { style: "power" });
  return [root];
}

/**
 * Adds a chord stack on the given step using the specified chord stamp quality.
 */
export function addChord(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  rootMidi: number,
  stepCount: number,
  chordType: ChordStampType = "triad",
  velocity = 100,
  gate = 0.8
): SequencerPattern {
  if (stepIdx < 0 || stepIdx >= stepCount) return pattern;
  if (chordType === "note") {
    return addNote(pattern, trackIdx, stepIdx, rootMidi, stepCount, velocity, gate);
  }
  const notes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale).filter((n) => n.stepIdx !== stepIdx);
  const targetRoot = Math.round(rootMidi);
  const chordNotes = chordNotesForStamp(targetRoot, pattern.scale, chordType);

  for (const midi of chordNotes) {
    notes.push({ stepIdx, midi, gate, velocity });
  }
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/**
 * Invert selected chord notes:
 * "up" moves the lowest note of each selected chord up an octave (+12).
 * "down" moves the highest note of each selected chord down an octave (-12).
 */
export function invertSelectedChord(
  pattern: SequencerPattern,
  trackIdx: number,
  selectedNoteIds: readonly RollNoteId[],
  direction: "up" | "down",
  stepCount: number
): SequencerPattern {
  if (selectedNoteIds.length === 0) return pattern;
  const targetSteps = [...new Set(selectedNoteIds.map((id) => parseNoteId(id).stepIdx))];
  const allNotes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale);
  const nextNotes: RollStepNote[] = [];

  for (let s = 0; s < stepCount; s++) {
    const stepNotes = allNotes.filter((n) => n.stepIdx === s);
    if (stepNotes.length === 0) continue;
    if (!targetSteps.includes(s) || stepNotes.length <= 1) {
      nextNotes.push(...stepNotes);
      continue;
    }
    const sorted = [...stepNotes].sort((a, b) => a.midi - b.midi);
    if (direction === "up") {
      const lowest = sorted[0];
      const rest = sorted.slice(1);
      nextNotes.push(...rest, { ...lowest, midi: Math.min(127, lowest.midi + 12) });
    } else {
      const highest = sorted[sorted.length - 1];
      const rest = sorted.slice(0, sorted.length - 1);
      nextNotes.push(...rest, { ...highest, midi: Math.max(0, highest.midi - 12) });
    }
  }

  return withTrackNotes(pattern, trackIdx, nextNotes, stepCount);
}

/**
 * Drop-2 voicing: drops the 2nd voice from the top down an octave (-12).
 */
export function drop2SelectedChord(
  pattern: SequencerPattern,
  trackIdx: number,
  selectedNoteIds: readonly RollNoteId[],
  stepCount: number
): SequencerPattern {
  if (selectedNoteIds.length === 0) return pattern;
  const targetSteps = [...new Set(selectedNoteIds.map((id) => parseNoteId(id).stepIdx))];
  const allNotes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale);
  const nextNotes: RollStepNote[] = [];

  for (let s = 0; s < stepCount; s++) {
    const stepNotes = allNotes.filter((n) => n.stepIdx === s);
    if (stepNotes.length === 0) continue;
    if (!targetSteps.includes(s) || stepNotes.length < 3) {
      nextNotes.push(...stepNotes);
      continue;
    }
    const sorted = [...stepNotes].sort((a, b) => a.midi - b.midi);
    const dropIdx = sorted.length - 2;
    const dropped = { ...sorted[dropIdx], midi: Math.max(0, sorted[dropIdx].midi - 12) };
    const remaining = sorted.filter((_, idx) => idx !== dropIdx);
    nextNotes.push(...remaining, dropped);
  }

  return withTrackNotes(pattern, trackIdx, nextNotes, stepCount);
}

/**
 * Humanize timing and velocity of selected notes.
 */
export function humanizeSelectedNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selectedNoteIds: readonly RollNoteId[],
  stepCount: number,
  velocityJitter = 8,
  gateJitter = 0.05
): SequencerPattern {
  const selected = new Set(selectedNoteIds);
  const notes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale).map((n) => {
    if (selected.size > 0 && !selected.has(noteId(n))) return n;
    const seed = (n.stepIdx * 17 + n.midi * 31) % 100;
    const vOffset = Math.round(((seed / 50) - 1) * velocityJitter);
    const gOffset = (((seed % 20) / 10) - 1) * gateJitter;
    return {
      ...n,
      velocity: Math.max(1, Math.min(127, n.velocity + vOffset)),
      gate: Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, Number((n.gate + gOffset).toFixed(3)))),
    };
  });
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
}

/**
 * Arpeggiate selected chord notes across consecutive steps.
 * "up": low to high notes
 * "down": high to low notes
 * "updown": up then down
 */
export function arpeggiateSelectedNotes(
  pattern: SequencerPattern,
  trackIdx: number,
  selectedNoteIds: readonly RollNoteId[],
  direction: "up" | "down" | "updown" = "up",
  stepCount: number,
  stepInterval = 1
): { pattern: SequencerPattern; nextSelection: RollNoteId[] } {
  if (selectedNoteIds.length === 0) return { pattern, nextSelection: [...selectedNoteIds] };
  const allNotes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale);
  const selectedSet = new Set(selectedNoteIds);

  const targetSteps = [...new Set(selectedNoteIds.map((id) => parseNoteId(id).stepIdx))].sort((a, b) => a - b);
  let workingNotes = [...allNotes];
  const newSelectedIds: RollNoteId[] = [];

  for (const s of targetSteps) {
    const chordNotes = workingNotes.filter((n) => n.stepIdx === s && selectedSet.has(noteId(n)));
    if (chordNotes.length <= 1) {
      chordNotes.forEach((n) => newSelectedIds.push(noteId(n)));
      continue;
    }

    // Remove the original chord notes from working set
    workingNotes = workingNotes.filter((n) => !(n.stepIdx === s && selectedSet.has(noteId(n))));

    const sorted = [...chordNotes].sort((a, b) => a.midi - b.midi);
    let sequence: RollStepNote[] = [];
    if (direction === "up") {
      sequence = sorted;
    } else if (direction === "down") {
      sequence = [...sorted].reverse();
    } else {
      const up = [...sorted];
      const down = sorted.slice(1, -1).reverse();
      sequence = [...up, ...down];
    }

    // Spread each note across steps starting at s
    sequence.forEach((n, idx) => {
      const targetStep = s + idx * stepInterval;
      if (targetStep < stepCount) {
        workingNotes = workingNotes.filter((wn) => !(wn.stepIdx === targetStep && wn.midi === n.midi));
        const newNote: RollStepNote = {
          ...n,
          stepIdx: targetStep,
          gate: Math.min(n.gate, 0.8),
        };
        workingNotes.push(newNote);
        newSelectedIds.push(noteId(newNote));
      }
    });
  }

  const updatedPattern = withTrackNotes(pattern, trackIdx, workingNotes, stepCount);
  return { pattern: updatedPattern, nextSelection: newSelectedIds };
}

/**
 * Standard harmonic progression definitions for the Piano Roll.
 */
export interface ChordProgressionDef {
  id: string;
  name: { zh: string; en: string };
  romanNumerals: string;
  degrees: number[]; // 1-indexed diatonic scale degrees
  desc: { zh: string; en: string };
}

export const CHORD_PROGRESSIONS: readonly ChordProgressionDef[] = [
  {
    id: "pop_4chords",
    name: { zh: "流行黄金四和弦", en: "Pop 4-Chords" },
    romanNumerals: "I - V - vi - IV",
    degrees: [1, 5, 6, 4],
    desc: { zh: "流行乐最具爆发力的万能进行", en: "Classic uplifting anthemic pop chord progression" },
  },
  {
    id: "emotional_6415",
    name: { zh: "流行与EDM抒情", en: "Emotional Lift" },
    romanNumerals: "vi - IV - I - V",
    degrees: [6, 4, 1, 5],
    desc: { zh: "深情优美，常用于电音与流行慢歌副歌", en: "Powerful emotional arc, popular in EDM and vocal ballads" },
  },
  {
    id: "jazz_2516",
    name: { zh: "爵士与新灵魂 2-5-1", en: "Jazz & Neo-Soul 2-5-1" },
    romanNumerals: "ii - V - I - vi",
    degrees: [2, 5, 1, 6],
    desc: { zh: "爵士、R&B与Lo-Fi的核心顺滑解决进行", en: "Standard jazz cadence with smooth harmonic resolution" },
  },
  {
    id: "royal_road_4536",
    name: { zh: "王道进行 (J-Pop)", en: "Royal Road (4-5-3-6)" },
    romanNumerals: "IV - V - iii - vi",
    degrees: [4, 5, 3, 6],
    desc: { zh: "日本流行与City Pop标志性感人旋律进行", en: "Iconic Japanese pop and City Pop chord sequence" },
  },
  {
    id: "epic_minor_1637",
    name: { zh: "暗黑史诗小调", en: "Epic Minor (1-6-3-7)" },
    romanNumerals: "i - VI - III - VII",
    degrees: [1, 6, 3, 7],
    desc: { zh: "Synthwave、Trap与史诗配乐经典骨架", en: "Staple of Synthwave, Cinematic and Dark Trap" },
  },
  {
    id: "blues_rock_1415",
    name: { zh: "布鲁斯与摇滚", en: "Blues & Rock (1-4-1-5)" },
    romanNumerals: "I - IV - I - V",
    degrees: [1, 4, 1, 5],
    desc: { zh: "经典布鲁斯、放克与摇滚律动循环", en: "Root blues and raw rock harmonic cycle" },
  },
  {
    id: "dorian_funk_14",
    name: { zh: "放克双和弦", en: "Dorian Funk Vamp" },
    romanNumerals: "i - IV",
    degrees: [1, 4],
    desc: { zh: "Daft Punk 与 Nu-Disco 标志性双和弦律动", en: "Signature two-chord vamp for Nu-Disco and French House" },
  },
  {
    id: "canon_8chords",
    name: { zh: "帕赫贝尔卡农", en: "Canon Progression" },
    romanNumerals: "I - V - vi - iii - IV - I - IV - V",
    degrees: [1, 5, 6, 3, 4, 1, 4, 5],
    desc: { zh: "帕赫贝尔经典卡农进行，优雅庄重", en: "Timeless classical progression with majestic voice leading" },
  },
] as const;

/**
 * Resolves the chords of a progression into concrete MIDI notes using the active scale.
 */
export function resolveProgressionChords(
  scaleStr: string | undefined | null,
  progression: ChordProgressionDef,
  options?: {
    chordStyle?: VoicingStyle;
    baseOctave?: number;
  }
): Array<{ rootMidi: number; chordNotes: number[]; roman: string }> {
  const { root, scaleId } = parseScaleString(scaleStr ?? undefined);
  const scale = SCALES[scaleId] || SCALES.minor;
  const rootIndex = (NOTE_NAMES as readonly string[]).indexOf(root);
  const baseOctave = options?.baseOctave ?? 4;
  const tonicMidi = 12 * (baseOctave + 1) + (rootIndex >= 0 ? rootIndex : 0);
  const chordStyle = options?.chordStyle ?? "triad";
  const romanParts = progression.romanNumerals.split(/[\s-]+/).filter((p) => p.length > 0);

  return progression.degrees.map((degree, idx) => {
    const degOffset = Math.max(1, degree) - 1;
    const intervalIdx = degOffset % scale.intervals.length;
    const octaveOffset = Math.floor(degOffset / scale.intervals.length) * 12;
    const semitone = scale.intervals[intervalIdx] + octaveOffset;
    const chordRootMidi = tonicMidi + semitone;

    const chordNotes = chordVoicingForStep(chordRootMidi, scaleStr ?? undefined, {
      style: chordStyle,
    });

    return {
      rootMidi: chordRootMidi,
      chordNotes,
      roman: romanParts[idx] || `${degree}`,
    };
  });
}

/**
 * The notes a progression stamp will produce, and the step span each chord occupies.
 *
 * Split out of `applyChordProgression` so the piano roll's **audition** can play exactly what
 * the stamp would write. The two used to compute their own answers — the stamp divided the
 * pattern evenly while the audition re-voiced each member at a fixed 450 ms and a fixed
 * `triad` style — so "preview" and "result" could disagree on voicing, octave, timing and
 * length. One function makes that drift structurally impossible.
 */
/** One chord the stamp writes: where it lands, how long it holds the slot, how long it rings. */
export interface ProgressionInstance {
  /** Index into `ProgressionPlan.chords`. */
  chordIdx: number;
  stepIdx: number;
  /** Steps until the next instance — the slot this chord owns. */
  span: number;
  /** Steps the note rings for; never shorter than 90% of `span`, never above `MAX_NOTE_GATE_STEPS`. */
  gate: number;
}

/** The notes a progression stamp will write, and the harmonic rhythm it chose to write them at. */
export interface ProgressionPlan {
  chords: Array<{ rootMidi: number; chordNotes: number[]; roman: string }>;
  /** Every chord instance the stamp writes, in playing order. */
  instances: ProgressionInstance[];
  /** Steps one chord owns inside a cycle: a bar, half a bar or a beat. */
  stepsPerChord: number;
  /** Steps in one beat of this pattern, so `stepsPerChord` reads as a musical duration. */
  stepsPerBeat: number;
  /** Length of the first cycle; the audition plays exactly this much. */
  cycleSteps: number;
  /** How many of `chords` fit in one cycle — fewer than `chords.length` on a short pattern. */
  placedChords: number;
  /** How many times the cycle is stated to fill the span (a partial final cycle counts). */
  cycles: number;
  /** True when the pattern cannot state the whole progression without changing faster than a beat. */
  truncated: boolean;
  start: number;
}

/**
 * The notes a progression stamp will produce, and the harmonic rhythm it will write them at.
 *
 * Split out of `applyChordProgression` so the piano roll's **audition** can play exactly what
 * the stamp would write. The two used to compute their own answers — the stamp divided the
 * pattern evenly while the audition re-voiced each member at a fixed 450 ms and a fixed
 * `triad` style — so "preview" and "result" could disagree on voicing, octave, timing and
 * length. One function makes that drift structurally impossible.
 *
 * The rhythm follows the rule the genre library itself is authored with (see
 * `data/genreExpression.ts`): **one chord per bar**, halved only when a shorter pattern has to
 * state the progression, and never faster than one beat. Two measured defects used to live here:
 *
 *   - `stepsPerBar` was accepted and ignored, so the rhythm was whatever even division produced:
 *     on a 16-step pattern the 8-chord canon changed chord every **2 steps** (8th notes) and any
 *     4-chord progression became one chord per beat.
 *   - A chord's slot could exceed `MAX_NOTE_GATE_STEPS` (16 steps = one bar) while its gate was
 *     clamped to that cap, so the harmony stopped half-way through its own slot:
 *     `dorian_funk_14` on a 4-bar pattern rang for 16 of its 32 steps — one bar of chord, one bar
 *     of silence. That silence is the "fragmented" sound a two-chord vamp should never make.
 *
 * The note model's own limit (a note lasts at most a bar) is why a progression **repeats** to fill
 * a longer pattern instead of stretching: `dorian_funk_14` over four bars is i–IV–i–IV, which is
 * what the genres that use it actually play, rather than two 2-bar chords with holes between them.
 */
export function previewProgressionNotes(
  scaleStr: string | undefined | null,
  progression: ChordProgressionDef,
  stepCount: number,
  stepsPerBar: number,
  options?: {
    chordStyle?: VoicingStyle;
    baseOctave?: number;
    startStep?: number;
    velocity?: number;
    gate?: number;
  }
): ProgressionPlan {
  const chords = resolveProgressionChords(scaleStr, progression, {
    chordStyle: options?.chordStyle ?? "triad",
    baseOctave: options?.baseOctave ?? 4,
  });
  const total = chords.length;
  const bar = Math.max(1, Math.round(stepsPerBar));
  // The roll's grid is 1/16, so a bar is four beats. A chord change faster than that is a run of
  // stabs rather than a progression: it means the pattern is too short for the progression it was
  // handed, and the honest answer is to drop chords and say so — not to subdivide further.
  const beat = Math.max(1, Math.round(bar / 4));
  const start = Math.max(0, Math.min(Math.max(0, stepCount - 1), options?.startStep ?? 0));
  const availableSteps = Math.max(1, stepCount - start);
  const gateFor = (span: number) =>
    options?.gate != null
      ? Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, options.gate))
      : Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, Number((span * 0.9).toFixed(2))));

  if (total === 0) {
    return {
      chords,
      instances: [],
      stepsPerChord: beat,
      stepsPerBeat: beat,
      cycleSteps: 0,
      placedChords: 0,
      cycles: 0,
      truncated: false,
      start,
    };
  }

  // The slowest musical rhythm that still states the whole progression, then half a bar, then a
  // beat. Nothing slower than a bar: a chord that owns two bars is a chord the note model cannot
  // hold anyway, and real progressions state their harmony once per bar.
  const stepsPerChord =
    [bar, Math.max(beat, Math.round(bar / 2)), beat].find((steps) => steps * total <= availableSteps) ??
    beat;
  // A pattern with fewer beats than the progression has chords keeps the musical rhythm and drops
  // what does not fit. `truncated` is what lets the UI tell the user to lengthen the pattern.
  const placedChords = Math.min(total, Math.max(1, Math.floor(availableSteps / stepsPerChord)));
  const cycleSteps = placedChords * stepsPerChord;

  const instances: ProgressionInstance[] = [];
  for (let cursor = 0; cursor < availableSteps; ) {
    const span = Math.min(stepsPerChord, availableSteps - cursor);
    // A leftover shorter than a beat is not a chord of its own; hold the previous one over it.
    if (span < beat && instances.length > 0) {
      const prev = instances[instances.length - 1];
      prev.span += span;
      prev.gate = gateFor(prev.span);
      break;
    }
    instances.push({
      chordIdx: instances.length % placedChords,
      stepIdx: start + cursor,
      span,
      gate: gateFor(span),
    });
    cursor += span;
  }

  return {
    chords,
    instances,
    stepsPerChord,
    stepsPerBeat: beat,
    cycleSteps,
    placedChords,
    cycles: Math.max(1, Math.ceil(availableSteps / Math.max(1, cycleSteps))),
    truncated: placedChords < total,
    start,
  };
}

/**
 * Applies a full harmonic chord progression across the track's step span.
 */
export function applyChordProgression(
  pattern: SequencerPattern,
  trackIdx: number,
  progression: ChordProgressionDef,
  stepCount: number,
  stepsPerBar: number,
  options?: {
    chordStyle?: VoicingStyle;
    baseOctave?: number;
    startStep?: number;
    velocity?: number;
    gate?: number;
  }
): SequencerPattern {
  // Same plan the piano roll auditions, so a preview cannot disagree with the result.
  const plan = previewProgressionNotes(pattern.scale, progression, stepCount, stepsPerBar, options);
  if (plan.chords.length === 0 || plan.instances.length === 0) return pattern;

  const velocity = options?.velocity ?? 100;
  // Everything from `start` on belongs to the progression: the plan tiles it to the end of the
  // pattern, so a note after `start` that survived would be a second harmony under the first.
  const preservedNotes = notesFromTrack(pattern.tracks[trackIdx], 60, pattern.scale).filter(
    (n) => n.stepIdx < plan.start
  );

  const newNotes: RollStepNote[] = [...preservedNotes];
  for (const instance of plan.instances) {
    if (instance.stepIdx >= stepCount) continue;
    const chord = plan.chords[instance.chordIdx];
    if (!chord) continue;
    for (const midi of chord.chordNotes) {
      newNotes.push({
        stepIdx: instance.stepIdx,
        midi,
        gate: instance.gate,
        velocity,
      });
    }
  }

  return withTrackNotes(pattern, trackIdx, newNotes, stepCount);
}

