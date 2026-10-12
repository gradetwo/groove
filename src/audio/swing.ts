/**
 * P0.5 — where swing actually moves a step.
 *
 * Swing used to be `step % 2 === 1`, i.e. it delayed the **odd 16ths** ("e" and "a") and nothing else. A
 * pattern built from 8th notes has every note on an even step, so it received no swing at all — which is why
 * boom-bap, the genre in the sample whose declared swing is highest (60), measured as perfectly straight: the
 * analyser looked for movement on the off-16ths and the kick plays 8ths.
 *
 * The rule here is the one the grid actually implies:
 *
 *   beat:     1        e        &        a
 *   step%4:   0        1        2        3
 *   scale:    0        0.5      1.0      0.5
 *
 * The **off-8th** ("&") moves the full amount, which is what makes a 8th-note pattern swing; the off-16ths move
 * half, which is what a 16th-note pattern needs to stay a swung 16th grid rather than a lurching one. Downbeats
 * and on-beat 8ths never move.
 *
 * Both engines call this (the live scheduler and the offline renderer), so an export cannot swing differently
 * from the audition — the drift the exporter-parity work exists to prevent.
 */

/** How far each position inside a beat is pushed, as a fraction of the swing amount. */
export const SWING_SCALE_OFF_8TH = 1;
export const SWING_SCALE_OFF_16TH = 0.5;

/** Swing is clamped to this, in fractions of a step pair; the sequencer's own ceiling. */
export const SWING_MAX = 0.75;

/** The scale for one step, from its position inside the beat. */
export function swingPositionScale(step: number): number {
  const inBeat = ((Math.floor(step) % 4) + 4) % 4;
  if (inBeat === 2) return SWING_SCALE_OFF_8TH;
  if (inBeat === 1 || inBeat === 3) return SWING_SCALE_OFF_16TH;
  return 0;
}

/**
 * Seconds to push a step later, given the effective swing (0..1) and the step's length.
 *
 * A swing of 0.75 moves the off-8th by 37.5% of a step, which is the triplet boundary — as far as the grid can
 * go before the note would meet the next downbeat.
 */
export function swingOffsetSeconds(step: number, swing: number, stepDur: number): number {
  const amount = Number.isFinite(swing) ? Math.max(0, Math.min(SWING_MAX, swing)) : 0;
  if (amount <= 0 || !Number.isFinite(stepDur) || stepDur <= 0) return 0;
  return swingPositionScale(step) * amount * 0.5 * stepDur;
}

/** True when a step is moved at all by swing — the live engine's cheaper per-track test. */
export function swingMovesStep(step: number): boolean {
  return swingPositionScale(step) > 0;
}
