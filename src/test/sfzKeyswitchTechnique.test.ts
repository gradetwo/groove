import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { declaredSwitchDefault, parseSfz, regionsForNote } from "../audio/sfz/parse";
import { techniqueSwitchFor } from "../audio/sfz/keyswitch";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import type { StringTechnique } from "../data/stringTechniques";

/**
 * ⭐ **Choosing an articulation by the name the file gives it — the half of "restore audibility" that needs no keyboard.**
 *
 * ## The measurement this is built on
 *
 * The pinned library's eight `-KS` programs (`schollz/VSCO-2-CE@6dd651d55dde97fd4028699be9d4481f26917891`) fold several
 * articulations into one file, each behind a `sw_last`. Counted by parsing the pinned bytes with this repository's own
 * `parseSfz` (the reading is reproduced by the criterion at the bottom of this file):
 *
 * | program | regions | `sw_last` groups | reachable today | in a `<group>` with no `sw_default` |
 * | --- | --- | --- | --- | --- |
 * | `CelloEns-KS.sfz` | 156 | 6 | 1 | 0 |
 * | `Clarinet-KS.sfz` | 97 | 3 | 1 | 2 |
 * | `Contrabass-KS.sfz` | 152 | 7 | 1 | 0 |
 * | `Flute-KS.sfz` | 94 | 5 | 1 | 4 |
 * | `SViolin-KS.sfz` | 161 | 6 | 1 | 0 |
 * | `Tuba-KS.sfz` | 87 | 5 | 1 | 0 |
 * | `ViolaEns-KS.sfz` | 144 | 6 | 1 | 0 |
 * | `ViolinEns-KS.sfz` | 131 | 6 | 1 | 5 |
 * | **total** | **1022** | **44** | **8** | **11** |
 *
 * So **36 of 44 articulations are out of reach of every note**, and the reason is not that the files are broken: it is that
 * nothing could *ask* for one. The files already name them — `sw_label=C6 Sustain Vibrato`, `sw_label=D6 Spiccato` — and
 * `techniqueSwitchFor` turns such a name into the `sw_last` value that selects it.
 *
 * ## The bug that had to go first
 *
 * `scanOpcodes` ended every value at the first whitespace, so `sw_label=C6 Sustain Vibrato` arrived as `C6` — a note name,
 * not an articulation. No name-matching scheme could work on that. The first criterion below is therefore about the reader,
 * and it is stated against the reference engine's own rule (`src/sfizz/parser/Parser.cpp` reads to end of line and cuts
 * only before a token shaped like `name=`).
 *
 * ## What is deliberately not here
 *
 * There is no criterion that a *guessed* articulation plays when the file names none. A request that matches no `sw_label`
 * is refused, with the labels the file does declare, because "pick one and hope" is the silent-wrong-answer this codebase
 * treats as the worst kind — and the fifth criterion holds that.
 */

const FIXTURES = join(__dirname, "fixtures", "sfz", "vsco2ce");
const CELLO_KS = readFileSync(join(FIXTURES, "CelloEns-KS.sfz"), "utf8");

/** The vendored excerpt is the pinned upstream program verbatim; the URL is what the last criterion reads the same file from. */
const VSCO_PIN = "6dd651d55dde97fd4028699be9d4481f26917891";
const VIOLIN_KS_RAW = `https://raw.githubusercontent.com/schollz/VSCO-2-CE/${VSCO_PIN}/ViolinEns-KS.sfz`;

const cello = { assetId: "vsco2ce:CelloEns-KS", sfz: { url: "https://example.test/CelloEns-KS.sfz" } };

