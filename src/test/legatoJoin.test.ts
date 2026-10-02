/**
 * ⭐⭐ **The rule that decides "legato" from "bow change" — judged on its own, with no audio in it.**
 *
 * `chordChangeReattacks` reports where a chord overlaps into the next and still re-attacks; that is the *detector*
 * and it changes nothing. This file judges the other half, the *rule*: at each of those instants, is the join a
 * legato (the sounding voice is carried, no new attack) or a bow change (the new attack is the point)?
 *
 * Every criterion here is a fact read off the plan's own events, so the rule can be wrong in a way a listener would
 * notice only if the numbers are wrong first. The four questions the rule asks are each tested in both directions:
 * the overlap with a moving pitch joins, and a **repeated pitch**, a **staccato-class technique**, an
 * **already-released previous note**, a **non-string instrument** and a **chord whose voice has no counterpart** all
 * refuse, each with its own named reason.
 *
 * The sources behind the four questions — SFZ's legato tutorial, Kontakt's Time Machine Legato, SWAM's détaché rule,
 * Dorico on repeated notes under a slur, Orchestral Tools on short articulations — are quoted in the module and read
 * in `docs/LEGATO_OVERLAP.md` §1. This file judges the rule, not the reading.
 */
import { describe, expect, it } from "vitest";
import { LEGATO_TECHNIQUES, decideLegatoJoin, planLegatoJoins, techniqueOfAsset } from "../audio/legatoJoin";
import type { OfflineAudioLaneEvent } from "../audio/offlineAudioLanes";
import { chordChangeReattacks } from "../data/stringTechniques";

const SUSTAIN = "vsco2ce:ViolinEnsSusVib";
const PIZZ = "vsco2ce:ViolinEnsPizz";
const PIANO = "salamander-grand";

/** One note, in the shape the lane planner emits it: a lane, a recording, a second, a length. */
function event(overrides: Partial<OfflineAudioLaneEvent> & Pick<OfflineAudioLaneEvent, "atSeconds" | "pitch">): OfflineAudioLaneEvent {
  return {
    trackIndex: 0,
    track_id: "lead",
    name: "弦乐",
    assetId: SUSTAIN,
    seconds: 4.25,
    gainDb: 0,
    ...overrides,
  };
}

/** `count` chords of `pitches.length` notes, one every `everySeconds`, each held `holdSeconds`. */
function chords(count: number, pitchesPerChord: number[][], everySeconds: number, holdSeconds: number): OfflineAudioLaneEvent[] {
  const events: OfflineAudioLaneEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const atSeconds = 16 + index * everySeconds;
    for (const pitch of pitchesPerChord[index % pitchesPerChord.length]!) {
      events.push(event({ atSeconds, pitch, seconds: holdSeconds }));
    }
  }
  return events;
}

/** The owner's shape: twenty three-note chords every 8 beats (4 s), every note held 8.5 beats (4.25 s) — a half-beat dovetail. */
const OWNER_CHORDS = [
  [57, 60, 64],
  [58, 62, 65],
  [60, 64, 67],
  [62, 65, 69],
];

