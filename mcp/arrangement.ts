/**
 * The v2 arrangement surface an agent composes with.
 *
 * The MCP tools could build a **v1 song** — clips, sections, lane slots — and nothing else. The arrangement the interface has used since `/new` was unreachable: an agent could not add a track, choose the kind of one, point a sampler at one of the mirrored
 * libraries, write the steps a track plays, or file a recording onto it. That gap is what this module closes.
 *
 * **The operations are the interface's own.** Every function here calls `src/data/arrangementEdits`, the same code a track row's button calls, so "what the agent did" and "what a person did" cannot drift into two behaviours — and each has the criteria
 * that layer already carries. What is added is the part the interface does not need: a process-local map keyed by id, because MCP calls are stateless and the id is how a later call names the same arrangement.
 *
 * The map is deliberately not persisted, exactly as the song map is not: the application owns projects, and this is a scratchpad for one session.
 */
import { stepCountFor, stepsPerBarFor } from "../src/data/noteEvents";
import { toMusicXml } from "../src/data/musicxml";
import { fromMusicXml, fromMusicXmlBytes } from "../src/data/musicxmlImport";
import type { ImportedPart } from "../src/data/musicxmlImport";
import { fromMidi } from "../src/data/midiToArrangement";
import type { MidiArrangementImport } from "../src/data/midiToArrangement";
import { DEFAULT_NOTE_CONVENTION, noteName, type NoteConvention } from "../src/data/pitchTruth";
import { fromLogicProjectBase64 } from "../src/data/logicToArrangement";
import { logicProjectBundle } from "../src/data/arrangementToLogic";
import { arrangementToMidi } from "../src/data/arrangementToMidi";
import type { MusicXmlImport } from "../src/data/musicxmlImport";
import {
  TEMPLATES,
  addTake,
  addTrack,
  addTrackNote,
  addTrackNotes,
  assignTakeToRange,
  changeTrackKind,
  carriesStarterNotes,
  createArrangement,
  createArrangementFromTemplate,
  moveTrackNote,
  removeTrack,
  removeTrackNote,
  renameTrack,
  selectTrackTake,
  setCollapsed,
  setArrangementBars,
  setArrangementTempo,
  setArrangementTempoMap,
  setTrackFlag,
  setArrangementTimeSignature,
  setTrackGain,
  setTrackNoteLength,
  setTrackPan,
  setTrackParent,
  setTrackRegion,
  setTrackSample,
  setTrackSteps,
} from "../src/data/arrangementEdits";
import type { ArrangementV2, NoteEvent, TrackKindV2, TrackV2 } from "../src/types/arrangementV2";
import type { PlannedTake } from "../src/data/takePlanning";
import { compileArrangementToSongInput, laneInstrumentForTrack, laneRoleForTrack } from "../src/data/arrangementCompile";
import { resolveInstrumentPresetKey } from "../src/audio/instrumentPresets";
import { SAMPLED_INSTRUMENT_SYNTHS, sampledAssetForLane, sampledInstrumentFor, sampledInstrumentGapReason } from "../src/data/sampledInstruments";
import { placementForPart, placementForTrack, type SituationPlacement, type StringSituationSpec } from "../src/data/stringSituation";
import { importedPartVoice } from "../src/data/arrangementImport";
import { DEFAULT_SYNTH_PRESETS } from "../src/audio/PolySynth";
import { stepsFromNotes, STEPS_PER_BEAT } from "../src/data/noteEvents";
import { beatsPerBar } from "../src/data/genreExpression";
import { createSong } from "../src/types/song";
import { flattenSong, type FlattenedSong } from "../src/data/songFlatten";

const arrangements = new Map<string, ArrangementV2>();
let idSequence = 0;

export function clearMcpArrangements(): void {
  arrangements.clear();
  idSequence = 0;
}

export function getMcpArrangement(arrangementId: string): ArrangementV2 | undefined {
  return arrangements.get(arrangementId);
}

/**
 * ⭐ **The write side of the lookup, for an arrangement that came from a file rather than from the editor.**
 *
 * Importing needs to put a whole arrangement in, not build one field by field, and the store had only a get. The id is
 * fresh by default, because an imported work is a new one: two files of the same name must not collide in the store.
 */
/**
 * ⭐ **A counter beside the clock, because two imports can share a millisecond.** Measured on the pipeline: a criterion that
 * imports twice got the same id and failed there while passing here, which is what a name built from the time alone does
 * under a fast machine.
 */
let importSequence = 0;

export function putMcpArrangement(
  arrangement: ArrangementV2,
  id = `imported-${Date.now().toString(36)}-${(importSequence++).toString(36)}`
): ArrangementSummary {
  arrangements.set(id, arrangement);
  return summariseArrangement(id, arrangement);
}
/**
 * ⭐ **One change back, or several, and it says so when there is nothing to undo.** It reads the history the seam records,
 * drops the entries it consumed, and puts the recorded state back — the same shape as the older store's undo, keyed by the
 * arrangement and carrying no tool name, because the seam does not know its caller and a name nothing reads is noise.
 */
export function undoMcpArrangement(arrangementId: string, steps = 1): ArrangementEditResult {
  const entries = arrangementHistory.get(arrangementId);
  if (!entries?.length) {
    throw new Error(`nothing to undo for "${arrangementId}" — it has not been changed since it was created`);
  }
  const take = Math.max(1, Math.min(Math.floor(steps), entries.length));
  const before = entries[entries.length - take]!;
  arrangementHistory.set(arrangementId, entries.slice(0, entries.length - take));
  arrangements.set(arrangementId, before);
  return { summary: summariseArrangement(arrangementId, before), problems: [] };
}



/** Every function that changes an arrangement reports the same way: a summary, plus anything wrong with the request. */
export interface ArrangementEditResult {
  summary: ArrangementSummary;
  problems: string[];
}

export interface ArrangementTrackSummary {
  id: string;
  kind: TrackKindV2;
  name: string;
  muted: boolean;
  soloed: boolean;
  collapsed: boolean;
  /**
   * ⭐ **What this track actually sounds with today** — the first line the report asked for, because a source nobody can
   * see is a source nobody can change. It is resolved through the renderer's own path (the compile's lane role, the
   * engine's preset resolver) rather than inferred from the kind, so `sound.presetName` on the reply and the
   * preset the renderer reaches are the same answer by construction.
   */
  sound: ArrangementTrackSound;
  /** Level in dB, absent meaning unity — the value the row's slider shows. */
  gainDb?: number;
  /** −1 to 1, absent meaning centre. */
  pan?: number;
  parentId?: string;
  /** The catalogue asset a sampler track plays, when one is chosen. */
  sampleAssetId?: string;
  /** The step grid its notes fall on, for a caller that thinks in squares. Derived from `notes` rather than stored. */
  steps: number[];
  /** **The notes themselves** — where each begins, how long it is held, its pitch and velocity. This is the model. */
  notes: Array<{ pitch: number; startBeats: number; lengthBeats: number; velocity: number }>;
  /** How many of those steps are on, which is the number a person would count. */
  stepsOn: number;
  /** Take ids in recorded order, and which one plays. */
  takes: string[];
  selectedTakeId?: string;
}

/**
 * ⭐ **The sound source a track reaches, in the renderer's own terms.**
 *
 * `source` is the class of voice; `assetId` or `presetKey`/`presetName` is the identity of it. A caller can act on
 * either: `set_arrangement_track_asset` changes a `catalogue-asset`, and a `builtin-synth` is exactly the source
 * that **cannot** be changed, which is why `guidance` says what to do instead.
 */
export interface ArrangementTrackSound {
  /** Where the sound comes from. `silent` is the absent case, named rather than omitted. */
  source: "catalogue-asset" | "builtin-synth" | "builtin-drums" | "silent";
  /** `catalogue-asset` only: the asset the sampler plays. */
  assetId?: string;
  /** `builtin-synth` only: the resolved preset's key, as `resolveInstrumentPresetKey` returns it. */
  presetKey?: string;
  /** `builtin-synth` only: the preset's display name, the string the engine's own preset object carries. */
  presetName?: string;
  /** Whether a tool can change this source: a sampler's asset can, a built-in synth's timbre cannot. */
  selectable: boolean;
  /** One line for `describe_arrangement` and for a log. */
  detail: string;
  /** The **executable** next step when this is probably not what was wanted; absent when nothing needs doing. */
  guidance?: string;
}

/**
 * ⭐ **The sound source, read off the two places that actually decide it.**
 *
 * The report's root cause was that nothing in a reply said which of these a track was, so an agent that meant a piano
 * could not tell it had asked for a fixed synthesiser. Both halves are read rather than guessed:
 *
 *   * **what voice** comes from the compile — `laneRoleForTrack` (the v1 role the lane is built with) and
 *     `laneInstrumentForTrack` (the `instrument` string on that lane);
 *   * **which preset** comes from `resolveInstrumentPresetKey`, the same walk the live engine and the offline exporter
 *     perform (`AudioEngine`/`WavExporter` both call `resolveInstrumentPreset`).
 *
 * A drum kit is named as the built-in drum voices rather than by a preset: its lane resolves a preset like every other,
 * but the engine's drum dispatch never consults it (`instrumentPresets.ts` says so), so reporting the preset there would
 * be a true answer to the wrong question.
 */
