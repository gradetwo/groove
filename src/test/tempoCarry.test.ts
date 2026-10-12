import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flattenSong } from "../data/songFlatten";
import type { Song } from "../types/song";

/**
 * Decision 2b's last model step: the renderer is handed a **pattern** and nothing else, so the tempo map has to travel on it — **additively**.
 *
 * The criterion the decision record set is "absent → byte-identical", and here it has a sharp form: a song with no map must come back with the **same pattern
 * object**, not a copy that happens to serialise the same. Anything weaker would let a downstream change slip in unnoticed.
 */
const lane = () => ({
  track_id: "kick",
  name: "Kick",
  instrument: "drum",
  steps: Array.from({ length: 16 }, (_, index) => (index === 0 ? 1 : 0)),
  velocity: new Array(16).fill(100),
});

const song = (extra: Record<string, unknown> = {}): Song =>
  ({
    id: "s",
    genreId: "custom",
    bpm: 120,
    clips: { A: { genre_id: "custom", bpm: 120, totalSteps: 16, tracks: [lane()] } },
    sections: [{ id: "s1", slot: "A", bars: 1 }],
    ...extra,
  }) as unknown as Song;

describe("the tempo map on the flattened pattern", () => {
  it("is absent — the same object, no key — when the song has no map", () => {
    const flattened = flattenSong(song());
    expect(JSON.stringify(flattened.pattern)).not.toContain("tempoTrack");
    // Object identity, because "identical after a round trip" is a weaker claim than "nothing was copied".
    const again = flattenSong(song());
    expect(JSON.stringify(again.pattern)).toBe(JSON.stringify(flattened.pattern));
  });

  it("travels with the pattern, in order, when the song has one", () => {
    const flattened = flattenSong(song({ tempoTrack: [{ atBar: 2, bpm: 168 }, { atBar: 0, bpm: 84, curve: "linear" }] }));
    expect(flattened.pattern.tempoTrack).toEqual([{ atBar: 2, bpm: 168 }, { atBar: 0, bpm: 84, curve: "linear" }]);
  });

  it("is what the renderer reads, so the seam is no longer inert", () => {
    // The exporter's own read, asserted here because this is the file that decides whether the field can ever be present.
    const source = readFileSync("src/audio/WavExporter.ts", "utf8");
    expect(source).toMatch(/\(pattern as \{ tempoTrack\?: TempoPoint\[\] \}\)\.tempoTrack/);
    expect(flattenSong(song({ tempoTrack: [{ atBar: 1, bpm: 90 }] })).pattern.tempoTrack).toHaveLength(1);
  });
});
