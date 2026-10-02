/**
 * ⭐ **When an overlap is a legato join and when it is a bow change — the decision, written down.**
 *
 * ## The defect this answers
 *
 * The owner heard the strings *break* and located it to one instant (`docs/STRING_TECHNIQUES.md` §9). The mechanism
 * is that the previous chord is **still sounding** when the next one begins — the writing dovetails by half a beat —
 * and yet every new note starts **its own attack**, three fresh onsets landing on a sustaining chord. `overlap is not
 * legato`: the arithmetic of `lengthBeats` says "connected" and the player says "struck again".
 *
 * `chordChangeReattacks` (`src/data/stringTechniques.ts`) already **reports** those instants and changes nothing.
 * This module is the other half: the rule that decides, at each of those instants, whether the join must be legato
 * (the sounding voice is carried on and its pitch moves — no new attack) or must be a bow change (the new attack is
 * the point). It is a **rule over named facts**, not a heuristic and not a threshold: every decision below is forced
 * by one of four questions, and each answer can be read back off the event stream.
 *
 * ## The four questions, and who says so
 *
 * The industry reading is in `docs/LEGATO_OVERLAP.md` §1. In short:
 *
 *   · **A bow that has not stopped can only be carried on.** SFZ's own legato tutorial: the legato region exists
 *     because "it makes sense to treat the legato notes differently than the notes which start a phrase when no
 *     other note is playing", and the shape of that treatment is to *skip the attack* and crossfade
 *     (<https://sfzformat.com/tutorials/legato/>). Kontakt's Time Machine **Legato**: "Kontakt will carry its
 *     current playback position over to each following note, rather than playing each Sample from the beginning"
 *     (KONTAKT 8.6 User Guide, The Source Module). Kontakt's Melody engine: "if a previous sample is still playing
 *     the playback will not start from the sample's start marker, but instead it will follow the play position of
 *     the previous sample. If no other sample is playing, the playback will start as usual".
 *   · **A gap is not legato.** Audio Modeling's SWAM Solo Strings manual: "Detaché are performed by separating the
 *     notes … the note-off of the first note must happen before the note-on of the second note. A Slurred Legato is
 *     performed when the notes are overlapped". So "the previous note has already released" is `legatoGaps`'
 *     business and this rule refuses it.
 *   · **A repeated pitch is a re-articulation.** Dorico's notation reference, on slurs: "staccato articulations on
 *     repeated notes of the same pitch within a slur indicate that notes should be played on a stringed instrument
 *     using the same bow direction, **but stopping the bow between each note**" — a repeated note is *articulated*,
 *     and Slurs "normally group notes of different pitches together".
 *   · **Some techniques cannot be legato at all.** Orchestral Tools' SINEplayer: "You can not use legato
 *     transitions for short articulations like staccato, simply because it makes no sense to do so."
 *
 * ## What it does not touch
 *
 * The release ramp, `releaseSeconds`, the loop semantics and `off_by` are **already landed, each with its own
 * criterion**, and this module changes none of them: a join only ever *moves* where a voice's end is, never how a
 * voice ends. And the rule is applied to **notes**, so a lane whose instrument is not a bowed string (a piano, a
 * plucked bass, a synthesiser) is refused by name rather than approximated: retuning a piano sample is not a legato.
 */
import type { StringTechnique } from "../data/stringTechniques";
import { STRING_TECHNIQUES } from "../data/stringTechniques";
import type { OfflineAudioLaneEvent } from "./offlineAudioLanes";

/**
 * ⭐ **The techniques that are a bow which does not stop, and the ones that are a new stroke by definition.**
 *
 * `sustain`, `non-vibrato` and `quiet` are the same bow held at three dynamics — the three rows of the pinned
 * library's sustained programs (`src/data/stringTechniques.ts`). Everything else in that table is excluded for a
 * reason that is the technique itself: `pizzicato` is plucked (there is no bow to carry), `spiccato` and `tremolo`
 * are the *repeated-stroke* bowings, `martele`-class accents are re-articulations, and `col-legno` / `harmonics`
 * have no bytes at all. Naming the positive set rather than a negative one is deliberate: a technique added to the
 * table later is **not** assumed legato, so a new technique must be argued into this list.
 */
