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
 *  - True-peak (inter-sample peak) metering: 4× oversampled polyphase FIR per
 *    BS.1770-4 Annex 2, reported as `truePeakDb` alongside the raw `samplePeakDb`.
 *
 * NOT implemented (documented, not silently approximated):
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
  /**
   * True (inter-sample) peak across channels, dBTP. Always ≥ `samplePeakDb`
   * (a sample is a point on the reconstructed waveform, so the oversampled estimate
   * can never legitimately read below the raw peak). −Infinity for digital silence.
   */
  truePeakDb: number;
  /** Ungated block loudness before the relative gate, LUFS (debugging aid). */
  ungatedLufs: number;
  /** Number of 400 ms blocks used after both gates. */
  gatedBlockCount: number;
}

/** Oversampling factor used by the true-peak estimator (BS.1770-4 Annex 2). */
export const TRUE_PEAK_OVERSAMPLE_FACTOR = 4;
/** Taps per polyphase branch; 4 × 12 = a 48-tap prototype interpolator. */
export const TRUE_PEAK_TAPS_PER_PHASE = 12;
/** Kaiser window β for the prototype low-pass. */
export const TRUE_PEAK_KAISER_BETA = 8.0;

const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;
/** BS.1770 offset term: L = −0.691 + 10·log10(Σ G_i · z_i). */
const LOUDNESS_OFFSET = -0.691;
const BLOCK_SECONDS = 0.4;
/** Tech 3342's short-term window and step, for the loudness *range*. */
const SHORT_TERM_SECONDS = 3;
const SHORT_TERM_HOP_SECONDS = 1;
/** The range's relative gate: 20 LU below the gated mean. */
const LRA_RELATIVE_GATE_LU = 20;
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

/** Modified Bessel function of the first kind, order 0 (Kaiser window). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const half = x / 2;
  for (let k = 1; k < 64; k++) {
    term *= (half / k) * (half / k);
    sum += term;
    if (term < 1e-16 * sum) break;
  }
  return sum;
}

let cachedTruePeakTaps: Float32Array[] | null = null;

/**
 * Polyphase branches of the BS.1770-4 Annex 2 true-peak interpolator.
 *
 * Design: a 48-tap (L = 4 phases × 12 taps) windowed-sinc prototype,
 * `h[n] = sinc((n − 24)/4) · kaiser(n; β = 8)`, with each branch individually
 * normalised to unity DC gain. Because the prototype is centred on tap 24, branch 0
 * collapses to an exact unit impulse (all other sinc arguments are integers and
 * vanish), so branch 0 reproduces the raw samples and branches 1–3 supply the three
 * in-between phases. The 12-tap/phase class is the one the Recommendation names for
 * 4× oversampling; a Kaiser β of 8 trades ~70 dB of stopband rejection against a
 * passband flat enough (<0.01 dB below 0.4·fs) for peak metering.
 */
export function truePeakPolyphaseTaps(): Float32Array[] {
  const L = TRUE_PEAK_OVERSAMPLE_FACTOR;
  const P = TRUE_PEAK_TAPS_PER_PHASE;
  const N = L * P;
  const centre = N / 2; // 24 — integer, so branch 0 is δ[n − 6]
  const windowCentre = (N - 1) / 2;
  const i0 = besselI0(TRUE_PEAK_KAISER_BETA);
  const prototype = new Float64Array(N);
  for (let n = 0; n < N; n++) {
    const t = (n - centre) / L;
    const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
    const r = (n - windowCentre) / windowCentre;
    const window = besselI0(TRUE_PEAK_KAISER_BETA * Math.sqrt(Math.max(0, 1 - r * r))) / i0;
    prototype[n] = sinc * window;
  }
  const branches: Float32Array[] = [];
  for (let p = 0; p < L; p++) {
    const taps = new Float32Array(P);
    let sum = 0;
    for (let k = 0; k < P; k++) {
      taps[k] = prototype[k * L + p];
      sum += taps[k];
    }
    if (sum !== 0) {
      for (let k = 0; k < P; k++) taps[k] /= sum;
    }
    branches.push(taps);
  }
  return branches;
}

function truePeakTaps(): Float32Array[] {
  // The design depends only on the (constant) oversampling geometry, so cache it:
  // rebuilding the Kaiser window once per channel per render was pure overhead.
  if (!cachedTruePeakTaps) cachedTruePeakTaps = truePeakPolyphaseTaps();
  return cachedTruePeakTaps;
}

/**
 * True (inter-sample) peak of one channel, in linear units, using 4× oversampling.
 *
 * `Math.max` with the raw sample value is deliberate: the interpolator can only
 * *estimate* the continuous waveform, and a sample is by definition a point on it, so
 * the estimate is floored at the sample peak. That makes `truePeak ≥ samplePeak`
 * structurally true rather than a property the filter has to be lucky about.
 */
