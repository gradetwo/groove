/**
 * ITU-R BS.1770-4 loudness metering (test/measurement helper only).
 *
 * This module is deliberately NOT imported by any production code path — it exists so
 * `scripts/measure_genre_loudness.mjs` and the unit suite share one implementation of
 * the metric, instead of the script carrying an untestable inline copy.
 *
 * Implemented:
 *  - K-weighting: the standard two-stage pre-filter (high-shelf + RLB high-pass)
 *    designed with the BS.1770 analogue prototype and bilinear transform, so it is
 *    correct at 44.1 kHz (what the offline renderer uses) and at 48 kHz (where the
 *    published coefficient tables live, used as the unit-test anchor).
 *  - Gated integrated loudness: 400 ms blocks with 75 % overlap (100 ms hop),
 *    absolute gate at −70 LUFS, then a relative gate 10 LU below the ungated mean of
 *    the surviving blocks.
 *  - Channel weighting 1.0 for L and R, matching BS.1770's table for stereo.
 *
 * NOT implemented (documented, not silently approximated):
 *  - true-peak (oversampled) metering; `samplePeakDb` is the raw sample peak.
 *  - channel weights for surround layouts.
 */

/** Feed-forward biquad coefficients (a0 normalised to 1). */
export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export interface KWeightingCoefficients {
  /** Stage 1: high-shelf (+4 dB above ~1.7 kHz), the "head" filter. */
  shelf: BiquadCoefficients;
  /** Stage 2: RLB high-pass at ~38 Hz. */
  highpass: BiquadCoefficients;
}

export interface LoudnessResult {
  /** Gated integrated loudness, LUFS. −Infinity for digital silence. */
  integratedLufs: number;
  /** Raw sample peak across channels, dBFS (0 dBFS = full scale). */
  samplePeakDb: number;
  /** Ungated block loudness before the relative gate, LUFS (debugging aid). */
  ungatedLufs: number;
  /** Number of 400 ms blocks used after both gates. */
  gatedBlockCount: number;
}

const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;
/** BS.1770 offset term: L = −0.691 + 10·log10(Σ G_i · z_i). */
const LOUDNESS_OFFSET = -0.691;
const BLOCK_SECONDS = 0.4;
const BLOCK_OVERLAP = 0.75;

/**
 * BS.1770 K-weighting coefficients for an arbitrary sample rate.
 * Derived from the same analogue prototype pyloudnorm/libebur128 use; at 48 kHz this
 * reproduces the published tables to ~1e-15 (asserted in `loudness.test.ts`).
 */
export function kWeightingCoefficients(sampleRate: number): KWeightingCoefficients {
  // Stage 1 — high shelf: G = +3.999843853973347 dB, fc = 1681.974450955533 Hz.
  const shelfG = 3.999843853973347;
  const shelfFc = 1681.974450955533;
  const shelfQ = 0.7071752369554196;
  const K1 = Math.tan((Math.PI * shelfFc) / sampleRate);
  const Vh = Math.pow(10, shelfG / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  const shelfA0 = 1 + K1 / shelfQ + K1 * K1;
  const shelf: BiquadCoefficients = {
    b0: (Vh + (Vb * K1) / shelfQ + K1 * K1) / shelfA0,
    b1: (2 * (K1 * K1 - Vh)) / shelfA0,
    b2: (Vh - (Vb * K1) / shelfQ + K1 * K1) / shelfA0,
    a1: (2 * (K1 * K1 - 1)) / shelfA0,
    a2: (1 - K1 / shelfQ + K1 * K1) / shelfA0,
  };

  // Stage 2 — RLB high-pass: fc = 38.13547087602444 Hz, Q = 0.5003270373238773.
  const hpFc = 38.13547087602444;
  const hpQ = 0.5003270373238773;
  const K2 = Math.tan((Math.PI * hpFc) / sampleRate);
  const hpA0 = 1 + K2 / hpQ + K2 * K2;
  const highpass: BiquadCoefficients = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K2 * K2 - 1)) / hpA0,
    a2: (1 - K2 / hpQ + K2 * K2) / hpA0,
  };

  return { shelf, highpass };
}