function soundForTrack(track: TrackV2): ArrangementTrackSound {
  const role = laneRoleForTrack(track);
  if (role === undefined) {
    return { source: "silent", selectable: false, detail: "a folder groups without sounding" };
  }
  if (track.kind === "sampler") {
    if (!track.sample) {
      return {
        source: "silent",
        selectable: true,
        detail: "a sampler with no catalogue asset, so it is silent",
        guidance: "give it one with set_arrangement_track_asset, or re-create it with add_arrangement_track {kind:\"sampler\", assetId:\"…\"}",
      };
    }
    return {
      source: "catalogue-asset",
      assetId: track.sample.assetId,
      selectable: true,
      detail: `plays catalogue asset "${track.sample.assetId}"`,
    };
  }
  const laneInstrument = laneInstrumentForTrack(track);
  const presetKey = resolveInstrumentPresetKey(laneInstrument, role);
  const presetName = DEFAULT_SYNTH_PRESETS[presetKey]?.name ?? presetKey;
  /**
   * ⭐ **The recorded instrument this lane sounds, read through the one table the renderer reads.**
   *
   * A track the projection built from a v1 lane carries that lane's instrument name, and the written table
   * (`src/data/sampledInstruments.ts`) says which recording that name is — so this report cannot disagree with the
   * renderer, because both ask `sampledAssetForLane`. A `synth` track with no declared instrument, and a drum or effect
   * lane, answer `undefined` and are reported as the built-in voices they are.
   */
  const sampledAsset = sampledAssetForLane({ track_id: role, instrument: laneInstrument, sample: track.sample });
  if (sampledAsset) {
    return {
      source: "catalogue-asset",
      assetId: sampledAsset,
      /**
       * ⭐ **`false`, and the difference from a sampler's `true` is the whole point of the field.**
       *
       * `selectable` answers "can a tool change where this sound comes from" — a sampler's asset can
       * (`set_arrangement_track_asset`), and a **synth track's recorded instrument cannot**: the asset is derived from
       * the instrument name, no tool sets a synth track's instrument after it is created, and `set_arrangement_track_asset`
       * refuses a `synth` track out loud. Reporting `true` here would send a caller to a call that errors, which is the
       * "an answer that looks right" failure this report exists to remove.
       */
      selectable: false,
      detail: `plays the catalogue recording "${sampledAsset}" through the sampled path, resolved from the instrument "${laneInstrument}" — a configured sample mirror must serve it, or the lane falls back to the built-in preset. The instrument is chosen when the track is added (add_arrangement_track {kind:"synth", instrument:"…"}); nothing changes it afterwards`,
      guidance: `to change what this lane sounds, add the track again with a different instrument from list_arrangement_instruments's mappedInstruments, or use kind:"sampler" and point set_arrangement_track_asset at a catalogue asset`,
    };
  }
  if (track.kind === "drumkit") {
    return {
      source: "builtin-drums",
      selectable: false,
      detail: "the built-in drum voices (kick/snare/hat synthesis), not a sampled kit",
    };
  }
  /**
   * ⭐ **A name a composer would expect a recording for, and the catalogue does not carry — named, with the next step.**
   *
   * `rhodes_ep`, `finger_bass`, `distorted_guitar` and the rest are real instruments the mirrored libraries do not hold;
   * saying "built-in synth preset" for them is true and useless. The reason and the fix come from the same table the
   * renderer consults, so the reply and the render's own problem list say the same thing.
   */
  const gapReason = sampledInstrumentGapReason(laneInstrument);
  if (track.kind === "fx") {
    return { source: "builtin-synth", presetKey, presetName, selectable: false, detail: `built-in synth preset "${presetName}" (${presetKey})` };
  }
  return {
    source: "builtin-synth",
    presetKey,
    presetName,
    selectable: false,
    detail: `built-in synth preset "${presetName}" (${presetKey}) — fixed, and not a sampled instrument`,
    guidance: gapReason
      ? `no catalogue recording is mapped for the instrument "${laneInstrument}" (${gapReason}), so this lane already has the best voice available — mirror a library that carries one and add a row to src/data/sampledInstruments.ts, or use kind:"sampler" with an asset from list_arrangement_instruments`
      : `a synth track's timbre cannot be pointed at a recorded instrument; for a real piano, strings or bass add a track with kind:"sampler" and give it an asset (add_arrangement_track {kind:"sampler", assetId:"…"}; list_arrangement_instruments lists the ids)`,
  };
}

export interface ArrangementSummary {
  arrangementId: string;
  songId: string;
  trackCount: number;
  tracks: ArrangementTrackSummary[];
  /** The templates a caller may name, so the list is discoverable rather than guessable. */
  templates: string[];
  /** How long the arrangement is, in bars — absent for an older file, which means "as long as its content needs". */
  bars?: number;
  /** Beats per minute — absent for an older file, which plays at 120, the value the compile used to hardcode. */
  bpm?: number;
  /**
   * How many sixteenth steps the arrangement actually spans: its stated length or its last note, whichever is further. **Reported beside `bars` rather than instead of it**, because "where may I write" is a step question and "how long is the"
   * is a bar question.
   */
  steps: number;
  /** Anything that would stop it being heard: an empty arrangement, a sampler with no catalogue asset. */
  problems: string[];
}

function requireArrangement(arrangementId: string): ArrangementV2 {
  const arrangement = arrangements.get(arrangementId);
  if (!arrangement) throw new Error(`unknown arrangementId "${arrangementId}" — create one with create_arrangement`);
  return arrangement;
}

function summariseTrack(track: TrackV2, arrangement: ArrangementV2): ArrangementTrackSummary {
  const notes = arrangement.notesByTrack?.[track.id] ?? [];
  /**
   * **Notes, and the grid that views them.** The model holds notes — start, length, pitch, velocity — because that is what a piano roll writes; the step row is derived for a caller that thinks in squares. A summary that reported only steps would hide a note's length
   * and its exact position, and one that reported only notes would make a drum pattern unreadable.
   */
  const { steps } = stepsFromNotes(notes, Math.max(16, ...notes.map((note) => Math.round(note.startBeats * STEPS_PER_BEAT) + 1)));
  return {
    id: track.id,
    kind: track.kind,
    name: track.name,
    muted: track.muted === true,
    soloed: track.soloed === true,
    collapsed: track.collapsed === true,
    ...(track.gainDb === undefined ? {} : { gainDb: track.gainDb }),
    ...(track.pan === undefined ? {} : { pan: track.pan }),
    ...(track.parentId ? { parentId: track.parentId } : {}),
    ...(track.sample ? { sampleAssetId: track.sample.assetId } : {}),
    sound: soundForTrack(track),
    steps,
    stepsOn: steps.filter((value) => value !== 0).length,
    notes: notes.map((note) => ({ pitch: note.pitch, startBeats: note.startBeats, lengthBeats: note.lengthBeats, velocity: note.velocity })),
    takes: (track.takes ?? []).map((take) => take.id),
    ...(track.selectedTakeId ? { selectedTakeId: track.selectedTakeId } : {}),
  };
}

/**
 * The id is passed in rather than read off the arrangement, because the model has no id field: an arrangement belongs to a `songId` and nothing more. Identity for the MCP surface is the key in this module's map, which is why it travels
 * alongside.
 */
export function summariseArrangement(arrangementId: string, arrangement: ArrangementV2): ArrangementSummary {
  const problems: string[] = [];
  if (arrangement.tracks.length === 0) problems.push("the arrangement has no tracks, so it would render nothing");
  for (const track of arrangement.tracks) {
    // Stated because it is the mistake an agent makes here: a sampler with no catalogue asset is silent, and silence reads as a bug in the renderer.
    if (track.kind === "sampler" && !track.sample) problems.push(`"${track.name}" is a sampler with no catalogue asset, so it will be silent`);
    /**
     * ⭐ **A synth track says so, and says what to do instead — this is the report's own reproduction.**
     *
     * An agent that meant a piano built a track with the kind then called `instrument`, wrote 198 notes and heard a
     * muddy fixed synthesiser: the word it chose was the trap, and nothing in the reply named the source, so there was
     * nothing to notice and nothing to correct. The entry below is not "no instrument was specified" — that is not a
     * next step. It names **which preset is sounding** and the **one call that would sound a recorded instrument**.
     *
     * It is here rather than in the render tools so that it reaches every reply a caller reads, including
     * `get_arrangement` and the render replies' `arrangementProblems`. Deletion test: remove this branch and the
     * criterion in `src/test/mcpArrangement.test.ts` that reproduces the report's path goes red.
     */
    const sound = soundForTrack(track);
    /**
     * ⭐ **And a synth track that *is* a recording says nothing**, because there is nothing to correct.
     *
     * The branch below exists to name a trap: a caller who meant a piano chose `synth` and heard a fixed synthesiser.
     * A synth track declaring a mapped instrument (`piano_lead`) is not that mistake — it is the answer to it — so the
     * report would be **false** as well as noisy. The source decides, and `soundForTrack` is the same answer the reply's
     * `sound` field carries, so the two cannot disagree.
     */
    if (track.kind === "synth" && sound.source !== "catalogue-asset") {
      problems.push(
        `"${track.name}" is a synth track and sounds through the built-in preset "${sound.presetName}" (${sound.presetKey}): a synth's timbre cannot be pointed at a recorded instrument. For a real piano, strings or bass, add a track with kind:"sampler" and give it an asset — add_arrangement_track {kind:"sampler", assetId:"<id>"}, with the ids from list_arrangement_instruments`
      );
    }
    /**
     * ⭐ **Starter content is reported wherever it is present.** The MCP surface no longer seeds it (`createMcpArrangement`),
     * but the app's starter experience still does, and a caller reading a reply has no other way to tell notes it wrote from
     * notes that arrived with the track. Measured reports of exactly this shape are in `docs/MUSE_REPORT_2026-10-01.md`.
     */
    if (carriesStarterNotes(track.kind, arrangement.notesByTrack?.[track.id])) {
      problems.push(
        `"${track.name}" still holds the ${(arrangement.notesByTrack?.[track.id] ?? []).length} starter note(s) its kind is created with, which the caller did not write — clear or keep them deliberately`
      );
    }
    if (track.parentId && !arrangement.tracks.some((candidate) => candidate.id === track.parentId)) {
      problems.push(`"${track.name}" names a folder that is not there`);
    }
    /**
     * ⭐ **A chord in a step column loses notes, and now says so.**
     *
     * This model holds notes, so several may start together; the engine's lanes trigger at **one pitch per step**, and
     * `stepsFromNotes` keeps the lowest (its own comment says why). Making the lane play the whole stack would change
     * what every existing chord sounds like — a product decision, not taken here. What is taken is the silence: a
     * creator who writes a chord learns which column lost which pitches, in the same `problems` list that names a
     * sampler with no instrument. Deletion test: remove this branch and the criterion in
     * `src/test/mcpArrangement.test.ts` goes red.
     */
    /**
     * ⭐ **The notice that used to stand here is gone, because the loss it named is gone.**
     *
     * It read "a step column keeps one pitch … the render plays one note there", which was true while the
     * offline lane read the flattened singular `pitch`: `stepsFromNotes` keeps the lowest, so a chord reached
     * the lane as one note. **The model had already promised otherwise** — `SequencerTrack.pitches` is documented
     * as "every note sounding on a step, as a stack — the chord", with `pitch` kept as the root and "when
     * `pitches` is present the renderers play it verbatim instead of expanding `pitch` themselves", precisely so
     * that stored chords are not voiced twice and the piano roll "would [not] disagree with what is heard".
     * The offline lane was the renderer that did not honour that, so the piano roll drew the chord while the
     * render played its lowest note. This is a contract the lane now keeps rather than a new decision: it reads
     * the stack and starts every note in it, and `arrangementCompile` carries the stack it was already given.
     * Reporting a column as lost after that would be a false report, which is its own defect.
     *
     * The guard moved to where the behaviour lives: `src/test/audioLaneOfflineRender.test.ts` asserts that a
     * column holding three notes starts three voices on the same frame, so reverting the stack turns it red.
     * `collapsedNoteColumns` stays in `noteEvents` — its meaning did not change — for whoever needs the
     * detector again.
     */
  }
  const allNotes = Object.values(arrangement.notesByTrack ?? {}).flatMap((notes) => notes ?? []);
  return {
    arrangementId,
    songId: arrangement.songId,
    ...(arrangement.bars === undefined ? {} : { bars: arrangement.bars }),
    ...(arrangement.bpm === undefined ? {} : { bpm: arrangement.bpm }),
    steps: stepCountFor(allNotes, arrangement.bars),
    trackCount: arrangement.tracks.length,
    tracks: arrangement.tracks.map((track) => summariseTrack(track, arrangement)),
    templates: TEMPLATES.map((template) => template.id),
    problems,
  };
}

