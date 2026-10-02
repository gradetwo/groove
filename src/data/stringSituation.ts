/**
 * ⭐ **A musical situation, resolved all the way onto a track — the wiring the string table was waiting for.**
 *
 * `src/data/stringTechniques.ts` measures what the pinned string library can play and writes down which technique
 * each musical situation wants. It returned a `TechniqueChoice` with an `assetId`, and the owner's report was that
 * the `assetId` had **nowhere to go**: the import paths stopped at `addTrack(next, "synth", …)` and every part stayed
 * an anonymous synthesiser. The bridge has since landed — `TrackV2.instrument` plus
 * `src/data/sampledInstruments.ts` makes a `kind:"synth"` track play a catalogue recording by **name** — and this
 * file is the missing piece between the two: it takes a situation and a part's own notes and returns the **name to
 * write on the track**, together with the evidence for every claim it made.
 *
 * ## What it decides, and what it refuses to decide
 *
 *  * **The technique** comes from `chooseTechnique` — the rule table, with its ordered preferences and its
 *    `rejected` list, so a fallback is visible rather than silent. This file does not re-rank anything.
 *  * **The register** is checked against the rule's own range **and** the part's whole compass, because one track
 *    carries one identity: a "walking" line that reaches above MIDI 60 is not answered with a walking bass and then
 *    quietly transposed, it is refused with the compass in the sentence.
 *  * **The length** is the longest note in the part, because that is the note the recording runs out on. A
 *    `fits` / `risky` / `exceeds` verdict travels with three executable next steps when it exceeds, each with its
 *    cost — never a silent truncation.
 *  * **The velocity** is reported as what it is: a **layer selector**, not a shaper. `velocity` is never written or
 *    scaled here; the reading says which recorded take each velocity reaches and how many takes there are, which is
 *    the whole of the dynamic resolution the material offers.
 *
 * ## The industry pattern this follows (§28)
 *
 * Steinberg's Cubase Expression Maps is the closest fully documented equivalent, and this file follows its shape
 * rather than inventing one. Its manual says an articulation's **Type** is either *Attribute* ("only single notes
 * are influenced") or *Direction* ("valid from its insertion position until the next articulation start"), that
 * articulations live in exclusive **Groups** ("articulations that cannot be combined, such as arco (bowed) and
 * pizzicato (plucked) for violin in the same group"), and that the groups are **priority-ordered** — "group 1
 * having the highest priority. This is useful if an expression map does not find an exact match for your data and
 * tries to identify the sound which matches most criteria" (Cubase Pro 11 Operation Manual, *Groups* and
 * *Articulations Section*). Spitfire Audio's UACC is the cross-library form of the same constraint and names its
 * limit out loud — "you can only select one articulation at a time so cannot layer articulations" — and Kontakt
 * reaches it from the other side, where an articulation is a **Group Start condition** ("Start on Key … keyswitches",
 * "Start on Controller … within a specific range"). So: a situation is the *attribute*, the technique table's
 * `preferred` list is the *exclusive priority group*, the first available entry wins, and **the fallback is
 * reported**. No source was found for Vienna's own "smart" switching beyond third-party pages (`未找到`).
 *
 * ## It changes nothing
 *
 * Like `legatoGapsFor` and `chordChangeReattacks`, this is a **reading**: it returns the identity to write and the
 * sentences to carry, and the caller writes them. That keeps one function usable by both import paths and by the
 * track tool, and keeps "what should play" from being decided in three places.
 */
import {
  LENGTH_REMEDIES,
  chooseTechnique,
  dynamicSteps,
  instrumentIdentityFor,
  resolveLengthConstraint,
  ruleFor,
  velocityLayerFor,
  type LengthRemedy,
  type LengthVerdict,
  type StringInstrument,
  type StringSituation,
  type StringTechnique,
  type TechniqueRejection,
} from "./stringTechniques";
import type { NoteEvent } from "../types/arrangementV2";

/**
 * One part's request: the instrument it is, and what the music is doing.
 *
 * The two fields are separate because the situation is not a synonym for the technique — "short and repeating" is a
 * fact about the notes, and the technique that serves it is a decision the rule table makes and this file reports.
 */
export interface StringSituationSpec {
  instrument: StringInstrument;
  situation: StringSituation;
}

