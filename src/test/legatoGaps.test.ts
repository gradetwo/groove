/**
 * ⭐ **Legato seams in a sustained part, measured rather than heard.**
 *
 * The owner's report of a sustaining string bed that "breaks" is a level problem and is answered in `sfzLoopPlayback`'s
 * work; this is the other half of the same sentence, and it is a **writing** problem: three chords written end-to-end at
 * beats 0, 2 and 4 with `lengthBeats: 2` each release exactly where the next begins, and a release plus an attack with no
 * overlap is the seam a listener calls "not connected". Nothing was measuring that, so an agent could write a string
 * part with a silence between every chord and get a reply that said the render succeeded.
 *
 * The fixture numbers are chosen so each assertion names the fact it protects: three chords of eight beats, then the
 * same three chords overlapping by a quarter beat, then a drum part where the gaps are the part.
 */
import { describe, expect, it } from "vitest";
import { legatoGapNote, legatoGapsFor } from "../data/legatoGaps";
import type { ArrangementV2, NoteEvent, TrackV2 } from "../types/arrangementV2";

function track(id: string, name: string, kind: TrackV2["kind"] = "sampler"): TrackV2 {
  return { id, name, kind } as TrackV2;
}

function note(pitch: number, startBeats: number, lengthBeats: number, velocity = 90): NoteEvent {
  return { pitch, startBeats, lengthBeats, velocity };
}

function arrangement(tracks: readonly TrackV2[], notesByTrack: Record<string, NoteEvent[]>): ArrangementV2 {
  return { songId: "legato-probe", tracks: [...tracks], notesByTrack } as ArrangementV2;
}

/** A chord: three notes starting together, held for the same length. */
const chord = (root: number, startBeats: number, lengthBeats: number): NoteEvent[] => [note(root, startBeats, lengthBeats), note(root + 4, startBeats, lengthBeats), note(root + 7, startBeats, lengthBeats)];

describe("legatoGapsFor", () => {
  it("reports a sustained bed whose chords release exactly where the next begins", () => {
    const strings = [chord(55, 0, 2), chord(57, 2, 2), chord(59, 4, 2)].flat();
    const reports = legatoGapsFor(arrangement([track("t1", "Strings")], { t1: strings }));
    expect(reports).toHaveLength(1);
    expect(reports[0]!.trackName).toBe("Strings");
    expect(reports[0]!.notes).toBe(9);
    // Two seams, one per chord change — not two per note, which is what a per-note pass would have reported.
    expect(reports[0]!.missing).toBe(2);
    // "Ends where the next begins" is counted separately, because it is the case a hint about overlap produces.
    expect(reports[0]!.touching).toBe(2);
    expect(reports[0]!.gaps[0]).toEqual({ fromBeats: 0, toBeats: 2, gapBeats: 0 });
  });

  it("says nothing when the chords overlap, which is what legato writing is", () => {
    const strings = [chord(55, 0, 2.25), chord(57, 2, 2.25), chord(59, 4, 2.25)].flat();
    expect(legatoGapsFor(arrangement([track("t1", "Strings")], { t1: strings }))).toEqual([]);
  });

  it("says nothing about a drum part, whose gaps are the part", () => {
    const drums = [note(36, 0, 0.25), note(38, 1, 0.25), note(36, 2, 0.25), note(38, 3, 0.25)];
    expect(legatoGapsFor(arrangement([track("t1", "Drums", "drumkit")], { t1: drums }))).toEqual([]);
  });

  it("says nothing about a part with a single note", () => {
    expect(legatoGapsFor(arrangement([track("t1", "Strings")], { t1: [note(60, 0, 8)] }))).toEqual([]);
  });

  it("measures a real silence as a gap in beats, not as a flag", () => {
    const strings = [chord(55, 0, 1), chord(57, 2, 1)].flat();
    const report = legatoGapsFor(arrangement([track("t1", "Pad")], { t1: strings }))[0]!;
    expect(report.missing).toBe(1);
    expect(report.touching).toBe(0);
    expect(report.gaps[0]!.gapBeats).toBe(1);
  });

  it("caps what it lists without capping what it counts", () => {
    // Eight chords, one beat each: seven seams, five of them named.
    const strings = Array.from({ length: 8 }, (_, index) => chord(55, index * 2, 1)).flat();
    const report = legatoGapsFor(arrangement([track("t1", "Strings")], { t1: strings }))[0]!;
    expect(report.missing).toBe(7);
    expect(report.gaps.length).toBeLessThanOrEqual(5);
  });

  it("treats a note of zero length as neither a seam nor a legato", () => {
    /**
     * A zero-length note is a different defect — a note that sounds for no time — and folding it into "the part is not
     * legato" would name the wrong problem and send a reader to the wrong field.
     */
    const notes = [note(60, 0, 0), note(62, 0, 2), note(64, 2, 2)];
    const report = legatoGapsFor(arrangement([track("t1", "Strings")], { t1: notes }))[0]!;
    // The chord at beat 0 ends at 2 (the second note's end), so the chord at 2 touches rather than gaps.
    expect(report.touching).toBe(1);
    expect(report.gaps[0]!.gapBeats).toBe(0);
  });
});

describe("legatoGapNote", () => {
  it("is absent when there is nothing to report, so a reply carries no noise", () => {
    expect(legatoGapNote([])).toBeNull();
  });

  it("names the track, the count and the first seam", () => {
    const strings = [chord(55, 0, 2), chord(57, 2, 2)].flat();
    const noteText = legatoGapNote(legatoGapsFor(arrangement([track("t1", "Strings")], { t1: strings })))!;
    expect(noteText).toContain("Strings (t1)");
    expect(noteText).toContain("1 seam(s)");
    expect(noteText).toContain("beats 0→2");
    // It is advice with a measurement in it, and it says it is not a change.
    expect(noteText).toContain("reported rather than changed");
  });
});