export const LEGATO_TECHNIQUES: readonly StringTechnique[] = ["sustain", "non-vibrato", "quiet"];

/** Two seconds that differ by less than this are the same instant rather than a float artefact — the rule `legatoGaps` and `chordChangeReattacks` use. */
export const JOIN_EPSILON_SECONDS = 1e-6;

/** Why a join that the overlap made plausible is **not** a legato join. Each name is a fact a caller can read back. */
export type JoinRefusal =
  | "previous-already-released"
  | "previous-length-unknown"
  | "repeated-pitch"
  | "technique-is-not-sustained"
  | "no-voice-to-continue"
  | "recording-would-run-out"
  | "voice-cannot-be-extended";

/** The rule's answer, with the sentence that goes with it. */
export interface LegatoJoinDecision {
  kind: "legato" | "bow-change";
  /** Why — written as the fact that forced it, so a report can carry it without a second table of names. */
  because: string;
  /** Present exactly when `kind` is `"bow-change"`. */
  refusal?: JoinRefusal;
}

/**
 * **The technique behind a lane's recording**, read from the table by the recording's own catalogue id.
 *
 * A lookup on an exact id rather than a reading of the instrument's name: `strings_lead` and
 * `violin_section_sustain` are two names for one recording, and the row that names it is the only thing that says
 * whether it is bowed, plucked or bounced. An id that is not a string program at all (`salamander-grand`) answers
 * `undefined`, which is "this instrument is not a bowed string" rather than "unknown".
 */
export function techniqueOfAsset(assetId: string): StringTechnique | undefined {
  return STRING_TECHNIQUES.find((program) => program.assetId === assetId)?.technique;
}

/**
 * **The four questions, in order, for one pair of notes.**
 *
 * Order matters and is part of the rule: "the previous note has already released" is asked first, because that is
 * the case `legatoGapsFor` owns and there is no overlap for this rule to act on; "the same pitch" is asked before
 * the technique, because a repeated note is a re-articulation whatever the bow is doing.
 */
export function decideLegatoJoin(input: {
  /** When the previous voice falls silent, in the render's own seconds. */
  previousEndSeconds: number;
  /** When the new note begins. */
  startSeconds: number;
  previousPitch: number;
  pitch: number;
  /** The technique behind the lane's recording, or `undefined` when the recording is not a bowed string at all. */
  technique: StringTechnique | undefined;
}): LegatoJoinDecision {
  const { previousEndSeconds, startSeconds, previousPitch, pitch, technique } = input;
  /**
   * **① The previous note has already released.** A seam is not an overlap: `legatoGapsFor` reports the writing's
   * gap and a new attack there is what the writing asked for. Asked first because everything below is about a note
   * that is still sounding.
   */
  if (!(previousEndSeconds > startSeconds + JOIN_EPSILON_SECONDS)) {
    return {
      kind: "bow-change",
      refusal: "previous-already-released",
      because: `the previous voice ended at ${previousEndSeconds} s, at or before this note's ${startSeconds} s, so there is no overlap to join`,
    };
  }
  /** **② The same pitch again.** A repeated note is re-articulated even inside one slur (Dorico: "stopping the bow between each note"), so the bow change is the correct reading. */
  if (pitch === previousPitch) {
    return {
      kind: "bow-change",
      refusal: "repeated-pitch",
      because: `the voice being continued is already sounding ${previousPitch} and this note is ${pitch}: a repeated pitch is a new stroke, not a finger change`,
    };
  }
  /** **③ The technique is a new stroke by definition.** A pluck, a bounce or a repeated-stroke bowing cannot be carried on without ceasing to be itself. */
  if (technique === undefined) {
    return {
      kind: "bow-change",
      refusal: "technique-is-not-sustained",
      because: "the lane's recording is not a bowed-string program, so there is no bow to carry on",
    };
  }
  if (!LEGATO_TECHNIQUES.includes(technique)) {
    return {
      kind: "bow-change",
      refusal: "technique-is-not-sustained",
      because: `\`${technique}\` is a new stroke by definition, not a bow that continues`,
    };
  }
  /** **④ The bow is still sounding, the pitch moves, and the technique is a sustained one.** This is the legato case. */
  return {
    kind: "legato",
    because: `the voice sounding ${previousPitch} has not released (${previousEndSeconds} s > ${startSeconds} s), this note is ${pitch}, and \`${technique}\` is a bow that does not stop`,
  };
}

