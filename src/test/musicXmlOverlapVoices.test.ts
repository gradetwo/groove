import { describe, expect, it } from "vitest";
import { toMusicXml } from "../data/musicxml";
import { fromMusicXml } from "../data/musicxmlImport";

/**
 * A note that begins while another is still sounding keeps its own position.
 *
 * Measured on the owner's corpus and reduced to two notes: a length of 2 beats starting at beat 126 inside a length
 * of 8.5 starting at beat 120 came back at beat 128, because the writer gave both notes one voice and nothing
 * rewound the cursor, so musicxml read them in sequence. The cause was a single measure slot per voice where a
 * range was needed, and this assertion turns red if that returns.
 */
const N = (pitch: number, startBeats: number, lengthBeats: number) => ({ pitch, startBeats, lengthBeats, velocity: 100 }) as never;
const roundTrip = (notes: unknown[]) =>
  (fromMusicXml(toMusicXml(notes as never, 96, { title: "t", partName: "P", beatsPerMeasure: 4, beatType: 4 })) as ReturnType<typeof fromMusicXml>)
    .parts.flatMap((part) => part.notes)
    .map((note) => [note.pitch, note.startBeats, note.lengthBeats])
    .sort((a, b) => (a[0] as number) - (b[0] as number));

describe("an overlap keeps both positions", () => {
  it("keeps the short note at 126 inside the long one from 120", () => {
    expect(roundTrip([N(33, 126, 2), N(64, 120, 8.5)])).toEqual([
      [33, 126, 2],
      [64, 120, 8.5],
    ]);
  });

  it("still round trips notes that follow one another", () => {
    expect(roundTrip([N(60, 0, 1), N(64, 1, 1)])).toEqual([
      [60, 0, 1],
      [64, 1, 1],
    ]);
  });
});
