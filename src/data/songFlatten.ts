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
import { resolveTimeline, type ClipSlot, type Song, type SongFill, type SongSection } from "../types/song";

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
 * The lanes that can perform a riser: the clip's texture role.
 *
 * Matched the way the fill matcher works — by id **or** name, lowercased — because a clip may carry either as its
 * handle, and a genre's texture lane is called `fx` in some and `riser`/`texture` in others. No lane means no riser,
 * which is the honest outcome for a clip with no texture voice at all.
 */
export function textureLanes(tracks: readonly SequencerTrack[]): string[] {
  const found: string[] = [];
  for (const track of tracks) {
    const id = (track.track_id ?? "").toLowerCase();
    const name = (track.name ?? "").toLowerCase();
    if (!/(^|[^a-z])(fx|riser|texture|sweep|noise)([^a-z]|$)/.test(`${id} ${name}`)) continue;
    if (!found.includes(track.track_id)) found.push(track.track_id);
  }
  return found;
}

/** Does this fill name that lane? Ids and names both, because a clip may carry either as its handle. */
function fillTargets(fill: SongFill, track: SequencerTrack): boolean {
  return fill.tracks.includes(track.track_id) || (!!track.name && fill.tracks.includes(track.name));
}

/**
 * The arrangement as one pattern.
 *
 * A bar here is **one pass of its clip** (that is what `SongSection.bars` counts, and what `resolveTimeline`
 * enumerates), so a clip that is itself four bars long contributes four bars of audio per pass. Mixed clip
 * lengths are summed rather than assumed equal.
 */
