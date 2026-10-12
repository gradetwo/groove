/**
 * Compare a captured GS-1 event with the rendered file — which side of the boundary is the step on?
 *
 * `node scripts/render_genre_wav.mjs … --capture-events --captures-out=…` gives the **core's own** samples around each
 * scheduled event (the worklet posts them from inside the audio callback). This reads that JSON beside the WAV it produced and
 * reports, for each event, the step at the boundary in the capture and the step at the same frame in the file:
 *
 * * equal, and both the signal's own slope → the discontinuity is added **downstream** of the core;
 * * equal, and both a step → the core wrote it, and the Rust suite's cases are missing a configuration;
 * * the file's is an outlier and the capture's is not → the same conclusion as the first, but with the number to prove it.
 *
 * Usage:
 *   node scripts/compare_event_capture.mjs --captures=/tmp/uk_caps.json --wav=/tmp/uk_cap.wav [--events=all|off|on]
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const capturesPath = value("captures", "");
const wavPath = value("wav", "");
const which = value("events", "all");

if (!capturesPath || !wavPath || !fs.existsSync(capturesPath) || !fs.existsSync(wavPath)) {
  console.error("usage: node scripts/compare_event_capture.mjs --captures=<json> --wav=<wav> [--events=all|off|on]");
  process.exit(1);
}

/** Read a 16-bit PCM WAV into per-channel float arrays. */
function readWav(file) {
  const buffer = fs.readFileSync(file);
  const channels = buffer.readUInt16LE(22);
  const rate = buffer.readUInt32LE(24);
  let offset = 12;
  while (offset < buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") {
      const frames = size / 2 / channels;
      const out = Array.from({ length: channels }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i += 1) {
        for (let c = 0; c < channels; c += 1) {
          out[c][i] = buffer.readInt16LE(offset + 8 + (i * channels + c) * 2) / 32768;
        }
      }
      return { rate, channels: out };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${file}: no data chunk`);
}

const { rate, channels } = readWav(wavPath);
const all = JSON.parse(fs.readFileSync(capturesPath, "utf8"));
const events = all.filter((e) => (which === "all" ? true : which === "off" ? e.off : !e.off));

/**
 * The worklet reports the event's frame in the context's clock, and a frame-addressed note's first **audible** sample lands one
 * render quantum later (see the processor's own comment), so the file index of the boundary is the event's frame.
 */
const stepAt = (samples, index, span) => {
  let worst = 0;
  for (let i = Math.max(1, index - span); i < Math.min(samples.length, index + span); i += 1) {
    worst = Math.max(worst, Math.abs(samples[i] - samples[i - 1]));
  }
  return worst;
};

/** The signal's own typical step, so an outlier can be told from a waveform. */
const percentileStep = (samples, fraction) => {
  const steps = [];
  for (let i = 1; i < samples.length; i += 1) steps.push(Math.abs(samples[i] - samples[i - 1]));
  steps.sort((a, b) => a - b);
  return steps[Math.min(steps.length - 1, Math.floor(steps.length * fraction))] ?? 0;
};

const p999Left = percentileStep(channels[0], 0.999);
const p999Right = channels[1] ? percentileStep(channels[1], 0.999) : null;
console.log(
  `${wavPath}: ${events.length} event(s) (${which}) · file p99.9 step left ${p999Left.toExponential(2)}` +
    `${p999Right === null ? "" : ` right ${p999Right.toExponential(2)}`}\n`
);

const boundaryStep = (before, after) =>
  before.length && after.length ? Math.abs(after[0] - before[before.length - 1]) : Number.NaN;

/**
 * The **whole window** each capture carries, not just the boundary sample.
 *
 * The first version compared the eight samples at the event, which established that the core's output is continuous *at* a
 * note-off. The symptom Groove measured sits 13-15 ms **after** it, so the window is now 2048 frames and this finds the largest
 * step in it — and the same step in the rendered file at the same frames. Where they disagree, the discontinuity was introduced
 * between the core's buffer and the file; where the capture carries it too, the core wrote it.
 */
const largestStep = (samples) => {
  let worst = 0;
  let at = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const step = Math.abs(samples[i] - samples[i - 1]);
    if (step > worst) {
      worst = step;
      at = i;
    }
  }
  return { worst, at };
};

for (const event of events) {
  const at = Math.round(event.frame);
  const after = event.after ?? [];
  const captureStep = boundaryStep(event.before ?? [], after);
  const fileLeft = stepAt(channels[0], at, 2);
  const fileRight = channels[1] ? stepAt(channels[1], at, 2) : null;
  const verdict = (fileStep, p999) =>
    p999 && fileStep > p999 * 3 ? `STEP (${(fileStep / p999).toFixed(1)}x p99.9)` : `slope (${(fileStep / (p999 || 1)).toFixed(2)}x)`;
  const inWindow = after.length > 1 ? largestStep(after) : null;
  const inFile = largestStep(Array.from(channels[0].slice(at, at + Math.max(1, after.length))));
  const ms = (offset) => `${((offset / rate) * 1000).toFixed(1)}ms`;
  console.log(
    `${event.off ? "off" : "on "} note ${String(event.note).padStart(3)} frame ${String(at).padStart(7)}  ` +
      `capture@event ${captureStep.toExponential(2)}  file L ${fileLeft.toExponential(2)} ${verdict(fileLeft, p999Left)}` +
      `${fileRight === null ? "" : `  R ${fileRight.toExponential(2)}`}` +
      (inWindow && after.length === inFile ? "" : "")
  );
  if (inWindow) {
    console.log(
      `      window ${after.length} frames · largest step — core ${inWindow.worst.toExponential(2)} at ${ms(inWindow.at)}` +
        ` · file ${inFile.worst.toExponential(2)} at ${ms(inFile.at)}` +
        (inFile.worst > inWindow.worst * 3 ? "   ← the file has a step the core does not" : "")
    );
  }
}
