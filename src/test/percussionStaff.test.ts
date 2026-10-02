/**
 * **A drum part's pitch is which instrument, and these are the criteria that say so.**
 *
 * Two halves, and the split is the point:
 *
 * 1. **the table and the arithmetic**, which are pure and need no renderer — every row's line asserted, the two
 *    voices, the chords, the fallback and the notice;
 * 2. **the library's own verdict**, with the **real** `vexflow/core`: the keys this table produces become
 *    `StaveNote`s under a `percussion` clef, VexFlow is asked whether they land on the lines the table claims, and
 *    the two voices are handed to one `Formatter` — which is also where the defect this workstream started from was
 *    thrown.
 *
 * The **red half** is kept, as `scoreRhythm.test.ts` keeps its own: the drum bar written the old way — a pitched
 * stave, no rests, a STRICT voice — is refused by the library with the error the field report quoted, so the fix
 * cannot be reverted quietly.
 */
import { describe, expect, it } from "vitest";
import {
  PERCUSSION_FALLBACK,
  PERCUSSION_VOICES,
  PERCUSSION_VOICE_ORDER,
  percussionPlacementFor,
  percussionPlanNotices,
  percussionVoiceAtKey,
  percussionVoiceFor,
  planPercussionMeasure,
} from "../components/arrangement/percussionStaff";
import { durationName, planMeasure, restsFor, writtenBeats } from "../components/arrangement/ScoreV2";
import type { NoteEvent } from "../types/arrangementV2";

/** The rhythm the notation component passes in, so this module never has to import it. */
const rhythm = { durationName, writtenBeats, restsFor };

const note = (pitch: number, startBeats: number, lengthBeats = 0.25): NoteEvent => ({ pitch, startBeats, lengthBeats, velocity: 100 });

/** What a written entry is worth in beats — the same arithmetic the score uses, stated here so a total can be asserted. */
const beatsOf = (duration: string, dots: number) => writtenBeats(duration.replace(/r$/, ""), dots);

/** The two voices of one bar, which is the shape the score draws. */
const planBar = (notes: readonly NoteEvent[], measureIndex = 0) => planPercussionMeasure(notes, measureIndex, 4, rhythm);

/** Every note entry of every voice — what a reader sees on the stave, whichever line it is on. */
const noteEntries = (bar: ReturnType<typeof planBar>) => bar.flatMap((voice) => voice.entries.filter((entry) => entry.kind === "note"));

/** The total written length of one voice, so "the bar adds up" is a number rather than an impression. */
const voiceTotal = (voice: ReturnType<typeof planBar>[number]) =>
  voice.entries.reduce((sum, entry) => sum + beatsOf(entry.duration, entry.dots), 0);

/** One bar as the component builds it, against the **real** library. */
async function voicesFor(bar: ReturnType<typeof planBar>, beatsPerBar = 4) {
  const { Voice, StaveNote, Dot } = await import("vexflow/core");
  return bar.map((plan) => {
    const tickables = plan.entries.map((entry) => {
      const built = new StaveNote({
        keys: entry.kind === "rest" ? ["b/4"] : entry.keys,
        duration: entry.duration,
        dots: entry.dots,
        clef: "percussion",
        stemDirection: plan.stems === "up" ? 1 : -1,
      });
      if (entry.dots > 0) Dot.buildAndAttach([built], { all: true });
      return built;
    });
    const voice = new Voice({ numBeats: beatsPerBar, beatValue: 4 });
    if (!plan.complete) voice.setStrict(false);
    voice.addTickables(tickables);
    return { plan, voice, tickables };
  });
}

