/**
 * The note gain envelope, scheduled so that its stages can never overlap.
 *
 * ## The bug this exists for
 *
 * Every melodic voice in `ChordAudioEngine` wrote its envelope as three chained ramps with a **fixed** initial
 * decay and a **variable** note length:
 *
 *     gain.setValueAtTime(0.0001, now);
 *     gain.linearRampToValueAtTime(peak, now + 0.006);        // 6 ms attack
 *     gain.exponentialRampToValueAtTime(peak * 0.58, now + 0.22);   // fixed initial drop
 *     gain.exponentialRampToValueAtTime(0.0001, now + noteDuration); // noteDuration can be SHORTER
 *
 * `noteDuration` is `min(gate, naturalDecay)`, so any note shorter than the fixed drop (a 1/16 stab at 120 BPM
 * is 0.125 s, a reggaeton chord is shorter still) scheduled its final ramp to end *before the previous ramp
 * ended*. Web Audio processes those events in time order, so the second ramp is cut off at its start and the
 * gain jumps from wherever it had reached straight to 0.0001 — a step discontinuity, i.e. **a click on every
 * short note**. Measured on the real renderer: chicago-blues' chord stem had 16,277 samples standing far above
 * their local slew, and reggaeton's lead stem 5,956.
 *
 * ## What this does instead
 *
 * The release stage is carved *out of* the gate rather than pinned to a fixed point: a 4 ms de-click minimum,
 * up to 50 ms when the note is long enough, and the initial drop takes whatever is left. The stages are then
 * ordered by construction for every gate length, the articulation still ends when the gate says it should, and
 * the waveform reaches silence through a real ramp instead of a step.
 */

export interface NoteEnvelopeOptions {
  /** The linear attack; 6 ms is the "felt strike" the piano voice was tuned around. */
  attackSec?: number;
  /** Longest initial drop (the natural decay of a struck string). */
  dropMaxSec?: number;
  /** Shortest release. Below a few milliseconds a ramp is inaudible as anything but a click. */
  releaseMinSec?: number;
  /** How far the initial drop falls, as a fraction of the peak (voice-specific timbre). */
  dropRatio?: number;
}

export interface NoteEnvelopeTimes {
  /** End of the attack ramp. */
  attackAt: number;
  /** End of the initial drop. */
  dropAt: number;
  /** End of the release ramp; the note is at silence here. */
  releaseAt: number;
  /** When the oscillator should be stopped — after the release, never at it. */
  stopAt: number;
}

/** The smallest release that is a ramp rather than a step. */
export const MIN_DECLICK_SEC = 0.004;

/**
 * Compute the four times for a note of `gateSec`, guaranteeing `attackAt < dropAt < releaseAt < stopAt`.
 *
 * The shape is the one the voices were tuned around — a fast attack, an initial drop where a struck string
 * loses its brightness, then a long decay to silence that ends at the gate — with the one thing the original
 * got wrong fixed: the boundary between the drop and the final decay is *derived from the gate* instead of
 * being a fixed 0.22 s. A long note behaves exactly as before; a short one gets a 4 ms ramp where it used to
 * get a step.
 */
export function noteEnvelopeTimes(now: number, gateSec: number, options: NoteEnvelopeOptions = {}): NoteEnvelopeTimes {
  const attackSec = options.attackSec ?? 0.006;
  const dropMaxSec = options.dropMaxSec ?? 0.22;
  const releaseMinSec = options.releaseMinSec ?? MIN_DECLICK_SEC;
  const gate = Math.max(0, gateSec);

  // The attack comes out of the gate first, so a very short note does not push everything past its own end.
  const attack = Math.min(attackSec, Math.max(MIN_DECLICK_SEC, gate * 0.25));
  const attackAt = now + attack;
  /**
   * Where the initial drop gives way to the final decay.
   *
   * For a note longer than the natural drop this is the natural drop itself (the long decay then runs to the
   * gate, exactly as before). For a shorter note it is pulled back to leave a real de-click ramp at the end —
   * and if even that is impossible, the note is allowed to run a few milliseconds long rather than click.
   */
  const dropSpan = Math.max(MIN_DECLICK_SEC, Math.min(dropMaxSec, gate - attack - releaseMinSec));
  const dropAt = attackAt + dropSpan;
  const releaseAt = Math.max(dropAt + releaseMinSec, now + gate);
  return { attackAt, dropAt, releaseAt, stopAt: releaseAt + 0.02 };
}

/** The subset of `AudioParam` this needs, so the fake in tests and the real node both fit. */
export interface GainParamLike {
  setValueAtTime: (value: number, time: number) => unknown;
  linearRampToValueAtTime: (value: number, time: number) => unknown;
  exponentialRampToValueAtTime: (value: number, time: number) => unknown;
}

/**
 * Apply the envelope to a gain node's `AudioParam`.
 *
 * `exponentialRampToValueAtTime` cannot reach zero (the browser rejects a target ≤ 0), so the floor is
 * `0.0001` — -80 dBFS, inaudible, and the reason the oscillator may be stopped 20 ms after it.
 */
export function scheduleNoteEnvelope(
  param: GainParamLike,
  args: { now: number; peak: number; gateSec: number; options?: NoteEnvelopeOptions }
): NoteEnvelopeTimes {
  const { now, peak, gateSec } = args;
  const options = args.options ?? {};
  const times = noteEnvelopeTimes(now, gateSec, options);
  const dropRatio = options.dropRatio ?? 0.58;
  const floor = 0.0001;
  param.setValueAtTime(floor, now);
  param.linearRampToValueAtTime(Math.max(peak, floor), times.attackAt);
  param.exponentialRampToValueAtTime(Math.max(peak * dropRatio, floor), times.dropAt);
  param.exponentialRampToValueAtTime(floor, times.releaseAt);
  return times;
}
