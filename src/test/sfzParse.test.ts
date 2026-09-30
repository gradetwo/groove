import { describe, expect, it } from "vitest";
import { parseSfz, regionsForNote, roundRobinPick, unresolvedVariables } from "../audio/sfz/parse";
import { playbackForNote } from "../audio/sfz/regionPlayback";

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
    /**
     * **No default transposition** — and this assertion used to say 60, confidently, in a comment about defaults that detune everything when guessed wrong.
     *
     * A real library settled it: with the 60-default model the kick of `virtuosity_drums` came out at ratio 0.28, while sfizz played it at about 1× both through the real
     * kit and through a one-region control with `pitch_keycenter` set. An unset opcode now means "play it as recorded".
     */
    expect(region!.pitchKeycenter).toBeUndefined();
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

/**
 * The criteria for the defect a real library exposed: **an unresolved variable must never become a key range of 0–127.**
 *
 * A kit wrote `key=$KICK_SNRIGHT_KEY`, SFZ's `#define` layer was not implemented, the value failed to parse as a number, and the old fallback made **every region match
 * every note** — so note 38 answered with a kick while sfizz, which understands the variables, correctly triggered nothing. These four assertions exist so that the
 * plausible wrong answer cannot come back.
 */
describe("unresolved variables", () => {
  const withVariable = `
<region> sample=fixed.wav lokey=36 hikey=36 pitch_keycenter=36
<region> sample=var.wav key=$KICK_SNRIGHT_KEY
`;

  it("marks a region that still holds a variable, naming it", () => {
    const regions = parseSfz(withVariable);
    expect(regions[0]!.unresolved).toEqual([]);
    expect(regions[1]!.unresolved).toEqual(["$KICK_SNRIGHT_KEY"]);
  });

  it("never lets a marked region answer a note — the failure was a plausible wrong sample, not an error", () => {
    const regions = parseSfz(withVariable);
    // The marked region claims keys 0–127 by fallback; it must be excluded anyway, for every note tried.
    for (const note of [0, 36, 38, 64, 127]) {
      const matched = regionsForNote(regions, note).map((region) => region.sample);
      expect(matched, `note ${note} must not reach the variable region`).not.toContain("var.wav");
    }
    // And the region that is fully understood still works.
    expect(regionsForNote(regions, 36).map((region) => region.sample)).toEqual(["fixed.wav"]);
  });

  it("reports the variables and how many regions hold them, so the gap is visible rather than silent", () => {
    const report = unresolvedVariables(parseSfz(withVariable));
    expect(report).toEqual({ variables: ["$KICK_SNRIGHT_KEY"], regions: 1 });
    expect(unresolvedVariables(parseSfz("<region> sample=plain.wav"))).toEqual({ variables: [], regions: 0 });
  });

  it("produces no playback at all when every region is unresolved, rather than a default answer", () => {
    const onlyVariables = parseSfz("<region> sample=v.wav key=$A key2=$B");
    const playback = playbackForNote(onlyVariables, 38);
    expect(playback).toBeNull();
    expect(unresolvedVariables(onlyVariables).variables.sort()).toEqual(["$A", "$B"]);
  });
});

/**
 * `key` — the shorthand for `lokey` and `hikey` together, and the second silent widening this file has had.
 *
 * Measured: the real kit writes `key=$KICK_SNRIGHT_KEY` (36 once the variables resolve) and note 38 still matched that kick, while sfizz triggered nothing for 38. Only
 * `lokey`/`hikey` were read, so `key=36` was ignored and the range fell back to 0–127. The criteria below pin the shorthand and its precedence.
 */
describe("the key shorthand", () => {
  it("sets the whole range from one opcode", () => {
    const [region] = parseSfz("<region> sample=kick.wav key=36");
    expect(region!.lokey).toBe(36);
    expect(region!.hikey).toBe(36);
    // And it no longer answers a note it has no business answering.
    expect(regionsForNote(parseSfz("<region> sample=kick.wav key=36"), 38)).toEqual([]);
    expect(regionsForNote(parseSfz("<region> sample=kick.wav key=36"), 36).map((r) => r.sample)).toEqual(["kick.wav"]);
  });

  it("lets the explicit opcodes override the shorthand, whichever order they appear in", () => {
    const [a] = parseSfz("<region> sample=a.wav key=36 lokey=40");
    expect(a!.lokey).toBe(40);
    expect(a!.hikey).toBe(36);
    const [b] = parseSfz("<region> sample=b.wav lokey=40 key=36");
    expect(b!.lokey).toBe(40);
    expect(b!.hikey).toBe(36);
  });
});

/**
 * Inheritance belongs to the region's **own** group — the criterion that would have caught a real bug.
 *
 * The parser used to merge the **final** `global` and `group` into every region, so a file with two groups gave them all the last one's values. Its comment claimed the
 * opposite, which is why the criterion matters more than the comment. A real library — kick under `<group> key=$KICK_SNRIGHT_KEY`, snare under another — is what exposed
 * it: every region ended up with the last group's key, and notes that should have sounded did not.
 */
