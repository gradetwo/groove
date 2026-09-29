/**
 * Old songs projected into the v2 arrangement — the step that makes "lossless" checkable instead of aspirational.
 *
 * The projection is deliberately **additive**: it reads the v1 song and produces a track list, and it **keeps the song id** rather than copying the notes. A copy would drift the moment either side is
 * edited, and the whole point of the projection is that the old data stays exactly where it is.
 *
 * The mapping is the obvious one, and the interesting part is what it does **not** do: it does not merge two lanes of the same kind (the v1 `laneId` exists precisely to keep them apart), and it does not
 * invent tracks for slots that are empty.
 */
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import type { ArrangementV2, TrackKindV2, TrackV2 } from "../types/arrangementV2";

/** The v1 role to v2 kind, with one entry per role — so widening the v1 union becomes a type error here rather than a silent mis-projection. */
const KIND_BY_TRACK_ID: Record<SequencerTrack["track_id"], TrackKindV2> = {
  kick: "drumkit",
  snare: "drumkit",
  hihat: "drumkit",
  percussion: "drumkit",
  bass: "instrument",
  chords: "instrument",
  lead: "instrument",
  fx: "fx",
  // ⭐ The owner's ninth kind, and the one that can be heard: an audio sampler.
  audio: "sampler",
};

/** `track_id` plus `laneId`, because a song may carry two lanes of one kind and merging them would lose one. */
function keyOf(track: SequencerTrack): string {
  return track.laneId ? `${track.track_id}::${track.laneId}` : track.track_id;
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
      });
    }
  }

  return { songId: song.id, tracks, sourceSlots };
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
