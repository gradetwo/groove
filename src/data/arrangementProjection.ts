/**
 * Old songs projected into the v2 arrangement — the step that makes "lossless" checkable instead of aspirational.
 *
 * The projection is deliberately **additive**: it reads the v1 song and produces a track list, and it **keeps the song id** rather than copying the notes. A copy would drift the moment either side is
 * edited, and the whole point of the projection is that the old data stays exactly where it is.
 *
 * The mapping is the obvious one, and the interesting part is what it does **not** do: it does not merge two lanes of the same kind (the v1 `laneId` exists precisely to keep them apart), and it does not
 * invent tracks for slots that are empty.
 */
import type { Genre, SequencerPattern, SequencerTrack } from "../types/genre";
import { patternFromGenre } from "./genreMix";
import type { ArrangementV2, NoteEvent, TrackKindV2, TrackV2 } from "../types/arrangementV2";

/** The v1 role to v2 kind, with one entry per role — so widening the v1 union becomes a type error here rather than a silent mis-projection. */
const KIND_BY_TRACK_ID: Record<SequencerTrack["track_id"], TrackKindV2> = {
  kick: "drumkit",
  snare: "drumkit",
  hihat: "drumkit",
  percussion: "drumkit",
  bass: "synth",
  chords: "synth",
  lead: "synth",
  fx: "fx",
  // ⭐ The owner's ninth kind, and the one that can be heard: an audio sampler.
  audio: "sampler",
};

/** `track_id` plus `laneId`, because a song may carry two lanes of one kind and merging them would lose one. */
function keyOf(track: SequencerTrack): string {
  return track.laneId ? `${track.track_id}::${track.laneId}` : track.track_id;
}

/**
 * The v2 kind a v1 `track_id` projects to, or `undefined` for a role this build does not have.
 *
 * Exported because `arrangementImport` has to ask the **same** question — "is this projected lane a drum?" — when it
 * decides whether a pitch-less step takes its role's General MIDI number. A second list of drum roles beside this map
 * is the two-places-one-thing failure this file's own key-by-`laneId` rule exists to avoid, and the two would disagree
 * the day a fifth drum role arrives.
 */
export function v1KindForTrackId(trackId: string): TrackKindV2 | undefined {
  return KIND_BY_TRACK_ID[trackId as SequencerTrack["track_id"]];
}

export interface ProjectionInput {
  id: string;
  clips: Record<string, SequencerPattern | undefined>;
}

export function projectSongToV2(song: ProjectionInput): ArrangementV2 {
  const tracks: TrackV2[] = [];
  const seen = new Set<string>();
  const sourceSlots: string[] = [];

  // Slots in a stable order, so two projections of the same song are comparable — a diff between them should mean the song changed, not that a Map iterated differently.
  for (const slot of Object.keys(song.clips).sort()) {
    const clip = song.clips[slot];
    if (!clip?.tracks?.length) continue;
    sourceSlots.push(slot);
    for (const track of clip.tracks) {
      const key = keyOf(track);
      if (seen.has(key)) continue;
      seen.add(key);
      tracks.push({
        id: key,
        kind: KIND_BY_TRACK_ID[track.track_id],
        name: track.name || track.track_id,
        ...(track.sample ? { sample: { assetId: track.sample.assetId } } : {}),
        fromTrackId: track.track_id,
        ...(track.laneId ? { fromLaneId: track.laneId } : {}),
        /**
         * ⭐ **The source lane's instrument travels, because it is the key of the recorded-instrument table.** Without it a
         * projected `piano_lead` chord track is indistinguishable from a `warm_pad` one, so the arrangement cannot reach
         * Salamander and reports "a built-in synthesiser" for both. An empty name is left absent, so a lane that declared
         * nothing keeps `undefined` rather than an empty string that would look like a name.
         */
        ...(track.instrument ? { instrument: track.instrument } : {}),
      });
    }
  }

  /**
   * ⭐ **The notes travel with the tracks.** The projection used to return tracks alone, so every arrangement it produced
   * was silent — a genre project, and anything imported through it. The clip's resolution decides how long a step is.
   */
  const notesByTrack: Record<string, NoteEvent[]> = {};
  for (const slot of Object.keys(song.clips).sort()) {
    const clip = song.clips[slot];
    if (!clip?.tracks?.length) continue;
    for (const track of clip.tracks) {
      const key = keyOf(track);
      if (notesByTrack[key] !== undefined) continue;
      const notes = notesFromSteps(track, stepBeatsFor(clip.resolution));
      if (notes.length > 0) notesByTrack[key] = notes;
    }
  }

  return {
    songId: song.id,
    tracks,
    sourceSlots,
    ...(Object.keys(notesByTrack).length === 0 ? {} : { notesByTrack }),
  };
}

/**
 * Every v1 track in a song, as the projection's own keys — the shape a completeness check compares against.
 *
 * Kept here rather than in a test so the projection and its check cannot disagree about what "every track" means: they use one function.
 */
export function v1TrackKeys(song: ProjectionInput): string[] {
  const keys: string[] = [];
  for (const slot of Object.keys(song.clips).sort()) {
    for (const track of song.clips[slot]?.tracks ?? []) {
      const key = keyOf(track);
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * ⭐ **A genre's music, as an arrangement.** The genre's arranged pattern is projected into an arrangement — the two steps
 * both the web route and the protocol creator need — so the two sides cannot drift apart in how a genre becomes a project.
 */
export function arrangementSeededFromGenre(songId: string, genre: Genre): ArrangementV2 {
  return projectSongToV2({ id: songId, clips: { A: patternFromGenre(genre) } });
}

/** ⭐ A `1/n` resolution is `4/n` beats in four four; anything unreadable falls back to a sixteenth. */
function stepBeatsFor(resolution: SequencerPattern["resolution"] | undefined): number {
  const divisor = Number(String(resolution ?? "").split("/")[1]) || 16;
  return 4 / divisor;
}

/**
 * ⭐ **A lane's steps, as notes.** The mapping is the older grid's (`notesFromTrack`): a step whose value is not above zero
 * holds nothing, its gate becomes the length and its velocity the strength, and a stack of pitches sounds together while a
 * single pitch carries the line. The units change from steps to beats, because that is what an arrangement counts in.
 */
function notesFromSteps(track: SequencerTrack, stepBeats: number, fallbackMidi = 60): NoteEvent[] {
  const notes: NoteEvent[] = [];
  const steps = track.steps ?? [];
  steps.forEach((value, stepIdx) => {
    if (!(value > 0)) return;
    const gate = track.gate?.[stepIdx] ?? 0.8;
    const velocity = Math.max(1, Math.min(127, track.velocity?.[stepIdx] ?? 100));
    const startBeats = stepIdx * stepBeats;
    const lengthBeats = Math.max(stepBeats, gate * stepBeats);
    const stack = track.pitches?.[stepIdx];
    const midis = Array.isArray(stack)
      ? [...new Set(stack.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.round(n)))]
      : [];
    const single = track.pitch?.[stepIdx];
    const chosen = midis.length > 0 ? midis : [typeof single === "number" && single > 0 ? single : fallbackMidi];
    for (const pitch of chosen) notes.push({ pitch, startBeats, lengthBeats, velocity });
  });
  return notes;
}
