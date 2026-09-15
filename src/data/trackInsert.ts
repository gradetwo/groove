/**
 * Per-track insert chain parameters (E-10) and the per-role channel-strip defaults.
 *
 * ## Why this file exists
 *
 * `genreMix.ts` gives every track a fader, a pan and two sends — and that was the whole
 * channel strip. Nothing shapes a sound *between* the voice and the fader: a 909 kick and
 * a jazz ride reach the master with their full-bandwidth spectrum and full dynamic range,
 * and the only corrective stage in the entire application is one compressor on the sum.
 *
 * Logic Pro's answer — and the reason a factory patch sounds finished the moment you load
 * it — is that each channel strip already carries a high-pass, EQ, dynamics and drive,
 * chosen for the instrument on it. This module is that idea, expressed as data:
 *
 *   1. `ROLE_INSERT_DEFAULTS` — one authored chain per sequencer role (8 roles).
 *   2. `resolveTrackInsert(role)` — what callers use; total, never returns null.
 *   3. `EQ_BAND_*` / bounds — the ranges the UI and DSP both clamp to.
 *
 * A **per-genre** layer is deliberately not here yet: the role is what a channel strip is
 * designed around, and adding 159 more entries before the role defaults have been heard
 * would be guesswork on top of guesswork.
 *
 * ## The shape of a default
 *
 * Every role's chain follows the same discipline, which is worth stating once:
 * **high-pass first** (remove what the instrument does not use, so the mix is not fighting
 * for low-end headroom), then **carve the midrange** where another role needs room, then
 * **compress** to control the dynamics the performance actually has, and only then
 * consider drive. Gain changes are kept conservative on purpose: the library has a measured
 * loudness baseline across 159 genres, and a channel strip that adds 3 dB to every track is
 * a library-wide level change disguised as a feature.
 */
import type { MixTrackId } from "./genreMix";

export interface TrackEqBand {
  enabled: boolean;
  /** Centre/corner frequency, Hz. */
  hz: number;
  /** Gain in dB. Negative values cut — the shape most mixing actually uses. */
  gainDb: number;
  /** Q, peaking band only. */
  q: number;
}

export interface TrackInsertParams {
  /** High-pass. The single most valuable per-track stage: it is almost free headroom. */
  hpfEnabled: boolean;
  hpfHz: number;

  /** Low shelf. */
  low: TrackEqBand;
  /** Peaking band — the carve/presence control. */
  mid: TrackEqBand;
  /** High shelf. */
  high: TrackEqBand;

  compEnabled: boolean;
  compThresholdDb: number;
  /** Compression ratio, e.g. 4 = 4:1. */
  compRatio: number;
  compAttackSec: number;
  compReleaseSec: number;
  /** Makeup gain in dB, applied by the strip (not by the compressor node). */
  compMakeupDb: number;

  driveEnabled: boolean;
  /** Waveshaper drive, same scale as the master rack's `saturationDrive` (1 = clean). */
  driveAmount: number;
  /** Wet/dry for the drive stage, 0..1. Full wet on a per-track insert is rarely wanted. */
  driveMix: number;
}

/** Documented bounds. The UI and the DSP both clamp to these; tests assert they hold. */
/**
 * A partial `TrackInsertParams` used by the per-genre layer (`genreInsert.ts`).
 *
 * Both levels are optional: a genre says only what it changes, so the role default's
 * reasoning keeps working underneath and a new field added to `TrackInsertParams` does not
 * have to be back-filled into 159 entries.
 */
export interface TrackEqBandPatch {
  enabled?: boolean;
  hz?: number;
  gainDb?: number;
  q?: number;
}

export interface TrackInsertPatch {
  hpfEnabled?: boolean;
  hpfHz?: number;
  low?: TrackEqBandPatch;
  mid?: TrackEqBandPatch;
  high?: TrackEqBandPatch;
  compEnabled?: boolean;
  compThresholdDb?: number;
  compRatio?: number;
  compAttackSec?: number;
  compReleaseSec?: number;
  compMakeupDb?: number;
  driveEnabled?: boolean;
  driveAmount?: number;
  driveMix?: number;
}

