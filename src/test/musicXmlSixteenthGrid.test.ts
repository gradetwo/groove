/**
 * ⭐ **The sixteenth grid: what the reader must not move.**
 *
 * The reader quantises every note onto the model's own grid, and that grid is the **sixteenth** — the same unit
 * `ScoreV2.tsx` writes with (`WRITTEN_BEATS["16"] = 0.25`), the roll draws in (`STEP_BEATS`), and `PianoRollV2` scales
 * by. `musicxmlImport.ts` said so in its own comment and then used `1 / 2` for the two operations that depend on it,
 * which is the half-beat grid an **eighth** note lives on:
 *
 *   · `Math.round(startBeats / resolution) * resolution` — a sixteenth position collapses onto the eighth grid;
 *   · `Math.max(lengthBeats, resolution)` — a sixteenth length is raised to half a beat, exactly doubled.
 *
 * Both are **read-side fidelity losses**: the exported document is correct (`<duration>1</duration>` with
 * `<type>sixteenth</type>` at `divisions` 4), and what comes back is a different rhythm from the one that went out.
 * These criteria are written against the model's grid rather than against the reader's own arithmetic, so they fail
 * for the reason a person would hear rather than for the reason the implementation happens to have.
 *
 * The hand-written document is the second half: a shape another program writes, so the criterion is about MusicXML
 * rather than only about our own writer agreeing with our own reader.
 */
import { describe, expect, it } from "vitest";
import { fromMusicXml } from "../data/musicxmlImport";
import { toMusicXml } from "../data/musicxml";

const note = (pitch: number, startBeats: number, lengthBeats = 0.25) => ({ pitch, startBeats, lengthBeats, velocity: 100 });

/**
 * ⭐ **The model's own grid, stated once.** Every value below is a multiple of this, which is what makes "the reader
 * moved it" a defect rather than a rounding choice: there is nothing to round.
 */
const SIXTEENTH = 0.25;

/** A minimal document with a sixteenth note at a sixteenth position — `divisions` 4, `duration` 1. */
const sixteenthDocument = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Grid</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><rest/><duration>1</duration><type>16th</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>16th</type></note>
  </measure></part>
</score-partwise>`;

describe("the sixteenth grid the reader quantises onto", () => {
  it("reads a sixteenth note at a sixteenth position without moving either", () => {
    // The rest is one sixteenth, so the note is at beat 0.25 — a position the model can hold exactly.
    const notes = fromMusicXml(sixteenthDocument).parts[0]!.notes;
    expect(notes).toEqual([{ pitch: 62, startBeats: 0.25, lengthBeats: 0.25, velocity: 100 }]);
  });

  it("keeps every sixteenth position and sixteenth length through a round trip, value by value", () => {
    /**
     * The five values the measurement named, each on the model's own grid: a sixteenth at the bar line, one on the
     * second sixteenth, one on the fourth, plus an eighth and a sixteenth as the controls that must not move either.
     */
    const written = [note(60, 0), note(62, 0.25), note(65, 0.75), note(64, 0.5, 0.5), note(67, 1)];
    const read = fromMusicXml(toMusicXml(written, 2)).parts[0]!.notes;
    const byPitch = new Map(read.map((entry) => [entry.pitch, entry]));
    for (const original of written) {
      const back = byPitch.get(original.pitch);
      expect(back, `pitch ${original.pitch} came back`).toBeDefined();
      // ⭐ The two facts the half-beat grid destroyed, asserted separately so a red run names which one moved.
      expect({ pitch: original.pitch, startBeats: back!.startBeats }).toEqual({ pitch: original.pitch, startBeats: original.startBeats });
      expect({ pitch: original.pitch, lengthBeats: back!.lengthBeats }).toEqual({ pitch: original.pitch, lengthBeats: original.lengthBeats });
    }
  });

  it("carries a run of four sixteenths as four notes, which is the shape a half-beat grid flattens", () => {
    const run = [note(60, 0), note(62, SIXTEENTH), note(64, 2 * SIXTEENTH), note(65, 3 * SIXTEENTH)];
    const read = fromMusicXml(toMusicXml(run, 1)).parts[0]!.notes;
    expect(read.map((entry) => entry.startBeats)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(read.map((entry) => entry.lengthBeats)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  /**
   * ⚠️ **The floor is a floor, not a floor at an eighth.** A length shorter than the grid is raised to it — that is
   * the model refusing a position it cannot draw — but a note that already sits on the grid must pass through.
   */
  it("raises only a length below the grid, and leaves a sixteenth alone", () => {
    const read = fromMusicXml(toMusicXml([note(60, 0, 0.1), note(62, 0, 0.25)], 1)).parts[0]!.notes;
    // 0.1 is between grid positions, so the grid is what it becomes; 0.25 is already on it.
    expect(read.map((entry) => entry.lengthBeats).sort((a, b) => a - b)).toEqual([0.25, 0.25]);
  });
});
