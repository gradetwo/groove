import { APP_VERSION } from "../../version";
import type { ArrangementV2 } from "../../types/arrangementV2";

/**
 * ⭐ **The v2 package: an arrangement, and nothing of the older model.**
 *
 * The owner's decision is that the package carries tracks, notes, takes, bars and a tempo map, and carries no clips, slots
 * or sections. The validator below enforces exactly that, which is what makes this a v2 shape rather than the older one
 * with a new name: a package that carries the old keys is refused, not accepted, so the two cannot coexist.
 */
export const ARRANGEMENT_PACKAGE_FORMAT = "groove-arrangement";

export interface ArrangementPackage {
  format: typeof ARRANGEMENT_PACKAGE_FORMAT;
  appVersion: string;
  /** ⭐ Who wrote it and when, so a file found later still explains itself. */
  writtenAt: string;
  arrangement: ArrangementV2;
}

/** ⭐ The v1 keys whose presence means the package is not a v2 one. */
const OLD_SHAPE_KEYS = ["clips", "slots", "sections", "project"] as const;

export function buildArrangementPackage(
  arrangement: ArrangementV2,
  appVersion: string = APP_VERSION,
  writtenAt: string = new Date().toISOString()
): ArrangementPackage {
  return { format: ARRANGEMENT_PACKAGE_FORMAT, appVersion, writtenAt, arrangement };
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
