/**
 * The pitch of a rendered note, by autocorrelation — the instrument A4 judges with.
 *
 * It takes **no candidate frequencies**, and that is the point: an estimator fed the expected answer, or searching a small window around it, cannot disagree with the
 * prediction it is meant to test. This one looks at the signal and reports what it finds, so a wrong ratio in this project's mapping shows up as a wrong number rather
 * than as a number that was never really measured.
 *
 * **Its measured limits, stated rather than discovered later:**
 *
 * * harmonic-free material (which is what A4's fixture is — three plain sines) is read to within 0.5%, verified against frequencies known by construction;
 * * a tone whose **second harmonic dominates its fundamental** reads an **octave high** (`0.2·sin f + 0.8·sin 2f` reads 440 Hz for a 220 Hz tone). The rule below — the
 *   earliest local maximum within 85% of the global one — is a real guard that fixes the naive single-pass version (which read 3838 Hz for a 220 Hz sine), but it does
 *   **not** solve this case: the half-period genuinely correlates better there. The standard answer is YIN's cumulative-mean-normalised difference, and it is named
 *   here as the fix rather than left as a surprise.
 *
 * That limitation does not affect A4 as specified, because the fixture is harmonic-free **and the criterion is this project's mapping, not a real instrument's timbre**.
 * It will matter the moment a real library is compared, and the samples in one are not harmonic-free — which is why it is written down now instead of when it bites.
 */
const MIN_HZ = 40;
const MAX_HZ = 4000;

/** @returns {{ hz: number, confidence: number, periodSamples: number } | null} */
export function measurePitch(wav, { fromSeconds = 0, toSeconds = null, channel = 0 } = {}) {
  const rate = wav.sampleRate;
  const start = Math.max(0, Math.round(fromSeconds * rate));
  const end = Math.min(wav.frames, toSeconds === null ? wav.frames : Math.round(toSeconds * rate));
  const length = end - start;
  if (length < 256) return null;

  // A Hann window keeps the segment's edges from dominating the correlation.
  const samples = new Float64Array(length);
  let mean = 0;
  for (let i = 0; i < length; i += 1) mean += wav.data[channel][start + i];
  mean /= length;
  for (let i = 0; i < length; i += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
    samples[i] = (wav.data[channel][start + i] - mean) * window;
  }

  const minLag = Math.max(2, Math.floor(rate / MAX_HZ));
  const maxLag = Math.min(length - 2, Math.floor(rate / MIN_HZ));
  const correlation = new Float64Array(maxLag + 1);

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i + lag < length; i += 1) {
      sum += samples[i] * samples[i + lag];
      energyA += samples[i] * samples[i];
      energyB += samples[i + lag] * samples[i + lag];
    }
    const norm = Math.sqrt(energyA * energyB);
    correlation[lag] = norm > 0 ? sum / norm : 0;
  }

  /**
   * Two passes, and the first version's single pass was the bug: it compared each lag against the **running** maximum, and a smooth high-frequency signal already
   * correlates strongly at short lags, so the first lag to cross 0.8 × (a maximum that had barely grown) won and every test read an octave — or two — too high
   * (3838 Hz for a 220 Hz sine). The maximum is computed **first**, then the search looks for the earliest **local** maximum that is nearly as strong as it.
   *
   * That ordering is what makes the earliest peak meaningful: the true period and its multiples are all strong, and taking the earliest of them avoids reporting a
   * multiple, while requiring a local maximum stops a rising slope from being mistaken for a peak.
   */
  let globalMax = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) if (correlation[lag] > globalMax) globalMax = correlation[lag];
  let best = { lag: 0, value: 0 };
  for (let lag = minLag + 1; lag < maxLag; lag += 1) {
    const value = correlation[lag];
    /**
     * ⭐ **A tight threshold, not a loose one.** The rule was `>= 0.85 * globalMax`, and that was measured to be fragile: the same 880 Hz tone rendered into two directories measured 890.52 Hz and 880.01 Hz, because the correlation peak of a pure tone is flat-topped and a hair of numerical difference moved the chosen lag by one sample — which at ~50 samples per period is
     * **2%**, twice the tolerance the callers compare against. `0.99` picks the top of the peak instead of its shoulder, which is the same choice every time. (Two renders into the *same* directory are byte-identical, so the perturbation was in the audio, not in the arithmetic.)
     */
    if (value >= correlation[lag - 1] && value >= correlation[lag + 1] && value >= 0.99 * globalMax) {
      best = { lag, value };
      break;
    }
  }
  if (best.lag === 0) {
    for (let lag = minLag; lag <= maxLag; lag += 1) if (correlation[lag] > best.value) best = { lag, value: correlation[lag] };
  }

  // Parabolic interpolation around the peak, so the estimate is not quantised to whole samples.
  const y0 = correlation[best.lag - 1] ?? 0;
  const y1 = correlation[best.lag] ?? 0;
  const y2 = correlation[best.lag + 1] ?? 0;
  const denominator = y0 - 2 * y1 + y2;
  const shift = denominator !== 0 ? (0.5 * (y0 - y2)) / denominator : 0;
  const periodSamples = best.lag + shift;

  return { hz: rate / periodSamples, confidence: best.value, periodSamples };
}

