/**
 * Reading the **48-byte note form**: what the fix adds, and what it must not move.
 *
 * The owner handed over eight official Logic Pro projects. Four of them reported **zero parts and zero notes**, and
 * three of those four are genuinely audio — `Spatial Audio Demo Grid` holds no note sequence at all, and the two
 * `MONTERO` projects hold a single seven-note region inside gigabytes of audio. But `Swing!` holds hundreds of
 * notes in a form the specification does not describe: the marker dword is `90 40 00 00` and the event is **48**
 * bytes, where the specification's writer emits `90 00 00 00` and 32. Measured on the corpus, `Swing!` went from
 * **0 parts / 0 notes to 5 parts / 581 notes**, the two `Manzana` projects from 5/44 to 6/89, and all four
 * projects that already read correctly were unchanged to the note.
 *
 * There is **no Mac and no Logic on this machine**, so nothing here has been opened in Logic and compared. What the
 * criteria prove is narrower and is the whole claim: the reader reads this form's fields, and it reads them without
 * moving the number the 32-byte reading already produced. A green run here is not "the import is correct".
 *
 * Every byte below is built in this repository's own tests from a `Buffer`. **No real project is committed,
 * vendored or used as a snapshot** — the corpus is measured outside the checkout and reported in `docs/OPEN_WORK.md`.
 */
import { describe, expect, it } from "vitest";
import { fromLogicProject, LOGIC_TICKS_PER_QUARTER, parsePlist } from "../data/logicToArrangement";
import { buildLogicProjectData, buildMetaDataPlist } from "./fixtures/logic_project.mjs";
import { buildLogicProjectData48, NOTE_FORM_48 } from "./fixtures/logic_note_form.mjs";

/**
 * A **binary** plist holding one real number, written here because it is the shape a real `MetaData.plist` has and
 * the shape the committed fixtures do not cover: `logic_project.mjs` writes `MetaData` as XML, so the binary path
 * had no criterion on its real-number branch at all.
 *
 * A binary plist object of kind `0x2` is an IEEE-754 float — `0x22` a 4-byte big-endian one, `0x23` an 8-byte one.
 * Reading the 4 bytes of `120.0` as an unsigned integer yields `1123024896`, which is what every one of the
 * owner's eight projects reported as "MetaData says … BPM" before this was fixed.
 */
function buildBinaryPlistReal(key: string, value: number, size = 4): Uint8Array {
  const keyBytes = [...Buffer.from(key, "ascii")];
  const valueBytes =
    size === 8
      ? [...new Uint8Array(new Float64Array([value]).buffer).reverse()]
      : [...new Uint8Array(new Float32Array([value]).buffer).reverse()];
  const objects = [
    [0xd1, 1, 2], // the top dictionary: one entry, key object 1, value object 2
    [0x50 | keyBytes.length, ...keyBytes],
    [(size === 8 ? 0x23 : 0x22), ...valueBytes],
  ];
  const offsets = [];
  let cursor = 8;
  for (const object of objects) {
    offsets.push(cursor);
    cursor += object.length;
  }
  const tableStart = cursor;
  const out = [0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30];
  for (const object of objects) out.push(...object);
  for (const offset of offsets) out.push(offset);
  const uint64 = (value: number) => {
    const bytes = [];
    for (let shift = 56; shift >= 0; shift -= 8) bytes.push(Math.floor(value / 2 ** shift) % 256);
    return bytes;
  };
  out.push(0, 0, 0, 0, 0, 0, 1, 1);
  out.push(...uint64(objects.length), ...uint64(0), ...uint64(tableStart));
  return Uint8Array.from(out);
}

/** Four notes in the 48-byte form, pitched and spaced so a person can check them by eye. */
function quarterNotes48(bpm: number) {
  return buildLogicProjectData48({
    bpm,
    timeSignature: { numerator: 4, denominator: 4 },
    regions: [
      {
        name: "Swing Kit",
        notes: [
          { startTicks: 0, pitch: 36, velocity: 100, lengthTicks: 240 },
          { startTicks: 480, pitch: 38, velocity: 90, lengthTicks: 240 },
          { startTicks: 960, pitch: 42, velocity: 110, lengthTicks: 480 },
          { startTicks: 1440, pitch: 36, velocity: 80, lengthTicks: 240 },
        ],
      },
    ],
  });
}

