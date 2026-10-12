import { describe, expect, it } from "vitest";
import { toMusicXml } from "../data/musicxml";
import { fromMusicXml } from "../data/musicxmlImport";
import type { NoteEvent } from "../types/arrangementV2";

/**
 * ⭐ **A tie is paired inside one voice, not across voices.**
 *
 * The writer assigns voices per measure: a note crossing a barline is written as a head in one measure and a tied
 * continuation in the next, and when a second voice has to hold a continuation, two voices end up carrying a tie on
 * the **same pitch** at once. This project's own writer does exactly that — see `notesToMeasures`' voice rule — so a
 * reader that pairs ties by pitch alone lets one voice's stop consume the other voice's start.
 *
 * Measured before the fix: reading these three notes back produced **four**, with two of them keeping only their
 * head (`+0.25` instead of `+1.25`) and one stranded continuation (`62@8+1`).
 *
 * The cases below are the writer's own output read back, so they fail if either side stops agreeing about voices.
 */
const N = (pitch: number, startBeats: number, lengthBeats: number) => ({ pitch, startBeats, lengthBeats, velocity: 100 } as unknown as NoteEvent);
const roundTrip = (notes: NoteEvent[]) =>
  (fromMusicXml(toMusicXml(notes, 4, { title: "t", partName: "P", beatsPerMeasure: 4, beatType: 4 })) as ReturnType<typeof fromMusicXml>)
    .parts.flatMap((part) => part.notes)
    .map((note) => `${note.pitch}@${note.startBeats}+${note.lengthBeats}`)
    .sort();

describe("a tie belongs to one voice", () => {
  it("⭐ keeps both notes when two voices each tie the same pitch across a barline", () => {
    const written = roundTrip([N(60, 3.5, 0.25), N(62, 3.75, 1.25), N(62, 7.75, 1.25)]);
    expect(written).toEqual(["60@3.5+0.25", "62@3.75+1.25", "62@7.75+1.25"]);
    expect(written).toHaveLength(3);
  });

  it("still reads a single voice note that crosses a barline as one note", () => {
    expect(roundTrip([N(62, 3.75, 1.25)])).toEqual(["62@3.75+1.25"]);
  });

  it("pairs ties by voice and pitch, so a second voice on the same pitch does not consume the first", () => {
    const twoVoices = roundTrip([N(62, 0.5, 1.25), N(62, 0.5, 1.25), N(62, 3.75, 1.25)]);
    expect(twoVoices.filter((k) => k === "62@0.5+1.25")).toHaveLength(2);
    expect(twoVoices).toContain("62@3.75+1.25");
  });
});