describe("sw_label — a string value that contains spaces, read the reference engine's way", () => {
  it("reads the whole name instead of the first word", () => {
    // ⭐ The exact shape the pinned `-KS` programs write, and the reading that made them unreadable.
    const [group] = parseSfz("<group> sw_label=C6 Sustain Vibrato\n<region> sample=sus.wav lokey=60 hikey=60");
    expect(group!.opcodes.sw_label).toBe("C6 Sustain Vibrato");
  });

  it("still cuts at the next opcode on the same line, which is the other half of the rule", () => {
    // sfizz's `labels_sw.sfz` writes exactly this: a label, then more opcodes.
    const [region] = parseSfz("<region> sw_last=36 sw_label=Sine lokey=41 sample=*sine");
    expect(region!.opcodes.sw_label).toBe("Sine");
    expect(region!.lokey).toBe(41);
    expect(region!.sample).toBe("*sine");
  });

  it("does not change an ordinary opcode's value, which still ends at whitespace", () => {
    // The control: widening the rule to every opcode would move `lokey`/`hikey` readings, and this says it did not happen.
    const [region] = parseSfz("<region> sample=a.wav lokey=60 hikey=64 pitch_keycenter=62");
    expect(region).toMatchObject({ lokey: 60, hikey: 64, pitchKeycenter: 62, sample: "a.wav" });
  });

  it("reads the four real labels of the vendored program, which is the file's own vocabulary", () => {
    const labels = [...new Set(parseSfz(CELLO_KS).map((region) => region.opcodes.sw_label))];
    expect(labels.sort()).toEqual(["C#6 Tremolo", "C6 Sustain Vibrato", "D#6 Pizzicato", "D6 Spiccato"]);
  });
});

describe("techniqueSwitchFor — a name in, the file's own switch value out", () => {
  it("maps each of the file's four articulations to its own sw_last value", () => {
    const regions = parseSfz(CELLO_KS);
    expect(techniqueSwitchFor(regions, "sustain")).toMatchObject({ ok: true, switch: 84, label: "C6 Sustain Vibrato" });
    expect(techniqueSwitchFor(regions, "tremolo")).toMatchObject({ ok: true, switch: 85, label: "C#6 Tremolo" });
    expect(techniqueSwitchFor(regions, "spiccato")).toMatchObject({ ok: true, switch: 86, label: "D6 Spiccato" });
    expect(techniqueSwitchFor(regions, "pizzicato")).toMatchObject({ ok: true, switch: 87, label: "D#6 Pizzicato" });
  });

  it("matches on whole words, so a name cannot be found inside another one", () => {
    /**
     * `non-vibrato` must not be satisfied by a label that says `Vibrato`. The label is written the way ARIA's own example
     * writes it, so the rule can be read off the case that distinguishes words from substrings.
     */
    const text = "<group> sw_last=60 sw_label=Sustain Vibrato\n<region> sample=v.wav lokey=60 hikey=60";
    expect(techniqueSwitchFor(parseSfz(text), "vibrato")).toMatchObject({ ok: true, switch: 60 });
    expect(techniqueSwitchFor(parseSfz(text), "non-vibrato")).toMatchObject({ ok: false });
  });

  it("returns undefined when the file has no keyswitches, because then a name is not a keyswitch question", () => {
    // ⭐ This is what keeps a dedicated `ViolinEnsSpic.sfz` playing when a caller asks for `spiccato`.
    const plain = parseSfz("<region> sample=spic_c4.wav lokey=60 hikey=60");
    expect(techniqueSwitchFor(plain, "spiccato")).toBeUndefined();
  });

  it("breaks a tie between two articulations with the file's own sw_default, and refuses when it cannot", () => {
    /**
     * `Flute-KS` labels two of its groups `C2 Sustain Non-Vibrato` and `C#2 Sustain Vibrato`, so the word `sustain`
     * genuinely names two articulations there. The file's `sw_default=c2` is its author saying which one loads, so that
     * group wins; a file with no default at all is refused by name rather than guessed at.
     */
    const tied = "<group> sw_default=c2 sw_last=36 sw_label=C2 Sustain Non-Vibrato\n<region> sample=a.wav lokey=60 hikey=60\n<group> sw_last=37 sw_label=C#2 Sustain Vibrato\n<region> sample=b.wav lokey=60 hikey=60";
    expect(techniqueSwitchFor(parseSfz(tied), "sustain")).toMatchObject({ ok: true, switch: 36, label: "C2 Sustain Non-Vibrato" });
    const noDefault = "<group> sw_last=36 sw_label=C2 Sustain Non-Vibrato\n<region> sample=a.wav lokey=60 hikey=60\n<group> sw_last=37 sw_label=C#2 Sustain Vibrato\n<region> sample=b.wav lokey=60 hikey=60";
    const refused = techniqueSwitchFor(parseSfz(noDefault), "sustain");
    expect(refused).toMatchObject({ ok: false });
    if (refused && !refused.ok) expect(refused.reason).toContain("sw_default does not choose between them");
  });
});

