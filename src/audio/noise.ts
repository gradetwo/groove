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

/**
 * Per-hit humanisation: the small amount by which one hit differs from the next.
 *
 * Every drum voice varies with *velocity* — that is what makes a pattern played rather than
 * typed — but a pattern that repeats a hit at the same velocity produced hits that were
 * **identical to the last decimal**: same pitch, same decay, same level, with only the noise
 * read offset changing. On a real kit no two strokes land the same way, and the sameness is
 * audible as a kind of stiffness that no amount of velocity programming removes.
 *
 * The ranges are deliberately narrow. This is not an effect; it is the difference between a
 * machine and a player, and anything wider starts to sound like a drunk drummer. The numbers:
 *
 *   - **pitch**: ±6 cents. A stroke's tension varies by roughly this much; a semitone would be
 *     a wrong note.
 *   - **level**: ±0.6 dB. Below the threshold of "a different hit", above "identical".
 *   - **decay**: ±4 %. Drum decay is dominated by the head and the room, which barely change
 *     stroke to stroke; this is the shimmer, not a different drum.
 *
 * **Determinism is not negotiable.** Derived from the same musical position key the noise offsets
 * use, so the live engine and the offline renderer produce the same variation and export parity
 * holds. `Math.random` here would break the project's central export guarantee.
 */
export interface HitVariation {
  /** Frequency multiplier, 1 ± a few cents. */
  pitchRatio: number;
  /** Linear level multiplier, 1 ± a fraction of a dB. */
  levelScale: number;
  /** Decay multiplier, 1 ± a few percent. */
  decayScale: number;
}

/** Widest pitch deviation, in cents. */
export const HIT_VARIATION_MAX_CENTS = 6;
/** Widest level deviation, as a linear multiplier (≈ ±0.6 dB). */
export const HIT_VARIATION_MAX_LEVEL = 0.934; // 10 ** (-0.6 / 20) ≈ 0.9333
/** Widest decay deviation, as a fraction. */
export const HIT_VARIATION_MAX_DECAY = 0.04;

/**
 * The variation for one hit, derived from its musical position.
 *
 * Each parameter takes its own hash of the position so the three do not move together — a hit
 * that is both higher *and* shorter *and* louder reads as a different drum rather than as one
 * stroke played differently, which is the opposite of what this is for.
 */
export function hitVariation(position: number | undefined): HitVariation {
  /**
   * Position 0 is the unvaried voice, and that is a deliberate boundary rather than a fallback.
   *
   * Every voice function in `DrumKitModels` defaults its `noisePosition` to 0, so this one value
   * has to mean "no position supplied" — otherwise the default silently applies one arbitrary,
   * unexplained detune to every caller that never asked for humanisation, and the pre-change
   * exact-parameter baselines stop being reproducible.
   *
   * The cost is one unvaried hit per pattern: `noisePositionFor(0, 0, 0)` is also 0, so the first
   * step of the first track keeps its old stiffness. That is the cheapest place to lose it — it is
   * a single stroke rather than a groove — and the alternative (making the position argument
   * mandatory) would break the export-parity key, which is not a trade worth making for one hit.
   */
  if (!position) {
    return { pitchRatio: 1, levelScale: 1, decayScale: 1 };
  }

  /** A signed value in [-1, 1) from an independently mixed hash. */
  const signed = (salt: number): number => {
    const h = hashSeed((position ^ salt) >>> 0);
    return (h / 0xffffffff) * 2 - 1;
  };

  const cents = signed(0x9e3779b1) * HIT_VARIATION_MAX_CENTS;
  const level = signed(0x85ebca6b) * 0.033; // ±3.3 % ≈ ±0.28 dB, inside the ±0.6 dB bound
  const decay = signed(0xc2b2ae35) * HIT_VARIATION_MAX_DECAY;

  return {
    pitchRatio: Math.pow(2, cents / 1200),
    levelScale: Math.max(HIT_VARIATION_MAX_LEVEL, 1 + level),
    decayScale: 1 + decay,
  };
}
