/**
 * Other people's music **arriving in an arrangement**: the parts a MIDI or MusicXML file holds, and the clips a
 * `.groove` package holds.
 *
 * It exists because the arrangement could already *produce* every one of those files and could not read one back:
 * `arrangementToMidi` had no counterpart on the surface, `fromMidi`/`fromMusicXml` produced parts that only the MCP
 * server knew how to place, and the `.groove` package — the app's own project format — had no path into the new
 * editor at all. The owner's report is exactly that shape: *"有些是功能有了，页面没做入口"*.
 *
 * **Two roads, and the difference is deliberate.** A `.mid` or `.musicxml` file is one or more *parts* of music, so
 * it **adds tracks** beside whatever is on screen — the same thing `mcp/arrangement.ts`'s `addImportedParts` does,
 * with the same rules (a part that holds nothing is not added and is said out loud, and an imported part's notes
 * **replace** the starter content the new track was created with). A `.groove` package is a whole *project* — its
 * own tracks, tempo and meter — so it **replaces** the arrangement rather than duplicating itself into it, which is
 * what "open this project" means everywhere else in the app.
 *
 * **Every conversion here already existed; this file only decides what feeds it.** The v1 clip → v2 track list is
 * `projectSongToV2` (the projection the model was built around), the step grid → notes expansion is `notesFromLane`
 * (the note layer's own migration, which handles chord stacks, gates and ratchets), and the track/notes write is
 * `addTrack` + `addTrackNotes`.
 */
import type { ArrangementV2, NoteEvent, TrackKindV2 } from "../types/arrangementV2";
import type { GrooveProjectPackage } from "../types/project";
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import type { ImportedPart } from "./musicxmlImport";
import { addTrack, MAX_BARS } from "./arrangementEdits";
import { sampledInstrumentFor } from "./sampledInstruments";
import { placementForPart, type SituationPlacement, type StringSituationSpec } from "./stringSituation";
import { projectSongToV2, v1KindForTrackId } from "./arrangementProjection";
import { notesFromLane } from "./noteLayer";
import { drumNoteForRole } from "../audio/drumRoles";
import { beatsPerBar, sortNotes, STEPS_PER_BEAT } from "./noteEvents";

/** What an import did, in the terms a caller can check: which tracks appeared, how many notes, and what was dropped. */
export interface ArrangementImportResult {
  arrangement: ArrangementV2;
  /** The ids of the tracks this import added, in the order they were added. Empty for a whole-project import, which replaces rather than adds. */
  trackIds: string[];
  tracks: number;
  notes: number;
  /** Everything the reader could not carry, said rather than dropped in silence. */
  problems: string[];
  /**
   * ⭐ **One reading per part that was given a situation** — which technique was chosen, which recording it lands on, and
   * the length/velocity/register evidence. Present only when a caller asked by situation, so an import that named no
   * situation has the reply shape it always had.
   */
  situations?: SituationPlacement[];
  /**
   * ⭐ **How many of the added tracks were created as `sampler` tracks playing a recording**, because the name given
   * for their part resolved to one. Absent when none were, so an import that named nothing has the reply shape it
   * always had. It is counted here rather than re-derived by a caller from the arrangement, because "what the import
   * did" is one fact the reply already owns — the file picker's toolbar reads it back and the MCP reply reports it.
   */
  mapped?: number;
}

/**
 * ⭐ **The kind and the recording a named part becomes — the one place a name is turned into a track's identity.**
 *
 * `arrangementWithImportedParts` creates one track per part, and the name a caller gave that part decides what the
 * track **is**: a name the recorded-instrument table serves (`piano_lead`, `walking_upright`, the string techniques, …)
 * makes a `sampler` pointed at the very asset `sampledAssetForLane` resolves the lane to — so the kind, the asset and
 * the sound cannot disagree; anything else — no name, or a name that means a built-in voice — is the `synth` an
 * imported part has always been, which is what keeps the default exactly what it was.
 *
 * **It is exported because `mcp/arrangement.ts` has its own copy of the creation call.** The name→kind decision lived
 * in the interface's own caller (`arrangementFiles.ts`, `withMappedPartsAsSamplers`) and nowhere else, so the same
 * file imported through the mapping dialog produced `sampler` tracks while the same file imported by an agent calling
 * `import_arrangement_midi` with the same `instruments` produced `synth` tracks — two answers to one question, for the
 * same music. One shared function is what makes the two paths the same semantics rather than two implementations.
 */
