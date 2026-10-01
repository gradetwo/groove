import { beforeEach, describe, expect, it } from "vitest";
import { clearMcpSongs, createMcpSong, getMcpSong, setMcpNoteConvention, summariseSong } from "../../mcp/song";
import { findGenre } from "../../mcp/library";
import { ABLETON_NOTE_NAMES, TRACK_MIDI_MAPPINGS } from "../audio/AbletonExporter";
import { noteName } from "../data/pitchTruth";

/**
 * The convention a project carries, and what "migrating an old project" actually means.
 *
 * The owner's rule is that a MIDI note number is the truth and a name like C4 is a display choice, so a project
 * only has to carry the choice. An older project carries nothing, and the honest answer to that is not a
 * migration but a sentence: names read as C4, and nothing about the music differs. The criteria below are
 * written so that claim cannot quietly become false — setting a convention must leave every note number where
 * it was, and clearing one must leave the project as it was before the field existed.
 */
const newSong = (): string =>
  createMcpSong({ genreId: "chicago-house", genre: findGenre("chicago-house")!, bpm: 124 }).songId;

describe("the note-name convention a project carries", () => {
  beforeEach(() => clearMcpSongs());

  it("reads a project that states none as C4, and says so instead of leaving a reader to guess", () => {
    const songId = newSong();
    const summary = summariseSong(getMcpSong(songId)!);

    expect(summary.noteConvention).toBe("C4");
    // The note fires only while the project states nothing, and it carries the whole message: what is assumed,
    // and that there is nothing to convert.
    expect(summary.pitchNote).toContain("no convention");
    expect(summary.pitchNote).toContain("no migration");
    expect(summary.pitchNote).toContain("C4");
  });

  it("⭐ changes a label and not a single note number — which is what makes migration unnecessary", () => {
    const songId = newSong();
    /**
     * Every pitch in the song, as the model holds them. Comparing this across a convention change is the
     * criterion that would go red if a convention ever reached the music, which is the one thing it must not do.
     */
    const clipsBefore = JSON.stringify(getMcpSong(songId)!.clips);
    const summary = setMcpNoteConvention(songId, "C3").summary;

    expect(summary.noteConvention).toBe("C3");
    // The note is gone, because the project now states its convention and there is nothing left to assume.
    expect(summary.pitchNote).toBeUndefined();
    expect(JSON.stringify(getMcpSong(songId)!.clips)).toBe(clipsBefore);
  });

  it("clears back to the state a project that never stated one is in", () => {
    const songId = newSong();
    setMcpNoteConvention(songId, "C5");
    expect(summariseSong(getMcpSong(songId)!).noteConvention).toBe("C5");
    expect(summariseSong(getMcpSong(songId)!).pitchNote).toBeUndefined();

    // ⭐ Clearing **removes the key** rather than storing the default, so a project whose statement was cleared
    // and one that never had one are the same project — not merely equal in what they report.
    setMcpNoteConvention(songId, undefined);
    expect("noteConvention" in getMcpSong(songId)!).toBe(false);
    const summary = summariseSong(getMcpSong(songId)!);
    expect(summary.noteConvention).toBe("C4");
    expect(summary.pitchNote).toBeDefined();
  });

  it("refuses a song that does not exist rather than inventing one", () => {
    expect(() => setMcpNoteConvention("no-such-song", "C4")).toThrow(/no song/);
  });
});

/**
 * The second convention in the repository, named rather than left to be inferred from a comment.
 *
 * `AbletonExporter.TRACK_MIDI_MAPPINGS` labels its rows C1/C2/C3/C4 for 36/48/60/72, which is **Ableton's own
 * naming** — note 60 is C3 there — against this project's default of C4. Both are right for their reader, and
 * the danger is not the disagreement but an unlabelled one: a person reading `// C3` beside `baseNote: 60` in a
 * repository whose default is C4 has no way to tell a convention from a bug. These criteria name it, and assert
 * the numbers stay where they are, because `baseNote` becomes the export's pitch offset.
 */
describe("the Ableton export's note naming", () => {
  it("names the convention its labels use, and shows that the same numbers read differently under C4", () => {
    expect(ABLETON_NOTE_NAMES).toBe("C3");
    expect(noteName(36, ABLETON_NOTE_NAMES)).toBe("C1");
    expect(noteName(60, ABLETON_NOTE_NAMES)).toBe("C3");
    expect(noteName(72, ABLETON_NOTE_NAMES)).toBe("C4");
    // The same numbers under this project's own default — the whole reason the convention is worth naming.
    expect(noteName(36, "C4")).toBe("C2");
    expect(noteName(60, "C4")).toBe("C4");
  });

  it("keeps the base notes exactly where they are, because they are what the export transposes by", () => {
    // ⭐ `pitchOffset = defaultMap.baseNote + pitchOffset` in the exporter, so these are load-bearing numbers
    // and not decoration. Naming a convention must never move one — that is the rule this whole line of work
    // exists to hold, applied to its own repository.
    expect(TRACK_MIDI_MAPPINGS.map((row) => row.baseNote)).toEqual([36, 38, 42, 39, 36, 48, 60, 72]);
  });
});
