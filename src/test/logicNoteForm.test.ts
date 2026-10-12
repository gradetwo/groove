/**
 * Reading the **16-byte line model**: what the rebuild reads, and what it must not move.
 *
 * A `qSvE` payload is a sequence of 16-byte lines. A line whose byte 7 has its top bit clear **opens an event**; one
 * whose byte 7 has it set **continues the event before it**. A note is therefore `16 × (N + 1)` bytes — 16 with no
 * continuation, 32 with one (the form the byte-level specification's writer emits), 48 with two, 64 with three, 80
 * with four — and **nothing in the head line selects a size**. The reader this replaces knew two fixed strides (32 and
 * 48) and silently dropped or misread every note of any other length.
 *
 * Measured on the owner's eight official projects, the rebuild reads `Swing!` 581 → **2903** notes, `Manzana` 89 →
 * **1369** each, `Colors` 1557 → **2007**, `ocean eyes` 1240 → **1415**, with `MONTERO` (7) and `Spatial Audio Demo
 * Grid` (0) unchanged. `Colors` and `ocean eyes` read *fewer* than the line totals their sequences hold, and that is
 * the point of the status check: the remaining lines are 861 pitch bends and 314 controller events — `0xE0` and `0xB0`
 * head lines `logicxkit`'s `midi.py` names in its own table — and a sustain pedal is not a note.
 *
 * There is **no Mac and no Logic on this machine**, so nothing here has been opened in Logic and compared. What the
 * criteria prove is narrower and is the whole claim: the reader reads every continuation length at the offsets the
 * sources name, and it reads them without moving the number the 32-byte reading already produced. A green run here is
 * not "the import is correct".
 *
 * Every byte below is built in this repository's own tests from a `Buffer`. **No real project is committed,
 * vendored or used as a snapshot** — the corpus is measured outside the checkout and reported in `docs/OPEN_WORK.md`.
 */
import { describe, expect, it } from "vitest";
import { fromLogicProject, LOGIC_TICKS_PER_QUARTER, parsePlist } from "../data/logicToArrangement";
import { buildLogicProjectData, buildMetaDataPlist } from "./fixtures/logic_project.mjs";
import { buildLogicProjectDataLines, buildNoteEvent, eventSize, NOTE_FORM } from "./fixtures/logic_note_form.mjs";

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

/**
 * Six regions, one per continuation count, each with two notes an octave and a semitone apart so a person can check
 * them by eye. The lengths differ per N so a reader that found the events but read the length from the wrong line
 * cannot pass by luck.
 */
function projectWithEveryLength(bpm = 120) {
  const regions = [];
  for (let n = 0; n <= 5; n += 1) {
    regions.push({
      name: `N${n}`,
      notes: [
        { startTicks: 0, pitch: 60 + n, velocity: 100, lengthTicks: 240 * (n + 1), continuations: n },
        { startTicks: 480, pitch: 72 + n, velocity: 80, lengthTicks: 960, continuations: n },
      ],
    });
  }
  return buildLogicProjectDataLines({ bpm, timeSignature: { numerator: 4, denominator: 4 }, regions });
}

