/**
 * B3 — the arrangement view's model layer.
 *
 * The view itself is DOM, drag gestures and 44 px targets; everything it *decides* is arithmetic about the song,
 * and that arithmetic lives here so it can be tested without a browser: where each region sits on the bar ruler,
 * what a drag past its neighbours means, and what a resize does at the model's own limits.
 *
 * The renderer (B2) and the persistence layer (B1) already treat `sections` as the source of truth; this module
 * only reorders and resizes that list, never invents a section and never silently drops one.
 */
import { MAX_SECTION_BARS, resolveTimeline, type Song, type SongSection } from "../../types/song";

/** One region as the view draws it: the section, the bar it starts at, and how many bars it covers. */
export interface SectionRegion {
  section: SongSection;
  /** 0-based bar index the region starts at. Unplayable sections do not advance this. */
  startBar: number;
  /** Bars the region occupies — the clamped repeat count, so the ruler and the render agree. */
  bars: number;
}

/**
 * The regions of a song, in timeline order.
 *
 * Built from `resolveTimeline`, not from `song.sections`: a section whose slot has no clip is skipped there (with a
 * reason), and the view must show the *same* timeline the renderer will produce. Laying it out from the raw list
 * would draw a region that never plays and shift everything after it by bars that do not exist.
 */
export function sectionRegions(song: Song): SectionRegion[] {
  const known = new Set(Object.keys(song.clips ?? {}));
  const byId = new Map((song.sections ?? []).map((section) => [section.id, section]));
  const regions: SectionRegion[] = [];
  for (const bar of resolveTimeline(song).bars) {
    // One `SongBar` per pass of the clip, so a section's first bar opens its region.
    if (bar.barInSection !== 0) continue;
    const section = byId.get(bar.sectionId);
    if (!section || !known.has(section.slot)) continue;
    regions.push({ section, startBar: bar.barIndex, bars: Math.max(1, Math.min(MAX_SECTION_BARS, Math.floor(section.bars))) });
  }
  return regions;
}

/** Total bars the view's ruler must draw, as the renderer counts them. */
export function arrangementBars(song: Song): number {
  return resolveTimeline(song).totalBars;
}

/**
 * Move a section to `toIndex` in the arrangement.
 *
 * Clamped rather than rejected: a drag that overshoots the end means "put it last", which is what a user means by
 * dragging it there. An unknown id returns the song unchanged (the view may hold a stale id for one frame).
 */
export function moveSection(song: Song, id: string, toIndex: number): Song {
  const from = song.sections.findIndex((section) => section.id === id);
  if (from === -1) return song;
  const target = Math.max(0, Math.min(song.sections.length - 1, Math.floor(toIndex)));
  if (target === from) return song;
  const sections = [...song.sections];
  const [moved] = sections.splice(from, 1);
  sections.splice(target, 0, moved);
  return { ...song, sections };
}

/**
 * Set a section's repeat count.
 *
 * The clamp is the model's own (`MAX_SECTION_BARS`): the view's edge-drag cannot express "900 bars", and a value
 * that arrives from a share link or an import still has to land inside the renderer's limit. A non-finite value is
 * treated as 1 rather than poisoning the timeline with `NaN`.
 */
export function resizeSection(song: Song, id: string, bars: number): Song {
  const index = song.sections.findIndex((section) => section.id === id);
  if (index === -1) return song;
  const finite = Number.isFinite(bars) ? Math.floor(bars) : 1;
  const clamped = Math.max(1, Math.min(MAX_SECTION_BARS, finite));
  if (song.sections[index].bars === clamped) return song;
  const sections = [...song.sections];
  sections[index] = { ...sections[index], bars: clamped };
  return { ...song, sections };
}

/** Duplicate a section in place — the gesture that makes a fill or a variation. */
export function duplicateSectionInPlace(song: Song, id: string): Song {
  const index = song.sections.findIndex((section) => section.id === id);
  if (index === -1) return song;
  const copy: SongSection = { ...song.sections[index], id: `${song.id}-s${song.sections.length + 1}` };
  const sections = [...song.sections];
  sections.splice(index + 1, 0, copy);
  return { ...song, sections };
}
