/**
 * P0.3 — the kick/bass sidechain, scheduled from one place.
 *
 * The ducking stage has existed since the acoustic-enhancement work, but as a private formula
 * duplicated in `AudioEngine.applyKickDuckOnBass` and in `WavExporter`'s kick branch:
 *
 *   const duckDepth = Math.max(0.65, 1 - 0.3 * vel);
 *   ...ramp to duckDepth in 3 ms, back to 1 in 65 ms
 *
 * Two copies of a magic number, and measured through the app's own offline path it dips the bass by
 * **at most 0.25 dB mean (deepest single onset −1.8 dB)** — inaudible, which is why the listening
 * report said there was no sidechain at all. The amount is a per-genre mix decision, so it lives in
 * `genreMix` with the rest of the mix; this module owns the *shape* and the scheduling, so the live
 * engine and the renderer cannot drift apart again.
 *
 * Design: the **depth** is the product promise (a kick that clears the bass — 4 to 6 dB, measured),
 * and the **release** plus the velocity scaling carry the genre character. A genre that wants a soft,
 * slow breath (ambient) keeps a long release at the same depth; a genre that wants punch (gabber,
 * footwork, trap) recovers in tens of milliseconds.
 */
import { getGenreDuck } from "../data/genreMix";

/** Attack time of the duck. Short enough to be a duck, long enough not to click. */
export const DUCK_ATTACK_SEC = 0.003;

/**
 * Depth floor, in linear gain (≈ −30 dB).
 *
 * An `exponentialRampToValueAtTime` target of 0 throws, and a genre table entry of "100 dB" should not
 * silence the bass or take the render down — the clamp is the guard, not the policy.
 */
export const DUCK_MIN_DEPTH_GAIN = 0.03;

/**
 * How much of the genre's depth a barely-there kick gets.
 *
 * A ghosted kick should not duck as hard as the main hit — that relationship is what makes the
 * sidechain sound played rather than switched — but it must still duck, so the scale never reaches 0.
 */
export const DUCK_VELOCITY_FLOOR = 0.6;

/**
 * How `check:groove` measures the dip, in seconds.
 *
 * The gate scans the 60 ms after each scheduled kick in 5 ms windows (1 ms steps) and reports the *deepest*
 * window, because a fixed long window measures a slow release as a deeper duck than a fast one at the same
 * depth, and a window in the first 15 ms lands before the bass note's own energy has developed.
 *
 * Exported because the unit test asserts the audible property on the scheduled curve without rendering: if a
 * genre's shape does not dip by at least 3 dB in its deepest window, the gate cannot see it either.
 */
export const DUCK_DIP_WINDOW_SEC = 0.005;
export const DUCK_DIP_SCAN_SEC = 0.06;

export interface KickDuckShape {
  attackSec: number;
  releaseSec: number;
  /** Linear gain at the bottom of the duck (0 < gain <= 1). */
  depthGain: number;
}

/**
 * The duck shape for one kick hit.
 *
 * `velocity01` is the hit's velocity as 0..1 (the renderer's `normalizedVel`), scaled by
 * `DUCK_VELOCITY_FLOOR`..1. Unknown/custom genre ids get `genreMix`'s neutral default: the sidechain is
 * the kick/bass relationship, not a genre taste, so a custom genre still gets one.
 */
export function resolveKickDuckShape(genreId: string | undefined | null, velocity01: number): KickDuckShape {
  const { duckDb, releaseMs } = getGenreDuck(genreId);
  const velocity = Number.isFinite(velocity01) ? Math.max(0, Math.min(1, velocity01)) : 1;
  const effectiveDb = duckDb * (DUCK_VELOCITY_FLOOR + (1 - DUCK_VELOCITY_FLOOR) * velocity);
  return {
    attackSec: DUCK_ATTACK_SEC,
    releaseSec: releaseMs / 1000,
    depthGain: Math.max(DUCK_MIN_DEPTH_GAIN, 10 ** (-effectiveDb / 20)),
  };
}

/**
 * Schedules one duck on a track's duck gain.
 *
 * `cancelScheduledValues` + `setValueAtTime(1)` before the ramp is what lets a second kick re-trigger
 * the duck cleanly instead of stacking on the previous release.
 */
export function scheduleKickDuck(param: AudioParam, time: number, shape: KickDuckShape): void {
  param.cancelScheduledValues(time);
  param.setValueAtTime(1.0, time);
  param.linearRampToValueAtTime(shape.depthGain, time + shape.attackSec);
  param.exponentialRampToValueAtTime(1.0, time + shape.releaseSec);
}

/** The scheduled gain `seconds` after the onset (attack ramp, then exponential release). */
export function duckGainAt(shape: KickDuckShape, seconds: number): number {
  if (seconds <= 0) return 1;
  if (seconds < shape.attackSec) {
    const progress = seconds / shape.attackSec;
    return 1 + (shape.depthGain - 1) * progress;
  }
  if (seconds >= shape.releaseSec) return 1;
  const span = Math.max(1e-6, shape.releaseSec - shape.attackSec);
  const progress = (seconds - shape.attackSec) / span;
  return shape.depthGain * (1 / shape.depthGain) ** progress;
}

/**
 * The deepest 5 ms window of the scheduled duck, in dB — the same quantity `check:groove` measures on the
 * rendered bass. The gain only rises after the attack, so the deepest window starts where the attack ends.
 */
export function duckDipDb(shape: KickDuckShape, steps = 64): number {
  const from = shape.attackSec;
  const to = shape.attackSec + DUCK_DIP_WINDOW_SEC;
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const t = from + ((to - from) * (i + 0.5)) / steps;
    total += 20 * Math.log10(Math.max(duckGainAt(shape, t), 1e-9));
  }
  return total / steps;
}
