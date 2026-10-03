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
import { resolveTimeline, type ClipSlot, type Song, type SongBar, type SongFill, type SongSection } from "../types/song";

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
  /**
   * The step each section starts at, in the flattened pattern.
   *
   * The flatten is what **discards** the section boundaries — a renderer handed only the pattern cannot know where one section
   * ended and the next began — and a section's hard mute or velocity jump is exactly where an audio boundary should be faded.
   * So the boundary list is returned rather than thrown away: the data stays data, and the fade happens in the render path where
   * the samples are (`docs/DAW_MCP_REFACTOR.md`, stage 3).
   *
   * The first entry is always `0`; a song with no sections has none.
   */
  boundaries: number[];
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

/**
 * Every lane of a clip, in order, each carrying the key that names it **across the song**.
 *
 * The key is `laneId` first and `track_id` second — the same order `mcp/pattern.ts`'s `findTrack` addresses lanes by
 * (`types/genre.ts`), so a second lane of a kind lines up with itself in every clip that carries it. The trailing
 * occurrence index only separates two lanes a clip gives the *same* handle: nothing can address those apart anyway,
 * and collapsing them into one key would silently lose a lane, which is the shape of bug this change exists to stop.
 */
function clipLanes(clip: SequencerPattern): Array<{ key: string; track: SequencerTrack }> {
  const seen = new Map<string, number>();
  return (clip.tracks ?? []).map((track) => {
    const handle = track.laneId ?? track.track_id ?? track.name ?? "";
    const occurrence = seen.get(handle) ?? 0;
    seen.set(handle, occurrence + 1);
    return { key: `${handle}\u0000${occurrence}`, track };
  });
}

/** The lane a clip carries for this key, or `undefined` when the clip has no such lane. */
function laneIn(clip: SequencerPattern | undefined, key: string): SequencerTrack | undefined {
  return clip ? clipLanes(clip).find((lane) => lane.key === key)?.track : undefined;
}

/** The clip a section names for this lane, when it names one that is not the section's own clip. */
function overrideSlotFor(bar: SongBar, baseTrack: { track_id?: string }): ClipSlot | undefined {
  const named = baseTrack.track_id ? bar.slots?.[baseTrack.track_id] : undefined;
  return named && named !== bar.slot ? named : undefined;
}

/**
 * The lane a bar **declares** for this key: the named per-lane clip's own lane when the section names one, else the
 * bar's own clip's.
 *
 * `undefined` means "this bar declares nothing", and it is deliberately **not** the fallback `laneSourceFor` resolves
 * to. A named clip that has no such lane contributes no opinion about that lane's optional arrays — the answer the
 * flattener gave before the union change, kept so that a lane's arrays are read from what the section *asked for*
 * rather than from where it fell back to. Folding the two together would silently add a `velocity` (or `gate`, or
 * `ratchet`) array to songs that never had one, which is a byte-level change this fix must not make.
 */
function declaredLaneFor(
  song: Song,
  bar: SongBar,
  key: string,
  baseTrack: { track_id?: string; name?: string }
): SequencerTrack | undefined {
  return laneIn(clipFor(song, overrideSlotFor(bar, baseTrack) ?? bar.slot), key);
}

/**
 * The clip and lane a **lane** takes its steps from in this bar — the section's own clip, unless the section names
 * another.
 *
 * `SongSection.slots` is the per-lane choice (`docs/TRACK_ARRANGEMENT_PLAN.md`), addressed by `track_id` rather than
 * by position: a lane the other clip does not have falls back to the section's clip instead of quietly taking a
 * different lane's steps. When a section names nothing, this is `clipFor(song, bar.slot)` for every lane — which is
 * what makes the "no overrides is byte-identical" test possible.
 *
 * `null` means neither clip carries this lane: a bar to **pad with silence**, not to drop. The caller writes zero
 * steps for it and keeps its place on the timeline, so the song stays as long as the arrangement says (see the
 * union note in `flattenSong`).
 */
