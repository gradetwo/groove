import { describe, expect, it } from "vitest";
import { compileArrangementToSongInput } from "../data/arrangementCompile";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";

/**
 * ⭐ **A note's length belongs to the arrangement, and every lane has to receive it.**
 *
 * The owner's instruction is that where the sequencer's old design limits the arrangement, the old design goes.
 * This is that case, measured. `stepsFromNotes` keeps only a note's start and one pitch per column, so a length
 * has to travel some other way; `arrangementCompile.ts` sends it in `gate`, but only when `trackId === "audio"`,
 * which is the sampler lane. Every other lane gets no gate at all, and the author recorded the consequence in
 * that file: a note the arrangement holds for a beat came out an eighth of that.
 *
 * So the criterion is written against the compile's own output rather than against audio, because the length is
 * decided there and a render would only re-measure it. Four bars is the case the first report named — a pad, an
 * organ note, a slow bass — and it is written to fail on a synth lane today and pass once the gate stops being
 * something only one lane receives.
 */
const BEATS_PER_BAR = 4;
const BARS = 4;
/** Steps are sixteenths, so four bars is sixty-four of them; asserted rather than assumed below. */
const STEPS_FOR_FOUR_BARS = 64;

const pad = (startBeats: number, lengthBeats: number): NoteEvent => ({ pitch: 48, startBeats, lengthBeats, velocity: 90 });

const arrangementWith = (kinds: Array<{ id: string; kind: string }>, notes: Record<string, NoteEvent[]>): ArrangementV2 =>
  ({
    id: "a",
    name: "pad test",
    bpm: 120,
    bars: BARS,
    timeSignature: "4/4",
    tracks: kinds.map(({ id, kind }) => ({ id, name: id, kind })),
    notesByTrack: notes,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe("an arrangement note's length reaching the compiled lanes", () => {
  it("⭐ gives every lane the note's length, not only the sampler lane", () => {
    const long = pad(0, BARS * BEATS_PER_BAR);
    const { clips } = compileArrangementToSongInput(
      arrangementWith(
        [
          { id: "samplerTrack", kind: "sampler" },
          { id: "synthTrack", kind: "instrument" },
        ],
        { samplerTrack: [long], synthTrack: [long] }
      ),
      { samplerTrack: [long], synthTrack: [long] }
    );

    const lanes = clips.A.tracks;
    expect(lanes).toHaveLength(2);

    // The sampler lane already carried it; that is what the old condition allowed.
    expect(lanes[0]!.gate?.[0] ?? 0).toBeGreaterThanOrEqual(STEPS_FOR_FOUR_BARS);
    // ⭐ And the synth lane must too. Today it has no gate at all, which is the loss.
    expect(lanes[1]!.gate?.[0] ?? 0).toBeGreaterThanOrEqual(STEPS_FOR_FOUR_BARS);
  });

  it("does not shorten the note to a bar, which is what the sequencer's own cap would do", () => {
    const long = pad(0, BARS * BEATS_PER_BAR);
    const { clips } = compileArrangementToSongInput(
      arrangementWith([{ id: "synthTrack", kind: "instrument" }], { synthTrack: [long] }),
      { synthTrack: [long] }
    );
    // The compile must hand over the real length; any clamp belongs to the renderer's own rules, not here.
    expect(clips.A.tracks[0]!.gate?.[0] ?? 0).toBe(STEPS_FOR_FOUR_BARS);
  });

  it("still places a short note where it belongs, so the change is not a blunt one", () => {
    const short = pad(4, 1);
    const { clips } = compileArrangementToSongInput(
      arrangementWith([{ id: "synthTrack", kind: "instrument" }], { synthTrack: [short] }),
      { synthTrack: [short] }
    );
    const gate = clips.A.tracks[0]!.gate ?? [];
    // The array is dense — every step of the arrangement has an entry — so an empty step reads as 0 rather than
    // as a hole. A beat is four steps, so a note starting at beat 4 lands at step 16 and is four steps long.
    expect(gate[0]).toBe(0);
    expect(gate[4]).toBe(0);
    expect(gate[16]).toBe(4);
  });
});