export interface CreateMcpArrangementInput {
  songId?: string;
  /** A template id, one of `templates` in any summary. */
  templateId?: string;
  /** The kind the blank template's single track gets; ignored when a template is named. */
  blankKind?: TrackKindV2;
}

export function createMcpArrangement(input: CreateMcpArrangementInput = {}): ArrangementSummary {
  const songId = input.songId ?? "mcp";
  if (input.templateId !== undefined && !TEMPLATES.some((template) => template.id === input.templateId)) {
    throw new Error(`unknown templateId "${input.templateId}" — the templates are ${TEMPLATES.map((template) => template.id).join(", ")}, or omit it for a blank arrangement`);
  }
  const seeded = input.templateId
    ? createArrangementFromTemplate(songId, input.templateId, input.blankKind)
    : createArrangement(songId, input.blankKind ?? "synth");
  /**
   * ⭐ **An MCP-created arrangement carries no starter notes.**
   *
   * `createArrangement` seeds a kind's default pattern because a silent track looks broken to a **person** starting a
   * project, and that decision is unchanged. A caller reaching this surface, though, is composing through a tool and
   * cannot see the screen: two field reports describe receiving four notes at pitch 60 nobody wrote, on a drum-kit
   * asset, with no line in the reply accounting for them. The starter notes are dropped here and the track's own
   * `sample` is kept — the asset is identity ("a sampler with no instrument would be silent"), not content. The
   * detector in `summariseArrangement` names any starter content that still reaches a reply.
   */
  const base: ArrangementV2 = { ...seeded, notesByTrack: {} };
  const id = `arrangement-${++idSequence}`;
  arrangements.set(id, base);
  return summariseArrangement(id, base);
}

/**
 * ⭐ **The tool boundary keeps its own history, because that is where an agent can use it.** The editor keeps history per
 * change; the server kept none, so a mistake could only be repaired by resending the whole arrangement. The seam below is
 * the one place a change happens, so one line there records it — and creation and import do not, because they establish a
 * state rather than change one, and undo means returning to before a change.
 */
const arrangementHistory = new Map<string, ArrangementV2[]>();
const ARRANGEMENT_HISTORY_LIMIT = 50;

function edit(arrangementId: string, apply: (arrangement: ArrangementV2) => ArrangementV2): ArrangementEditResult {
  const arrangement = requireArrangement(arrangementId);
  // ⭐ Record the state being left behind, then change it: that is what undo returns to.
  arrangementHistory.set(arrangementId, [...(arrangementHistory.get(arrangementId) ?? []), arrangement].slice(-ARRANGEMENT_HISTORY_LIMIT));
  const next = apply(arrangement);
  arrangements.set(arrangementId, next);
  const summary = summariseArrangement(arrangementId, next);
  return { summary, problems: summary.problems };
}

/**
 * Add a track, and — for a sampler — point it at its instrument **in the same call**.
 *
 * ⭐ **`assetId` is the one-step form the report needed.** Choosing a real instrument used to be two round trips (create
 * a sampler track, then `set_arrangement_track_asset`), and an agent that stopped after the first got the default
 * catalogue asset. It is read only on `kind:"sampler"`, and **every other kind is refused rather than ignored**: a
 * caller that hands `assetId` to a synth has said what it wants and must be told that this kind cannot give it, not
 * left with a track that quietly sounds like a synth anyway.
 */
export function addMcpTrack(
  arrangementId: string,
  kind: TrackKindV2,
  name?: string,
  assetId?: string,
  /**
   * ⭐ **The v1 instrument name a synth track declares** — `piano_lead`, `walking_upright`, `strings_lead`, …
   *
   * It is what the recorded-instrument table (`src/data/sampledInstruments.ts`) is keyed by, so a `synth` track that
   * declares a mapped name is a **recording** and this call is the shortest way to ask for one without a catalogue id:
   * `add_arrangement_track {kind:"synth", instrument:"piano_lead"}` sounds Salamander. Refused on a kind that is not a
   * synth, in the same spirit as `assetId`: a drum kit and an effect have no recorded identity to declare.
   */
  instrument?: string,
  /**
   * ⭐ **What the music is doing, so the playing technique is chosen rather than named** — the same rule table the
   * import uses, on a track that has no notes yet.
   *
   * `placementForTrack` resolves it to a `TrackV2.instrument` identity (`violin_section_pizzicato` →
   * `vsco2ce:ViolinEnsPizz`) and reports which technique was chosen and whether it was a fallback. The register and
   * length questions need notes, so they are named as still open in the reply rather than answered with a guess.
   * Refused on a kind that is not a synth, like `instrument`, and the situation wins over a name given at the same
   * time — with the conflict reported.
   */
  situation?: StringSituationSpec
): ArrangementEditResult & { situation?: SituationPlacement } {
  if (instrument !== undefined && kind !== "synth") {
    throw new Error(
      `instrument was given for a ${kind} track, and only a synth track declares one — a ${kind} track's sound is its own (a sampler names an assetId; a drum kit and an effect have no recorded instrument to declare)`
    );
  }
  if (situation !== undefined && kind !== "synth") {
    throw new Error(
      `a situation was given for a ${kind} track, and only a synth track can be named by playing technique — the chosen identity is a track instrument name, which a ${kind} track has not got (a sampler names an assetId directly)`
    );
  }
  if (assetId !== undefined && kind !== "sampler") {
    throw new Error(
      `assetId was given for a ${kind} track, and only a sampler track plays a catalogue asset — a ${kind} track cannot be pointed at one` +
        (kind === "synth" ? ` (a synth is a built-in instrument with a fixed timbre; for a recorded piano, strings or bass use kind:"sampler")` : "") +
        `; call add_arrangement_track again with kind:"sampler" and this assetId`
    );
  }
  /**
   * ⭐ **The situation is resolved before the track exists**, so a request no row can serve is refused with a reason
   * rather than creating an anonymous synth that claims a technique it is not playing.
   */
  const placement = situation === undefined ? undefined : placementForTrack(situation);
  const problems = [...(placement?.problems ?? [])];
  if (placement && !placement.instrument) {
    const refused = placement.refused ?? `no program serves the situation "${situation!.situation}" on ${situation!.instrument}`;
    throw new Error(`${refused}; nothing was created`);
  }
  if (placement?.instrument && instrument !== undefined) {
    problems.push(
      `both instrument "${instrument}" and the situation "${situation!.situation}" were given; the situation was applied, so the track is "${placement.instrument}" (${placement.assetId}) and the name was not`
    );
  }
  const chosen = placement?.instrument ?? instrument;
  const result = edit(arrangementId, (arrangement) => {
    const added = addTrack(arrangement, kind, name ?? defaultTrackName(kind), chosen === undefined ? {} : { instrument: chosen });
    /**
     * ⭐ **The caller gets the track, not the starter notes it was born with** — the same rule as `createMcpArrangement`.
     * `addTrack` seeds a kind's default pattern for the app's starter experience; here the track arrives empty, and the
     * caller writes the notes it means. A track that became a sampler still carries its default asset: that is identity,
     * not content.
     */
    const newTrackId = added.tracks[added.tracks.length - 1]!.id;
    const notesByTrack = { ...(added.notesByTrack ?? {}) };
    delete notesByTrack[newTrackId];
    // ⭐ One call, not two: the asset the caller named replaces the default one `addTrack` supplied.
    const withAsset = assetId === undefined ? added : setTrackSample(added, newTrackId, assetId);
    return { ...withAsset, notesByTrack };
  });
  return {
    ...result,
    problems: [...result.problems, ...problems],
    ...(placement ? { situation: placement } : {}),
  };
}