/** The length reading: the verdict for the part's **longest** note, and the count behind it. */
export interface SituationLengthReading {
  /** The verdict for the longest note, which is the one that runs out first. */
  verdict: LengthVerdict;
  /** That note's own numbers, so a reply can compare them without re-deriving them. */
  lengthBeats: number;
  seconds: number;
  pitch: number;
  /** Every note of the part, counted by verdict. */
  counts: { fits: number; risky: number; exceeds: number };
  /** The three next steps with their costs; empty unless the verdict is `exceeds`. */
  remedies: readonly LengthRemedy[];
}

/** The velocity reading: which recorded take each note's velocity reaches. Velocity is reported, never rewritten. */
export interface SituationVelocityReading {
  /** How many recorded layers the program declares, i.e. how many dynamics a crescendo actually has. */
  layers: number;
  /** The layer indices the part's velocities reach, ascending. */
  used: number[];
  /** How many notes sat exactly on a layer's low or high edge, where a neighbouring take would have been the same loudness. */
  atEdge: number;
  /** Velocities that fell outside every declared layer — a caller's mistake, reported rather than clamped. */
  unlayered: number[];
  note: string;
}

/** The register reading: the part's compass against the chosen program's, and against the rule's own register. */
export interface SituationRangeReading {
  lowest: number;
  highest: number;
  programLowest: number;
  programHighest: number;
  /** How many notes the chosen program covers, and how many it does not. */
  inside: number;
  outside: number;
  /** The rule's own register, when the situation has one ("walking" is a low line). */
  situationRange?: readonly [number, number];
}

/** Everything one situation resolved to, including the reason it could not. */
export interface SituationPlacement {
  spec: StringSituationSpec;
  /** How many notes the part holds, so "one note out of range" and "all of them" read differently. */
  notes: number;
  /** The technique chosen, when one was. */
  technique?: StringTechnique;
  /** The catalogue recording it plays — the `assetId` that previously had nowhere to go. */
  assetId?: string;
  /** ⭐ The value to write on `TrackV2.instrument`, which is how the recording is reached. */
  instrument?: string;
  /** Whether the rule's first preference won. `false` means this is a documented fallback. */
  firstChoice: boolean;
  /** Every preference that was passed over, with the reason — so a fallback is visible rather than silent. */
  rejected: TechniqueRejection[];
  range?: SituationRangeReading;
  length?: SituationLengthReading;
  velocity?: SituationVelocityReading;
  /** Why the situation could not serve this part, when it could not. Absent when a program was chosen. */
  refused?: string;
  /** One sentence for a reply: the choice, the evidence, and any fallback — never a bare asset id. */
  note: string;
  /** Executable sentences for a `problems` list. Empty when there is nothing a caller must act on. */
  problems: string[];
}

/** The words for a passed-over preference, so the fallback sentence names the reason rather than a code. */
function rejectionReason(rejection: TechniqueRejection): string {
  switch (rejection.reason) {
    case "not-mirrored":
      return "its bytes are not in the mirror";
    case "no-program":
      return "the library has no such program";
    case "out-of-range":
      return "it does not cover the part's register";
    case "length-exceeds":
      return "its recording is shorter than the note";
  }
}

/** Three decimals, matching the technique table's own rounding, so a seconds figure reads as a measurement. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The middle note of a part, which is the note a register check is representative for. */
function medianPitch(notes: readonly NoteEvent[]): number {
  const pitches = [...notes.map((note) => note.pitch)].sort((a, b) => a - b);
  return pitches[Math.floor((pitches.length - 1) / 2)]!;
}

/** The note that runs out first — the one the length verdict is about. Ties go to the first, so the reading is stable. */
function longestNote(notes: readonly NoteEvent[]): NoteEvent {
  return notes.reduce((longest, note) => (note.lengthBeats > longest.lengthBeats ? note : longest), notes[0]!);
}

/** How a length verdict reads in a sentence. */
function lengthSentence(length: SituationLengthReading): string {
  const { verdict, seconds } = length;
  if (verdict.kind === "fits") {
    return `fits — the longest note is ${seconds} s, inside the program's shortest sample by ${verdict.headroomSeconds} s`;
  }
  if (verdict.kind === "risky") {
    return `risky — the longest note is ${seconds} s, past the shortest sample (${verdict.safeSeconds} s) but inside the longest (${verdict.maxSampleSeconds} s), so whether it sounds whole depends on which pitch's sample answered`;
  }
  return `exceeds — the longest note is ${seconds} s, past the program's longest sample (${verdict.maxSampleSeconds} s), so the recording stops before the note does`;
}

