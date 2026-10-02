/**
 * ⭐ **The situation reaches the recording — one real read-back per musical situation, through the landed chain.**
 *
 * `src/data/stringTechniques.ts` measured which technique serves which situation, and for a while the chosen
 * `assetId` had nowhere to go: the import paths stopped at `addTrack(next, "synth", …)` and the part stayed an
 * anonymous synthesiser. The bridge landed later (`TrackV2.instrument` + `src/data/sampledInstruments.ts`), and
 * `src/data/stringSituation.ts` is the wiring. These criteria hold the **whole road** together rather than the
 * resolver alone: a situation is stated, a technique is chosen, the choice is written as a track identity, and the
 * **compiled lane** — the thing the sampler actually reads — names the recording. A criterion that stopped at the
 * resolver would pass while the track still played a preset, which is exactly the failure being fixed.
 *
 * Four things are pinned per situation, because each can rot in a different direction:
 *
 *   · **which technique was chosen**, and the recording behind it;
 *   · **whether it was the first choice**, and — when it was not — the reason, named (spiccato and tremolo are real
 *     upstream techniques whose **bytes are not mirrored**, so their rules *must* fall back and *must* say so);
 *   · **the register**, because "walking" is a low line and a viola pizzicato is not one;
 *   · **the length verdict and the velocity layers**, the two measured facts the whole table exists for.
 *
 * The owner's own project is read where it is present, guarded the way `ownerProjectAcceptance.test.ts` guards it:
 * the file is other people's music and is not committed, and a skip must not look like a pass.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LENGTH_REMEDIES, instrumentIdentityFor, playableTechniques } from "../data/stringTechniques";
import { placementForPart, placementForTrack } from "../data/stringSituation";
import { ALL_SAMPLED_INSTRUMENTS, sampledInstrumentFor } from "../data/sampledInstruments";
import { compileArrangementToLanes } from "../data/arrangementCompile";
import { arrangementWithImportedParts } from "../data/arrangementImport";
import { fromMidi } from "../data/midiToArrangement";
import { buildMidiFile } from "./fixtures/midi_file.mjs";
import { addMcpTrack, clearMcpArrangements, createMcpArrangement, getMcpArrangement, importMcpMidi } from "../../mcp/arrangement";
import type { NoteEvent } from "../types/arrangementV2";

/** The owner's own acceptance file, if this runner has it. */
const PROJECT = process.env.GROOVE_OWNER_MIDI ?? "/tmp/groove-fx/fate-echoes.mid";
const ownerProjectPresent = existsSync(PROJECT);

/** A note, with the fields under test written and the rest left to the same defaults the arrangement's edits use. */
function note(pitch: number, lengthBeats: number, velocity: number, startBeats = 0): NoteEvent {
  return { pitch, startBeats, lengthBeats, velocity };
}

/** The owner's strings shape as measured: twenty chords of three notes, each held 8.5 beats at velocity 50, pitches 57–69. */
function ownerStringsShape(): NoteEvent[] {
  const pitches = [57, 58, 60, 61, 62, 64, 65, 67, 69];
  const notes: NoteEvent[] = [];
  for (let chord = 0; chord < 20; chord += 1) {
    for (const offset of [0, 3, 6]) notes.push(note(pitches[(chord + offset) % pitches.length]!, 8.5, 50, chord * 8));
  }
  return notes;
}

/** A repeated short-note figure: the "短促/重复" situation, in the register a violin section plays in. */
function repeatedShortNotes(): NoteEvent[] {
  return Array.from({ length: 16 }, (_, index) => note(67, 0.25, 96, index * 0.5));
}

/** A walking line on the contrabass's own compass, 24–60. */
function walkingBass(): NoteEvent[] {
  return [24, 28, 31, 36, 38, 41, 43, 48, 50, 53, 55, 57, 59, 60].map((pitch, index) => note(pitch, 1, 80, index));
}

