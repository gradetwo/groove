import { MAX_NOTE_GATE_STEPS, type SequencerPattern, type SequencerTrack } from "../../types/genre";

/**
 * Piano-roll <-> step-grid model.
 *
 * Groove Lab's pattern is a per-step grid: `steps[i] > 0` means "something sounds at step i",
 * `pitch[i]` is its **root** MIDI note, `pitches[i]` is the **whole stack** sounding on that step
 * (a chord) and `gate[i]` its length in steps (clamped 0.1–`MAX_NOTE_GATE_STEPS`). A piano roll wants
 * (pitch, start, length) rectangles. This module is the whole translation between the two, kept
 * pure and free of React so the roll's gestures can be tested without a browser.
 *
 * ## Note identity
 *
 * A note is identified by **(step, midi)**, not by step alone. That is what lets the roll show and
 * edit chords — several notes on one step — and it is why the selection in the UI is a list of
 * `RollNoteId`s rather than a list of step indices. `gate` and `velocity` stay **per step** (that
 * is how the engine and the genre data model them), so every note sharing a step shares its length
 * and velocity; the UI shows that plainly rather than pretending otherwise.
 *
 * ## What is deliberately *not* supported
 *
 * Starts are always on the grid (no sub-step start) and a length is a multiple of one step. Those
 * two would require reshaping how the engine schedules notes and how the genre data is authored, so
 * the roll edits the data that exists: **start = step index**, **pitch = MIDI note**, **length =
 * gate**. The limitations are stated in the UI rather than hidden.
 */

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

/**
 * Notes of a track, with the pitch fallback the engine uses.
 *
 * A step whose stack (`pitches`) is present contributes **every** note in it, so a chord appears as
 * a chord. The engine defaults a missing/0 pitch to C4 (60) — see `AudioEngine.triggerInstrument` —
 * so a step with no usable pitch shows the note the user is already hearing rather than nothing.
 */
export function notesFromTrack(track: SequencerTrack | undefined, fallbackMidi = 60): RollStepNote[] {
  if (!track?.steps) return [];
  const notes: RollStepNote[] = [];
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
    return { ...track, steps, pitch, pitches, gate, velocity };
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

/** Resize a step by changing its `gate` (the only length control the engine has). */
export function resizeNote(
  pattern: SequencerPattern,
  trackIdx: number,
  stepIdx: number,
  gate: number,
  stepCount: number
): SequencerPattern {
  const notes = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    n.stepIdx === stepIdx ? { ...n, gate: Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, gate)) } : n
  );
  return withTrackNotes(pattern, trackIdx, notes, stepCount);
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

/** Set an absolute velocity on every step the selection touches (the lane's click behaviour). */
export function setNotesVelocity(
  pattern: SequencerPattern,
  trackIdx: number,
  selection: readonly RollNoteId[],
  velocity: number,
  stepCount: number
): SequencerPattern {
  const steps = new Set(selectedSteps(selection));
  const next = notesFromTrack(pattern.tracks[trackIdx]).map((n) =>
    steps.has(n.stepIdx) ? { ...n, velocity: Math.max(1, Math.min(127, Math.round(velocity))) } : n
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