function laneSourceFor(
  song: Song,
  bar: SongBar,
  key: string,
  baseTrack: { track_id?: string; name?: string }
): { clip: SequencerPattern; track: SequencerTrack } | null {
  const primary = clipFor(song, overrideSlotFor(bar, baseTrack) ?? bar.slot);
  const declared = laneIn(primary, key);
  if (primary && declared) return { clip: primary, track: declared };
  const clip = clipFor(song, bar.slot);
  const track = laneIn(clip, key);
  return clip && track ? { clip, track } : null;
}

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
    return { pattern: skeletonPattern(song), problems, totalBars: 0, totalSteps: 0, boundaries: [] };
  }

  const firstClip = clipFor(song, bars[0].slot);
  if (!firstClip) {
    problems.push(`clip ${bars[0].slot} is missing`);
    return { pattern: skeletonPattern(song), problems, totalBars: bars.length, totalSteps: 0, boundaries: [] };
  }

  /**
   * ⭐ **The lanes are the union of every lane the song uses, and a bar that lacks one is padded, never dropped.**
   *
   * The old shape compared each clip's track *count* with the first clip's and returned `false` — the bar vanished
   * from `playable`, so `totalSteps` shrank and the rendered song was shorter than the arrangement (the defect
   * `docs/OPEN_WORK.md` §107.3 records as ⭐4). A count is the wrong test twice over: it says nothing about *which*
   * lane is which, and it turns "this bar has no pad lane" into "this bar does not exist".
   *
   * The union is ordered by first use, so for the ordinary song — every clip carrying the same lanes in the same
   * order — the lane list **is** the first clip's own list and the flattened result is byte-identical to before.
   * What moves is only the case that used to lose a bar: its missing lanes are written as zero steps for that bar
   * (`undefined` in the optional arrays, which is the renderer's "not written", never an invented pitch), and the
   * bar keeps its place in `totalSteps`, `totalBars` and `boundaries`.
   *
   * §106 (the standing "check the industry first" rule, `docs/OPEN_WORK.md` 一百零六): the mature shape is **align and
   * stay silent**, never truncate. Ableton Live's Export Audio/Video dialog documents `Render Length` as deciding
   * "the overall length of the rendered file", with both start and length defaulting "to cover the entire length of
   * the Set", and exporting tracks separately produces files that "will have the same length" — a track with less
   * material is padded out, not allowed to shorten the take
   * (<https://www.ableton.com/en/live-manual/12/managing-files-and-sets/> §5.1.3.1); the same manual resolves content
   * it cannot play by playing "silence instead of the missing samples" rather than dropping the region (§5.6). At the
   * format level a Standard MIDI File is the same: every `MTrk` chunk carries its own events and its own End of
   * Track, and nothing requires the chunks to be equally long, so a track with no event over a span is simply silent
   * there (<https://ccrma.stanford.edu/~craig/14q/midifile/MidiFileFormat.html>). Truncating to the first clip is
   * recorded as the *bug* rather than as a convention: a Cubase import that shows the whole file is contrasted with
   * an application that "will show lenght taking in account only the NotOff of that single note and throwing all the
   * rest of the (empty) midi out" (<https://forum.juce.com/t/midi-file-length/8164>). **No source was found that
   * documents silently dropping a bar on a track-count mismatch** — hence "pad and say so".
   */
  const laneKeys: string[] = [];
  const baseTracks: SequencerTrack[] = [];
  {
    const seen = new Set<string>();
    for (const bar of bars) {
      const clip = clipFor(song, bar.slot);
      if (!clip) continue;
      for (const lane of clipLanes(clip)) {
        if (seen.has(lane.key)) continue;
        seen.add(lane.key);
        laneKeys.push(lane.key);
        baseTracks.push(lane.track);
      }
    }
  }

  const mismatched = bars.filter((bar) => {
    if (!clipFor(song, bar.slot)) return false;
    return laneKeys.some((key, index) => !laneSourceFor(song, bar, key, baseTracks[index]!));
  });
  /**
   * Still a **visible** problem — never silence about it. What changed is the tail: the bar is padded with silence
   * and keeps its length, rather than being skipped and shortening the song. The sentence is reported for exactly
   * the bars that are padded, which is not the same set as "clip count differs from the first clip's" once a later
   * clip is the longer one.
   */
  for (const bar of mismatched) {
    const count = clipFor(song, bar.slot)!.tracks?.length ?? 0;
    const first = firstClip.tracks?.length ?? 0;
    problems.push(
      count === first
        ? `clip ${bar.slot} has ${count} tracks, the same count as the song's first clip, but not the same lanes; ` +
            "the bar was padded with silence"
        : `clip ${bar.slot} has ${count} tracks but the song's first clip has ${first}; the bar was padded with silence`
    );
  }

  /**
   * A bar whose clip is absent cannot be measured (there is no pass length to write), so it is the one bar still
   * dropped. `resolveTimeline` cannot produce one — it enumerates a section only when its slot holds a clip — so
   * this guard is for a hand-built `Song` and behaves exactly as it did before.
   */
  const playable = bars.filter((bar) => clipFor(song, bar.slot) !== undefined);

  const totalSteps = playable.reduce((sum, bar) => {
    const clip = clipFor(song, bar.slot)!;
    return sum + clipSteps(clip);
  }, 0);

  /**
   * Where each **section** begins, in flattened steps.
   *
   * `playable` is one entry per bar, so a boundary is a step index that belongs to a bar whose `barInSection` is 0 — the first
   * bar of a section — which is the same test the timeline uses to place a section's overrides.
   */
  const boundaries: number[] = [];
  {
    let offset = 0;
    for (const bar of playable) {
      if (bar.barInSection === 0) boundaries.push(offset);
      offset += clipSteps(clipFor(song, bar.slot)!);
    }
  }

  const tracks: SequencerTrack[] = baseTracks.map((baseTrack, trackIdx) => {
    /** This union lane's identity — what `laneSourceFor` matches a clip's own lanes against. */
    const key = laneKeys[trackIdx]!;
    /**
     * Only an array *every* contributing clip provides becomes one; otherwise the lane keeps the renderer default.
     * The exception is `velocity`: a bar whose section carries a fill names a velocity for the hits it adds, so that
     * lane needs an array even when no clip has one — otherwise the fill would sound at the renderer's default 100
     * and the section's `velocityRamp` would not reach it.
     */
    const filled = playable.some((bar) => bar.fill && fillTargets(bar.fill, baseTrack));
    const arrays = OPTIONAL_STEP_ARRAYS.filter(
      (name) =>
        playable.some((bar) =>
          Array.isArray(declaredLaneFor(song, bar, key, baseTrack)?.[name as OptionalStepArray])
        ) || (name === "velocity" && filled)
    );

    const steps: number[] = [];
    const built: Partial<Record<OptionalStepArray, unknown[]>> = {};
    for (const name of arrays) built[name] = [];

    for (const bar of playable) {
      /**
       * A lane the section's own clip choice does not provide falls back to the section's clip: a missing name is
       * "no opinion", not "silence".
       *
       * ⭐ A bar whose clip has **no such lane at all** is the one case the fallback cannot answer, and it is where
       * the old code used to drop the bar. `track` stays `undefined` there and the bar contributes zero steps —
       * silence, of the bar's own length — instead of being removed from the song.
       */
      const source = laneSourceFor(song, bar, key, baseTrack);
      const clip = source?.clip ?? clipFor(song, bar.slot)!;
      const track = source?.track;
      const clipLength = clipSteps(clip);
      const muted = !track || bar.mute.includes(track.track_id) || bar.mute.includes(track.name);
      const scale = Number.isFinite(bar.velocityScale) ? bar.velocityScale : 1;
      const fill = track && bar.fill && fillTargets(bar.fill, track) ? bar.fill : undefined;
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
        const on = track?.steps?.[step] ?? 0;
        const fillHit = Boolean(fill?.steps.includes(step));
        steps.push(muted ? 0 : fillHit ? 1 : on);
        for (const name of arrays) {
          const written = track?.[name as OptionalStepArray] as unknown[] | undefined;
          const value = written?.[step];
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

  return {
    // Additive: a song with no tempo map returns the very same pattern object, so nothing downstream can observe this change.
    pattern: song.tempoTrack?.length ? { ...pattern, tempoTrack: song.tempoTrack } : pattern,
    problems,
    totalBars: playable.length,
    totalSteps,
    boundaries,
  };
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
  activeSlot: ClipSlot;
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

/**
 * Where in the *editor's* grid the transport is, while it plays the arrangement (B7).
 *
 * The grid shows the loop being edited — one pass of one clip — and the transport is now playing a whole song, so its
 * step index runs into the hundreds. Highlighting that index directly puts the beam past the end of the grid; the
 * useful answer is "which pass of which section, and how far into it".
 *
 * `matchesEditor` is the honesty: it is true only when the playing section uses the clip the grid is showing. A song
 * whose chorus is clip B while the editor shows clip A has nowhere meaningful to point, and saying so beats drawing
 * the beam at a step that belongs to different music.
 */
export interface SongEditorPosition {
  /** Index into the timeline's bars (one bar is one pass of a clip). */
  barIndex: number;
  sectionId: string;
  /** The clip slot the pass plays. `ClipSlot` rather than `A | B`: a song may use any slot the store allows. */
  slot: ClipSlot;
  /** Step within that pass — what the grid's own step index means. */
  localStep: number;
  /** Whether the grid is showing the clip this pass plays. */
  matchesEditor: boolean;
}

export function editorPositionFor(
  input: ExportPatternInput,
  absoluteStep: number
): SongEditorPosition | null {
  if (!input.songMode || !input.sections?.length) return null;
  if (!Number.isFinite(absoluteStep) || absoluteStep < 0) return null;
  const stepsPerPass = input.current.totalSteps || input.current.tracks?.[0]?.steps?.length || 0;
  if (stepsPerPass <= 0) return null;
  // The song's own clips (built by `sessionSong`), not the A/B pair: a song may reference slots the editor's pair
  // does not carry, and the timeline is what knows which pass plays what.
  const song = sessionSong(input);
  const timeline = resolveTimeline(song, {
    riserLanesFor: (slot) => textureLanes(song.clips?.[slot]?.tracks ?? []),
    stepsPerPassFor: (slot) => {
      const clip = song.clips?.[slot];
      return clip?.totalSteps || clip?.tracks?.[0]?.steps?.length || 0;
    },
  });
  const barIndex = Math.floor(absoluteStep / stepsPerPass);
  const bar = timeline.bars[barIndex];
  if (!bar) return null;
  return {
    barIndex,
    sectionId: bar.sectionId,
    slot: bar.slot,
    localStep: absoluteStep % stepsPerPass,
    matchesEditor: bar.slot === input.activeSlot,
  };
}

export function patternForExport(input: ExportPatternInput): ExportPattern {
  if (!input.songMode || !input.sections?.length) {
    return { pattern: input.current, isSong: false, problems: [] };
  }
  const flattened = flattenSong(sessionSong(input));
  return { pattern: flattened.pattern, isSong: true, problems: flattened.problems };
}