/**
 * **The frequency of a tone, found as the peak of its spectrum.**
 *
 * This replaces two earlier attempts, and both failures are worth keeping in view because they are the reason for the shape below.
 *
 * `measurePitch` estimates a period by autocorrelation, and for exactly the signal the sfizz criteria use that is unstable: two renders of the same 440 Hz tone — into different directories, from a byte-identical source sample — came back as **880.01 Hz and 890.52 Hz**. A pure tone's correlation peak is flat-topped, so a hair of difference in the audio moved the chosen lag by one sample, and at roughly fifty samples per period that is two percent. Tightening the threshold helped and did not settle it: the criterion failed again at 1.195%.
 *
 * Zero crossings were the second attempt, and they failed differently: the same criterion then read **867.82 Hz** for an 880 Hz tone. That render carries the library's own amplitude envelope, and a global mean subtraction over a decaying signal leaves a moving mean behind, which shifts crossings asymmetrically.
 *
 * A **spectral peak** has neither problem. The tone's magnitude at its own frequency is what it is whether the tone is decaying or steady, and the peak of a smooth magnitude curve can be found to a small fraction of a bin by fitting a parabola to the three points around it. The search runs on a log-spaced grid — a tone is judged in ratio, not in hertz — and is refined twice, so the final precision is far finer than the first grid.
 *
 * `confidence` is how far the peak stands above the band's median magnitude, which is what keeps it honest for material that has no pitch: a sweep spreads its energy, and an unpeaked spectrum reports low confidence.
 *
 * @returns {{ hz: number, confidence: number, magnitude: number } | null}
 */
export function measureToneHz(wav, { fromSeconds = 0, toSeconds = null, channel = 0, minHz = 40, maxHz = 4000 } = {}) {
  const rate = wav.sampleRate;
  const start = Math.max(0, Math.round(fromSeconds * rate));
  const end = Math.min(wav.frames, toSeconds === null ? wav.frames : Math.round(toSeconds * rate));
  const length = end - start;
  if (length < 256) return null;

  const samples = wav.data[channel];
  /** The magnitude at one frequency, by correlation: the same measurement the probe experiments used, because it is exact at the bin asked about. */
  const magnitudeAt = (hz) => {
    const omega = (2 * Math.PI * hz) / rate;
    let re = 0;
    let im = 0;
    for (let i = 0; i < length; i += 1) {
      const t = samples[start + i];
      re += t * Math.cos(omega * i);
      im += t * Math.sin(omega * i);
    }
    return (2 * Math.hypot(re, im)) / length;
  };

  const lowest = Math.max(minHz, rate / length);
  const highest = Math.min(maxHz, rate / 2.2);
  if (!(highest > lowest)) return null;

  // A log-spaced grid: a tone is judged in ratio, so equal steps in pitch are equal steps here.
  const steps = 600;
  const ratio = Math.pow(highest / lowest, 1 / steps);
  const grid = [];
  let best = { hz: lowest, magnitude: -1 };
  for (let i = 0; i <= steps; i += 1) {
    const hz = lowest * Math.pow(ratio, i);
    const magnitude = magnitudeAt(hz);
    grid.push(magnitude);
    if (magnitude > best.magnitude) best = { hz, magnitude };
  }

  /** Two parabolic refinements, each on a grid a hundred times finer than the last, around the current best. */
  let centre = best.hz;
  let span = centre * (ratio - 1) * 4;
  for (let pass = 0; pass < 2; pass += 1) {
    const local = [];
    for (let i = -8; i <= 8; i += 1) {
      const hz = centre + (span * i) / 8;
      if (hz <= lowest || hz >= highest) continue;
      local.push({ hz, magnitude: magnitudeAt(hz) });
    }
    if (local.length === 0) break;
    const peakIndex = local.reduce((bestIndex, point, index) => (point.magnitude > local[bestIndex].magnitude ? index : bestIndex), 0);
    const y0 = local[peakIndex - 1]?.magnitude ?? local[peakIndex].magnitude;
    const y1 = local[peakIndex].magnitude;
    const y2 = local[peakIndex + 1]?.magnitude ?? local[peakIndex].magnitude;
    const denominator = y0 - 2 * y1 + y2;
    const shift = denominator !== 0 ? (0.5 * (y0 - y2)) / denominator : 0;
    const step = peakIndex + 1 < local.length ? local[peakIndex + 1].hz - local[peakIndex].hz : span / 8;
    centre = local[peakIndex].hz + shift * step;
    span = Math.abs(step) * 2;
  }

  /**
   * **The peak's prominence among its neighbours, not among the whole grid.**
   *
   * The first version compared the peak to the median of every bin, and a **sweep** passed as confident: its energy is spread, so most bins are nearly empty and the median is tiny even though the spectrum around the peak is a plateau. Comparing the peak with the bins within ±20% of it asks the question that matters — is there a *peak* here — and a plateau answers no.
   */
  const neighbours = [];
  for (let i = 0; i <= steps; i += 1) {
    const hz = lowest * Math.pow(ratio, i);
    if (hz > centre * 0.8 && hz < centre * 1.25) neighbours.push(grid[i]);
  }
  neighbours.sort((a, b) => a - b);
  const neighbourMedian = neighbours[Math.floor(neighbours.length / 2)] ?? 0;
  const confidence = best.magnitude > 0 ? Math.max(0, Math.min(1, 1 - neighbourMedian / best.magnitude)) : 0;
  return { hz: centre, confidence, magnitude: best.magnitude };
}
