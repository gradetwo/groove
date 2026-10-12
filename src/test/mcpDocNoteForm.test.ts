/**
 * **The note form `docs/MCP.md` states for the Logic import, held against the bytes and the reader it describes.**
 *
 * `docs/MCP.md` is the MCP contract an agent reads, so its byte-level sentence about `qSvE` is a claim a reader acts
 * on. It carried a stale one — *"每个音符是 **32 字节事件**"* — after the reader was rebuilt on the 16-byte line model
 * (`95f459f`; `src/data/logicToArrangement.ts`'s `lineRun`): a `qSvE` payload is a sequence of 16-byte lines, a line
 * whose byte 7 has its top bit set continues the event before it, so an event is `16 × (N + 1)` bytes and a note's
 * length sits at `+12` of its **first continuation**, not in a fixed stride. A 32-byte sentence is not a smaller
 * version of that claim; it is a different format, and it is the format of a reader this repository no longer has.
 *
 * ## What this file pins, and against what
 *
 * The shape is `sampledRangeCensus.test.ts`'s `<!-- census-current -->` case: the document carries a marked line and
 * this case reads it back. The part that matters is **what the marked numbers are compared against** — not another
 * document, and not a copy of the sentence. They are re-derived here from the implementation:
 *
 *   1. **the sizes** are the byte lengths `buildNoteEvent` writes and `fromLogicProject` reads for N = 0…5, so a
 *      reader that only knew one stride could not agree with the document;
 *   2. **the note statuses** are the status bytes the reader returns a note for, swept over **the whole byte**, so
 *      "`0x90`..`0x9F`" is the reader's answer rather than a table copied out of `logicNoteForm.test.ts`;
 *   3. **the non-note head lines** are statuses whose byte 7 has the continuation bit clear — a head line — and which
 *      the reader answers with **no** note. `0xB0`/`0xC0`/`0xE0` are the three the document names (the controller,
 *      program-change and pitch-bend statuses `logicxkit`'s `midi.py` table gives).
 *
 * The prose is checked as prose: the sentence must state the line model, the continuation rule, where the length
 * lives, that a head line is not a note, and that the continuation semantics are **unverified**. ⭐ Reverting the
 * sentence to the old "每个音符是 32 字节事件" turns this file red — measured, not assumed.
 *
 * Every byte below is written by the repository's own fixture (`src/test/fixtures/logic_note_form.mjs`); no real
 * project is committed or used as a snapshot.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fromLogicProject, LOGIC_TICKS_PER_QUARTER } from "../data/logicToArrangement";
import { buildMetaDataPlist } from "./fixtures/logic_project.mjs";
import { buildLogicProjectDataLines, buildNoteEvent, eventSize, NOTE_FORM } from "./fixtures/logic_note_form.mjs";
import type { LogicLineModelNote } from "./fixtures/logic_note_form.mjs";

const DOC = readFileSync("docs/MCP.md", "utf8");

/** The marker `docs/MCP.md` carries under the Logic note sentence; the criterion reads the line below it. */
const MARKER = "<!-- logic-note-form -->";

/** The continuation counts a real project uses — the corpus histogram's own N, 0 through 5. */
const CONTINUATIONS = [0, 1, 2, 3, 4, 5];

/** The three head-line statuses the document names as **not** notes: controller, program change, pitch bend. */
const NON_NOTE_HEAD_LINES = [0xb0, 0xc0, 0xe0];

/** The marked line, in the shape `docs/MCP.md` carries it. */
const MARKED = new RegExp(
  MARKER +
    "\\s*\\n\\s*>?\\s*`line=(\\d+); sizes=([\\d,]+); note-status=0x([0-9a-f]+)\\.\\.0x([0-9a-f]+); head-line-not-note=([0-9a-fx,]+)`"
);

/** One project holding exactly `notes`, read back through the product reader. */
function notesFor(notes: LogicLineModelNote[]) {
  const project = buildLogicProjectDataLines({ bpm: 120, regions: [{ name: "Doc", notes }] });
  return fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) }).parts[0]?.notes ?? [];
}

/** Whether the reader returns one note for an event that opens with `status`. */
function readsOneNote(status: number): boolean {
  return notesFor([{ startTicks: 0, pitch: 60, velocity: 100, lengthTicks: 480, continuations: 1, status }]).length === 1;
}

/** Every status byte the reader returns a note for — the whole byte range, not a table of the expected ones. */
const MEASURED_NOTE_STATUSES = Array.from({ length: 256 }, (_, status) => status).filter(readsOneNote);

