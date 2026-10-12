import { describe, expect, it } from "vitest";
import { noteNumber, parseSfz, regionsForNote, roundRobinPick, unresolvedVariables } from "../audio/sfz/parse";
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

/**
 * ⭐ **Reading a `sample=` path that contains spaces — measured against sfizz, not read off the grammar.**
 *
 * Muse reported `Tubular Bells 1/chimes.wav` arriving as `Tubular`. The fix at the time was to *report* the cut on the
 * region, on the reading that an unquoted value ends at whitespace and a name with spaces must be quoted. The
 * reference engine says the opposite, and it is the standard this project settles semantics with: one 440 Hz tone,
 * only the `sample=` spelling changed —
 *
 * ```
 *   sample=space dir/tone.wav       peak 0.0824    the tone
 *   sample="space dir/tone.wav"     peak 0.000031  silence
 * ```
 *
 * sfizz reads the spaces and rejects the quotes, so the truncation was ours. `parseSfz` therefore reads an unquoted
 * sample's value **to the end of the line**, or up to the next `name=` pair when the line carries opcodes after it.
 * The quoted spelling is still read — a parser more forgiving than the engine is not a defect — but these criteria pin
 * the **reading** rather than an error, and none of them presents quoting as the better form: it is the spelling
 * sfizz renders silent.
 *
 * This is not a corner: VCSL, which the manifest mirrors, writes every sample path unquoted and many of them inside
 * directories with spaces. Under the old rule the timpani — the only orchestral instrument the mirror holds —
 * resolved to a directory name and was silent.
 */
