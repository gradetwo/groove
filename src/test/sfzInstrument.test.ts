import { describe, expect, it } from "vitest";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { parseSfz } from "../audio/sfz/parse";
import { playbackForNote } from "../audio/sfz/regionPlayback";

/**
 * The five criteria fixed **before** this code was written, so they judge the contract rather than the implementation.
 *
 * The first is the one the objective demands of every step in this workstream: a catalogue entry without the field behaves exactly as it did before, which is what
 * keeps "a song that references no instrument is unchanged" true by construction rather than by hope.
 */
const instrument = (extra: Record<string, unknown> = {}) => ({ assetId: "piano", sfz: { url: "/samples/piano.sfz" }, ...extra });
const SFZ = `
<region> sample=low.wav lokey=0 hikey=47 pitch_keycenter=40
<region> sample=mid.wav lokey=48 hikey=71 pitch_keycenter=60
<region> sample=high.wav lokey=72 hikey=127 pitch_keycenter=84 tune=100
`;

describe("resolveInstrumentNote", () => {
  it("refuses an entry that is not an instrument, without touching anything else", () => {
    const plain = { assetId: "riser-01" };
    const result = resolveInstrumentNote(plain, SFZ, 60);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('sample "riser-01" is not an instrument (it has no sfz)');
    expect(result.regions).toEqual([]);
    // The entry itself is untouched: this function has no side effects on the catalogue.
    expect(plain).toEqual({ assetId: "riser-01" });
  });

  it("returns exactly what playbackForNote returns — the arithmetic stays in one place", () => {
    const regions = parseSfz(SFZ);
    for (const note of [40, 52, 60, 72, 90]) {
      const expected = playbackForNote(regions, note)!;
      const resolved = resolveInstrumentNote(instrument(), SFZ, note);
      expect(resolved.ok, `note ${note} should resolve`).toBe(true);
      expect(resolved.note).toEqual({
        samplePath: expected.sample,
        rootKey: expected.rootKey,
        ratio: expected.ratio,
        seqPosition: expected.seqPosition,
      });
    }
    // And the value is not trivially 1 everywhere, which would make the comparison meaningless.
    expect(resolveInstrumentNote(instrument(), SFZ, 52).note!.ratio).not.toBeCloseTo(1, 3);
    expect(resolveInstrumentNote(instrument(), SFZ, 72).note!.ratio).not.toBeCloseTo(1, 3);
  });

  it("explains an uncovered note instead of picking the nearest sample", () => {
    const narrow = "<region> sample=only.wav lokey=60 hikey=64 pitch_keycenter=60";
    const result = resolveInstrumentNote(instrument(), narrow, 70);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("note 70 has no playback: the file's regions cover keys 60–64");
    expect(result.note).toBeUndefined();
    // The regions are still reported, so a caller can say what the instrument does cover.
    expect(result.regions).toHaveLength(1);
  });

  it("cycles round robins in file order through the same picker", () => {
    const rr = `
<region> sample=rr1.wav pitch_keycenter=60 seq_length=2 seq_position=1
<region> sample=rr2.wav pitch_keycenter=60 seq_length=2 seq_position=2
`;
    const paths = [0, 1, 2, 3].map((nth) => resolveInstrumentNote(instrument(), rr, 60, { nth }).note!.samplePath);
    expect(paths).toEqual(["rr1.wav", "rr2.wav", "rr1.wav", "rr2.wav"]);
  });

  it("treats empty or region-less SFZ text as an error rather than as silence", () => {
    const empty = resolveInstrumentNote(instrument(), "   ", 60);
    expect(empty.ok).toBe(false);
    expect(empty.reason).toBe('instrument "piano" has empty SFZ text');

    // A file that parses to nothing — a header this subset does not model — is its own, distinct reason.
    const headerOnly = resolveInstrumentNote(instrument(), "<control> default_path=samples", 60);
    expect(headerOnly.ok).toBe(false);
    expect(headerOnly.reason).toBe('instrument "piano" defines no regions');

    // And a velocity outside every region is a gap, not a default.
    const byVelocity = resolveInstrumentNote(instrument(), "<region> sample=x.wav lovel=100 hivel=127", 60, { velocity: 10 });
    expect(byVelocity.ok).toBe(false);
    expect(byVelocity.reason).toMatch(/no playback/);
  });
});
