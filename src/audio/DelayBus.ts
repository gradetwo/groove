/**
 * Parameterised delay send bus.
 *
 * ## Why this file exists
 *
 * The live engine's delay send used to be a handful of hard-coded lines: one `DelayNode`
 * capped at one second and pinned to 250 ms, a bare feedback gain with no filter, and a
 * fixed 0.25 return with no setter. Measured against the genre library that produced
 * three audible problems:
 *
 * 1. 250 ms is not a musical division at almost any tempo in the library, and the 1 s node
 *    cap made "dotted eighth" and long dub delays impossible.
 * 2. The feedback loop contained no filter, so every repeat stayed full bandwidth and got
 *    harsher rather than darker. Dub's signature is repeats that *darken*; that needs a
 *    low-pass inside the loop.
 * 3. There was no stereo behaviour and no setter, so per-genre effect defaults could not
 *    reach the time, feedback or return level.
 *
 * ## Topology
 *
 * `input` and `output` are created once and never replaced: the caller wires
 * `sendB -> input` and `output -> masterGain` a single time and then only calls
 * `setParams`. `pingPong` is the one parameter that changes the routing, so toggling it
 * rebuilds the internal nodes behind those two stable endpoints — and the build it replaces is
 * **cross-faded out rather than disconnected** (M4): cutting it dead truncated the ringing tail,
 * which is audible as a click on every genre change into or out of the dub lineage.
 *
 * Centred (the default), stereo preserved end to end:
 * ```
 *   input -> pre -> delay -> damp(lowpass) -> fb -> delay     (damped feedback loop)
 *                     └───> gen -> wetSum -> output (returnLevel)
 * ```
 * A single `DelayNode` carries the whole (mono or stereo) send and the summing `GainNode`
 * preserves its channel count, so nothing here is ever fed into a mono
 * `ChannelMergerNode` input.
 *
 * Ping-pong, two mono lines cross-fed:
 * ```
 *   input -> pre -> splitter ─0─> sumL -> delayL -> dampL -> fbL ─> sumR
 *                            ─1─> sumR -> delayR -> dampR -> fbR ─> sumL
 *   delayL ─> merger[0], delayR ─> merger[1] -> gen -> wetSum -> output
 * ```
 * `gen` is each build's own output gain. It is what makes the handover possible: a rebuild fades
 * its predecessor's `gen` out and its own in, so a replaced build keeps ringing through its own
 * delay line (the send to it stops, its contents do not vanish) while the new build warms up.
 * The splitter turns the send into two one-channel lines *before* anything reaches the
 * merger, so the merger's mono inputs only ever receive mono delay-line outputs. That is
 * the mono-merger down-mix hazard handled explicitly: a multi-channel signal is never
 * connected to a merger input, and each channel is split out losslessly first.
 *
 * Everything is deterministic: no `Math.random`, no timers, no wall clock. Only
 * `BaseAudioContext` APIs are used, so an `OfflineAudioContext` builds the identical graph.
 */

export interface DelayParams {
  /** Whether the return is audible at all. When false the wet path is silenced. */
  enabled: boolean;
  /** Delay time in seconds. */
  timeSeconds: number;
  /** Feedback amount 0..0.9. Values above ~0.9 runaway; clamp. */
  feedback: number;
  /** Low-pass cutoff inside the feedback loop, Hz. Lower = each repeat darkens faster. */
  dampHz: number;
  /** Alternate the repeats between channels. */
  pingPong: boolean;
  /** Return level 0..1 (the old code hard-coded 0.25 and had no setter). */
  returnLevel: number;
}

/**
 * Shortest delay the bus will produce. Below this the loop is a comb filter rather than a
 * musical echo, and Web Audio's `delayTime` interpolation gets audibly granular.
 */
export const DELAY_TIME_MIN_SEC: number = 0.02;
/**
 * Longest delay the bus will produce. Dub wants whole-note repeats: at 60 BPM a bar is
 * 4 s, which this covers. Every `DelayNode` is allocated for this bound, not for the
 * current value, so retiming never rebuilds the graph.
 */
export const DELAY_TIME_MAX_SEC: number = 4;
/**
 * Feedback ceiling. At 1.0 the loop gain reaches unity (the low-pass only attenuates) and
 * the delay never decays; 0.9 leaves a clear margin below divergence.
 */
export const DELAY_FEEDBACK_MAX: number = 0.9;

