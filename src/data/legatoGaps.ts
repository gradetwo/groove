/**
 * ⭐ **Whether an arrangement's sustained parts are written legato, said out loud rather than left to the ear.**
 *
 * A string or pad bed is written as a chord per harmony change, and whether the chords sound connected is decided by one
 * number the composer already wrote: whether each note's `lengthBeats` reaches past the moment the next chord starts.
 * Written exactly to the next onset, every chord **releases before the next one sounds** — and a release is what makes a
 * bed sound detached, which for sustained strings is rarely the intent. The mixer already reads the same fact when it
 * decides to end a voice (`WavExporter` gives each sampled note `gate` seconds and stops it there), so this is a reading of
 * the notes rather than a second definition of anything.
 *
 * **It is reported, never enforced.** Overlap is not universally right: percussive and plucked parts want the gap, and a
 * bass line's rests are part of the line. The check therefore names the tracks that look like a sustained bed and reports
 * the gap, so a caller can decide — an arrangement is not changed by a diagnostic.
 *
 * The two halves of the measurement are deliberately separate, because they are different facts about different notes:
 *
 *   · **`missing`** — the last note of a run ends at or before the next one starts. This is a seam, and it is what the
 *     tool's own description tells a caller to avoid for strings.
 *   · **`touching`** — the end equals the next start exactly. Reported separately because "ends where the next begins" is
 *     the case a hint about overlap produces, and naming it makes the difference between the two visible rather than
 *     folding them into one word.
 *
 * A note whose length is zero is **not a gap and not a legato**: it is a note that sounds for no time at all, which is a
 * different problem, and counting it as "missing" would report a seam that is really a click.
 */
import type { ArrangementV2, NoteEvent, TrackV2 } from "../types/arrangementV2";

export interface LegatoGap {
  trackId: string;
  trackName: string;
  /** One entry per seam, capped so a long part cannot turn a reply into a wall of numbers. */
  gaps: Array<{ fromBeats: number; toBeats: number; gapBeats: number }>;
  /** How many seams there are altogether, before the cap. */
  missing: number;
  /** Seams where the previous note ends exactly where the next begins — the `lengthBeats` == spacing case. */
  touching: number;
  /** How many notes the track holds, so "one seam in four notes" and "one seam in four hundred" read differently. */
  notes: number;
}

/** How many seams one track may report; the count above stays exact. */
const MAX_REPORTED_GAPS = 5;

/** Notes start and end at these, so two notes at the same instant are the same instant rather than a float artefact. */
const EPSILON = 1e-6;

/**
 * **Which tracks this is said about.** A sustained bed is a chordal pad or string part: several notes starting together,
 * or simply a part whose notes are long. Everything else — drums, plucks, a bass line — is left alone, because a silence
 * between its notes is the part rather than a defect in it.
 */
function looksSustained(notes: readonly NoteEvent[]): boolean {
  if (notes.length < 2) return false;
  const byStart = new Map<number, number>();
  for (const note of notes) {
    const key = Math.round(note.startBeats * 1e6) / 1e6;
    byStart.set(key, (byStart.get(key) ?? 0) + 1);
  }
  const chordal = [...byStart.values()].some((count) => count >= 2);
  const mean = notes.reduce((sum, note) => sum + note.lengthBeats, 0) / notes.length;
  // A chord, or a plain mean length of a beat or more — the two shapes a bed is written in.
  return chordal || mean >= 1;
}

/**
 * Every track whose sustained part has a seam between consecutive notes, with the seams **and** the counts.
 *
 * Empty when there is nothing to say, which is the common case and the one a reply should not carry noise about.
 */
export function legatoGapsFor(arrangement: ArrangementV2): LegatoGap[] {
  const notesByTrack = (arrangement.notesByTrack ?? {}) as Record<string, NoteEvent[] | undefined>;
  const reports: LegatoGap[] = [];
  for (const track of arrangement.tracks as readonly TrackV2[]) {
    const notes = [...(notesByTrack[track.id] ?? [])].sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch);
    if (!looksSustained(notes)) continue;
    let missing = 0;
    let touching = 0;
    const gaps: LegatoGap["gaps"] = [];
    /**
     * **Grouped by start, so a chord is one chord.** Three notes sounding together at beat 0 that all end at beat 4 have
     * one seam before the chord at beat 4 — not three, which is what a per-note pass against "the next note" would
     * report, and which would make a normal four-chord progression look like twelve defects.
     */
    const chords = new Map<number, NoteEvent[]>();
    for (const note of notes) {
      const key = Math.round(note.startBeats * 1e6) / 1e6;
      chords.set(key, [...(chords.get(key) ?? []), note]);
    }
    const onsets = [...chords.keys()].sort((a, b) => a - b);
    for (let index = 0; index < onsets.length - 1; index += 1) {
      const current = chords.get(onsets[index]!)!;
      const next = chords.get(onsets[index + 1]!)!;
      // The chord's own end is the latest end of its notes; the seam is measured from there.
      const end = Math.max(...current.map((note) => note.startBeats + note.lengthBeats));
      const nextStart = Math.min(...next.map((note) => note.startBeats));
      const gapBeats = nextStart - end;
      if (gapBeats < -EPSILON) continue;
      if (gapBeats <= EPSILON) touching += 1;
      missing += 1;
      if (gaps.length < MAX_REPORTED_GAPS) {
        gaps.push({ fromBeats: round3(current[0]!.startBeats), toBeats: round3(nextStart), gapBeats: round3(gapBeats) });
      }
    }
    if (missing > 0) reports.push({ trackId: track.id, trackName: track.name, gaps, missing, touching, notes: notes.length });
  }
  return reports;
}

/** Three decimals, so a beat position is readable rather than a float tail. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The sentence a reply carries, or null when there is nothing to report.
 *
 * Written as advice with the measurement in it, because "no overlap detected" alone does not tell a caller what to change.
 */
export function legatoGapNote(reports: readonly LegatoGap[]): string | null {
  if (reports.length === 0) return null;
  const parts = reports.map((report) => {
    const touching = report.touching > 0 ? `, ${report.touching} of them ending exactly where the next begins` : "";
    const first = report.gaps[0];
    const where = first ? `; first at beats ${first.fromBeats}→${first.toBeats} (${first.gapBeats} beats of silence)` : "";
    return `${report.trackName} (${report.trackId}): ${report.missing} seam(s) across ${report.notes} note(s)${touching}${where}`;
  });
  return (
    `legatoGaps: ${parts.join(" | ")}. ` +
    "A sustained bed (strings, pads) reads as connected when each note's lengthBeats reaches past the next chord's start, so the releases overlap; " +
    "the notes above release before the next chord sounds. This is reported rather than changed — a plucked or percussive part wants the gap."
  );
}
