/**
 * The song model: clips and an arrangement.
 *
 * Until now a project was two patterns and a `songChain` of `"A" | "B"` letters that **nothing rendered or played**
 * — the field was persisted and copied around, but the renderer repeated a single pattern `bars` times. This file
 * is the model that makes the chain real: clips hold the patterns the step sequencer edits, and sections place
 * those clips on a timeline.
 *
 * The split matters for where the work goes: **the step sequencer keeps editing a `SequencerPattern`** (a clip),
 * and a new arrangement surface edits `sections`. Nothing about the editing model changes; it gains a parent.
 */
import type { SequencerPattern } from "./genre";

/** The clip slots a project can hold. `A`/`B` are the historical pair; the rest are new. */
export type ClipSlot = "A" | "B" | "C" | "D";

export const CLIP_SLOTS: readonly ClipSlot[] = ["A", "B", "C", "D"];

/**
 * A drum fill: extra hits added to the last pass of a section.
 *
 * It is arrangement data rather than a second clip because that is what a fill *is* — the same groove with the last
 * bar played differently — and because a generator can produce it for any genre without touching the 159 genre
 * files. `steps` are offsets inside one pass of the clip (the pass the section puts last), so a 1-bar clip and a
 * 4-bar clip both express "the last beat of the last bar" the same way.
 */
export interface SongFill {
  /** Track ids (or names) the extra hits land on. A track the clip does not have is simply not hit. */
  tracks: string[];
  /** Step offsets inside one pass of the clip. Out-of-range and non-finite values are ignored. */
  steps: number[];
  /** Velocity for the added hits, 1–127. Defaults to `DEFAULT_FILL_VELOCITY`. */
  velocity?: number;
}

/** The velocity an unspecified fill hit gets. Loud enough to read as a fill, quiet enough not to clip. */
export const DEFAULT_FILL_VELOCITY = 112;

/**
 * Per-section overrides — the arrangement's own dynamics.
 *
 * These are the hook `docs/ARRANGEMENT_PLAN.md`'s B5 hangs on: "a build over 8 bars", "a fill in the last bar" and
 * "the same clip, quieter" are statements about the *timeline*, and expressing them here means the renderer, the
 * arrangement view and the exports all read the same numbers instead of each hacking the pattern.
 */
export interface SectionOverrides {
  /**
   * Velocity multiplier at the section's first and last pass: an 8-bar build is `[0.6, 1]`.
   *
   * The ramp multiplies `velocityScale`, so "a quiet build" and "a build" compose instead of overriding each other.
   * Values are clamped to `[0, 4]` — the same order of magnitude as `velocityScale`, and enough headroom that a
   * share link cannot turn a section into a 1000× gain.
   */
  velocityRamp?: [number, number];
  /** Extra hits on the section's last pass. */
  fill?: SongFill;
  /**
   * Semitones to move this section's *pitched* lanes by — the harmonic half of "change the chord every 8 bars".
   *
   * Drums are untouched by construction: only a step that carries a pitch (`pitch` or a `pitches` stack) moves, and a
   * kick has neither. Clamped to ±24 (two octaves) because a share link or a hand-edited project can carry anything,
   * and clamped again per note into the MIDI range so a transposed line cannot leave the playable set.
   */
  transpose?: number;
}

/**
 * One region on the timeline.
 *
 * `bars` is a repeat count, not a length: a 1-bar clip placed with `bars: 4` plays four times, which is what the
 * renderer's old `bars` argument did — except that now the repeats can differ from section to section, which is
 * the whole point.
 */
export interface SongSection {
  /** Stable id so undo, the share codec and the arrangement view can reference a section across saves. */
  id: string;
  slot: ClipSlot;
  /** How many times the clip repeats. At least 1; the arrangement view clamps to `MAX_SECTION_BARS`. */
  bars: number;
  /** Track ids silenced for this section (a breakdown, a drop). */
  mute?: string[];
  /** Arrangement-level dynamics: 1 = as written, 0.8 = a quieter build-up. */
  velocityScale?: number;
  /** A human label for the section ("intro", "drop", "fill"), shown on the region. */
  label?: string;
  /** B5: the section's own build and fill. */
  overrides?: SectionOverrides;
}

export interface Song {
  id: string;
  name: string;
  genreId: string;
  bpm: number;
  swing: number;
  resolution: "1/8" | "1/16" | "1/32";
  /** The pattern library: what the step sequencer edits and the sections place. */
  clips: Partial<Record<ClipSlot, SequencerPattern>>;
  sections: SongSection[];
  loopRange: [number, number] | null;
}

/** A section longer than this is a mistake, not an arrangement (and it would allocate minutes of audio). */
export const MAX_SECTION_BARS = 64;
/** A song longer than this is refused by the renderer; it is 32 minutes at 120 BPM. */
export const MAX_SONG_BARS = 512;

