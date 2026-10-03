/**
 * The owner's **eight official Logic Pro projects**, measured — the reading that shows what the 16-byte line model
 * changed, and the two numbers that must not be confused with each other.
 *
 * Two readings are taken side by side, and the difference between them is the point of this file:
 *
 *   1. **`probeLines`** — every head line of every `qSvE` that opens with a `0x90` first byte. This reproduces the
 *      research probe's reading: `Swing!` 2903, `Manzana` 1137, `Colors` 2868, `ocean eyes` 1729, `MONTERO` 7,
 *      `Grid` 0. It runs here on its own framing, independent of the product reader, so the numbers are checked
 *      rather than restated.
 *   2. **`noteLines`** — every head line whose status is a **note** (`0x90`..`0x9F`), over every sequence that opens
 *      with one. This is what the product reads, and it is computed here independently of it as well.
 *
 * The two differ for two measured reasons, and both are asserted rather than described: `Colors` holds 861 `0xE0`
 * pitch-bend head lines beside its notes and `ocean eyes` 314 `0xB0` controller lines (the first reading counted those
 * as notes); and the first reading's "first byte is exactly `0x90`" filter drops **29 `Manzana` regions whose first
 * event is on channels 1..6**, which is why its note reading is *lower* there, not higher.
 *
 * **No project is committed, vendored or snapshotted here.** They are read from a directory outside the checkout and
 * this whole file **skips loudly** when it is not there, exactly as `logicFixtures.test.ts` does for the textbook set.
 *
 *   GROOVE_LOGIC_CORPUS   the directory holding `*.logicx`, defaulting to `/home/crow/music/midi-corpus/LogicPro`
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { activeVariant, fromLogicProject } from "../data/logicToArrangement";

const DIR = process.env.GROOVE_LOGIC_CORPUS ?? "/home/crow/music/midi-corpus/LogicPro";
const present = existsSync(DIR) && readdirSync(DIR).some((name) => name.endsWith(".logicx"));

const HEADER = 0x24;
const LINE = 16;

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

interface RawRecord {
  tag: string;
  /** The record **including** its 36-byte header, the offsets the format counts from. */
  payload: Uint8Array;
}

/** The record walk, written here so the reproduction does not depend on the reader it is checking. */
function rawRecords(bytes: Uint8Array): RawRecord[] {
  const out: RawRecord[] = [];
  let off = 0x18;
  while (off + HEADER <= bytes.length) {
    const tag = String.fromCharCode(bytes[off]!, bytes[off + 1]!, bytes[off + 2]!, bytes[off + 3]!);
    const size = u32(bytes, off + 0x1c);
    const end = off + HEADER + size;
    if (end > bytes.length || size > bytes.length) break;
    out.push({ tag, payload: bytes.subarray(off, end) });
    off = end;
  }
  return out;
}

/** Every head line of a payload, with the status byte it opens with. The line model, read from the bytes. */
function headLines(body: Uint8Array): { status: number; continuations: number }[] {
  const out: { status: number; continuations: number }[] = [];
  let at = 0;
  while (at + LINE <= body.length) {
    const line = body.subarray(at, at + LINE);
    if (u16(line, 0) === 0xf1) break;
    if ((line[7]! & 0x80) !== 0) break;
    let next = at + LINE;
    while (next + LINE <= body.length && (body[next + 7]! & 0x80) !== 0) next += LINE;
    out.push({ status: line[0]!, continuations: (next - at) / LINE - 1 });
    at = next;
  }
  return out;
}

interface Measurement {
  /** The probe's reading: every head line of every `qSvE` that opens with `0x90`. */
  probeLines: number;
  /** The notes: every `0x9x` head line, over every sequence that opens with one. */
  noteLines: number;
  /** Continuation-count histogram of the probe's head-line set — the research's own histogram. */
  probeContinuations: Record<number, number>;
  /** Continuation-count histogram of the note lines, so the shape of the corrected reading is visible. */
  noteContinuations: Record<number, number>;
  /** Head lines of the **probe's** sequence set whose status is not a note, by status. */
  probeNonNote: Record<string, number>;
  /** Note sequences whose first head line is **not** on channel 0 — the ones the probe's filter drops. */
  offChannelSequences: number;
  /** How many note lines those dropped sequences hold. */
  offChannelNoteLines: number;
}

