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
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";
import type { GrooveProjectPackage } from "../types/project";
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import type { ImportedPart } from "./musicxmlImport";
import { addTrack } from "./arrangementEdits";
import { projectSongToV2 } from "./arrangementProjection";
import { notesFromLane } from "./noteLayer";
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
}

/**
 * Add one track per imported part.
 *
 * **All parts, not one.** `mcp/arrangement.ts` defaults to part 0 because a tool call names what it wants; a file
 * picker cannot — the person chose a file, and the file's own track list is what they asked for. A part with no
 * notes is therefore not a silent omission either: it is named in `problems`.
 */
export function arrangementWithImportedParts(
  arrangement: ArrangementV2,
  imported: { parts: readonly ImportedPart[]; problems?: readonly string[] }
): ArrangementImportResult {
  const problems = [...(imported.problems ?? [])];
  const withNotes: ImportedPart[] = [];
  imported.parts.forEach((part, index) => {
    if (part.notes.length > 0) withNotes.push(part);
    else problems.push(`part ${index + 1} "${part.name}" holds no notes and was not added as a track`);
  });

  let next = arrangement;
  const trackIds: string[] = [];
  let notes = 0;
  for (const part of withNotes) {
    const withTrack = addTrack(next, "instrument", part.name.slice(0, 40) || "Imported");
    const trackId = withTrack.tracks[withTrack.tracks.length - 1]!.id;
    /**
     * The part's notes **replace** the new track's starter content rather than being appended to it — the starter
     * notes are the app's own "a track with nothing in it looks broken" default, and an imported part has something
     * in it. Appending would put four unasked-for notes at pitch 60 under every import.
     */
    next = { ...withTrack, notesByTrack: { ...(withTrack.notesByTrack ?? {}), [trackId]: sortNotes(part.notes) } };
    trackIds.push(trackId);
    notes += part.notes.length;
  }

  return { arrangement: next, trackIds, tracks: trackIds.length, notes, problems };
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
    const expanded = notesForTrack(source, clipSteps(clips, track.fromTrackId, track.fromLaneId));
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
 * A v1 lane as arrangement notes.
 *
 * `notesFromLane` gives steps and a 0–1 velocity; the arrangement counts **beats** and 1–127. The syllable the file
 * wrote on a step travels onto every note that step produced, which is the same rule the MIDI and MusicXML writers
 * follow for a lyric: it belongs to the note it is sung on.
 */
function notesForTrack(track: SequencerTrack, patternSteps: number): NoteEvent[] {
  const notes: NoteEvent[] = [];
  for (const lane of notesFromLane(track, patternSteps)) {
    const step = Math.round(lane.startStep);
    const syllable = track.syllables?.[step]?.trim();
    notes.push({
      pitch: lane.pitch,
      startBeats: lane.startStep / STEPS_PER_BEAT,
      // A note with no length is not a note; the same floor the arrangement's own edits use.
      lengthBeats: Math.max(1 / STEPS_PER_BEAT, lane.durationSteps / STEPS_PER_BEAT),
      velocity: Math.max(1, Math.min(127, Math.round(lane.velocity * 127))),
      ...(syllable ? { syllable } : {}),
    });
  }
  return sortNotes(notes);
}
