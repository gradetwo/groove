/**
 * Onset probe processor — measurement support for experiment E7 (P6 Phase 2).
 *
 * ## Why this exists
 *
 * The vendored GS-1 worklet can only be told "play this note **now**" (its inbound note
 * messages carry no time — see `AUDIO_QUALITY_AND_SYNTH_PLAN.md` §5.9). Before deciding whether
 * that is usable in a step sequencer, the *actual* error between "the host asked for a note" and
 * "the note became audible" has to be a measured number, not an argument. Main-thread polling
 * cannot measure it: `requestAnimationFrame` quantises to ~16 ms, which is the order of the
 * effect being measured.
 *
 * This processor runs on the audio rendering thread, where `currentFrame` is an exact sample
 * counter, so an onset timestamp is sample-accurate.
 *
 * ## Protocol
 *
 *   main → probe  { type: "arm" }        start looking for an onset; clears any previous result
 *   main → probe  { type: "disarm" }     stop looking (and ignore anything already in flight)
 *   probe → main  { type: "onset", frame, rms }   first block whose peak crosses `threshold`
 *
 * `frame` is the index of the *first sample of the block* in which the threshold was crossed, so
 * the timestamp is accurate to one block (128 frames ≈ 2.9 ms at 44.1 kHz) and is never
 * optimistic. That resolution is coarser than the note-to-note differences a sequencer cares
 * about in aggregate, and it is stated here rather than hidden: E7 measures jitter of the order
 * of milliseconds, so a ±1 block bound is material and must travel with the number.
 *
 * The probe is deliberately dumb: it does not know about notes, only about "signal appeared".
 * The caller arms it before firing a single note into silence.
 */

const DEFAULT_THRESHOLD = 0.01;
/** Consecutive samples above the threshold before an onset is declared, to ignore clicks. */
const ONSET_CONFIRM_SAMPLES = 2;

class Gs1OnsetProbeProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_THRESHOLD;
    this.armed = false;
    this.above = 0;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "arm") {
        this.armed = true;
        this.above = 0;
      } else if (data.type === "disarm") {
        this.armed = false;
        this.above = 0;
      } else if (data.type === "threshold" && Number.isFinite(data.value)) {
        this.threshold = data.value;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    // Pass-through so the probe can sit inline in a signal path.
    if (input && output) {
      for (let c = 0; c < output.length; c++) {
        const src = input[c] || input[0];
        if (src && output[c]) output[c].set(src);
      }
    }
    if (!this.armed) return true;

    const channel = (input && (input[0] || input[1])) || null;
    if (!channel || channel.length === 0) return true;

    let peak = 0;
    let sum = 0;
    let crossing = -1;
    for (let i = 0; i < channel.length; i++) {
      const v = channel[i];
      const a = v < 0 ? -v : v;
      sum += v * v;
      if (a > peak) peak = a;
      if (a >= this.threshold) {
        this.above += 1;
        if (this.above >= ONSET_CONFIRM_SAMPLES && crossing === -1) crossing = i;
      } else {
        this.above = 0;
      }
    }

    if (crossing !== -1) {
      this.armed = false;
      // `currentFrame` counts the frames rendered before this block; adding the in-block index
      // gives the absolute sample position of the crossing.
      this.port.postMessage({
        type: "onset",
        frame: currentFrame - channel.length + crossing,
        blockStartFrame: currentFrame - channel.length,
        peak,
        rms: Math.sqrt(sum / channel.length),
        threshold: this.threshold,
      });
    }
    return true;
  }
}

registerProcessor("gs1-onset-probe", Gs1OnsetProbeProcessor);