describe("docs/MCP.md · the Logic note form, against the reader it describes", () => {
  it("reads a note at every length the document states, and the sizes are the bytes rather than a constant", () => {
    /**
     * The document lists `16, 32, 48, 64, 80, 96`. Those are not asserted as a literal here: each one is built by the
     * fixture, measured as a byte length, and then read back through `fromLogicProject`, so a reader that knew only
     * a 32-byte stride would fail the same case the document would be lying in.
     */
    for (const n of CONTINUATIONS) {
      const size = eventSize(n);
      expect(size, `N=${n}: the line model's own size`).toBe(NOTE_FORM.lineSize * (n + 1));
      expect(buildNoteEvent({ pitch: 60, continuations: n }).length, `N=${n}: the bytes written`).toBe(size);
      const notes = notesFor([{ startTicks: 0, pitch: 60 + n, velocity: 100, lengthTicks: 240 * (n + 1), continuations: n }]);
      expect(notes.length, `N=${n}: the reader reads the event`).toBe(1);
      expect(notes[0]).toMatchObject({ pitch: 60 + n, velocity: 100 });
      // The length lives at the first continuation's `+12`; a bare 16-byte event has no length field at all.
      expect(notes[0]!.lengthBeats, `N=${n}: the length`).toBe(n === 0 ? 0 : (240 * (n + 1)) / LOGIC_TICKS_PER_QUARTER);
    }
    expect(NOTE_FORM.lineSize).toBe(16);
  });

  it("derives the note statuses and the non-note head lines from the reader, not from the document", () => {
    // 0x90..0x9F, one status per MIDI channel — the reader's answer over the whole byte.
    expect(MEASURED_NOTE_STATUSES).toHaveLength(16);
    expect(MEASURED_NOTE_STATUSES[0]).toBe(0x90);
    expect(MEASURED_NOTE_STATUSES[MEASURED_NOTE_STATUSES.length - 1]).toBe(0x9f);
    for (const status of NON_NOTE_HEAD_LINES) {
      // A head line: its byte 7 has the continuation bit clear, so it opens an event...
      expect(buildNoteEvent({ pitch: 60, continuations: 1, status })[7]! & 0x80, `0x${status.toString(16)} is a head line`).toBe(0);
      // ...and the reader answers it with no note, which is the half a count of every line gets wrong.
      expect(readsOneNote(status), `0x${status.toString(16)} is not a note`).toBe(false);
    }
  });

  it("⭐ pins the sentence docs/MCP.md carries to the form this reader implements", () => {
    /**
     * ⭐ **The criterion.** The marked numbers are compared with the derivation above; the prose above them is
     * required to state the same five things. Either side moving alone is a red: the document cannot claim a form the
     * reader does not implement, and the reader cannot change shape without the contract moving with it.
     */
    const marked = MARKED.exec(DOC);
    expect(marked, `docs/MCP.md no longer carries the \`${MARKER}\` marker`).not.toBeNull();
    const [, line, sizes, low, high, headLines] = marked!;
    expect(Number(line)).toBe(NOTE_FORM.lineSize);
    expect(sizes!.split(",").map(Number)).toEqual(CONTINUATIONS.map((n) => eventSize(n)));
    expect([parseInt(low!, 16), parseInt(high!, 16)]).toEqual([
      MEASURED_NOTE_STATUSES[0],
      MEASURED_NOTE_STATUSES[MEASURED_NOTE_STATUSES.length - 1],
    ]);
    expect(headLines!.split(",").map((value) => parseInt(value, 16))).toEqual(NON_NOTE_HEAD_LINES);

    // The prose above the marker is what a reader actually reads, so it is asserted as prose too.
    const bullet = /\* \*\*音符\*\*：([\s\S]*?)<!-- logic-note-form -->/.exec(DOC);
    expect(bullet, "docs/MCP.md has no `* **音符**：` bullet above the marker").not.toBeNull();
    const prose = bullet![1]!;
    /**
     * ⭐ **The reverse of the criterion, asserted first so a revert names itself.**
     *
     * The stale line read `每个音符是 **32 字节事件**`. Pasting it back with the marker line left intact — the harder
     * case, since the marked numbers still agree — is red on this assertion, so the contract cannot drift back to the
     * fixed-stride reading this repository's reader no longer has. Measured by reverting the bullet and running this
     * file; with the marker gone as well, the null check above is the red.
     */
    expect(prose, "docs/MCP.md 又把音符写回定长 32 字节事件").not.toMatch(/每个音符是\s*\*{0,2}32 字节/);
    expect(prose).toContain("16 字节行");
    expect(prose).toMatch(/继续前一个事件/);
    expect(prose).toMatch(/16 × \(N \+ 1\)/);
    expect(prose).toContain("+12");
    expect(prose).toMatch(/只在存在续行时才读/);
    expect(prose).toMatch(/头行\s*≠\s*音符/);
    expect(prose).toMatch(/未核实/);
    // The line model is not claimed as a reading of the 32-byte specification, which does not contain it.
    expect(prose).toContain("jonkubis/logicproformatwriter");
    expect(prose).toContain("不声称");
  });
});
