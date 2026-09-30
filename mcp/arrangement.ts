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
import { stepCountFor } from "../src/data/noteEvents";
import { toMusicXml } from "../src/data/musicxml";
import { fromMusicXml, fromMusicXmlBytes } from "../src/data/musicxmlImport";
import type { ImportedPart } from "../src/data/musicxmlImport";
import { fromMidi } from "../src/data/midiToArrangement";
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
  setTrackSample,
  setTrackSteps,
} from "../src/data/arrangementEdits";
import type { ArrangementV2, NoteEvent, TrackKindV2, TrackV2 } from "../src/types/arrangementV2";
import type { PlannedTake } from "../src/data/takePlanning";
import { compileArrangementToSongInput } from "../src/data/arrangementCompile";
import { stepsFromNotes, STEPS_PER_BEAT } from "../src/data/noteEvents";
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
  /** Anything that would stop it being heard: an empty arrangement, a sampler with no instrument. */
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
    // Stated because it is the mistake an agent makes here: a sampler with no instrument is silent, and silence reads as a bug in the renderer.
    if (track.kind === "sampler" && !track.sample) problems.push(`"${track.name}" is a sampler with no instrument, so it will be silent`);
    if (track.parentId && !arrangement.tracks.some((candidate) => candidate.id === track.parentId)) {
      problems.push(`"${track.name}" names a folder that is not there`);
    }
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
  const base = input.templateId
    ? createArrangementFromTemplate(songId, input.templateId, input.blankKind)
    : createArrangement(songId, input.blankKind ?? "instrument");
  const id = `arrangement-${++idSequence}`;
  arrangements.set(id, base);
  return summariseArrangement(id, base);
}

function edit(arrangementId: string, apply: (arrangement: ArrangementV2) => ArrangementV2): ArrangementEditResult {
  const arrangement = requireArrangement(arrangementId);
  const next = apply(arrangement);
  arrangements.set(arrangementId, next);
  const summary = summariseArrangement(arrangementId, next);
  return { summary, problems: summary.problems };
}

export function addMcpTrack(arrangementId: string, kind: TrackKindV2, name?: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => addTrack(arrangement, kind, name ?? defaultTrackName(kind)));
}

function defaultTrackName(kind: TrackKindV2): string {
  const names: Record<TrackKindV2, string> = { instrument: "Instrument", drumkit: "Drums", sampler: "Sampler", fx: "Effect", folder: "Folder" };
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

export function setMcpTrackInstrument(arrangementId: string, trackId: string, assetId: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(unknownTrack(arrangement, trackId));
    /**
     * The data layer refuses a non-sampler by returning the arrangement unchanged, which is right for a button and wrong for a caller that cannot see the screen: an agent that points an instrument at a drum track must be told, not left to notice
     * that nothing changed.
     */
    if (track.kind !== "sampler") throw new Error(`"${track.name}" is a ${track.kind} track, and only a sampler track plays a catalogue instrument`);
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
  const file = arrangementToMidi(arrangement);
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
}

export function importMcpMusicXml(arrangementId: string, xml: string, options: ImportMcpMusicXmlOptions = {}): ArrangementEditResult & {
  problems?: string[];
  notes?: number;
  trackIds?: string[];
} {
  return addImportedParts(arrangementId, fromMusicXml(xml), options);
}

/**
 * The same import, from the file's **bytes**: a `.mxl` is a zip, and a caller with one in hand should not have to unzip it first.
 *
 * The bytes are decided by their content rather than by a name the caller supplies, and the answer says which it was, so "I imported a zip" and "I imported XML" are different things a caller can see. The decode is base64 because MCP arguments are JSON, and JSON has no bytes.
 */
export async function importMcpMusicXmlBytes(arrangementId: string, bytesBase64: string, options: ImportMcpMusicXmlOptions = {}): Promise<
  ArrangementEditResult & { problems?: string[]; notes?: number; trackIds?: string[]; format?: string }
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
export function importMcpMidi(
  arrangementId: string,
  bytesBase64: string,
  options: ImportMcpMusicXmlOptions = {}
): ArrangementEditResult & { problems?: string[]; notes?: number; trackIds?: string[]; tempoBpm?: number; timeSignature?: string; format?: number } {
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
): ArrangementEditResult & { problems?: string[]; notes?: number; trackIds?: string[] } {
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

  const result = edit(arrangementId, (current: ArrangementV2) => {
    let next = current;
    for (const candidate of withNotes) {
      const withTrack = addTrack(next, "instrument", candidate.part.name.slice(0, 40) || "Imported");
      const trackId = withTrack.tracks[withTrack.tracks.length - 1]!.id;
      // The notes arrive whole rather than one call each: an imported part is one decision, not two hundred edits.
      next = { ...withTrack, notesByTrack: { ...(withTrack.notesByTrack ?? {}), [trackId]: candidate.part.notes } };
    }
    return next;
  });
  // Guarded because `slice(-0)` is `slice(0)`, which is the whole list: an import that added no track would otherwise report every track it did not add.
  const trackIds = withNotes.length === 0 ? [] : result.summary.tracks.slice(-withNotes.length).map((track) => track.id);
  return { ...result, problems, notes: withNotes.reduce((sum, candidate) => sum + candidate.part.notes.length, 0), trackIds };
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
export function flattenMcpArrangement(arrangementId: string): { flattened: FlattenedSong; bars: number } {
  const arrangement = requireArrangement(arrangementId);
  if (arrangement.tracks.length === 0) throw new Error("this arrangement has no tracks, so there is nothing to render");
  const songInput = compileArrangementToSongInput(arrangement, arrangement.notesByTrack ?? {});
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
    if (track.sampleAssetId) parts.push(`plays ${track.sampleAssetId}`);
    if (track.steps.length > 0) parts.push(`${track.stepsOn}/${track.steps.length} steps`);
    if (track.takes.length > 0) parts.push(`${track.takes.length} take(s)${track.selectedTakeId ? `, ${track.selectedTakeId} playing` : ""}`);
    if (track.muted) parts.push("muted");
    return `  ${parts.join(" · ")}`;
  });
  return [`${summary.arrangementId} (${summary.trackCount} track(s))`, ...lines, ...summary.problems.map((problem) => `  ⚠ ${problem}`)].join("\n");
}
