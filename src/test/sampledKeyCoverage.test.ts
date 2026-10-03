/**
 * **The coverage reading is the engine's, and it is a key set rather than a printed span.**
 *
 * These criteria judge `src/features/sampledCoverage/sampledKeyCoverage.ts`, the module the picker and the track report
 * both read. Their job is to make two specific substitutions impossible:
 *
 *   · **a hardcoded table.** Every assertion here drives the answer from **fixture SFZ regions**; the same asset with
 *     two different programs must produce two different answers. A table would pass a single case and fail the pair.
 *   · **a min/max comparison.** The fixtures include a recording whose span has a hole in the middle — the shape the
 *     census measured in `mtg-solo-sax:MTG-Tenor-Sax` (39–76, no 41–43) and in
 *     `dsmolken-double-bass` (12–120, no 61–71 or 90–95) — and notes written into the hole must be refused.
 */
import { describe, expect, it } from "vitest";
import {
  keyRuns,
  notesOutsideCoverage,
  sampledKeyCoverage,
  writtenNotesOf,
  writtenRange,
} from "../features/sampledCoverage/sampledKeyCoverage";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerTrack } from "../types/genre";

/** A catalogue entry that is an instrument. The url is never fetched: every program here is supplied as text. */
const asset = (assetId: string): SampleAsset => ({
  assetId,
  name: assetId,
  kind: "one-shot",
  seconds: 0,
  sfz: { url: `https://fixture.invalid/${assetId}.sfz` },
});

/**
 * The measured shape of `mtg-solo-sax:MTG-Tenor-Sax`: sounds 39–76, and **41/42/43 have no sample**
 * (`docs/SAMPLED_RANGE_COVERAGE.md` §2.1). Two regions rather than four so the hole is unmistakably a hole.
 */
const TENOR = `
<region> sample=tenor-a3.wav lokey=39 hikey=40 pitch_keycenter=39
<region> sample=tenor-bb3.wav lokey=44 hikey=76 pitch_keycenter=44
`;

/** The measured shape of `dsmolken-double-bass:d-smolken-rubner-bass-pizz`: 12–120 with two interior gaps. */
const RUBNER_BASS = `
<region> sample=bass-low.wav lokey=12 hikey=60 pitch_keycenter=12
<region> sample=bass-mid.wav lokey=72 hikey=89 pitch_keycenter=72
<region> sample=bass-high.wav lokey=96 hikey=120 pitch_keycenter=96
`;

const range = (keys: readonly number[], first: number, last: number): number[] =>
  keys.filter((key) => key >= first && key <= last);

describe("what a recording can sound, asked of the engine", () => {
  it("⭐ the same asset with two different programs gives two different answers", () => {
    const sax = asset("mtg-solo-sax:MTG-Tenor-Sax");
    const tenor = sampledKeyCoverage(sax, TENOR);
    const other = sampledKeyCoverage(sax, "<region> sample=x.wav lokey=20 hikey=30 pitch_keycenter=20");
    expect(tenor).not.toBeNull();
    expect(other).not.toBeNull();
    // A hardcoded table for this assetId would give one of these two answers to both programs — and is therefore red.
    expect([tenor!.first, tenor!.last]).toEqual([39, 76]);
    expect([other!.first, other!.last]).toEqual([20, 30]);
  });

  it("reports the hole inside the span rather than only its edges", () => {
    const tenor = sampledKeyCoverage(asset("mtg-solo-sax:MTG-Tenor-Sax"), TENOR)!;
    expect(tenor.first).toBe(39);
    expect(tenor.last).toBe(76);
    expect(tenor.holes).toEqual([41, 42, 43]);
    // 39, 40 and 44–76 sound: 2 + 33.
    expect(tenor.keys).toHaveLength(35);
    expect(range(tenor.keys, 41, 43)).toEqual([]);
  });

  it("finds both measured holes of the double bass", () => {
    const bass = sampledKeyCoverage(asset("dsmolken-double-bass:d-smolken-rubner-bass-pizz"), RUBNER_BASS)!;
    expect([bass.first, bass.last]).toEqual([12, 120]);
    expect(bass.holes).toEqual([61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 90, 91, 92, 93, 94, 95]);
    expect(keyRuns(bass.holes)).toEqual([
      [61, 71],
      [90, 95],
    ]);
  });

  it("says a recording sounds nothing when the engine refuses every key, rather than inventing 0–0", () => {
    // Every region is a release sample, so no note-on can answer one.
    const releaseOnly = sampledKeyCoverage(asset("release-only"), "<region> sample=rel.wav lokey=0 hikey=127 trigger=release");
    expect(releaseOnly).toBeNull();
  });
});

describe("the notes a lane writes, and whether the engine refuses them", () => {
  it("reads a step's chord stack and its velocity the way the model states them", () => {
    const lane = {
      track_id: "chords",
      steps: [1, 1, 0],
      pitches: [[60, 64, 67], [72], [80]],
      velocity: [127, 20, 100],
    } as unknown as SequencerTrack;
    const notes = writtenNotesOf(lane);
    expect(notes.map((note) => [note.pitch, note.velocity])).toEqual([
      [60, 127],
      [64, 127],
      [67, 127],
      [72, 20],
    ]);
    expect(writtenRange(notes)).toEqual({ first: 60, last: 72 });
  });

  it("⭐ a note written into a hole is outside the recording, though it is inside the printed span", () => {
    const sax = asset("mtg-solo-sax:MTG-Tenor-Sax");
    const inHole = [41, 42, 43].map((pitch, step) => ({ step, pitch, velocity: 100 }));
    expect(notesOutsideCoverage(sax, TENOR, inHole).map((note) => note.pitch)).toEqual([41, 42, 43]);
    // And the edges really are inside: a min/max comparison would also pass these, which is the point of the pair.
    const inside = [39, 44, 76].map((pitch, step) => ({ step, pitch, velocity: 100 }));
    expect(notesOutsideCoverage(sax, TENOR, inside)).toEqual([]);
  });

  it("asks at each note's own velocity, because the resolver gates on it", () => {
    // One region gated to soft playing only: a note at low velocity sounds, the same key at full velocity does not.
    const softOnly = "<region> sample=soft.wav lokey=60 hikey=60 pitch_keycenter=60 hivel=40";
    const soft = asset("soft-only");
    expect(notesOutsideCoverage(soft, softOnly, [{ step: 0, pitch: 60, velocity: 20 }])).toEqual([]);
    expect(notesOutsideCoverage(soft, softOnly, [{ step: 0, pitch: 60, velocity: 127 }])).toEqual([
      { step: 0, pitch: 60, velocity: 127 },
    ]);
  });

  it("collapses consecutive keys into runs for a label, and leaves a single key without a dash", () => {
    expect(keyRuns([41, 42, 43, 60, 90, 91, 95])).toEqual([
      [41, 43],
      [60, 60],
      [90, 91],
      [95, 95],
    ]);
  });
});