export const INSERT_HPF_MIN_HZ = 20;
export const INSERT_HPF_MAX_HZ = 1000;
export const INSERT_EQ_MIN_HZ = 20;
export const INSERT_EQ_MAX_HZ = 18000;
export const INSERT_EQ_MIN_GAIN_DB = -18;
export const INSERT_EQ_MAX_GAIN_DB = 18;
export const INSERT_EQ_MIN_Q = 0.2;
export const INSERT_EQ_MAX_Q = 12;
export const INSERT_COMP_MIN_THRESHOLD_DB = -60;
export const INSERT_COMP_MAX_THRESHOLD_DB = 0;
export const INSERT_COMP_MIN_RATIO = 1;
export const INSERT_COMP_MAX_RATIO = 20;
export const INSERT_COMP_MIN_ATTACK_SEC = 0.0005;
export const INSERT_COMP_MAX_ATTACK_SEC = 0.2;
export const INSERT_COMP_MIN_RELEASE_SEC = 0.02;
export const INSERT_COMP_MAX_RELEASE_SEC = 1.5;
export const INSERT_COMP_MIN_MAKEUP_DB = 0;
export const INSERT_COMP_MAX_MAKEUP_DB = 12;
export const INSERT_DRIVE_MIN = 1;
export const INSERT_DRIVE_MAX = 8;
export const INSERT_DRIVE_MIX_MAX = 1;

const band = (
  enabled: boolean,
  hz: number,
  gainDb: number,
  q = 0.9
): TrackEqBand => ({ enabled, hz, gainDb, q });

/**
 * One channel strip per sequencer role.
 *
 * The reasoning is compressed into each entry's comment — it is the same reasoning a
 * mixing engineer would give, and it is the part that makes these *defaults* rather than
 * arbitrary numbers.
 */