/* ------------------------------------------------------------------------------------------------ */
/*                                  the pass over a lane plan's events                                 */
/* ------------------------------------------------------------------------------------------------ */

/**
 * ⭐ **The handover the plan asks the voice layer to perform**, carried on the event so the sink needs no second table.
 *
 * `rank` is the voice's identity: the notes of one onset sorted by pitch, lowest first. Two chords of three notes
 * therefore hand over three voices, one per line of the chord, and a note that has no counterpart in the previous
 * chord is a fresh attack rather than a forced pairing. This is the one part of the rule that the sources do **not**
 * settle: Orchestral Tools says legato "will be monophonic" and Kontakt's manual has no poly legato, so the
 * per-voice reading of a chord change is this repository's decision, stated rather than implied
 * (`docs/LEGATO_OVERLAP.md` §4).
 */
export interface LegatoJoinMark {
  /** Which voice of the previous onset this note continues: its rank when that onset's notes are sorted by pitch. */
  rank: number;
  /** The pitch that voice is sounding when the handover happens. */
  fromPitch: number;
  /** When that voice began, in the render's own seconds. */
  fromSeconds: number;
  /** How long the two overlap, in seconds — positive by construction. */
  overlapSeconds: number;
  /** The rule's answer, in the owner's terms. */
  because: string;
}

/** One overlap at which a note still begins its own attack, with the reason the rule gave. */
export interface LegatoJoinRefusal {
  trackIndex: number;
  name: string;
  atSeconds: number;
  pitch: number;
  reason: JoinRefusal;
  because: string;
}

/** One lane's reading. */
export interface LegatoJoinLaneReport {
  trackIndex: number;
  name: string;
  assetId: string;
  /** The technique behind the recording, or `undefined` when it is not a string program. */
  technique: StringTechnique | undefined;
  /** Whether the technique is one a legato join is possible on at all — `false` is the lane-level refusal. */
  legatoCapable: boolean;
  /** Onsets at which the previous chord had not released when this one began. */
  overlappingOnsets: number;
  /** Notes at those onsets — the number a bow change would sound as that many new attacks. */
  notesAtOverlaps: number;
  /** Of those, the notes handed over to the voice that was already sounding. */
  joins: number;
  /** Of those, the notes that still begin their own attack. */
  reattacks: number;
  /** Every refusal, with its reason. */
  refusals: LegatoJoinRefusal[];
}

/**
 * ⭐ **The reading the owner asked for**, at the layer where the decision is made and before any audio exists.
 *
 * The three counts are deliberately the same three `chordChangeReattacks` reports, so the two can be compared
 * without a conversion: `overlappingOnsets` is that detector's `changesTotal`, `notesAtOverlaps` is what it counts
 * as fresh attacks, and `joins` is what this rule took away from it.
 */
export interface LegatoJoinReading {
  overlappingOnsets: number;
  notesAtOverlaps: number;
  joins: number;
  reattacks: number;
  lanes: LegatoJoinLaneReport[];
}

