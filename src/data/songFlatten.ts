/**
 * B2 — the arrangement, flattened into one pattern the renderer already knows how to play.
 *
 * The renderer repeats a single pattern (`totalSteps = patternSteps * bars`), which is exactly the "infinite loop
 * machine" the listening report heard. The alternative to teaching it a timeline was a second renderer, and this
 * project's rule is that everything goes through `renderPatternOffline` — so the song is flattened *into* a
 * pattern: each section contributes its clip's steps, repeats included, with the section's mutes and velocity
 * scale applied. The renderer then sees an ordinary long pattern and every measurement, gate and exporter keeps
 * working on it.
 *
 * Flattening is pure and lives here rather than inside the exporter so it can be tested exhaustively without
 * audio (bar order, repeats, mutes, velocity, polymeter).
 */
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import { resolveTimeline, type ClipSlot, type Song } from "../types/song";

/** The per-step arrays a clip may carry; `steps` is required, the rest are optional. */
const OPTIONAL_STEP_ARRAYS = ["velocity", "pitch", "pitches", "gate", "ratchet", "probability"] as const;
type OptionalStepArray = (typeof OPTIONAL_STEP_ARRAYS)[number];

export interface FlattenedSong {
  /** The whole arrangement as one pattern, ready for `renderPatternOffline(..., { bars: 1 })`. */
  pattern: SequencerPattern;
  /** Timeline problems plus anything flattening found (a clip with a different track list, say). */
  problems: string[];
  /** Playable bars in the timeline (what the song's length means). */
  totalBars: number;
  /** Steps in the flattened pattern — the sum of each bar's clip length, so mixed clip lengths work. */
  totalSteps: number;
}

const clipFor = (song: Song, slot: ClipSlot): SequencerPattern | undefined => song.clips?.[slot];

/**
 * The arrangement as one pattern.
 *
 * A bar here is **one pass of its clip** (that is what `SongSection.bars` counts, and what `resolveTimeline`
 * enumerates), so a clip that is itself four bars long contributes four bars of audio per pass. Mixed clip
 * lengths are summed rather than assumed equal.
 */
export function flattenSong(song: Song): FlattenedSong {
  const timeline = resolveTimeline(song);
  const problems = [...timeline.problems];
  const bars = timeline.bars;

  if (!bars.length) {
    problems.push("nothing to render: the song has no playable bars");
    return { pattern: skeletonPattern(song), problems, totalBars: 0, totalSteps: 0 };
  }

  const firstClip = clipFor(song, bars[0].slot);
  if (!firstClip) {
    problems.push(`clip ${bars[0].slot} is missing`);
    return { pattern: skeletonPattern(song), problems, totalBars: bars.length, totalSteps: 0 };
  }

  const baseTracks = firstClip.tracks ?? [];
  /**
   * A clip whose track *list* differs from the first bar's cannot be flattened lane by lane; the bar is skipped
   * (with a reason) rather than silently importing another clip's kick into this song's chord lane.
   */
  const playable = bars.filter((bar) => {
    const clip = clipFor(song, bar.slot);
    if (!clip) return false;
    if ((clip.tracks?.length ?? 0) !== baseTracks.length) {
      problems.push(
        `clip ${bar.slot} has ${clip.tracks?.length ?? 0} tracks but the song's first clip has ${baseTracks.length}; ` +
          "the bar was skipped"
      );
      return false;
    }
    return true;
  });

  const totalSteps = playable.reduce((sum, bar) => {
    const clip = clipFor(song, bar.slot)!;
    return sum + clipSteps(clip);
  }, 0);

  const tracks: SequencerTrack[] = baseTracks.map((baseTrack, trackIdx) => {
    /** Only an array *every* contributing clip provides becomes one; otherwise the lane keeps the renderer default. */
    const arrays = OPTIONAL_STEP_ARRAYS.filter((name) =>
      playable.every((bar) => {
        const track = clipFor(song, bar.slot)?.tracks?.[trackIdx];
        return Array.isArray(track?.[name as OptionalStepArray]);
      })
    );

    const steps: number[] = [];
    const built: Partial<Record<OptionalStepArray, unknown[]>> = {};
    for (const name of arrays) built[name] = [];

    for (const bar of playable) {
      const clip = clipFor(song, bar.slot)!;
      const track = clip.tracks[trackIdx];
      const clipLength = clipSteps(clip);
      const muted = bar.mute.includes(track.track_id) || bar.mute.includes(track.name);
      const scale = Number.isFinite(bar.velocityScale) ? bar.velocityScale : 1;

      for (let step = 0; step < clipLength; step += 1) {
        const on = track.steps?.[step] ?? 0;
        steps.push(muted ? 0 : on);
        for (const name of arrays) {
          const source = track[name as OptionalStepArray] as unknown[] | undefined;
          const value = source?.[step];
          if (name === "velocity" && !muted && typeof value === "number") {
            (built.velocity as number[]).push(Math.max(1, Math.min(127, Math.round(value * scale))));
          } else {
            (built[name] as unknown[]).push(value);
          }
        }
      }
    }

    /**
     * Start from the lane's identity, never from its step arrays: spreading the first clip's track would carry its
     * `ratchet` (or gate, or probability) into a song where no clip defines one, which is how a lane ends up with
     * invented subdivisions. Only the arrays built above survive.
     */
    const flattened: SequencerTrack = { ...baseTrack, steps };
    for (const name of OPTIONAL_STEP_ARRAYS) {
      delete (flattened as unknown as Record<string, unknown>)[name];
    }
    for (const name of OPTIONAL_STEP_ARRAYS) {
      const values = built[name];
      if (values) (flattened as unknown as Record<string, unknown>)[name] = values;
    }
    /**
     * Polymeter is a *pattern* concept: a lane that loops every 8 steps has no meaning in a song whose bars come
     * from different clips, and leaving it set would make the renderer wrap the lane inside the flattened song.
     */
    delete (flattened as { trackLength?: number }).trackLength;
    return flattened;
  });

  const pattern: SequencerPattern = {
    ...firstClip,
    genre_id: song.genreId || firstClip.genre_id,
    bpm: song.bpm || firstClip.bpm,
    swing: Number.isFinite(song.swing) ? song.swing : firstClip.swing,
    resolution: song.resolution ?? firstClip.resolution,
    totalSteps,
    tracks,
  };

  return { pattern, problems, totalBars: playable.length, totalSteps };
}

/** A clip's length in steps: its declared `totalSteps`, else its longest lane. */
export function clipSteps(clip: SequencerPattern): number {
  const declared = Number(clip.totalSteps);
  if (Number.isFinite(declared) && declared > 0) return Math.floor(declared);
  return clip.tracks?.reduce((longest, track) => Math.max(longest, track.steps?.length ?? 0), 0) || 0;
}

/** A one-lane, one-step pattern used when there is nothing playable (the caller refuses to render it). */
function skeletonPattern(song: Song): SequencerPattern {
  return {
    genre_id: song.genreId,
    bpm: song.bpm,
    swing: song.swing,
    resolution: song.resolution,
    totalSteps: 0,
    tracks: [],
  } as unknown as SequencerPattern;
}
