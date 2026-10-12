/**
 * A stereo-spread stage for the sustained lanes — the width the near-mono claim actually needs.
 *
 * ## Why it exists, and why not the two obvious alternatives
 *
 * `narrowStereo` reads genres whose channel correlation is above 0.98, and the audio review's diagnosis was blunt:
 * the pans in this library are already past the range it recommends (chords −0.36, lead +0.6), so the image has to
 * come from *processing* — "stereo detune, chorus, stereo delay" — not from pushing mono sources further apart.
 * Two cheaper routes were then measured and both failed for a stated reason (see the plan):
 *
 *   · panning the sustained roles works numerically (0.9809 → 0.9766) and tears the mix apart by ear;
 *   · GS-1's unison + spread does nothing for the image, because the core's `spread` is a **detune** spread and its
 *     unison sub-voices are summed into one mono buffer — unison thickens a voice, it cannot widen one.
 *
 * ## What it does
 *
 * The classic chorus-widener: a **mono-safe** wet path of two short delays whose times are modulated by one LFO in
 * **opposite directions**, each feeding one channel. Opposite directions hold the *sum* of the two delay times
 * constant, so the stage does not wander in time — it only decorrelates the two sides, which is exactly the quantity
 * the claim measures. The dry signal stays untouched and centred, so the mono sum of the lane keeps its punch and
 * only the wet tail moves.
 *
 * ## Determinism
 *
 * The LFO starts at time 0 on the context's own clock, so an `OfflineAudioContext` render reproduces the same
 * modulation every time — which the loudness and timbre baselines depend on. Nothing here reads a wall clock or a
 * random source.
 */
import { STEREO_WIDTH_MAX_DELAY_SEC } from "../data/trackInsert";

/** The delay both sides start from, before modulation. Short enough to read as width, not as an echo. */
export const STEREO_WIDTH_BASE_DELAY_SEC = 0.011;
/** Peak modulation depth at full amount. Held below the base delay so neither side's time can go negative. */
export const STEREO_WIDTH_MAX_DEPTH_SEC = 0.0045;
/** LFO rate. Slow: a fast chorus on a pad sounds like a detune effect rather than a wider image. */
export const STEREO_WIDTH_LFO_HZ = 0.31;

export class StereoWidth {
  /** The stage's input; the strip connects its last stage here. */
  readonly input: GainNode;
  /** The stage's output; the strip connects this to `output`. */
  readonly output: GainNode;

  private readonly ctx: BaseAudioContext;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly left: DelayNode;
  private readonly right: DelayNode;
  private readonly depthLeft: GainNode;
  private readonly depthRight: GainNode;
  private readonly lfo: OscillatorNode;
  private amount = 0;
  private disposed = false;

  constructor(ctx: BaseAudioContext, amount = 0) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.left = ctx.createDelay(STEREO_WIDTH_MAX_DELAY_SEC);
    this.right = ctx.createDelay(STEREO_WIDTH_MAX_DELAY_SEC);
    this.depthLeft = ctx.createGain();
    this.depthRight = ctx.createGain();
    this.lfo = ctx.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = STEREO_WIDTH_LFO_HZ;

    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);

    // Dry stays centred and untouched; only the two wet sides move.
    this.input.connect(this.dry);
    this.dry.connect(this.output);

    this.input.connect(splitter);
    splitter.connect(this.left, 0);
    splitter.connect(this.right, 1);
    this.left.connect(merger, 0, 0);
    this.right.connect(merger, 0, 1);
    merger.connect(this.wet);
    this.wet.connect(this.output);

    // One LFO, two opposite depths: the sum of the delay times stays constant while the difference breathes.
    this.lfo.connect(this.depthLeft);
    this.lfo.connect(this.depthRight);
    this.depthLeft.connect(this.left.delayTime);
    this.depthRight.connect(this.right.delayTime);

    this.left.delayTime.setValueAtTime(STEREO_WIDTH_BASE_DELAY_SEC, ctx.currentTime);
    this.right.delayTime.setValueAtTime(STEREO_WIDTH_BASE_DELAY_SEC, ctx.currentTime);
    this.lfo.start(0);

    this.setAmount(amount);
  }

  /**
   * Wet amount, 0..1.
   *
   * The depth scales too, so a small amount is a small *movement* rather than a quiet version of a large one. Held
   * at or below 0.35 in practice: the wet path is decorrelated, so summed to mono it partly cancels, and the
   * `sideTooHot` claim is the guard on the other side of the same trade.
   */
  setAmount(amount: number): void {
    if (this.disposed) return;
    const clamped = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
    this.amount = clamped;
    const at = this.ctx.currentTime;
    this.wet.gain.setValueAtTime(clamped, at);
    this.dry.gain.setValueAtTime(1, at);
    const depth = STEREO_WIDTH_MAX_DEPTH_SEC * clamped;
    this.depthLeft.gain.setValueAtTime(depth, at);
    this.depthRight.gain.setValueAtTime(-depth, at);
  }

  getAmount(): number {
    return this.amount;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.lfo.stop(0);
    } catch {
      /* never started, or already stopped */
    }
    for (const node of [
      this.input,
      this.output,
      this.dry,
      this.wet,
      this.left,
      this.right,
      this.depthLeft,
      this.depthRight,
      this.lfo,
    ] as AudioNode[]) {
      try {
        node.disconnect();
      } catch {
        /* already torn down */
      }
    }
  }
}
