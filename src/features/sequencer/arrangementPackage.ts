import { APP_VERSION } from "../../version";
import type { ArrangementV2 } from "../../types/arrangementV2";
import { CLIP_SLOTS, type ClipSlot, type SongSection } from "../../types/song";

/**
 * ⭐ **The v2 package: an arrangement, and nothing of the older model.**
 *
 * The owner's decision is that the package carries tracks, notes, takes, bars and a tempo map, and carries no clips or
 * slots. The validator below enforces exactly that, which is what makes this a v2 shape rather than the older one with a
 * new name: a package that carries the old keys is refused, not accepted, so the two cannot coexist.
 *
 * ⭐ **Revised on 2026-10-09, at the owner's instruction ("B")**: the package may also carry the project's **song
 * structure** — its sections and the chain that orders them — under the key `song`. The third evaluation asked for exactly
 * this (F09, "定义统一工程元数据 schema，导入/导出保持 name、作者、版本、section", and §6, "sections 和动态曲线的结构化规划"),
 * and the previous "no sections at all" decision could not express a song that the arrangement view plays.
 *
 * Three properties keep that revision from becoming the old shape again:
 *   · the key is **`song`**, never `sections` — the v1 keys below are still refused, so a file cannot claim to be v2 while
 *     carrying the old `arrangement.sections`;
 *   · it is **absent** unless the project actually has a song. A project with one loop writes a package byte-identical to
 *     the one it wrote before this field existed, so nothing needs migrating;
 *   · a song is written only when it is **complete** (a chain *and* sections). Sections without a chain are a list with no
 *     song: measured 2026-10-09, the engine plays the loop in that case, so a package that claimed a song would be lying.
 */
export const ARRANGEMENT_PACKAGE_FORMAT = "groove-arrangement";

/**
 * ⭐ **The song a project plays, when it has one**: the sections and the chain that orders them.
 *
 * Both halves are required together, because either alone is not a song. `sectionsToSongChain` derives the chain from the
 * sections in the studio, but the chain is what flattening walks, so the file carries what the engine reads.
 */
export interface ArrangementSongStructure {
  chain: ClipSlot[];
  sections: SongSection[];
}

export interface ArrangementPackage {
  format: typeof ARRANGEMENT_PACKAGE_FORMAT;
  appVersion: string;
  /** ⭐ Who wrote it and when, so a file found later still explains itself. */
  writtenAt: string;
  arrangement: ArrangementV2;
  /** ⭐ Absent when the project has one loop and no song — see the doc comment above. */
  song?: ArrangementSongStructure;
}

/** ⭐ The clip slots a section or a chain entry may name, read from the model rather than restated. */
const CLIP_SLOT_NAMES: readonly string[] = CLIP_SLOTS;

/** ⭐ The v1 keys whose presence means the package is not a v2 one. */
const OLD_SHAPE_KEYS = ["clips", "slots", "sections", "project"] as const;

/** ⭐ A song is written only when both halves are there — see the doc comment on the shape. */
function completeSong(song: ArrangementSongStructure | undefined): ArrangementSongStructure | undefined {
  if (!song) return undefined;
  if (!Array.isArray(song.chain) || song.chain.length === 0) return undefined;
  if (!Array.isArray(song.sections) || song.sections.length === 0) return undefined;
  return song;
}

export function buildArrangementPackage(
  arrangement: ArrangementV2,
  appVersion: string = APP_VERSION,
  writtenAt: string = new Date().toISOString(),
  song?: ArrangementSongStructure
): ArrangementPackage {
  const carried = completeSong(song);
  return {
    format: ARRANGEMENT_PACKAGE_FORMAT,
    appVersion,
    writtenAt,
    arrangement,
    ...(carried === undefined ? {} : { song: carried }),
  };
}

/**
 * ⭐ **Refuse the old shape rather than tolerate it.** A tolerant validator would let both live, which is the thing the
 * decision forbids; the error names the key it found so the caller learns which shape it holds.
 */