export function importedPartVoice(instrument: string | undefined): { kind: TrackKindV2; sample?: { assetId: string } } {
  const choice = sampledInstrumentFor(instrument);
  return choice === undefined ? { kind: "synth" } : { kind: "sampler", sample: { assetId: choice.assetId } };
}

/**
 * Add one track per imported part.
 *
 * **All parts, not one.** `mcp/arrangement.ts` defaults to part 0 because a tool call names what it wants; a file
 * picker cannot — the person chose a file, and the file's own track list is what they asked for. A part with no
 * notes is therefore not a silent omission either: it is named in `problems`.
 *
 * ⭐ **`instruments` is the same optional identity the MCP import takes**, keyed by part index, and it exists here for
 * the same measured reason: a file usually cannot say what its parts are. The owner's own project has **no
 * program-change events at all**, so an imported part arrives with a name and notes and nothing else, and without this
 * every part is an anonymous synthesiser. **The default is unchanged** — absent, a part is exactly the track it was
 * before — so this adds a way to name identity without deciding anything on a caller's behalf. Reading it off
 * `part.name` is refused on purpose; see `ImportMcpMusicXmlOptions.instruments`.
 *
 * ⭐⭐ **A name that is a recording makes the track a `sampler` pointed at it, and that decision is made here.**
 * {@link importedPartVoice} turns the name into the created track's kind and asset, so the interface path (which named
 * the parts) and `mcp/arrangement.ts`'s `addImportedParts` (which named them through a tool call) cannot answer
 * differently — this used to be applied by the file picker as a second pass over the arrangement, which left the MCP
 * path creating the same named part as a synthesiser. A name the recorded table does not serve is **said out loud** in
 * `problems` and the track keeps its built-in synthesizer, which is the same treatment every other dropped thing gets;
 * the count of tracks that became samplers travels back as `mapped`.
 *
 * ⭐ **`situations` is the other half: the caller says what the music is doing, and the technique is chosen.** For a
 * part with one, `placementForPart` runs the rule table (`chooseTechnique`) over that part's own notes and returns the
 * **name to write on the track** — so a "short repeating" part plays `vsco2ce:ViolinEnsPizz` rather than being left a
 * synthesiser with the chosen `assetId` unused, which was the owner's report. The reading travels back with the
 * result: the chosen technique, whether it was the first choice, what a fallback fell from, the register, the length
 * verdict and the velocity layers.
 *
 * **When a part is given both a name and a situation**, one has to win and it is said which: the situation is applied
 * (it is the more specific statement — a playing technique on an instrument), and the name is reported as not applied.
 * If the situation itself cannot serve the part, the explicit name stands and the refusal is in `problems`.
 *
 * **The file picker now fills the instruments in; the situations it still cannot.** A multi-part `.mid` opens the
 * mapping dialog (`src/components/arrangement/ImportInstrumentMappingV2.tsx`) before anything is placed, so a person
 * — never a guess at a part's name — decides what each part is, and a caller that names nothing gets exactly the
 * track it got before this option existed. A single-part file places straight away: one part is not a table. Naming
 * a **playing technique** still has no picker, so that half remains a programmatic caller's.
 */