describe("the legato-or-bow-change rule", () => {
  it("⭐ joins all three notes at every one of the owner's chord changes", () => {
    const events = chords(20, OWNER_CHORDS, 4, 4.25);
    const { reading, events: marked } = planLegatoJoins(events);
    /** Nineteen changes: the first chord has nothing before it, so twenty chords make nineteen overlaps. */
    expect(reading.overlappingOnsets).toBe(19);
    expect(reading.notesAtOverlaps).toBe(57);
    expect(reading.joins).toBe(57);
    expect(reading.reattacks).toBe(0);
    const lane = reading.lanes[0]!;
    expect(lane.technique).toBe("sustain");
    expect(lane.legatoCapable).toBe(true);
    expect(lane.refusals).toEqual([]);
    /**
     * ⭐ **The two readings meet.** `chordChangeReattacks` counts the same nineteen instants from the arrangement's
     * notes; this rule takes all fifty-seven attacks away from it. The numbers are comparable because both are
     * "the previous chord's `max(end)` against the next chord's start", not merely similar.
     */
    const detector = chordChangeReattacks(
      {
        tracks: [{ id: "strings", name: "弦乐" }],
        notesByTrack: {
          strings: events.map((one) => ({ pitch: one.pitch!, startBeats: (one.atSeconds * 120) / 60, lengthBeats: 8.5, velocity: 50 })),
        },
      },
      120
    );
    expect(detector[0]!.changesTotal).toBe(reading.overlappingOnsets);
    // Every note of every chord after the first is handed over, and the voice of each note is named on the event.
    const joined = marked.filter((one) => one.legato !== undefined);
    expect(joined).toHaveLength(57);
    expect(joined.every((one) => one.legato!.overlapSeconds === 0.25)).toBe(true);
    expect(joined.filter((one) => one.atSeconds === 24).map((one) => one.legato!.fromPitch)).toEqual([58, 62, 65]);
    expect(marked.filter((one) => one.voiceRank !== undefined)).toHaveLength(60);
    expect(marked.filter((one) => one.atSeconds === 24).map((one) => one.voiceRank)).toEqual([0, 1, 2]);
  });

  it("⭐ refuses the join when the pitch is repeated, because a repeated note is a new stroke", () => {
    /**
     * Same pitch, same overlap, same instrument — and the right answer flips. Dorico's own notation reference says a
     * repeated note inside a slur is played "using the same bow direction, but stopping the bow between each note";
     * re-articulation is what the notation means, so this rule must not swallow it.
     */
    const events = [event({ atSeconds: 0, pitch: 60, seconds: 4.25 }), event({ atSeconds: 4, pitch: 60, seconds: 4.25 })];
    const { reading, events: marked } = planLegatoJoins(events);
    expect(reading.overlappingOnsets).toBe(1);
    expect(reading.notesAtOverlaps).toBe(1);
    expect(reading.joins).toBe(0);
    expect(reading.reattacks).toBe(1);
    expect(reading.lanes[0]!.refusals[0]!.reason).toBe("repeated-pitch");
    expect(marked[1]!.legato).toBeUndefined();
  });

  it("⭐ refuses to join a staccato-class technique, and one bad layer of a chord does not silence the others", () => {
    /**
     * A plucked, bounced or repeated-stroke bowing cannot be carried on without ceasing to be itself — Orchestral
     * Tools: "You can not use legato transitions for short articulations like staccato, simply because it makes no
     * sense to do so." The lane is marked not capable, every note refuses by the same name, and nothing is joined.
     */
    for (const assetId of [PIZZ]) {
      const events = chords(4, OWNER_CHORDS, 4, 4.25).map((one) => ({ ...one, assetId }));
      const { reading } = planLegatoJoins(events);
      expect(reading.joins).toBe(0);
      expect(reading.lanes[0]!.legatoCapable).toBe(false);
      expect(reading.lanes[0]!.technique).toBe("pizzicato");
      expect(new Set(reading.lanes[0]!.refusals.map((one) => one.reason))).toEqual(new Set(["technique-is-not-sustained"]));
      expect(reading.reattacks).toBe(9);
    }
  });

  it("⭐ refuses when the previous note has already released, because that is a gap and not an overlap", () => {
    /**
     * The case `legatoGapsFor` owns: separated notes are détaché — SWAM's manual says the note-off "must happen before
     * the note-on of the second note" for a detached stroke — so there is nothing for this rule to act on and it must
     * not report a refusal either: a lane with no overlap has no decision forced on it.
     */
    const events = chords(4, OWNER_CHORDS, 4, 3.5);
    const { reading } = planLegatoJoins(events);
    expect(reading.overlappingOnsets).toBe(0);
    expect(reading.joins).toBe(0);
    expect(reading.reattacks).toBe(0);
    expect(reading.lanes).toEqual([]);
  });

  it("refuses a recording that is not a bowed string at all", () => {
    const events = chords(4, OWNER_CHORDS, 4, 4.25).map((one) => ({ ...one, assetId: PIANO }));
    const { reading } = planLegatoJoins(events);
    expect(reading.lanes[0]!.technique).toBeUndefined();
    expect(reading.lanes[0]!.legatoCapable).toBe(false);
    expect(reading.lanes[0]!.refusals[0]!.reason).toBe("technique-is-not-sustained");
    expect(reading.joins).toBe(0);
  });

  it("⭐ pairs a chord's voices by pitch, so a voice the previous chord does not have starts its own attack", () => {
    /**
     * Two notes into three: ranks 0 and 1 continue the lowest and middle lines, and rank 2 has nothing to be handed
     * from — it is a note the previous chord did not have. Forcing a pairing (say by nearest pitch) would carry a
     * line across another line's voice, which is not a handover but a re-voicing.
     */
    const events = [
      ...[60, 64].map((pitch) => event({ atSeconds: 16, pitch, seconds: 4.25 })),
      ...[55, 59, 62].map((pitch) => event({ atSeconds: 20, pitch, seconds: 4.25 })),
    ];
    const { reading, events: marked } = planLegatoJoins(events);
    expect(reading.joins).toBe(2);
    expect(reading.reattacks).toBe(1);
    expect(reading.lanes[0]!.refusals.map((one) => one.reason)).toEqual(["no-voice-to-continue"]);
    expect(marked.filter((one) => one.atSeconds === 20 && one.legato).map((one) => one.legato!.rank)).toEqual([0, 1]);
    expect(marked.filter((one) => one.atSeconds === 20).map((one) => one.voiceRank)).toEqual([0, 1, 2]);
  });

  it("refuses to carry a voice across a program change, because that is a different instrument", () => {
    const events = [event({ atSeconds: 0, pitch: 60, seconds: 4.25 }), event({ atSeconds: 4, pitch: 64, seconds: 4.25, assetId: PIZZ })];
    const { reading } = planLegatoJoins(events);
    expect(reading.joins).toBe(0);
    expect(reading.lanes[0]!.refusals[0]!.reason).toBe("no-voice-to-continue");
  });

  it("refuses when the previous note's length is not stated, rather than assuming it is still sounding", () => {
    /**
     * The chord overlaps because one of its notes says so, and the other note does not state a length at all. The
     * unstated one is refused by name rather than assumed present: the whole rule turns on whether that voice is
     * still sounding, and a plan that does not say is not evidence that it is.
     */
    const events = [
      event({ atSeconds: 16, pitch: 60, seconds: 4.25 }),
      event({ atSeconds: 16, pitch: 64, seconds: undefined }),
      event({ atSeconds: 20, pitch: 62, seconds: 4.25 }),
      event({ atSeconds: 20, pitch: 65, seconds: 4.25 }),
    ];
    const { reading, events: marked } = planLegatoJoins(events);
    expect(reading.overlappingOnsets).toBe(1);
    expect(reading.joins).toBe(1);
    expect(reading.lanes[0]!.refusals.map((one) => one.reason)).toEqual(["previous-length-unknown"]);
    expect(marked.filter((one) => one.atSeconds === 20 && one.legato).map((one) => one.legato!.rank)).toEqual([0]);
  });

  it("never crosses lanes: two tracks with the same pitches are two decisions", () => {
    const events = [
      event({ atSeconds: 0, pitch: 60, seconds: 4.25, trackIndex: 0 }),
      event({ atSeconds: 4, pitch: 64, seconds: 4.25, trackIndex: 0 }),
      event({ atSeconds: 4, pitch: 64, seconds: 4.25, trackIndex: 1, name: "other" }),
    ];
    const { reading } = planLegatoJoins(events);
    // The second lane has a single onset and no previous chord of its own, so it has no overlap and no entry.
    expect(reading.lanes.map((one) => one.trackIndex)).toEqual([0]);
    expect(reading.joins).toBe(1);
  });
});