function measure(bytes: Uint8Array): Measurement {
  const out: Measurement = {
    probeLines: 0,
    noteLines: 0,
    probeContinuations: {},
    noteContinuations: {},
    probeNonNote: {},
    offChannelSequences: 0,
    offChannelNoteLines: 0,
  };
  for (const record of rawRecords(bytes)) {
    if (record.tag !== "qSvE" || record.payload.length < HEADER + LINE) continue;
    const body = record.payload.subarray(HEADER);
    const lines = headLines(body);
    if (lines.length === 0) continue;
    const first = lines[0]!.status;
    if ((first & 0xf0) === 0x90) {
      for (const line of lines) {
        if ((line.status & 0xf0) === 0x90) {
          out.noteLines += 1;
          out.noteContinuations[line.continuations] = (out.noteContinuations[line.continuations] ?? 0) + 1;
        }
      }
    }
    if (first === 0x90) {
      out.probeLines += lines.length;
      for (const line of lines) {
        out.probeContinuations[line.continuations] = (out.probeContinuations[line.continuations] ?? 0) + 1;
        if ((line.status & 0xf0) !== 0x90) {
          const key = `0x${line.status.toString(16)}`;
          out.probeNonNote[key] = (out.probeNonNote[key] ?? 0) + 1;
        }
      }
    } else if ((first & 0xf0) === 0x90) {
      out.offChannelSequences += 1;
      out.offChannelNoteLines += lines.filter((line) => (line.status & 0xf0) === 0x90).length;
    }
  }
  return out;
}

/**
 * The alternative the project is on.
 *
 * `ActiveVariant` is an **integer** in these real files (`4`, `0`, …) while the directory is zero-padded (`004`,
 * `000`), so the name is matched by value rather than by string — measured here, and worth knowing before wiring
 * `activeVariant`'s answer straight into a path.
 */
function alternativeOf(bundle: string): string {
  const directories = readdirSync(join(DIR, bundle, "Alternatives"));
  const info = join(DIR, bundle, "Resources", "ProjectInformation.plist");
  if (existsSync(info)) {
    const variant = activeVariant(new Uint8Array(readFileSync(info)));
    if (variant !== undefined) {
      const match =
        directories.find((name) => name === variant) ??
        directories.find((name) => Number(name) === Number(variant));
      if (match !== undefined) return match;
    }
  }
  return directories[0] ?? "000";
}

function read(bundle: string): { projectData: Uint8Array; metaData: Uint8Array; alternative: string } {
  const alternative = alternativeOf(bundle);
  return {
    alternative,
    projectData: new Uint8Array(readFileSync(join(DIR, bundle, "Alternatives", alternative, "ProjectData"))),
    metaData: new Uint8Array(readFileSync(join(DIR, bundle, "Alternatives", alternative, "MetaData.plist"))),
  };
}

/**
 * The official corpus, as measured with the 16-byte line model (2026-10-03, this machine).
 *
 * `noteContinuations` are the histograms the research reported: `Swing!` `{2: 596, 3: 738, 4: 1569}`,
 * `Manzana` `{1: 34, 2: 65, 3: 5, 4: 197, 5: 836}`, `Colors` `{1: 2007}`, `ocean eyes` `{1: 1415}`.
 */
/**
 * The official corpus, as measured with the 16-byte line model (2026-10-03, this machine).
 *
 * `probeContinuations` is the histogram the research reported; `noteContinuations` is the same histogram over the
 * note lines only. They differ exactly where the readings differ, which is what makes the correction checkable.
 */
