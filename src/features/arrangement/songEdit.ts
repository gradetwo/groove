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
import {
  MAX_SECTION_BARS,
  MAX_SECTION_TRANSPOSE,
  removeSection,
  resolveTimeline,
  sectionTranspose,
  type Song,
  type SongSection,
} from "../../types/song";

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
  const copy: SongSection = { ...song.sections[index], id: nextSectionId(song) };
  const sections = [...song.sections];
  sections.splice(index + 1, 0, copy);
  return { ...song, sections };
}

/**
 * A free section id.
 *
 * `sections.length + 1` was enough while duplicate was the only creator, but it collides as soon as a duplicate is
 * removed and made again ("session-s3" twice) — and two sections sharing an id makes `moveSection`, `resizeSection`
 * and the view's selection all address the wrong region. Scanning for a free suffix costs nothing at these sizes.
 */
function nextSectionId(song: Song): string {
  const taken = new Set(song.sections.map((section) => section.id));
  for (let n = song.sections.length + 1; ; n += 1) {
    const candidate = `${song.id}-s${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The section index a drop at `bar` means.
 *
 * The view turns a drag into a bar (that is the ruler's job); what a bar *means* is the model's, and it is the same
 * question `sectionRegions` already answered — which region covers this bar. A drop past the last region (or on a
 * bar an unplayable section used to occupy) lands at the end, which is what dragging to the right means.
 *
 * It returns an index into `song.sections`, not into the regions: sections whose clip is empty have no region, and
 * returning a region index here would move the dragged section to the wrong place in exactly the case the view is
 * supposed to be honest about.
 */
export function dropIndexForBar(song: Song, bar: number): number {
  const regions = sectionRegions(song);
  if (!regions.length) return 0;
  const target = Math.max(0, Math.floor(bar));
  const hit = regions.find((region) => target < region.startBar + region.bars) ?? regions[regions.length - 1];
  const index = song.sections.findIndex((section) => section.id === hit.section.id);
  return index === -1 ? song.sections.length - 1 : index;
}

/** Every edit the arrangement view can make to the selected section. */
export type ArrangementCommand = "move-left" | "move-right" | "grow" | "shrink" | "duplicate" | "remove";

/**
 * Apply a keyboard command to one section — the whole keyboard model, as a pure function.
 *
 * The view maps a key to one of these and this does the edit, so the bindings can be tested without a browser and
 * the PC and iPad paths cannot drift: a touch drag and an arrow key end in the same `moveSection`/`resizeSection`.
 * A missing selection (`null`) or a stale id is a no-op, because both happen for one frame during a re-render.
 */
export function applyArrangementCommand(song: Song, id: string | null, command: ArrangementCommand): Song {
  if (!id) return song;
  const index = song.sections.findIndex((section) => section.id === id);
  if (index === -1) return song;
  const section = song.sections[index];
  switch (command) {
    case "move-left":
      return moveSection(song, id, index - 1);
    case "move-right":
      return moveSection(song, id, index + 1);
    case "grow":
      return resizeSection(song, id, section.bars + 1);
    case "shrink":
      return resizeSection(song, id, section.bars - 1);
    case "duplicate":
      return duplicateSectionInPlace(song, id);
    case "remove":
      return removeSection(song, id);
  }
}

/**
 * The section the given key should act on, or `null` when the key is not an arrangement command.
 *
 * Kept here rather than in the component so the *bindings* are testable too: the failure this prevents is a key
 * that only works while the region happens to have focus, which is the kind of difference between mouse and touch
 * nobody notices until an iPad user reports it.
 */
export function commandForKey(key: string, shiftKey = false, metaKey = false): ArrangementCommand | null {
  switch (key) {
    case "ArrowLeft":
      return shiftKey ? "shrink" : "move-left";
    case "ArrowRight":
      return shiftKey ? "grow" : "move-right";
    case "Delete":
    case "Backspace":
      return "remove";
    case "d":
    case "D":
      return metaKey ? "duplicate" : null;
    default:
      return null;
  }
}

/** The longest label a section may carry. Long enough for "second chorus (no hats)", short enough for a region. */
export const MAX_SECTION_LABEL = 32;

/**
 * Set a section's label.
 *
 * An empty (or whitespace-only) label **removes the key** rather than storing an empty string: `label` is what the
 * view falls back from, and a project that has been labelled and unlabelled again should be byte-identical to one
 * that never was — the same reason `mute` is dropped when it empties.
 */
export function setSectionLabel(song: Song, id: string, label: string): Song {
  const index = song.sections.findIndex((section) => section.id === id);
  if (index === -1) return song;
  const trimmed = label.trim().slice(0, MAX_SECTION_LABEL);
  const current = song.sections[index].label ?? "";
  if (current === trimmed) return song;
  const sections = [...song.sections];
  const next: SongSection = { ...sections[index] };
  if (trimmed) next.label = trimmed;
  else delete next.label;
  sections[index] = next;
  return { ...song, sections };
}

/**
 * Silence one lane for one section, or let it back in — a breakdown or a drop, expressed on the timeline.
 *
 * The lane is stored by the id the *clip* uses (a section's `mute` is matched against both `track_id` and `name` by
 * `flattenSong`), and the list is dropped entirely when it empties so an un-muted section is identical to one that
 * was never muted.
 */
export function toggleSectionMute(song: Song, id: string, lane: string): Song {
  const index = song.sections.findIndex((section) => section.id === id);
  if (index === -1 || !lane) return song;
  const sections = [...song.sections];
  const section = sections[index];
  const muted = section.mute ?? [];
  const nextMute = muted.includes(lane) ? muted.filter((entry) => entry !== lane) : [...muted, lane];
  const next: SongSection = { ...section };
  if (nextMute.length) next.mute = nextMute;
  else delete next.mute;
  sections[index] = next;
  return { ...song, sections };
}

/**
 * Move one section's pitched lanes by `semitones`, clamped to the model's own limit.
 *
 * A result of zero **removes the key**, the same rule a label and a mute follow: a section that was transposed and
 * put back is identical to one that never was, so a project round-trips byte for byte and a diff shows only real
 * edits.
 */
export function transposeSection(song: Song, id: string, semitones: number): Song {
  const index = song.sections.findIndex((section) => section.id === id);
  if (index === -1) return song;
  const current = sectionTranspose(song.sections[index]);
  const next = Math.max(-MAX_SECTION_TRANSPOSE, Math.min(MAX_SECTION_TRANSPOSE, Math.round(current + semitones)));
  if (next === current) return song;
  const sections = [...song.sections];
  const overrides = { ...(sections[index].overrides ?? {}) };
  if (next) overrides.transpose = next;
  else delete overrides.transpose;
  const updated: SongSection = { ...sections[index] };
  if (Object.keys(overrides).length) updated.overrides = overrides;
  else delete updated.overrides;
  sections[index] = updated;
  return { ...song, sections };
}
