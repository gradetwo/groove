/**
 * B6 — the song surface an agent composes with.
 *
 * The MCP tools before this one could build a *pattern* and render a *loop*: `create_song` / `add_section` /
 * `render_song` are what make "an arrangement, not a loop" expressible to a model. The work is here rather than in
 * the tool handlers so it is unit-tested without MCP in the picture, exactly like `pattern.ts` and `exporting.ts`.
 *
 * Songs live in a process-local map keyed by id: MCP tool calls are stateless, so the id `create_song` returns is
 * how a later `add_section` or `render_song` names the same object. The map is deliberately not persisted — the
 * app owns projects; this is a scratchpad for one session.
 */
import {
  appendSection,
  createSong,
  describeSong,
  resolveTimeline,
  type ClipSlot,
  type SectionOverrides,
  type Song,
  type SongSection,
} from "../src/types/song";
import { fillForTracks } from "../src/data/arrangementForm";
import { flattenSong, type FlattenedSong } from "../src/data/songFlatten";
import { patternFromGenre } from "../src/data/genreMix";
import type { Genre, SequencerPattern } from "../src/types/genre";

const songs = new Map<string, Song>();
let sequence = 0;

/** What a tool returns: the whole arrangement in a shape a model can read and edit. */
export interface SongSummary {
  songId: string;
  name: string;
  genreId: string;
  bpm: number;
  swing: number;
  /** Clip slots that hold a pattern. */
  clips: string[];
  totalBars: number;
  /** One line, e.g. `intro×2 → drop×4`. */
  shape: string;
  sections: Array<{
    id: string;
    slot: string;
    bars: number;
    label?: string;
    mute?: string[];
    velocityScale?: number;
    /** B5: the section's build, fill and transposition, when it has any. */
    overrides?: SectionOverrides;
  }>;
  /** Anything that would stop a render (an empty slot, a song over the bar limit). */
  problems: string[];
  /** What the arrangement flattens to: steps the renderer will actually play. */
  totalSteps: number;
}

export function summariseSong(song: Song): SongSummary {
  const timeline = resolveTimeline(song);
  const flattened = flattenSong(song);
  return {
    songId: song.id,
    name: song.name,
    genreId: song.genreId,
    bpm: song.bpm,
    swing: song.swing,
    clips: Object.keys(song.clips ?? {}),
    totalBars: timeline.totalBars,
    shape: song.sections.map((section) => `${section.label ?? section.slot}×${section.bars}`).join(" → "),
    sections: song.sections.map((section) => ({
      id: section.id,
      slot: section.slot,
      bars: section.bars,
      ...(section.label ? { label: section.label } : {}),
      ...(section.mute?.length ? { mute: section.mute } : {}),
      ...(section.velocityScale !== undefined ? { velocityScale: section.velocityScale } : {}),
      ...(section.overrides && Object.keys(section.overrides).length ? { overrides: section.overrides } : {}),
    })),
    problems: flattened.problems,
    totalSteps: flattened.totalSteps,
  };
}

export interface CreateMcpSongInput {
  genreId: string;
  genre?: Genre | null;
  pattern?: SequencerPattern;
  name?: string;
  bpm?: number;
  swing?: number;
  resolution?: "1/8" | "1/16" | "1/32";
  /** Bars in the first section; a clip that is four bars long contributes four bars per pass. */
  bars?: number;
  /** What the first section is, so the shape reads "intro ×4" rather than "A ×4" (`add_section` has always taken this). */
  label?: string;
  /** Extra clips the arrangement may reference, keyed by slot (the agent can point a later section at one). */
  clips?: Partial<Record<ClipSlot, SequencerPattern>>;
}

/**
 * Create a song with one clip (A) and one section.
 *
 * The clip comes from an explicit `pattern` when the caller has one, else from the genre's own arranged pattern
 * (`patternFromGenre`, the same seeding the app does on genre entry) — so an agent that only knows a genre id can
 * still start from real material.
 */
export function createMcpSong(input: CreateMcpSongInput): SongSummary {
  const seed = input.pattern ?? (input.genre ? patternFromGenre(input.genre) : undefined);
  if (!seed) throw new Error("create_song needs a genre with a pattern, or an explicit pattern");
  const id = `mcp-song-${++sequence}`;
  const song = createSong({
    id,
    name: input.name ?? input.genreId,
    genreId: input.genreId,
    bpm: input.bpm ?? seed.bpm ?? 120,
    swing: input.swing,
    resolution: input.resolution,
    clip: seed,
  });
  const withClips: Song = { ...song, clips: { ...song.clips, ...(input.clips ?? {}) } };
  /**
   * The requested repeat count goes in as asked; `resolveTimeline` clamps it *and reports* the clamp, which is
   * what tells a model its 9999-bar request became 64. Pre-clamping here silently produced the clamped song and an
   * empty `problems` list, which is the sort of quiet edit an agent cannot learn from.
   */
  const arranged: Song = {
    ...withClips,
    sections: [
      { ...song.sections[0], bars: input.bars ?? 1, ...(input.label ? { label: input.label } : {}) },
    ],
  };
  songs.set(id, arranged);
  return summariseSong(arranged);
}

