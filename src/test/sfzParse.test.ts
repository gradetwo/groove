import { describe, expect, it } from "vitest";
import { parseSfz, regionsForNote, roundRobinPick } from "../audio/sfz/parse";

/**
 * The SFZ subset's criteria (A2), hand-derived rather than borrowed from sfizz — because nobody can compare against a reference before they can parse at all.
 *
 * The tests are written around the two things that actually break: **inheritance** across `<global>` → `<group>` → `<region>`, and the **defaults** SFZ specifies, of
 * which `pitch_keycenter = 60` is the one that silently detunes an instrument if a parser guesses wrong.
 */
describe("parseSfz", () => {
  it("reads a minimal region and applies SFZ's own defaults", () => {
    const [region] = parseSfz("<region> sample=tone.wav");
    expect(region).toBeDefined();
    expect(region!.sample).toBe("tone.wav");
    expect(region!.lokey).toBe(0);
    expect(region!.hikey).toBe(127);
    expect(region!.lovel).toBe(0);
    expect(region!.hivel).toBe(127);
    // The default that detunes everything if it is guessed: SFZ says 60.
    expect(region!.pitchKeycenter).toBe(60);
    expect(region!.tuneCents).toBe(0);
    expect(region!.seqLength).toBe(1);
  });

  it("inherits global, then group, then region — each level overriding the one before", () => {
    const text = `
      // a comment, which must not swallow the file
      <global> tune=10 lokey=24
      <group> lokey=36 hivel=100
      <region> sample=a.wav hikey=48
      <region> sample=b.wav
    `;
    const [a, b] = parseSfz(text);
    // tune comes from global, lokey from group (overriding global), hikey from the region.
    expect(a).toMatchObject({ sample: "a.wav", tuneCents: 10, lokey: 36, hikey: 48, hivel: 100 });
    // The second region inherits the same group values and its own sample, and keeps the default hikey.
    expect(b).toMatchObject({ sample: "b.wav", tuneCents: 10, lokey: 36, hikey: 127, hivel: 100 });
  });

  it("ignores an unknown header and unknown opcodes rather than failing on them", () => {
    const regions = parseSfz(`
      <control> default_path=samples
      <region> sample=c.wav made_up_opcode=7 lovel=20
    `);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.sample).toBe("c.wav");
    expect(regions[0]!.lovel).toBe(20);
    // Kept, not discarded: a later stage can use it without reparsing the file.
    expect(regions[0]!.opcodes.made_up_opcode).toBe("7");
  });

  it("reads round-robin and tuning opcodes with SFZ's spelling", () => {
    const regions = parseSfz(`
      <region> sample=rr1.wav seq_length=2 seq_position=1
      <region> sample=rr2.wav seq_length=2 seq_position=2
    `);
    expect(regions.map((region) => [region.sample, region.seqLength, region.seqPosition])).toEqual([
      ["rr1.wav", 2, 1],
      ["rr2.wav", 2, 2],
    ]);
  });
});

describe("region selection", () => {
  const regions = parseSfz(`
    <region> sample=low.wav lokey=0 hikey=59
    <region> sample=high.wav lokey=60 hikey=127
  `);

  it("picks the region that covers the note and the velocity", () => {
    expect(regionsForNote(regions, 40).map((region) => region.sample)).toEqual(["low.wav"]);
    expect(regionsForNote(regions, 72).map((region) => region.sample)).toEqual(["high.wav"]);
    // Nothing covers a note outside every range, and that must be an empty answer rather than a wrong sample.
    expect(regionsForNote(parseSfz("<region> sample=only.wav lokey=60 hikey=60"), 61)).toEqual([]);
  });

  it("prefers the narrowest key range when two regions cover the same note", () => {
    const layered = parseSfz(`
      <region> sample=wide.wav lokey=0 hikey=127
      <region> sample=layer.wav lokey=60 hikey=64
    `);
    expect(regionsForNote(layered, 62).map((region) => region.sample)).toEqual(["layer.wav"]);
    // Outside the narrow layer, the wide one is all that is left.
    expect(regionsForNote(layered, 40).map((region) => region.sample)).toEqual(["wide.wav"]);
  });

  it("cycles round robins in order, and returns one region when there is no round robin", () => {
    const rr = parseSfz(`
      <region> sample=rr1.wav seq_length=2 seq_position=1
      <region> sample=rr2.wav seq_length=2 seq_position=2
    `);
    expect([0, 1, 2, 3].map((nth) => roundRobinPick(rr, nth)!.sample)).toEqual(["rr1.wav", "rr2.wav", "rr1.wav", "rr2.wav"]);
    const plain = parseSfz("<region> sample=only.wav");
    expect(roundRobinPick(plain, 7)!.sample).toBe("only.wav");
    expect(roundRobinPick([], 0)).toBeNull();
  });
});