function defaultTrackName(kind: TrackKindV2): string {
  const names: Record<TrackKindV2, string> = { synth: "Synth", drumkit: "Drums", sampler: "Sampler", fx: "Effect", folder: "Folder" };
  return names[kind];
}

export function removeMcpTrack(arrangementId: string, trackId: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => removeTrack(arrangement, trackId)));
}

export function setMcpTrackKind(arrangementId: string, trackId: string, kind: TrackKindV2): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => changeTrackKind(arrangement, trackId, kind)));
}

export function renameMcpTrack(arrangementId: string, trackId: string, name: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => renameTrack(arrangement, trackId, name)));
}

export function setMcpTrackFlag(arrangementId: string, trackId: string, flag: "muted" | "soloed", value: boolean): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setTrackFlag(arrangement, trackId, flag, value)));
}

/** `null` detaches a track from its folder, which is why the parameter is nullable rather than optional. */
export function setMcpTrackParent(arrangementId: string, trackId: string, parentId: string | null): ArrangementEditResult {
  return edit(arrangementId, (arrangement) =>
    refuseUnknownTrack(arrangement, trackId, () => setTrackParent(arrangement, trackId, parentId ?? undefined))
  );
}

/**
 * Put a catalogue asset on a sampler track.
 *
 * **Named for the asset, not for a track kind.** It was `setMcpTrackInstrument`, and when the kind that is now `synth`
 * was itself called `instrument`, two different things wore one word: the kind of the track, and the recorded asset a
 * sampler plays. The kind was renamed and this followed — a caller reading `set_arrangement_track_asset` cannot mistake
 * it for "make this track an instrument".
 */
export function setMcpTrackAsset(arrangementId: string, trackId: string, assetId: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(unknownTrack(arrangement, trackId));
    /**
     * The data layer refuses a non-sampler by returning the arrangement unchanged, which is right for a button and wrong for a caller that cannot see the screen: an agent that points an asset at a drum track must be told, not left to notice
     * that nothing changed.
     */
    if (track.kind !== "sampler") throw new Error(`"${track.name}" is a ${track.kind} track, and only a sampler track plays a catalogue asset`);
    return setTrackSample(arrangement, trackId, assetId);
  });
}

export function setMcpTrackSteps(arrangementId: string, trackId: string, steps: readonly number[]): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setTrackSteps(arrangement, trackId, steps)));
}

export interface AddMcpTakeInput {
  trackId: string;
  /** Audio for a sampler, a sequence for anything else — the one field that distinguishes them. */
  source: "audio" | "midi";
  label?: string;
  /** When it finished, in epoch milliseconds; defaults to now, which is what "just recorded" means. */
  recordedAt?: number;
  /** The bars it covered, when the transport was rolling. */
  startBar?: number;
  endBar?: number;
}

export function addMcpTake(arrangementId: string, input: AddMcpTakeInput): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === input.trackId);
    if (!track) throw new Error(unknownTrack(arrangement, input.trackId));
    const id = `take-${(track.takes?.length ?? 0) + 1}`;
    const planned: PlannedTake = {
      take: { id, recordedAt: input.recordedAt ?? Date.now(), source: input.source, ...(input.label ? { label: input.label } : {}) },
      ...(input.startBar !== undefined && input.endBar !== undefined
        ? { region: { startBar: input.startBar, endBar: input.endBar, takeId: id } }
        : {}),
    };
    return addTake(arrangement, input.trackId, planned);
  });
}

/** `null` clears the choice, so a track returns to whatever a region says. */
export function selectMcpTake(arrangementId: string, trackId: string, takeId: string | null): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(unknownTrack(arrangement, trackId));
    if (takeId !== null && !(track.takes ?? []).some((take) => take.id === takeId)) {
      throw new Error(`"${track.name}" has no take "${takeId}" — its takes are ${(track.takes ?? []).map((take) => take.id).join(", ") || "none"}`);
    }
    return selectTrackTake(arrangement, trackId, takeId ?? undefined);
  });
}

/**
 * The note-level edits — what a piano roll does, exposed to an agent.
 *
 * **They exist because the coverage guard said so.** Adding `addTrackNote` and its siblings to the data layer turned `mcpCoverage` red with "these operations change the arrangement and no MCP tool reaches them", which is the rule the owner asked for doing
 * its job on its first real occasion. The grid tools below remain: a drum pattern is stated as squares, and a melody is stated as notes.
 */
export function addMcpNote(arrangementId: string, input: { trackId: string; pitch: number; startBeats: number; lengthBeats?: number; velocity?: number }): ArrangementEditResult {
  return edit(arrangementId, (arrangement) =>
    refuseUnknownTrack(arrangement, input.trackId, () =>
      addTrackNote(arrangement, input.trackId, {
        pitch: input.pitch,
        startBeats: input.startBeats,
        lengthBeats: input.lengthBeats ?? 1,
        velocity: input.velocity ?? 100,
      })
    )
  );
}

export function removeMcpNote(arrangementId: string, trackId: string, at: { pitch: number; startBeats: number }): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => removeTrackNote(arrangement, trackId, at)));
}

export function moveMcpNote(
  arrangementId: string,
  trackId: string,
  from: { pitch: number; startBeats: number },
  to: { pitch: number; startBeats: number }
): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => moveTrackNote(arrangement, trackId, from, to)));
}

export function setMcpNoteLength(arrangementId: string, trackId: string, at: { pitch: number; startBeats: number }, lengthBeats: number): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setTrackNoteLength(arrangement, trackId, at, lengthBeats)));
}

/**
 * Claim an existing take for a bar range — the comping action, as opposed to filing a new recording.
 *
 * `add_arrangement_take` claims a range when the recording covered one, which is the common case. This is the other one: a take recorded earlier, or a whole one, claimed for part of the arrangement. The range logic is `assignTakeToRange`, which splits any
 * range the new one crosses so ranges stay disjoint.
 */
export function assignMcpTakeRange(arrangementId: string, trackId: string, takeId: string, startBar: number, endBar: number): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(unknownTrack(arrangement, trackId));
    if (!(track.takes ?? []).some((take) => take.id === takeId)) {
      throw new Error(`"${track.name}" has no take "${takeId}" — its takes are ${(track.takes ?? []).map((take) => take.id).join(", ") || "none"}`);
    }
    if (endBar <= startBar) throw new Error(`the range must end after it starts (got ${startBar} to ${endBar})`);
    return assignTakeToRange(arrangement, trackId, startBar, endBar, takeId);
  });
}

/**
 * ⭐ How long the arrangement is, in bars.
 *
 * **Stated in bars rather than steps or seconds**, because a musician counts bars: a caller asking for "four more bars" should not have to know that a bar is sixteen steps, and a caller reading the answer should not have to divide.
 */
/**
 * ⭐ **The arrangement as MusicXML** — the file a notation program opens.
 *
 * A file rather than a summary, and returned whole rather than as a path: the caller is a process, the document is text, and "here is the score" is more useful than "here is where a score could be written".
 *
 * The notes of one track by default, because a track is a voice and one part is what the exporter writes; `trackId` chooses which. Bars come from the arrangement's own length so the score and the transport end in the same place.
 */
export function exportMcpMusicXml(arrangementId: string, options: { trackId?: string; title?: string; tempoBpm?: number } = {}): {
  filename: string;
  mimeType: string;
  bytes: number;
  xml: string;
  track: string;
  bars: number;
} {
  const arrangement = requireArrangement(arrangementId);
  const track = options.trackId ? arrangement.tracks.find((candidate) => candidate.id === options.trackId) : arrangement.tracks.find((candidate) => candidate.kind !== "folder");
  if (!track) throw new Error(`no track to write: ${options.trackId ? `"${options.trackId}" is not in this arrangement` : "the arrangement has no tracks"}`);
  const notes = arrangement.notesByTrack?.[track.id] ?? [];
  const bars = Math.round(stepCountFor(notes, arrangement.bars) / STEPS_PER_BAR);
  const xml = toMusicXml(notes, bars, {
    title: options.title ?? "Groove arrangement",
    partName: track.name,
    ...(options.tempoBpm === undefined ? {} : { tempoBpm: options.tempoBpm }),
  });
  const safe = track.name.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "track";
  return { filename: `${safe}.musicxml`, mimeType: "application/vnd.recordare.musicxml+xml", bytes: xml.length, xml, track: track.name, bars };
}

/**
 * ⭐ **The arrangement as a Standard MIDI File** — the file a DAW opens, and the half that was missing.
 *
 * The import has existed all along, so an agent could bring a DAW's work in and could not hand one back: a
 * composer working through MCP wrote their own MIDI generator to get a score out. Import without export is an
 * asymmetry, and this is the other side of it.
 *
 * **Every lane becomes a track and the conductor track carries the tempo and the meter**, which is what the
 * importer reads back: it takes one part per track chunk in a format-1 file, so the round trip is the file's own
 * structure rather than a convention chosen here. `arrangementToMidi` is pure and returns the bytes; the tool
 * writes them to disk, which is why this is a writing tool rather than a reader that happens to hand back bytes.
 *
 * The `problems` list is returned beside the file and not folded into it: a lane's notes that overlap on one pitch
 * are something MIDI cannot distinguish, and a caller who is told can decide, while one who is not finds out when
 * the DAW plays something else.
 */
