/**
 * The arrangement's length and tempo, as the **engine** sees them.
 *
 * Both were wrong in the same way and for the same reason: the arrangement grew a length and a tempo, and the compile kept handing the engine a one-bar section at a hardcoded 120. That is the failure mode this file exists for — **a note in bar three was in the data and never scheduled**, which looks like silence and reads like a bug in the roll.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_BARS, createArrangement, setArrangementBars, setArrangementTempo, addTrack } from "../data/arrangementEdits";
import { compileArrangementToSongInput } from "../data/arrangementCompile";
import { totalSeconds } from "../data/tempoMap";

const note = (pitch: number, startBeats: number) => ({ pitch, startBeats, lengthBeats: 0.25, velocity: 100 });

const withSampler = (bars: number) => {
  const added = addTrack(createArrangement("song"), "sampler", "Drums");
  const id = added.tracks[0]!.id;
  return { arrangement: setArrangementBars(added, bars), id };
};

describe("the arrangement reaches the engine with its own length and tempo", () => {
  it("hands the engine the arrangement's length, which one bar used to swallow", () => {
    /**
     * ⭐ **The regression criterion, stated against what the engine actually receives.** The section said `bars: 1` while the lane's steps had already grown to hold a note in bar three, so the note was in the data and the transport never reached it.
     *
     * The criterion is on the **section** rather than on how many events the planner returns, because `planAudioLaneEvents` plans **one event per lane per section**: the event count says nothing about where notes are. Making the notes themselves audible is a separate piece of work on the playback path; what this owns is that the length
     * and the tempo arrive.
     */
    const { arrangement, id } = withSampler(4);
    const song = compileArrangementToSongInput(arrangement, { [id]: [note(36, 0), note(36, 8)] });
    expect(song.sections[0]!.bars).toBe(4);
    // And the step array still reaches bar three's note, so nothing was dropped on the way in.
    expect(song.clips.A.tracks[0]!.steps).toHaveLength(64);
    expect((song.clips.A.tracks[0]!.steps ?? [])[32]).not.toBe(0);
  });

  it("says how long the arrangement is rather than one bar", () => {
    const { arrangement } = withSampler(6);
    const song = compileArrangementToSongInput(arrangement, {});
    expect(song.sections[0]!.bars).toBe(6);
    // And the same number the strip and the roll are laid out with, because two lengths would eventually disagree.
    expect(DEFAULT_BARS).toBe(8);
  });

  it("carries the arrangement's tempo instead of the hardcoded 120", () => {
    const { arrangement } = withSampler(2);
    expect(compileArrangementToSongInput(arrangement, {}).bpm).toBe(120);
    const faster = setArrangementTempo(arrangement, 140);
    expect(compileArrangementToSongInput(faster, {}).bpm).toBe(140);
    // An older file has no tempo and keeps playing exactly as it did.
    const noTempo = { ...arrangement } as Record<string, unknown>;
    delete noTempo.bpm;
    expect(compileArrangementToSongInput(noTempo as never, {}).bpm).toBe(120);
  });

  it("clamps a tempo rather than refusing one, and rounds it", () => {
    const arrangement = createArrangement("song");
    expect(setArrangementTempo(arrangement, 0).bpm).toBe(20);
    expect(setArrangementTempo(arrangement, 9999).bpm).toBe(300);
    expect(setArrangementTempo(arrangement, 133.6).bpm).toBe(134);
    // A number that is not a number is not a tempo: it becomes the default rather than NaN.
    expect(setArrangementTempo(arrangement, Number.NaN).bpm).toBe(120);
  });
});

/**
 * **A tempo map reaches the engine, and the durations say so.**
 *
 * Muse composed a nine-movement piece at 66–168 bpm and had to render **nine arrangements** and stitch them outside,
 * because an arrangement could carry only one tempo. Three links had to be added for one arrangement to say it —
 * the model field, the projection, and the call that creates the song — and the reason this criterion is written
 * against **durations** rather than against a field being present is that every one of those links can be dropped
 * without an error: the song still renders, both sections just at the same speed.
 */
describe("the arrangement's tempo map reaches the engine", () => {
  it("carries the map, and two bars at 60 bpm take twice as long as two at 120", () => {
    const { arrangement, id } = withSampler(4);
    const notes = { [id]: [note(36, 0)] };
    const flat = compileArrangementToSongInput(arrangement, notes);
    const mapped = compileArrangementToSongInput(
      { ...arrangement, tempoTrack: [{ atBar: 0, bpm: 120 }, { atBar: 2, bpm: 60 }] },
      notes
    );

    expect(mapped.tempoTrack).toEqual([{ atBar: 0, bpm: 120 }, { atBar: 2, bpm: 60 }]);
    // ⭐ Two bars at 120 (4 s) then two at 60 (8 s) — the second half is deliberately slower, so the total can only
    // be right if the map travelled. With the map dropped the two songs measure the same, which is the bug.

    const slowHalf = totalSeconds({ bpm: mapped.bpm, tempoTrack: mapped.tempoTrack }, 4);
    const allFlat = totalSeconds({ bpm: mapped.bpm }, 4);
    expect(slowHalf).toBeCloseTo(12, 1);
    expect(allFlat).toBeCloseTo(8, 1);
    expect(slowHalf).toBeGreaterThan(allFlat);
    // And an arrangement without a map is untouched: the field is absent rather than empty.
    expect(flat.tempoTrack).toBeUndefined();
  });
});
