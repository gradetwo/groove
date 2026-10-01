import { beforeEach, describe, expect, it } from "vitest";
import { clearMcpSongs, createMcpSong, getMcpSong, setMcpNoteConvention, summariseSong } from "../../mcp/song";
import { findGenre } from "../../mcp/library";

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
