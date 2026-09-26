/**
 * Find a click the way an ear does: in the **envelope**, not in the samples.
 *
 * The lesson this script exists for: two rounds of A/Bs were run against a "largest sample-to-sample step" metric that
 * could not answer the question, because a bright waveform whose voices line up has large sample steps *musically* — the
 * metric flagged interference as a defect (see `docs/SYNTH_UPSTREAM_PLAN.md`).
 *
 * A click is not a large sample step. It is a **discontinuity in the amplitude envelope**: the signal's own short-term
 * level jumps at a rate the sound has no business jumping at. So this measures the envelope with a 1 ms RMS window and
 * looks at how fast it moves, reporting the outliers against the sound's own distribution (a ratio, never an absolute
 * bound, for the same reason).
 *
 * It also runs the same measurement on a **high-passed** copy of the signal. That second view is what catches the other
 * kind of click: a broadband transient from a phase or pitch jump does not move the overall envelope much (the tone
 * dominates it) but it lights up the top octave, where these voices have almost no steady-state energy.
 *
 * Usage:
 *   node scripts/probe_click_envelope.mjs file.wav [more.wav …]
 *   node scripts/probe_click_envelope.mjs --window=0.5 a.wav        # a finer envelope, for tight material
 *   node scripts/probe_click_envelope.mjs --highpass=6000 a.wav     # where the transient view starts
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const files = args.filter((a) => !a.startsWith("--"));
const windowMs = Number(value("window", "1")) || 1;
const highpassHz = Number(value("highpass", "6000")) || 6000;

/**
 * A one-pole high-pass, run twice, as a cheap "top octave" view.
 *
 * Two passes rather than a designed filter because the question is only "did something broadband happen here"; the exact
 * response does not matter as long as steady tone is taken out and transients survive.
 */
function highPassed(samples, rate, cutoff) {
  const out = new Float32Array(samples.length);
  const alpha = 1 / (1 + (2 * Math.PI * cutoff) / rate);
  let previousIn = 0;
  let previousOut = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    previousIn = 0;
    previousOut = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const input = pass === 0 ? samples[i] : out[i];
      const value = alpha * (previousOut + input - previousIn);
      out[i] = value;
      previousIn = input;
      previousOut = value;
    }
  }
  return out;
}

/** Read a 16- or 24-bit PCM WAV into mono floats, with its rate. */
function readWav(file) {
  const buffer = fs.readFileSync(file);
  const channels = buffer.readUInt16LE(22);
  const rate = buffer.readUInt32LE(24);
  const bits = buffer.readUInt16LE(34);
  let offset = 12;
  while (offset < buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") {
      const bytesPerSample = bits / 8;
      const frames = size / bytesPerSample / channels;
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) {
        const at = offset + 8 + i * channels * bytesPerSample;
        if (bits === 16) out[i] = buffer.readInt16LE(at) / 32768;
        else if (bits === 24) {
          const raw = buffer.readUInt8(at) | (buffer.readUInt8(at + 1) << 8) | (buffer.readInt8(at + 2) << 16);
          out[i] = raw / 8388608;
        } else out[i] = buffer.readInt32LE(at) / 2147483648;
      }
      return { rate, samples: out };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}

/** Short-term RMS, one value per window. */
function envelope(samples, windowSamples) {
  const out = [];
  for (let start = 0; start + windowSamples <= samples.length; start += windowSamples) {
    let sum = 0;
    for (let i = start; i < start + windowSamples; i += 1) sum += samples[i] * samples[i];
    out.push(Math.sqrt(sum / windowSamples));
  }
  return out;
}

const percentile = (sorted, fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];

for (const file of files) {
  const { rate, samples } = readWav(file);
  const windowSamples = Math.max(1, Math.round((windowMs / 1000) * rate));
  const report = (label, signal) => {
  const env = envelope(signal, windowSamples);
  // How fast the envelope moves, per window: the "level slope" of the sound.
  const slopes = [];
  for (let i = 1; i < env.length; i += 1) slopes.push(Math.abs(env[i] - env[i - 1]));
  const sorted = [...slopes].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p999 = percentile(sorted, 0.999);
  const worst = sorted[sorted.length - 1] ?? 0;
  let at = 0;
  let best = -1;
  for (let i = 0; i < slopes.length; i += 1) {
    if (slopes[i] > best) {
      best = slopes[i];
      at = i;
    }
  }
  // The same outliers, listed: a single spike is a click; many are just a percussive sound.
  const threshold = Math.max(p999 * 1.5, p50 * 12);
  const spikes = slopes
    .map((slope, i) => ({ slope, time: ((i + 1) * windowSamples) / rate }))
    .filter((entry) => entry.slope > threshold)
    .sort((a, b) => b.slope - a.slope)
    .slice(0, 6);
  const db = (v) => (v <= 1e-9 ? -120 : 20 * Math.log10(v));
  console.log(
    `${file}${label}\n  ${(samples.length / rate).toFixed(2)}s  window ${windowMs}ms  ` +
      `envelope slope: median ${p50.toFixed(5)}  p99.9 ${p999.toFixed(5)}  worst ${worst.toFixed(5)} ` +
      `(${(worst / Math.max(p999, 1e-9)).toFixed(2)}x p99.9) at ${(at * windowSamples / rate).toFixed(3)}s`
  );
  if (spikes.length) {
    console.log(
      `  envelope jumps: ${spikes
        .map((s) => `${s.time.toFixed(3)}s ${(s.slope / Math.max(p50, 1e-9)).toFixed(1)}x median (−${db(s.slope)} dB/ms)`)
        .join("  ")}`
    );
  } else {
    console.log("  envelope jumps: none beyond the sound's own texture");
  }
  };
  report("", samples);
  report(`  [high-passed above ${highpassHz} Hz — the transient view]`, highPassed(samples, rate, highpassHz));
}