/** One bar of one clip, after the timeline has been resolved. */
export interface SongBar {
  sectionId: string;
  slot: ClipSlot;
  barInSection: number;
  /** Index in the whole song, from 0. */
  barIndex: number;
  mute: string[];
  /**
   * The section's `velocityScale` **times** the bar's point on its `velocityRamp`.
   *
   * The ramp is folded in here rather than carried alongside, so every consumer that already honours
   * `velocityScale` — `flattenSong`, the arrangement view's readout, any future one — gets an 8-bar build for free
   * instead of each having to learn about ramps separately.
   */
  velocityScale: number;
  /** The section's fill, present only on the section's **last** pass. */
  fill?: SongFill;
  /** The section's transposition in semitones, when it has one. */
  transpose?: number;
}

export interface SongTimeline {
  bars: SongBar[];
  totalBars: number;
  sections: SongSection[];
  /** Problems that make the song unrenderable, phrased for a human. */
  problems: string[];
}

const clampBars = (bars: number): number => {
  if (!Number.isFinite(bars)) return 1;
  return Math.max(1, Math.min(MAX_SECTION_BARS, Math.floor(bars)));
};

/** A share link or an import can carry anything; a ramp outside this range is a mistake, not a mix decision. */
const clampRamp = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.min(4, value)) : 1);

/** Two octaves up or down: past that an arrangement is transposing a line out of its instrument's range. */
export const MAX_SECTION_TRANSPOSE = 24;

/** A section's transposition, or 0 — the value every consumer can multiply by without asking. */
export function sectionTranspose(section: Pick<SongSection, "overrides">): number {
  const value = section.overrides?.transpose;
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_SECTION_TRANSPOSE, Math.min(MAX_SECTION_TRANSPOSE, Math.round(value as number)));
}

/**
 * Where a bar sits on its section's ramp, as a multiplier.
 *
 * A one-bar section is always at the ramp's *end* value: it has no interior to ramp across, and ending is what the
 * user meant by placing a build there (the value the next section starts from).
 */
function rampAt(ramp: [number, number] | undefined, barInSection: number, count: number): number {
  if (!ramp) return 1;
  const [from, to] = [clampRamp(ramp[0]), clampRamp(ramp[1])];
  if (count <= 1) return to;
  return from + ((to - from) * barInSection) / (count - 1);
}

/**
 * Resolve a song into the bar-by-bar timeline the renderer walks, and report what is wrong with it.
 *
 * Returning problems instead of throwing is deliberate: the arrangement view has to be able to show a
 * half-finished song (a section pointing at an empty slot) and the renderer refuses it with a reason, rather than
 * the UI crashing on the way to that refusal.
 */
export function resolveTimeline(song: Song): SongTimeline {
  const problems: string[] = [];
  const bars: SongBar[] = [];
  const known = new Set(Object.keys(song.clips ?? {}) as ClipSlot[]);
  for (const section of song.sections ?? []) {
    if (!known.has(section.slot)) {
      problems.push(`section "${section.label ?? section.id}" points at clip ${section.slot}, which is empty`);
      continue;
    }
    const count = clampBars(section.bars);
    if (count !== section.bars) {
      problems.push(`section "${section.label ?? section.id}" has ${section.bars} bars, clamped to ${count}`);
    }
    const scale = Number.isFinite(section.velocityScale) ? (section.velocityScale as number) : 1;
    const fill = normaliseFill(section.overrides?.fill);
    const transpose = sectionTranspose(section);
    for (let bar = 0; bar < count; bar += 1) {
      bars.push({
        sectionId: section.id,
        slot: section.slot,
        barInSection: bar,
        barIndex: bars.length,
        mute: section.mute ?? [],
        velocityScale: scale * rampAt(section.overrides?.velocityRamp, bar, count),
        // The fill is the section's *last* pass: it is what leads into the next section.
        ...(fill && bar === count - 1 ? { fill } : {}),
        ...(transpose ? { transpose } : {}),
      });
    }
  }
  if (!bars.length) problems.push("the song has no playable sections");
  if (bars.length > MAX_SONG_BARS) {
    problems.push(`the song is ${bars.length} bars, above the ${MAX_SONG_BARS}-bar limit`);
  }
  return { bars, totalBars: bars.length, sections: song.sections ?? [], problems };
}

/**
 * Drop the parts of a fill that cannot be rendered, or `undefined` when nothing is left.
 *
 * A fill can arrive from a share link or a hand-edited project file, and the two things that must not survive are a
 * non-integer step (which would address no step) and a velocity outside the MIDI range (which the renderer would
 * clamp anyway, but silently). An empty track list is "no fill", not "a fill on everything".
 */