/** The four questions on their own, so a change to one cannot hide behind the pass. */
describe("the rule's four questions", () => {
  it("answers legato only when the previous note is sounding, the pitch moves, and the bow does not stop", () => {
    expect(decideLegatoJoin({ previousEndSeconds: 4.25, startSeconds: 4, previousPitch: 60, pitch: 64, technique: "sustain" })).toMatchObject({ kind: "legato" });
    for (const technique of LEGATO_TECHNIQUES) {
      expect(decideLegatoJoin({ previousEndSeconds: 4.25, startSeconds: 4, previousPitch: 60, pitch: 64, technique }).kind).toBe("legato");
    }
  });

  it("refuses each of the four by its own name", () => {
    const base = { previousEndSeconds: 4.25, startSeconds: 4, previousPitch: 60, pitch: 64, technique: "sustain" as const };
    expect(decideLegatoJoin({ ...base, previousEndSeconds: 4 })).toMatchObject({ kind: "bow-change", refusal: "previous-already-released" });
    expect(decideLegatoJoin({ ...base, pitch: 60 })).toMatchObject({ kind: "bow-change", refusal: "repeated-pitch" });
    expect(decideLegatoJoin({ ...base, technique: "spiccato" })).toMatchObject({ kind: "bow-change", refusal: "technique-is-not-sustained" });
    expect(decideLegatoJoin({ ...base, technique: "tremolo" })).toMatchObject({ kind: "bow-change", refusal: "technique-is-not-sustained" });
    expect(decideLegatoJoin({ ...base, technique: undefined })).toMatchObject({ kind: "bow-change", refusal: "technique-is-not-sustained" });
  });

  /** The technique comes from the table by the recording's own id — never from the instrument's name. */
  it("reads the technique off the recording's catalogue id", () => {
    expect(techniqueOfAsset(SUSTAIN)).toBe("sustain");
    expect(techniqueOfAsset(PIZZ)).toBe("pizzicato");
    expect(techniqueOfAsset(PIANO)).toBeUndefined();
  });
});