/** ⭐ The recording the compiled lane reaches for a track declaring this identity — read through the real resolver. */
function laneSampleFor(notes: NoteEvent[], instrument: string, bpm = 120): string | undefined {
  const lanes = compileArrangementToLanes(
    { songId: "probe", bpm, tracks: [{ id: "t1", kind: "synth", name: "Strings", instrument }], notesByTrack: { t1: notes }, sourceSlots: [] },
    { t1: notes }
  );
  return lanes[0]!.track.sample?.assetId;
}

/** A fresh arrangement, by the same tool a caller uses, so the probe is not a shape the app cannot make. */
function createProbe(): string {
  clearMcpArrangements();
  return createMcpArrangement({}).arrangementId;
}

describe("every musical situation, read back", () => {
  it("a sustained bed: the vibrato section, first choice, and the recording is reachable from the track identity", () => {
    const notes = ownerStringsShape();
    const placement = placementForPart({ instrument: "violin", situation: "sustained-bed" }, notes, 120);
    expect(placement.refused).toBeUndefined();
    expect(placement.technique).toBe("sustain");
    expect(placement.assetId).toBe("vsco2ce:ViolinEnsSusVib");
    expect(placement.instrument).toBe("violin_section_sustain");
    expect(placement.firstChoice).toBe(true);
    expect(placement.rejected).toEqual([]);
    // The identity is not a claim: the compiled lane — what the sampler reads — names the recording.
    expect(laneSampleFor(notes, placement.instrument!)).toBe("vsco2ce:ViolinEnsSusVib");
    expect(placement.range).toMatchObject({ lowest: 57, highest: 69, programLowest: 55, programHighest: 86, inside: notes.length, outside: 0 });
    expect(placement.length!.verdict.kind).toBe("fits");
    expect(placement.length!.counts).toEqual({ fits: notes.length, risky: 0, exceeds: 0 });
  });

  it("short and repeating: spiccato is asked for first, is unmirrored, and the pluck is reported as the fallback it is", () => {
    const notes = repeatedShortNotes();
    const placement = placementForPart({ instrument: "violin", situation: "short-repeating" }, notes, 120);
    expect(placement.technique).toBe("pizzicato");
    expect(placement.assetId).toBe("vsco2ce:ViolinEnsPizz");
    expect(placement.instrument).toBe("violin_section_pizzicato");
    expect(placement.firstChoice).toBe(false);
    expect(placement.rejected).toEqual([{ technique: "spiccato", reason: "not-mirrored" }]);
    // ⭐ The fallback is said, not implied: the sentence names spiccato and the reason its bytes are absent.
    expect(placement.problems.join(" | ")).toMatch(/spiccato was asked for first and its bytes are not in the mirror/);
    expect(placement.problems.join(" | ")).toMatch(/vsco2ce:ViolinEnsPizz/);
    expect(placement.note).toMatch(/a fallback/);
    expect(laneSampleFor(notes, placement.instrument!)).toBe("vsco2ce:ViolinEnsPizz");
  });

  it("a plucked walking line: the contrabass pizzicato, with the rule's 24–60 register in force", () => {
    const notes = walkingBass();
    const placement = placementForPart({ instrument: "contrabass", situation: "plucked-walking" }, notes, 120);
    expect(placement.technique).toBe("pizzicato");
    expect(placement.assetId).toBe("vsco2ce:ContrabassPizz");
    expect(placement.instrument).toBe("contrabass_solo_pizzicato");
    expect(placement.firstChoice).toBe(true);
    // ⭐ The register is not decoration: the rule carries it and the reading reports it.
    expect(placement.range!.situationRange).toEqual([24, 60]);
    expect(placement.range).toMatchObject({ lowest: 24, highest: 60, programLowest: 24, programHighest: 60, outside: 0 });
    expect(laneSampleFor(notes, placement.instrument!)).toBe("vsco2ce:ContrabassPizz");
  });

  it("refuses the walking register rather than answering a viola line with a walking bass", () => {
    const notes = [note(55, 1, 80), note(67, 1, 80, 1), note(74, 1, 80, 2)];
    const placement = placementForPart({ instrument: "viola", situation: "plucked-walking" }, notes, 120);
    expect(placement.instrument).toBeUndefined();
    expect(placement.technique).toBeUndefined();
    expect(placement.refused).toMatch(/24–60/);
    expect(placement.refused).toMatch(/compass is 55–74/);
    // ⭐ And the refusal is executable: it names the two ways out.
    expect(placement.refused).toMatch(/split the part at the register boundary, or name the instrument directly/);
  });

  it("tension: tremolo is asked for first, is unmirrored, and the sustain it falls back to is not passed off as tension", () => {
    const notes = [note(48, 8, 100), note(55, 8, 100, 8), note(60, 8, 100, 16)];
    const placement = placementForPart({ instrument: "cello", situation: "tension-tremolo" }, notes, 120);
    expect(placement.technique).toBe("sustain");
    expect(placement.assetId).toBe("vsco2ce:CelloEnsSusVib");
    expect(placement.instrument).toBe("cello_section_sustain");
    expect(placement.firstChoice).toBe(false);
    expect(placement.rejected).toEqual([{ technique: "tremolo", reason: "not-mirrored" }]);
    expect(placement.problems.join(" | ")).toMatch(/tremolo was asked for first and its bytes are not in the mirror/);
    expect(laneSampleFor(notes, placement.instrument!)).toBe("vsco2ce:CelloEnsSusVib");
  });

  it("an accent: a pluck supplies the attack, and it is the rule's first choice", () => {
    const notes = [note(69, 0.5, 127), note(72, 0.5, 40, 1), note(69, 0.5, 127, 2)];
    const placement = placementForPart({ instrument: "violin", situation: "accent-attack" }, notes, 120);
    expect(placement.technique).toBe("pizzicato");
    expect(placement.firstChoice).toBe(true);
    expect(placement.assetId).toBe("vsco2ce:ViolinEnsPizz");
  });
});

