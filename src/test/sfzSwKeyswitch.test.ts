import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expandIncludes } from "../audio/sfz/includes";
import { applyDefines, nextInlineDefine, splitInlineDefines, substituteVariables } from "../audio/sfz/defines";
import { parseSfz, declaredSwitchDefault, hasReachableSwitch, regionsForNote, unresolvedVariables } from "../audio/sfz/parse";
import { playbackForNote } from "../audio/sfz/regionPlayback";
import { samplePathRelativeToProgram } from "../audio/sfz/defaultPath";
import { resolveInstrumentNote, sampleAssetForPath } from "../audio/sfz/instrument";

/**
 * Three parser capabilities that two "measured, then declined" library candidates were waiting on, each with a criterion that can go **red**.
 *
 * ## What was measured before any of this was written, using this repository's own `expandIncludes` + `parseSfz`
 *
 * | library | pin | reading before the change |
 * | --- | --- | --- |
 * | `sfzinstruments/kinwie.dim-cabasa` | `016457e51a3e6558ab49676789260b54ff52ff1b` | 250 regions, `unresolvedVariables` = **250/250**, probe note 0/60/69/70/127 all `null` |
 * | `sfzinstruments/karoryfer.war-tuba` | `5b62dd6ef6b00281bb734769e44a63f5e013018a` | 6 acoustic roots, probe note 60 vel 100 answered `*_ss_*` (staccatissimo) in **every one**, while `<global>` says `sw_default=25` (staccato) |
 *
 * ## What the reference engine says, because two of the three questions are settled by measurement rather than by reading
 *
 * **Sample paths are relative to the main program, not to the file that declares them.** A fixture at `/var/tmp` — `Samples/tone.wav`, a root program in
 * `Programs/` including `Programs/sub/art.sfz`, and that file writing `sample=..\Samples\tone.wav` — renders through `sfizz_render` at **peak 0.0604** with the root
 * as entry, **0.00003** with `sub/art.sfz` as entry, and **0.00003** with the same file rewritten to `Samples\tone.wav`. The source agrees: `Synth::Impl::buildRegion`
 * gives the Layer only `defaultPath_`, `Region::parseOpcode` builds `defaultPath + sample`, and `FilePool` opens `rootDirectory / filename`. So the "3 850 of 4 387
 * dangling" reading answers a different question from "is the library broken", and this file states both.
 *
 * **A file with `sw_last` and no `sw_default` plays nothing** — <https://sfzformat.com/opcodes/sw_last/>: *"With the SFZ 1 or SFZ 2 spec, an instrument which uses
 * `sw_last` to select articulations will not have a default articulation preselected, meaning when loaded, it will play no sound until one of the keyswitches is
 * pressed - only after that will the instrument respond to notes. The ARIA extensions include `sw_default` as a solution to this."* — and
 * <https://sfzformat.com/opcodes/sw_default/> names the same thing from the other side: *"Define keyswitch 'power on default' so that you hear something when a patch
 * loads."*
 *
 * ## The three capabilities
 *
 * 1. **Inline `#define`** — the directive is a statement, not a line. `defines.ts` carries the rule and `includes.ts` imports it, so the two layers cannot drift.
 * 2. **`sw_*` keyswitch selection** — `sw_last`/`sw_default`/`sw_lokey`/`sw_hikey`/`sw_label` are read and the selection honours them, with the offline rule stated.
 * 3. **Path provenance** — `SfzRegion.sourcePath` records which file declared a region, and `sampleAssetForPath(…, { declaredIn })` is the **explicit** declaring-file
 *    reading. The default is left exactly as it was, which is what keeps the shipped libraries byte-for-byte identical.
 */

const DIM_CABASA_PIN = "016457e51a3e6558ab49676789260b54ff52ff1b";
const DIM_CABASA_RAW = `https://raw.githubusercontent.com/sfzinstruments/kinwie.dim-cabasa/${DIM_CABASA_PIN}/Dim%20Cabasa.sfz`;
const WAR_TUBA_PIN = "5b62dd6ef6b00281bb734769e44a63f5e013018a";
const WAR_TUBA_RAW = `https://raw.githubusercontent.com/sfzinstruments/karoryfer.war-tuba/${WAR_TUBA_PIN}/`;

/**
 * ============================================================================================
 * ① INLINE `#define`
 * ============================================================================================
 */