/** Lowest damping cutoff accepted; below this the loop is bass-starved. */
const DAMP_MIN_HZ = 40;
/** Highest damping cutoff accepted; above this "damping" is inaudible anyway. */
const DAMP_MAX_HZ = 18000;
/** Butterworth Q for the in-loop low-pass, so the response is well defined and flat. */
const DAMP_Q = Math.SQRT1_2;
/** Click-free ramp for return-level changes. */
const RETURN_RAMP_SEC = 0.02;
/** Shortest click-free ramp for a delay-time change (a step would click). */
const DELAY_TIME_RAMP_SEC = 0.02;
/**
 * Q11: time constant for smoothing the feedback gain and the in-loop damping cutoff. Well below
 * the audible threshold for a parameter move but long enough that a tempo change is a glide
 * rather than a step.
 */
const DELAY_PARAM_SMOOTH_SEC = 0.012;
/** Fallback tempo when a caller hands over a non-finite BPM. */
const FALLBACK_BPM = 120;
const BPM_MIN = 1;
const BPM_MAX = 1000;

/**
 * M4: the cross-fade window after a ping-pong toggle, and why it is tied to the delay time.
 *
 * Changing the routing means the old build has nowhere to go, and the old code disconnected it on
 * the spot — the tail of every repeat that was still ringing vanished in one sample, which is a
 * click. Here the replaced build keeps its nodes and is faded out while the new one fades in, so the
 * tail hands over instead of stopping.
 *
 * The new build's delay line starts empty, so its first repeat arrives one delay time after the
 * toggle: that is the gap the outgoing tail has to cover. A fixed window cannot cover it — 250 ms
 * covers a 1/8 at 120 BPM but leaves a hole at a 1/4 at 60 BPM — so the window follows the delay
 * time between a floor and a ceiling:
 *
 *  - **Floor 250 ms**: long enough to be click-free (the parameter ramps elsewhere in this file are
 *    12–20 ms), and it equals one 1/8 at 120 BPM, the most common echo in the library.
 *  - **Ceiling 500 ms**: beyond that the switch stops feeling immediate — the old image would still
 *    be at full level a second later — and a longer delay means sparser echoes, where a tail that
 *    ends between two repeats is inaudible anyway.
 */
const CROSSFADE_MIN_SEC = 0.25;
const CROSSFADE_MAX_SEC = 0.5;

/** The cross-fade window for a rebuild at this delay time. Pure, so the bound is testable. */
export function delayCrossfadeSeconds(timeSeconds: number): number {
  return Math.min(CROSSFADE_MAX_SEC, Math.max(CROSSFADE_MIN_SEC, clampDelayTime(timeSeconds)));
}

export const DEFAULT_DELAY_PARAMS: DelayParams = {
  enabled: true,
  timeSeconds: 0.25,
  feedback: 0.32,
  dampHz: 3200,
  pingPong: false,
  returnLevel: 0.25,
};

/** Musical divisions, so a genre can say "dotted eighth" instead of a raw time. */
export type DelayDivision = "1/4" | "1/8d" | "1/8t" | "1/8" | "1/16" | "1/16d";

/**
 * Each division as a fraction of a quarter note (one beat). Keeping the table in beats
 * (rather than seconds) is what makes the dotted/triplet ratios exact by construction:
 * a dotted eighth is 0.75 beats = 1.5 x 0.5, a triplet eighth is 1/3 beat = 2/3 x 0.5.
 */
const DIVISION_BEATS: Record<DelayDivision, number> = {
  "1/4": 1,
  "1/8d": 0.75,
  "1/8t": 1 / 3,
  "1/8": 0.5,
  "1/16": 0.25,
  "1/16d": 0.375,
};

/**
 * Converts a division to seconds at a tempo in BPM.
 *
 * `bpm` must be the *playing* tempo. 87 of the 159 genres in this library have a
 * `sequencer_pattern.bpm` that differs from their top-level `default_bpm`, so callers
 * that reach for the static default get an audibly wrong echo time.
 */
export function delayDivisionSeconds(division: DelayDivision, bpm: number): number {
  const beats = DIVISION_BEATS[division] ?? DIVISION_BEATS["1/4"];
  const safeBpm = Number.isFinite(bpm) ? Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)) : FALLBACK_BPM;
  return (60 / safeBpm) * beats;
}

function clampDelayTime(value: number): number {
  if (!Number.isFinite(value)) {
    // +Infinity pins to the top of the range; NaN and -Infinity pin to the bottom. Both
    // stay inside the declared bounds, which is the contract callers rely on.
    return value === Infinity ? DELAY_TIME_MAX_SEC : DELAY_TIME_MIN_SEC;
  }
  return Math.min(DELAY_TIME_MAX_SEC, Math.max(DELAY_TIME_MIN_SEC, value));
}