/** Applies one biquad in place over a channel buffer (transposed direct form II). */function applyBiquad(samples: Float32Array, c: BiquadCoefficients): Float32Array {
  const out = new Float32Array(samples.length);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = c.b0 * x + z1;
    z1 = c.b1 * x - c.a1 * y + z2;
    z2 = c.b2 * x - c.a2 * y;
    out[i] = y;
  }
  return out;
}

/** K-weights one channel (both stages, in order). */
export function kWeightChannel(samples: Float32Array, sampleRate: number): Float32Array {
  const { shelf, highpass } = kWeightingCoefficients(sampleRate);
  return applyBiquad(applyBiquad(samples, shelf), highpass);
}

function loudnessOfBlock(meanSquareSum: number, blockSamples: number, channels: number): number {
  const meanSquare = meanSquareSum / (blockSamples * channels);
  if (meanSquare <= 0) return -Infinity;
  // BS.1770: L = −0.691 + 10·log10(Σ G_i · z_i). The −0.691 offset is applied once,
  // when a loudness value is *reported*; block values are kept offset-free so the
  // gating arithmetic (which compares and averages in the power domain) stays correct.
  return 10 * Math.log10(meanSquare);
}

/** −0.691 + 10·log10(mean power) over a set of offset-free block values. */
function meanLoudness(blocks: number[]): number {
  const meanPower = blocks.reduce((acc, l) => acc + Math.pow(10, l / 10), 0) / blocks.length;
  return LOUDNESS_OFFSET + 10 * Math.log10(meanPower);
}

/**
 * Gated integrated loudness of a stereo (or mono) render, per BS.1770-4.
 * `channels` are raw (un-weighted) sample arrays; K-weighting is applied here.
 */
export function measureLoudness(channels: Float32Array[], sampleRate: number): LoudnessResult {
  if (channels.length === 0 || channels[0].length === 0) {
    return { integratedLufs: -Infinity, samplePeakDb: -Infinity, ungatedLufs: -Infinity, gatedBlockCount: 0 };
  }

  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      const abs = Math.abs(channel[i]);
      if (abs > peak) peak = abs;
    }
  }
  const samplePeakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;

  const weighted = channels.map((channel) => kWeightChannel(channel, sampleRate));
  const blockSamples = Math.round(BLOCK_SECONDS * sampleRate);
  const hopSamples = Math.round(blockSamples * (1 - BLOCK_OVERLAP));
  const length = weighted[0].length;

  const blockLoudness: number[] = [];
  for (let start = 0; start + blockSamples <= length; start += hopSamples) {
    let sum = 0;
    for (const channel of weighted) {
      for (let i = start; i < start + blockSamples; i++) {
        sum += channel[i] * channel[i];
      }
    }
    const l = loudnessOfBlock(sum, blockSamples, weighted.length);
    // Absolute gate: the block's *reported* loudness must exceed −70 LUFS. Block
    // values are offset-free, so the gate moves up by the offset.
    if (l + LOUDNESS_OFFSET > ABSOLUTE_GATE_LUFS) blockLoudness.push(l);
  }

  if (blockLoudness.length === 0) {
    return { integratedLufs: -Infinity, samplePeakDb, ungatedLufs: -Infinity, gatedBlockCount: 0 };
  }

  // Ungated loudness over every block that passed the absolute gate, then the
  // BS.1770 relative gate 10 LU below it.
  const ungatedLufs = meanLoudness(blockLoudness);
  const relativeGate = ungatedLufs + RELATIVE_GATE_LU - LOUDNESS_OFFSET;

  const gated = blockLoudness.filter((l) => l > relativeGate);
  const integratedLufs = meanLoudness(gated.length > 0 ? gated : blockLoudness);

  return { integratedLufs, samplePeakDb, ungatedLufs, gatedBlockCount: gated.length };
}

/**
 * Unweighted broadband RMS in dBFS. Not part of BS.1770 — kept only so the offline
 * numbers in the loudness report can be compared like-for-like with the live-path
 * probe the integrator runs (which averages a raw master RMS window).
 */
export function sampleRmsDb(channels: Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      sum += channel[i] * channel[i];
      count++;
    }
  }
  if (count === 0 || sum <= 0) return -Infinity;
  return 20 * Math.log10(Math.sqrt(sum / count));
}
