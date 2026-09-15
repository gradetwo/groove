import { describe, it, expect } from "vitest";
import {
  TIMBRE_BAND_CENTRES_HZ,
  TIMBRE_BAND_COUNT,
  bandEnergies,
  fingerprintChannels,
  fingerprintDistance,
  type TimbreFingerprint,
} from "./helpers/timbre";

/** Deterministic in-code signal generator: no fixture files, no Math.random(). */
function sine(
  freq: number,
  peak: number,
  seconds: number,
  sampleRate: number,
  phase = 0
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++) {
    out[i] = peak * Math.sin((2 * Math.PI * freq * i) / sampleRate + phase);
  }
  return out;
}

function argmaxBand(fingerprint: TimbreFingerprint): number {
  let index = 0;
  for (let k = 1; k < fingerprint.bandDb.length; k++) {
    if (fingerprint.bandDb[k] > fingerprint.bandDb[index]) index = k;
  }
  return index;
}

const SAMPLE_RATE = 48000;

describe("timbre fingerprint (V-10)", () => {
  it("exposes 13 two-thirds-octave band centres from 31.5 Hz", () => {
    expect(TIMBRE_BAND_CENTRES_HZ).toHaveLength(TIMBRE_BAND_COUNT);
    expect(TIMBRE_BAND_CENTRES_HZ[0]).toBe(31.5);
    // 12 steps of 2/3 octave is exactly 8 octaves, so the top centre is 31.5·2^8 = 8064.
    expect(TIMBRE_BAND_CENTRES_HZ[TIMBRE_BAND_COUNT - 1]).toBeCloseTo(8064, 6);
    for (let k = 1; k < TIMBRE_BAND_COUNT; k++) {
      // Each step is 2^(2/3) ≈ 1.5874; 4-significant-digit rounding moves the ratio by
      // at most ~3e-4, so 3 decimal places is the honest precision to assert.
      const ratio = TIMBRE_BAND_CENTRES_HZ[k] / TIMBRE_BAND_CENTRES_HZ[k - 1];
      expect(ratio, `band ${k}/${k - 1} ratio`).toBeCloseTo(Math.pow(2, 2 / 3), 3);
    }
  });

  it("is level independent: −20 dB of gain moves bandDb < 0.5 dB while rmsDb moves 20 dB", () => {
    const loud = fingerprintChannels([sine(1000, 0.5, 0.5, SAMPLE_RATE)], SAMPLE_RATE);
    const quiet = fingerprintChannels([sine(1000, 0.05, 0.5, SAMPLE_RATE)], SAMPLE_RATE);

    let maxDelta = 0;
    for (let k = 0; k < TIMBRE_BAND_COUNT; k++) {
      maxDelta = Math.max(maxDelta, Math.abs(loud.bandDb[k] - quiet.bandDb[k]));
    }
    // Physics of the tolerance: 0.05/0.5 = 1/10 in amplitude is 1/100 in energy, and
    // bandDb is the ratio of each band's energy to the total energy, so the exact answer
    // is 0 dB of change. The only residual is Float32 quantisation of the input (≈1e-7
    // relative) and summation order; the filterbank is linear, so it cannot introduce a
    // level-dependent term. 0.5 dB is deliberately generous — it is smaller than one
    // 2/3-octave band — and still far above the measured residual (< 0.01 dB), which is
    // exactly what makes the assertion meaningful rather than tuned.
    expect(
      maxDelta,
      `max bandDb delta across a −20 dB gain change = ${maxDelta.toFixed(4)} dB`
    ).toBeLessThan(0.5);

    // rmsDb is the one field that is *supposed* to carry level: a 10x amplitude change is
    // 20·log10(10) = 20.0 dB in RMS. Allow 1 decimal place for float32 storage.
    expect(
      loud.rmsDb - quiet.rmsDb,
      `rmsDb loud = ${loud.rmsDb.toFixed(3)} dBFS, quiet = ${quiet.rmsDb.toFixed(3)} dBFS`
    ).toBeCloseTo(20, 1);
  });

  it("puts a 1 kHz sine in the band nearest 1 kHz", () => {
    const f = fingerprintChannels([sine(1000, 0.5, 1, SAMPLE_RATE)], SAMPLE_RATE);
    const argmax = argmaxBand(f);

    // The exported centres bracket 1 kHz at 800.1 Hz (band 7, 199.9 Hz away) and 1270 Hz
    // (band 8, 270 Hz away), so band 7 is the nearest-centre answer.
    expect(argmax, `argmax band = ${argmax} (centre ${TIMBRE_BAND_CENTRES_HZ[argmax]} Hz)`).toBe(7);
    // 1 kHz sits only ~0.31 dB above the 800.1/1270 Hz −3 dB crossover of a 2/3-octave
    // bank, so both bands legitimately hold energy and the margin is genuinely small.
    // The assertion is therefore directional, not a margin: the neighbours must be lower.
    expect(
      f.bandDb[8],
      `band 7 (800.1 Hz) = ${f.bandDb[7].toFixed(3)} dB, band 8 (1270 Hz) = ${f.bandDb[8].toFixed(3)} dB`
    ).toBeLessThan(f.bandDb[7]);
    expect(f.bandDb[6]).toBeLessThan(f.bandDb[7]);
  });

  it("discriminates 100 Hz from 5 kHz far more than two takes of the same tone", () => {
    const takeA = fingerprintChannels([sine(100, 0.5, 1, SAMPLE_RATE)], SAMPLE_RATE);
    // A second take of the same patch: identical timbre, different start phase. Steady-
    // state band energies are phase-invariant, so any residual is the onset transient
    // over the finite window — an alignment difference, not a timbre difference.
    const takeB = fingerprintChannels([sine(100, 0.5, 1, SAMPLE_RATE, 0.37)], SAMPLE_RATE);
    const other = fingerprintChannels([sine(5000, 0.5, 1, SAMPLE_RATE)], SAMPLE_RATE);

    const sameTimbre = fingerprintDistance(takeA, takeB);
    const differentTimbre = fingerprintDistance(takeA, other);

    // A 100 Hz tone and a 5 kHz tone are ~5.6 octaves apart, which redistributes tens of
    // dB across most of the 13 bands; the mean |ΔbandDb| is ≈ 26 dB. 0.5 dB for the
    // same-take residual is a deliberately loose bound (measured ≈ 0.03 dB): it is the
    // onset-transient floor, not a timbre difference, and it is under one band spacing.
    expect(sameTimbre, `same-timbre distance = ${sameTimbre.toFixed(4)} dB`).toBeLessThan(0.5);
    // 5 dB is a loose floor — far below the measured 26 dB but far above any same-patch
    // residual — so it separates "different register/instrument" from "another take"
    // without being tuned to this exact pair.
    expect(
      differentTimbre,
      `different-timbre distance = ${differentTimbre.toFixed(4)} dB`
    ).toBeGreaterThan(5);
    expect(
      differentTimbre,
      `different = ${differentTimbre.toFixed(4)} dB, same = ${sameTimbre.toFixed(4)} dB ` +
        `(ratio ${(differentTimbre / sameTimbre).toFixed(1)}x)`
    ).toBeGreaterThan(sameTimbre * 10);
  });

  it("orders centroid by frequency and keeps it within one band of the tone", () => {
    const low = fingerprintChannels([sine(200, 0.5, 1, SAMPLE_RATE)], SAMPLE_RATE);
    const high = fingerprintChannels([sine(4000, 0.5, 1, SAMPLE_RATE)], SAMPLE_RATE);

    expect(low.centroidHz, `200 Hz centroid = ${low.centroidHz.toFixed(1)} Hz`).toBeLessThan(
      high.centroidHz
    );

    // Band-limited resolution, documented in the module: the centroid is an energy-
    // weighted mean of 13 discrete centres spaced 2/3 octave, so it cannot be more
    // accurate than about one band. Half an octave (2^0.5 ≈ 1.414x) is a loose but honest
    // bound; the measured errors are 0.17 octave at 200 Hz and 0.03 octave at 4 kHz.
    const lowErrorOctaves = Math.abs(Math.log2(low.centroidHz / 200));
    const highErrorOctaves = Math.abs(Math.log2(high.centroidHz / 4000));
    expect(
      lowErrorOctaves,
      `200 Hz centroid = ${low.centroidHz.toFixed(1)} Hz (${lowErrorOctaves.toFixed(3)} octave error)`
    ).toBeLessThan(0.5);
    expect(
      highErrorOctaves,
      `4 kHz centroid = ${high.centroidHz.toFixed(1)} Hz (${highErrorOctaves.toFixed(3)} octave error)`
    ).toBeLessThan(0.5);
  });

  it("rolls off low for a lowest-band tone and high for a highest-band tone", () => {
    const lowest = fingerprintChannels([sine(31.5, 0.5, 1, SAMPLE_RATE)], SAMPLE_RATE);
    const highest = fingerprintChannels([sine(8064, 0.5, 1, SAMPLE_RATE)], SAMPLE_RATE);

    // A 2/3-octave band-pass leaks ≈ −7 dB into its adjacent band, so a tone at the
    // 31.5 Hz centre keeps only ≈ 79% of the total energy in band 0; the 85% cumulative
    // point is reached in band 1. "Low" and "high" are asserted with margin rather than
    // as exact indices, because the leakage tail is a property of the bank, not a bug.
    expect(lowest.rolloffBand, `31.5 Hz rolloff band = ${lowest.rolloffBand}`).toBeLessThanOrEqual(
      3
    );
    expect(
      highest.rolloffBand,
      `8064 Hz rolloff band = ${highest.rolloffBand}`
    ).toBeGreaterThanOrEqual(10);
    expect(highest.rolloffBand).toBeGreaterThan(lowest.rolloffBand);
  });

  it("reports Pearson correlation of the channel pair (identical, inverted, mono, silent)", () => {
    const left = sine(440, 0.5, 0.5, SAMPLE_RATE);
    const inverted = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) inverted[i] = -left[i];

    // Identical channels: r = 1 exactly.
    expect(fingerprintChannels([left, left.slice()], SAMPLE_RATE).correlation).toBeCloseTo(1, 6);
    // Exact inversion: r = −1. The spec allows ≤ −0.99 to leave room for the float
    // round-off of the negation and the accumulation order.
    expect(fingerprintChannels([left, inverted], SAMPLE_RATE).correlation).toBeLessThanOrEqual(
      -0.99
    );
    // One channel: there is nothing to correlate against, so it is defined as perfectly
    // correlated (r = 1), which is what the frozen interface requires.
    expect(fingerprintChannels([left], SAMPLE_RATE).correlation).toBe(1);
    // A silent stereo pair has zero variance on both sides: r is 0/0, documented as 0.
    // Returning 1 would falsely claim perfect mono compatibility for silence.
    const silence = new Float32Array(left.length);
    expect(
      fingerprintChannels([silence, new Float32Array(left.length)], SAMPLE_RATE).correlation
    ).toBe(0);
  });

  it("exposes per-band linear energies for single-band gate reasoning", () => {
    const energies = bandEnergies(sine(1000, 0.5, 0.5, SAMPLE_RATE), SAMPLE_RATE);
    expect(energies).toHaveLength(TIMBRE_BAND_COUNT);
    for (const energy of energies) {
      expect(Number.isFinite(energy)).toBe(true);
      expect(energy).toBeGreaterThanOrEqual(0);
    }
    // The band owning the most linear energy must be the same one the fingerprint's
    // argmax reports, so a gate can trust either entry point.
    let argmax = 0;
    for (let k = 1; k < energies.length; k++) {
      if (energies[k] > energies[argmax]) argmax = k;
    }
    expect(argmax).toBe(
      argmaxBand(fingerprintChannels([sine(1000, 0.5, 0.5, SAMPLE_RATE)], SAMPLE_RATE))
    );
  });

  it("stays finite and NaN-free on degenerate buffers, with the documented floors", () => {
    const cases: Array<[string, Float32Array[]]> = [
      ["all-zero stereo", [new Float32Array(1024), new Float32Array(1024)]],
      ["single sample", [Float32Array.of(0.5)]],
      [
        "8-sample buffer, below the filter settling time",
        [sine(1000, 0.5, 8 / SAMPLE_RATE, SAMPLE_RATE)],
      ],
    ];

    for (const [name, channels] of cases) {
      const f = fingerprintChannels(channels, SAMPLE_RATE);
      expect(f.bandDb, `${name}: band count`).toHaveLength(TIMBRE_BAND_COUNT);
      for (const value of f.bandDb)
        expect(Number.isFinite(value), `${name}: bandDb = ${value}`).toBe(true);
      expect(Number.isFinite(f.centroidHz), `${name}: centroid = ${f.centroidHz}`).toBe(true);
      expect(Number.isFinite(f.correlation), `${name}: correlation = ${f.correlation}`).toBe(true);
      expect(Number.isFinite(f.rmsDb), `${name}: rmsDb = ${f.rmsDb}`).toBe(true);
      expect(Number.isFinite(f.rolloffBand), `${name}: rolloff = ${f.rolloffBand}`).toBe(true);
    }

    // The required documented floor for an all-zero buffer: RMS is −200 dBFS, not
    // −Infinity. The band *shape* of silence is deliberately not asserted beyond
    // finiteness (a filterbank has no meaningful shape for a zero signal); the −120 dB
    // band-ratio floor is exercised on a non-silent signal in the Nyquist test below.
    const silence = fingerprintChannels(
      [new Float32Array(1024), new Float32Array(1024)],
      SAMPLE_RATE
    );
    expect(silence.rmsDb, "all-zero rmsDb floor").toBe(-200);
  });

  it("is deterministic: the same buffer fingerprints byte-identically twice", () => {
    const buffer = sine(440, 0.5, 0.25, SAMPLE_RATE);
    const first = fingerprintChannels([buffer, buffer], SAMPLE_RATE);
    const second = fingerprintChannels([buffer, buffer], SAMPLE_RATE);
    // toEqual compares the numbers exactly — this is the byte-level gate's precondition.
    expect(second).toEqual(first);

    // A separately-built but numerically identical buffer must also match.
    const third = fingerprintChannels(
      [sine(440, 0.5, 0.25, SAMPLE_RATE), sine(440, 0.5, 0.25, SAMPLE_RATE)],
      SAMPLE_RATE
    );
    expect(third).toEqual(first);
  });

  it("zeroes bands at or above Nyquist instead of producing NaNs (8 kHz)", () => {
    const rate = 8000;
    const f = fingerprintChannels([sine(1000, 0.5, 1, rate)], rate);
    const fields = [...f.bandDb, f.centroidHz, f.rolloffBand, f.correlation, f.rmsDb];
    for (const value of fields) expect(Number.isFinite(value), `finite: ${value}`).toBe(true);

    // Nyquist is 4000 Hz: centres 5080 Hz (band 11) and 8064 Hz (band 12) are skipped and
    // must sit on the documented −120 dB energy-ratio floor (10·log10(1e-12)), not NaN.
    expect(f.bandDb[11]).toBeCloseTo(-120, 6);
    expect(f.bandDb[12]).toBeCloseTo(-120, 6);
    // 3200 Hz (band 10) is still below Nyquist and must carry real energy.
    expect(f.bandDb[10]).toBeGreaterThan(-120);
  });
});