export function flattenSong(song: Song): FlattenedSong {
  /**
   * The timeline needs the *clip* to place a riser: which lane can perform one and how long a pass is. Both are the
   * clip's business, so they are handed over as resolvers rather than copied into the song's data.
   */
  const timeline = resolveTimeline(song, {
    riserLanesFor: (slot) => textureLanes(song.clips?.[slot]?.tracks ?? []),
    stepsPerPassFor: (slot) => {
      const clip = song.clips?.[slot];
      return clip?.totalSteps || clip?.tracks?.[0]?.steps?.length || 0;
    },
  });
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
    /**
     * Only an array *every* contributing clip provides becomes one; otherwise the lane keeps the renderer default.
     * The exception is `velocity`: a bar whose section carries a fill names a velocity for the hits it adds, so that
     * lane needs an array even when no clip has one — otherwise the fill would sound at the renderer's default 100
     * and the section's `velocityRamp` would not reach it.
     */
    const filled = playable.some((bar) => bar.fill && fillTargets(bar.fill, baseTrack));
    const arrays = OPTIONAL_STEP_ARRAYS.filter(
      (name) =>
        playable.every((bar) => {
          const track = clipFor(song, bar.slot)?.tracks?.[trackIdx];
          return Array.isArray(track?.[name as OptionalStepArray]);
        }) || (name === "velocity" && filled)
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
      const fill = bar.fill && fillTargets(bar.fill, track) ? bar.fill : undefined;
      /**
       * A fill's velocity, and — when it carries a ramp — the value for *this* step of it.
       *
       * The ramp is what makes a riser a riser, so it is read per step rather than once for the pass; a fill without
       * one keeps the single value it always had, which is why every existing fill is unaffected.
       */
      const fillVelocityAt = (step: number) => {
        if (!fill) return 100;
        const base = fill.velocity ?? 100;
        if (!fill.velocityRamp || fill.steps.length < 2) return base;
        const index = fill.steps.indexOf(step);
        if (index < 0) return base;
        const [from, to] = fill.velocityRamp;
        const t = index / (fill.steps.length - 1);
        return from + (to - from) * t;
      };
      /**
       * The section's transposition moves *pitched* steps and nothing else: a step with no pitch is a drum, and a
       * drum has no key. The shift is applied to `pitch` and to each note of a `pitches` stack, then clamped into the
       * MIDI range so a ±24 section cannot walk a line off the end of the keyboard.
       */
      const transpose = bar.transpose ?? 0;
      const shifted = (note: unknown): unknown =>
        transpose && typeof note === "number" && note > 0 ? Math.max(0, Math.min(127, note + transpose)) : note;

      for (let step = 0; step < clipLength; step += 1) {
        const on = track.steps?.[step] ?? 0;
        const fillHit = Boolean(fill?.steps.includes(step));
        steps.push(muted ? 0 : fillHit ? 1 : on);
        for (const name of arrays) {
          const source = track[name as OptionalStepArray] as unknown[] | undefined;
          const value = source?.[step];
          if (name === "velocity" && !muted) {
            /**
             * A fill hit carries the fill's own velocity; a written value keeps the lane's, scaled.
             *
             * A lane with no written value is `undefined` — the renderer's own default, exactly as before — *unless*
             * the lane is in the array because a fill reaches it, in which case the hole is spelled out as the same
             * 100 the renderer would have used. Not doing so is how a fill would be the one hit in the song the
             * section's ramp did not reach.
             */
            if (fillHit) {
              (built.velocity as number[]).push(
                Math.max(1, Math.min(127, Math.round(fillVelocityAt(step) * scale)))
              );
            } else if (typeof value === "number") {
              (built.velocity as number[]).push(Math.max(1, Math.min(127, Math.round(value * scale))));
            } else {
              (built.velocity as unknown[]).push(filled ? 100 : undefined);
            }
          } else if (name === "pitch") {
            (built.pitch as unknown[]).push(shifted(value));
          } else if (name === "pitches") {
            (built.pitches as unknown[]).push(
              Array.isArray(value) ? value.map((note) => shifted(note)) : value
            );
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

/** What a session currently is: a loop, or an arrangement. */
export interface ExportPatternInput {
  songMode: boolean;
  activeSlot: "A" | "B";
  patterns: { A: SequencerPattern; B: SequencerPattern };
  current: SequencerPattern;
  sections: SongSection[];
  genreId: string;
  bpm: number;
  swing: number;
  resolution: "1/8" | "1/16" | "1/32";
  loopRange: [number, number] | null;
}

export interface ExportPattern {
  pattern: SequencerPattern;
  /** True when the pattern is a flattened arrangement rather than the loop. */
  isSong: boolean;
  problems: string[];
}

/**
 * The pattern an exporter should write.
 *
 * Every exporter (WAV, MP3, MIDI, `.als`) asks this one question instead of each deciding for itself, which is how
 * "the MIDI is 4 bars while the WAV is 16" would otherwise happen. In song mode it flattens the arrangement; in
 * loop mode it returns the pattern being edited, unchanged.
 */
/**
 * The session as a `Song`.
 *
 * Both the exporters and the arrangement view need to know what the session currently *is*, and they must agree:
 * if the view drew an arrangement the WAV export did not flatten (or the other way round), the user would be
 * editing a song they cannot hear. The clip swap is the subtle part — the pattern being edited lives in
 * `input.current`, not in `input.patterns`, until the slot is switched — so it happens once, here.
 */
export function sessionSong(input: ExportPatternInput): Song {
  return {
    id: "session",
    name: input.genreId,
    genreId: input.genreId,
    bpm: input.bpm,
    swing: input.swing,
    resolution: input.resolution,
    clips: {
      A: input.activeSlot === "A" ? input.current : input.patterns.A,
      B: input.activeSlot === "B" ? input.current : input.patterns.B,
    },
    sections: input.sections,
    loopRange: input.loopRange,
  };
}

export function patternForExport(input: ExportPatternInput): ExportPattern {
  if (!input.songMode || !input.sections?.length) {
    return { pattern: input.current, isSong: false, problems: [] };
  }
  const flattened = flattenSong(sessionSong(input));
  return { pattern: flattened.pattern, isSong: true, problems: flattened.problems };
}
