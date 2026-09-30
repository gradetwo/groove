/**
 * The arrangement lane's arithmetic: one region per track, and the note miniature inside it.
 *
 * **Why this is a module and not part of a component.** The design brief (`docs/ARRANGEMENT_UI_DESIGN.md` §4) settles
 * the two questions this code answers, and both are decisions worth checking on their own:
 *
 * - **Which regions exist.** Option (a) in the brief: the model has no general region type — `notesByTrack` is one
 *   flat `NoteEvent[]` per track and the only range type is `TakeRegion` — so a track's region is **derived** from
 *   the arrangement's declared length. That is deliberately the honest summary instead of a new model, and it is why
 *   nothing here writes to the arrangement.
 * - **Where a note sits inside it.** x = `startBeats`, y = pitch normalised to **that track's own range**, width =
 *   `lengthBeats`, alpha = velocity. Per track, because a bass part and a two-octave piano part share one lane
 *   height: normalising across tracks would flatten the bass into a line.
 *
 * The brief also fixes what the miniature is **not**: it is not editable. Live's manual is explicit that only the
 * clip bar can be dragged, never its waveform or MIDI display, and the brief adopts that boundary. This module
 * therefore has no notion of a gesture — it produces positions.
 */
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";

/** The length a region falls back to when the arrangement does not declare one — the same default the editor uses. */
export const DEFAULT_REGION_BARS = 8;

/**
 * One note, positioned **relative to its region**.
 *
 * Relative rather than absolute because the lane's pixels belong to the view, not to the model: the same miniature
 * has to draw at any zoom, and a value in pixels stored here would be stale the moment the user pressed `+`.
 */
export interface NoteMiniature {
  /**
   * Left edge, 0…1 across the region.
   */
  x: number;
  /**
   * Vertical position, 0 at the top (the track's highest note) and 1 at the bottom.
   *
   * Inverted on purpose: a lane draws y downward and a musician reads pitch upward, and doing the inversion in the
   * view is where it would eventually be forgotten and the part drawn upside down.
   */
  y: number;
  /** Width, 0…1 across the region. */
  width: number;
  /** What the lane draws with, 0.15…1. **Never zero**: a note the user wrote must be visible even when it is quiet. */
  alpha: number;
  /** Kept so a caller can name the note it drew without a second lookup. */
  pitch: number;
}

/** A track's region over the arrangement, and the notes that fall inside it. */
export interface ArrangementRegion {
  trackId: string;
  /** Zero-based, inclusive start and exclusive end — the same convention as `TakeRegion`. */
  startBar: number;
  endBar: number;
  /** The same range in beats, which is the unit `NoteEvent` is written in. */
  startBeats: number;
  endBeats: number;
  /** The track's own notes, unmodified. The miniature is a second reading of them, never a copy. */
  notes: readonly NoteEvent[];
  miniatures: NoteMiniature[];
}

/** Beats per bar. The model's grid is sixteenths, which is why this number appears in the compile too. */
export const BEATS_PER_BAR = 4;

/** The arrangement's length in bars, declared or defaulted — one place, so the lane and the roll cannot disagree. */
export function regionBars(arrangement: ArrangementV2): number {
  return arrangement.bars ?? DEFAULT_REGION_BARS;
}

/**
 * Position every note relative to `startBeats…endBeats`.
 *
 * The normalisation range is the range of the notes **handed in**, which is the region's notes: a lane draws what
 * it is given. Clamping is not defensive tidiness — a note past the declared end is audible (the compile plays to
 * the further of the declared length and the notes) and a miniature drawn outside its region would be invisible.
 */
export function deriveNoteMiniatures(notes: readonly NoteEvent[], startBeats: number, endBeats: number): NoteMiniature[] {
  const span = endBeats - startBeats;
  // A region with no length has no fractions to draw in; dividing by zero would produce `NaN` positions, which the
  // browser drops silently — a blank lane rather than an error.
  if (!(span > 0) || notes.length === 0) return [];

  let lowest = notes[0]!.pitch;
  let highest = notes[0]!.pitch;
  for (const note of notes) {
    if (note.pitch < lowest) lowest = note.pitch;
    if (note.pitch > highest) highest = note.pitch;
  }
  const pitchRange = highest - lowest;

  return notes.map((note) => {
    const rawStart = Math.max(startBeats, Math.min(endBeats, note.startBeats));
    const rawEnd = Math.max(startBeats, Math.min(endBeats, note.startBeats + Math.max(0, note.lengthBeats)));
    return {
      x: (rawStart - startBeats) / span,
      // One pitch across the whole region sits in the middle: a zero range would be `NaN`, and a note on the top or
      // bottom edge reads as a different kind of part.
      y: pitchRange === 0 ? 0.5 : (highest - note.pitch) / pitchRange,
      // A zero-length note still gets a visible sliver, which is the difference between a grace note and a gap.
      width: Math.max(rawEnd - rawStart, span / 400) / span,
      alpha: Math.min(1, Math.max(0.15, (Number.isFinite(note.velocity) ? note.velocity : 100) / 127)),
      pitch: note.pitch,
    };
  });
}

/**
 * One region per track, each spanning the arrangement's own declared bars.
 *
 * Groups, folders and effect tracks get one too: the region is a place where content would go, and a lane that
 * vanished for an empty track would make the track look removed rather than silent.
 */
export function deriveArrangementRegions(arrangement: ArrangementV2): ArrangementRegion[] {
  const bars = regionBars(arrangement);
  const startBar = 0;
  const endBar = bars;
  const startBeats = startBar * BEATS_PER_BAR;
  const endBeats = endBar * BEATS_PER_BAR;

  return arrangement.tracks.map((track) => {
    const notes = arrangement.notesByTrack?.[track.id] ?? [];
    return {
      trackId: track.id,
      startBar,
      endBar,
      startBeats,
      endBeats,
      notes,
      miniatures: deriveNoteMiniatures(notes, startBeats, endBeats),
    };
  });
}

/** One track's miniatures, for a caller that has a track id rather than the whole arrangement. */
export function miniaturesFor(arrangement: ArrangementV2, trackId: string): NoteMiniature[] {
  const notes = arrangement.notesByTrack?.[trackId] ?? [];
  return deriveNoteMiniatures(notes, 0, regionBars(arrangement) * BEATS_PER_BAR);
}
