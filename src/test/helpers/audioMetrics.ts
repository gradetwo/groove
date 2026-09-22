/**
 * Signal-level metrics for the export audit.
 *
 * `helpers/loudness.ts` already owns loudness and true peak, and `helpers/timbre.ts` owns the spectral shape
 * (a 13-band filterbank, deliberately not an FFT). These are the few measurements a listener's complaint maps
 * onto directly and neither of those covers:
 *
 *   · **clicks** — the largest sample-to-sample jump, and how many jumps stand out from the signal's own
 *     texture. A click is a discontinuity, so it shows up in the first difference and nowhere else;
 *   · **clipping** — samples pinned at the ceiling;
 *   · **space** — inter-channel correlation and side energy, which is how "it sounds mono and dry" becomes a
 *     number rather than an impression;
 *   · **tail** — the level of the final milliseconds, which is how "the ending is cut off" becomes measurable.
 *
 * Everything here is deterministic (no clock, no randomness) and pure, so the same buffer always gives the same
 * numbers; the unit test pins each one against a synthetic signal whose answer is known by construction.
 */

/** Largest absolute first difference across the channels, in dBFS. `-Infinity` for silence. */
export function maxStepDb(channels: Float32Array[]): number {
  let max = 0;
  for (const channel of channels) {
    for (let i = 1; i < channel.length; i += 1) {
      const step = Math.abs(channel[i] - channel[i - 1]);
      if (step > max) max = step;
    }
  }
  return max === 0 ? -Infinity : 20 * Math.log10(max);
}

/** Median absolute first difference, in dBFS — the signal's own "normal" slew rate. */
export function medianStepDb(channels: Float32Array[]): number {
  const steps: number[] = [];
  for (const channel of channels) {
    for (let i = 1; i < channel.length; i += 1) steps.push(Math.abs(channel[i] - channel[i - 1]));
  }
  if (!steps.length) return -Infinity;
  steps.sort((a, b) => a - b);
  const middle = steps[Math.floor(steps.length / 2)];
  return middle === 0 ? -Infinity : 20 * Math.log10(middle);
}

/**
 * How many sample-to-sample jumps exceed `factor` × the median jump.
 *
 * A discontinuous envelope edge is a *single* huge step, whereas dense high-frequency content has many large
 * ones, so the count separates "a click" from "a bright signal" — a distinction the raw maximum cannot make.
 */
export function stepOutlierCount(channels: Float32Array[], factor = 12): number {
  const medianLinear = medianStepDb(channels);
  if (!Number.isFinite(medianLinear)) return 0;
  const threshold = 10 ** (medianLinear / 20) * factor;
  let count = 0;
  for (const channel of channels) {
    for (let i = 1; i < channel.length; i += 1) {
      if (Math.abs(channel[i] - channel[i - 1]) > threshold) count += 1;
    }
  }
  return count;
}

/** Samples at or above the ceiling. */
export function clippedSampleCount(channels: Float32Array[], ceiling = 0.999): number {
  let count = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      if (Math.abs(channel[i]) >= ceiling) count += 1;
    }
  }
  return count;
}

/**
 * Pearson correlation between the two channels.
 *
 * `1` is identical (mono), `0` uncorrelated (wide), negative means the channels fight (a phase problem).
 */
export function channelCorrelation(left: Float32Array, right: Float32Array): number {
  const n = Math.min(left.length, right.length);
  if (!n) return 1;
  let sumL = 0;
  let sumR = 0;
  let sumLR = 0;
  let sumLL = 0;
  let sumRR = 0;
  for (let i = 0; i < n; i += 1) {
    const l = left[i];
    const r = right[i];
    sumL += l;
    sumR += r;
    sumLR += l * r;
    sumLL += l * l;
    sumRR += r * r;
  }
  const covariance = sumLR / n - (sumL / n) * (sumR / n);
  const sdL = Math.sqrt(Math.max(0, sumLL / n - (sumL / n) ** 2));
  const sdR = Math.sqrt(Math.max(0, sumRR / n - (sumR / n) ** 2));
  if (sdL === 0 || sdR === 0) return 1;
  return covariance / (sdL * sdR);
}

/** Energy of the side signal relative to the mid signal, in dB. `-Infinity` means exactly mono. */
export function sideToMidDb(channels: Float32Array[]): number {
  if (channels.length < 2) return -Infinity;
  const [left, right] = channels;
  const n = Math.min(left.length, right.length);
  let mid = 0;
  let side = 0;
  for (let i = 0; i < n; i += 1) {
    const m = (left[i] + right[i]) / 2;
    const s = (left[i] - right[i]) / 2;
    mid += m * m;
    side += s * s;
  }
  if (side === 0) return -Infinity;
  if (mid === 0) return Infinity;
  return 10 * Math.log10(side / mid);
}

