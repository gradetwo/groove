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
/** Mirrors `GLUE_COMP_HOLD_MS`. */
const HOLD_MS = 200;
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
    this.samplesProcessed = 0;
    this.holdUntil = 0;
    this.reduction = 0;
    this.applySettings((options && options.processorOptions) || {});
    /**
     * ⭐ **Settings can be changed after construction, because a channel strip rebuilds its chain.**
     *
     * The bus asks for one setting at construction and never changes it, which is why `processorOptions` alone was
     * enough. A channel strip does not work that way: it rebuilds its insert chain whenever its parameters change
     * (`src/audio/ChannelStripDsp.ts`), so a compressor that could only be configured once would go stale the
     * first time anyone moved a knob. Assigning `onmessage` also starts the port, so no explicit `start()` call is
     * needed — and a node that is never sent a message behaves exactly as it did before.
     */
    this.port.onmessage = (event) => {
      if (event && event.data) this.applySettings(event.data);
    };
  }

  /**
   * **One definition of what a settings object means** — the constructor and every later message both land here.
   *
   * Written as a method rather than repeated in `onmessage` for the reason this file's header already gives about
   * staying in sync with `GlueCompressor.ts`: two copies of a curve are how the two drift apart.
   */
  applySettings(settings) {
    const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
    this.thresholdDb = finite(settings.thresholdDb, THRESHOLD_DB);
    this.kneeDb = Math.max(0, finite(settings.kneeDb, KNEE_DB));
    this.ratio = Math.max(1, finite(settings.ratio, RATIO));
    const attackSec = Math.max(0, finite(settings.attackSec, ATTACK_SEC));
    const releaseSec = Math.max(0, finite(settings.releaseSec, RELEASE_SEC));
    this.makeupGain = Math.pow(10, finite(settings.makeupDb, 0) / 20);
    // `sampleRate` is the worklet global scope's own rate, so a message that omits it keeps the context's rate.
    this.sampleRateHz = Math.max(1, finite(settings.sampleRate, sampleRate));
    this.attackCoefficient = attackSec <= 0 ? 1 : 1 - Math.exp(-1 / (attackSec * this.sampleRateHz));
    this.releaseCoefficient = releaseSec <= 0 ? 1 : 1 - Math.exp(-1 / (releaseSec * this.sampleRateHz));
    // Release hold, mirrors `GLUE_COMP_HOLD_MS` in `src/audio/GlueCompressor.ts`.
    this.holdSamples = Math.round((Math.max(0, finite(settings.holdMs, HOLD_MS)) / 1000) * this.sampleRateHz);
    /**
     * ⭐ **Gain-reduction reporting, off unless a caller asks for it.**
     *
     * A channel strip's meter reads the reduction, and it used to read it from the host node it no longer uses, so the
     * worklet has to be able to answer. The bus never asks: it is not a node with a meter, and a stage that posted a
     * message every process quantum for nobody would be paying for a reader that does not exist — so the field
     * defaults to **false**, and this is another way a node that is never sent a message behaves exactly as before.
     *
     * `lastReportedReductionDb` is what turns the report into an *edge* rather than a stream: see `process`.
     */
    this.reportReduction = settings.reportReduction === true;
    this.lastReportedReductionDb = undefined;
    /** dB the reported value must move by before another message is sent. 0.05 dB is below what a meter can show. */
    this.reductionReportStepDb = 0.05;
  }

  /**
   * Posts the current gain reduction, at most once per change of `reductionReportStepDb`.
   *
   * Change-gated on purpose. A per-quantum post is 344 messages a second of audio — tens of thousands across an
   * offline render — and every one of them would carry the same number through a quiet passage or a steady note. The
   * gate makes a silent strip cost nothing and a working one cost a few messages a second.
   *
   * The sign matches `DynamicsCompressorNode.reduction`: **≤ 0**, so a consumer that already understood the node's
   * meter does not have to learn a second convention.
   */
  reportReductionIfChanged() {
    const reductionDb = -this.reduction;
    if (this.lastReportedReductionDb !== undefined &&
        Math.abs(reductionDb - this.lastReportedReductionDb) < this.reductionReportStepDb) {
      return;
    }
    this.lastReportedReductionDb = reductionDb;
    this.port.postMessage({ type: "reduction", reductionDb });
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
      if (target >= this.reduction) {
        this.reduction += (target - this.reduction) * this.attackCoefficient;
        this.holdUntil = this.samplesProcessed + this.holdSamples;
      } else if (this.samplesProcessed >= this.holdUntil) {
        this.reduction += (target - this.reduction) * this.releaseCoefficient;
      }
      this.samplesProcessed += 1;
      const gain = this.makeupGain * Math.pow(10, -this.reduction / 20);

      for (let c = 0; c < output.length; c += 1) {
        const channel = output[c];
        if (!channel) continue;
        const input = programme[c];
        channel[i] = (input ? input[i] : 0) * gain;
      }
    }
    // Once per block, not once per frame: see `reportReductionIfChanged` for why this is edge-gated.
    if (this.reportReduction) this.reportReductionIfChanged();
    return true;
  }
}

registerProcessor("groove-glue-compressor-processor", GlueCompressorProcessor);