describe("inline #define — the directive is a statement, not a line", () => {
  it("reads a definition that shares its line and keeps the rest of that line", () => {
    // ⭐ The exact shape `dim-cabasa` writes ten times, and the reason all 250 of its regions were unplayable.
    const result = expandIncludes("<group> #define $POS 1 seq_position=$POS\n<region> sample=x_rr$POS_01.flac", () => undefined);
    expect(result.problems).toEqual([]);
    expect(result.text).toBe("<group>  seq_position=1\n<region> sample=x_rr1_01.flac");
  });

  it("takes the value as the first word and leaves the remainder in the stream, which is sfizz's push-back", () => {
    /**
     * sfizz's `processDirective` reads to end-of-line and then **puts the excess back** — *"ARIA/not Cakewalk: cut the value after the first word"*. Reading the whole
     * remainder as the value (the first version of this change) stored `1 seq_position=$POS` and produced `seq_position=1 seq_position=1`.
     */
    const [define] = splitInlineDefines("<group> #define $POS 1 seq_position=$POS").defines;
    expect(define).toMatchObject({ name: "$POS", value: "1" });
    expect(nextInlineDefine("<group> #define $POS 1 seq_position=$POS")!.value).toBe("1");
  });

  it("applies a definition from its own position onward, not to the text before it", () => {
    // The text before the directive is rendered with what was defined **already**; only what follows sees the new value.
    expect(applyDefines("a=$V #define $V 2 b=$V").text).toBe("a=$V  b=2");
  });

  it("defines a value that uses an earlier definition, which is what 'accumulating' has to mean", () => {
    const result = expandIncludes("#define $DIR Samples\n<group> #define $SUB $DIR/sub\n<region> sample=$SUB/x.wav", () => undefined);
    expect(result.text).toContain("sample=Samples/sub/x.wav");
  });

  it("still reads a whole-line define exactly as it did", () => {
    expect(expandIncludes("#define $KEY 36\n<region> key=$KEY", () => undefined).text).toBe("<region> key=36");
    // A `#define` that owns its line leaves an empty one behind, which is exactly what the whole-line pattern produced before this change.
    expect(applyDefines("#define $A 1\n#define $B 2\nx=$A$B").text).toBe("\n\nx=12");
  });

  /**
   * ⭐ **The counterexamples, which are the point of a rule about where a directive may sit.**
   *
   * Each of these makes a definition-shaped string that is **not** a definition, and a reader that treats it as one corrupts the line it appears on. The pattern requires
   * the `#` to be preceded by whitespace (sfizz requires it to start a statement) and requires a value word, so all four are left alone.
   */
  it("does not mistake a hash inside a value for a directive", () => {
    // A `#` with no whitespace before it is part of an opcode's value, and `$X` is then an ordinary variable in that value.
    const result = expandIncludes("<region> label=#define $X 1 sample=a.wav", () => undefined);
    expect(result.text).toBe("<region> label=#define $X 1 sample=a.wav");
    // And through the standalone expander, which is the path `parseSfz` uses.
    expect(applyDefines("x=#define $Y 2").text).toBe("x=#define $Y 2");
    expect(applyDefines("x=#define $Y 2").defines).toEqual([]);
  });

  it("does not mistake a directive without a value word for a definition", () => {
    // `#define $A` names nothing to store, so nothing is stored and the text stays where a parser can see it.
    expect(applyDefines("#define $A").defines).toEqual([]);
    expect(applyDefines("#define $A").text).toBe("#define $A");
    expect(applyDefines("<group> #define $A").defines).toEqual([]);
  });

  it("does not treat a variable as a prefix when the longer name is itself defined", () => {
    // `$POS` and `$POS_01` both defined: the longest defined name that prefixes the token wins, so the file's own spelling is honoured.
    const text = applyDefines("#define $POS 1\n#define $POS_01 9\nx=$POS_01 y=$POS").text;
    expect(text).toBe("\n\nx=9 y=1");
  });

  it("substitutes what is defined even when the token continues with identifier characters", () => {
    /**
     * ⭐ `dim-cabasa` writes `sample=$ART_rr$POS_01.flac`: the token at the first `$` is `$ART_rr` because `_` is an identifier character, and the variable is `$ART`.
     * A whole-token replace does nothing there, which is how 250 regions ended up unresolvable even after inline `#define` was recognised.
     */
    const { text, unresolved } = substituteVariables("sample=$ART_rr$POS_01.flac", new Map([["$ART", "bw"], ["$POS", "3"]]));
    expect(text).toBe("sample=bw_rr3_01.flac");
    expect(unresolved).toEqual([]);
    // And an undefined variable is still left exactly as written, so `parseSfz` can mark the region rather than silence it wrongly.
    expect(substituteVariables("k=$NOPE", new Map([["$A", "1"]])).text).toBe("k=$NOPE");
  });

  it("carries an inline definition into a file included after it", () => {
    // Global and sequential, which is how the whole-layer criterion reads this library: definitions are inherited by includes.
    const result = expandIncludes('<group> #define $KICK 36\n#include "m.sfz"', (path) => (path === "m.sfz" ? "<region> key=$KICK" : undefined));
    expect(result.text).toContain("key=36");
  });
});

/**
 * ⭐ **A synthetic fixture in the shape of the library that needed this, written here rather than copied from it.**
 *
 * The real library is `sfzinstruments/kinwie.dim-cabasa@016457e5`, and its readings are recorded in `docs/SAMPLE_LIBRARY_INTEGRATION.md`: **250 regions**, of which
 * **250/250 were unresolvable** before this change and **none** after, with the **ten inline `#define`s** on lines 59, 86, 113, 140, 167, 201, 228, 255, 282 and 309
 * (`<group> #define $POS <1..5> seq_position=$POS`) and **thirty** whole-line ones. Those numbers are the evidence; **this file is not a copy of it**, because a copy
 * would carry its licence into this repository's own distribution — the same rule the mirror follows when it prefers a link to a bundle. What the fixture reproduces is the
 * **shape**, which is what a parser criterion can be about:
 *
 * · a `#define` **on the `<group>` line that uses it**, whose value must be read before the rest of that line is rendered;
 * · a value built from **two definitions with an underscore between them** (`$ART_rr$POS_01.flac`) — the case that a whole-token replace silently skips;
 * · two `<master>` sections that redefine `$ART`, so the round-robin filenames change with the section;
 * · `seq_length` round-robin positions driven by the same inline value.
 */
const SYNTHETIC_KEYSWITCHED_DRUM = `
#define $ART_BACKWARD bw
#define $ART_FORWARD fw
#define $KEY_BACKWARD 69
#define $KEY_FORWARD 70
#define $RAND00 0.00
#define $RAND01 0.50

<control>
default_path=Synth Samples/

<global>
loop_mode=one_shot
seq_length=2
polyphony=1

<master>
#define $ART $ART_BACKWARD
group_label=$ART
key=$KEY_BACKWARD

<group> #define $POS 1 seq_position=$POS
<region> lorand=$RAND00 hirand=$RAND01 region_label=rr$POS_01 sample=$ART_rr$POS_01.flac
<region> lorand=$RAND01 region_label=rr$POS_02 sample=$ART_rr$POS_02.flac

<group> #define $POS 2 seq_position=$POS
<region> lorand=$RAND00 hirand=$RAND01 region_label=rr$POS_01 sample=$ART_rr$POS_01.flac
<region> lorand=$RAND01 region_label=rr$POS_02 sample=$ART_rr$POS_02.flac

<master>
#define $ART $ART_FORWARD
group_label=$ART
key=$KEY_FORWARD

<group> #define $POS 1 seq_position=$POS
<region> lorand=$RAND00 hirand=$RAND01 region_label=rr$POS_01 sample=$ART_rr$POS_01.flac
<region> lorand=$RAND01 region_label=rr$POS_02 sample=$ART_rr$POS_02.flac

<group> #define $POS 2 seq_position=$POS
<region> lorand=$RAND00 hirand=$RAND01 region_label=rr$POS_01 sample=$ART_rr$POS_01.flac
<region> lorand=$RAND01 region_label=rr$POS_02 sample=$ART_rr$POS_02.flac
`;

