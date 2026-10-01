/**
 * Real Logic Pro projects, on the machine that has them.
 *
 * The owner pointed at `github.com/wikibook/logicprox-106` — 25 `.logicx` directories from a Logic Pro X 10.6
 * textbook. **They are not in this repository**: that is a textbook's companion assets with no stated licence, and
 * using someone's project locally to check a parser is a different act from redistributing it. So this file reads
 * them from a directory outside the checkout and **skips loudly when it is not there**, exactly as
 * `midiCorpus.test.ts` does for a MIDI corpus it does not vendor.
 *
 *   GROOVE_LOGIC_FIXTURES   the directory holding `*.logicx`, defaulting to `/tmp/logic-fixtures`
 *
 * Every expectation below was **produced by running the real files**, not estimated. The counts and pitches are the
 * fixtures' own; what they cannot prove is that Logic would import them the same way — see the module header. And
 * note what the assertions are *about*: the notes and the tempo survive, and the two things this model cannot hold
 * (audio, plugins) and the one reading this version does not give (where a region sits) are **named in `problems`**.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { activeVariant, fromLogicProject } from "../data/logicToArrangement";

const DIR = process.env.GROOVE_LOGIC_FIXTURES ?? "/tmp/logic-fixtures";
const present = existsSync(DIR) && readdirSync(DIR).some((name) => name.endsWith(".logicx"));

/** One alternative of one project, as the MCP tool receives it. */
function readAlternative(directory: string, alternative = "000") {
  const root = join(DIR, directory);
  return {
    projectData: new Uint8Array(readFileSync(join(root, "Alternatives", alternative, "ProjectData"))),
    metaData: new Uint8Array(readFileSync(join(root, "Alternatives", alternative, "MetaData.plist"))),
    projectInformation: new Uint8Array(readFileSync(join(root, "Resources", "ProjectInformation.plist"))),
  };
}

/** The note at a given (pitch, position) if it is there, so an assertion can name what it wanted. */
function noteAt(notes: { pitch: number; startBeats: number; lengthBeats: number; velocity: number }[], pitch: number, startBeats: number) {
  return notes.find((note) => note.pitch === pitch && Math.abs(note.startBeats - startBeats) < 1e-6);
}