export function normaliseFill(fill: SongFill | undefined): SongFill | undefined {
  if (!fill || !Array.isArray(fill.tracks) || !Array.isArray(fill.steps)) return undefined;
  const tracks = [...new Set(fill.tracks.filter((track): track is string => typeof track === "string" && track.length > 0))];
  const steps = [...new Set(fill.steps.filter((step) => Number.isFinite(step)).map((step) => Math.floor(step)))]
    .filter((step) => step >= 0)
    .sort((a, b) => a - b);
  if (!tracks.length || !steps.length) return undefined;
  const velocity = Number.isFinite(fill.velocity)
    ? Math.max(1, Math.min(127, Math.round(fill.velocity as number)))
    : DEFAULT_FILL_VELOCITY;
  return { tracks, steps, velocity };
}

export interface CreateSongInput {
  id: string;
  name?: string;
  genreId: string;
  bpm: number;
  swing?: number;
  resolution?: "1/8" | "1/16" | "1/32";
  clip: SequencerPattern;
}

/** A new song: one clip in slot A, one section of one bar — the smallest thing that can play. */
export function createSong(input: CreateSongInput): Song {
  return {
    id: input.id,
    name: input.name ?? input.genreId,
    genreId: input.genreId,
    bpm: input.bpm,
    swing: input.swing ?? 0,
    resolution: input.resolution ?? "1/16",
    clips: { A: input.clip },
    sections: [{ id: `${input.id}-s1`, slot: "A", bars: 1 }],
    loopRange: null,
  };
}

/** Append a section; the id is derived from the song so a saved song keeps stable ids. */
export function appendSection(song: Song, section: Omit<SongSection, "id">): Song {
  const index = song.sections.length + 1;
  return { ...song, sections: [...song.sections, { ...section, id: `${song.id}-s${index}` }] };
}

export function updateSection(song: Song, id: string, patch: Partial<Omit<SongSection, "id">>): Song {
  return { ...song, sections: song.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)) };
}

export function removeSection(song: Song, id: string): Song {
  return { ...song, sections: song.sections.filter((section) => section.id !== id) };
}

/** Duplicate a section in place — how a "fill" or a "variation" gets made in practice. */
export function duplicateSection(song: Song, id: string): Song {
  const index = song.sections.findIndex((section) => section.id === id);
  if (index === -1) return song;
  const copy: SongSection = { ...song.sections[index], id: `${song.id}-s${song.sections.length + 1}` };
  const sections = [...song.sections];
  sections.splice(index + 1, 0, copy);
  return { ...song, sections };
}

/**
 * Migrate the historical `songChain` into sections.
 *
 * `songChain: ("A" | "B")[]` was one bar per letter, so the mapping is one 1-bar section per entry. A project
 * saved before this change therefore opens with exactly the bars it had, in the same order.
 */
export function migrateSongChain(song: Omit<Song, "sections"> & { sections?: SongSection[] }, songChain: Array<"A" | "B">): Song {
  if (song.sections?.length) return { ...song, sections: song.sections };
  return { ...song, sections: sectionsFromSongChain(song.id, songChain) };
}

/**
 * One 1-bar section per chain entry — the whole migration, usable by a caller that holds a chain but no `Song`.
 *
 * An empty chain becomes one bar of A rather than nothing: a project with no sections cannot play, and the old
 * default was `["A", "B"]`-ish in spirit (something, not silence).
 */
export function sectionsFromSongChain(songId: string, songChain: Array<"A" | "B">): SongSection[] {
  const chain = songChain?.length ? songChain : (["A"] as Array<"A" | "B">);
  return chain.map((slot, index) => ({ id: `${songId}-s${index + 1}`, slot, bars: 1 }));
}

/**
 * The reverse of `migrateSongChain`, for code paths that still speak the old shape (the current persistence layer
 * and the project-hub modal do). Lossy by nature: it can only express A/B and one bar per entry.
 */
export function toSongChain(song: Song): Array<"A" | "B"> {
  return sectionsToSongChain(song.sections);
}

/**
 * The same view from a bare section list.
 *
 * The store keeps `sections` as the source of truth and derives `songChain` from it, and it has no `Song` to hand
 * (it holds two patterns, not a clip library) — so the derivation lives here, once, instead of being re-implemented
 * where the two could disagree.
 */
export function sectionsToSongChain(sections: readonly SongSection[]): Array<"A" | "B"> {
  const chain: Array<"A" | "B"> = [];
  for (const section of sections) {
    const slot: "A" | "B" = section.slot === "B" ? "B" : "A";
    for (let bar = 0; bar < clampBars(section.bars); bar += 1) chain.push(slot);
  }
  return chain;
}

/** A one-line description of the arrangement, for a tooltip or a log. */
export function describeSong(song: Song): string {
  const { totalBars } = resolveTimeline(song);
  const shape = song.sections.map((section) => `${section.label ?? section.slot}×${clampBars(section.bars)}`).join(" → ");
  return `${song.name || song.id}: ${shape || "(empty)"} · ${totalBars} bar${totalBars === 1 ? "" : "s"}`;
}