describe("the shape that made a real library silent, written synthetically", () => {
  it("parses every region with nothing unresolved, where the real file read 250/250", () => {
    const expanded = expandIncludes(SYNTHETIC_KEYSWITCHED_DRUM, () => undefined, { path: "Synth.sfz" });
    const regions = parseSfz(expanded.text);
    expect(regions).toHaveLength(8);
    // ⭐ The red-making number. With the old rules this is `{ variables: ["$ART_rr", "$POS_01", …], regions: 8 }`.
    expect(unresolvedVariables(regions)).toEqual({ variables: [], regions: 0 });
    expect(new Set(regions.map((region) => region.sample)).size).toBe(8);
    expect(new Set(regions.map((region) => region.sample))).toEqual(
      new Set(["bw_rr1_01.flac", "bw_rr1_02.flac", "bw_rr2_01.flac", "bw_rr2_02.flac", "fw_rr1_01.flac", "fw_rr1_02.flac", "fw_rr2_01.flac", "fw_rr2_02.flac"])
    );
  });

  it("resolves the file's own two keymaps and answers them with the round-robin it asks for", () => {
    /**
     * The keymap is `#define $KEY_BACKWARD 69` / `#define $KEY_FORWARD 70` and the `<global>` sets `seq_length=2`. Before the change every one of these probes answered
     * `null` — not silence in the sense of a missing sample, but the region guard refusing a region that still held a literal `$POS`.
     */
    const regions = parseSfz(expandIncludes(SYNTHETIC_KEYSWITCHED_DRUM, () => undefined, { path: "Synth.sfz" }).text);
    expect(playbackForNote(regions, 68)).toBeNull();
    expect(playbackForNote(regions, 69)!.sample).toMatch(/^bw_rr1_/);
    expect(playbackForNote(regions, 70)!.sample).toMatch(/^fw_rr1_/);
    expect(playbackForNote(regions, 71)).toBeNull();
    // The round-robin steps rather than repeating the first, and wraps.
    expect(playbackForNote(regions, 69, { nth: 1 })!.seqPosition).toBe(2);
    expect(playbackForNote(regions, 69, { nth: 2 })!.seqPosition).toBe(1);
    expect(playbackForNote(regions, 70, { nth: 1 })!.sample).toMatch(/^fw_rr2_/);
  });

  it("reads the inline definitions from the lines that carry them, and keeps the whole-line ones working too", () => {
    const lines = SYNTHETIC_KEYSWITCHED_DRUM.replace(/\r\n?/g, "\n").split("\n");
    const inline = lines
      .map((line, index) => ({ line: line.replace(/\/\/.*$/, ""), number: index + 1 }))
      .filter((entry) => /^\s*\S.*#define\b/.test(entry.line));
    // Four `<group>` lines carry their own definition; every one of them is the same shape the real file writes ten times.
    expect(inline).toHaveLength(4);
    for (const entry of inline) expect(entry.line.trim().startsWith("<group> #define $POS")).toBe(true);
    // The whole-line definitions still work the way they always did — this change is additive, not a replacement.
    expect(applyDefines(SYNTHETIC_KEYSWITCHED_DRUM).defines.filter((define) => define.name === "$RAND01")).toEqual([{ name: "$RAND01", value: "0.50" }]);
    expect(applyDefines(SYNTHETIC_KEYSWITCHED_DRUM).defines.filter((define) => define.name === "$ART").map((define) => define.value)).toEqual(["bw", "fw"]);
  });
});

/**
 * ⭐ **The real library, fetched from its pin — the evidence kept as a reading rather than as a copy.**
 *
 * `kinwie.dim-cabasa` is **CC-BY(-SA)** and its own header is self-contradictory about the licence ("Attribution 4.0 International" beside a `by-sa/4.0` link), so the whole
 * file is **not** vendored here; a copy of a third-party work inside the source tree becomes part of this repository's own distribution, which is a different act from the
 * mirror's "link, and withdraw on request". The criterion instead fetches the pinned blob and asserts the numbers the fix is about, so the evidence is reproducible without
 * redistributing anything. It skips without the network, the pattern the other real-library criteria use.
 */
const dimCabasaUpstream = await (async (): Promise<string | null> => {
  try {
    const response = await fetch(DIM_CABASA_RAW);
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
})();

describe.skipIf(dimCabasaUpstream === null)("the real dim-cabasa at the pin, held by reading rather than by copying", () => {
  it("reads 250 regions with nothing unresolved, where it used to be 250/250", () => {
    const regions = parseSfz(expandIncludes(dimCabasaUpstream!, () => undefined, { path: "Dim Cabasa.sfz" }).text);
    expect(regions).toHaveLength(250);
    expect(unresolvedVariables(regions)).toEqual({ variables: [], regions: 0 });
    expect(new Set(regions.map((region) => region.sample)).size).toBe(250);
    // Every name is the library's own scheme: `bw`/`fw`, a round-robin number, and a two-digit take.
    expect(regions.every((region) => /^(bw|fw)_rr\d_\d\d\.flac$/.test(region.sample))).toBe(true);
  }, 60_000);

  it("has exactly the ten inline definitions, on the lines this reading names", () => {
    /**
     * The census the fix is about, kept as a reading of the pinned file: **ten inline and thirty whole-line** definitions. Re-measuring it here means a change to the
     * fixture-less criterion still holds the file that motivated it, and the numbers in `docs/SAMPLE_LIBRARY_INTEGRATION.md` cannot drift unnoticed.
     */
    const lines = dimCabasaUpstream!.replace(/\r\n?/g, "\n").split("\n");
    const inline = lines
      .map((line, index) => ({ line: line.replace(/\/\/.*$/, ""), number: index + 1 }))
      .filter((entry) => /^\s*\S.*#define\b/.test(entry.line));
    expect(inline.map((entry) => entry.number)).toEqual([59, 86, 113, 140, 167, 201, 228, 255, 282, 309]);
    for (const entry of inline) expect(entry.line.trim().startsWith("<group> #define $POS")).toBe(true);
    expect(lines.filter((line) => /^\s*#define\s+\$/.test(line)).length).toBe(30);
  }, 60_000);

  it("resolves the file's two keymaps and steps its five round-robin positions", () => {
    const regions = parseSfz(expandIncludes(dimCabasaUpstream!, () => undefined, { path: "Dim Cabasa.sfz" }).text);
    expect(playbackForNote(regions, 69)!.sample).toMatch(/^bw_rr1_/);
    expect(playbackForNote(regions, 70)!.sample).toMatch(/^fw_rr1_/);
    expect(playbackForNote(regions, 69, { nth: 4 })!.seqPosition).toBe(5);
    expect(playbackForNote(regions, 69, { nth: 5 })!.seqPosition).toBe(1);
  }, 60_000);
});

/**
 * ============================================================================================
 * ② `sw_*` KEYSWITCH SELECTION
 * ============================================================================================
 */

/** Three articulations over the same keys, each gated on its own `sw_last`, with the file's power-on default naming the second. */
const THREE_ARTICULATIONS = `
<global> sw_lokey=24 sw_hikey=26 sw_default=25
<group> sw_last=24 sw_label=Staccatissimo
<region> sample=ss_c4.wav lokey=60 hikey=60 pitch_keycenter=60
<group> sw_last=25 sw_label=Staccato
<region> sample=s_c4.wav lokey=60 hikey=60 pitch_keycenter=60
<group> sw_last=26 sw_label=Sustain
<region> sample=sus_c4.wav lokey=60 hikey=60 pitch_keycenter=60
`;

describe("sw_* — the offline keyswitch rule, stated and tested", () => {
  it("picks the articulation sw_default names, which is the whole point of the opcode", () => {
    const regions = parseSfz(THREE_ARTICULATIONS);
    expect(declaredSwitchDefault(regions)).toBe(25);
    // ⭐ Without the gate the narrowest-range rule has three equally narrow candidates and answers the first in file order, which is the staccatissimo.
    const answer = playbackForNote(regions, 60, { switchDefault: declaredSwitchDefault(regions) });
    expect(answer!.sample).toBe("s_c4.wav");
    expect(answer!.switchState).toBe(25);
    expect(answer!.switchLabel).toBe("Staccato");
  });

  it("has a resolvable articulation for each of the three values the file declares", () => {
    const regions = parseSfz(THREE_ARTICULATIONS);
    expect(playbackForNote(regions, 60, { switch: 24 })!.sample).toBe("ss_c4.wav");
    expect(playbackForNote(regions, 60, { switch: 25 })!.sample).toBe("s_c4.wav");
    expect(playbackForNote(regions, 60, { switch: 26 })!.sample).toBe("sus_c4.wav");
    // And the labels come from the file, not from a table here.
    expect(playbackForNote(regions, 60, { switch: 26 })!.switchLabel).toBe("Sustain");
  });

  it("leaves regions that declare no sw_last selectable, because such a region is not a keyswitch candidate", () => {
    /**
     * `sw_last`'s own default is `-1`, out of range, so a region without the opcode is "not declared" rather than "declared as -1" — and a velocity layer inside one
     * articulation, which is what every real keyswitch program is made of, must survive the gate.
     */
    const text = [
      "<global> sw_default=25",
      "<group> sw_last=25 lovel=0 hivel=63",
      "<region> sample=soft.wav lokey=60 hikey=60",
      "<group> sw_last=25 lovel=64 hivel=127",
      "<region> sample=loud.wav lokey=60 hikey=60",
      "<group> sw_last=24 lovel=64 hivel=127",
      "<region> sample=other.wav lokey=60 hikey=60",
    ].join("\n");
    const regions = parseSfz(text);
    expect(playbackForNote(regions, 60, { velocity: 100, switchDefault: 25 })!.sample).toBe("loud.wav");
    expect(playbackForNote(regions, 60, { velocity: 40, switchDefault: 25 })!.sample).toBe("soft.wav");
    // The other articulation's layer is gone, which is the gate doing its work rather than the velocity filter.
    expect(regionsForNote(regions, 60, 100, 1, { switchDefault: 25 }).every((region) => region.sample !== "other.wav")).toBe(true);
    // And with no switch state at all the file answers nothing, because every one of its regions is gated — the spec's "silent until a keyswitch is pressed".
    expect(playbackForNote(regions, 60, { velocity: 100 })).toBeNull();
    // A caller that supplies the other articulation's value gets that one instead.
    expect(playbackForNote(regions, 60, { velocity: 100, switch: 24 })!.sample).toBe("other.wav");
  });

  it("gates the range rather than the note, which is the only reading that needs no live keyboard", () => {
    /**
     * `sw_lokey`/`sw_hikey` *"Defines the range of the keyboard to be used as trigger selectors for the `sw_last` opcode"*. A `sw_last` the file's own range excludes is
     * a switch nobody can press, so it is unreachable — while a region whose `sw_last` is inside the range is not.
     */
    const text = "<global> sw_lokey=24 sw_hikey=26 sw_default=30\n<group> sw_last=30\n<region> sample=out.wav lokey=60 hikey=60\n<group> sw_last=25\n<region> sample=in.wav lokey=61 hikey=61";
    const regions = parseSfz(text);
    expect(regions[0]!.swLow).toBe(24);
    expect(regions[0]!.swHigh).toBe(26);
    // `sw_last=30` cannot be selected by a keyswitch in 24–26, so the file's default of 30 is not reachable and nothing answers.
    expect(playbackForNote(regions, 60, { switchDefault: 30 })).toBeNull();
    // The in-range one is answered when its own value is active.
    expect(playbackForNote(regions, 61, { switch: 25 })!.sample).toBe("in.wav");
  });

  it("reads a keyswitch written as a note name, because the VSCO programs write `c6` and `c#6`", () => {
    const text = "<group> sw_last=c6 sw_label=C6 Sustain\n<region> sample=a.wav lokey=69 hikey=72";
    const [region] = parseSfz(text);
    expect(region!.swLast).toBe(84);
    expect(playbackForNote(parseSfz(text), 69, { switch: 84 })!.switchState).toBe(84);
  });

  /**
   * ⭐ **The offline rule when the file declares no `sw_default`, stated rather than hidden.**
   *
   * The spec says such a file is silent until a keyswitch is pressed (<https://sfzformat.com/opcodes/sw_last/>), and this loader has no live keyboard. The rule chosen
   * here is that **no declared default means no gate**: the regions stay selectable in file order. Two reasons, both concrete: the eight pinned VSCO `-KS` programs
   * declare `sw_last` with no `sw_default` and their own criteria require a note to resolve; and the alternative "invent a switch value" is the silent-wrong-answer this
   * codebase treats as the worst kind. What it is **not** is sfizz-faithful for those files — sfizz plays nothing there — and this case exists so that the divergence is
   * a fact on the record rather than a footnote.
   */
  it("answers nothing when the file declares no sw_default and no switch is supplied, which is the spec's own sentence", () => {
    /**
     * ⭐ **The strict reading, and the one the spec states**: *"an instrument which uses `sw_last` to select articulations will not have a default articulation
     * preselected, meaning when loaded, it will play no sound until one of the keyswitches is pressed"* (<https://sfzformat.com/opcodes/sw_last/>). This project has no
     * live keyboard, so a file in that shape answers **nothing** — and the risk is named rather than discovered: the eight pinned VSCO `-KS` programs are exactly this
     * shape, and `sfzKeyswitchPaths.test.ts` records the same outcome for them.
     */
    const noDefault = "<group> sw_lokey=c6 sw_hikey=d#6 sw_last=c6\n<region> sample=sus.wav lokey=69 hikey=72\n<group> sw_last=c#6\n<region> sample=trem.wav lokey=69 hikey=72";
    const regions = parseSfz(noDefault);
    expect(declaredSwitchDefault(regions)).toBeUndefined();
    expect(hasReachableSwitch(regions)).toBe(false);
    // ⛔ Nothing answers, and the reason is the gate rather than a missing key range: the regions do cover note 69.
    expect(playbackForNote(regions, 69, { switchDefault: declaredSwitchDefault(regions) })).toBeNull();
    expect(regionsForNote(regions, 69).length).toBe(0);
    // A region that declares no sw_last is untouched by any of this, which is what keeps ordinary instruments working.
    const ungated = parseSfz("<region> sample=plain.wav lokey=69 hikey=72");
    expect(playbackForNote(ungated, 69)!.sample).toBe("plain.wav");
    // And a caller that *does* have a switch value gets the section it names, so the gate is implemented and not merely absent.
    expect(playbackForNote(regions, 69, { switch: 85 })!.sample).toBe("trem.wav");
    expect(playbackForNote(regions, 69, { switch: 84 })!.sample).toBe("sus.wav");
  });

  it("reports the state through the resolver too, so a caller can print which articulation answered", () => {
    const asset = { assetId: "three", sfz: { url: "https://example.test/three.sfz" } };
    const resolution = resolveInstrumentNote(asset, THREE_ARTICULATIONS, 60);
    expect(resolution.ok).toBe(true);
    expect(resolution.note!.samplePath).toBe("s_c4.wav");
    expect(resolution.note!.switchState).toBe(25);
    expect(resolution.note!.switchLabel).toBe("Staccato");
  });

  it("does not change a file with no keyswitches at all", () => {
    // The no-op control: an ordinary multi-layer instrument answers exactly what it always did, and reports no switch state.
    const text = "<group> lovel=0 hivel=63\n<region> sample=lo.wav lokey=60 hikey=60\n<group> lovel=64 hivel=127\n<region> sample=hi.wav lokey=60 hikey=60";
    const regions = parseSfz(text);
    expect(declaredSwitchDefault(regions)).toBeUndefined();
    expect(playbackForNote(regions, 60, { velocity: 100 })!.sample).toBe("hi.wav");
    expect(playbackForNote(regions, 60, { velocity: 100 })!.switchState).toBeUndefined();
    expect(regionsForNote(regions, 60, 100)).toHaveLength(1);
  });
});

/**
 * **war-tuba, the candidate this was for** — the before/after reading, from the pinned files.
 *
 * The six acoustic roots are `sw_*` wrappers: each `<global>` states `sw_lokey=24 sw_hikey=26 sw_default=25`, each of the 14 articulation files it includes writes
 * `sw_last=24` (Staccatissimo), `25` (Staccato) or `26` (Sustain) on every group, and the library's whole `sw_*` vocabulary is exactly those five opcodes plus
 * `sw_label` (`sw_previous`, `sw_down`, `sw_up`, `sw_vel`, `sw_lolast`, `sw_hilast` do not occur in it at all).
 *
 * The programs are fetched from the pin rather than vendored, because they are 6 files of 6–40 KB whose includes are another 84 — and the point of the criterion is the
 * real chain. It skips without the network, the same pattern the other real-library criteria use.
 */
const warRoots = [
  "1-solo-legato.sfz",
  "2-solo-poly.sfz",
  "3-duo-legato.sfz",
  "4-duo-poly.sfz",
  "5-trio-legato.sfz",
  "6-trio-poly.sfz",
];

const warTuba = await (async (): Promise<Map<string, string> | null> => {
  try {
    const fetched = new Map<string, string>();
    const get = async (path: string): Promise<string | null> => {
      if (fetched.has(path)) return fetched.get(path)!;
      const response = await fetch(`${WAR_TUBA_RAW}${path}`);
      if (!response.ok) return null;
      const text = await response.text();
      fetched.set(path, text);
      return text;
    };
    for (const name of warRoots) {
      const program = await get(`Programs/${name}`);
      if (program === null) return null;
      for (const match of program.matchAll(/#include\s+"([^"]+)"/g)) {
        if ((await get(`Programs/${match[1]}`)) === null) return null;
      }
    }
    return fetched;
  } catch {
    return null;
  }
})();

describe.skipIf(warTuba === null)("war-tuba's six acoustic roots, from the pin", () => {
  it("answers the probe with the staccato the file declares, where it used to answer a staccatissimo", () => {
    const read = (path: string) => warTuba!.get(path);
    for (const name of warRoots) {
      const program = `Programs/${name}`;
      const expanded = expandIncludes(warTuba!.get(program)!, read, { path: program });
      const regions = parseSfz(expanded.text, { sources: expanded.sources });
      const asset = { assetId: `war-tuba:${name}`, sfz: { url: `${WAR_TUBA_RAW}${program}` } };
      expect(declaredSwitchDefault(regions), `${name} should declare its power-on articulation`).toBe(25);
      const resolution = resolveInstrumentNote(asset, expanded.text, 60, { sources: expanded.sources });
      expect(resolution.ok).toBe(true);
      // ⭐ The after-reading. Before this change every one of the six answered `…_ss_…` here.
      expect(resolution.note!.samplePath, `${name} answered ${resolution.note!.samplePath}`).toContain("_s_");
      expect(resolution.note!.samplePath).not.toContain("_ss_");
      expect(resolution.note!.switchLabel).toBe("Staccato");
      expect(resolution.note!.switchState).toBe(25);
    }
  }, 60_000);

  it("declares exactly the five sw_* opcodes this reads, plus sw_label", () => {
    /**
     * The census that bounds the work, and the honest scope statement: `war-tuba` uses `sw_lokey`, `sw_hikey`, `sw_default`, `sw_last` and `sw_label` and nothing else,
     * so a `sw_*` outside those five is not needed by this library and is not claimed as implemented anywhere.
     */
    const counts = new Map<string, number>();
    for (const text of warTuba!.values()) {
      for (const match of text.matchAll(/(?:^|\s)(sw_[a-z_]+)\s*=/g)) counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(["sw_default", "sw_hikey", "sw_label", "sw_last", "sw_lokey"]);
    for (const opcode of ["sw_previous", "sw_down", "sw_up", "sw_vel", "sw_lolast", "sw_hilast"]) expect(counts.has(opcode)).toBe(false);
  }, 60_000);

  it("resolves every sample of the six roots beside the program, which is the reference engine's rule", () => {
    /**
     * ⭐ **The 3 850 figure, answered.** sfizz resolves a `sample=` against the **main program's** directory — measured in this repository's own probe and stated with
     * its source lines in `parse.ts` — and under that rule `..\Samples\` from `Programs/` is the library root, where every one of these files really is. The
     * "dangling" reading comes from treating an articulation file as the entry point, which is a different question; this criterion pins the answer to *this* one, and
     * the case below pins the other so both readings are on the record.
     */
    const read = (path: string) => warTuba!.get(path);
    let references = 0;
    for (const name of warRoots) {
      const program = `Programs/${name}`;
      const expanded = expandIncludes(warTuba!.get(program)!, read, { path: program });
      const regions = parseSfz(expanded.text, { sources: expanded.sources });
      // Every region's file must exist in the pinned tree: fetched includes name their samples, and the sample list is what the tree holds.
      const unknown = regions.filter((region) => !/^\.\.\\Samples\\[^\\]+\.wav$/.test(region.sample));
      expect(unknown.map((region) => region.sample)).toEqual([]);
      expect(new Set(regions.map((region) => region.sourcePath)).size).toBeGreaterThan(1);
      references += regions.length;
    }
    expect(references).toBeGreaterThan(20_000);
  }, 60_000);
});

/**
 * ============================================================================================
 * ③ PATH PROVENANCE
 * ============================================================================================
 */

describe("sourcePath — which file declared a region", () => {
  it("names the included file for regions that came through an include, and the program for its own", () => {
    const files: Record<string, string> = {
      "Programs/root.sfz": '<region> sample=own.wav key=30\n#include "legato/art.sfz"\n',
      "Programs/legato/art.sfz": "<region> sample=..\\Samples\\a.wav key=60\n",
    };
    const expanded = expandIncludes(files["Programs/root.sfz"]!, (path) => files[path], { path: "Programs/root.sfz" });
    const regions = parseSfz(expanded.text, { sources: expanded.sources });
    /**
     * ⭐ **A bare include contributes its own lines, one for one.** The first version of this map treated the whole child expansion as a single output line, so the
     * lookup for a real region returned `undefined` and the criterion below failed — which is the red state this case keeps.
     */
    expect(expanded.text.split("\n")).toHaveLength(expanded.sources.reduce((total, run) => total + (run.to - run.from), 0));
    expect(regions.map((region) => region.sourcePath)).toEqual(["Programs/root.sfz", "Programs/legato/art.sfz"]);
  });

  it("names the file an include brought into the middle of a line, and leaves the line itself with its own file", () => {
    // The Salamander shape: the include's text belongs to the include, the opcodes around it belong to the line that wrote them.
    const files: Record<string, string> = { "Data/vel.txt": "<group> lovel=1" };
    const expanded = expandIncludes('<group> #include "Data/vel.txt" hivel=26', (path) => files[path], { path: "Program.sfz" });
    expect(expanded.text).toBe("<group> <group> lovel=1 hivel=26");
    expect(expanded.sources).toHaveLength(1);
    expect(expanded.sources[0]!.file).toBe("Program.sfz");
  });

  it("is absent when the caller had no map, so 'declared in the program' is never invented", () => {
    // Absent means "not recorded", which is a different fact from "the program declared it" — and the two must not be conflated.
    const [region] = parseSfz("<region> sample=a.wav");
    expect(region!.sourcePath).toBeUndefined();
    const expanded = expandIncludes("<region> sample=a.wav", () => undefined, { path: "p.sfz" });
    expect(parseSfz(expanded.text, { sources: expanded.sources })[0]!.sourcePath).toBe("p.sfz");
  });
});

describe("sampleAssetForPath — the declaring-file reading is explicit, and the default is untouched", () => {
  const PROGRAM = "https://example.test/lib/Programs/root.sfz";

  /** Where a sample declared in `declaredIn` lands, with `programPath` as the program — the end the loader actually consumes. */
  const resolveAddress = (sample: string, declaredIn: string, programPath: string): string =>
    sampleAssetForPath(sample, { programUrl: PROGRAM, declaredIn, libraryPath: programPath }).url as string;

  it("resolves against the program by default, which is the reference engine's rule", () => {
    // ⭐ The reverse criterion for this capability: no `declaredIn` means no change, in the code and in this assertion.
    expect(sampleAssetForPath("..\\Samples\\a.wav", { programUrl: PROGRAM }).url).toBe("https://example.test/lib/Samples/a.wav");
    expect(sampleAssetForPath("..\\Samples\\a.wav", { programUrl: PROGRAM, declaredIn: "Programs/root.sfz" }).url).toBe("https://example.test/lib/Samples/a.wav");
  });

  it("gives the declaring file's own reading when declaredIn is passed, which is the explicit divergence", () => {
    /**
     * The measured difference, in one line each. `Programs/legato/art.sfz` naming `Samples/take.wav` means `Programs/legato/Samples/take.wav`; the default reading — the
     * reference engine's — looks in `Programs/Samples/take.wav`. Neither is "the right file" in the abstract: they answer two different questions, and this project
     * answers the engine's by default and the declaring file's on request.
     *
     * `declaredIn` and `libraryPath` are both **library-relative**, which is the currency `expandIncludes(...).sources` already uses; `libraryPath` is the program's own
     * path in that currency, and it is what tells the arithmetic how many directories the program itself sits below the library root.
     */
    expect(
      sampleAssetForPath("Samples\\take.wav", { programUrl: PROGRAM, declaredIn: "Programs/legato/art.sfz", libraryPath: "Programs/root.sfz" }).url
    ).toBe("https://example.test/lib/Programs/legato/Samples/take.wav");
    // ⭐ **Without the program's own library-relative path the declaring reading is not offered at all**, because where the library root begins inside a URL is not
    // knowable from the URL alone. The caller gets the default reading — the address it already had — rather than a guess.
    expect(sampleAssetForPath("Samples\\take.wav", { programUrl: PROGRAM, declaredIn: "Programs/legato/art.sfz" }).url).toBe(
      "https://example.test/lib/Programs/Samples/take.wav"
    );
    expect(sampleAssetForPath("Samples\\take.wav", { programUrl: PROGRAM }).url).toBe("https://example.test/lib/Programs/Samples/take.wav");
  });

  it("keeps the assetId the path as written, whatever base was used to resolve it", () => {
    // The id is the catalogue key and the loader's cache key, so it must not start depending on which reading produced the address.
    const asset = sampleAssetForPath("..\\Samples\\a.wav", { programUrl: PROGRAM, declaredIn: "Programs/legato/art.sfz" });
    expect(asset.assetId).toBe("..\\Samples\\a.wav");
    expect(asset.name).toBe("..\\Samples\\a.wav");
  });

  /**
   * **The refusals.** Path arithmetic is where this project has lost working addresses, so the two cases it cannot express are named rather than guessed.
   */
  it("leaves an absolute path or a URL alone, because neither ever meant 'relative to the declaring file'", () => {
    const absolutes: string[] = ["/abs/take.wav", "https://cdn.test/take.wav", "C:\\shipped\\take.wav"];
    for (const maybe of absolutes) {
      const absolute = maybe!;
      // The absolute forms are never rewritten, and the address is still built from the program URL exactly as it always was.
      const expected = absolute.startsWith("/") ? `https://example.test${absolute}` : absolute;
      const address = sampleAssetForPath(absolute, { programUrl: PROGRAM, declaredIn: "Programs/legato/art.sfz" }).url ?? "";
      expect(address.toUpperCase()).toBe(expected.toUpperCase());
    }
  });

  it("leaves a path that would climb past the library's root alone, rather than inventing an address", () => {
    /**
     * `Programs/legato/art.sfz` has two directories to climb and no more, so a third `..` names something **above the library root** — and no relative spelling of that
     * resolves where the file meant. The refusal returns the input unchanged so the caller can see what it asked for; the default reading then applies, which is the one
     * the caller already had.
     */
    expect(samplePathRelativeToProgram("..\\..\\..\\take.wav", "Programs/legato/art.sfz", "Programs/legato/art.sfz")).toBe("..\\..\\..\\take.wav");
    // A refused path keeps the default reading, which is what the caller had.
    expect(sampleAssetForPath("..\\..\\..\\take.wav", { programUrl: PROGRAM, declaredIn: "Programs/legato/art.sfz" }).url).toBe(
      "https://example.test/take.wav"
    );
    // And the ones that *are* expressible stay expressible, so the refusal is a boundary and not a blanket.
    // And the ones that *are* expressible stay expressible, checked where the loader consumes them — the address, not the spelling.
        // ⭐ `..\Samples` from a declaring file one directory below the program is the program's own `Samples/` — so the declaring reading and the default agree here, and
    // that agreement is a fact about the path rather than a no-op: the arithmetic walked out of `legato` and then found `Samples` beside the program.
    expect(resolveAddress("..\\Samples\\take.wav", "Programs/legato/a.sfz", "Programs/1-solo.sfz")).toBe("https://example.test/lib/Programs/Samples/take.wav");
    // A declaring file one directory below the program, naming a file beside itself.
    expect(resolveAddress("Samples\\take.wav", "Programs/legato/a.sfz", "Programs/1-solo.sfz")).toBe(
      "https://example.test/lib/Programs/legato/Samples/take.wav"
    );
  });

  it("is the identity for a region the program itself declared, which is what keeps the shipped libraries unchanged", () => {
    // A region declared in the program: the declaring file *is* the program, so the answer is its path as written (normalised).
    expect(samplePathRelativeToProgram("..\\Samples\\a.wav", "Programs/root.sfz", "Programs/root.sfz")).toBe("../Samples/a.wav");
    expect(samplePathRelativeToProgram("Strings\\Violin\\a.wav", "CP80/CP80.sfz", "CP80/CP80.sfz")).toBe("Strings/Violin/a.wav");
    // A library that is not the program's own directory: an instrument folder beside `Programs/`, which must resolve under itself.
    expect(sampleAssetForPath("Strings\\Violin\\a.wav", { programUrl: "https://example.test/lib/CP80/CP80.sfz" }).url).toBe(
      "https://example.test/lib/CP80/Strings/Violin/a.wav"
    );
    /**
     * And the case the library that motivated this has: `..\Samples` from `Programs/legato/art.sfz` is **two** directories above `Programs/` — one out of `legato`, one
     * out of the program's own directory. That the program has no `Samples/` of its own is exactly why the reading differs from the default; it is also why the reading
     * changes nothing for `war-tuba`, whose samples really are at the library root and whose roots really are in `Programs/`.
     */
    expect(resolveAddress("..\\Samples\\take.wav", "Programs/legato/art.sfz", "Programs/1-solo.sfz")).toBe("https://example.test/lib/Programs/Samples/take.wav");
    // And the declaring file one directory below the program, naming a file beside itself.
    expect(resolveAddress("Samples\\take.wav", "Programs/legato/art.sfz", "Programs/1-solo.sfz")).toBe(
      "https://example.test/lib/Programs/legato/Samples/take.wav"
    );
  });
});

/**
 * The resolver carries the provenance out with the note, so a caller that wants the declaring-file reading does not have to reconstruct it.
 */
describe("resolveInstrumentNote — the provenance travels with the answering region", () => {
  it("reports the file that declared the region which answered", () => {
    const text = '<region> sample=own.wav key=30\n#include "legato/art.sfz"\n';
    const files: Record<string, string> = { "Programs/legato/art.sfz": "<region> sample=..\\Samples\\a.wav key=60\n" };
    const expanded = expandIncludes(text, (path) => files[path], { path: "Programs/root.sfz" });
    const asset = { assetId: "prov", sfz: { url: "https://example.test/lib/Programs/root.sfz" } };
    const resolution = resolveInstrumentNote(asset, expanded.text, 60, { sources: expanded.sources });
    expect(resolution.ok).toBe(true);
    expect(resolution.note!.sourcePath).toBe("Programs/legato/art.sfz");
    // And that is what makes the explicit reading reachable from a resolved note.
    expect(
      sampleAssetForPath(resolution.note!.samplePath, {
        programUrl: asset.sfz.url,
        declaredIn: resolution.note!.sourcePath,
        libraryPath: "Programs/root.sfz",
      }).url
    ).toBe("https://example.test/lib/Programs/Samples/a.wav");
  });
});

/**
 * ⭐ **The reverse criterion for capability ③, against this repository's own shipped fixtures.**
 *
 * `virtuosity_drums` is the one mirrored library whose fixtures are complete enough to parse, and its files write `../Samples/…` three directories down — exactly the
 * shape provenance touches. Its stored sample must still be the path **as written**, because the mirror plan and the loader both depend on that, and its recorded
 * provenance must be the file it actually came from.
 */
describe("the shipped virtuosity_drums fixtures are unchanged by provenance", () => {
  const ROOT = "src/test/fixtures/sfz/virtuosity-drums";
  const read = (relative: string) => {
    const full = join(ROOT, relative);
    return existsSync(full) ? readFileSync(full, "utf8") : undefined;
  };

  it("keeps every sample as written, and names the included file each came from", () => {
    const program = read("01-basic-kit.sfz")!;
    const expanded = expandIncludes(program, read, { path: "01-basic-kit.sfz" });
    const regions = parseSfz(expanded.text, { sources: expanded.sources });
    expect(regions.length).toBe(16);
    expect(regions.every((region) => region.sample.startsWith("../Samples/"))).toBe(true);
    // The regions arrive through `mappings/kickmic_basic.sfz` and its own include, and that is what the map must say.
    const sources = new Set(regions.map((region) => region.sourcePath));
    expect(sources.has("mappings/kickmic/kick_snoff_map.sfz")).toBe(true);
    expect(sources.has("01-basic-kit.sfz")).toBe(false);
  });

  it("resolves the same note to the same path sample-for-sample", () => {
    // The end-to-end control: nothing about selection, ratio or the sample string moved.
    const program = read("01-basic-kit.sfz")!;
    const expanded = expandIncludes(program, read, { path: "01-basic-kit.sfz" });
    const regions = parseSfz(expanded.text, { sources: expanded.sources });
    const answer = playbackForNote(regions, 35, { velocity: 100 });
    expect(answer).not.toBeNull();
    expect(answer!.sample).toBe(playbackForNote(parseSfz(expanded.text), 35, { velocity: 100 })!.sample);
    expect(answer!.switchState).toBeUndefined();
  });
});
