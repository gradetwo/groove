/**
 * **A bar that does not add up is a drawing, not an error.**
 *
 * The defect these criteria exist for was reported from the field: opening the Score tab on `/new` printed
 * `[RuntimeError] IncompleteVoice: Voice does not have enough notes.` The starter content of every new track is
 * four sixteenths, one per beat — one beat of notes in a 4/4 bar — and the score built a STRICT four-beat voice
 * from them, so VexFlow's `Formatter.getResolutionMultiplier` refused the voice before anything was engraved.
 *
 * Two things are checked here and neither needs a browser:
 *
 * 1. the **arithmetic** — `planMeasure` writes the silence that completes the bar and never drops a note;
 * 2. the **library's own verdict** — the entries it returns are handed to the real `vexflow/core` `Voice` and
 *    `Formatter`, which is where the original error was thrown. A mock cannot prove this: the throw is in the
 *    library's tick check, so the criterion has to use the library.
 */
import { describe, expect, it } from "vitest";
import { planMeasure, restsFor } from "../components/arrangement/ScoreV2";
import type { NoteEvent } from "../types/arrangementV2";

const note = (pitch: number, startBeats: number, lengthBeats = 0.25): NoteEvent => ({
  pitch,
  startBeats,
  lengthBeats,
  velocity: 100,
});

/** The starter content of every new track: `defaultContentFor`'s `steps(4)`, one sixteenth on each beat. */
const starter = () => [note(60, 0), note(60, 1), note(60, 2), note(60, 3)];

describe("the rests that fill a bar", () => {
  it("writes whole beats as quarter rests and the remainder as the plain rest a reader expects", () => {
    expect(restsFor(0)).toEqual([]);
    expect(restsFor(0.25)).toEqual([{ duration: "16r", dots: 0 }]);
    expect(restsFor(0.5)).toEqual([{ duration: "8r", dots: 0 }]);
    expect(restsFor(0.75)).toEqual([{ duration: "8r", dots: 1 }]);
    expect(restsFor(1)).toEqual([{ duration: "qr", dots: 0 }]);
    expect(restsFor(2.5)).toEqual([{ duration: "qr", dots: 0 }, { duration: "qr", dots: 0 }, { duration: "8r", dots: 0 }]);
    expect(restsFor(3.75)).toEqual([
      { duration: "qr", dots: 0 },
      { duration: "qr", dots: 0 },
      { duration: "qr", dots: 0 },
      { duration: "8r", dots: 1 },
    ]);
  });

  it("never returns a rest longer than the gap, and always exactly the gap", () => {
    const value = (duration: string, dots: number) => ({ qr: 1, "8r": 0.5, "16r": 0.25 }[duration] ?? 0) * (dots ? 1.5 : 1);
    for (let beats = 0.25; beats <= 4; beats += 0.25) {
      const total = restsFor(beats).reduce((sum, rest) => sum + value(rest.duration, rest.dots), 0);
      expect(total, `gap of ${beats} beats`).toBeCloseTo(beats, 9);
    }
  });
});