/** RMS of the final `ms` milliseconds, in dBFS. A truncated render ends loud; a natural one decays. */
export function tailRmsDb(channels: Float32Array[], sampleRate: number, ms = 50): number {
  const window = Math.max(1, Math.round((ms / 1000) * sampleRate));
  let sum = 0;
  let count = 0;
  for (const channel of channels) {
    const start = Math.max(0, channel.length - window);
    for (let i = start; i < channel.length; i += 1) {
      sum += channel[i] * channel[i];
      count += 1;
    }
  }
  if (!count || sum === 0) return -Infinity;
  return 10 * Math.log10(sum / count);
}

/** Peak of the final few milliseconds, in dBFS — the "was it cut mid-waveform" number. */
export function finalPeakDb(channels: Float32Array[], sampleRate: number, ms = 5): number {
  const window = Math.max(1, Math.round((ms / 1000) * sampleRate));
  let peak = 0;
  for (const channel of channels) {
    const start = Math.max(0, channel.length - window);
    for (let i = start; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i]));
  }
  return peak === 0 ? -Infinity : 20 * Math.log10(peak);
}

/** Peak across the whole buffer, in dBFS. */
export function samplePeakDb(channels: Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i]));
  }
  return peak === 0 ? -Infinity : 20 * Math.log10(peak);
}

/**
 * Envelope decay shape of the loudest event in the buffer.
 *
 * Returns the ratio between the time to fall 20 dB and the time to fall 40 dB, normalised so that a **perfect
 * exponential** is `0.5` (each 20 dB takes the same time). A ratio above 0.5 means the decay slows down (a
 * linear or gated release, or a tail that never resolves); below 0.5 means it accelerates.
 */
export function decayShapeRatio(channels: Float32Array[], sampleRate: number): number | null {
  const mono = channels[0];
  if (!mono || mono.length === 0) return null;
  // Find the loudest sample, then walk forward in 5 ms blocks.
  let peakIndex = 0;
  let peak = 0;
  for (let i = 0; i < mono.length; i += 1) {
    if (Math.abs(mono[i]) > peak) {
      peak = Math.abs(mono[i]);
      peakIndex = i;
    }
  }
  if (peak === 0) return null;
  const block = Math.max(1, Math.round(0.005 * sampleRate));
  const levels: number[] = [];
  for (let start = peakIndex; start + block <= mono.length; start += block) {
    let sum = 0;
    for (let i = start; i < start + block; i += 1) sum += mono[i] * mono[i];
    levels.push(10 * Math.log10(Math.max(sum / block, 1e-12)));
  }
  const top = levels[0];
  const findCrossing = (db: number) => levels.findIndex((level) => level <= top - db);
  const t20 = findCrossing(20);
  const t40 = findCrossing(40);
  if (t20 < 1 || t40 <= t20) return null;
  return t20 / t40;
}

/**
 * Click detector: an *isolated* discontinuity, not a waveform's own edges.
 *
 * Two false positives had to be designed out, both found by running this on real stems:
 *
 *   · **square/pulse waveforms.** A bit-crushed or pulse lead is flat between its edges, so its local median
 *     slew is ~0 and every edge looks like a discontinuity — one stem reported thousands of "clicks" that were
 *     simply the waveform. The fix is to look at *when* the outliers happen: a waveform's edges repeat at a
 *     stable rate, a click does not. Clusters whose spacing is regular and dense are the signal itself.
 *   · **near-silent stems.** A chord stem peaking 35 dB down is mostly the noise floor, whose samples deviate
 *     wildly from their neighbours in relative terms while being inaudible. Anything below the audibility gate
 *     (`minPeakDb`, default -40 dBFS) is not measured at all.
 *
 * What remains is what a listener would call a click: a short cluster of samples standing far above the local
 * texture, happening at irregular times.
 */