export interface LegatoJoinPass {
  /** The same events, in the same order, with `voiceRank` and `legato` written where the rule decided. */
  events: OfflineAudioLaneEvent[];
  reading: LegatoJoinReading;
}

/** Onsets are the same instant when they agree to this many decimals — the tolerance `gateFromNotes` and the detectors round at. */
const ONSET_TOLERANCE = 1e-6;

/** The rounding a group key uses, so two events at "the same" instant are one onset rather than two. */
function onsetKey(atSeconds: number): number {
  return Math.round(atSeconds / ONSET_TOLERANCE) * ONSET_TOLERANCE;
}

/**
 * **Every join the overlap allows, marked on the events, with the refusals kept beside them.**
 *
 * Pure: it reads the plan's events and returns new ones. Nothing is loaded and no audio node is touched, so the
 * whole rule can be judged — the joins *and* the three refusals — by reading the output.
 *
 * A lane is examined only when its notes have pitch (a plain sample event has no voice to carry). Notes are grouped
 * into onsets by their own `atSeconds`; each onset's notes are ranked by ascending pitch; consecutive onsets are
 * paired rank by rank. A pair joins only when every question in `decideLegatoJoin` answers legato **and** the two
 * events name the same recording — a program change mid-part is a new instrument, not a carried bow.
 */
