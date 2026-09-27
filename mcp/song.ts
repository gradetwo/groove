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
import { setSectionLaneSlots } from "../src/features/arrangement/songEdit";
import { flattenSong, type FlattenedSong } from "../src/data/songFlatten";
import { totalSeconds } from "../src/data/tempoMap";
import { patternFromGenre } from "../src/data/genreMix";
import type { Genre, SequencerPattern } from "../src/types/genre";

const songs = new Map<string, Song>();

/**
 * What each song looked like **before** its last change, per `opId`.
 *
 * The app keeps history per `onChange`; the MCP server kept none, so an agent could only fix a mistake by re-sending the whole state
 * — and the evaluation that prompted this work listed exactly that. Each entry is the previous state plus a stable id and the tool
 * that caused the change, which is what makes "undo to here" answerable rather than "undo one thing".
 */
interface SongHistoryEntry {
  opId: string;
  /** The tool whose call produced the change the entry can undo. */
  op: string;
  /** The state to return to. */
  before: Song;
  at: number;
}

const history = new Map<string, SongHistoryEntry[]>();
let opSequence = 0;

/** Remember the current state of a song before it is replaced. Safe to call for an id that does not exist yet. */
export function rememberSong(songId: string, op = "edit"): string {
  const current = songs.get(songId);
  const opId = `op-${++opSequence}`;
  if (current) {
    const entries = history.get(songId) ?? [];
    entries.push({ opId, op, before: structuredClone(current), at: Date.now() });
    // Bounded: an agent that iterates a thousand times should not hold a thousand songs.
    history.set(songId, entries.slice(-50));
  }
  return opId;
}
let sequence = 0;

/** What a tool returns: the whole arrangement in a shape a model can read and edit. */
export interface SongSummary {
  /** How many measures one pass of a clip is worth for this song: a genre's seeded pattern is 4. */
  passBars: number;
  /** How long the arrangement currently is, in seconds — the number `bars` makes hard to judge. */
  secondsEstimate: number;
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
  /**
   * Measures per pass, taken from the timeline rather than re-derived.
   *
   * The first version computed it from the clip's step count and disagreed with the timeline that expands the arrangement —
   * the timeline is the thing that decides, so the summary reads its arithmetic instead of repeating it (and being subtly
   * wrong about a clip whose `totalSteps` differs from its track's step array).
   */
  const totalPasses = song.sections.reduce((sum, section) => sum + Math.max(1, Math.floor(section.bars)), 0);
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
    /**
     * The two numbers that make `bars` unambiguous, because both composers who drove this server read it as "measures".
     *
     * A section's `bars` counts **passes of its clip**, and a genre's seeded clip is **one bar** of 16 sixteenth steps (`patternFromGenre` gives 16,
     * measured as `totalSteps: 704 = 44 bars x 16`), so `bars: 44` is 44 measures — the reading both composers had to unlearn. `passBars` says what one pass is worth for this song, `secondsEstimate` says how long the whole thing is,
     * and both are returned by `create_song` and by `add_section` (so the estimate moves as sections are added).
     */
    passBars: totalPasses > 0 ? Math.max(1, Math.round(timeline.totalBars / totalPasses)) : 1,
    /**
     * Seconds, from the **step count** rather than from the bar count.
     *
     * The first version went through bars with a hard-coded sixteen steps to a bar, which is wrong the moment a clip is not one
     * bar long: a genre's seeded clip is 64 steps (four bars per pass), so a one-pass song reported three seconds where it plays
     * twelve. The timeline counts a pass as one bar whatever the clip's length, so the bar count cannot be the basis; the step
     * count can, at sixteenth notes.
     */
    /**
     * A song with no tempo map keeps **exactly** the arithmetic it had (`totalSteps * (60 / bpm / 4)`), so nothing about an existing song's reported length
     * moves; a song with one is summed bar by bar through `totalSeconds`, because a single rate cannot describe a piece whose tempo changes.
     */
    secondsEstimate: Number(
      (song.tempoTrack?.length
        ? totalSeconds(song, flattened.totalBars)
        : flattened.totalSteps * (60 / song.bpm / 4)
      ).toFixed(1)
    ),
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
  rememberSong(id, "create_song");
  songs.set(id, arranged);
  return summariseSong(arranged);
}

/**
 * Put a song back into the server, under a new id.
 *
 * This is the other half of `export_groove`: a package carries the arrangement, so a server that restarted (or a second session)
 * can pick a composition up instead of losing it. The clips and sections are taken as they are — the package was validated before
 * it was written and is validated again on the way in — and only the id is regenerated, so importing the same file twice gives two
 * independent songs rather than one that silently overwrites itself.
 */