describe("resolveInstrumentNote — the chosen articulation decides the region", () => {
  it("⭐ answers with the spiccato sample when the caller asks for spiccato, where the file's default answers sustain", () => {
    // The whole point: `sw_default=c6` is the sustain group, so before this option existed the spiccato take could not be reached by any note.
    const before = resolveInstrumentNote(cello, CELLO_KS, 60);
    expect(before.ok).toBe(true);
    expect(before.note!.samplePath).toContain("susvib_");
    expect(before.note!.switchLabel).toBe("C6 Sustain Vibrato");

    const after = resolveInstrumentNote(cello, CELLO_KS, 60, { technique: "spiccato" });
    expect(after.ok).toBe(true);
    expect(after.note!.samplePath).toContain("spic_");
    expect(after.note!.switchState).toBe(86);
    expect(after.note!.switchLabel).toBe("D6 Spiccato");
  });

  it("reaches the other two articulations the file folds in, through their own names", () => {
    expect(resolveInstrumentNote(cello, CELLO_KS, 60, { technique: "pizzicato" }).note!.samplePath).toContain("pizzT_");
    expect(resolveInstrumentNote(cello, CELLO_KS, 60, { technique: "tremolo" }).note!.samplePath).toContain("trem_");
  });

  it("refuses a name the file's labels do not carry, and names the labels it does", () => {
    const refused = resolveInstrumentNote(cello, CELLO_KS, 60, { technique: "harmonics" });
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain("harmonics");
    expect(refused.reason).toContain("C6 Sustain Vibrato");
    expect(refused.reason).toContain("D6 Spiccato");
  });

  it("leaves a caller that names no technique byte-for-byte where it was", () => {
    // ⭐ The inverse criterion at the resolver level: no option, same answer, sample for sample.
    const withOption = resolveInstrumentNote(cello, CELLO_KS, 60, { technique: "sustain" });
    const without = resolveInstrumentNote(cello, CELLO_KS, 60);
    expect(withOption.note!.samplePath).toBe("susvib_C3_v3_1.wav");
    expect(withOption.note!.samplePath).toBe(without.note!.samplePath);
    expect(withOption.note!.ratio).toBe(without.note!.ratio);
  });

  it("does not touch a file with no keyswitches at all, whichever technique is named", () => {
    const plain = { assetId: "plain", sfz: { url: "https://example.test/plain.sfz" } };
    const text = "<region> sample=spic_c4.wav lokey=60 hikey=60 pitch_keycenter=60";
    const before = resolveInstrumentNote(plain, text, 60);
    const after = resolveInstrumentNote(plain, text, 60, { technique: "spiccato" });
    expect(after.ok).toBe(true);
    expect(after.note!.samplePath).toBe(before.note!.samplePath);
    expect(after.note!.switchState).toBeUndefined();
  });
});