/**
 * ⭐ **How long the arrangement becomes when these parts land in it.**
 *
 * A file states its music, not the host's grid. Importing a five-minute MIDI (125 bars) into an eight-bar
 * arrangement left the ruler, the regions and the transport at **eight bars**, so the piece could not be heard past
 * sixteen seconds without someone typing the length in by hand — measured on 2026-10-07 (the import reported "10
 * track(s), 2096 note(s)" and the Bars field still read 8). The MCP import had the same gap: its reply said
 * `steps: 2000` beside `bars: 8`.
 *
 * The rule is the furthest reach of what arrived; the arrangement's own length is a floor, so an import can never
 * shorten a piece, and `MAX_BARS` caps what the import may *ask for* (a longer file keeps its notes; the length stops
 * at the ceiling rather than pretending).
 */
/**
 * ⭐ **The file's own tempo and meter, in the arrangement's field names.**
 *
 * ⭐ **One place, because two roads disagreed.** The reply has always stated `tempoBpm` and the file picker applied
 * it (`placeMidiIntoArrangement`), while `arrangementWithImportedParts` — the shared data layer both roads build on —
 * and the MCP `addImportedParts` did not: the same file arrived at 100 BPM through one road and at the arrangement's
 * previous tempo through the other. It cost this project a measurement (the same 126-bar piece rendered 252.6 s
 * through MCP against 302 s through the web, and the two were compared as if they described one render), and that is
 * the kind of disagreement a criterion should have caught, which is why `arrangementImportSamplerKind` now holds it.
 */
export function importedTempoAndMeter(imported: { tempoBpm?: number; timeSignature?: string }): {
  bpm?: number;
  timeSignature?: string;
} {
  return {
    ...(imported.tempoBpm === undefined ? {} : { bpm: imported.tempoBpm }),
    ...(imported.timeSignature === undefined ? {} : { timeSignature: imported.timeSignature }),
  };
}

export function barsCoveringNotes(
  currentBars: number,
  parts: readonly { notes: readonly NoteEvent[] }[],
  beats: number
): number {
  const perBar = Math.max(1, beats);
  let furthest = 0;
  for (const part of parts) {
    for (const note of part.notes) {
      const end = note.startBeats + Math.max(0, note.lengthBeats);
      if (end > furthest) furthest = end;
    }
  }
  if (furthest <= 0) return currentBars;
  const needed = Math.ceil(furthest / perBar);
  // ⭐ The cap applies to what the **import asks for**, never to what the arrangement already is: an arrangement
  // longer than the ceiling is left alone rather than shortened to it (the criterion caught exactly that).
  if (needed <= currentBars) return currentBars;
  return Math.min(MAX_BARS, needed);
}