/** The three next steps, in the remedy table's own order, each with the cost the table attaches to it. */
function remedySentence(remedies: readonly LengthRemedy[]): string {
  const parts = remedies.map((remedy, index) => `(${index + 1}) ${remedy.remedy}: ${remedy.cost}`);
  return `three next steps, each with its cost: ${parts.join(" ")}`;
}

/**
 * ⭐ **Resolve one part's situation into the identity to write and the evidence for it.**
 *
 * `bpm` is required because the length question is a question about seconds, and a caller passing beats without a
 * tempo would get a confident wrong answer. A tempo that is missing or nonsensical falls back to **120**, the same
 * default the arrangement's own compile uses when the model states none — so a caller that has not looked it up
 * cannot report a verdict the renderer would not produce.
 *
 * An empty part is not an error: there is nothing to choose a register from, so it is reported as refused with a
 * sentence rather than a default technique being invented for notes that do not exist.
 */
export function placementForPart(
  spec: StringSituationSpec,
  notes: readonly NoteEvent[],
  bpm: number
): SituationPlacement {
  const tempo = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  const base = { spec, notes: notes.length, firstChoice: false, rejected: [] as TechniqueRejection[], problems: [] as string[] };

  if (notes.length === 0) {
    return {
      ...base,
      refused: `the part holds no notes, so there is nothing to read a register or a length from`,
      note: `${spec.situation} on ${spec.instrument}: not applied — the part holds no notes.`,
    };
  }

  const rule = ruleFor(spec.situation);
  if (!rule) {
    return {
      ...base,
      refused: `"${spec.situation}" is not a situation the string rule table covers`,
      note: `${spec.instrument}: the situation "${spec.situation}" is not one this table answers.`,
    };
  }

  const lowest = notes.reduce((value, note) => Math.min(value, note.pitch), notes[0]!.pitch);
  const highest = notes.reduce((value, note) => Math.max(value, note.pitch), notes[0]!.pitch);

  /**
   * ⭐ **The rule's register is checked against the part's whole compass, before any technique is.**
   *
   * `chooseTechnique` checks one note, and one track carries one identity. So a part that reaches above the walking
   * register is not "mostly a walking bass": it is a part this situation does not describe, and the sentence says
   * what the compass actually is so the caller can split it or name an instrument directly.
   */
  if (rule.range && (lowest < rule.range[0] || highest > rule.range[1])) {
    const refused =
      `the situation "${spec.situation}" lives in MIDI ${rule.range[0]}–${rule.range[1]}, and this part's compass is ${lowest}–${highest}, ` +
      `so the situation does not describe it — split the part at the register boundary, or name the instrument directly`;
    return {
      ...base,
      refused,
      note: `${spec.situation} on ${spec.instrument}: not applied — part compass ${lowest}–${highest}, outside the situation's own register ${rule.range[0]}–${rule.range[1]}.`,
      problems: [refused],
    };
  }

  const longest = longestNote(notes);
  const choice = chooseTechnique({
    instrument: spec.instrument,
    situation: spec.situation,
    note: medianPitch(notes),
    lengthBeats: longest.lengthBeats,
    bpm: tempo,
  });

  if (!choice.program || !choice.assetId) {
    const rejected = choice.rejected.map((rejection) => `${rejection.technique} (${rejectionReason(rejection)})`);
    const refused =
      `no program serves "${spec.situation}" on ${spec.instrument} for this part` +
      (rejected.length ? `: ${rejected.join(", ")}` : "") +
      ` — list_arrangement_instruments names the recordings that do exist`;
    return {
      ...base,
      rejected: choice.rejected,
      refused,
      note: `${spec.situation} on ${spec.instrument}: no technique could be chosen — ${rejected.join(", ") || "the rule has no preference that this instrument has a row for"}.`,
      problems: [refused],
    };
  }

  const program = choice.program;
  const identity = instrumentIdentityFor(program);
  const outsideNotes = notes.filter((note) => note.pitch < program.lowestNote || note.pitch > program.highestNote);
  const range: SituationRangeReading = {
    lowest,
    highest,
    programLowest: program.lowestNote,
    programHighest: program.highestNote,
    inside: notes.length - outsideNotes.length,
    outside: outsideNotes.length,
    ...(rule.range ? { situationRange: rule.range } : {}),
  };

  const verdicts = notes.map((note) => resolveLengthConstraint(program, note.lengthBeats, tempo));
  const counts = {
    fits: verdicts.filter((verdict) => verdict.kind === "fits").length,
    risky: verdicts.filter((verdict) => verdict.kind === "risky").length,
    exceeds: verdicts.filter((verdict) => verdict.kind === "exceeds").length,
  };
  const verdict = choice.length ?? resolveLengthConstraint(program, longest.lengthBeats, tempo);
  const length: SituationLengthReading = {
    verdict,
    lengthBeats: longest.lengthBeats,
    seconds: round3((longest.lengthBeats * 60) / tempo),
    pitch: longest.pitch,
    counts,
    remedies: verdict.kind === "exceeds" ? LENGTH_REMEDIES : [],
  };

  const layerChoices = notes.map((note) => velocityLayerFor(program, note.velocity));
  const used = [...new Set(layerChoices.filter((entry) => entry !== undefined).map((entry) => entry!.index))].sort((a, b) => a - b);
  const unlayered = [...new Set(notes.filter((note) => velocityLayerFor(program, note.velocity) === undefined).map((note) => note.velocity))].sort((a, b) => a - b);
  const velocity: SituationVelocityReading = {
    layers: dynamicSteps(program),
    used,
    atEdge: layerChoices.filter((entry) => entry?.atEdge).length,
    unlayered,
    note:
      `velocity selects a recorded take rather than shaping one: ${dynamicSteps(program)} layer(s) exist` +
      (used.length ? `, and the part's velocities reach layer ${used.join(", ")}` : "") +
      (dynamicSteps(program) === 1 ? ` — one layer means a velocity ramp changes nothing at all` : ``) +
      (unlayered.length ? `; ${unlayered.length} velocity value(s) fall outside every declared layer and are reported rather than clamped` : ``),
  };

  const fallback = choice.rejected
    .map((rejection) => `${rejection.technique} was asked for first and ${rejectionReason(rejection)}`)
    .join("; ");
  const note =
    `${spec.situation} on ${spec.instrument}: ${program.technique} → ${program.assetId}, written as track instrument "${identity}"` +
    (choice.firstChoice ? ` (the rule's first choice)` : ` (a fallback — ${fallback})`) +
    `; ${notes.length} note(s), compass ${lowest}–${highest}, ${range.inside} inside the program's ${program.lowestNote}–${program.highestNote}` +
    (range.outside ? `, ${range.outside} outside` : ``) +
    `; length ${lengthSentence(length)}; ${velocity.note}.`;

  const problems: string[] = [];
  if (!choice.firstChoice && fallback) {
    problems.push(
      `${spec.situation} on ${spec.instrument}: ${fallback}, so "${identity}" (${program.technique}) is what plays — ${program.assetId}. ` +
        `That is a different gesture from the one asked for, and it is reported rather than passed off as the first choice.`
    );
  }
  if (range.outside > 0) {
    problems.push(
      `${range.outside} of ${notes.length} note(s) of this part fall outside ${program.assetId}'s compass (${program.lowestNote}–${program.highestNote}), ` +
        `so those notes have no sample on this program — move them into range, or split the part`
    );
  }
  if (verdict.kind === "exceeds") {
    problems.push(
      `${program.assetId} is a one-shot recording: the part's longest note is ${length.seconds} s and the program's longest sample is ${verdict.maxSampleSeconds} s, ` +
        `so the note will stop early. ${remedySentence(LENGTH_REMEDIES)}`
    );
  }

  return {
    ...base,
    technique: program.technique,
    assetId: program.assetId,
    instrument: identity,
    firstChoice: choice.firstChoice,
    rejected: choice.rejected,
    range,
    length,
    velocity,
    note,
    problems,
  };
}