describe("group inheritance is per region", () => {
  it("gives each region the group it is inside, not the one that came last", () => {
    const regions = parseSfz(`
<group> key=35
<region> sample=kick.wav
<group> key=38
<region> sample=snare.wav
`);
    expect(regions[0]).toMatchObject({ sample: "kick.wav", lokey: 35, hikey: 35 });
    expect(regions[1]).toMatchObject({ sample: "snare.wav", lokey: 38, hikey: 38 });
    // And the consequence that was actually observed: the right note reaches the right sample.
    expect(regionsForNote(regions, 35).map((r) => r.sample)).toEqual(["kick.wav"]);
    expect(regionsForNote(regions, 38).map((r) => r.sample)).toEqual(["snare.wav"]);
  });

  it("still lets a region override its group, and a global apply throughout", () => {
    const regions = parseSfz(`
<global> tune=10
<group> key=35 lokey=30
<region> sample=a.wav hikey=40
<group> key=50
<region> sample=b.wav
`);
    // tune from global, key/lokey from its own group, hikey from the region.
    expect(regions[0]).toMatchObject({ sample: "a.wav", tuneCents: 10, lokey: 30, hikey: 40 });
    expect(regions[1]).toMatchObject({ sample: "b.wav", tuneCents: 10, lokey: 50, hikey: 50 });
  });
});

/**
 * `<master>` — SFZ v2's other global-scope header, which a real library uses for its `ampeg_release` and `tune_cc*` opcodes.
 *
 * Before this, `<master>` was an *unknown* header, so `current` was set to null and **every opcode in it was dropped** — including, in principle, a key range. The rule is the
 * minimal honest one: it applies to the regions that follow, as a global does. What SFZ distinguishes between the two is reset points, and modelling that with no consumer
 * for it would be inventing behaviour nobody asked for.
 */
describe("the master header", () => {
  it("applies to the regions that follow, like a global", () => {
    const regions = parseSfz("<master> key=36 tune=10\n<region> sample=kick.wav");
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ sample: "kick.wav", lokey: 36, hikey: 36, tuneCents: 10 });
    // And the opcodes are kept rather than dropped, so nothing set there is silently lost.
    expect(regions[0]!.opcodes.tune).toBe("10");
  });

  it("does not disturb a file that never uses it", () => {
    const plain = parseSfz("<region> sample=a.wav key=40");
    expect(plain[0]).toMatchObject({ lokey: 40, hikey: 40 });
    expect(plain[0]!.opcodes.master).toBeUndefined();
  });
});

/**
 * A `sample=` path that contains spaces — **measured against sfizz rather than read off the grammar**.
 *
 * Muse reported `sample=Tubular Bells 1/chimes.wav` arriving as `Tubular`, and the fix at the time was to *report* the cut on the region, on the reading that an unquoted value
 * ends at whitespace. The reference engine disagrees, and it is the standard this project settles semantics with: rendering a 440 Hz tone through
 * `sample=space dir/tone.wav` produces the tone (peak 0.0824), while the quoted form `sample="space dir/tone.wav"` renders **silence** (peak 0.000031). sfizz reads the
 * spaces and rejects the quotes — so the truncation was ours, and the advice it printed ("a name containing spaces must be quoted") is the one form that does not play.
 *
 * This is not a corner: VCSL, which the manifest mirrors, writes every sample path unquoted and many of them inside directories with spaces. Under the old rule the
 * timpani — the only orchestral instrument the mirror holds — resolved to a file called `Timpani`, which is no file at all.
 */
describe("a sample path containing spaces", () => {
  it("reads the whole path when it is alone on the line, as VCSL writes it", () => {
    const regions = parseSfz("<region> sample=Timpani 1/Hit/Timpani1_Hit_v2_rr1_Sum.wav\npitch_keycenter=42\nlokey=41\nhikey=44");
    expect(regions[0]!.sample).toBe("Timpani 1/Hit/Timpani1_Hit_v2_rr1_Sum.wav");
    // The bug this replaces: `Timpani`.
    expect(regions[0]!.sample).not.toBe("Timpani");
    expect(regions[0]).toMatchObject({ pitchKeycenter: 42, lokey: 41, hikey: 44 });
  });

  it("reads the whole path and still finds the opcodes written after it on the same line", () => {
    const regions = parseSfz("<region> sample=space dir/tone.wav pitch_keycenter=60 lokey=1 hikey=2");
    expect(regions[0]).toMatchObject({ sample: "space dir/tone.wav", pitchKeycenter: 60, lokey: 1, hikey: 2 });
  });

  it("resolves the note to the whole path rather than to a directory name", () => {
    const regions = parseSfz(`<group> ampeg_release=30
<region> seq_length=2
seq_position=1
lovel=0
hivel=65
sample=Timpani 1/Hit/Timpani1_Hit_v2_rr1_Sum.wav
pitch_keycenter=42
lokey=41
hikey=44
`);
    const playback = playbackForNote(regions, 42, { velocity: 40 });
    expect(playback?.sample).toBe("Timpani 1/Hit/Timpani1_Hit_v2_rr1_Sum.wav");
    expect(playback?.rootKey).toBe(42);
  });

  it("still accepts the quoted form, which is more forgiving than the engine it is compared against", () => {
    const regions = parseSfz('<region> sample="space dir/tone.wav" pitch_keycenter=60');
    expect(regions[0]!.sample).toBe("space dir/tone.wav");
  });

  it("does not read an empty value as the next opcode's text", () => {
    // The scanner moves on to the next pair rather than swallowing it, which is what the old pattern did by failing to match.
    const regions = parseSfz("<region> sample=tone.wav lovel= hivel=63");
    expect(regions[0]!.opcodes.hivel).toBe("63");
    expect(regions[0]!.sample).toBe("tone.wav");
  });
});