export function arrangementWithImportedParts(
  arrangement: ArrangementV2,
  imported: { parts: readonly ImportedPart[]; problems?: readonly string[]; tempoBpm?: number; timeSignature?: string },
  options: { instruments?: Record<number, string>; situations?: Record<number, StringSituationSpec> } = {}
): ArrangementImportResult {
  const problems = [...(imported.problems ?? [])];
  const instruments = options.instruments ?? {};
  const situations = options.situations ?? {};
  const resolved: Record<number, string> = { ...instruments };
  const readings: SituationPlacement[] = [];
  const bpm = arrangement.bpm ?? 120;
  const withNotes: Array<{ part: ImportedPart; index: number }> = [];
  imported.parts.forEach((part, index) => {
    if (part.notes.length > 0) withNotes.push({ part, index });
    else problems.push(`part ${index + 1} "${part.name}" holds no notes and was not added as a track`);
  });

  /**
   * The situations are resolved **before any track is created**, for the same reason the names are: a choice that
   * cannot be served should be reported rather than written onto a track and forgotten.
   */
  for (const index of Object.keys(situations).map(Number)) {
    const spec = situations[index];
    const part = imported.parts[index];
    if (!spec || !Number.isInteger(index) || index < 0 || index >= imported.parts.length) {
      problems.push(
        `a situation was given for part ${Number.isFinite(index) ? index + 1 : "(not a number)"}, and the file has ${imported.parts.length} part(s)` +
          ` (${imported.parts.map((candidate, at) => `${at + 1} "${candidate.name}"`).join(", ") || "none"}), so nothing was given that situation`
      );
      continue;
    }
    const placement = placementForPart(spec, part.notes, bpm);
    readings.push(placement);
    problems.push(...placement.problems);
    if (placement.instrument) {
      if (instruments[index] !== undefined) {
        problems.push(
          `part ${index + 1} "${part.name}" was given both the instrument "${instruments[index]}" and the situation "${spec.situation}"; ` +
            `the situation was applied, so the track is "${placement.instrument}" (${placement.assetId}) and the name was not`
        );
      }
      resolved[index] = placement.instrument;
    } else if (instruments[index] !== undefined) {
      problems.push(
        `part ${index + 1} "${part.name}" was given the situation "${spec.situation}", which could not serve it, so the named instrument "${instruments[index]}" stands`
      );
    }
  }

  let next = arrangement;
  const trackIds: string[] = [];
  let notes = 0;
  /** How many of the tracks created below are `sampler` tracks playing a recording, for the `mapped` reading. */
  let mapped = 0;
  for (const { part, index } of withNotes) {
    const instrument = resolved[index];
    /**
     * ⭐ **The identity decides what the track *is*, not only what it says.** A name the recorded table serves makes
     * a `sampler` pointed at that asset; anything else is the `synth` every imported part was before this option
     * existed (see {@link importedPartVoice}). Deriving the kind at the one creation call is what keeps the interface
     * and the MCP import from being two answers to this question.
     */
    const voice = importedPartVoice(instrument);
    const withTrack = addTrack(next, voice.kind, part.name.slice(0, 40) || "Imported", {
      ...(instrument === undefined ? {} : { instrument }),
      ...(voice.sample === undefined ? {} : { sample: voice.sample }),
    });
    const trackId = withTrack.tracks[withTrack.tracks.length - 1]!.id;
    /**
     * ⭐ **A name nothing recorded serves is said out loud rather than silently left a synthesiser.** Only when that
     * name is the identity that actually landed: a situation that won over it has already reported the conflict, and
     * "keeps its built-in synthesizer" about a part playing the situation's recording would be false.
     */
    const named = instruments[index];
    if (named !== undefined && named !== "" && resolved[index] === named && sampledInstrumentFor(named) === undefined) {
      problems.push(
        `part ${index + 1} "${part.name}" was named "${named}", which is not one of the recorded instruments, so the track keeps its built-in synthesizer`
      );
    }
    if (voice.kind === "sampler") mapped += 1;
    /**
     * The part's notes **replace** the new track's starter content rather than being appended to it — the starter
     * notes are the app's own "a track with nothing in it looks broken" default, and an imported part has something
     * in it. Appending would put four unasked-for notes at pitch 60 under every import.
     */
    next = { ...withTrack, notesByTrack: { ...(withTrack.notesByTrack ?? {}), [trackId]: sortNotes(part.notes) } };
    trackIds.push(trackId);
    notes += part.notes.length;
  }

  /**
   * ⭐ **The arrangement is as long as the music it now holds.** Before this, an imported 125-bar file played for
   * eight bars; the criterion in `arrangementImportLength.test.ts` is what keeps the two together.
   */
  next = {
    ...next,
    bars: barsCoveringNotes(next.bars ?? 8, withNotes.map(({ part }) => part), beatsPerBar(next.timeSignature)),
    // ⭐ The file's tempo and meter, applied where the notes land, so both import roads and both surfaces agree.
    ...importedTempoAndMeter(imported),
  };

  return {
    arrangement: next,
    trackIds,
    tracks: trackIds.length,
    notes,
    problems,
    ...(mapped === 0 ? {} : { mapped }),
    ...(readings.length ? { situations: readings } : {}),
  };
}

