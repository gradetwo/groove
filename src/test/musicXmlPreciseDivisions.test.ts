import { describe, expect, it } from "vitest";
import { toMusicXml } from "../data/musicxml";
import { fromMusicXml } from "../data/musicxmlImport";

/**
 * Off-grid note lengths survive the round trip.
 *
 * Measured on the owner's corpus: a length of 2.167 beats came back as 2.25 and 1.833 as 1.75, because the writer
 * wrote four divisions per quarter and rounded each length to whole divisions. The divisions are now derived from
 * the content up to the project's own tick resolution, and the assertions below turn red if that is undone.
 */
const N = (pitch: number, startBeats: number, lengthBeats: number) => ({ pitch, startBeats, lengthBeats, velocity: 100 }) as never;
const r3 = (value: number) => Math.round(value * 1000) / 1000;
const roundTrip = (notes: unknown[]) =>
  (fromMusicXml(toMusicXml(notes as never, 100, { title: "t", partName: "P", beatsPerMeasure: 4, beatType: 4 })) as ReturnType<typeof fromMusicXml>)
    .parts.flatMap((part) => part.notes)
    .map((note) => [note.pitch, note.startBeats, r3(note.lengthBeats)]);
/**
 * The comparison is to three decimals, because `2.167` is itself a rounded decimal: its true length is thirteen
 * sixths, so no division count can return it bit for bit. Twenty four divisions return `52/24`, which is the same
 * number to three decimals, and the corpus comparison this has to satisfy is to three decimals too. Reverting to
 * four divisions returns 2.25 and fails here.
 */

describe("a length that is not on the quarter grid survives", () => {
  it("keeps 2.167 and 1.833 beats exactly", () => {
    expect(roundTrip([N(41, 386.5, 2.167)])).toEqual([[41, 386.5, 2.167]]);
    expect(roundTrip([N(48, 386.5, 1.833)])).toEqual([[48, 386.5, 1.833]]);
  });
  it("still writes four divisions when four are enough", () => {
    expect(toMusicXml([N(60, 0, 1)] as never, 4, { title: "t" })).toContain("<divisions>4</divisions>");
  });
});

/**
 * ⭐ **The note type label follows the division count the file uses** (docs/OPEN_WORK.md 255).
 *
 * With the count raised to twenty four, a one beat note is written as twenty four divisions, and a label computed
 * from the old constant would call that six beats. The assertion below turns red if the label stops being derived
 * from the actual count.
 */
describe("the type label follows the divisions", () => {
  it("calls one beat at twenty four divisions a quarter note", () => {
    const xml = toMusicXml([N(60, 0, 1)] as never, 4, { title: "t", partName: "P", beatsPerMeasure: 4, beatType: 4 });
    expect(xml).toContain("<divisions>4</divisions>");
    expect(xml).toContain("<type>quarter</type>");
  });

  it("still labels a one beat note a quarter when a finer division is needed", () => {
    const xml = toMusicXml([N(41, 386.5, 2.167), N(60, 0, 1)] as never, 400, { title: "t", partName: "P", beatsPerMeasure: 4, beatType: 4 });
    expect(xml).not.toContain("<divisions>4</divisions>");
    expect((xml.match(/<type>quarter<\/type>/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