export function getMcpSong(songId: string): Song | undefined {
  return songs.get(songId);
}

export interface AddMcpSectionInput {
  songId: string;
  slot: ClipSlot;
  bars?: number;
  label?: string;
  mute?: string[];
  velocityScale?: number;
  /** Insert before this section index; appended when omitted. */
  index?: number;
  /** B5 — a build across the section: the velocity multiplier at its first and last pass, e.g. `[0.6, 1]`. */
  velocityRamp?: [number, number];
  /**
   * B5 — a drum fill on the section's last pass.
   *
   * A boolean, not a lane list: the lanes are derived from the clip the section points at, exactly like the app's own
   * generator (`fillForTracks`), so an agent says "a fill here" without having to know that this genre's snare is
   * called `snare` and that a pass is sixteen steps. A clip with no drum lane gets no fill rather than a fill on a
   * chord.
   */
  fill?: boolean;
  /** B5 — move the section's pitched lanes by this many semitones (±24). */
  transpose?: number;
}

/**
 * Add a section to a song.
 *
 * Refuses a slot the song has no clip for rather than creating a section that cannot play: the arrangement view
 * can *show* a dangling section, but an agent asked to add one deserves the error instead of a silent hole.
 */
export function addMcpSection(input: AddMcpSectionInput): SongSummary {
  const song = songs.get(input.songId);
  if (!song) throw new Error(`unknown songId "${input.songId}" — create one with create_song`);
  if (!song.clips?.[input.slot]) {
    throw new Error(
      `this song has no clip ${input.slot} (it has ${Object.keys(song.clips ?? {}).join(", ") || "none"}); ` +
        "create_song puts the seed pattern in A"
    );
  }
  // The guard above proved the clip exists; the non-null assertion is what tells the compiler.
  const clip = song.clips[input.slot]!;
  const overrides: SectionOverrides = {};
  if (input.velocityRamp) overrides.velocityRamp = input.velocityRamp;
  if (input.transpose !== undefined) overrides.transpose = input.transpose;
  if (input.fill) {
    const stepsPerPass = clip.totalSteps || clip.tracks?.[0]?.steps?.length || 0;
    const fill = fillForTracks(clip.tracks ?? [], stepsPerPass);
    if (fill) overrides.fill = fill;
  }
  const section: Omit<SongSection, "id"> = {
    slot: input.slot,
    // Raw, so the clamp is reported (see `createMcpSong`).
    bars: input.bars ?? 1,
    ...(input.label ? { label: input.label } : {}),
    ...(input.mute?.length ? { mute: input.mute } : {}),
    ...(input.velocityScale !== undefined ? { velocityScale: input.velocityScale } : {}),
    ...(Object.keys(overrides).length ? { overrides } : {}),
  };
  const appended = appendSection(song, section);
  const inserted =
    input.index === undefined
      ? appended
      : (() => {
          const sections = [...appended.sections];
          const moved = sections.pop() as SongSection;
          const at = Math.max(0, Math.min(sections.length, Math.floor(input.index)));
          sections.splice(at, 0, moved);
          return { ...appended, sections };
        })();
  songs.set(song.id, inserted);
  return summariseSong(inserted);
}

/** Replace one clip, which is how an agent gives a section its own variation. */
export function setMcpClip(songId: string, slot: ClipSlot, pattern: SequencerPattern): SongSummary {
  const song = songs.get(songId);
  if (!song) throw new Error(`unknown songId "${songId}" — create one with create_song`);
  const next: Song = { ...song, clips: { ...song.clips, [slot]: pattern } };
  songs.set(songId, next);
  return summariseSong(next);
}

/** The flattened pattern a render plays: the same function B2 renders, so the tool cannot diverge from the app. */
export function flattenMcpSong(songId: string): { song: Song; flattened: FlattenedSong } {
  const song = songs.get(songId);
  if (!song) throw new Error(`unknown songId "${songId}" — create one with create_song`);
  const flattened = flattenSong(song);
  if (!flattened.totalBars || flattened.totalSteps <= 0) {
    throw new Error(`cannot render "${songId}": ${flattened.problems.join("; ") || "no playable bars"}`);
  }
  return { song, flattened };
}

/** One line for a log or a prompt. */
export function describeMcpSong(songId: string): string {
  const song = songs.get(songId);
  if (!song) throw new Error(`unknown songId "${songId}"`);
  return describeSong(song);
}

/** Tests (and a long-lived server) need a clean slate. */
export function clearMcpSongs(): void {
  songs.clear();
  sequence = 0;
}