/**
 * A `.groove` package as an arrangement: **the whole project**, with its clips' notes materialised.
 *
 * The package carries two possible shapes and both are read. A v2 package names its `arrangement.clips` (up to four
 * clips and the ordered sections) and that is what is read; a v1 package has only the project's `patterns.A`/`B`, and
 * the package's own doc comment says that is what "one clip, no sections" looks like — so reading the two patterns is
 * a reading of the format rather than a fallback.
 *
 * **`projectSongToV2` gives the tracks and this gives the notes, on purpose.** The projection deliberately *keeps the
 * song id rather than copying the notes* — it exists to read a live v1 song without letting two copies drift — and
 * that reasoning does not apply to a file that has just been opened, where there is no live song to drift from. So
 * the notes are expanded once, here, through `notesFromLane` — the same expansion the note layer uses to migrate a
 * lane — which is what keeps a chord stack, a gate and a ratchet from being flattened to a sixteenth-note grid.
 */
export function arrangementFromGroovePackage(pkg: GrooveProjectPackage, songId: string): ArrangementImportResult {
  const project = pkg.project;
  const clips: Record<string, SequencerPattern | undefined> = pkg.arrangement?.clips ?? { A: project.patterns.A, B: project.patterns.B };
  const projected = projectSongToV2({ id: songId, clips });

  const problems: string[] = [];
  const notesByTrack: Record<string, NoteEvent[]> = {};
  let notes = 0;
  for (const track of projected.tracks) {
    const source = findSourceTrack(clips, track.fromTrackId, track.fromLaneId);
    if (!source) {
      problems.push(`"${track.name}" named a lane the package no longer carries, so it was imported with no notes`);
      notesByTrack[track.id] = [];
      continue;
    }
    const expanded = notesForTrack(source, clipSteps(clips, track.fromTrackId, track.fromLaneId), problems);
    notesByTrack[track.id] = expanded;
    notes += expanded.length;
  }

  const timeSignature = project.timeSignature || undefined;
  /**
   * How long the arrangement is, from the package's own `stepCount` — the length its clips loop over. Sixteen steps is
   * the one-bar floor a projection with nothing stated is read against, so an old package cannot arrive with no length.
   */
  const stepCount = project.stepCount || 16;
  const beats = Math.max(1, beatsPerBar(timeSignature));
  const bars = Math.max(1, Math.ceil(stepCount / STEPS_PER_BEAT / beats));

  const arrangement: ArrangementV2 = {
    ...projected,
    notesByTrack,
    bpm: project.bpm,
    ...(timeSignature === undefined ? {} : { timeSignature }),
    bars,
  };

  return { arrangement, trackIds: [], tracks: projected.tracks.length, notes, problems };
}

/**
 * The clip a projected track came from, found by the two fields the projection keeps for exactly this purpose.
 *
 * `fromLaneId` is checked first because it is the more specific claim: a song may hold two lanes of one `track_id`,
 * and the projection's own key (`track_id::laneId`) exists so the two are not merged. A track with no `fromTrackId`
 * — anything created in the new interface — never reaches here, because a package's clips only carry v1 lanes.
 */
function findSourceTrack(clips: Record<string, SequencerPattern | undefined>, fromTrackId?: string, fromLaneId?: string): SequencerTrack | undefined {
  if (!fromTrackId) return undefined;
  for (const clip of Object.values(clips)) {
    for (const track of clip?.tracks ?? []) {
      if (track.track_id !== fromTrackId) continue;
      if (fromLaneId ? track.laneId === fromLaneId : track.laneId === undefined) return track;
    }
  }
  // A projection may carry a lane id whose source lost it (or the other way round); the role is then the honest match.
  for (const clip of Object.values(clips)) {
    for (const track of clip?.tracks ?? []) {
      if (track.track_id === fromTrackId) return track;
    }
  }
  return undefined;
}

/** How many steps the clip a lane lives in loops over — the length a ratchet or a polymeter is expanded against. */
function clipSteps(clips: Record<string, SequencerPattern | undefined>, fromTrackId?: string, fromLaneId?: string): number {
  for (const clip of Object.values(clips)) {
    for (const track of clip?.tracks ?? []) {
      if (track.track_id !== fromTrackId) continue;
      if (fromLaneId !== undefined && track.laneId !== fromLaneId) continue;
      return clip?.totalSteps ?? track.steps?.length ?? 16;
    }
  }
  return 16;
}

