import { describe, expect, it } from "vitest";
import { notesInBarRange } from "../../mcp/arrangement";
import type { NoteEvent } from "../../src/types/arrangementV2";

/**
 * ⭐ **Which notes sound inside a bar span, which is how a render covers part of an arrangement.**
 *
 * `render_arrangement` renders the whole thing and its `bars` argument is a pass count, so bars 8 to 16 of a long
 * piece cannot be asked for through MCP while the web has a loop range for the same job
 * (`docs/AUDITION_AUDIT.md` §5–6). The range belongs on the notes rather than on the flattened steps, because
 * `compileArrangementToSongInput` already builds clips from notes and re-deriving that mapping is how an
 * off-by-one-bar gets in.
 *
 * The criterion is the one written down before the code existed: one note in bar 1, one in bar 5, and the three
 * spans `[0,1)`, `[4,5)` and `[0,5)`. An implementation that loses a bar, or lets the end bar leak in, passes the
 * first two and fails the third.
 */
const note = (startBeats: number, lengthBeats: number): NoteEvent => ({ pitch: 60, startBeats, lengthBeats, velocity: 100 });
const starts = (kept: Record<string, NoteEvent[]>): number[] => (kept.lead ?? []).map((n) => n.startBeats);

/** Four beats to the bar, so bar 5 starts at beat 16. */
const BEATS_PER_BAR = 4;

describe("the notes that sound inside a bar span", () => {
  it("⭐ keeps exactly the bars asked for, with the end exclusive", () => {
    const all = { lead: [note(0, 1), note(16, 1), note(20, 1)] };

    expect(starts(notesInBarRange(all, { startBar: 0, endBar: 1 }, BEATS_PER_BAR))).toEqual([0]);
    expect(starts(notesInBarRange(all, { startBar: 4, endBar: 5 }, BEATS_PER_BAR))).toEqual([16]);
    // ⭐ The one an off-by-one-bar fails: the span ends before bar 6, so beat 20 is out.
    expect(starts(notesInBarRange(all, { startBar: 0, endBar: 5 }, BEATS_PER_BAR))).toEqual([0, 16]);
  });

  it("⭐ keeps a note that began earlier and is still sounding in the span", () => {
    // A pad starting in bar 4 and lasting four bars — exactly what someone auditions bars of.
    const all = { lead: [note(12, 16)] };

    expect(starts(notesInBarRange(all, { startBar: 4, endBar: 5 }, BEATS_PER_BAR))).toEqual([12]);
    expect(starts(notesInBarRange(all, { startBar: 5, endBar: 6 }, BEATS_PER_BAR))).toEqual([12]);
    // And it is out before it begins and after it ends, so the span is doing real work.
    expect(starts(notesInBarRange(all, { startBar: 0, endBar: 3 }, BEATS_PER_BAR))).toEqual([]);
    expect(starts(notesInBarRange(all, { startBar: 8, endBar: 9 }, BEATS_PER_BAR))).toEqual([]);
  });

  it("keeps the note's own start rather than clipping it to the span", () => {
    // ⭐ A preview has to sound what the arrangement says. A note re-started at the span's first beat would be a
    // different piece of music, so the original start survives into the render.
    const kept = notesInBarRange({ lead: [note(12, 16)] }, { startBar: 5, endBar: 6 }, BEATS_PER_BAR);
    expect(kept.lead![0]!.startBeats).toBe(12);
    expect(kept.lead![0]!.lengthBeats).toBe(16);
  });

  it("drops tracks with nothing in the span, and keeps the ones with something", () => {
    const all = { lead: [note(0, 1)], pad: [note(400, 4)] };
    const kept = notesInBarRange(all, { startBar: 0, endBar: 1 }, BEATS_PER_BAR);
    expect(Object.keys(kept)).toEqual(["lead"]);
  });

  it("refuses a range that does not end after it starts, rather than returning nothing", () => {
    // Silence would be indistinguishable from "that span is empty", which is a different fact.
    expect(() => notesInBarRange({}, { startBar: 4, endBar: 4 }, BEATS_PER_BAR)).toThrow(/end after it starts/);
    expect(() => notesInBarRange({}, { startBar: 4, endBar: 2 }, BEATS_PER_BAR)).toThrow(/end after it starts/);
    expect(() => notesInBarRange({}, { startBar: 0, endBar: 1 }, 0)).toThrow(/positive bar length/);
  });
});
