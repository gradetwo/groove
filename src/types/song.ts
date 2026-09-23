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
  velocityScale: number;
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
    for (let bar = 0; bar < count; bar += 1) {
      bars.push({
        sectionId: section.id,
        slot: section.slot,
        barInSection: bar,
        barIndex: bars.length,
        mute: section.mute ?? [],
        velocityScale: section.velocityScale ?? 1,
      });
    }
  }
  if (!bars.length) problems.push("the song has no playable sections");
  if (bars.length > MAX_SONG_BARS) {
    problems.push(`the song is ${bars.length} bars, above the ${MAX_SONG_BARS}-bar limit`);
  }
  return { bars, totalBars: bars.length, sections: song.sections ?? [], problems };
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