describe("the length constraint, on the material's own numbers", () => {
  it("fits: a 4.25 s note against the violin sustain's 8.988 s shortest sample", () => {
    const placement = placementForPart({ instrument: "violin", situation: "sustained-bed" }, [note(60, 8.5, 50)], 120);
    expect(placement.length!.verdict).toMatchObject({ kind: "fits", headroomSeconds: 4.738 });
    expect(placement.length!.seconds).toBe(4.25);
    expect(placement.problems).toEqual([]);
    expect(placement.note).toMatch(/length fits — the longest note is 4.25 s/);
  });

  it("exceeds: a 15 s note against the cello sustain's 12.747 s longest sample, with three priced next steps", () => {
    // 30 beats at 120 bpm is 15 s; the cello's longest sustained sample is 12.747 s and it does not loop.
    const placement = placementForPart({ instrument: "cello", situation: "tension-tremolo" }, [note(48, 30, 100)], 120);
    const length = placement.length!;
    expect(length.verdict).toMatchObject({ kind: "exceeds", maxSampleSeconds: 12.747 });
    expect(length.seconds).toBe(15);
    expect(length.remedies.map((remedy) => remedy.remedy)).toEqual(["truncate", "switch-technique", "retrigger"]);
    /**
     * ⭐ **The exceed is not silent, and the advice is executable.** Each next step carries its own cost, which is
     * why the remedies are data rather than a sentence in a comment.
     */
    const problem = placement.problems.find((entry) => entry.includes("will stop early"))!;
    expect(problem).toMatch(/three next steps, each with its cost/);
    for (const remedy of LENGTH_REMEDIES) {
      expect(problem).toContain(remedy.remedy);
      expect(problem).toContain(remedy.cost);
    }
    expect(placement.note).toMatch(/length exceeds/);
  });

  it("a two-layer program reports the layers a part's velocities actually reach — velocity selects, it does not shape", () => {
    // 40 and 62 are the same recorded take at the same gain; 63 is a different one. The table measured it; this pins it.
    const notes = [note(60, 1, 40), note(60, 1, 62, 1), note(60, 1, 63, 2), note(60, 1, 100, 3)];
    const placement = placementForPart({ instrument: "violin", situation: "sustained-bed" }, notes, 120);
    expect(placement.velocity).toMatchObject({ layers: 2, used: [0, 1], atEdge: 2, unlayered: [] });
    expect(placement.velocity!.note).toMatch(/velocity selects a recorded take rather than shaping one/);
  });
});