/**
 * ⭐ **The same choice, for a caller that has not written the notes yet** — `add_arrangement_track`.
 *
 * A situation given at track creation cannot have its register or its length read, because there is nothing to read
 * them from. Rather than guessing a pitch (which would turn "not checked" into a confident wrong answer) or refusing
 * the request, this resolves the **technique** only and says, in the sentence, exactly which two questions are still
 * open. The import path — where the notes exist — is `placementForPart`, and it is the one that answers them.
 *
 * The rule's own register still constrains the answer where it can: a `plucked-walking` request resolves to the
 * contrabass pizzicato, because that is the only row whose **whole compass** sits inside 24–60 (`servesSituation` in
 * `mcp/instruments.ts` makes the same check for the listing). What cannot be checked is whether the caller's notes
 * will sit there.
 */
export function placementForTrack(spec: StringSituationSpec): SituationPlacement {
  const base = { spec, notes: 0, firstChoice: false, rejected: [] as TechniqueRejection[], problems: [] as string[] };
  const rule = ruleFor(spec.situation);
  if (!rule) {
    return {
      ...base,
      refused: `"${spec.situation}" is not a situation the string rule table covers`,
      note: `${spec.instrument}: the situation "${spec.situation}" is not one this table answers.`,
    };
  }
  const choice = chooseTechnique({ instrument: spec.instrument, situation: spec.situation });
  const open = `the part's register and note lengths are not checked yet, because no notes exist — they are read when a part is imported (placementForPart)`;
  if (!choice.program || !choice.assetId) {
    const rejected = choice.rejected.map((rejection) => `${rejection.technique} (${rejectionReason(rejection)})`);
    const refused =
      `no program serves "${spec.situation}" on ${spec.instrument}` +
      (rejected.length ? `: ${rejected.join(", ")}` : "") +
      ` — list_arrangement_instruments names the recordings that do exist`;
    return { ...base, rejected: choice.rejected, refused, note: `${spec.situation} on ${spec.instrument}: no technique could be chosen — ${rejected.join(", ") || "the rule has no preference this instrument has a row for"}.`, problems: [refused] };
  }
  const program = choice.program;
  /**
   * ⭐ **The rule's register is checked by containment here, not by a guessed note.**
   *
   * `chooseTechnique` checks one pitch, and this caller has none. What *can* be checked without notes is the property
   * the listing already uses (`servesSituation`): a rule with a register describes a program whose **whole compass**
   * sits inside it. So `plucked-walking` reaches the contrabass pizzicato and refuses the violin's, which is a plucked
   * string but not a walking line.
   */
  if (rule.range && !(program.lowestNote >= rule.range[0] && program.highestNote <= rule.range[1])) {
    const refused =
      `the situation "${spec.situation}" lives in MIDI ${rule.range[0]}–${rule.range[1]}, and ${program.assetId}'s compass is ${program.lowestNote}–${program.highestNote}, ` +
      `which is a plucked string but not that situation — name the instrument directly if that is what you mean`;
    return {
      ...base,
      rejected: choice.rejected,
      refused,
      note: `${spec.situation} on ${spec.instrument}: not applied — ${program.assetId} spans ${program.lowestNote}–${program.highestNote}, outside the situation's own register ${rule.range[0]}–${rule.range[1]}.`,
      problems: [refused],
    };
  }
  const identity = instrumentIdentityFor(program);
  const fallback = choice.rejected
    .map((rejection) => `${rejection.technique} was asked for first and ${rejectionReason(rejection)}`)
    .join("; ");
  const note =
    `${spec.situation} on ${spec.instrument}: ${program.technique} → ${program.assetId}, written as track instrument "${identity}"` +
    (choice.firstChoice ? ` (the rule's first choice)` : ` (a fallback — ${fallback})`) +
    `; ${open}.`;
  const problems: string[] = [];
  if (!choice.firstChoice && fallback) {
    problems.push(
      `${spec.situation} on ${spec.instrument}: ${fallback}, so "${identity}" (${program.technique}) is what plays — ${program.assetId}. ` +
        `That is a different gesture from the one asked for, and it is reported rather than passed off as the first choice.`
    );
  }
  return { ...base, technique: program.technique, assetId: program.assetId, instrument: identity, firstChoice: choice.firstChoice, rejected: choice.rejected, note, problems };
}