describe("a bar of the score", () => {
  it("fills the rest of the bar with rests, and keeps every note the model holds", () => {
    const plan = planMeasure(starter(), 0, true);
    expect(plan.complete).toBe(true);
    const notes = plan.entries.filter((entry) => entry.kind === "note");
    // ⭐ No silent loss: four notes in, four notes written.
    expect(notes.map((entry) => entry.pitches)).toEqual([[60], [60], [60], [60]]);
    expect(notes.map((entry) => entry.duration)).toEqual(["16", "16", "16", "16"]);
    // And the silence is written: 0.75 beats of rest after each sixteenth, which is what completes the bar.
    expect(plan.entries.filter((entry) => entry.kind === "rest")).toHaveLength(4);
  });

  it("writes the written entries as exactly one bar", () => {
    const written = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, qr: 1, "8r": 0.5, "16r": 0.25 } as Record<string, number>;
    for (const notes of [starter(), [note(60, 0, 2), note(62, 2, 1.5)], [note(72, 0), note(48, 0)]]) {
      const plan = planMeasure(notes, 0, true);
      const total = plan.entries.reduce(
        (sum, entry) => sum + (written[entry.duration] ?? 0) * (entry.dots ? 1.5 : 1),
        0
      );
      expect(total, JSON.stringify(notes)).toBeCloseTo(4, 9);
    }
  });

  it("says a bar is complete only when it adds up; overlapping notes stay in the plan, unwritten-short", () => {
    // Two four-beat notes one beat apart cannot be one voice: the bar does not add up and must not pretend to.
    const overlap = planMeasure([note(60, 0, 4), note(62, 1, 4)], 0, true);
    expect(overlap.complete).toBe(false);
    expect(overlap.entries.filter((entry) => entry.kind === "note")).toHaveLength(2);
    // Rests are not invented for a bar that is over-full: they would be silence nobody played.
    expect(overlap.entries.some((entry) => entry.kind === "rest")).toBe(false);
  });

  it("keeps a note whose start is between grid lines rather than dropping it", () => {
    const plan = planMeasure([note(60, 0.3, 0.25)], 0, true);
    const notes = plan.entries.filter((entry) => entry.kind === "note");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.pitches).toEqual([60]);
  });

  it("reads only the bar and the stave it was asked for", () => {
    const plan = planMeasure([note(60, 0), note(48, 0), note(60, 4)], 0, true);
    expect(plan.entries.filter((entry) => entry.kind === "note")).toHaveLength(1);
    expect(planMeasure([note(60, 4)], 1, true).entries.filter((entry) => entry.kind === "note")).toHaveLength(1);
  });

  it("writes a whole rest for a bar with nothing in it", () => {
    expect(planMeasure([], 3, false).entries).toEqual([{ kind: "rest", duration: "wr", dots: 0, pitches: [] }]);
  });
});

describe("VexFlow's own verdict on the bar the plan describes", () => {
  /** The translation `ScoreV2` performs, without the font, the renderer or a DOM. */
  const voiceFor = async (entries: ReturnType<typeof planMeasure>["entries"], complete: boolean) => {
    const { Voice, StaveNote, Dot } = await import("vexflow/core");
    const tickables = entries.map((entry) => {
      const built = new StaveNote({
        keys: entry.kind === "rest" ? ["b/4"] : entry.pitches.map((pitch) => ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"][pitch % 12] + "/" + (Math.floor(pitch / 12) - 1)),
        duration: entry.duration,
        dots: entry.dots,
      });
      if (entry.dots > 0) Dot.buildAndAttach([built], { all: true });
      return built;
    });
    const voice = new Voice({ numBeats: 4, beatValue: 4 });
    if (!complete) voice.setStrict(false);
    voice.addTickables(tickables);
    return voice;
  };

  it("refuses the bar the defect built — one beat of notes in a strict four-beat voice", async () => {
    /**
     * The red half of the criterion, kept so the fix cannot be reverted quietly: this is the voice the old
     * `staffNotes` built, and the library rejects it with the error the user saw.
     */
    const { Voice, StaveNote, Formatter } = await import("vexflow/core");
    const oldVoice = new Voice({ numBeats: 4, beatValue: 4 });
    for (const note of starter()) oldVoice.addTickable(new StaveNote({ keys: ["c/4"], duration: "16" }));
    expect(() => new Formatter().joinVoices([oldVoice]).format([oldVoice], 200)).toThrow(/IncompleteVoice/);
  });

  it("accepts the completed bar, so the notes are engraved instead of reported", async () => {
    const { Formatter } = await import("vexflow/core");
    const plan = planMeasure(starter(), 0, true);
    const voice = await voiceFor(plan.entries, plan.complete);
    expect(() => new Formatter().joinVoices([voice]).format([voice], 200)).not.toThrow();
    // Every one of the four notes is still a tickable, and the rests are around them.
    expect(voice.getTickables()).toHaveLength(plan.entries.length);
  });

  it("accepts an over-full bar as a soft voice, because the notes are still there", async () => {
    const { Formatter } = await import("vexflow/core");
    const plan = planMeasure([note(60, 0, 4), note(62, 1, 4)], 0, true);
    const voice = await voiceFor(plan.entries, plan.complete);
    const formatter = new Formatter();
    expect(() => formatter.joinVoices([voice]).format([voice], 200)).not.toThrow();
    expect(voice.getTickables()).toHaveLength(2);
  });
});