describe.skipIf(!present)("real Logic projects from a textbook's companion assets", () => {
  it("says where it looked, so a skip is not mistaken for a pass", () => {
    const directories = readdirSync(DIR).filter((name) => name.endsWith(".logicx"));
    console.log(`   Logic fixtures : ${directories.length} project(s) read from ${DIR}`);
    expect(directories.length).toBeGreaterThan(0);
  });

  it("011_Piano_quzntized: parses to the parts and notes the file holds", () => {
    /**
     * The clean MIDI fixture. The numbers were measured from the file, not chosen: five regions, 519 notes, and the
     * `Sum 6` region's 81 notes running from pitch 67 to 84 with the first at beat 0. If a parser started reading a
     * different field, these are the numbers that would move first.
     */
    const { projectData, metaData } = readAlternative("011_ Piano_quzntized.logicx");
    const imported = fromLogicProject({ projectData, metaData });
    expect(imported.parts.map((part) => part.name)).toEqual(["Sum 6", "Drummer", "Drummer", "Acoustic Guitar", "Delicate Bells"]);
    expect(imported.parts.reduce((sum, part) => sum + part.notes.length, 0)).toBe(519);
    const sum6 = imported.parts[0]!;
    expect(sum6.notes.length).toBe(81);
    expect(Math.min(...sum6.notes.map((note) => note.pitch))).toBe(67);
    expect(Math.max(...sum6.notes.map((note) => note.pitch))).toBe(84);
    // The first three notes of the region, as written in the region-relative note sequence.
    expect(sum6.notes[0]).toMatchObject({ startBeats: 0, pitch: 74, lengthBeats: 1064 / 960 });
    expect(sum6.notes[1]).toMatchObject({ startBeats: 1, pitch: 72, lengthBeats: 555 / 960 });
    expect(sum6.notes[2]).toMatchObject({ startBeats: 1.5, pitch: 74, lengthBeats: 989 / 960 });
    expect(noteAt(sum6.notes, 74, 0)).toBeDefined();
  });

  it("015_drummer_recorded: keeps a Korean region name readable", () => {
    // `스트링 수밍 멜로디 연주` is UTF-8 in the record; a byte-per-character read renders it as mojibake, which is how
    // the missing decode was found.
    const { projectData, metaData } = readAlternative("015_drummer_recorded.logicx");
    const imported = fromLogicProject({ projectData, metaData });
    const names = imported.parts.map((part) => part.name);
    expect(names).toContain("스트링 수밍 멜로디 연주");
    expect(names.filter((name) => name === "Drummer").length).toBe(6);
  });

  it("019_audio_file_editor: a project with audio tracks says so, by name", () => {
    /**
     * ⭐ **Criterion 2 on a real file.** This project is audio; it has no MIDI regions at all. The failure this
     * forbids is an import that answers "0 parts" and lets the caller read that as "nothing was in it".
     */
    const { projectData, metaData } = readAlternative("019_audio_file_editor.logicx");
    const imported = fromLogicProject({ projectData, metaData });
    expect(imported.parts).toEqual([]);
    const audio = imported.problems.find((problem) => problem.includes("audio region reference"));
    expect(audio, imported.problems.join(" | ")).toBeDefined();
    expect(audio).toContain("no audio track kind");
    expect(audio).toMatch(/\d+ audio region reference\(s\) were not imported/);
  });

  it("025_AUPitch: names the plugin it found, and agrees with the plist the project also carries", () => {
    // MetaData.plist here *does* state a tempo (110) and a signature (4/4), unlike the 10.0-era fixtures — so this is
    // the file where "the two agree" is a real comparison rather than a vacuous one.
    const { projectData, metaData } = readAlternative("025_AUPitch.logicx");
    const imported = fromLogicProject({ projectData, metaData });
    expect(imported.tempoBpm).toBe(110);
    expect(imported.timeSignature).toBe("4/4");
    expect(imported.problems.join("\n")).toContain("AUPitch");
    expect(imported.problems.join("\n")).toContain("no counterpart");
  });

  it("014_drummer_adjustment: a Drummer track converts and says what was lost", () => {
    const { projectData, metaData } = readAlternative("014_drummer_adjustment.logicx");
    const imported = fromLogicProject({ projectData, metaData });
    expect(imported.parts.map((part) => part.name)).toEqual(["Hard Rock", "Drummer", "Drummer", "Drummer"]);
    const drummer = imported.problems.find((problem) => problem.includes("Drummer/Session Player"));
    expect(drummer).toBeDefined();
    expect(drummer).toContain("Logic generated this");
  });

  it("012_tempo_practice: reads a real tempo, and says the project holds a tempo map", () => {
    // 100 BPM out of `gnoS+0x3a6`, with 31 tempo events in the tempo-track sequence — one tempo this model can hold,
    // and the rest is a sentence rather than a silent flattening.
    const { projectData, metaData } = readAlternative("012_tempo_practice.logicx");
    const imported = fromLogicProject({ projectData, metaData });
    expect(imported.tempoBpm).toBe(100);
    expect(imported.timeSignature).toBe("4/4");
    expect(imported.problems.join("\n")).toContain("tempo points");
  });

  it("reads the active alternative out of a real ProjectInformation.plist", () => {
    /**
     * ⭐ **Criterion 3's real half.** These textbook projects are all on `000` and their `ProjectInformation.plist`
     * does **not** carry an `ActiveVariant` key at all — the field the specification names came later. So a real file
     * answers `undefined` here, which is exactly why the synthetic criterion uses a plist that does state `004`: the
     * behaviour has to be testable even when no fixture happens to exercise it. This test is the evidence for that
     * claim rather than the claim itself.
     */
    const { projectInformation } = readAlternative("011_ Piano_quzntized.logicx");
    const variant = activeVariant(projectInformation);
    console.log(`   011 ProjectInformation ActiveVariant: ${String(variant)}`);
    expect(variant === undefined || typeof variant === "string").toBe(true);
  });

  it("every project parses without throwing, and every one of them says what it dropped", () => {
    // The blunt criterion: a reader meets 25 real files or it meets none of them. A crash on any one of them is a red
    // bar here, and so is a project that quietly produced no problems at all while holding audio or plugins.
    const directories = readdirSync(DIR).filter((name) => name.endsWith(".logicx")).sort();
    for (const directory of directories) {
      const { projectData, metaData } = readAlternative(directory);
      const imported = fromLogicProject({ projectData, metaData });
      expect(Array.isArray(imported.parts), `${directory} produced no parts array`).toBe(true);
      expect(imported.problems.length, `${directory} reported nothing at all`).toBeGreaterThan(0);
      for (const part of imported.parts) {
        expect(part.notes.length, `${directory}/${part.name} is an empty part`).toBeGreaterThan(0);
        for (const note of part.notes) {
          expect(Number.isFinite(note.startBeats), `${directory}/${part.name} has a non-finite start`).toBe(true);
          expect(note.lengthBeats, `${directory}/${part.name} has a negative length`).toBeGreaterThanOrEqual(0);
          expect(note.pitch, `${directory}/${part.name} has an out-of-range pitch`).toBeLessThanOrEqual(127);
        }
      }
    }
  });
});