describe("the table from a General MIDI note to a position", () => {
  it("places kick, snare, hi-hat and shaker where the specification's rows put them", () => {
    /**
     * The four rows `DRUM_ROLE_NOTES` in `src/audio/drumRoles.ts` names, and the position each one takes from
     * MusicXML's percussion tutorial read under a percussion clef. Asserted per row and not as a set, so a row that
     * moves is a failure that names itself.
     */
    expect(percussionPlacementFor(36).key).toBe("f/4");
    expect(percussionPlacementFor(38).key).toBe("c/5");
    expect(percussionPlacementFor(42).key).toBe("g/5/x2");
    expect(percussionPlacementFor(82).key).toBe("a/5/x2");
    for (const note of [36, 38, 42, 82]) expect(percussionPlacementFor(note).mapped).toBe(true);
  });

  it("gives the two cymbals the x notehead and the two drums a solid one", () => {
    // The x head is what tells a reader "metal" rather than "drum head"; it is the part of the key VexFlow reads.
    expect(percussionPlacementFor(42).notehead).toBe("x2");
    expect(percussionPlacementFor(82).notehead).toBe("x2");
    expect(percussionPlacementFor(36).notehead).toBeUndefined();
    expect(percussionPlacementFor(38).notehead).toBeUndefined();
  });

  it("puts the cymbals in voice 1 (stems up) and the drums in voice 2 (stems down)", () => {
    for (const note of [42, 82]) expect(percussionPlacementFor(note).voiceIndex).toBe(1);
    for (const note of [36, 38]) expect(percussionPlacementFor(note).voiceIndex).toBe(2);
    expect(PERCUSSION_VOICE_ORDER).toEqual([
      { voice: 1, stems: "up" },
      { voice: 2, stems: "down" },
    ]);
    for (const voice of PERCUSSION_VOICES) {
      expect(voice.voice === 1 ? "up" : "down").toBe(
        PERCUSSION_VOICE_ORDER.find((order) => order.voice === voice.voice)!.stems
      );
    }
  });

  it("keeps the two halves of the mapping keyed by one number: a role's note is a row here", () => {
    /**
     * `DRUM_ROLE_NOTES` is the role→note half and this file is the note→stave half. A row on one side with no row
     * on the other is the drift this criterion exists to catch, so the numbers are compared, not restated.
     */
    expect(PERCUSSION_VOICES.map((voice) => voice.note).sort((a, b) => a - b)).toEqual([36, 38, 42, 82]);
    expect(PERCUSSION_VOICES.map((voice) => voice.role).sort()).toEqual(["hihat", "kick", "percussion", "snare"]);
    for (const voice of PERCUSSION_VOICES) {
      expect(percussionVoiceFor(voice.note), `note ${voice.note}`).toBe(voice);
      expect(percussionVoiceAtKey(voice.key), `key ${voice.key}`).toBe(voice);
      // Every row states a source and a reason; a row that states neither is a row nobody can check.
      expect(voice.source.length, `note ${voice.note} source`).toBeGreaterThan(0);
      expect(voice.because.length, `note ${voice.note} because`).toBeGreaterThan(0);
    }
  });

  it("does not pretend an unlisted note is a listed one, and says where it landed", () => {
    const placement = percussionPlacementFor(50);
    expect(placement.mapped).toBe(false);
    expect(placement.key).toBe(PERCUSSION_FALLBACK);
    // The fallback is a position a row already owns, so "unlisted" and "the snare" cannot be told apart by their line...
    expect(percussionVoiceAtKey(PERCUSSION_FALLBACK)).toBeDefined();
    // ...which is exactly why the notice below exists rather than being optional.
    expect(placement.voice).toBeUndefined();
    // And it lands in the drums' voice, so an unlisted piece cannot collide with the cymbal line either.
    expect(placement.voiceIndex).toBe(2);
  });

  it("writes one sentence per unlisted note, naming the file and the row to add", () => {
    const notices = percussionPlanNotices([note(50, 0), note(50, 0.5), note(36, 1), note(51, 2)]);
    expect(notices).toHaveLength(2);
    expect(notices[0]).toContain("GM percussion note 50");
    expect(notices[0]).toContain("src/components/arrangement/percussionStaff.ts");
    expect(notices[0]).toContain("PERCUSSION_VOICES");
    expect(notices[0]).toContain(PERCUSSION_FALLBACK);
    expect(notices[1]).toContain("GM percussion note 51");
    // A listed note is never reported.
    expect(notices.join(" ")).not.toContain("36");
  });

  it("reports nothing when every instrument is a row", () => {
    expect(percussionPlanNotices([note(36, 0), note(38, 0), note(42, 0), note(82, 0)])).toEqual([]);
  });
});