describe("the technique identities are real, resolvable instrument names", () => {
  it("resolves every playable row's identity to that row's own recording, through the recorded-instrument table", () => {
    const playable = playableTechniques();
    expect(playable).toHaveLength(8);
    for (const program of playable) {
      const identity = instrumentIdentityFor(program);
      expect(sampledInstrumentFor(identity)?.assetId, `${identity} must reach ${program.assetId}`).toBe(program.assetId);
    }
  });

  it("offers an identity for every mirrored row and none for an unmirrored one", () => {
    const names = new Set(ALL_SAMPLED_INSTRUMENTS.map((choice) => choice.instrument));
    for (const program of playableTechniques()) expect(names.has(instrumentIdentityFor(program))).toBe(true);
    // The techniques the table refuses today must not be offered as if they played something.
    expect(names.has("violin_section_spiccato")).toBe(false);
    expect(names.has("cello_section_tremolo")).toBe(false);
    expect(names.has("solo_violin_sustain")).toBe(false);
  });
});

describe("a track added by situation", () => {
  it("writes the chosen identity on the track and reports the choice — and says the register is not checked yet", () => {
    const created = createProbe();
    const result = addMcpTrack(created, "synth", "Vln", undefined, undefined, { instrument: "violin", situation: "short-repeating" });
    expect(result.situation!.technique).toBe("pizzicato");
    expect(result.situation!.instrument).toBe("violin_section_pizzicato");
    expect(result.problems.join(" | ")).toMatch(/spiccato was asked for first/);
    expect(result.situation!.note).toMatch(/not checked yet, because no notes exist/);
    // `createMcpArrangement` gives a blank arrangement one starter track, so the new one is the last.
    const tracks = getMcpArrangement(created)!.tracks;
    expect(tracks.at(-1)!.name).toBe("Vln");
    expect(tracks.at(-1)!.instrument).toBe("violin_section_pizzicato");
  });

  it("refuses a situation whose register the instrument cannot hold, rather than creating a track that claims it", () => {
    const created = createProbe();
    const before = getMcpArrangement(created)!.tracks.length;
    expect(() => addMcpTrack(created, "synth", "Vln", undefined, undefined, { instrument: "violin", situation: "plucked-walking" })).toThrow(/24–60/);
    // Nothing was created: a refusal must not leave a half-made track behind.
    expect(getMcpArrangement(created)!.tracks).toHaveLength(before);
  });
});

