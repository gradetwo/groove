/**
 * Deterministic noise generation, shared by the live engine and the offline renderer.
 *
 * Why this file exists (V-01 in AUDIO_QUALITY_AND_SYNTH_PLAN.md):
 *
 * The drum voices, the synthesiser's noise bed and the reverb impulse were all built
 * from `Math.random()`. That made every render different from the last, which had two
 * concrete costs:
 *
 *   1. **Exporter parity could not hold.** The project guarantees that an exported WAV
 *      matches what the user heard. `PolySynth` already used a seeded LCG for exactly
 *      this reason, but the drum noise and the reverb did not, so exports silently
 *      diverged from playback.
 *   2. **No sample-level regression gate was possible.** `scripts/measure_genre_loudness.mjs`
 *      had to accept a tolerance because repeated renders of the same pattern disagreed.
 *
 * With a seeded generator the same input produces the same buffer, so renders are
 * reproducible and real sample-level gates (true peak, alias floor, envelope
 * continuity) become meaningful.
 *
 * The generator is the same linear congruential recurrence `PolySynth` uses
 * (`seed * 1664525 + 1013904223`), so there is one noise character in the project
 * rather than two.
 */

/** LCG multiplier/increment (Numerical Recipes); taken from the shipped PolySynth bed. */
const LCG_MUL = 1664525;
const LCG_INC = 1013904223;

/**
 * The default seed. A fixed constant (not a clock) is what makes renders reproducible;
 * it is deliberately *not* 0, and it is deliberately shared with the synth's bed so
 * drums and melodic noise do not correlate.
 */
export const DEFAULT_NOISE_SEED = 0x2f6e2b1;

/** A small, deterministic 32-bit hash (FNV-1a). Used to turn a musical position into a read offset. */
export function hashSeed(value: number): number {
  let h = 0x811c9dc5;
  // Mix the four bytes explicitly: `value` is a step index / ratchet index, so it is a
  // small integer and a byte-wise mix decorrelates neighbouring steps.
  for (let shift = 0; shift < 32; shift += 8) {
    h ^= (value >>> shift) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Fills `data` with white noise in [-1, 1) from a seeded LCG.
 *
 * Returns the next seed so a caller can continue the stream across buffers.
 */
export function fillWhiteNoise(
  data: Float32Array,
  seed: number = DEFAULT_NOISE_SEED
): number {
  let state = seed >>> 0;
  for (let i = 0; i < data.length; i++) {
    state = (state * LCG_MUL + LCG_INC) >>> 0;
    data[i] = (state / 0xffffffff) * 2 - 1;
  }
  return state;
}

/**
 * Creates a deterministic mono white-noise buffer.
 *
 * `seconds` defaults to 2 s, which is the length the drum voices historically relied on
 * (they start reading at offset 0 and play for a few tens of milliseconds).
 */
export function createSeededNoiseBuffer(
  ctx: BaseAudioContext,
  seconds = 2,
  seed: number = DEFAULT_NOISE_SEED
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  fillWhiteNoise(buffer.getChannelData(0), seed);
  return buffer;
}

/**
 * Chooses where in the noise buffer a hit should start reading.
 *
 * Without this every hit read from sample 0, so a 16th-note hi-hat pattern was the
 * same 60 ms of samples repeated byte-for-byte — the "machine-gun" comb character that
 * makes programmed hats sound static.
 *
 * `position` must be a value that the live engine and the offline renderer both
 * compute identically (e.g. step index + ratchet index), otherwise parity is lost.
 * The result is always a valid `BufferSourceNode.start(when, offset)` argument: it
 * leaves at least `neededSamples` of buffer after the offset, and wraps within the
 * region the caller allows.
 */
export function noiseOffsetForHit(
  position: number,
  bufferLength: number,
  neededSamples: number
): number {
  if (bufferLength <= 0) return 0;
  // Keep at least one sample of headroom after the offset so `start` never reads past
  // the end (Safari rejects an offset at/after the buffer end).
  const usable = Math.max(1, bufferLength - Math.max(0, Math.floor(neededSamples)));
  return hashSeed(position) % usable;
}

/**
 * Q6: distinct layers of one composite voice (the three clap bursts and its body) must read
 * **different** slices of the noise buffer.
 *
 * Adding a small constant to `position` is not enough: `noiseOffsetForHit` returns
 * `hashSeed(position) % usable`, and two nearby positions can hash into the same bucket — the
 * measured case was a 2 s buffer where `base + 4096` and `base + 8192` landed on the *same*
 * sample, so that burst and the body summed coherently (up to +6 dB inside the overlap) and the
 * clap came out comb-filtered. Layers are therefore spaced by a fraction of the usable range,
 * which cannot collide regardless of buffer length.
 */
export function noiseOffsetForLayer(
  position: number,
  layerIndex: number,
  bufferLength: number,
  neededSamples: number,
  layerCount = 4
): number {
  if (bufferLength <= 0) return 0;
  const usable = Math.max(1, bufferLength - Math.max(0, Math.floor(neededSamples)));
  const mixed = hashSeed(position + layerIndex * 0x9e3779b1);
  const stride = Math.max(1, Math.floor(usable / Math.max(1, layerCount)));
  return (mixed % stride) + Math.min(usable - 1, layerIndex * stride);
}

/**
 * The canonical "which hit is this" key, shared by the live engine and the offline
 * renderer.
 *
 * It lives here rather than in either caller because exporter parity depends on both
 * sides deriving the *same* value — two copies of this formula is exactly how the two
 * would drift apart. It is built only from musical indices (track, step, ratchet) and
 * never from a clock, so a rendered file always matches the audition it came from.
 */
export function noisePositionFor(trackIdx: number, stepIdx: number, ratchetIndex = 0): number {
  return trackIdx * 65536 + stepIdx * 64 + ratchetIndex;
}