describe("Logic import · the 16-byte line model", () => {
  it("reads a note at every continuation length, N = 0 through 5", () => {
    /**
     * ⭐ **The criterion in one assertion, and it was red for four of the six lengths.** Before the rebuild the reader
     * had one fixed 48-byte branch and one fixed 32-byte branch: N=2 was read by the first and N=1 by the second, and
     * N=0/3/4/5 were read by neither — a real 80-byte note fell through to a 32-byte walk and was lost. Every field is
     * checked per region, so a reader that found the events but read the wrong offset cannot pass by luck.
     */
    const imported = fromLogicProject({ projectData: projectWithEveryLength(), metaData: buildMetaDataPlist({}) });
    expect(imported.parts.map((part) => part.name)).toEqual(["N0", "N1", "N2", "N3", "N4", "N5"]);
    for (const [n, part] of imported.parts.entries()) {
      expect(part.notes.length).toBe(2);
      expect(part.notes[0]).toMatchObject({ startBeats: 0, pitch: 60 + n, velocity: 100 });
      // A bare 16-byte event has no continuation, so it has no length field at all: the reader says zero, not the
      // first four bytes of the event after it.
      expect(part.notes[0]!.lengthBeats).toBe(n === 0 ? 0 : (240 * (n + 1)) / LOGIC_TICKS_PER_QUARTER);
      expect(part.notes[1]).toMatchObject({
        startBeats: 0.5,
        pitch: 72 + n,
        velocity: 80,
      });
      expect(part.notes[1]!.lengthBeats).toBe(n === 0 ? 0 : 960 / LOGIC_TICKS_PER_QUARTER);
    }
  });

  it("does not take the bytes beside the status for a size selector", () => {
    /**
     * `90 40 00 00` is not a 48-byte marker — `0x40` is a flag, and the corpus writes notes whose head dword is
     * `90 00 51 9d`. Three head shapes at the **same** continuation count must read identically; a reader that
     * branched on the head bytes would answer three different things here.
     */
    const headShapes: [number, number, number][] = [
      [0x40, 0x00, 0x00],
      [0x00, 0x51, 0x9d],
      [0x00, 0x00, 0x00],
    ];
    for (const headFlags of headShapes) {
      const project = buildLogicProjectDataLines({
        bpm: 120,
        regions: [{ name: "Flags", notes: [{ startTicks: 0, pitch: 61, lengthTicks: 720, continuations: 2, headFlags }] }],
      });
      const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
      expect(imported.parts.map((part) => part.name), `head ${headFlags.join(" ")}`).toEqual(["Flags"]);
      expect(imported.parts[0]!.notes).toEqual([
        { startBeats: 0, lengthBeats: 720 / LOGIC_TICKS_PER_QUARTER, pitch: 61, velocity: 100 },
      ]);
    }
  });

  it("steps over a controller or pitch-bend line inside a note sequence instead of reading it as a note", () => {
    /**
     * A region's sequence holds the events beside the notes, and `0xB0`/`0xE0` head lines are a controller and a
     * pitch bend (`logicxkit`'s `KINDS` table). Counting every head line as a note is what turned 18 measured notes
     * into 52 in the corpus and gave `Colors` 861 extra "notes" whose pitch byte is a bend's low byte. The two real
     * notes must survive and the two non-notes must not become notes.
     */
    const project = buildLogicProjectDataLines({
      bpm: 120,
      regions: [
        {
          name: "Mixed",
          notes: [
            { startTicks: 0, pitch: 60, velocity: 100, lengthTicks: 480, continuations: 1 },
            { startTicks: 240, pitch: 64, velocity: 127, status: 0xb0, continuations: 0 },
            { startTicks: 480, pitch: 67, velocity: 90, lengthTicks: 240, continuations: 2 },
            { startTicks: 720, pitch: 0, status: 0xe0, continuations: 0 },
          ],
        },
      ],
    });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
    expect(imported.parts.map((part) => part.name)).toEqual(["Mixed"]);
    expect(imported.parts[0]!.notes).toEqual([
      { startBeats: 0, lengthBeats: 0.5, pitch: 60, velocity: 100 },
      { startBeats: 0.5, lengthBeats: 0.25, pitch: 67, velocity: 90 },
    ]);
  });

  it("does not read the terminator as an event, at any length", () => {
    // The `f1` line closes the run. A reader that kept walking would turn the terminator into a note whose pitch is
    // the byte at its `+0x0c` — a number no writer put there as a pitch.
    for (const continuations of [0, 1, 2, 5]) {
      const project = buildLogicProjectDataLines({
        bpm: 120,
        regions: [{ name: `T${continuations}`, notes: [{ startTicks: 0, pitch: 60, lengthTicks: 480, continuations }] }],
      });
      const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
      expect(imported.parts[0]!.notes.length, `N=${continuations}`).toBe(1);
    }
  });

  it("names the line model it read, so a criterion can turn red when the writer and the reader drift apart", () => {
    // Asserted about the bytes rather than about the reader: the line is 16 bytes, the first continuation's byte 7 is
    // `0x89`, a score-symbol continuation has its top bit set, and a head line does not.
    expect(NOTE_FORM.lineSize).toBe(16);
    expect(NOTE_FORM.dataLine).toBe(0x89);
    expect(eventSize(0)).toBe(16);
    expect(eventSize(1)).toBe(32);
    expect(eventSize(2)).toBe(48);
    expect(eventSize(3)).toBe(64);
    expect(eventSize(4)).toBe(80);
    expect(eventSize(5)).toBe(96);

    const bare = buildNoteEvent({ pitch: 60, continuations: 0 });
    expect(bare.length).toBe(16);
    expect(bare[7]! & 0x80).toBe(0);

    const three = buildNoteEvent({ pitch: 60, lengthTicks: 480, continuations: 3 });
    expect(three.length).toBe(64);
    expect(three[7]! & 0x80).toBe(0); // the head line opens the event
    expect(three[16 + 7]!).toBe(0x89); // the first continuation carries the length
    expect(three[32 + 7]! & 0x80).toBe(0x80); // a score-symbol atom
    expect(three[48 + 7]! & 0x80).toBe(0x80);
  });

  it("reports a bare 16-byte note as zero length rather than hiding it", () => {
    /**
     * An event with no continuation has no length field, so its length is not "whatever the next four bytes say". The
     * reader answers zero and **says so** in `problems`, which is the difference between an honest limit and a silent
     * wrong number.
     */
    const project = buildLogicProjectDataLines({
      bpm: 120,
      regions: [{ name: "Bare", notes: [{ startTicks: 0, pitch: 60, lengthTicks: 960, continuations: 0 }] }],
    });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
    expect(imported.parts[0]!.notes).toEqual([{ startBeats: 0, lengthBeats: 0, pitch: 60, velocity: 100 }]);
    expect(imported.problems.join("\n")).toContain("zero ticks");
  });

  it("keeps reading the tick resolution every length shares", () => {
    // Logic counts 960 ticks per quarter whatever the continuation count, so a note written 480 ticks after its
    // region's start is half a beat. A reader that divided by the wrong resolution would move every note.
    const imported = fromLogicProject({ projectData: projectWithEveryLength(), metaData: buildMetaDataPlist({}) });
    expect(LOGIC_TICKS_PER_QUARTER).toBe(960);
    for (const part of imported.parts) expect(part.notes[1]!.startBeats * LOGIC_TICKS_PER_QUARTER).toBe(480);
  });

  it("reports the meter the project states rather than a default, in the line model too", () => {
    /**
     * `3/4` is written into the signature header's own bytes, and this is the criterion that separates "read the
     * value" from "fell back to 4/4": a reader that never finds the signature sequence answers `4/4` here and is
     * wrong, and one that defaults would answer `4/4` and pass a `4/4` fixture. The two fixtures are read together
     * for exactly that reason.
     */
    const threeFour = buildLogicProjectDataLines({
      bpm: 120,
      timeSignature: { numerator: 3, denominator: 4 },
      regions: [{ name: "Waltz", notes: [{ startTicks: 0, pitch: 60, velocity: 100, lengthTicks: 960, continuations: 2 }] }],
    });
    expect(fromLogicProject({ projectData: threeFour, metaData: buildMetaDataPlist({}) }).timeSignature).toBe("3/4");

    const sevenEight = buildLogicProjectDataLines({
      bpm: 120,
      timeSignature: { numerator: 7, denominator: 8 },
      regions: [{ name: "Seven", notes: [{ startTicks: 0, pitch: 60, velocity: 100, lengthTicks: 480, continuations: 4 }] }],
    });
    expect(fromLogicProject({ projectData: sevenEight, metaData: buildMetaDataPlist({}) }).timeSignature).toBe("7/8");
  });

  it("keeps reading the tempo of a line-model project, which the region reading must not take down with it", () => {
    // ⚠️ **This one was already green and is a guard, not a fix** — said plainly so nobody reads it as one. The tempo
    // comes from the `gnoS` slot and never from a region.
    const imported = fromLogicProject({ projectData: projectWithEveryLength(137.5), metaData: buildMetaDataPlist({}) });
    expect(imported.tempoBpm).toBe(137.5);
  });

  it("leaves the specification's 32-byte reading exactly where it was", () => {
    /**
     * ⭐ **This is the criterion that protects the pinned numbers.** `logicFixtures.test.ts` pins real projects to
     * note counts, and the specification's own writer emits 32-byte notes. The line model must read those byte for
     * byte as the old 32-byte branch did.
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
      projectData: projectWithEveryLength(120),
      metaData: buildBinaryPlistReal("BeatsPerMinute", 120),
    });
    expect(agreeing.tempoBpm).toBe(120);
    expect(agreeing.problems.some((problem) => problem.includes("MetaData.plist says"))).toBe(false);

    const disagreeing = fromLogicProject({
      projectData: projectWithEveryLength(120),
      metaData: buildBinaryPlistReal("BeatsPerMinute", 128),
    });
    expect(disagreeing.tempoBpm).toBe(120);
    const sentence = disagreeing.problems.find((problem) => problem.includes("MetaData.plist says"));
    expect(sentence).toBeDefined();
    expect(sentence).toContain("128");
    expect(sentence).toContain("120");
  });
});