export const ROLE_INSERT_DEFAULTS: Record<MixTrackId, TrackInsertParams> = {
  kick: {
    // A kick owns the bottom. High-pass well below its fundamental so the sub survives,
    // dip the low-mid where the bass lives, and compress firmly — a kick is the one voice
    // whose dynamics the listener reads as "power", so it wants consistency.
    hpfEnabled: true,
    hpfHz: 28,
    low: band(true, 60, 2.0, 0.8),
    mid: band(true, 420, -3.0, 1.0),
    high: band(false, 8000, 0, 0.9),
    compEnabled: true,
    compThresholdDb: -12,
    compRatio: 4,
    compAttackSec: 0.012,
    compReleaseSec: 0.12,
    compMakeupDb: 3,
    driveEnabled: false,
    driveAmount: 1.6,
    driveMix: 0.5,
  },
  snare: {
    // Remove everything under the shell, add body around 200 Hz, and lift the wires.
    hpfEnabled: true,
    hpfHz: 150,
    low: band(false, 120, 0, 0.8),
    mid: band(true, 220, 1.5, 0.9),
    high: band(true, 6500, 3.0, 0.8),
    compEnabled: true,
    compThresholdDb: -14,
    compRatio: 4,
    compAttackSec: 0.005,
    compReleaseSec: 0.1,
    compMakeupDb: 3,
    driveEnabled: false,
    driveAmount: 1.5,
    driveMix: 0.4,
  },
  hihat: {
    // Hats are the highest-density voice in the sequencer: high-pass hard, control the
    // harsh 3 kHz region, and compress gently — they need to sit, not to punch.
    hpfEnabled: true,
    hpfHz: 400,
    low: band(false, 200, 0, 0.8),
    mid: band(true, 3200, -2.0, 1.2),
    high: band(true, 9000, 2.0, 0.8),
    compEnabled: true,
    compThresholdDb: -20,
    compRatio: 2,
    compAttackSec: 0.003,
    compReleaseSec: 0.08,
    compMakeupDb: 1,
    driveEnabled: false,
    driveAmount: 1.4,
    driveMix: 0.4,
  },
  percussion: {
    // Percussion is the lead voice in several categories; give it presence and control
    // its peaks so it can be pushed without dominating.
    hpfEnabled: true,
    hpfHz: 200,
    low: band(false, 250, 0, 0.8),
    mid: band(true, 1200, 2.0, 1.1),
    high: band(true, 7000, 2.0, 0.8),
    compEnabled: true,
    compThresholdDb: -16,
    compRatio: 3,
    compAttackSec: 0.004,
    compReleaseSec: 0.09,
    compMakeupDb: 2.5,
    driveEnabled: false,
    driveAmount: 1.5,
    driveMix: 0.4,
  },
  bass: {
    // The kick/bass relationship is the whole low end: high-pass just under the fundamental,
    // lift the sub, and cut 500 Hz so the two do not fight for the same octave.
    hpfEnabled: true,
    hpfHz: 35,
    low: band(true, 80, 2.0, 0.8),
    mid: band(true, 500, -2.0, 1.0),
    high: band(false, 6000, 0, 0.9),
    compEnabled: true,
    compThresholdDb: -14,
    compRatio: 3,
    compAttackSec: 0.015,
    compReleaseSec: 0.15,
    compMakeupDb: 3,
    driveEnabled: false,
    driveAmount: 1.8,
    driveMix: 0.5,
  },
  chords: {
    // A pad/comp occupies the middle. It should sound full but yield the presence range to
    // the lead, so the mid is cut rather than boosted.
    hpfEnabled: true,
    hpfHz: 180,
    low: band(true, 220, 1.0, 0.8),
    mid: band(true, 900, -2.0, 0.9),
    high: band(true, 8000, 1.0, 0.8),
    compEnabled: true,
    compThresholdDb: -18,
    compRatio: 2,
    compAttackSec: 0.02,
    compReleaseSec: 0.2,
    compMakeupDb: 2,
    driveEnabled: false,
    driveAmount: 1.4,
    driveMix: 0.4,
  },
  lead: {
    // The topline: a presence lift so it cuts through without simply being louder, and
    // firmer compression so every note speaks.
    hpfEnabled: true,
    hpfHz: 200,
    low: band(false, 300, 0, 0.8),
    mid: band(true, 2500, 2.5, 1.0),
    high: band(true, 9000, 1.5, 0.8),
    compEnabled: true,
    compThresholdDb: -16,
    compRatio: 3,
    compAttackSec: 0.01,
    compReleaseSec: 0.12,
    compMakeupDb: 2.5,
    driveEnabled: false,
    driveAmount: 1.6,
    driveMix: 0.45,
  },
  fx: {
    // Risers and sweeps are arrangement devices; they only need the sub-rumble removed and
    // a light grip so they do not jump out of the mix.
    hpfEnabled: true,
    hpfHz: 120,
    low: band(false, 200, 0, 0.8),
    mid: band(false, 1500, 0, 1.0),
    high: band(false, 9000, 0, 0.8),
    compEnabled: true,
    compThresholdDb: -20,
    compRatio: 2,
    compAttackSec: 0.02,
    compReleaseSec: 0.25,
    compMakeupDb: 1,
    driveEnabled: false,
    driveAmount: 1.4,
    driveMix: 0.4,
  },
};

/** A chain with every stage bypassed — the "user removed the strip" state. */
export function bypassTrackInsert(): TrackInsertParams {
  const role = ROLE_INSERT_DEFAULTS.kick;
  return {
    ...role,
    hpfEnabled: false,
    low: { ...role.low, enabled: false },
    mid: { ...role.mid, enabled: false },
    high: { ...role.high, enabled: false },
    compEnabled: false,
    compMakeupDb: 0,
    driveEnabled: false,
    driveMix: 0,
  };
}

/** Fresh, mutable copy of a role's default chain. */
export function resolveTrackInsert(role: MixTrackId | string | null | undefined): TrackInsertParams {
  const key = (typeof role === "string" ? role : "") as MixTrackId;
  const found = ROLE_INSERT_DEFAULTS[key];
  const base = found ?? ROLE_INSERT_DEFAULTS.chords;
  return {
    ...base,
    low: { ...base.low },
    mid: { ...base.mid },
    high: { ...base.high },
  };
}

/** True when the chain would not change the signal at all — used by gates and the UI. */
export function isTrackInsertBypassed(params: TrackInsertParams): boolean {
  return (
    !params.hpfEnabled &&
    !params.low.enabled &&
    !params.mid.enabled &&
    !params.high.enabled &&
    !params.compEnabled &&
    !params.driveEnabled
  );
}

/** The eight roles this table covers, for gates and the inspector's role list. */
export const INSERT_ROLES: readonly MixTrackId[] = [
  "kick",
  "snare",
  "hihat",
  "percussion",
  "bass",
  "chords",
  "lead",
  "fx",
] as const;