const CORPUS: Record<string, Partial<Measurement> & { notes: number }> = {
  "Swing!.logicx": {
    probeLines: 2903,
    noteLines: 2903,
    probeContinuations: { 2: 596, 3: 738, 4: 1569 },
    noteContinuations: { 2: 596, 3: 738, 4: 1569 },
    notes: 2903,
  },
  "Manzana.logicx": {
    probeLines: 1137,
    noteLines: 1369,
    probeContinuations: { 1: 34, 2: 65, 3: 5, 4: 197, 5: 836 },
    noteContinuations: { 1: 34, 2: 66, 3: 5, 4: 428, 5: 836 },
    offChannelSequences: 29,
    offChannelNoteLines: 232,
    notes: 1369,
  },
  "Manzana - Spatial Audio.logicx": { probeLines: 1137, noteLines: 1369, notes: 1369 },
  "Colors.logicx": {
    probeLines: 2868,
    noteLines: 2007,
    probeContinuations: { 0: 861, 1: 2007 },
    noteContinuations: { 1: 2007 },
    probeNonNote: { "0xe0": 861 },
    notes: 2007,
  },
  "ocean eyes.logicx": {
    probeLines: 1729,
    noteLines: 1415,
    probeContinuations: { 0: 264, 1: 1465 },
    noteContinuations: { 1: 1415 },
    probeNonNote: { "0xb0": 314 },
    notes: 1415,
  },
  "MONTERO.logicx": { probeLines: 7, noteLines: 7, probeContinuations: { 2: 7 }, noteContinuations: { 2: 7 }, notes: 7 },
  "MONTERO - Spatial Audio.logicx": { probeLines: 7, noteLines: 7, notes: 7 },
  "Spatial Audio Demo Grid.logicx": {
    probeLines: 0,
    noteLines: 0,
    probeContinuations: {},
    noteContinuations: {},
    notes: 0,
  },
};

describe.skipIf(!present)("the owner's official projects, under the 16-byte line model", () => {
  it("reproduces the probe's head-line reading, and names what the note reading leaves out", () => {
    const missing = Object.keys(CORPUS).filter((bundle) => !existsSync(join(DIR, bundle)));
    expect(missing, `the corpus is missing ${missing.join(", ")}`).toEqual([]);

    for (const [bundle, expected] of Object.entries(CORPUS)) {
      const { projectData, metaData, alternative } = read(bundle);
      const measured = measure(projectData);
      const imported = fromLogicProject({ projectData, metaData });
      const notes = imported.parts.reduce((sum, part) => sum + part.notes.length, 0);
      console.log(
        `   ${bundle}/${alternative}: probe head lines ${measured.probeLines}, note head lines ${measured.noteLines}, ` +
          `notes read ${notes}, parts ${imported.parts.length}, probe continuations ${JSON.stringify(measured.probeContinuations)}, ` +
          `note continuations ${JSON.stringify(measured.noteContinuations)}`
      );

      expect(measured.probeLines, `${bundle}: the probe's head-line reading`).toBe(expected.probeLines);
      expect(measured.noteLines, `${bundle}: the note head lines, read independently`).toBe(expected.noteLines);
      expect(notes, `${bundle}: the notes the product reads`).toBe(expected.notes);
      if (expected.probeContinuations !== undefined) {
        expect(measured.probeContinuations, `${bundle}: the research's continuation histogram`).toEqual(
          expected.probeContinuations
        );
      }
      if (expected.noteContinuations !== undefined) {
        expect(measured.noteContinuations, `${bundle}: continuation histogram of the note lines`).toEqual(
          expected.noteContinuations
        );
      }
      if (expected.probeNonNote !== undefined) {
        expect(measured.probeNonNote, `${bundle}: the non-note head lines the probe counted`).toEqual(expected.probeNonNote);
      }
      if (expected.offChannelSequences !== undefined) {
        expect(measured.offChannelSequences, `${bundle}: sequences the 0x90-only filter drops`).toBe(
          expected.offChannelSequences
        );
        expect(measured.offChannelNoteLines, `${bundle}: notes those sequences hold`).toBe(expected.offChannelNoteLines);
      }
    }
  });

  it("reads a real project's own report and meter without moving them", () => {
    // Guards, not fixes: the tempo and the meter come from `gnoS` and the signature header, and the rebuild must not
    // have taken them down with the note framing. Values are the ones `docs/OPEN_WORK.md` §132 records.
    const expected: Record<string, { tempo: number; meter: string }> = {
      "Swing!.logicx": { tempo: 115, meter: "4/4" },
      "Colors.logicx": { tempo: 120, meter: "4/4" },
      "ocean eyes.logicx": { tempo: 145, meter: "4/4" },
      "MONTERO.logicx": { tempo: 179, meter: "4/4" },
      "Manzana.logicx": { tempo: 146, meter: "4/4" },
      "Spatial Audio Demo Grid.logicx": { tempo: 120, meter: "4/4" },
    };
    for (const [bundle, want] of Object.entries(expected)) {
      const { projectData, metaData } = read(bundle);
      const imported = fromLogicProject({ projectData, metaData });
      expect(imported.tempoBpm, bundle).toBe(want.tempo);
      expect(imported.timeSignature, bundle).toBe(want.meter);
    }
  });
});