export function planLegatoJoins(events: readonly OfflineAudioLaneEvent[]): LegatoJoinPass {
  const out: OfflineAudioLaneEvent[] = events.map((event) => ({ ...event }));
  const reading: LegatoJoinReading = { overlappingOnsets: 0, notesAtOverlaps: 0, joins: 0, reattacks: 0, lanes: [] };

  /** Lanes in the order they first appear, and the indexes of their pitched events, so one lane's rule cannot read another's. */
  const laneOrder: number[] = [];
  const byLane = new Map<number, number[]>();
  out.forEach((event, index) => {
    if (event.pitch === undefined) return;
    const lane = byLane.get(event.trackIndex);
    if (lane) lane.push(index);
    else {
      byLane.set(event.trackIndex, [index]);
      laneOrder.push(event.trackIndex);
    }
  });

  for (const trackIndex of laneOrder) {
    const indexes = byLane.get(trackIndex)!;
    const first = out[indexes[0]!]!;
    const assetId = first.assetId;
    const technique = techniqueOfAsset(assetId);
    const legatoCapable = technique !== undefined && LEGATO_TECHNIQUES.includes(technique);
    const report: LegatoJoinLaneReport = {
      trackIndex,
      name: first.name,
      assetId,
      technique,
      legatoCapable,
      overlappingOnsets: 0,
      notesAtOverlaps: 0,
      joins: 0,
      reattacks: 0,
      refusals: [],
    };

    /**
     * **The onsets, in time order, each one's notes ranked by pitch.**
     *
     * Rank is assigned for every lane the rule examined — not only for the lanes it joins — because the voice layer
     * keys its sounding voices by it, and a rank that exists only on joins would leave a fresh attack unfindable.
     */
    const groups = new Map<number, number[]>();
    for (const index of indexes) {
      const key = onsetKey(out[index]!.atSeconds);
      groups.set(key, [...(groups.get(key) ?? []), index]);
    }
    const onsets = [...groups.keys()].sort((a, b) => a - b);
    const ranked: number[][] = onsets.map((key) =>
      [...groups.get(key)!].sort((a, b) => (out[a]!.pitch ?? 0) - (out[b]!.pitch ?? 0) || a - b)
    );
    ranked.forEach((onset) => onset.forEach((index, rank) => (out[index]!.voiceRank = rank)));
    if (onsets.length < 2) continue;

    for (let index = 0; index + 1 < onsets.length; index += 1) {
      const previous = ranked[index]!;
      const next = ranked[index + 1]!;
      /**
       * ⭐ **The onset-level question is the one `chordChangeReattacks` asks** — "had the previous chord finished when
       * this one began?" — asked of the same `max(end)` the detector uses, so a lane's two readings are comparable
       * number for number rather than only in spirit.
       */
      const previousEnds = previous.map((eventIndex) => {
        const event = out[eventIndex]!;
        return event.seconds === undefined ? undefined : event.atSeconds + event.seconds;
      });
      const known = previousEnds.filter((end): end is number => end !== undefined);
      const latestEnd = known.length > 0 ? Math.max(...known) : undefined;
      const nextStart = out[next[0]!]!.atSeconds;
      const overlaps = latestEnd !== undefined && latestEnd > nextStart + JOIN_EPSILON_SECONDS;
      if (!overlaps) continue;
      report.overlappingOnsets += 1;
      report.notesAtOverlaps += next.length;
      reading.overlappingOnsets += 1;
      reading.notesAtOverlaps += next.length;

      next.forEach((eventIndex, rank) => {
        const event = out[eventIndex]!;
        const predecessorIndex = previous[rank];
        if (predecessorIndex === undefined) {
          const refusal: LegatoJoinRefusal = {
            trackIndex,
            name: report.name,
            atSeconds: event.atSeconds,
            pitch: event.pitch!,
            reason: "no-voice-to-continue",
            because: "the previous onset has no voice at this rank, so this note has nothing to be handed from",
          };
          report.refusals.push(refusal);
          report.reattacks += 1;
          reading.reattacks += 1;
          return;
        }
        const predecessor = out[predecessorIndex]!;
        const previousEnd = predecessor.seconds === undefined ? undefined : predecessor.atSeconds + predecessor.seconds;
        /**
         * **A predecessor whose length is not stated cannot be measured**, and "cannot be measured" is refused rather
         * than assumed: the whole rule turns on whether that voice is still sounding, and a plan that does not say is
         * not evidence that it is.
         */
        if (previousEnd === undefined) {
          report.refusals.push({
            trackIndex,
            name: report.name,
            atSeconds: event.atSeconds,
            pitch: event.pitch!,
            reason: "previous-length-unknown",
            because: "the previous voice's length is not stated, so whether it is still sounding cannot be measured",
          });
          report.reattacks += 1;
          reading.reattacks += 1;
          return;
        }
        /** A program change between two notes is a different instrument, not a carried bow — asked before the rule, because the rule is about one voice. */
        if (predecessor.assetId !== event.assetId) {
          report.refusals.push({
            trackIndex,
            name: report.name,
            atSeconds: event.atSeconds,
            pitch: event.pitch!,
            reason: "no-voice-to-continue",
            because: `the previous voice plays "${predecessor.assetId}" and this note plays "${event.assetId}", so a program change would be carried rather than a bow`,
          });
          report.reattacks += 1;
          reading.reattacks += 1;
          return;
        }
        const decision = decideLegatoJoin({
          previousEndSeconds: previousEnd,
          startSeconds: event.atSeconds,
          previousPitch: predecessor.pitch!,
          pitch: event.pitch!,
          technique,
        });
        if (decision.kind === "bow-change") {
          report.refusals.push({
            trackIndex,
            name: report.name,
            atSeconds: event.atSeconds,
            pitch: event.pitch!,
            reason: decision.refusal!,
            because: decision.because,
          });
          report.reattacks += 1;
          reading.reattacks += 1;
          return;
        }
        out[eventIndex]!.legato = {
          rank,
          fromPitch: predecessor.pitch!,
          fromSeconds: predecessor.atSeconds,
          overlapSeconds: previousEnd - event.atSeconds,
          because: decision.because,
        };
        report.joins += 1;
        reading.joins += 1;
      });
    }
    /** A lane with nothing to say is left out of the reading: it had no overlap, so no decision was forced on it. */
    if (report.overlappingOnsets > 0) reading.lanes.push(report);
  }

  return { events: out, reading };
}