export interface ExportMcpMidiOptions {
  /** A name for the file. The arrangement's own id is used when omitted, and `.mid` is appended when it is missing. */
  filename?: string;
  /**
   * ⭐ **Semitones added to every written note** — an export's "sounding" mode, against the default of the notes'
   * own numbers. Passed straight to `arrangementToMidi`, which applies it where the event bytes are built, so
   * this wrapper never touches a pitch itself.
   */
  transposeSemitones?: number;
}

export function exportMcpArrangementMidi(
  arrangementId: string,
  options: ExportMcpMidiOptions = {}
): {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  format: number;
  division: number;
  tracks: Array<{ id: string; name: string; kind: TrackKindV2; channel: number; notes: number }>;
  notes: number;
  bpm: number;
  timeSignature: string;
  tempoEvents: Array<{ tick: number; atBar: number; bpm: number }>;
  problems: string[];
} {
  const arrangement = requireArrangement(arrangementId);
  const file = arrangementToMidi(arrangement, {
    ...(options.transposeSemitones === undefined ? {} : { transposeSemitones: options.transposeSemitones }),
  });
  /**
   * The same Unicode-friendly slug `export_groove` uses: separators and control characters go, letters and digits
   * of any script stay. A Chinese track name is a name, not a reason for `arrangement.mid`.
   */
  const base =
    (options.filename ?? arrangementId)
      .normalize("NFKC")
      .replace(/[\s/\\:*?"<>|]+/g, "-")
      .replace(/\p{Cc}/gu, "")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 40) || "arrangement";
  return {
    filename: base.toLowerCase().endsWith(".mid") ? base : `${base}.mid`,
    mimeType: "audio/midi",
    ...file,
  };
}

/** How many steps one bar holds, re-exported so the MCP layer does not import the note module directly in two places. */
import { STEPS_PER_BAR } from "../src/data/noteEvents";

/**
 * MusicXML in: the file a notation program saved, turned into notes on a track.
 *
 * It **adds a track rather than replacing one**, because the file names a part and a person importing a score means "give me this part" rather than "overwrite what I have". The part's own name becomes the track's, so a grand staff imported twice reads as two named parts.
 *
 * The problems the reader reports are returned **with** the track: an import that lost a grace note or a second voice says so, and a caller that ignores the list has still been told.
 *
 * **Which part is a choice, and all of them is a choice.** `partIndex` takes one index or the word `"all"` rather than being a number with a separate `allParts` flag, because the flag plus the index has a state nobody can define: part three, or every part? A union field makes that unrepresentable, and the default stays the first part.
 */
export type MusicXmlPartSelection = number | "all";

export interface ImportMcpMusicXmlOptions {
  partIndex?: MusicXmlPartSelection;
  /**
   * ⭐ **Which instrument each imported part is, so an imported part can sound a recording instead of a synthesiser.**
   *
   * Keyed by the part's own index — the same number `partIndex` selects and the same one the problems below name —
   * rather than a positional array, because an array would silently slide when a part is skipped for holding no
   * notes, and "the violin ended up on the bass" is not a failure anyone would notice in time.
   *
   * **The name is a genre instrument name** (`strings_lead`, `piano_lead`, `walking_upright`, …), which is the key of
   * `src/data/sampledInstruments.ts`. Naming one that the table maps makes the created track a **`sampler`** pointed
   * at that recording's asset — the same kind and asset the file picker's mapping dialog produces, decided by the one
   * shared `importedPartVoice` so the two roads cannot disagree. Naming one it does not map is **reported as a
   * problem** rather than silently ignored, and naming a synthesiser name (`warm_pad`) is honoured as the synthesiser
   * it means (the track stays a `synth`).
   *
   * ## Why this is a parameter and not a guess
   *
   * The obvious alternative is to read the identity off the part's **name**, and it is refused deliberately: a
   * substring or dictionary match would answer "the piano" for `Piano` and "something stringy" for `弦乐`, and this
   * repository's own rule is that a wrong instrument is worse than a synthesiser because it is a claim about a
   * composer's music that nobody made. A part named `弦乐` is a name, not an instrument.
   *
   * The file itself cannot supply it either, measured: the owner's own project carries **no program-change events at
   * all** (all four of its `MTrk` chunks), and `ImportedPart` has no channel or program field for a reader to fill.
   * So identity arrives from the caller — who knows what they imported — or not at all.
   */
  instruments?: Record<number, string>;
  /**
   * ⭐ **What each imported part is *doing*, so the playing technique is chosen rather than named.**
   *
   * Keyed by part index for the same reason `instruments` is. Each entry names the **string instrument** the part is
   * (`violin`, `viola`, `cello`, `contrabass`, `solo-violin`) and the **musical situation** (`sustained-bed`,
   * `short-repeating`, `plucked-walking`, `tension-tremolo`, …). `placementForPart` then runs the rule table over the
   * part's own notes and returns the `TrackV2.instrument` identity that plays the chosen recording — so a caller who
   * says "this is a plucked walking line" gets `contrabass_solo_pizzicato` → `vsco2ce:ContrabassPizz` without knowing
   * either name, and a caller who asks for `spiccato` is told that its bytes are not mirrored and that `pizzicato`
   * played instead.
   *
   * A part given **both** a name and a situation: the situation is applied and the name is reported as not applied.
   * If the situation cannot serve the part (wrong register, no playable technique), the name stands and the refusal is
   * in `problems`.
   */
  situations?: Record<number, StringSituationSpec>;
}

export function importMcpMusicXml(arrangementId: string, xml: string, options: ImportMcpMusicXmlOptions = {}): ArrangementEditResult & {
  problems?: string[];
  notes?: number;
  trackIds?: string[];
  situations?: SituationPlacement[];
} {
  return addImportedParts(arrangementId, fromMusicXml(xml), options);
}

/**
 * The same import, from the file's **bytes**: a `.mxl` is a zip, and a caller with one in hand should not have to unzip it first.
 *
 * The bytes are decided by their content rather than by a name the caller supplies, and the answer says which it was, so "I imported a zip" and "I imported XML" are different things a caller can see. The decode is base64 because MCP arguments are JSON, and JSON has no bytes.
 */
export async function importMcpMusicXmlBytes(arrangementId: string, bytesBase64: string, options: ImportMcpMusicXmlOptions = {}): Promise<
  ArrangementEditResult & { problems?: string[]; notes?: number; trackIds?: string[]; format?: string; situations?: SituationPlacement[] }
> {
  const bytes = Buffer.from(bytesBase64, "base64");
  if (bytes.length === 0) throw new Error("the file's bytes are empty — `bytesBase64` must be the base64 of the .mxl (or .musicxml) file itself");
  const imported = await fromMusicXmlBytes(new Uint8Array(bytes));
  return { ...addImportedParts(arrangementId, imported, options), format: imported.format };
}

/**
 * Import a **MIDI file** as arrangement tracks.
 *
 * The project has had a MIDI import for a while, but it quantises into the old sixteen-step pattern — so the file's own note lengths and track structure were thrown away on the way in. This reads the file the way the arrangement models music: one track per MIDI track (split further by channel when a format-0 file puts several instruments on one track), notes at their own positions, and each note as long as the file holds it.
 *
 * It is a separate tool from the MusicXML one rather than a flag on it, because the bytes are not the same kind of thing and a caller holding a `.mid` should not have to say "this is not XML".
 */
/**
 * ⭐ **The pitch plan an import should have carried all along: what came in, and that nothing moved it.**
 *
 * The owner's rule is that a MIDI file stores a note number and no name, so an octave surprise on import is not
 * the file being wrong but some stage — display, root key, an automatic transposition, drum handling — having
 * done something unasked. `fromMidi` does none of those things, and this says so in the reply instead of
 * leaving a caller to infer it from silence: `transposed: false` with an empty `transpositions` list is a
 * statement that the numbers arriving are the numbers in the file.
 *
 * `methods` names the gap rather than hiding it. The importer **does** read channels — it needs them to split a
 * format-0 file, whose whole band shares one track chunk — but `ImportedPart` carries only `name` and `notes`,
 * so the channel is consumed and dropped. Channel 10 is therefore **not** identified as drums here, and this
 * plan says so rather than implying the question was answered. The first step is an optional `channel?: number`
 * on `ImportedPart`, set by `midiToArrangement` where the channel is already in hand; it is not done here
 * because `ImportedPart` is shared with the MusicXML importer, which has no channels, and that decision belongs
 * with whoever compares the two.
 *
 * Drum handling itself needs nothing on the model side: `song.ts` says only a step that carries a pitch moves,
 * and a kick carries none.
 */
function midiPitchPlan(imported: MidiArrangementImport): {
  convention: NoteConvention;
  notes: number;
  range?: { lowest: number; highest: number; lowestName: string; highestName: string };
  transposed: boolean;
  transpositions: unknown[];
  methods: string[];
  notRead: string[];
} {
  const notes = imported.parts.flatMap((part) => part.notes ?? []);
  const base = {
    convention: DEFAULT_NOTE_CONVENTION,
    notes: notes.length,
    transposed: false,
    /** Empty on purpose: this is the statement that the import applied nothing, not a missing field. */
    transpositions: [],
  };
  const methods = [
    "the notes' own pitch values, unchanged: `fromMidi` reads them and applies no offset",
  ];
  const notRead = [
    "channel 10 is not identified as drums — the importer reads channels to split a format-0 file but `ImportedPart` carries only `name` and `notes`, so the channel is consumed and dropped (first step: an optional `channel?: number` on `ImportedPart`)",
    "the target instrument's range — no tool exposes an SFZ's keyranges yet, so compare the range below yourself, or resolve a single note with `get_pitch_report`",
  ];
  if (notes.length === 0) {
    return { ...base, methods, notRead: [...notRead, "the file carries no notes, so there is no range to report"] };
  }
  // Looped rather than spread: `Math.min(...notes)` overflows the stack on a file with a few hundred thousand
  // of them, which is exactly the kind of import this is for.
  let lowest = notes[0]!.pitch;
  let highest = notes[0]!.pitch;
  for (const note of notes) {
    if (note.pitch < lowest) lowest = note.pitch;
    if (note.pitch > highest) highest = note.pitch;
  }
  return {
    ...base,
    range: {
      lowest,
      highest,
      lowestName: noteName(lowest),
      highestName: noteName(highest),
    },
    methods,
    notRead,
  };
}

export function importMcpMidi(
  arrangementId: string,
  bytesBase64: string,
  options: ImportMcpMusicXmlOptions = {}
): ArrangementEditResult & { problems?: string[]; notes?: number; trackIds?: string[]; tempoBpm?: number; timeSignature?: string; format?: number; pitchPlan?: ReturnType<typeof midiPitchPlan>; situations?: SituationPlacement[] } {
  const bytes = Buffer.from(bytesBase64, "base64");
  if (bytes.length === 0) {
    throw new Error("the file's bytes are empty — `bytesBase64` must be the base64 of the .mid file");
  }
  const imported = fromMidi(new Uint8Array(bytes));
  return {
    ...addImportedParts(arrangementId, imported, options),
    // Said out loud so a caller can set the arrangement's tempo from the file rather than guessing 120.
    ...(imported.tempoBpm === undefined ? {} : { tempoBpm: imported.tempoBpm }),
    // And the meter, for the same reason: the arrangement has a `timeSignature` and the file may state one.
    ...(imported.timeSignature === undefined ? {} : { timeSignature: imported.timeSignature }),
    format: imported.format,
    /** ⭐ What arrived, in numbers and names, and the statement that nothing transposed it on the way in. */
    pitchPlan: midiPitchPlan(imported),
  };
}

/**
 * Import a **Logic Pro project** as arrangement tracks — Phase 1, MIDI only.
 *
 * A `.logicx` is a directory, so the caller sends the two files that carry music this model can hold:
 * `Alternatives/NNN/ProjectData` and its `MetaData.plist`. `Media/` may hold gigabytes of audio that Phase 1 cannot
 * use, and MCP arguments are JSON, so the two small files travel and the pack does not.
 *
 * **It lands through `addImportedParts`, the same road as MusicXML and MIDI.** A Logic importer is the third producer
 * on that path, not a second implementation — the repo's own reason is that two imports taking two implementations is
 * where they start disagreeing about note order and track naming.
 *
 * Audio tracks, AU plugin chains and automation have **no counterpart** in `TrackKindV2`, and the reader does not drop
 * them quietly: each reaches `problems` by name. Where a region sits on the timeline is the one reading this version
 * of `ProjectData` does not yet give reliably, and the reply says so rather than implying the notes start at bar 1.
 */
/**
 * Write an arrangement as the two files `importMcpLogicProject` reads, so the pair round-trips through this server.
 *
 * It is deliberately the mirror of the import beside it: the same two names, the same base64 convention, and the parts
 * built the same way the browser's own `logicFileFor` builds them. Whether **Logic itself** opens the result is not
 * proven here and stays in `needs`; what is proven is that this server's reader reads back the same music.
 */
export function exportMcpLogicProject(arrangementId: string, trackIds?: readonly string[]):
  { projectDataBase64: string; metaDataBase64: string; projectInformationBase64: string;
    notes: number; parts: number; trackIds: string[]; tempoBpm: number } {
  const arrangement = requireArrangement(arrangementId);
  const lanes = (arrangement.tracks ?? []).filter((track) => track.kind !== "folder");
  const chosen = trackIds ? lanes.filter((track) => trackIds.includes(track.id)) : lanes;
  const parts = chosen.map((track) => ({
    name: track.name ?? track.id,
    notes: (arrangement.notesByTrack ?? {})[track.id] ?? [],
  }));
  const bundle = logicProjectBundle(parts as never, arrangement.bpm ?? 120);
  const bytes = (path: string) => Buffer.from(bundle.files[path]!).toString("base64");
  return {
    projectDataBase64: bytes("Alternatives/000/ProjectData"),
    metaDataBase64: bytes("Alternatives/000/MetaData.plist"),
    projectInformationBase64: bytes("Resources/ProjectInformation.plist"),
    notes: parts.reduce((total, part) => total + part.notes.length, 0),
    parts: parts.length,
    trackIds: chosen.map((track) => track.id),
    tempoBpm: arrangement.bpm ?? 120,
  };
}

export function importMcpLogicProject(
  arrangementId: string,
  projectDataBase64: string,
  metaDataBase64: string,
  options: ImportMcpMusicXmlOptions = {}
): ArrangementEditResult & { problems?: string[]; notes?: number; trackIds?: string[]; tempoBpm?: number; timeSignature?: string; situations?: SituationPlacement[] } {
  const imported = fromLogicProjectBase64({ projectDataBase64, metaDataBase64 });
  return {
    ...addImportedParts(arrangementId, imported, options),
    // Said out loud so a caller can set the arrangement's tempo from the project rather than guessing 120.
    ...(imported.tempoBpm === undefined ? {} : { tempoBpm: imported.tempoBpm }),
    ...(imported.timeSignature === undefined ? {} : { timeSignature: imported.timeSignature }),
  };
}

/**
 * Add one track per imported part and return the summary, the problems, and **which tracks were added**.
 *
 * The track ids are named because they are the whole reason a caller asked: a second call that wants to write notes into the part it just read has to know what to name. They are ids rather than indexes because a later edit names the track by id.
 */
function addImportedParts(
  arrangementId: string,
  /**
   * **Only the two fields that are actually used**, so a MIDI import travels this same path: the parts, and what the reader could not make sense of. A music-specific type would have made the second import a second implementation, which is how two imports of the same music start disagreeing about note order and track naming.
   */
  imported: { parts: ImportedPart[]; problems: string[] },
  options: ImportMcpMusicXmlOptions
): ArrangementEditResult & { problems?: string[]; notes?: number; trackIds?: string[]; situations?: SituationPlacement[] } {
  const selection = options.partIndex ?? 0;
  const chosen = selection === "all" ? imported.parts.map((part, index) => ({ part, index })) : imported.parts.map((part, index) => ({ part, index })).filter((candidate) => candidate.index === selection);
  if (chosen.length === 0) {
    throw new Error(`the file has ${imported.parts.length} part(s), so there is no part ${selection}`);
  }
  /**
   * A part that holds nothing is a track that holds nothing, and an empty track is one more row for a person to delete. It is left out and said out loud, which is the same treatment every other dropped thing gets.
   */
  const problems = [...imported.problems];
  const withNotes = chosen.filter((candidate) => {
    if (candidate.part.notes.length > 0) return true;
    problems.push(`part ${candidate.index + 1} "${candidate.part.name}" holds no notes and was not added as a track`);
    return false;
  });

  /**
   * ⭐ **The instrument each part is, resolved before any track is created, so a name that serves nothing is reported
   * rather than written onto a track and forgotten.**
   *
   * The rule is the same one `list_arrangement_instruments` and the genre lanes follow — an **exact match** through
   * `sampledInstrumentFor` — plus the synthesiser names, which are honoured because a name that means a synthesiser is
   * an answer rather than a gap (`warm_pad` is not a missing piano). Anything else is named in `problems` with the
   * nearest thing a caller can do about it, and the track keeps the built-in voice it would have had, which is the
   * same fallback a mapped-but-unmirrored name gets.
   */
  const instruments = options.instruments ?? {};
  const resolvedInstruments = new Map<number, string>();
  /**
   * ⭐ **An index that names no part is a problem, not a no-op.**
   *
   * A caller who writes `{"2": "walking_upright"}` believing part 2 is their bass, in a file that has two parts, has
   * named an instrument that is silently never applied — the bass keeps its synthesiser and the reply says nothing.
   * That is the "plausible wrong answer" shape this repository treats as the worst kind, and it costs one check.
   */
  for (const index of Object.keys(instruments).map(Number)) {
    if (!Number.isInteger(index) || index < 0 || index >= imported.parts.length) {
      problems.push(
        `an instrument was named for part ${Number.isFinite(index) ? index + 1 : "(not a number)"}, and the file has ${imported.parts.length} part(s)` +
          ` (${imported.parts.map((part, at) => `${at + 1} "${part.name}"`).join(", ") || "none"}), so nothing was given that name`
      );
    }
  }
  for (const candidate of withNotes) {
    const named = instruments[candidate.index];
    if (named === undefined) continue;
    const wanted = named.trim();
    const served = sampledInstrumentFor(wanted) !== undefined || SAMPLED_INSTRUMENT_SYNTHS.includes(wanted);
    if (!served) {
      const gap = sampledInstrumentGapReason(wanted);
      problems.push(
        `part ${candidate.index + 1} "${candidate.part.name}" was named instrument "${wanted}", which no recorded instrument or built-in voice serves` +
          (gap ? ` — ${gap}` : "") +
          `; the track keeps its built-in voice, and list_arrangement_instruments names the recordings that exist`
      );
      continue;
    }
    resolvedInstruments.set(candidate.index, wanted);
  }

  /**
   * ⭐ **The situations, resolved on the same road and with the same rule: report before writing.**
   *
   * A situation is the caller's *musical* statement, so it is resolved against the part's own notes (register, length,
   * velocity) and its answer — the `TrackV2.instrument` identity that reaches the chosen recording — replaces whatever
   * name the part had. The reading travels back in `situations` rather than being summarised away, so the caller can
   * see which technique was chosen, whether it was the first choice, and what a fallback fell from.
   *
   * The tempo is the arrangement's own, because the length verdict is a question about seconds: reading it from a
   * hardcoded 120 would report a verdict the renderer would not produce.
   */
  const situations = options.situations ?? {};
  const placements: SituationPlacement[] = [];
  for (const index of Object.keys(situations).map(Number)) {
    const spec = situations[index];
    if (!spec) continue;
    if (!Number.isInteger(index) || index < 0 || index >= imported.parts.length) {
      problems.push(
        `a situation was given for part ${Number.isFinite(index) ? index + 1 : "(not a number)"}, and the file has ${imported.parts.length} part(s)` +
          ` (${imported.parts.map((part, at) => `${at + 1} "${part.name}"`).join(", ") || "none"}), so nothing was given that situation`
      );
      continue;
    }
    const part = imported.parts[index]!;
    const placement = placementForPart(spec, part.notes, getMcpArrangement(arrangementId)?.bpm ?? 120);
    placements.push(placement);
    problems.push(...placement.problems);
    if (placement.instrument) {
      /**
       * ⭐ **The situation wins over a name, and the conflict is said out loud.**
       *
       * They are two answers to one question, and the situation is the more specific one — a playing technique on a
       * stated instrument — so applying the name instead would leave the feature "reachable and never applied", the
       * shape Muse keeps reporting. Either way the caller is told that one of the two was not used.
       */
      if (instruments[index] !== undefined) {
        problems.push(
          `part ${index + 1} "${part.name}" was given both the instrument "${instruments[index]}" and the situation "${spec.situation}"; ` +
            `the situation was applied, so the track is "${placement.instrument}" (${placement.assetId}) and the name was not`
        );
      }
      resolvedInstruments.set(index, placement.instrument);
    } else if (instruments[index] !== undefined) {
      problems.push(
        `part ${index + 1} "${part.name}" was given the situation "${spec.situation}", which could not serve it, so the named instrument "${instruments[index]}" stands`
      );
    }
  }

  const result = edit(arrangementId, (current: ArrangementV2) => {
    let next = current;
    for (const candidate of withNotes) {
      const instrument = resolvedInstruments.get(candidate.index);
      /**
       * The instrument travels **at creation** rather than through a second edit: the track is born with the identity
       * its part was named with, so there is no window in which it exists as an anonymous synthesiser.
       *
       * ⭐ **And the identity decides the kind, through the same function the file picker uses**
       * ({@link importedPartVoice}, `src/data/arrangementImport.ts`). This call used to hardcode `"synth"`, so an
       * agent that named each part's instrument got the same nine anonymous synthesizers the interface produced
       * before its own caller-side upgrade — the same file, the same `instruments`, two answers. The shared function
       * is what makes "a named part sounds a recording" true on both roads rather than on one.
       */
      const voice = importedPartVoice(instrument);
      const withTrack = addTrack(next, voice.kind, candidate.part.name.slice(0, 40) || "Imported", {
        ...(instrument === undefined ? {} : { instrument }),
        ...(voice.sample === undefined ? {} : { sample: voice.sample }),
      });
      const trackId = withTrack.tracks[withTrack.tracks.length - 1]!.id;
      // The notes arrive whole rather than one call each: an imported part is one decision, not two hundred edits.
      next = { ...withTrack, notesByTrack: { ...(withTrack.notesByTrack ?? {}), [trackId]: candidate.part.notes } };
    }
    return next;
  });
  // Guarded because `slice(-0)` is `slice(0)`, which is the whole list: an import that added no track would otherwise report every track it did not add.
  const trackIds = withNotes.length === 0 ? [] : result.summary.tracks.slice(-withNotes.length).map((track) => track.id);
  return {
    ...result,
    problems,
    notes: withNotes.reduce((sum, candidate) => sum + candidate.part.notes.length, 0),
    trackIds,
    ...(placements.length ? { situations: placements } : {}),
  };
}

/** ⭐ The arrangement's tempo in beats per minute. It reached the engine as a hardcoded 120 until this existed. */
export function setMcpArrangementTempo(arrangementId: string, bpm: number): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => setArrangementTempo(arrangement, bpm));
}