describe("declaredSwitchDefault — the last declaration wins, which is the reference engine's rule", () => {
  it("takes the later of two different defaults", () => {
    /**
     * sfizz's `Synth::Impl::buildRegion` ends with `if (lastRegion->defaultSwitch) setCurrentSwitch(*lastRegion->defaultSwitch);`
     * and `buildRegion` runs once per `<region>` in file order, so the value left standing is the last one built. This
     * function used to return the first — a different articulation on load for any file whose defaults disagree.
     */
    const text = [
      "<global> sw_default=24",
      "<group> sw_last=24",
      "<region> sample=ss.wav lokey=60 hikey=60",
      "<group> sw_default=26 sw_last=26",
      "<region> sample=sus.wav lokey=60 hikey=60",
    ].join("\n");
    const regions = parseSfz(text);
    expect(declaredSwitchDefault(regions)).toBe(26);
    // And it is the value the resolver actually loads with.
    const answer = resolveInstrumentNote({ assetId: "x", sfz: { url: "https://example.test/x.sfz" } }, text, 60);
    expect(answer.note!.samplePath).toBe("sus.wav");
  });

  it("costs the pinned programs nothing, because each repeats one value", () => {
    // Measured: `CelloEns-KS.sfz` writes `c6` in all six of its groups, so first and last agree on all eight files.
    expect(declaredSwitchDefault(parseSfz(CELLO_KS))).toBe(84);
  });
});

describe("the pinned `-KS` programs, fetched from their pin — the reading this change is about", () => {
  it("⭐ reads 6 articulation groups from the real ViolinEns-KS, and reaches the spiccato one that no note could before", async () => {
    const response = await fetch(VIOLIN_KS_RAW);
    expect(response.ok).toBe(true);
    const text = await response.text();
    const regions = parseSfz(text);

    // The file's own vocabulary is readable now, which is what makes the choice possible at all.
    const labels = [...new Set(regions.map((region) => region.opcodes.sw_label))];
    expect(labels).toEqual(["C2 Sustain Vibrato", "C#2 Tremolo", "D2 Spiccato", "D#2 Pizzicato"]);

    /**
     * Six groups, one switch value each spelled twice (the file writes its spiccato and pizzicato takes as two `<group>`
     * blocks), and the file's `sw_default=c2` names exactly one of them.
     */
    const gated = regions.filter((region) => region.swLast !== undefined);
    expect(gated.length).toBeGreaterThan(0);
    expect(new Set(gated.map((region) => region.swLast))).toEqual(new Set([36, 37, 38, 39]));

    // Note 60 vel 100: the file's default answers the sustain take …
    const byDefault = resolveInstrumentNote({ assetId: "vsco2ce:ViolinEns-KS", sfz: { url: VIOLIN_KS_RAW } }, text, 60);
    expect(byDefault.ok).toBe(true);
    expect(byDefault.note!.samplePath).toContain("susVib_");
    expect(byDefault.note!.switchLabel).toBe("C2 Sustain Vibrato");

    // … and asking for the spiccato reaches a take the default could never answer with.
    const byName = resolveInstrumentNote({ assetId: "vsco2ce:ViolinEns-KS", sfz: { url: VIOLIN_KS_RAW } }, text, 60, { technique: "spiccato" });
    expect(byName.ok).toBe(true);
    expect(byName.note!.samplePath).toContain("Spic_");
    expect(byName.note!.switchLabel).toBe("D2 Spiccato");
    expect(byName.note!.samplePath).not.toBe(byDefault.note!.samplePath);
  });
});

describe("the inverse: nothing about the ordinary path moved", () => {
  it("leaves the region search for a keyswitch file identical when no technique is named", () => {
    const regions = parseSfz(CELLO_KS);
    // Same regions, same order, same count under the file's own default — the gate is untouched by this change.
    const selected = regionsForNote(regions, 60, 100, 1, { switchDefault: declaredSwitchDefault(regions) });
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((region) => region.swLast === 84)).toBe(true);
  });

  it("names only the techniques the string table actually has, so the vocabulary cannot drift", () => {
    // The mapping is by the file's own words, so every technique the string table can ask for is worth checking against a label vocabulary.
    const techniques: StringTechnique[] = ["sustain", "non-vibrato", "quiet", "pizzicato", "spiccato", "tremolo", "col-legno", "harmonics"];
    const regions = parseSfz(CELLO_KS);
    const reached = techniques.filter((technique) => techniqueSwitchFor(regions, technique)?.ok === true);
    expect(reached.sort()).toEqual(["pizzicato", "spiccato", "sustain", "tremolo"]);
  });
});