function clampFeedback(value: number): number {
  if (!Number.isFinite(value)) return value === Infinity ? DELAY_FEEDBACK_MAX : 0;
  return Math.min(DELAY_FEEDBACK_MAX, Math.max(0, value));
}

function clampDampHz(value: number, sampleRate: number): number {
  const nyquist = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate * 0.49 : DAMP_MAX_HZ;
  const max = Math.min(DAMP_MAX_HZ, nyquist);
  const min = Math.min(DAMP_MIN_HZ, max);
  const finite = Number.isFinite(value) ? value : DEFAULT_DELAY_PARAMS.dampHz;
  return Math.min(max, Math.max(min, finite));
}

function clampReturnLevel(value: number): number {
  if (!Number.isFinite(value)) return value === Infinity ? 1 : 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeParams(
  patch: Partial<DelayParams>,
  base: DelayParams,
  sampleRate: number
): DelayParams {
  const pick = <K extends keyof DelayParams>(key: K): DelayParams[K] =>
    patch[key] !== undefined ? (patch[key] as DelayParams[K]) : base[key];
  return {
    enabled: Boolean(pick("enabled")),
    timeSeconds: clampDelayTime(pick("timeSeconds")),
    feedback: clampFeedback(pick("feedback")),
    dampHz: clampDampHz(pick("dampHz"), sampleRate),
    pingPong: Boolean(pick("pingPong")),
    returnLevel: clampReturnLevel(pick("returnLevel")),
  };
}

export class DelayBus {
  /** Send destination: every track's `sendB` connects here. */
  readonly input: GainNode;
  /** Return: connect this into the master sum. */
  readonly output: GainNode;

  private readonly _ctx: BaseAudioContext;
  /** Persistent input stage; the per-build graph hangs off this so `input` never moves. */
  private readonly _pre: GainNode;
  /** Persistent wet summing node; the per-build graph always drains into this. */
  private readonly _wetSum: GainNode;
  /** Nodes belonging to the current build; handed to `_retiring` (not disconnected) on a rebuild.
   *  The build's own output gain is *not* in here — it is `_genGain`, and a retired build lists the
   *  two separately so neither is disconnected twice. */
  private _nodes: AudioNode[] = [];
  /**
   * The current build's own output gain.
   *
   * Every build gets one, which is what makes a cross-fade possible at all: a rebuild can fade its
   * predecessor out through *that* generation's gain while its own starts at zero, and both are
   * summed into the persistent `_wetSum`. Without it there is one shared return and the only way to
   * remove the old build is to disconnect it — the M4 defect.
   */
  private _genGain: GainNode | null = null;
  /**
   * Builds that have been replaced and are still fading out, with the context time at which their
   * fade ends.
   *
   * Disconnected lazily by `_sweepRetired` on the next `setParams`/rebuild/`dispose` — never by a
   * timer, because this file's contract is that an `OfflineAudioContext` builds the identical graph
   * and a `setTimeout` would make the graph depend on wall-clock scheduling. So a single toggle with
   * no later parameter change leaves one silent build connected until the next one arrives; every
   * genre switch and tempo move calls `setParams`, so in practice that is the next user action.
   * It is an array because two toggles can land inside one fade window.
   */
  private _retiring: Array<{ gain: GainNode; nodes: AudioNode[]; until: number }> = [];
  private _delays: DelayNode[] = [];
  private _damps: BiquadFilterNode[] = [];
  private _fbs: GainNode[] = [];
  private _params: DelayParams;
  private readonly _supportsChannelRouting: boolean;
  /** Reset on rebuild: the fresh delay nodes need their time written, not ramped. */
  private _timeApplied = false;
  /** Kept across rebuilds: `output.gain` is a persistent node, so a change still ramps. */
  private _returnApplied = false;
  private _disposed = false;

  constructor(ctx: BaseAudioContext, params?: Partial<DelayParams>) {
    if (!ctx || typeof ctx.createGain !== "function") {
      throw new TypeError("DelayBus requires a BaseAudioContext");
    }
    this._ctx = ctx;
    this._params = normalizeParams(params ?? {}, DEFAULT_DELAY_PARAMS, ctx.sampleRate);
    this._supportsChannelRouting =
      typeof ctx.createChannelSplitter === "function" &&
      typeof ctx.createChannelMerger === "function";

    this.input = ctx.createGain();
    this.input.gain.setValueAtTime(1, ctx.currentTime);
    this._pre = ctx.createGain();
    this._pre.gain.setValueAtTime(1, ctx.currentTime);
    this._wetSum = ctx.createGain();
    this._wetSum.gain.setValueAtTime(1, ctx.currentTime);
    this.output = ctx.createGain();
    // `output.gain` *is* the wet level, so returnLevel is the single thing that decides it.
    this.output.gain.setValueAtTime(0, ctx.currentTime);

    this.input.connect(this._pre);
    this._wetSum.connect(this.output);

    this._build();
    this._applyAll(ctx.currentTime);
  }

  setParams(patch: Partial<DelayParams>): void {
    if (this._disposed) return;
    const next = normalizeParams(patch ?? {}, this._params, this._ctx.sampleRate);
    const pingChanged = next.pingPong !== this._params.pingPong;
    this._params = next;
    if (pingChanged) this._build();
    this._applyAll(this._ctx.currentTime);
  }

  getParams(): DelayParams {
    // A copy, so callers cannot mutate the live state behind the bus's back.
    return { ...this._params };
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._disconnect(this._pre);
    for (const node of this._nodes) this._disconnect(node);
    if (this._genGain) this._disconnect(this._genGain);
    for (const gen of this._retiring) {
      this._disconnect(gen.gain);
      for (const node of gen.nodes) this._disconnect(node);
    }
    this._nodes = [];
    this._retiring = [];
    this._delays = [];
    this._damps = [];
    this._fbs = [];
    for (const node of [this._wetSum, this.input, this.output]) this._disconnect(node);
  }

  private _disconnect(node: AudioNode): void {
    try {
      node.disconnect();
    } catch {
      /* already torn down */
    }
  }

  /**
   * Disconnects builds whose cross-fade has finished.
   *
   * Lazy by design (M4): a `setTimeout` here would make the graph depend on wall-clock scheduling,
   * and this file's contract is that an `OfflineAudioContext` builds an identical graph. The audio
   * clock is the honest source for "the fade is over" — and while an offline context is being
   * constructed its clock does not move at all, so a retired build simply stays connected.
   */
  private _sweepRetired(now: number): void {
    if (this._retiring.length === 0) return;
    const stillFading: Array<{ gain: GainNode; nodes: AudioNode[]; until: number }> = [];
    for (const gen of this._retiring) {
      if (now < gen.until) {
        stillFading.push(gen);
        continue;
      }
      this._disconnect(gen.gain);
      for (const node of gen.nodes) this._disconnect(node);
    }
    this._retiring = stillFading;
  }

  private _createDamp(): BiquadFilterNode {
    const damp = this._ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.setValueAtTime(this._params.dampHz, this._ctx.currentTime);
    damp.Q.setValueAtTime(DAMP_Q, this._ctx.currentTime);
    return damp;
  }

  /**
   * (Re)builds the internal graph behind the two stable endpoints. `_pre`'s edges to the outgoing
   * build are removed — it stops *recording* the send — but that build's own nodes stay connected
   * and are faded out, so what is already in its delay line keeps ringing instead of being cut in
   * one sample (M4). `output` and `input` are never touched.
   */
  private _build(): void {
    const ctx = this._ctx;
    const now = ctx.currentTime;
    this._sweepRetired(now);

    const previous = this._genGain;
    const fadeSec = delayCrossfadeSeconds(this._params.timeSeconds);
    if (previous) {
      const gain = previous.gain;
      try {
        gain.cancelScheduledValues(now);
      } catch {
        /* minimal param double */
      }
      // Pin where the fade actually is, then ramp: a toggle mid-fade must not jump to full.
      gain.setValueAtTime(Math.max(0, gain.value), now);
      gain.linearRampToValueAtTime(0, now + fadeSec);
      this._retiring.push({
        gain: previous,
        nodes: this._nodes,
        until: now + fadeSec,
      });
    }

    this._disconnect(this._pre);
    this._nodes = [];
    this._delays = [];
    this._damps = [];
    this._fbs = [];
    this._timeApplied = false;

    // The new build's own output gain: it fades in over the same window the old one fades out, and
    // the very first build simply starts at full (there is nothing behind it to cross-fade with).
    const genGain = ctx.createGain();
    genGain.gain.setValueAtTime(previous ? 0 : 1, now);
    if (previous) genGain.gain.linearRampToValueAtTime(1, now + fadeSec);
    genGain.connect(this._wetSum);

    // `getParams()` reports the requested `pingPong` even here; only the audio degrades to
    // centred, which is the safe direction.
    if (this._params.pingPong && this._supportsChannelRouting) {
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const sumL = ctx.createGain();
      const sumR = ctx.createGain();
      sumL.gain.setValueAtTime(1, ctx.currentTime);
      sumR.gain.setValueAtTime(1, ctx.currentTime);
      const delayL = ctx.createDelay(DELAY_TIME_MAX_SEC);
      const delayR = ctx.createDelay(DELAY_TIME_MAX_SEC);
      const dampL = this._createDamp();
      const dampR = this._createDamp();
      const fbL = ctx.createGain();
      const fbR = ctx.createGain();

      this._pre.connect(splitter);
      splitter.connect(sumL, 0);
      splitter.connect(sumR, 1);
      sumL.connect(delayL);
      sumR.connect(delayR);
      // Damped feedback, crossing so each line's tail surfaces on the other side.
      delayL.connect(dampL);
      dampL.connect(fbL);
      fbL.connect(sumR);
      delayR.connect(dampR);
      dampR.connect(fbR);
      fbR.connect(sumL);
      // Both delay lines are mono (each is fed by one splitter output), so the merger's
      // mono inputs receive mono signals only. Stereo information was preserved by the
      // split and is recombined here, never down-mixed.
      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      merger.connect(genGain);

      this._nodes.push(
        splitter,
        merger,
        sumL,
        sumR,
        delayL,
        delayR,
        dampL,
        dampR,
        fbL,
        fbR
      );
      this._delays = [delayL, delayR];
      this._damps = [dampL, dampR];
      this._fbs = [fbL, fbR];
      this._genGain = genGain;
      return;
    }

    // Centred: one delay line carries the full send, so a stereo image stays stereo and a
    // mono send stays centred once the master up-mixes it. No merger is involved at all.
    const delay = ctx.createDelay(DELAY_TIME_MAX_SEC);
    const damp = this._createDamp();
    const fb = ctx.createGain();

    this._pre.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(genGain);

    this._nodes.push(delay, damp, fb);
    this._delays = [delay];
    this._damps = [damp];
    this._fbs = [fb];
    this._genGain = genGain;
  }

  private _applyAll(now: number): void {
    const params = this._params;
    this._sweepRetired(now);

    for (const delay of this._delays) {
      if (!this._timeApplied) {
        // A fresh node has no prior audio to click, and an offline render must start at
        // the exact time, so the first write is a step by design.
        delay.delayTime.setValueAtTime(params.timeSeconds, now);
      } else if (Math.abs(delay.delayTime.value - params.timeSeconds) > 1e-9) {
        // Later changes ramp: a step in delayTime is a click, a short ramp is not.
        delay.delayTime.setValueAtTime(delay.delayTime.value, now);
        delay.delayTime.linearRampToValueAtTime(params.timeSeconds, now + DELAY_TIME_RAMP_SEC);
      }
    }
    this._timeApplied = true;

    /**
     * Q11: feedback amount and damping are smoothed, not stepped.
     *
     * `setParams` runs on every return-level change and on every `setBpm`, so a plain
     * `setValueAtTime` put a gain step inside the feedback loop (and a cutoff step in its
     * filter) every time the tempo moved — the delay audibly "re-tuned" in steps. A short
     * `setTargetAtTime` removes the step; the parameter is pinned first so a target that
     * changes mid-ramp starts from where the ramp actually is instead of jumping.
     */
    for (const damp of this._damps) {
      const param = damp.frequency;
      try {
        param.cancelScheduledValues(now);
      } catch {
        /* minimal param double */
      }
      param.setValueAtTime(Math.max(1, param.value), now);
      param.setTargetAtTime(params.dampHz, now, DELAY_PARAM_SMOOTH_SEC);
    }
    for (const fb of this._fbs) {
      const param = fb.gain;
      try {
        param.cancelScheduledValues(now);
      } catch {
        /* minimal param double */
      }
      param.setValueAtTime(Math.max(0, param.value), now);
      param.setTargetAtTime(params.feedback, now, DELAY_PARAM_SMOOTH_SEC);
    }

    this._applyReturn(now);
  }

  private _applyReturn(now: number): void {
    const target = this._params.enabled ? this._params.returnLevel : 0;
    const gain = this.output.gain;
    const current = gain.value;

    if (!this._returnApplied) {
      gain.setValueAtTime(target, now);
      this._returnApplied = true;
      return;
    }
    if (Math.abs(current - target) < 1e-6) return;

    try {
      gain.cancelScheduledValues(now);
    } catch {
      /* not supported on a minimal param double */
    }
    // Pin the current value, then ramp: silencing is a short fade, never a step to 0.
    gain.setValueAtTime(current, now);
    gain.linearRampToValueAtTime(target, now + RETURN_RAMP_SEC);
  }
}