describe("one bar of a drum staff", () => {
  it("writes the silence and loses no hit, exactly as the pitched stave does", () => {
    const bar = planBar([note(36, 0, 1), note(38, 1, 1)]);
    const drums = bar.find((voice) => voice.voice === 2)!;
    expect(drums.complete).toBe(true);
    expect(drums.entries.filter((entry) => entry.kind === "note").map((entry) => entry.keys)).toEqual([["f/4"], ["c/5"]]);
    expect(drums.entries.filter((entry) => entry.kind === "note").map((entry) => entry.notes)).toEqual([[36], [38]]);
    expect(voiceTotal(drums)).toBeCloseTo(4, 9);
  });

  it("returns both voices of the bar, and the cymbal voice is a whole rest when no cymbal plays", () => {
    const bar = planBar([note(36, 0, 1)]);
    expect(bar.map((voice) => voice.voice)).toEqual([1, 2]);
    expect(bar[0]!.entries).toEqual([
      { kind: "rest", duration: "wr", dots: 0, positions: [], keys: [], notes: [], noteheads: [], mapped: true },
    ]);
    expect(voiceTotal(bar[0]!)).toBeCloseTo(4, 9);
  });

  it("writes a whole rest in each voice for a bar with nothing in it", () => {
    const bar = planBar([]);
    for (const voice of bar) {
      expect(voice.complete).toBe(true);
      expect(voice.entries).toHaveLength(1);
      expect(voice.entries[0]!.duration).toBe("wr");
    }
  });

  it("completes a one-beat drum bar with rests rather than dropping the hits", () => {
    // The starter content of a new drum track: one hit per beat, a sixteenth each.
    const starter = [note(36, 0), note(36, 1), note(36, 2), note(36, 3)];
    const bar = planBar(starter);
    const drums = bar.find((voice) => voice.voice === 2)!;
    expect(drums.complete).toBe(true);
    expect(drums.entries.filter((entry) => entry.kind === "note")).toHaveLength(4);
    expect(drums.entries.some((entry) => entry.duration === "8r")).toBe(true);
    expect(voiceTotal(drums)).toBeCloseTo(4, 9);
  });

  it("splits a kick and a hat on one beat into the two voices, because one note has one stem", () => {
    const bar = planBar([note(36, 0), note(42, 0)]);
    const cymbal = bar.find((voice) => voice.voice === 1)!;
    const drums = bar.find((voice) => voice.voice === 2)!;
    expect(cymbal.entries.find((entry) => entry.kind === "note")!.keys).toEqual(["g/5/x2"]);
    expect(drums.entries.find((entry) => entry.kind === "note")!.keys).toEqual(["f/4"]);
    expect(cymbal.stems).toBe("up");
    expect(drums.stems).toBe("down");
    expect(voiceTotal(cymbal)).toBeCloseTo(4, 9);
    expect(voiceTotal(drums)).toBeCloseTo(4, 9);
  });

  it("gathers two instruments of one voice that start together into one chord, in the model's order", () => {
    const bar = planBar([note(82, 1), note(42, 1)]);
    const cymbal = bar.find((voice) => voice.voice === 1)!;
    const chord = cymbal.entries.find((entry) => entry.kind === "note")!;
    expect(chord.keys).toEqual(["a/5/x2", "g/5/x2"]);
    expect(chord.notes).toEqual([82, 42]);
    expect(chord.mapped).toBe(true);
  });

  it("marks a chord with no unlisted instrument as mapped, and one with an unlisted instrument as not", () => {
    const listed = planBar([note(36, 0), note(38, 0)]);
    expect(listed.find((voice) => voice.voice === 2)!.entries.find((entry) => entry.kind === "note")!.mapped).toBe(true);
    const unlisted = planBar([note(36, 0), note(50, 0)]);
    const chord = unlisted.find((voice) => voice.voice === 2)!.entries.find((entry) => entry.kind === "note")!;
    expect(chord.mapped).toBe(false);
    // Both hits are still written: the fallback is a position, not a deletion.
    expect(chord.keys).toHaveLength(2);
    expect(chord.keys[1]).toBe(PERCUSSION_FALLBACK);
  });

  it("keeps a hit between grid lines rather than dropping it, and snaps only its position", () => {
    const bar = planBar([note(36, 0.3)]);
    const drums = bar.find((voice) => voice.voice === 2)!;
    expect(drums.entries.filter((entry) => entry.kind === "note")).toHaveLength(1);
    // A sixteenth after the bar start, because 0.3 beats snaps onto the model's own grid.
    expect(drums.entries[0]!.kind).toBe("rest");
    expect(beatsOf(drums.entries[0]!.duration, drums.entries[0]!.dots)).toBeCloseTo(0.25, 9);
  });

  it("reads only the bar it was asked for", () => {
    const notes = [note(36, 0), note(38, 4), note(42, 8)];
    expect(noteEntries(planBar(notes, 0))).toHaveLength(1);
    expect(noteEntries(planBar(notes, 1))).toHaveLength(1);
    expect(noteEntries(planBar(notes, 2))).toHaveLength(1);
  });

  it("says a bar is complete only when it adds up; overlapping hits stay in the plan", () => {
    // Two four-beat hits in one voice cannot be spelled, and the plan says so rather than throwing.
    const overlap = planBar([note(36, 0, 4), note(38, 1, 4)]);
    const drums = overlap.find((voice) => voice.voice === 2)!;
    expect(drums.complete).toBe(false);
    expect(drums.entries.filter((entry) => entry.kind === "note")).toHaveLength(2);
    expect(drums.entries.some((entry) => entry.kind === "rest")).toBe(false);
  });

  it("does not read a drum bar the way the pitched stave reads it", () => {
    /**
     * The reverse criterion, at the level of the plan: note 36 is **below middle C**, so the pitched planner puts it
     * on the bass stave, and note 82 is above it, so the pitched planner puts it on the treble one. The percussion
     * plan has one stave, two voices, and never looks at the pitch as a pitch at all.
     */
    expect(planMeasure([note(36, 0)], 0, false).entries.filter((entry) => entry.kind === "note")).toHaveLength(1);
    expect(planMeasure([note(82, 0)], 0, true).entries.filter((entry) => entry.kind === "note")).toHaveLength(1);
    const bar = planBar([note(36, 0), note(82, 0)]);
    expect(noteEntries(bar)).toHaveLength(2);
    expect(noteEntries(bar).map((entry) => entry.keys)).toEqual([["a/5/x2"], ["f/4"]]);
  });
});

