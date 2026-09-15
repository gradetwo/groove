/**
 * Timbre fingerprinting for measurement gate V-10 (test/measurement helper only).
 *
 * WHY THIS MODULE EXISTS
 *  V-10 asks "did this genre's timbre drift?" across the offline renders. Loudness
 *  (V-11) and true peak (V-03) already say how *loud* a render is; neither says
 *  anything about *what it sounds like*. This module turns one rendered buffer into a
 *  small, level-independent descriptor — a 13-band energy shape plus a centroid, a
 *  rolloff and an L/R correlation — so a baseline JSON can be diffed and a gate can
 *  fail a take whose timbre moved even when its loudness did not.
 *
 *  Like `helpers/loudness.ts`, this module is deliberately NOT imported by any
 *  production code path: the offline measurement script and the unit suite share one
 *  implementation instead of each carrying an untestable copy.
 *
 * HOW
 *  - Filterbank, not FFT. There is no FFT helper in this repo and this module does not
 *    add one. Each of the 13 bands is a second-order RBJ band-pass (constant 0 dB peak
 *    gain) run forward with Transposed Direct Form II — two state variables (z1, z2),
 *    the same formulation as `applyBiquad` in `helpers/loudness.ts`, chosen because it
 *    keeps the better round-off behaviour for a float32 input and needs no delay line.
 *    A band's energy is the sum of squares of that filter's output.
 *  - 13 logarithmically spaced centres, starting at 31.5 Hz in 2/3-octave steps.
 *  - `bandDb` divides every band's energy by the sum of all band energies, which is
 *    exactly what makes it level independent: scaling the input scales numerator and
 *    denominator together, so the shape is invariant and only `rmsDb` moves.
 *
 * WHAT IT DELIBERATELY DOES NOT DO (documented, not silently approximated)
 *  - No resolution beyond the bank. `centroidHz` and `rolloffBand` are computed *from
 *    the 13 band energies and the 13 band centres*, so they are BAND-LIMITED: their
 *    resolution is one band (2/3 octave), not an FFT bin. A centroid of "224 Hz" means
 *    "the energy sits around the 126–317 Hz bands", not a 1 Hz measurement, and the
 *    rolloff "band index" is a band index by construction. Do not read either as a
 *    transform-domain estimate.
 *  - No windowing and no per-frame analysis: the whole buffer is filtered once, so the
 *    result is a single descriptor for the take, not a spectrogram.
 *  - No perceptual weighting: this is a timbre shape, not a loudness or sharpness model.
 *
 * DETERMINISM
 *  No randomness, no clock, no `performance.now()`. The same buffer and sample rate
 *  produce bit-identical output within a process, which is what the byte-level gate
 *  needs. (Cross-engine bit-identity is not promised: `Math.sin`/`Math.cos`/`Math.log10`
 *  are not correctly-rounded by the ECMAScript spec. Generate the baseline in the same
 *  runtime that runs the gate.)
 */

/** 2/3 octave per band step. */
const BAND_SPACING_OCTAVES = 2 / 3;
/** Lowest band centre; the table is 31.5 * 2**(k * 2/3), k = 0..12. */
const LOWEST_BAND_CENTRE_HZ = 31.5;

export const TIMBRE_BAND_COUNT = 13;

/** 13 bands, 2/3-octave spacing, from 31.5 Hz upward. */
export const TIMBRE_BAND_CENTRES_HZ: readonly number[] = Object.freeze(buildBandCentres());

export interface TimbreFingerprint {
  /** Level-independent spectral shape: 10*log10(bandEnergy / totalEnergy), one per band, dB. */
  bandDb: number[];
  /** Energy-weighted mean band centre, Hz (from the filterbank, not a full FFT). */
  centroidHz: number;
  /** Highest band index (into bandDb) under which 85% of the cumulative energy lies. */
  rolloffBand: number;
  /** Pearson correlation between left and right channels over the whole buffer, -1..1. */
  correlation: number;
  /** Overall level, dBFS RMS of the summed channels — context only, NOT part of the shape. */
  rmsDb: number;
}

/**
 * Band-pass Q for a 2/3-octave −3 dB bandwidth. Solving |H|² = 1/2 for the RBJ
 * band-pass gives a log-symmetric edge pair spaced
 *   BW_octaves = (2 / ln2) · asinh(1 / (2Q)),
 * so inverting it gives
 *   Q = 1 / (2 · sinh(BW · ln2 / 2)).
 * For BW = 2/3 that is Q ≈ 2.1449, whose −3 dB edges sit at 2^(±1/3) · f0 — i.e. the
 * adjacent band centres, which is the overlap a 2/3-octave bank is meant to have.
 */
