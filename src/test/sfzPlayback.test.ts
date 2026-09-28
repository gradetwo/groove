import { describe, expect, it } from "vitest";
import { parseSfz } from "../audio/sfz/parse";
import { playbackForNote, playbackGap } from "../audio/sfz/regionPlayback";

/**
 * A3's criterion: a note becomes a sample, a root and a **ratio** — with the numbers hand-derived from the definition, not from the implementation.
 *
 * The ratio is 2^((note − root)/12) × 2^(tune/1200). Every expectation below is computed from that sentence, so a change to the code that keeps the sentence true passes
 * and a change that breaks it does not.
 */
describe("playbackForNote", () => {
  const one = parseSfz("<region> sample=piano.wav pitch_keycenter=60 lokey=0 hikey=127");

  it("plays at the recorded pitch when the note is the root, and at the octave when it is not", () => {
    expect(playbackForNote(one, 60)).toMatchObject({ sample: "piano.wav", rootKey: 60, semitones: 0, ratio: 1 });
    expect(playbackForNote(one, 72)!.ratio).toBeCloseTo(2, 10);
    expect(playbackForNote(one, 48)!.ratio).toBeCloseTo(0.5, 10);
    // A tritone is the awkward one, and it is exactly 2^(6/12).
    expect(playbackForNote(one, 66)!.ratio).toBeCloseTo(Math.pow(2, 0.5), 10);
    expect(playbackForNote(one, 66)!.semitones).toBe(6);
  });

  it("adds SFZ's tune in cents to the same ratio, not as a second formula", () => {
    const tuned = parseSfz("<region> sample=wobble.wav pitch_keycenter=60 tune=100");
    // 100 cents is one semitone, so the ratio is exactly 2^(1/12).
    expect(playbackForNote(tuned, 60)!.ratio).toBeCloseTo(Math.pow(2, 1 / 12), 10);
    expect(playbackForNote(tuned, 60)!.tuneCents).toBe(100);
    // And it combines with the interval rather than replacing it.
    const both = parseSfz("<region> sample=wobble.wav pitch_keycenter=60 tune=-50");
    expect(playbackForNote(both, 72)!.ratio).toBeCloseTo(2 * Math.pow(2, -50 / 1200), 10);
  });

  it("returns null when nothing covers the note, and the gap names the range instead of saying nothing", () => {
    const narrow = parseSfz("<region> sample=only.wav pitch_keycenter=60 lokey=60 hikey=64 lovel=1 hivel=127");
    expect(playbackForNote(narrow, 70)).toBeNull();
    expect(playbackGap(narrow, 70)).toBe("note 70 has no playback: the file's regions cover keys 60–64");
    // Velocity is a range too: a note that is covered by key but not by velocity has no playback.
    expect(playbackForNote(narrow, 62, { velocity: 0 })).toBeNull();
    expect(playbackGap([], 60)).toMatch(/defines no regions at all/);
  });

  it("cycles round robins through the existing picker rather than choosing again here", () => {
    const rr = parseSfz(`
      <region> sample=rr1.wav pitch_keycenter=60 seq_length=2 seq_position=1
      <region> sample=rr2.wav pitch_keycenter=60 seq_length=2 seq_position=2
    `);
    expect([0, 1, 2, 3].map((nth) => playbackForNote(rr, 60, { nth })!.sample)).toEqual(["rr1.wav", "rr2.wav", "rr1.wav", "rr2.wav"]);
    // The reported position matches the sample, so a reply can say which variant played.
    expect(playbackForNote(rr, 60, { nth: 3 })).toMatchObject({ sample: "rr2.wav", seqPosition: 2 });
  });

  it("uses the narrowest covering region, and inherits the root from the group when the region does not set one", () => {
    const layered = parseSfz(`
      <group> pitch_keycenter=72
      <region> sample=wide.wav lokey=0 hikey=127
      <region> sample=layer.wav lokey=60 hikey=64
    `);
    expect(playbackForNote(layered, 62)!.sample).toBe("layer.wav");
    // Root 72 comes from the group, so note 62 is ten semitones down.
    expect(playbackForNote(layered, 62)!.semitones).toBe(-10);
    expect(playbackForNote(layered, 40)!.sample).toBe("wide.wav");
  });
});