describe("reading a sample path that contains spaces", () => {
  it("reads the unquoted path to the end of the line instead of cutting it at the first space", () => {
    const [region] = parseSfz("<region> sample=Tubular Bells 1/chimes.wav");
    // The 0.0824 form: the whole path is what the engine plays, so the whole path is what is read.
    expect(region!.sample).toBe("Tubular Bells 1/chimes.wav");
    // The reading this replaces, and the reason the report existed: `Tubular` is a directory, not a sample.
    expect(region!.sample).not.toBe("Tubular");
  });

  it("stops the unquoted path at the next `name=` pair and still reads the opcodes that follow", () => {
    const [region] = parseSfz("<region> sample=space dir/tone.wav pitch_keycenter=60 lokey=1 hikey=2");
    // "To end of line" has one exception: the next assignment ends the value rather than joining it.
    expect(region!.sample).toBe("space dir/tone.wav");
    expect(region).toMatchObject({ pitchKeycenter: 60, lokey: 1, hikey: 2 });
  });

  it("reads a quoted path whole too, recording that the quoted spelling is the one sfizz renders silent", () => {
    const [region] = parseSfz('<region> sample="Tubular Bells 1/chimes.wav" pitch_keycenter=60');
    /**
     * **The reading, not an error.** The engine rejects the quotes (peak 0.000031); this parser strips them and reads
     * the same path the unquoted spelling gives. That is a parser more forgiving than its reference, which is allowed —
     * what is *not* allowed is the old advice that a name with spaces **must** be quoted, because that names the one
     * spelling that does not play. The value is pinned so a later "fix" cannot quietly make quoting mandatory and take
     * VCSL's unquoted paths with it.
     */
    expect(region!.sample).toBe("Tubular Bells 1/chimes.wav");
    // The opcode after the quoted path is still read, so the line was understood rather than merely excused.
    expect(region!.pitchKeycenter).toBe(60);
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
 * `<master>` — the intermediate header in SFZ's hierarchy, which a real library uses for its `ampeg_release`,
 * `tune_cc*`, `key=` and bleed opcodes.
 *
 * ## The hierarchy, in the format's own words
 *
 * [sfzformat.com's headers page](https://sfzformat.com/headers/) states it as a definition rather than a note:
 * *"The global header (one per file) contains opcodes which apply to all regions in the file. The master header is an
 * extra level added inbetween group and global for the ARIA player. So, the **global/group/region or
 * global/master/group/region hierarchy** contains the opcodes which define which samples are played…"* — and its
 * [`‹master›` page](https://sfzformat.com/headers/master/) gives the worked example, a bass then a tenor whose
 * **`key=` sits on the `<master>` header itself**.
 *
 * ## What each scope does, **measured against sfizz** rather than read off the grammar
 *
 * `sfizz_render` is the reference engine this project already settles SFZ semantics with, and this header was where a
 * plausible reading was wrong. One 0.25 s 1 kHz region per fixture, rendered at 44.1 kHz, **peak in parentheses**:
 *
 * ```
 *   global(key=36) → master(key=40) → region        36: 0.0000   40: 0.0604   the master's key wins
 *   global(key=36) → master()       → region        36: 0.0604   40: 0.0000   a bare master keeps the global's
 *   master(key=36) → master(key=40) → region        36: 0.0000   40: 0.0604   the second master replaces the first
 *   master(key=36) → master()       → region        36: 0.0604   40: 0.0604   unconstrained: see below
 *   global(key=36) → master(key=40) → master() → region  36: 0.0604  40: 0.0000
 *   group(key=50)  → master(key=54) → region        50: 0.0000   54: 0.0604   the group does NOT survive
 *   master(key=54) → group(key=50)  → region        50: 0.0604   54: 0.0000   a group inside the master does
 * ```
 *
 * The fourth line is not a second sound: that fixture's earlier `key=36` had already been replaced, the master
 * inherited nothing that bound note 40, so the region was unconstrained and matched both. Every other line agrees on
 * the rule the parser now implements — **a new `<master>` starts from the `<global>` scope, and it ends any `<group>`
 * that was open before it.**
 *
 * ## Why this was worth a real library
 *
 * `virtuosity_drums` is written entirely this way: its program sets `key=50` in a `<global>` for the high tom,
 * `snaremic_basic.sfz` opens a `<group> key=50` and never closes it, and the percussion mappings that follow are
 * `<master> key=$PERC_…` blocks. With `<master>` folded into the global scope and `<group>` surviving into it,
 * **all 752 percussion regions of the basic kit answered note 50** and notes 54–84 — the tambourine, cowbell, congas,
 * bongos, shakers, triangles and agogos the library ships — answered nothing.
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

  /**
   * sfizz line 2 of the table above: a `<master>` that states no `key` **keeps the global's**, which is the half of the
   * old rule that was right and is what makes the perc mappings' shared `loop_mode`/`tune_cc*` reach their regions.
   */
  it("inherits from the global scope, so a bare master keeps the file's own settings", () => {
    const regions = parseSfz("<global> key=36 tune_cc90=1200\n<master> ampeg_release=0.5\n<region> sample=tom.wav");
    expect(regions[0]).toMatchObject({ sample: "tom.wav", lokey: 36, hikey: 36 });
  });

  /** sfizz line 3: `<master>` replaces `<master>`, so a second piece cannot inherit the first piece's key. */
  it("starts a new layer rather than extending the previous one", () => {
    const regions = parseSfz("<master> key=36\n<region> sample=kick.wav\n<master> key=40\n<region> sample=snare.wav");
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({ sample: "kick.wav", lokey: 36, hikey: 36 });
    expect(regions[1]).toMatchObject({ sample: "snare.wav", lokey: 40, hikey: 40 });
  });

  /**
   * sfizz lines 4 and 5: the master's earlier value is gone, so a **bare** master after a keyed one binds nothing —
   * which is the observable difference between "replaced" and "cleared to the global scope".
   */
  it("clears the previous master's key, so a bare master binds no note of its own", () => {
    const regions = parseSfz("<master> key=36\n<master> key=40\n<master>\n<region> sample=x.wav");
    expect(regions[0]).toMatchObject({ sample: "x.wav", lokey: 0, hikey: 127 });
  });

  /** sfizz line 6: `<group>` does not survive a `<master>` — the measured cause of the 752-wrong-regions defect. */
  it("ends a group that was open before it, so the master's key is the one that applies", () => {
    const regions = parseSfz("<group> key=50\n<master> key=54\n<region> sample=tamb.wav");
    expect(regions[0]).toMatchObject({ sample: "tamb.wav", lokey: 54, hikey: 54 });
  });

  /** sfizz line 7, the other direction: a `<group>` *inside* the master still wins, which is the normal nesting. */
  it("still lets a group inside it override the master", () => {
    const regions = parseSfz("<master> key=54\n<group> key=50\n<region> sample=x.wav");
    expect(regions[0]).toMatchObject({ sample: "x.wav", lokey: 50, hikey: 50 });
  });

  /**
   * ⭐ **The library's own shape, as a criterion** — the defect was invisible in a one-master fixture, so the fixture has
   * two, a stale group, and an include-free copy of the percussion layout. The tambourine must answer 54 and **not** 50.
   */
  it("keeps a second percussion piece on its own pad when a group was left open before it", () => {
    const regions = parseSfz(
      [
        "<global>",
        "key=50",
        "<group>",
        "key=50",
        "<region> sample=htom_offcenter.wav",
        "<master>",
        "key=54",
        "ampeg_release=0.8",
        "<region> sample=tambourine.wav",
        "<master>",
        "key=56",
        "ampeg_release=0.6",
        "<region> sample=cowbell.wav",
      ].join("\n")
    );
    const keysOf = (sample: string) => regions.filter((r) => r.sample === sample).map((r) => `${r.lokey}-${r.hikey}`);
    expect(keysOf("tambourine.wav")).toEqual(["54-54"]);
    expect(keysOf("cowbell.wav")).toEqual(["56-56"]);
    // And the region that was already inside the group keeps the group's key: nothing above moved it.
    expect(keysOf("htom_offcenter.wav")).toEqual(["50-50"]);  });
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
  /**
   * ⭐ **A key opcode written as a note name, which is not a nicety: reading one as a number makes every region match every note.**
   *
   * `num()` falls back to `lokey`/`hikey` = 0–127 for a value it cannot read, and a file whose *every* region is 0–127 has no narrowest match, so `regionsForNote`
   * returns all of them and `roundRobinPick` answers with the **first region in the file** for the whole keyboard. Two libraries in this round are written that way —
   * the Discord GM `105-Sitar` (`pitch_keycenter=c2`, `lokey=c0`) and Sonatina's brass (`lokey=e3`) — so the instrument is not silent, it is confidently wrong.
   */
  it("reads SFZ note names as MIDI notes, with c4 = 60 as the octave convention", () => {
    // The convention is pinned by the library's own evidence: `horns-sus-mp-e2-PB-loop.wav` is declared `pitch_keycenter=40` in the same region that names it `e2`.
    expect(noteNumber("60")).toBe(60);
    expect(noteNumber("c4")).toBe(60);
    expect(noteNumber("e2")).toBe(40);
    expect(noteNumber("e1")).toBe(28);
    expect(noteNumber("c0")).toBe(12);
    expect(noteNumber("c7")).toBe(96);
    expect(noteNumber("c#4")).toBe(61);
    expect(noteNumber("db4")).toBe(61);
    expect(noteNumber("C4")).toBe(60);
    expect(noteNumber("c-1")).toBe(0);
    expect(noteNumber("not-a-note")).toBeUndefined();
    expect(noteNumber(undefined)).toBeUndefined();
  });

  it("places a named key range and key centre as numbers, so a named library answers with the right region", () => {
    // The shape of `105-Sitar.sfz`, whose first two regions are named, and whose last region reaches `hikey=c7`.
    const regions = parseSfz(`
<region> pitch_keycenter=c2 lokey=c0 hikey=c#2 sample=Str01.flac
<region> pitch_keycenter=d2 lokey=d2 hikey=d#2 sample=Str02.flac
<region> pitch_keycenter=g5 lokey=g5 hikey=c7 sample=Str26.flac
`);
    // `c0` is 12 and `c#2` is 37, so the first region owns the notes below the second region's `d2` = 38 — which is what makes the map contiguous rather than empty.
    expect(regions.map((region) => [region.lokey, region.hikey, region.pitchKeycenter])).toEqual([
      [12, 37, 36],
      [38, 39, 38],
      [79, 96, 79],
    ]);
    const playback = playbackForNote(regions, 38, { velocity: 100 });
    expect(playback?.sample).toBe("Str02.flac");
    expect(playback?.rootKey).toBe(38);
    // And a note between two named centres picks the region that covers it, instead of every region matching everything.
    expect(playbackForNote(regions, 80, { velocity: 100 })?.sample).toBe("Str26.flac");
  });

  /**
   * ⭐ **The four-`<master>` shape a real bass library is written in, and the velocity that used to fall through it.**
   *
   * `karoryfer.black-and-blue-basses` writes four `<master>` blocks in a row — `hivel=31`, `lovel=32 hivel=63`, `lovel=64 hivel=95`, and then `lovel=96` **with no `hivel`**, relying on the
   * default 127. Before the `<master>` layer was a scope of its own, that fourth block inherited `hivel=95`, its range was the empty `96–95`, and a note at the app's **default velocity of 100**
   * resolved to **no region at all**: silence rather than a wrong sample, which is the harder kind to notice. The assertions that bite are the range table's last row and `regionsForNote` at 100.
   */
  it("keeps the loudest layer of a four-master program reachable at the default velocity", () => {
    const regions = parseSfz(
      [
        "<global> tune=7",
        "<master> hivel=31",
        "<region> sample=p.wav key=40",
        "<master> lovel=32 hivel=63",
        "<region> sample=mp.wav key=40",
        "<master> lovel=64 hivel=95",
        "<region> sample=mf.wav key=40",
        "<master> lovel=96",
        "<region> sample=f.wav key=40",
      ].join("\n")
    );
    expect(regions.map((region) => [region.lovel, region.hivel])).toEqual([
      [0, 31],
      [32, 63],
      [64, 95],
      // The default `hivel` is 127, not the previous master's 95 — this is the row the empty range broke.
      [96, 127],
    ]);
    // Velocity 100 is the app's default, and it must find the loudest layer rather than nothing.
    expect(regionsForNote(regions, 40, 100).map((region) => region.sample)).toEqual(["f.wav"]);
    // A `<master>` does not clear the program's `<global>`: every region above still carries `tune=7`.
    for (const region of regions) expect(region.tuneCents).toBe(7);
  });
});