describe("a MIDI import given situations", () => {
  it("puts the chosen recording on the imported part, keeps its velocities, and reports the reading", () => {
    const created = createProbe();
    const bytes = buildMidiFile({
      division: 480,
      tracks: [
        {
          name: "Strings",
          notes: [
            { note: 57, startTicks: 0, durationTicks: 4080, velocity: 50 },
            { note: 60, startTicks: 0, durationTicks: 4080, velocity: 50 },
            { note: 64, startTicks: 0, durationTicks: 4080, velocity: 50 },
          ],
        },
      ],
    });
    const result = importMcpMidi(created, Buffer.from(bytes).toString("base64"), {
      partIndex: 0,
      situations: { 0: { instrument: "violin", situation: "sustained-bed" } },
    });
    expect(result.situations).toHaveLength(1);
    expect(result.situations![0]!.technique).toBe("sustain");
    expect(result.situations![0]!.instrument).toBe("violin_section_sustain");
    expect(result.situations![0]!.length!.verdict.kind).toBe("fits");
    const arrangement = getMcpArrangement(created)!;
    const track = arrangement.tracks.find((candidate) => candidate.name === "Strings")!;
    expect(track.instrument).toBe("violin_section_sustain");
    // ⭐ Velocity is untouched: it selects the recorded layer, and nothing here rescales it.
    expect(arrangement.notesByTrack![track.id]!.map((entry) => entry.velocity)).toEqual([50, 50, 50]);
    expect(laneSampleFor(arrangement.notesByTrack![track.id]!, "violin_section_sustain")).toBe("vsco2ce:ViolinEnsSusVib");
  });

  it("says when a part was named both ways, and applies the situation", () => {
    const created = createProbe();
    const bytes = buildMidiFile({
      division: 480,
      tracks: [{ name: "Strings", notes: [{ note: 60, startTicks: 0, durationTicks: 960, velocity: 64 }] }],
    });
    const result = importMcpMidi(created, Buffer.from(bytes).toString("base64"), {
      partIndex: 0,
      instruments: { 0: "piano_lead" },
      situations: { 0: { instrument: "violin", situation: "short-repeating" } },
    });
    expect(result.problems.join(" | ")).toMatch(/both the instrument "piano_lead" and the situation "short-repeating"/);
    expect(result.problems.join(" | ")).toMatch(/the situation was applied/);
    expect(getMcpArrangement(created)!.tracks.find((candidate) => candidate.name === "Strings")!.instrument).toBe("violin_section_pizzicato");
  });
});

describe("the data-layer import path (the one the file picker uses)", () => {
  it("takes the same situations and returns the same reading", () => {
    const bytes = buildMidiFile({
      division: 480,
      tracks: [{ name: "Strings", notes: [{ note: 60, startTicks: 0, durationTicks: 1920, velocity: 50 }] }],
    });
    const result = arrangementWithImportedParts(
      { songId: "probe", bpm: 120, bars: 2, tracks: [], notesByTrack: {}, sourceSlots: [] },
      fromMidi(bytes),
      { situations: { 0: { instrument: "violin", situation: "sustained-bed" } } }
    );
    expect(result.situations).toHaveLength(1);
    expect(result.situations![0]!.instrument).toBe("violin_section_sustain");
    expect(result.arrangement.tracks[0]!.instrument).toBe("violin_section_sustain");
  });

  it("reports an index that names no part instead of applying a situation silently to nothing", () => {
    const bytes = buildMidiFile({ division: 480, tracks: [{ name: "One", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] }] });
    const result = arrangementWithImportedParts(
      { songId: "probe", bpm: 120, bars: 2, tracks: [], notesByTrack: {}, sourceSlots: [] },
      fromMidi(bytes),
      { situations: { 3: { instrument: "violin", situation: "sustained-bed" } } }
    );
    expect(result.problems.join(" | ")).toMatch(/a situation was given for part 4, and the file has 1 part\(s\)/);
  });
});

describe.skipIf(!ownerProjectPresent)("the owner's project, read through the situation resolver", () => {
  it("⭐ names the strings part by what it is doing and lands the vibrato section on its 60 notes", () => {
    const imported = fromMidi(new Uint8Array(readFileSync(PROJECT)));
    const strings = imported.parts.find((part) => part.name.includes("弦"))!;
    const placement = placementForPart({ instrument: "violin", situation: "sustained-bed" }, strings.notes, 120);
    expect(placement.technique).toBe("sustain");
    expect(placement.assetId).toBe("vsco2ce:ViolinEnsSusVib");
    expect(placement.instrument).toBe("violin_section_sustain");
    expect(placement.length!.verdict.kind).toBe("fits");
    expect(placement.velocity).toMatchObject({ layers: 2, used: [0] });
    expect(placement.range!.outside).toBe(0);
    expect(laneSampleFor(strings.notes, placement.instrument!)).toBe("vsco2ce:ViolinEnsSusVib");
  });
});