describe("VexFlow's own verdict on a drum staff", () => {
  it("reads every table row back onto the line the table claims, under a percussion clef", async () => {
    /**
     * The claim only VexFlow can settle: this is *its* clef arithmetic, not ours. The expected lines are written
     * out here rather than read from the table, so the table and the library are compared by an independent number
     * (0 is the bottom line, 0.5 the first space, 6 above the top line).
     */
    const expected: Record<string, number> = { "f/4": 1.5, "c/5": 3.5, "g/5/x2": 5.5, "a/5/x2": 6 };
    const { StaveNote, Stave } = await import("vexflow/core");
    for (const voice of PERCUSSION_VOICES) {
      const built = new StaveNote({ keys: [voice.key], duration: "q", clef: "percussion", stemDirection: 1 });
      built.setStave(new Stave(0, 0, 200));
      expect(built.getKeyLine(0), `${voice.piece} (${voice.key})`).toBeCloseTo(expected[voice.key]!, 9);
      expect(voice.line, `${voice.piece} row`).toBeCloseTo(expected[voice.key]!, 9);
    }
  });

  it("formats a drum bar the plan describes instead of throwing IncompleteVoice", async () => {
    const { Formatter } = await import("vexflow/core");
    // One beat of hits in a 4/4 bar: the shape that used to be one sixteenth per beat, all of it strict.
    const bar = planBar([note(36, 0), note(36, 1), note(36, 2), note(36, 3)]);
    const voices = await voicesFor(bar);
    const formatter = new Formatter();
    const tickables = voices.map(({ voice }) => voice);
    expect(() => formatter.joinVoices(tickables).format(tickables, 200)).not.toThrow();
    expect(voices.flatMap(({ voice }) => voice.getTickables())).toHaveLength(
      bar.reduce((sum, voice) => sum + voice.entries.length, 0)
    );
  });

  it("refuses the same drum bar written the old way — on a pitched stave, with no rests, STRICT", async () => {
    /**
     * The red half, kept so the fix cannot be reverted quietly. This is what the component built before it asked
     * for the track's kind: four sixteenths at their own MIDI pitches, a strict four-beat voice, no silence. The
     * library's answer is the sentence from the field report.
     */
    const { Voice, StaveNote, Formatter } = await import("vexflow/core");
    const oldVoice = new Voice({ numBeats: 4, beatValue: 4 });
    for (const _pitch of [36, 36, 36, 36]) {
      // The old `keyFor`: note 36 is `c/2` on a bass stave — a pitched spelling of a drum.
      oldVoice.addTickable(new StaveNote({ keys: ["c/2"], duration: "16" }));
    }
    expect(() => new Formatter().joinVoices([oldVoice]).format([oldVoice], 200)).toThrow(/IncompleteVoice/);
    // And the pitch it would have written is not a position this table uses.
    expect(PERCUSSION_VOICES.map((voice) => voice.key)).not.toContain("c/2");
  });

  it("accepts the two voices of a kit under the one formatter, with the stems the table asks for", async () => {
    const { Formatter } = await import("vexflow/core");
    const bar = planBar([note(36, 0), note(42, 0), note(38, 1), note(42, 1), note(82, 1.5)]);
    const voices = await voicesFor(bar);
    const formatter = new Formatter();
    const tickables = voices.map(({ voice }) => voice);
    expect(() => formatter.joinVoices(tickables).format(tickables, 200)).not.toThrow();
    const [cymbals, drums] = voices;
    for (const tickable of cymbals!.tickables.filter((entry) => !entry.isRest())) expect(tickable.getStemDirection()).toBe(1);
    for (const tickable of drums!.tickables.filter((entry) => !entry.isRest())) expect(tickable.getStemDirection()).toBe(-1);
    // The hat and the kick really are separate notes on separate lines, which is why one voice could not hold them.
    expect(cymbals!.tickables[0]!.getKeys()).toEqual(["g/5/x2"]);
    expect(drums!.tickables[0]!.getKeys()).toEqual(["f/4"]);
  });

  it("accepts an over-full drum bar as a soft voice, because the hits are still there", async () => {
    const { Formatter } = await import("vexflow/core");
    const bar = planBar([note(36, 0, 4), note(38, 1, 4)]);
    const voices = await voicesFor(bar);
    const formatter = new Formatter();
    const tickables = voices.map(({ voice }) => voice);
    expect(() => formatter.joinVoices(tickables).format(tickables, 200)).not.toThrow();
    expect(voices[1]!.voice.getTickables()).toHaveLength(2);
  });
});