export function clickAnalysis(
  channels: Float32Array[],
  sampleRate: number,
  options: { factor?: number; minPeakDb?: number; regularCv?: number } = {}
): { count: number; worstDb: number | null; worstIndex: number | null; skippedQuiet: boolean } {
  const factor = options.factor ?? 6;
  const minPeakDb = options.minPeakDb ?? -40;
  const regularCv = options.regularCv ?? 0.15;
  const peakDb = samplePeakDb(channels);
  if (!Number.isFinite(peakDb) || peakDb < minPeakDb) {
    return { count: 0, worstDb: null, worstIndex: null, skippedQuiet: true };
  }

  const halfWindow = Math.max(4, Math.round(sampleRate * 0.0025));
  const stride = 4;
  let worstDb: number | null = null;
  let worstIndex: number | null = null;
  /** Sample indices that stand out, per channel, before clustering. */
  const outlierIndices: number[][] = [];
  for (const channel of channels) {
    const indices: number[] = [];
    const steps = new Float32Array(Math.max(0, channel.length - 1));
    for (let i = 1; i < channel.length; i += 1) steps[i - 1] = Math.abs(channel[i] - channel[i - 1]);
    const scratch: number[] = [];
    for (let i = 1; i < channel.length - 1; i += 1) {
      const predicted = (channel[i - 1] + channel[i + 1]) / 2;
      const deviation = Math.abs(channel[i] - predicted);
      if (deviation === 0) continue;
      scratch.length = 0;
      const from = Math.max(0, i - halfWindow);
      const to = Math.min(steps.length, i + halfWindow);
      for (let j = from; j < to; j += stride) scratch.push(steps[j]);
      if (!scratch.length) continue;
      scratch.sort((a, b) => a - b);
      const floor = scratch[Math.floor(scratch.length / 2)];
      const ratioDb = 20 * Math.log10(deviation / Math.max(floor, 1e-9));
      if (worstDb === null || ratioDb > worstDb) {
        worstDb = ratioDb;
        worstIndex = i;
      }
      if (ratioDb > 20 * Math.log10(factor)) indices.push(i);
    }
    outlierIndices.push(indices);
  }

  /**
   * Cluster the outliers (gap > 2 ms starts a new event) and reject a *regular* series: a waveform's edges are
   * evenly spaced, a click is not.
   */
  let count = 0;
  for (const indices of outlierIndices) {
    if (!indices.length) continue;
    const gap = Math.max(2, Math.round(sampleRate * 0.002));
    // The first outlier opens the first cluster — the loop below only opens *new* ones.
    const clusters: number[] = [indices[0]];
    let last = indices[0];
    for (const index of indices) {
      if (index - last > gap) clusters.push(index);
      last = index;
    }
    if (clusters.length < 3) {
      count += clusters.length;
      continue;
    }
    const spacings = clusters.slice(1).map((index, i) => index - clusters[i]);
    const mean = spacings.reduce((a, b) => a + b, 0) / spacings.length;
    const variance = spacings.reduce((acc, value) => acc + (value - mean) ** 2, 0) / spacings.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    // Regular and dense => the waveform's own edge rate (a pulse lead), not a defect.
    const isWaveform = cv < regularCv && mean < sampleRate * 0.05;
    if (!isWaveform) count += clusters.length;
  }
  return { count, worstDb, worstIndex, skippedQuiet: false };
}

/**
 * Onset times of the loudest transient, in milliseconds — the measure of whether swing reached the audio.
 *
 * Onsets are found on the *envelope* (a 1 ms rectified moving average) crossing a threshold after a quiet gap,
 * which is what a drum hit looks like from the outside. The caller compares the intervals against the grid the
 * pattern claims to be playing, so "swing is declared" and "swing is audible" stop being the same statement.
 */
export function onsetTimesMs(channels: Float32Array[], sampleRate: number, options: { thresholdDb?: number } = {}): number[] {
  const mono = channels[0];
  if (!mono || !mono.length) return [];
  const smoothing = Math.max(1, Math.round(sampleRate * 0.001));
  const envelope = new Float32Array(Math.ceil(mono.length / smoothing));
  for (let i = 0; i < envelope.length; i += 1) {
    let peak = 0;
    for (let j = i * smoothing; j < Math.min(mono.length, (i + 1) * smoothing); j += 1) {
      peak = Math.max(peak, Math.abs(mono[j]));
    }
    envelope[i] = peak;
  }
  let peak = 0;
  for (const value of envelope) peak = Math.max(peak, value);
  if (peak === 0) return [];
  const threshold = peak * 10 ** ((options.thresholdDb ?? -18) / 20);
  const onsets: number[] = [];
  let quiet = true;
  for (let i = 0; i < envelope.length; i += 1) {
    if (quiet && envelope[i] >= threshold) {
      onsets.push((i * smoothing * 1000) / sampleRate);
      quiet = false;
    } else if (!quiet && envelope[i] < threshold * 0.5) {
      quiet = true;
    }
  }
  return onsets;
}