describe("Logic import · the 48-byte note form", () => {
  it("reads the notes a 48-byte region holds, at the offsets the specification names", () => {
    /**
     * The criterion in one assertion, and it is the one that was red: this project produced **no parts at all**
     * before the fix, because its note sequence's marker dword is `90 40 00 00` and the reader tested the whole
     * dword for `90 00 00 00`. The pitches, velocities, starts and lengths are each checked separately, so a reader
     * that found the events but read the wrong offset cannot pass by luck.
     */
    const imported = fromLogicProject({ projectData: quarterNotes48(120), metaData: buildMetaDataPlist({}) });
    expect(imported.parts.map((part) => part.name)).toEqual(["Swing Kit"]);
    expect(imported.parts[0]!.notes).toEqual([
      { startBeats: 0, lengthBeats: 0.25, pitch: 36, velocity: 100 },
      { startBeats: 0.5, lengthBeats: 0.25, pitch: 38, velocity: 90 },
      { startBeats: 1, lengthBeats: 0.5, pitch: 42, velocity: 110 },
      { startBeats: 1.5, lengthBeats: 0.25, pitch: 36, velocity: 80 },
    ]);
  });

  it("keeps reading the tempo of a 48-byte project, which the region reading must not take down with it", () => {
    /**
     * ⚠️ **This one was already green and is a guard, not a fix** — said plainly so nobody reads it as one. The
     * tempo comes from the `gnoS` slot and never from a region, so the original reader answered `137.5` on this
     * fixture even while it returned zero parts. The measurement that reported "8/8 projects return no tempo" was a
     * probe reading the wrong field name (`tempo` for the property the interface calls `tempoBpm`), not a reader
     * defect, and this asserts the property the interface actually declares.
     */
    const imported = fromLogicProject({ projectData: quarterNotes48(137.5), metaData: buildMetaDataPlist({}) });
    expect(imported.tempoBpm).toBe(137.5);
  });

  it("reads the tick resolution the 48-byte form shares with the 32-byte form", () => {
    /**
     * Logic counts 960 ticks per quarter in both forms, so a note written 480 ticks after its region's start is
     * half a beat. Pinning this catches a reader that found the 48-byte stride and then divided by the wrong
     * resolution, which would put every note in the wrong place while the counts still looked right.
     */
    const imported = fromLogicProject({ projectData: quarterNotes48(120), metaData: buildMetaDataPlist({}) });
    const notes = imported.parts[0]!.notes;
    expect(notes[1]!.startBeats).toBe(480 / LOGIC_TICKS_PER_QUARTER);
    expect(LOGIC_TICKS_PER_QUARTER).toBe(960);
  });

  it("reports the meter the project states rather than a default, in the 48-byte form too", () => {
    /**
     * `3/4` is written into the signature header's own bytes, and this is the criterion that separates "read the
     * value" from "fell back to 4/4": a reader that never finds the signature sequence answers `4/4` here and is
     * wrong, and one that defaults would answer `4/4` and pass a `4/4` fixture. The two fixtures are read together
     * for exactly that reason.
     */
    const threeFour = buildLogicProjectData48({
      bpm: 120,
      timeSignature: { numerator: 3, denominator: 4 },
      regions: [{ name: "Waltz", notes: [{ startTicks: 0, pitch: 60, velocity: 100, lengthTicks: 960 }] }],
    });
    expect(fromLogicProject({ projectData: threeFour, metaData: buildMetaDataPlist({}) }).timeSignature).toBe("3/4");

    const sevenEight = buildLogicProjectData48({
      bpm: 120,
      timeSignature: { numerator: 7, denominator: 8 },
      regions: [{ name: "Seven", notes: [{ startTicks: 0, pitch: 60, velocity: 100, lengthTicks: 480 }] }],
    });
    expect(fromLogicProject({ projectData: sevenEight, metaData: buildMetaDataPlist({}) }).timeSignature).toBe("7/8");
  });

  it("names the form it read, so a criterion can turn red when the writer and the reader drift apart", () => {
    // The fixture's own marker and event size, asserted about the bytes rather than about the reader.
    const project = quarterNotes48(120);
    expect(NOTE_FORM_48.eventSize).toBe(48);
    expect(NOTE_FORM_48.marker).toEqual([0x90, 0x40, 0x00, 0x00]);
    // The region's note payload is 4 × 48 + 16, so the fixture really is the form it claims.
    expect(project.length).toBeGreaterThan(4 * NOTE_FORM_48.eventSize);
  });

  it("leaves the 32-byte reading exactly where it was", () => {
    /**
     * ⭐ **This is the criterion that protects the pinned numbers.** `logicFixtures.test.ts` pins real projects to
     * 48 drum / 90 piano / 51 bass etc., all of them written in the specification's 32-byte form. The 48-byte branch
     * is tried first in the reader, so if its guard ever loosened enough to claim a 32-byte payload, those numbers
     * would move silently. This reads one project through both forms' bytes and asserts the 32-byte one is
     * unchanged from what the specification says.
     */
    const project = buildLogicProjectData({
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      regions: [
        {
          name: "Piano",
          notes: [
            { startTicks: 0, pitch: 60, velocity: 100, lengthTicks: 480 },
            { startTicks: 480, pitch: 62, velocity: 80, lengthTicks: 240 },
            { startTicks: 960, pitch: 64, velocity: 120, lengthTicks: 960 },
          ],
        },
      ],
    });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({ bpm: 120 }) });
    expect(imported.parts.map((part) => part.name)).toEqual(["Piano"]);
    expect(imported.parts[0]!.notes).toEqual([
      { startBeats: 0, lengthBeats: 0.5, pitch: 60, velocity: 100 },
      { startBeats: 0.5, lengthBeats: 0.25, pitch: 62, velocity: 80 },
      { startBeats: 1, lengthBeats: 1, pitch: 64, velocity: 120 },
    ]);
  });
});