/**
 * ⭐ **The map, not one number — and the tool that reaches it is why this exists.**
 *
 * Muse re-measured her own list against a later build and kept this entry: "arrangement 无 tempo map — 整曲只能一个固定
 * BPM". She was right about the **surface** and not about the model: `tempoTrack` on the arrangement, its projection
 * into the song input, and the song's creation from it were all built earlier in this work. What was missing was a way
 * to say it from MCP, which is exactly the half-built shape `mcpCoverage.test.ts` refuses.
 */
export function setMcpArrangementTempoMap(
  arrangementId: string,
  points: readonly { atBar: number; bpm: number; curve?: "jump" | "linear" }[]
): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => setArrangementTempoMap(arrangement, points));
}

/**
 * ⭐ **A part in one call — 4176 round trips is not a design, it is a loop on the wrong side of the wire.**
 *
 * Muse measured it: one movement of one piece needed 4176 `add_arrangement_note` calls, raised
 * `MaxListenersExceededWarning`, and took hours. The model never required that; only the surface did.
 *
 * The tool above this reports note counts before and after, because `addTrackNote` **declines `fx` and `folder` tracks
 * silently** — a batch that answered "ok" while adding nothing would hide exactly the mistake worth catching, and a
 * caller comparing counts finds it.
 */