const BANDPASS_Q = 1 / (2 * Math.sinh((BAND_SPACING_OCTAVES * Math.LN2) / 2));

/**
 * Floor on the band-energy ratio before the log. A silent input has zero total energy,
 * so `bandEnergy / totalEnergy` is 0/0; flooring the ratio at 1e-12 makes every band
 * read a finite 10·log10(1e-12) = −120 dB instead of −Infinity or NaN. 1e-12 is far
 * below any real leakage between 2/3-octave bands (adjacent-band leakage is ≈ −7 dB),
 * so it cannot mask genuine energy, and it keeps logs finite for the degenerate cases.
 */
const ENERGY_RATIO_FLOOR = 1e-12;

/** Fraction of cumulative band energy at or below which `rolloffBand` is reported. */
const ROLLOFF_ENERGY_FRACTION = 0.85;

/**
 * Documented RMS floor for an all-zero (or empty) buffer, −200 dBFS. −Infinity would be
 * the mathematical answer, but a gate cannot compare −Infinity, so it is clamped.
 */
const SILENCE_RMS_DB = -200;

/** Feed-forward RBJ band-pass coefficients (a0 normalised to 1). */
interface BandpassCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * Round to 4 significant digits — the precision the band-centre table is specified at
 * ("31.5 * 2**(k*2/3), rounded to 4 significant digits"). The rounding moves a centre
 * by at most ~5e-5 relative, four orders of magnitude below the 2/3-octave spacing, so
 * using the rounded centres for both the filters and the centroid keeps the exported
 * table self-consistent without moving any measurement.
 */
function roundTo4SignificantDigits(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const exponent = Math.ceil(Math.log10(Math.abs(value)));
  const scale = Math.pow(10, 4 - exponent);
  return Math.round(value * scale) / scale;
}

/**
 * `[31.5, 50, 79.38, 126, 200, 317.5, 504, 800.1, 1270, 2016, 3200, 5080, 8064]`.
 * Built from the formula rather than pasted so the table and its documented rule can
 * never drift apart.
 */
function buildBandCentres(): number[] {
  const centres: number[] = [];
  for (let k = 0; k < TIMBRE_BAND_COUNT; k++) {
    centres.push(
      roundTo4SignificantDigits(LOWEST_BAND_CENTRE_HZ * Math.pow(2, k * BAND_SPACING_OCTAVES))
    );
  }
  return centres;
}

/**
 * RBJ audio-EQ-cookbook band-pass, constant 0 dB peak gain, at one band centre:
 *   w0 = 2·PI·f0/fs, alpha = sin(w0)/(2Q),
 *   b0 = alpha, b1 = 0, b2 = −alpha, a0 = 1 + alpha, a1 = −2·cos(w0), a2 = 1 − alpha,
 * all divided by a0.
 */
function bandpassCoefficients(centreHz: number, sampleRate: number): BandpassCoefficients {
  const w0 = (2 * Math.PI * centreHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * BANDPASS_Q);
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha) / a0,
  };
}

/**
 * Band energies of one signal, in linear energy units, one per band.
 * Exported so a gate can reason about a single band.
 *
 * Units: sum of squares of the band-pass output (not divided by the sample count), so
 * the number depends on the take's length. Every fingerprint field that uses energies
 * divides them by the total, which cancels length and level; an absolute band energy is
 * more useful to a single-band gate than a mean power would be.
 *
 * Nyquist guard: a band whose centre is at or above Nyquist (f0 ≥ fs/2) is written as
 * exactly 0 energy. At its -3 dB edge the RBJ design collapses (sin(w0) ≤ 0 makes alpha
 * non-positive and the filter unstable), so the guard is required for correctness, not
 * just tidiness — at 44.1/48 kHz it never fires (the highest centre, 8064 Hz, is below
 * fs/2/1.2), but at e.g. 8 kHz bands 11 and 12 must read 0, not NaN. A non-positive
 * sample rate likewise yields all-zero energies.
 */