export function validateArrangementPackage(data: unknown): ArrangementPackage {
  if (!data || typeof data !== "object") throw new Error("Invalid arrangement package: not an object");
  const pkg = data as Record<string, unknown>;
  if (pkg.format !== ARRANGEMENT_PACKAGE_FORMAT) {
    throw new Error(`Invalid arrangement package: format is ${String(pkg.format)}, expected ${ARRANGEMENT_PACKAGE_FORMAT}`);
  }
  if (typeof pkg.appVersion !== "string" || !pkg.appVersion) {
    throw new Error("Invalid arrangement package: appVersion is missing");
  }
  const arrangement = pkg.arrangement as Record<string, unknown> | undefined;
  if (!arrangement || typeof arrangement !== "object") {
    throw new Error("Invalid arrangement package: arrangement is missing");
  }
  const found = OLD_SHAPE_KEYS.filter((key) => key in arrangement || key in pkg);
  if (found.length) {
    throw new Error(`Invalid arrangement package: it carries the v1 shape (${found.join(", ")})`);
  }
  if (!Array.isArray(arrangement.tracks)) {
    throw new Error("Invalid arrangement package: arrangement is missing its tracks");
  }
  /**
   * ⭐ **The song, when the file claims one — values, not only shape** (the same rule F06 established for the notes).
   *
   * A section whose slot is not a clip slot, or whose length is zero, is not a section anything can play; accepting it
   * would put a broken song into the engine through a door that is supposed to be the strict one.
   */
  if (pkg.song !== undefined) {
    const song = pkg.song as { chain?: unknown; sections?: unknown };
    if (!song || typeof song !== "object") throw new Error("Invalid arrangement package: song must be an object");
    if (!Array.isArray(song.chain) || song.chain.length === 0) {
      throw new Error("Invalid arrangement package: song is missing its chain (sections without a chain are not a song)");
    }
    song.chain.forEach((slot, index) => {
      if (typeof slot !== "string" || !CLIP_SLOT_NAMES.includes(slot)) {
        throw new Error(`Invalid arrangement package: song.chain[${index}] is ${JSON.stringify(slot)}, not one of ${CLIP_SLOT_NAMES.join("/")}`);
      }
    });
    if (!Array.isArray(song.sections) || song.sections.length === 0) {
      throw new Error("Invalid arrangement package: song is missing its sections");
    }
    song.sections.forEach((raw, index) => {
      const section = raw as { id?: unknown; slot?: unknown; bars?: unknown; mute?: unknown };
      if (!section || typeof section !== "object") {
        throw new Error(`Invalid arrangement package: song.sections[${index}] is not an object`);
      }
      if (typeof section.id !== "string" || section.id.length === 0) {
        throw new Error(`Invalid arrangement package: song.sections[${index}].id must be a non-empty string`);
      }
      if (typeof section.slot !== "string" || !CLIP_SLOT_NAMES.includes(section.slot)) {
        throw new Error(`Invalid arrangement package: song.sections[${index}].slot is ${JSON.stringify(section.slot)}, not one of ${CLIP_SLOT_NAMES.join("/")}`);
      }
      if (typeof section.bars !== "number" || !Number.isFinite(section.bars) || section.bars < 1) {
        throw new Error(`Invalid arrangement package: song.sections[${index}].bars must be a finite number of at least 1`);
      }
      if (section.mute !== undefined && (!Array.isArray(section.mute) || section.mute.some((id) => typeof id !== "string"))) {
        throw new Error(`Invalid arrangement package: song.sections[${index}].mute must be a list of track ids`);
      }
    });
  }
  /**
   * ⭐ **The values, not only the shape** (third evaluation, F06).
   *
   * Everything above checks that the file *is* a v2 package; none of it checks that what the file says is playable. The
   * evaluation imported a file carrying invalid notes and an invalid tempo and the app accepted it — one track, 129 bars
   * — and the mistake only surfaced later, as silence or as a bar count nothing could explain. A note outside MIDI, a
   * velocity of zero, a negative start or a length that is not positive are all statements the model cannot hold, so
   * they are refused **at the door** with the field named, which is the same rule the shape half already follows.
   */
  const notes = arrangement.notesByTrack;
  if (notes !== undefined) {
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
      throw new Error("Invalid arrangement package: notesByTrack is not a map of track id to notes");
    }
    for (const [trackId, list] of Object.entries(notes as Record<string, unknown>)) {
      if (!Array.isArray(list)) throw new Error(`Invalid arrangement package: the notes of "${trackId}" are not an array`);
      for (const entry of list as Array<Record<string, unknown>>) {
        if (!entry || typeof entry !== "object") throw new Error(`Invalid arrangement package: "${trackId}" carries a note that is not an object`);
        const { pitch, velocity, startBeats, lengthBeats } = entry;
        if (typeof pitch !== "number" || !Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
          throw new Error(`Invalid arrangement package: "${trackId}" has a note with pitch ${String(pitch)} — a MIDI pitch is a whole number from 0 to 127`);
        }
        if (typeof velocity !== "number" || !Number.isFinite(velocity) || velocity < 1 || velocity > 127) {
          throw new Error(`Invalid arrangement package: "${trackId}" has a note with velocity ${String(velocity)} — a velocity is from 1 to 127`);
        }
        if (typeof startBeats !== "number" || !Number.isFinite(startBeats) || startBeats < 0) {
          throw new Error(`Invalid arrangement package: "${trackId}" has a note starting at ${String(startBeats)} beats — a start is zero or later`);
        }
        if (typeof lengthBeats !== "number" || !Number.isFinite(lengthBeats) || lengthBeats <= 0) {
          throw new Error(`Invalid arrangement package: "${trackId}" has a note ${String(lengthBeats)} beats long — a length is greater than zero`);
        }
      }
    }
  }
  const bars = arrangement.bars;
  if (bars !== undefined && (typeof bars !== "number" || !Number.isInteger(bars) || bars < 1 || bars > 4096)) {
    throw new Error(`Invalid arrangement package: bars is ${String(bars)} — a whole number from 1 to 4096`);
  }
  const bpm = arrangement.bpm;
  if (bpm !== undefined && (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm < 20 || bpm > 400)) {
    throw new Error(`Invalid arrangement package: bpm is ${String(bpm)} — a tempo from 20 to 400`);
  }
  return pkg as unknown as ArrangementPackage;
}

/**
 * ⭐ **The reading side of the same door**: a caller with a parsed file gets the arrangement, or the validator's refusal.
 *
 * Nothing here tolerates the older shape, so a v1 package fails at this function rather than somewhere further in, which is
 * where a reader would otherwise discover it carrying fields nothing understands.
 */
export function arrangementFromPackage(data: unknown): ArrangementV2 {
  return validateArrangementPackage(data).arrangement;
}

/**
 * ⭐ **The song half of the same door**: the sections and chain a package carries, or `null` when it carries none.
 *
 * `null` rather than an empty structure, because "this file has one loop" and "this file has a song with nothing in it" are
 * different facts, and only the first is valid.
 */
export function songFromPackage(data: unknown): ArrangementSongStructure | null {
  const song = validateArrangementPackage(data).song;
  return song ?? null;
}