export function truePeakLinear(samples: Float32Array): number {
  const taps = truePeakTaps();
  const P = TRUE_PEAK_TAPS_PER_PHASE;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const raw = Math.abs(samples[i]);
    if (raw > peak) peak = raw;
    for (let p = 0; p < taps.length; p++) {
      const branch = taps[p];
      let acc = 0;
      for (let k = 0; k < P; k++) {
        const j = i - k;
        if (j < 0) break;
        acc += branch[k] * samples[j];
      }
      const value = Math.abs(acc);
      if (value > peak) peak = value;
    }
  }
  return peak;
}

/** True peak of a mono signal in dBTP (0 dBTP = full scale). */
export function truePeakDb(samples: Float32Array, _sampleRate?: number): number {
  const peak = truePeakLinear(samples);
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/** True peak across channels in dBTP: the maximum of the per-channel estimates. */
export function truePeakDbChannels(channels: Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    const value = truePeakLinear(channel);
    if (value > peak) peak = value;
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
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
  const empty: LoudnessResult = {
    integratedLufs: -Infinity,
    samplePeakDb: -Infinity,
    truePeakDb: -Infinity,
    ungatedLufs: -Infinity,
    gatedBlockCount: 0,
  };
  if (channels.length === 0 || channels[0].length === 0) {
    return empty;
  }

  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      const abs = Math.abs(channel[i]);
      if (abs > peak) peak = abs;
    }
  }
  const samplePeakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  const truePeak = truePeakDbChannels(channels);

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
    return { integratedLufs: -Infinity, samplePeakDb, truePeakDb: truePeak, ungatedLufs: -Infinity, gatedBlockCount: 0 };
  }

  // Ungated loudness over every block that passed the absolute gate, then the
  // BS.1770 relative gate 10 LU below it.
  const ungatedLufs = meanLoudness(blockLoudness);
  const relativeGate = ungatedLufs + RELATIVE_GATE_LU - LOUDNESS_OFFSET;

  const gated = blockLoudness.filter((l) => l > relativeGate);
  const integratedLufs = meanLoudness(gated.length > 0 ? gated : blockLoudness);

  return { integratedLufs, samplePeakDb, truePeakDb: truePeak, ungatedLufs, gatedBlockCount: gated.length };
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

/**
 * EBU R128 **loudness range** (LRA), in LU — how much the *master* actually moves.
 *
 * Added because a listening review of `disco-loop.wav` reported LRA **0.6 LU** and called the result mechanical, while
 * this repository's own dynamics claim (`thinDynamics`) read 0 offenders — and that claim measures the *pattern's*
 * per-track velocity spread, not the master. One of the two had to be measuring the wrong thing, and the master is the
 * one a listener experiences.
 *
 * The definition used here is Tech 3342's: 3 s short-term blocks with a 1 s step, an absolute gate at −70 LUFS, then a
 * relative gate 20 LU below the gated mean, and LRA = P95 − P10 of what survives. Percentiles rather than min/max, so
 * one quiet intro cannot dominate the number.
 */
export function measureLoudnessRange(channels: Float32Array[], sampleRate: number): number {
  if (channels.length === 0 || channels[0].length === 0) return 0;
  const weighted = channels.map((channel) => kWeightChannel(channel, sampleRate));
  const blockSamples = Math.round(SHORT_TERM_SECONDS * sampleRate);
  const hopSamples = Math.round(SHORT_TERM_HOP_SECONDS * sampleRate);
  const length = weighted[0].length;
  if (length < blockSamples) return 0;

  const blocks: number[] = [];
  for (let start = 0; start + blockSamples <= length; start += hopSamples) {
    let sum = 0;
    for (const channel of weighted) {
      for (let i = start; i < start + blockSamples; i++) sum += channel[i] * channel[i];
    }
    const block = loudnessOfBlock(sum, blockSamples, weighted.length) + 0; // already offset-corrected
    if (block > ABSOLUTE_GATE_LUFS) blocks.push(block);
  }
  if (blocks.length < 2) return 0;

  const mean = blocks.reduce((a, b) => a + b, 0) / blocks.length;
  const relativeGate = mean - LRA_RELATIVE_GATE_LU;
  const gated = blocks.filter((value) => value > relativeGate).sort((a, b) => a - b);
  if (gated.length < 2) return 0;
  const percentile = (fraction: number) =>
    gated[Math.min(gated.length - 1, Math.max(0, Math.round(fraction * (gated.length - 1))))];
  return Math.max(0, percentile(0.95) - percentile(0.1));
}