export function bandEnergies(samples: Float32Array, sampleRate: number): number[] {
  const energies: number[] = new Array<number>(TIMBRE_BAND_COUNT).fill(0);
  if (!(sampleRate > 0)) return energies;
  const nyquist = sampleRate / 2;

  for (let k = 0; k < TIMBRE_BAND_COUNT; k++) {
    const centreHz = TIMBRE_BAND_CENTRES_HZ[k];
    if (!(centreHz > 0) || !(centreHz < nyquist)) continue;
    const c = bandpassCoefficients(centreHz, sampleRate);

    // Transposed Direct Form II: y = b0·x + z1; z1 = b1·x − a1·y + z2; z2 = b2·x − a2·y.
    let z1 = 0;
    let z2 = 0;
    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      const y = c.b0 * x + z1;
      z1 = c.b1 * x - c.a1 * y + z2;
      z2 = c.b2 * x - c.a2 * y;
      energy += y * y;
    }
    energies[k] = energy;
  }
  return energies;
}

/**
 * Mono composite of a channel set: the arithmetic mean of the channels, over the
 * shortest channel length. The mean (not the sum) keeps a stereo pair and its mono fold
 * at the same level, which is what makes `rmsDb` comparable across layouts. A single
 * channel is returned as-is (no allocation); zero channels return an empty buffer.
 */
function channelMix(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];

  let length = channels[0].length;
  for (const channel of channels) {
    if (channel.length < length) length = channel.length;
  }
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
  }
  return mono;
}

/**
 * Pearson r over two channels, computed in one pass for the means and one for the
 * centred sums. Zero variance on either side (a digital-silence channel) means the
 * correlation is 0/0 — undefined — so it is reported as 0. Returning 1 there would
 * falsely claim perfect mono compatibility for silence; returning NaN would break every
 * downstream comparison.
 */
function pearsonCorrelation(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;

  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;

  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    covariance += da * db;
    varianceA += da * da;
    varianceB += db * db;
  }
  if (!(varianceA > 0) || !(varianceB > 0)) return 0;
  return covariance / Math.sqrt(varianceA * varianceB);
}

/** Composite a mono buffer (or average of channels) and fingerprint it. */
export function fingerprintChannels(
  channels: Float32Array[],
  sampleRate: number
): TimbreFingerprint {
  const mono = channelMix(channels);
  const energies = bandEnergies(mono, sampleRate);

  let totalEnergy = 0;
  for (let k = 0; k < TIMBRE_BAND_COUNT; k++) totalEnergy += energies[k];

  const bandDb: number[] = new Array<number>(TIMBRE_BAND_COUNT);
  for (let k = 0; k < TIMBRE_BAND_COUNT; k++) {
    const ratio = totalEnergy > 0 ? energies[k] / totalEnergy : 0;
    bandDb[k] = 10 * Math.log10(Math.max(ratio, ENERGY_RATIO_FLOOR));
  }

  // Centroid from the band energies and the (rounded) band centres. Band-limited by
  // construction — see the module header.
  let weightedCentres = 0;
  let energySum = 0;
  for (let k = 0; k < TIMBRE_BAND_COUNT; k++) {
    weightedCentres += energies[k] * TIMBRE_BAND_CENTRES_HZ[k];
    energySum += energies[k];
  }
  const centroidHz = energySum > 0 ? weightedCentres / energySum : 0;

  // Rolloff: the highest index whose cumulative energy reaches 85% of the total. For
  // silence the cumulative fraction is 0/0, so it is fixed at 0 (documented, finite).
  let rolloffBand = 0;
  if (totalEnergy > 0) {
    let cumulative = 0;
    for (let k = 0; k < TIMBRE_BAND_COUNT; k++) {
      cumulative += energies[k];
      rolloffBand = k;
      if (cumulative >= ROLLOFF_ENERGY_FRACTION * totalEnergy) break;
    }
  }

  // One channel has nothing to correlate against, so it is declared perfectly correlated
  // (r = 1). With two or more channels, only the first pair is used: V-10 is a stereo
  // plan, and comparing L to a surround channel would not mean "mono compatibility".
  const correlation = channels.length < 2 ? 1 : pearsonCorrelation(channels[0], channels[1]);

  let rmsDb = SILENCE_RMS_DB;
  if (mono.length > 0) {
    let sumSquares = 0;
    for (let i = 0; i < mono.length; i++) sumSquares += mono[i] * mono[i];
    const meanSquare = sumSquares / mono.length;
    if (meanSquare > 0) rmsDb = 20 * Math.log10(Math.sqrt(meanSquare));
  }

  return { bandDb, centroidHz, rolloffBand, correlation, rmsDb };
}

/** Mean absolute difference of `bandDb`, in dB — the shape distance used by gates. */
export function fingerprintDistance(a: TimbreFingerprint, b: TimbreFingerprint): number {
  const n = Math.min(a.bandDb.length, b.bandDb.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let k = 0; k < n; k++) sum += Math.abs(a.bandDb[k] - b.bandDb[k]);
  return sum / n;
}