export function addMcpTrackNotes(arrangementId: string, trackId: string, notes: readonly NoteEvent[]): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => addTrackNotes(arrangement, trackId, notes));
}

/**
 * ⭐ **Replace every note on one track.**
 *
 * The model layer can add a note and remove one, and nothing replaces a whole track's notes. This composes no new model
 * operation: it writes the array the same way the single-note writer does, with the same guard for `fx` and `folder`
 * tracks, which cannot hold notes. A caller that wants to add without removing uses `addMcpTrackNotes`.
 */
export function setMcpTrackNotes(
  arrangementId: string,
  trackId: string,
  notes: readonly NoteEvent[]
): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
    if (!track || track.kind === "fx" || track.kind === "folder") return arrangement;
    return {
      ...arrangement,
      notesByTrack: { ...(arrangement.notesByTrack ?? {}), [trackId]: [...notes] },
    };
  });
}

/**
 * ⭐ **The arrangement's time signature, and the reason this wrapper exists at all.**
 *
 * The edit function `setArrangementTimeSignature` was written first and the gate refused the commit:
 * `mcpCoverage.test.ts` requires **every operation that changes the model to be reachable from an MCP tool**, or to be
 * listed in `EXCLUDED` with a reason. That is a good rule and it caught exactly the shape Muse kept reporting — a
 * capability that exists on one side and is unreachable from the other.
 *
 * The signature is **validated rather than clamped** (see the edit function): a caller who writes `"4/5"` gets an
 * error, not a silent 4/4.
 */
export function setMcpArrangementTimeSignature(arrangementId: string, timeSignature: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => setArrangementTimeSignature(arrangement, timeSignature));
}

export function setMcpArrangementBars(arrangementId: string, bars: number): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => setArrangementBars(arrangement, bars));
}

/** A track's level in dB (0 = unity), or its place in the stereo field (−1 left, 0 centre, 1 right). */
export function setMcpTrackGain(arrangementId: string, trackId: string, gainDb: number): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setTrackGain(arrangement, trackId, gainDb)));
}

export function setMcpTrackPan(arrangementId: string, trackId: string, pan: number): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setTrackPan(arrangement, trackId, pan)));
}

/** Folding a folder. Display only, which the tool's own description repeats because a client reads that and not this. */
export function setMcpTrackCollapsed(arrangementId: string, trackId: string, collapsed: boolean): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setCollapsed(arrangement, trackId, collapsed)));
}

/**
 * ⭐ **Where a track's region sits**, in bars — the drag the interface gained, as an operation an agent can call.
 *
 * Both bounds are **required together or absent together**: `null` for both means "the whole arrangement", which is the
 * model's own default and is stored as the field being absent. One `null` and one number is not a range the model has a
 * reading for, so it is refused out loud rather than guessed at — the rule that an assumption must not look like a
 * reading (see `setArrangementTimeSignature`).
 *
 * The clamping the model does (never before bar 1, never shorter than a bar, never past the arrangement's end) is
 * `setTrackRegion`'s, not this wrapper's: the same function the pointer and the arrow keys call.
 */
export function setMcpTrackRegion(arrangementId: string, trackId: string, startBar: number | null, endBar: number | null): ArrangementEditResult {
  if ((startBar === null) !== (endBar === null)) {
    throw new Error("give both startBar and endBar, or neither (null clears the region back to the whole arrangement)");
  }
  const region = startBar === null || endBar === null ? undefined : { startBar, endBar };
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setTrackRegion(arrangement, trackId, region)));
}

function unknownTrack(arrangement: ArrangementV2, trackId: string): string {
  const known = arrangement.tracks.map((track) => track.id).join(", ");
  return `no track "${trackId}" in this arrangement — its tracks are ${known || "none"}`;
}

/** Runs an edit only for a track that exists, so "nothing happened" is never the answer to a typo. */
function refuseUnknownTrack(arrangement: ArrangementV2, trackId: string, apply: () => ArrangementV2): ArrangementV2 {
  if (!arrangement.tracks.some((track) => track.id === trackId)) throw new Error(unknownTrack(arrangement, trackId));
  return apply();
}