/**
 * **The pitch a projected drum lane's pitch-less step is written at, or the sentence saying why it cannot be.**
 *
 * A value rather than a throw, and exported, for the reason this codebase gives everywhere else: the branch this
 * guards is **unreachable with today's four drum roles** (all of them are rows of `DRUM_ROLE_NOTES`), and an
 * unreachable branch whose answer nobody can call is a hope rather than a guard. A criterion feeds it a role the table
 * does not hold and reads the sentence back.
 */
export function projectedDrumPitch(trackId: string): { pitch: number; problem?: undefined } | { pitch?: undefined; problem: string } {
  const note = drumNoteForRole(trackId);
  if (note === undefined) {
    return {
      problem: `the drum lane "${trackId}" has no note in DRUM_ROLE_NOTES (src/audio/drumRoles.ts), so its hits were imported at pitch 0 — add the role's General MIDI number there to place them`,
    };
  }
  return { pitch: note };
}

/**
 * A v1 lane as arrangement notes.
 *
 * `notesFromLane` gives steps and a 0–1 velocity; the arrangement counts **beats** and 1–127. The syllable the file
 * wrote on a step travels onto every note that step produced, which is the same rule the MIDI and MusicXML writers
 * follow for a lyric: it belongs to the note it is sung on.
 *
 * ⭐ **A drum lane's step carries no pitch, so the arrangement is given its role's General MIDI number.** Every one of
 * the **636** drum lanes in the shipped genre data writes `steps` and no `pitch` column at all (measured: 0 of 636
 * carry `pitch`, 0 carry `pitches`), and `notesFromLane` expands such a step at pitch 0 — the engine's own "a drum has
 * no key" convention. That is right for the engine and wrong for the arrangement, whose vocabulary for a drum hit is
 * the GM percussion number: imported at 0, the percussion staff drew every projected drum lane on its fallback row and
 * reported "GM percussion note 0 is not in the table", and the MIDI writer would have exported pitch 0. The number
 * comes from {@link projectedDrumPitch} (→ `DRUM_ROLE_NOTES`), so the imported lane and the lane that sounds cannot
 * name different pads. A step that **does** carry a pitch keeps it: this is a fallback, not a reinterpretation (a
 * `.groove` v2 package's compiled drum lane holds 36/38/42 and round-trips unchanged).
 *
 * "Is this a drum lane" is asked of the **projection's own map** (`v1KindForTrackId`), not of a second list here.
 */
function notesForTrack(track: SequencerTrack, patternSteps: number, problems: string[]): NoteEvent[] {
  const lane = notesFromLane(track, patternSteps);
  const drum = v1KindForTrackId(track.track_id) === "drumkit";
  const unpitched = drum ? lane.filter((note) => note.pitch <= 0).length : 0;
  const decision = unpitched > 0 ? projectedDrumPitch(track.track_id) : undefined;
  if (decision?.problem) problems.push(decision.problem);
  const roleNote = decision?.pitch;
  const notes: NoteEvent[] = [];
  for (const step of lane) {
    const at = Math.round(step.startStep);
    const syllable = track.syllables?.[at]?.trim();
    notes.push({
      pitch: step.pitch > 0 ? step.pitch : roleNote ?? step.pitch,
      startBeats: step.startStep / STEPS_PER_BEAT,
      // A note with no length is not a note; the same floor the arrangement's own edits use.
      lengthBeats: Math.max(1 / STEPS_PER_BEAT, step.durationSteps / STEPS_PER_BEAT),
      velocity: Math.max(1, Math.min(127, Math.round(step.velocity * 127))),
      ...(syllable ? { syllable } : {}),
    });
  }
  return sortNotes(notes);
}