describe("Logic import · the real numbers in a binary plist", () => {
  it("reads a 4-byte real as the float it is, not as its bit pattern", () => {
    /**
     * ⭐ **The criterion that was red, and the reason it matters.** A real `MetaData.plist` is binary and states
     * `BeatsPerMinute` as a `real`. Read as an unsigned integer, `120.0` comes back as `1123024896` — a number no
     * project states — and that number then reaches the caller as the project's tempo. Measured on the owner's eight
     * official projects, **all eight** reported a metadata tempo in the billions for this reason.
     */
    expect(parsePlist(buildBinaryPlistReal("BeatsPerMinute", 120))).toEqual({ BeatsPerMinute: 120 });
    expect(parsePlist(buildBinaryPlistReal("BeatsPerMinute", 137.5))).toEqual({ BeatsPerMinute: 137.5 });
  });

  it("reads an 8-byte real as a double", () => {
    // `0x23` is the 8-byte form; a reader that handled only the 4-byte one would fall through to the integer read.
    expect(parsePlist(buildBinaryPlistReal("BeatsPerMinute", 92.25, 8))).toEqual({ BeatsPerMinute: 92.25 });
  });

  it("compares the two copies of the tempo it now reads, instead of only ever disagreeing with itself", () => {
    /**
     * The check that compares `MetaData.plist` with `ProjectData` is only meaningful when both sides are numbers.
     * With the metadata side read as a bit pattern it fired on **every** project and could never catch a real
     * disagreement. Here the two sides genuinely disagree, so the sentence must appear and must name both values.
     */
    const agreeing = fromLogicProject({
      projectData: quarterNotes48(120),
      metaData: buildBinaryPlistReal("BeatsPerMinute", 120),
    });
    expect(agreeing.tempoBpm).toBe(120);
    expect(agreeing.problems.some((problem) => problem.includes("MetaData.plist says"))).toBe(false);

    const disagreeing = fromLogicProject({
      projectData: quarterNotes48(120),
      metaData: buildBinaryPlistReal("BeatsPerMinute", 128),
    });
    expect(disagreeing.tempoBpm).toBe(120);
    const sentence = disagreeing.problems.find((problem) => problem.includes("MetaData.plist says"));
    expect(sentence).toBeDefined();
    expect(sentence).toContain("128");
    expect(sentence).toContain("120");
  });
});