/**
 * The arrangement as something the renderer can bounce, through the same flatten the application uses.
 *
 * **The length and the tempo are the arrangement's.** `compileArrangementToSongInput` reads `arrangement.bars` and `arrangement.bpm` — through the same `stepCountFor` the interface uses — so a note written in
 * bar three and a tempo set on the arrangement are what a bounce hears, rather than a compile that claimed one bar at 120 bpm. A caller that wants a longer render moves the arrangement's own length with
 * `set_arrangement_bars`; this stays "render this arrangement" and nothing more.
 *
 * The chain is the application's own: `compileArrangementToSongInput` projects the tracks onto the eight v1 roles, `createSong` wraps them as one clip and one section, and `flattenSong` turns that into the pattern `renderAudio` takes. Nothing here invents a
 * second renderer, which is the rule the whole MCP render surface follows.
 */
/**
 * ⭐ **The notes that sound inside a bar span, so a render can cover part of an arrangement.**
 *
 * `render_arrangement` renders the whole thing, and its `bars` argument is a **pass count** rather than a span —
 * a caller wanting bars 8 to 16 of a long piece has no way to ask. The web has a loop range; this is the MCP
 * side of the same idea, and it belongs here rather than in the tool because the note-to-step mapping is the
 * flatten's, and re-deriving it in the tool is how an off-by-one-bar gets in
 * (`docs/AUDITION_AUDIT.md` §6).
 *
 * Three decisions, each of which could be quietly wrong:
 *
 *   * **The end is exclusive**, matching `assignMcpTakeRange`'s own convention and the `endBar` on a take.
 *   * **A note that starts before the span but sustains into it is included.** A pad is exactly the case someone
 *     auditions bars of, and dropping it because its onset is one bar earlier would make a preview that does not
 *     match what plays.
 *   * **{@link flattenMcpArrangement} then moves the span to zero and clips the head** of a note that began before
 *     it, so the render starts where the span starts and its length is the span's (`bars` in the reply agrees with
 *     `durationSec`). This function alone still keeps absolute positions, which is what the arrangement says; the
 *     shift is the caller's step, done in one place for every tool that takes a span.
 */
export function notesInBarRange(
  notesByTrack: Record<string, readonly NoteEvent[]>,
  range: { startBar: number; endBar: number },
  beatsPerBar: number
): Record<string, NoteEvent[]> {
  if (!(range.endBar > range.startBar)) {
    throw new Error(`the range must end after it starts (got ${range.startBar} to ${range.endBar})`);
  }
  if (!(beatsPerBar > 0) || !(range.startBar >= 0)) {
    throw new Error(`a range needs a positive bar length and a non-negative start (got ${range.startBar}, ${beatsPerBar})`);
  }
  const startBeat = range.startBar * beatsPerBar;
  const endBeat = range.endBar * beatsPerBar;

  const kept: Record<string, NoteEvent[]> = {};
  for (const [trackId, notes] of Object.entries(notesByTrack)) {
    // ⭐ The sustain test is the whole point: a note is in the span when it is still sounding inside it, not
    // only when it begins there.
    const inside = notes.filter((note) => note.startBeats < endBeat && note.startBeats + note.lengthBeats > startBeat);
    if (inside.length > 0) kept[trackId] = [...inside];
  }
  return kept;
}

/**
 * ⭐ **Flatten an arrangement, optionally covering only a span of bars.**
 *
 * `render_arrangement` renders the whole arrangement and its `bars` argument is a pass count, so bars 8 to 16 of
 * a long piece had no way to be asked for through MCP while the web has a loop range for the same job
 * (`docs/AUDITION_AUDIT.md` §5–6). The span narrows the **notes** before they are compiled, because
 * `compileArrangementToSongInput` already builds clips from notes and re-deriving that mapping here is how an
 * off-by-one-bar gets in. The bar length comes from `beatsPerBar`, the one function that reads a time signature,
 * rather than a second interpretation of `"3/4"` living in this file.
 */
/**
 * Move a span to zero on the timeline and clip the head of anything that began before it.
 *
 * The arrangement's notes carry absolute positions; a span render wants the audio to begin where the span does.
 * A note that starts before the span keeps its tail and loses its head, and a note with nothing left inside the
 * span is dropped rather than rendered as a zero-length event.
 */
function intoSpan(
  notesByTrack: Record<string, readonly NoteEvent[]>,
  startBeat: number
): Record<string, NoteEvent[]> {
  const moved: Record<string, NoteEvent[]> = {};
  for (const [trackId, notes] of Object.entries(notesByTrack)) {
    const within = notes
      .map((note) => {
        const clippedStart = Math.max(0, note.startBeats - startBeat);
        const end = note.startBeats + note.lengthBeats - startBeat;
        return { ...note, startBeats: clippedStart, lengthBeats: end - clippedStart };
      })
      .filter((note) => note.lengthBeats > 0);
    if (within.length > 0) moved[trackId] = within;
  }
  return moved;
}

export function flattenMcpArrangement(
  arrangementId: string,
  range?: { startBar: number; endBar: number },
  trackIds?: readonly string[]
): { flattened: FlattenedSong; bars: number } {
  const arrangement = requireArrangement(arrangementId);
  if (arrangement.tracks.length === 0) throw new Error("this arrangement has no tracks, so there is nothing to render");
  const allNotes = arrangement.notesByTrack ?? {};
  /**
   * Two filters, applied in one place so both the range and the track scope travel the same road.
   *
   * `trackIds` is the arrangement-level version of the `trackId` the export tools already take: an agent previewing a
   * change wants the part it changed, not the whole mix. It is optional and its absence is not a default set of tracks
   * -- omitting it keeps every lane exactly as before, which is what makes this addition invisible to existing callers.
   * An unknown id contributes nothing rather than silently rendering everything: a filter that quietly did nothing
   * would answer a question nobody asked.
   */
  const scoped = trackIds
    ? Object.fromEntries(Object.entries(allNotes).filter(([trackId]) => trackIds.includes(trackId)))
    : allNotes;
  const beatsPerMeasure = beatsPerBar(arrangement.timeSignature);
  /**
   * ⭐ **A span render starts where the span starts** (owner's decision, 2026-10-05).
   *
   * This used to keep every note's absolute position and the arrangement's own length, so a one-bar span of a
   * sixteen-bar piece compiled to sixteen bars of audio with the span's notes buried in it — the deep-test report
   * measured exactly that, and the mismatch between `durationSec` and `span` was the tell. The notes are now moved
   * so the span begins at zero, a note that began before the span is **clipped at its head**, and the compiled
   * section is `endBar - startBar` bars long. `bars` in the reply, `totalSteps`, and the audio all agree.
   */
  const spanStartBeat = range ? range.startBar * beatsPerMeasure : 0;
  const inRange = range ? notesInBarRange(scoped, range, beatsPerMeasure) : scoped;
  const notes = range ? intoSpan(inRange, spanStartBeat) : inRange;
  const songInput = compileArrangementToSongInput(
    range ? { ...arrangement, bars: range.endBar - range.startBar } : arrangement,
    notes
  );
  /**
   * The clip needs the fields a `SequencerPattern` requires and nothing more: the compiled lanes, and the four the format insists on. `genre_id` is `"custom"` because an arrangement is not a genre's pattern — saying otherwise would make a render claim a
   * provenance it does not have.
   */
  const clip = { genre_id: "custom", bpm: songInput.bpm, scale: "chromatic", resolution: "1/16" as const, tracks: songInput.clips.A.tracks };
  const song = createSong({
    id: arrangement.songId,
    genreId: "custom",
    bpm: songInput.bpm,
    clip,
    /**
     * ⭐ **The map the projection produced is handed to the song — without this, the two steps before it had no effect.**
     *
     * Creating the song with `bpm` alone dropped the map in silence, and that is exactly the failure the criterion is written to catch: two sections at different tempos would still render, just both at one tempo. The earlier attempt at this line was correct and failed only because the projection did not carry the field yet — the type check said so, which is why it is worth keeping the compiler in the loop rather than trusting that a spread "obviously" works.
     */
    ...(songInput.tempoTrack?.length ? { tempoTrack: songInput.tempoTrack } : {}),
  });
  const flattened = flattenSong(song);
  if (!flattened.totalBars || flattened.totalSteps <= 0) {
    throw new Error(`cannot render "${arrangementId}": ${flattened.problems.join("; ") || "no playable steps"}`);
  }
  return { flattened, bars: flattened.totalBars };
}

/** One line per track, for a caller reading a log rather than parsing a summary. */
export function describeMcpArrangement(arrangementId: string): string {
  const arrangement = requireArrangement(arrangementId);
  const summary = summariseArrangement(arrangementId, arrangement);
  const lines = summary.tracks.map((track) => {
    const parts = [`${track.id}  ${track.name} (${track.kind})`];
    /**
     * ⭐ **Every line says what the track sounds with**, not only a sampler's line. A reader can now tell a real piano
     * from the built-in preset without asking a second tool — which is the whole point of the field.
     */
    parts.push(track.sound.detail);
    if (track.steps.length > 0) parts.push(`${track.stepsOn}/${track.steps.length} steps`);
    if (track.takes.length > 0) parts.push(`${track.takes.length} take(s)${track.selectedTakeId ? `, ${track.selectedTakeId} playing` : ""}`);
    if (track.muted) parts.push("muted");
    return `  ${parts.join(" · ")}`;
  });
  return [`${summary.arrangementId} (${summary.trackCount} track(s))`, ...lines, ...summary.problems.map((problem) => `  ⚠ ${problem}`)].join("\n");
}