export function importMcpSong(input: {
  name: string;
  genreId: string;
  bpm: number;
  swing?: number;
  resolution?: "1/8" | "1/16" | "1/32";
  clips: Partial<Record<ClipSlot, SequencerPattern>>;
  sections: SongSection[];
}): SongSummary {
  const slots = Object.keys(input.clips) as ClipSlot[];
  if (!slots.length) throw new Error("this package carries no clips to import");
  const id = `mcp-song-${++sequence}`;
  const song: Song = createSong({
    id,
    name: input.name,
    genreId: input.genreId,
    bpm: input.bpm,
    swing: input.swing,
    resolution: input.resolution,
    clip: input.clips[slots[0]]!,
  });
  const next: Song = {
    ...song,
    clips: { ...song.clips, ...input.clips },
    ...(input.sections.length ? { sections: input.sections } : {}),
  };
  rememberSong(id, "create_song");
  songs.set(id, next);
  return summariseSong(next);
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

export interface DuplicateMcpSectionInput {
  songId: string;
  /** The section to copy, by position in the arrangement. */
  index: number;
  /** Where the copy goes; right after the original when omitted. */
  at?: number;
  /** How many passes the copy gets; the original's when omitted. */
  bars?: number;
  label?: string;
}

/**
 * Copy a section, which is the other half of "write a chorus, then a second chorus".
 *
 * Both composers who drove this server asked for a songwriting shortcut of this shape, and the reason is that the alternative is
 * `add_section` plus re-typing every override — the whole point of a chorus being repeated is that it is the same and then
 * slightly different (one more pass, a fill, a ramp). The copy keeps the original's slot and **all** its overrides, and the
 * caller changes what it wants afterwards.
 */
export function duplicateMcpSection(input: DuplicateMcpSectionInput): SongSummary {
  const song = songs.get(input.songId);
  if (!song) throw new Error(`unknown songId "${input.songId}" — create one with create_song`);
  const original = song.sections[input.index];
  if (!original) {
    throw new Error(
      `this song has no section ${input.index} (it has ${song.sections.length}: 0…${Math.max(0, song.sections.length - 1)})`
    );
  }
  const at = input.at ?? input.index + 1;
  if (at < 0 || at > song.sections.length) {
    throw new Error(`at=${at} is outside the arrangement (0…${song.sections.length})`);
  }
  const copy: SongSection = {
    ...original,
    id: `${original.id}-copy-${song.sections.length}`,
    ...(input.bars !== undefined ? { bars: input.bars } : {}),
    ...(input.label !== undefined ? { label: input.label } : {}),
  };
  const sections = [...song.sections];
  sections.splice(at, 0, copy);
  const next: Song = { ...song, sections };
  rememberSong(input.songId, "add_section");
  songs.set(input.songId, next);
  return summariseSong(next);
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
  rememberSong(song.id, "duplicate_section");
  songs.set(song.id, inserted);
  return summariseSong(inserted);
}

/**
 * Give one section its own copy of the clip it plays — "make unique".
 *
 * The gap this closes, reported from composing: a clip slot is **song-global**, so two sections pointing at B are the *same* clip, and a song
 * whose verses have different lyrics cannot give them different melodies. `set_clip` replaces a slot, which changes every section that reads it;
 * there was no way to change one section.
 *
 * It needs no schema change: `ClipSlot` is already A–D, `set_clip` already accepts all four, the `.groove` format carries them and the editor
 * gained all four in this plan's workstream 3a. So this is an **allocation plus a repoint** — copy the clip into a free slot and point that one
 * section at it — and when all four slots are taken it **says so** rather than overwriting, because a song needing five distinct clips needs a
 * wider slot set, and that is a decision rather than a silent loss.
 */
export function makeUniqueMcpSection(input: {
  songId: string;
  /** Which section, by id or by position. One of the two is required. */
  sectionId?: string;
  index?: number;
  /** Optional replacement clip for the new slot; omitted, the section's current clip is copied. */
  pattern?: SequencerPattern;
}): { summary: SongSummary; allocatedSlot: ClipSlot; sectionId: string } {
  const song = songs.get(input.songId);
  if (!song) throw new Error(`unknown songId "${input.songId}" — create one with create_song`);
  if (!song.sections.length) throw new Error(`song "${input.songId}" has no sections to make unique`);

  const at = input.sectionId
    ? song.sections.findIndex((section) => section.id === input.sectionId)
    : Math.max(0, Math.min(song.sections.length - 1, Math.floor(input.index ?? 0)));
  if (at < 0) throw new Error(`no section "${input.sectionId}" in song "${input.songId}"`);
  const section = song.sections[at]!;

  const taken = new Set(Object.keys(song.clips ?? {}));
  const free = (["A", "B", "C", "D"] as ClipSlot[]).find((slot) => !taken.has(slot));
  if (!free) {
    throw new Error(
      `all four clip slots are in use (${[...taken].sort().join(", ")}), so this section cannot be given its own copy — ` +
        "a song that needs five distinct clips needs a wider slot set, which is a decision rather than something to overwrite"
    );
  }

  const source = input.pattern ?? song.clips?.[section.slot];
  if (!source) throw new Error(`section ${section.id} points at clip ${section.slot}, which this song does not have`);
  const next: Song = {
    ...song,
    clips: { ...song.clips, [free]: source },
    sections: song.sections.map((current, index) => (index === at ? { ...current, slot: free } : current)),
  };
  rememberSong(song.id, "make_unique");
  songs.set(song.id, next);
  return { summary: summariseSong(next), allocatedSlot: free, sectionId: section.id };
}

/**
 * The batch lane-slot edit, at the tool boundary (owner decision 3b).
 *
 * **Known limit, stated rather than hidden**: the sharing report counts each section's own `slot`, so a per-lane override that points a lane at a clip another
 * section already plays is not yet counted as sharing. The report is therefore a lower bound; widening it to effective playback is a small follow-up.
 *
 * The pure function in `songEdit` holds the rule — deep-equal to N single calls, and all-or-nothing when any entry is invalid — so this only has to do the
 * store's part: remember the change for undo, write it, and report what the edited sections now share. That last piece is the same honesty `set_vocal_melody`
 * and `make_unique` carry: a lane slot is **song-global**, so binding three movements to clip B means all three play B, and a caller should be told that
 * rather than discover it.
 */
export function setMcpLaneSlots(
  songId: string,
  edits: ReadonlyArray<{ sectionId: string; trackId: string; slot: ClipSlot | null }>
): { summary: SongSummary; applied: number; problems: string[]; sharedSlots: Array<{ slot: ClipSlot; sections: number }> } {
  const song = songs.get(songId);
  if (!song) throw new Error(`unknown songId "${songId}" — create one with create_song`);

  const result = setSectionLaneSlots(song, edits);
  if (result.problems.length) {
    // All-or-nothing: the store is not written, so a caller cannot be left with a half-bound matrix.
    return { summary: summariseSong(song), applied: 0, problems: result.problems, sharedSlots: [] };
  }

  rememberSong(song.id, "set_lane_slots");
  songs.set(song.id, result.song);

  const touched = new Set(edits.map((edit) => edit.sectionId));
  const counts = new Map<ClipSlot, number>();
  for (const section of result.song.sections ?? []) {
    const slot = (section.slot ?? null) as ClipSlot | null;
    if (slot) counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  const sharedSlots = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .filter(([slot]) => (result.song.sections ?? []).some((section) => touched.has(section.id) && section.slot === slot))
    .map(([slot, sections]) => ({ slot, sections }));

  return { summary: summariseSong(result.song), applied: result.applied.length, problems: [], sharedSlots };
}

/** Replace one clip, which is how an agent gives a section its own variation. */
export function setMcpClip(songId: string, slot: ClipSlot, pattern: SequencerPattern): SongSummary {
  const song = songs.get(songId);
  if (!song) throw new Error(`unknown songId "${songId}" — create one with create_song`);
  const next: Song = { ...song, clips: { ...song.clips, [slot]: pattern } };
  rememberSong(songId, "set_clip");
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


/**
 * Return a song to the state before its most recent change (or before the one `steps` changes ago).
 *
 * The store's history is per `onChange`; this is the same idea at the tool boundary, which is where an agent can actually use it: a
 * wrong `set_clip` or an over-eager `duplicate_section` is one call to undo rather than a re-send of the whole arrangement.
 */
export function undoMcpSong(songId: string, steps = 1): SongSummary {
  const entries = history.get(songId);
  if (!entries?.length) throw new Error(`nothing to undo for "${songId}" — it has not been changed since it was created`);
  const take = Math.max(1, Math.min(Math.floor(steps), entries.length));
  const entry = entries[entries.length - take];
  history.set(songId, entries.slice(0, entries.length - take));
  songs.set(songId, entry.before);
  return summariseSong(entry.before);
}

/** The changes a song has recorded, newest last — what an agent reads to decide how far back to go. */
export function mcpSongHistory(songId: string): Array<{ opId: string; op: string; at: number }> {
  return (history.get(songId) ?? []).map(({ opId, op, at }) => ({ opId, op, at }));
}
