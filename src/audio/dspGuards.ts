/**
 * DSP parameter guards (F-01).
 *
 * Why this exists:
 * `AudioParam.exponentialRampToValueAtTime` throws a `RangeError` when its target
 * value is not strictly positive, and the Web Audio spec leaves ramps from a zero
 * previous value undefined. The sequencer feeds user-controlled numbers straight
 * into those ramps:
 *   - track volume faders go down to 0,
 *   - velocity arrays can contain 0,
 *   - filter cutoff / sustain / mix parameters are user- or import-controlled.
 *
 * A single zero therefore used to throw inside `scheduleStep`, which (because the
 * scheduler only advanced its grid *after* scheduling) re-threw on every tick and
 * silently killed playback until reload.
 *
 * These helpers keep every ramp target in a safe, still-inaudible range instead of
 * changing the intended musical behaviour (-80 dBFS is silence for practical purposes).
 */

/** -80 dBFS: effectively silent, but strictly positive for exponential ramps. */
export const MIN_GAIN = 1e-4;

/** Lowest frequency we will hand to a BiquadFilter (Hz). */
export const MIN_FREQ = 10;

/** Highest frequency we will hand to a BiquadFilter (Hz) — above Nyquist safety. */
export const MAX_FREQ = 20000;

/** Coerces a gain/envelope value to a finite, strictly positive number. */
export function safeGain(value: number, fallback: number = MIN_GAIN): number {
  if (!Number.isFinite(value)) return fallback;
  return value < MIN_GAIN ? fallback : value;
}

/** Clamps a filter/oscillator frequency into a finite, audible-but-valid range. */
export function safeFreq(value: number, fallback = MIN_FREQ): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < MIN_FREQ) return fallback;
  return value > MAX_FREQ ? MAX_FREQ : value;
}

/**
 * Normalises a normalised velocity (0..1-ish) coming from the UI.
 * Never returns 0 so downstream `exponentialRampToValueAtTime` calls stay legal.
 */
export function safeVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return MIN_GAIN;
  return velocity < MIN_GAIN ? MIN_GAIN : velocity;
}

/**
 * Returns a finite, non-negative AudioContext time. Non-finite values would make
 * every `start()`/`stop()` call throw.
 */
export function safeTime(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
