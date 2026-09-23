/**
 * Glue compressor — AudioWorklet processor (A2).
 *
 * This file is served verbatim from `public/` and loaded by `src/audio/masterGraph.ts` through
 * `audioWorklet.addModule("/glueCompressorWorklet.js")`. A worklet module cannot import from `src/**`
 * (TypeScript is not served to the audio thread, and `public/` assets are not bundled), so the DSP below is a
 * deliberate, line-for-line mirror of `GlueCompressorKernel` in `src/audio/GlueCompressor.ts`.
 * `src/test/glueCompressorWorklet.test.ts` evaluates this exact file and asserts the two are sample-identical, so
 * the duplication cannot silently drift.
 *
 * **Why a worklet at all.** The bus compressor used to be a `DynamicsCompressorNode`, whose detector necessarily
 * sees the programme it compresses. The sidechain duck is part of that programme, so the compressor read the duck as
 * "less music", eased off and handed the dip back: measured on disco, the *median* onset's dip goes from −4.37 dB
 * (mechanism) to **0 dB** (through the node), while the ceiling leaves it untouched. No setting explains it and no
 * lane-side depth pays for it (a ×3 duck moved the file's median only to −0.35 dB).
 *
 * So this processor takes **two inputs**:
 *
 *   input 0  the programme, duck and all — what gets scaled
 *   input 1  a pre-duck copy of the same bus — what the gain follows
 *
 * The gain computer, the soft knee and the ballistics are the stage's existing ones, so the glue is unchanged; what
 * changes is that a deliberate dip is no longer mistaken for a quiet passage. Input 1 is optional: with nothing
 * connected the programme detects itself, which is exactly the behaviour of the node it replaces.
 *
 * Keep the two in sync: same soft-knee curve, same attack/release one-poles, same operation order.
 */

const THRESHOLD_DB = -16;
const KNEE_DB = 8;
const RATIO = 2;
const ATTACK_SEC = 0.03;
const RELEASE_SEC = 0.22;

/** The static gain computer — the same quadratic knee as `glueCompressorReductionDb`. */
function reductionDb(levelDb, thresholdDb, kneeDb, ratio) {
  const over = levelDb - thresholdDb;
  if (over <= -kneeDb / 2) return 0;
  const slope = 1 - 1 / ratio;
  if (over >= kneeDb / 2 || kneeDb === 0) return over * slope;
  const x = over + kneeDb / 2;
  return (slope * x * x) / (2 * kneeDb);
}

class GlueCompressorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const settings = (options && options.processorOptions) || {};
    const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
    this.thresholdDb = finite(settings.thresholdDb, THRESHOLD_DB);
    this.kneeDb = Math.max(0, finite(settings.kneeDb, KNEE_DB));
    this.ratio = Math.max(1, finite(settings.ratio, RATIO));
    const attackSec = Math.max(0, finite(settings.attackSec, ATTACK_SEC));
    const releaseSec = Math.max(0, finite(settings.releaseSec, RELEASE_SEC));
    this.makeupGain = Math.pow(10, finite(settings.makeupDb, 0) / 20);
    this.sampleRateHz = Math.max(1, finite(settings.sampleRate, sampleRate));
    this.attackCoefficient = attackSec <= 0 ? 1 : 1 - Math.exp(-1 / (attackSec * this.sampleRateHz));
    this.releaseCoefficient = releaseSec <= 0 ? 1 : 1 - Math.exp(-1 / (releaseSec * this.sampleRateHz));
    this.reduction = 0;
  }

  process(inputs, outputs) {
    const programme = inputs[0] || [];
    const detector = inputs[1] && inputs[1].length ? inputs[1] : null;
    const output = outputs[0] || [];
    const frames = output[0] ? output[0].length : 0;
    if (!programme.length || !frames) return true;

    for (let i = 0; i < frames; i += 1) {
      // The detector is a maximum across its channels, and falls back to the programme when nothing is connected.
      let observed = 0;
      const source = detector || programme;
      for (let c = 0; c < source.length; c += 1) {
        const channel = source[c];
        if (!channel) continue;
        const value = channel[i] < 0 ? -channel[i] : channel[i];
        if (value > observed) observed = value;
      }
      const levelDb = 20 * Math.log10(observed > 1e-9 ? observed : 1e-9);
      const target = reductionDb(levelDb, this.thresholdDb, this.kneeDb, this.ratio);
      const coefficient = target > this.reduction ? this.attackCoefficient : this.releaseCoefficient;
      this.reduction += (target - this.reduction) * coefficient;
      const gain = this.makeupGain * Math.pow(10, -this.reduction / 20);

      for (let c = 0; c < output.length; c += 1) {
        const channel = output[c];
        if (!channel) continue;
        const input = programme[c];
        channel[i] = (input ? input[i] : 0) * gain;
      }
    }
    return true;
  }
}

registerProcessor("groove-glue-compressor-processor", GlueCompressorProcessor);
