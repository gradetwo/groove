/**
 * Shared master graph (E-17, resolving N-16).
 *
 * ## Why this file exists
 *
 * The live engine and the offline WAV renderer each built their own master chain, and
 * they had drifted apart in ways a user can hear:
 *
 * - The **export had no send buses at all**. `sendA`/`sendB` are per-genre data
 *   (`genreMix.ts` gives every genre curated reverb/delay sends) but the renderer simply
 *   did not contain a reverb or a delay, so the reverb-heavy genres exported dry.
 * - The **export had no master FX rack**, so anything the user dialled into FLT/DRIVE/
 *   CHORUS/LO-FI was absent from the bounce.
 * - The **exporter's baseline used masterGain 0.85 while live used 0.8**, so the
 *   absolute level differed by ~0.5 dB before anything else was considered.
 *
 * That is the registered N-16. The fix is structural rather than another patch: one
 * builder, used by both, so the two graphs cannot diverge again — the same discipline the
 * chord-voicing module uses for note selection.
 *
 * ## Topology
 *
 * ```
 *   tracks + bus returns ─► masterGain (user fader)
 *                             └► fxRack ─► loudnessTrimGain (per-genre match)
 *                                             └► limiter ─► analysers ─► destination
 * ```
 *
 * **Why the loudness trim sits after the FX rack** (it used to sit before it, and that was
 * measurably wrong):
 *
 * The trim exists to make 159 genres equally loud, which only works if it is a *linear*
 * gain. Placed before the rack it is not: the rack's saturation is a nonlinearity, so a
 * genre that needed a +7 dB match arrived at the saturator 7 dB hotter, and the measured
 * result was +1.7 dB — the correction was absorbed by the distortion. The 2026-09-16
 * re-measurement caught exactly that: post-trim spread 3.14 LU against a 1.5 LU gate, with
 * the quiet, saturating genres (dubstep, doom-metal, riddim, metalcore — all of which carry
 * a genre FX rack with `saturationEnabled`) pinned far below target while the cuts landed
 * almost exactly. Moving the trim after the rack makes it a pure gain: only the true-peak
 * limiter can still absorb it, and the limiter only bites on genres that are *already* at
 * the ceiling, which are precisely the ones the trim cuts rather than boosts.
 *
 * It stays **before the limiter**, so the limiter remains the absolute output ceiling: a
 * genre needing a positive trim still cannot push the master past −1 dBTP.
 *
 * A second, quieter benefit: the rack now always sees the untrimmed signal, so a genre's
 * *timbre* no longer depends on how much loudness matching it needed. That is what makes the
 * V-10 timbre baseline (`scripts/timbre.baseline.json`, recorded at trim 0) a truthful
 * description of what the user actually hears for every genre.
 *
 * The bus returns tap into `masterGain`, i.e. before both the rack and the trim — so the
 * master fader moves the wet signal too, and the reverb/delay returns are loudness-matched
 * with the rest of the genre, which is how a real console behaves.
 */
import {
  createBusCompressor,
  type BusCompressorHandle,
  type BusCompressorKind,
} from "./GlueCompressorFactory";
import { EffectsRack, DEFAULT_FX_STATE, type EffectsRackState } from "./EffectsRack";
import { ReverbBus, DEFAULT_REVERB_PARAMS, type ReverbParams } from "./ReverbBus";
import { DelayBus, DEFAULT_DELAY_PARAMS, type DelayParams } from "./DelayBus";
import {
  MASTER_LIMITER_INTERNAL_CEILING_DB,
  createMasterLimiter,
  type MasterLimiterHandle,
  type MasterLimiterKind,
} from "./MasterLimiter";

/** How much of the heavily-compressed drum parallel path is blended back in (E-11). */
export const DRUM_PARALLEL_BLEND = 0.22;

export interface MasterGraphOptions {
  /**
   * Install the metering taps the live studio needs (a waveform analyser, a 2048-bin
   * spectrum analyser and a stereo pair behind a channel splitter). The offline renderer
   * leaves this off: it has no UI to feed, and the taps cost CPU on every block.
   */
  analysers?: boolean;
  /** Per-genre loudness-match trim, dB. Defaults to 0. */
  loudnessTrimDb?: number;
  /**
   * Fixed makeup applied after the per-genre loudness trim.
   *
   * Exists so the library's absolute level can be raised to a delivery target without touching
   * the 159 fitted trims: the trim's job is to make the genres match *each other*, and re-fitting
   * all of them upward would push most against the ±9 dB clamp. This is one number for the whole
   * record, applied identically in the live graph and the offline exporter, so parity holds.
   */
  masterMakeupDb?: number;
  /** Set false to remove the mastering bus compressor from the chain (measurement tooling). */
  masterBusCompEnabled?: boolean;
  /**
   * The bus compressor's release, seconds.
   *
   * Measurement tooling with a purpose: the compressor is what gives the sidechain duck back (measured on disco:
   * a −4.41 dB duck becomes −2.09 dB with the compressor alone, while the ceiling leaves it at −4.41 dB), because
   * its detector sees the ducked bass as "less programme" and releases within the duck's own length. A slower
   * release holds that gain reduction through the duck, and this is the knob that tests it.
   */
  masterBusCompReleaseSec?: number;
  /**
   * The bus compressor's threshold (dB), knee (dB) and ratio.
   *
   * Measurement tooling for the same question as the release above: A2 has to separate "the compressor's gain
   * reduction on the *programme* is what refills the duck" from "the node's own makeup gain is", and the only way to
   * ask is to stop the compressor compressing. A threshold of −6 dB is close to "off" for this material; if the duck
   * comes back at −6 and not at −16, the gain reduction is the cause.
   */
  masterBusCompThresholdDb?: number;
  masterBusCompKneeDb?: number;
  masterBusCompRatio?: number;
  /**
   * A **pre-duck** copy of the bus for the compressor's detector (A2).
   *
   * Supplying one switches the stage to the worklet compressor, whose detector reads this node instead of the
   * programme — which is the whole fix: the duck is in the programme, and a compressor that sees it hands it back
   * (measured: the median dip goes −4.37 dB → 0 dB through a `DynamicsCompressorNode`). Without one the graph uses
   * the node and behaves exactly as before, byte for byte.
   */
  busCompDetector?: AudioNode | "internal";
  /**
   * The same **pre-duck** bus, for the *ceiling*'s detector.
   *
   * Measured 2026-09-23, applying the batch's trims: disco's duck went from −2.39 dB in the file back to **−0.2**
   * because the louder trim (`−6.56 → −4.31`) drives the mix into the ceiling, and the ceiling's gain releases over
   * the dip — the compressor's fix held (−4.42 dB with the compressor alone), so the ceiling was the remaining
   * stage. Wiring the same bus into it makes the fix independent of the operating point the trims set.
   */
  limiterDetector?: AudioNode | "internal";
  /** Fixed makeup for the worklet compressor, dB. 0 by default; calibrated against the node it replaces. */
  busCompMakeupDb?: number;
  /** Master true-peak ceiling, dBTP. Defaults to the limiter's own default. */
  limiterCeilingDb?: number;
  /**
   * The ceiling's release time constants, ms.
   *
   * Measurement tooling with a real use: a faster release refills a duck as the limiter's gain recovers, which
   * is what `duckErasedInMaster` measures. Omitted, the limiter keeps its own defaults.
   */
  limiterReleaseFastMs?: number;
  limiterReleaseSlowMs?: number;
  /** Initial send-bus parameters (per-genre defaults are applied later via setters). */
  reverb?: Partial<ReverbParams>;
  delay?: Partial<DelayParams>;
  /** Initial master FX rack state. */
  fx?: Partial<EffectsRackState>;
}

export interface MasterGraph {
  /**
   * Where track strips and bus returns sum in. This is the user fader (`masterGain`) —
   * the same node the live engine calls `masterGain`, so existing wiring is unchanged.
   */
  readonly input: GainNode;
  /** The user fader. */
  readonly masterGain: GainNode;
  /**
   * The per-genre loudness-match stage, a separate node from the fader and the **last
   * linear stage before the limiter** (see the topology note in the module header).
   */
  readonly loudnessTrimGain: GainNode;
  /** Master FX rack (FLT / DRIVE / CHORUS / LO-FI). */
  readonly fxRack: EffectsRack;
  /** Reverb send bus: tracks' `sendA` connects to `.input`, `.output` is already patched. */
  /**
   * E-11: the two group buses every *track* sums into (the send returns do not — they join the
   * fader directly, which is what a real console does with an FX return).
   *
   * Tracks connect to `.input`, never to `masterGain`, so the glue stage cannot be bypassed by
   * adding a track. `busForRole` in `src/audio/trackBuses.ts` is the single place that decides
   * which bus a role belongs on.
   */
  readonly drumBusInput: GainNode;
  readonly musicBusInput: GainNode;
  /** Gain reduction (dB, positive = reducing) currently applied by each glue compressor. */
  glueReductionDb(): { drum: number; music: number };
  readonly reverb: ReverbBus;
  /** Delay send bus: tracks' `sendB` connects to `.input`, `.output` is already patched. */
  readonly delay: DelayBus;
  /** True-peak lookahead ceiling (or the compressor fallback). */
  readonly limiter: MasterLimiterHandle;
  /** Connect this to `ctx.destination`. */
  readonly output: AudioNode;
  /** Present only when `analysers: true`. */
  readonly analyser: AnalyserNode | null;
  readonly masterAnalyser: AnalyserNode | null;
  readonly analyserL: AnalyserNode | null;
  readonly analyserR: AnalyserNode | null;
  /** Applies the per-genre trim with a short ramp (click-free). */
  setLoudnessTrimDb(db: number): void;
  /** Current applied trim in dB (post-clamp value as written to the node). */
  getLoudnessTrimDb(): number;
  /** The ceiling actually installed once module loading settles. */
  limiterKind(): MasterLimiterKind;
  /** Which bus compressor is live (`node` unless a detector was supplied and the worklet loaded). */
  busCompressorKind(): BusCompressorKind;
  /**
   * The pre-duck bus the strips should tap (A2), or null when this graph has no detector.
   *
   * Created **by the graph**, after the fader and the trim. The first version had every caller create it before
   * calling in, which moved the master fader and trim one place down the node list — and the tests that identify
   * them by position were the first thing to notice, correctly: the graph's structure is part of its contract.
   */
  duckDetectorInput: AudioNode | null;
  /** Lookahead latency of the ceiling, seconds (0 on the compressor fallback). */
  limiterLatencySeconds(): number;
  dispose(): void;
}

/** Default master fader level. Kept at the live engine's historical value. */
export const MASTER_FADER_DEFAULT = 0.8;

/**
 * Q12: corner frequency of the master DC blocker. Below the lowest musical fundamental
 * (a 32.7 Hz C1 is the lowest note any preset here reaches) and above any plausible DC.
 */
export const MASTER_DC_BLOCK_HZ = 20;

/**
 * Absolute makeup gain for the master bus, in dB.
 *
 * Measured state before this existed: the library's 159 fitted trims match each other to a
 * 0.32 dB p10–p90 spread, but the *absolute* target was the library's own median, −15.7 LUFS —
 * roughly 1.7 dB below Spotify's −14 LUFS normalisation point and 6–9 dB below a modern master
 * of the same genres. Raising the target through the trims alone would have pushed almost every
 * genre into the ±9 dB clamp (the median trim is already ≈0 dB, and the required lift is +4.5 to
 * +7.4 dB), so the lift belongs here: one number, applied to every genre, preserving the spread.
 */
export const MASTER_MAKEUP_DB = 5;

/**
 * Mastering-style bus compressor, and why it exists in the chain.
 *
 * Measured before this stage: the library's peak-to-loudness ratio ("crest") is a median of
 * 14.34 dB, and a controlled experiment (apply +10 dB of makeup to `chicago-house` at a fixed
 * trim, then measure) showed the true-peak limiter was the *only* stage handling the crest — it
 * swallowed the whole 10 dB and the output moved by −0.1 LUFS. The consequence is that raising
 * the delivery level, per genre, was physically impossible: only 21 of 159 genres could reach
 * −11 LUFS under a −1.0 dBTP ceiling, and gain transfer ran at 7–70%.
 *
 * That is what a mastering chain exists to fix. Program-dependent gain reduction *before* the
 * limiter lowers the crest, which both raises the achievable loudness and lets the limiter work
 * with shallower, more transparent gain reduction. The settings are deliberately slow and gentle
 * (2:1, 30 ms attack, 220 ms release, soft knee, 3 dB of detector headroom), i.e. glue rather
 * than audible pumping: the point is to remove the peaks that were costing loudness, not to
 * squash the music. It is applied identically in the live graph and the offline exporter, so
 * exporter parity is unchanged.
 */
export const MASTER_BUS_COMP_THRESHOLD_DB = -16;
export const MASTER_BUS_COMP_KNEE_DB = 8;
export const MASTER_BUS_COMP_RATIO = 2;
export const MASTER_BUS_COMP_ATTACK_SEC = 0.03;
export const MASTER_BUS_COMP_RELEASE_SEC = 0.22;

/** Clamp for `masterMakeupDb`, wide enough to be usable and narrow enough to stay safe. */
export const MASTER_MAKEUP_MIN_DB = -12;
export const MASTER_MAKEUP_MAX_DB = 12;

function clampMakeup(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(MASTER_MAKEUP_MAX_DB, Math.max(MASTER_MAKEUP_MIN_DB, db));
}

/** Clamp for the per-genre trim, in dB — same range `genreMix` promises. */
export const MASTER_TRIM_MIN_DB = -12;
export const MASTER_TRIM_MAX_DB = 12;

/**
 * Converts a dB offset to a linear gain factor.
 *
 * Lives here (rather than in either engine) because both the live engine and the offline
 * renderer apply the same per-genre trim; one definition is what keeps them from drifting.
 */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function buildMasterGraph(
  ctx: BaseAudioContext,
  options: MasterGraphOptions = {}
): MasterGraph {
  // Creation order matters to a few structural tests: the fader is the first gain and the
  // trim the second, which is the order the exporter has always used.
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(MASTER_FADER_DEFAULT, ctx.currentTime);

  const loudnessTrimGain = ctx.createGain();
  let appliedTrimDb = clampTrim(options.loudnessTrimDb ?? 0);
  loudnessTrimGain.gain.setValueAtTime(dbToGain(appliedTrimDb), ctx.currentTime);

  // Absolute makeup (see `masterMakeupDb`). Sits immediately after the trim and before the
  // limiter, so the limiter is still the last thing that can raise or lower the level.
  const masterMakeupGain = ctx.createGain();
  const appliedMakeupDb = clampMakeup(options.masterMakeupDb ?? MASTER_MAKEUP_DB);
  masterMakeupGain.gain.setValueAtTime(dbToGain(appliedMakeupDb), ctx.currentTime);

  /**
   * Bus compression between the makeup and the limiter — see the constants above for the
   * measurement that motivated it. `masterBusCompEnabled: false` removes the stage from the
   * chain (used by the measurement tooling to isolate its effect); the default is on.
   */
  const busCompEnabled = options.masterBusCompEnabled !== false;
  /**
   * The bus compressor, as a handle rather than a bare node.
   *
   * With no detector it is a `DynamicsCompressorNode` with the shipped settings — the graph then behaves exactly as
   * it did before this existed. With a detector (`busCompDetector`) it becomes the two-input worklet compressor,
   * whose gain follows a pre-duck copy of the bus; the node keeps the ceiling until the module loads, exactly like
   * the limiter's own fallback.
   */
  /**
   * One pre-duck bus for both stages that need it.
   *
   * The compressor and the ceiling answer the same question — "is the *music* quieter here, or did the sidechain ask
   * for this?" — so they share the answer, and the graph owns it (see `duckDetectorInput` for why it is not created
   * by the callers).
   */
  const wantsInternalDetector =
    options.busCompDetector === "internal" || options.limiterDetector === "internal";
  const detectorBus: AudioNode | null = wantsInternalDetector
    ? (() => {
        const bus = ctx.createGain();
        bus.gain.value = 1;
        return bus as AudioNode;
      })()
    : typeof options.busCompDetector === "object"
      ? (options.busCompDetector ?? null)
      : typeof options.limiterDetector === "object"
        ? (options.limiterDetector ?? null)
        : null;
  const limiterDetectorNode: AudioNode | null =
    options.limiterDetector === "internal"
      ? detectorBus
      : typeof options.limiterDetector === "object"
        ? (options.limiterDetector ?? null)
        : null;
  const busComp: BusCompressorHandle = createBusCompressor(ctx, {
    thresholdDb: options.masterBusCompThresholdDb,
    kneeDb: options.masterBusCompKneeDb,
    ratio: options.masterBusCompRatio,
    releaseSec: options.masterBusCompReleaseSec,
    detector: detectorBus,
    makeupDb: options.busCompMakeupDb,
  });
  const masterBusComp = busComp.input;

  const reverb = new ReverbBus(ctx, options.reverb ?? DEFAULT_REVERB_PARAMS);
  const delay = new DelayBus(ctx, options.delay ?? DEFAULT_DELAY_PARAMS);

  // The default ceiling is the internal one (the -1.0 dBTP contract minus the detector
  // margin): the module's own detector under-reads the independent BS.1770 meter by up to
  // 0.12 dB, so targeting the contract exactly shipped files that measured *above* it.
  // See MASTER_LIMITER_DETECTOR_MARGIN_DB.
  const limiter = createMasterLimiter(ctx, {
    ceilingDb: options.limiterCeilingDb ?? MASTER_LIMITER_INTERNAL_CEILING_DB,
    /**
     * The limiter is **not** given the detector input, and that is a decision made on measurements rather than a
     * retreat — A2's second half is now handled by the ceiling's release **hold** instead.
     *
     * The duck was eaten by the ceiling's recovery, not by its detector: the ceiling alone turned disco's −4.40 dB
     * mechanism into −3.44 dB, and the finished file into −0.3 dB. Two fixes were built. The detector input (this
     * option) is implemented, kernel-tested and cleared by an isolation probe, but wiring it into the render path
     * disabled the ceiling entirely (+1.42 dBTP against a −1 dBTP contract) for a reason still not identified, and
     * the bus also had to be level-matched by hand because the strip taps sit before the fader, the trim and the
     * makeup — three moving parts for one dip.
     *
     * A **180 ms release hold** (`MASTER_LIMITER_RELEASE_HOLD_MS`) gets there with none of them: measured on disco,
     * the ceiling's own cell went from −3.44 to **−3.92 dB** and the file from −0.3 to **−3.82 dB** (median), while
     * the ceiling still holds −1.30 dBTP and the integrated level is unchanged (−14.73 LUFS). Slowing the release
     * instead was measured too and rejected: 400/2000 ms holds the duck as well but costs ~6 dB of ceiling headroom
     * on every genre.
     *
     * The detector option stays because it is the general answer for a caller that *already* has a pre-duck copy —
     * the analyser uses `--bus-comp-release`-style overrides, and the kernel case that pins it is worth keeping — but
     * the shipped graph does not need it.
     */
    detector: null,
    releaseFastMs: options.limiterReleaseFastMs,
    releaseSlowMs: options.limiterReleaseSlowMs,
  });

  /**
   * E-11 — group buses with glue compression.
   *
   * Two stages, one per bus, and they are deliberately *slow*: a fast attack would flatten the
   * very transients that make a drum bus sound like drums, so the drum glue lets the first
   * ~12 ms through and grips what follows, while the music bus is slower still and only exists
   * to stop a pad, a bass and a lead from each claiming their own peak. Both are gentle
   * (2:1 – 3:1) and neither is a limiter: the true-peak limiter at the end of the chain is
   * still the only thing enforcing a ceiling.
   *
   * The drum bus additionally carries a **parallel** path — the same signal crushed hard and
   * blended back under the clean one — which is how a drum bus gains density without losing its
   * attack. Its blend is deliberately low; the level it contributes is folded into the loudness
   * re-measurement (see `MIX_LOUDNESS_NOTES.md` §7), not guessed at.
   */
  const drumBusInput = ctx.createGain();
  const drumGlue = ctx.createDynamicsCompressor();
  drumGlue.threshold.value = -18;
  drumGlue.knee.value = 6;
  drumGlue.ratio.value = 3;
  drumGlue.attack.value = 0.012;
  drumGlue.release.value = 0.15;
  drumBusInput.connect(drumGlue);

  const drumParallel = ctx.createDynamicsCompressor();
  drumParallel.threshold.value = -34;
  drumParallel.knee.value = 2;
  drumParallel.ratio.value = 8;
  drumParallel.attack.value = 0.004;
  drumParallel.release.value = 0.12;
  const drumParallelGain = ctx.createGain();
  drumParallelGain.gain.value = DRUM_PARALLEL_BLEND;
  drumBusInput.connect(drumParallel);
  drumParallel.connect(drumParallelGain);

  const musicBusInput = ctx.createGain();
  const musicGlue = ctx.createDynamicsCompressor();
  musicGlue.threshold.value = -20;
  musicGlue.knee.value = 8;
  musicGlue.ratio.value = 2;
  musicGlue.attack.value = 0.03;
  musicGlue.release.value = 0.25;
  musicBusInput.connect(musicGlue);

  const fxRack = new EffectsRack(ctx, { ...DEFAULT_FX_STATE, ...(options.fx ?? {}) });

  // Optional metering taps. `analyser` is the small waveform tap the transport UI reads;
  // `masterAnalyser` is the 2048-bin spectrum; L/R feed the phase scope.
  let analyser: AnalyserNode | null = null;
  let masterAnalyser: AnalyserNode | null = null;
  let analyserL: AnalyserNode | null = null;
  let analyserR: AnalyserNode | null = null;
  let channelSplitter: ChannelSplitterNode | null = null;

  if (options.analysers) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;

    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 2048;
    masterAnalyser.smoothingTimeConstant = 0.8;

    if (typeof ctx.createChannelSplitter === "function") {
      try {
        channelSplitter = ctx.createChannelSplitter(2);
        analyserL = ctx.createAnalyser();
        analyserL.fftSize = 1024;
        analyserR = ctx.createAnalyser();
        analyserR.fftSize = 1024;
      } catch {
        // Stereo taps are cosmetic; mono metering is still correct.
        channelSplitter = null;
        analyserL = null;
        analyserR = null;
      }
    }
  }

  /**
   * Q12: DC blocker at the head of the master chain.
   *
   * Nothing in the chain removed DC: the drum and synth voices, the reverb IR (a noise tail
   * with a non-zero mean) and imported material can all carry an offset, and the true-peak
   * limiter counts DC at full weight — so a constant offset statically ate ceiling and
   * reduced the whole mix's headroom for no audible benefit. One 20 Hz first-order highpass
   * is inaudible on any musical content and removes the problem at the source.
   */
  const dcBlocker = ctx.createBiquadFilter();
  dcBlocker.type = "highpass";
  dcBlocker.frequency.setValueAtTime(MASTER_DC_BLOCK_HZ, ctx.currentTime);
  dcBlocker.Q.setValueAtTime(0.707, ctx.currentTime);

  // Signal chain: fader → DC block → FX rack → linear loudness trim → true-peak limiter.
  // The trim must come after every nonlinear stage for the match to be a real gain —
  // see the topology note in the module header.
  // The group buses are the only way a track reaches the fader.
  drumGlue.connect(masterGain);
  drumParallelGain.connect(masterGain);
  musicGlue.connect(masterGain);
  masterGain.connect(dcBlocker);
  dcBlocker.connect(fxRack.inputNode);
  fxRack.outputNode.connect(loudnessTrimGain);
  loudnessTrimGain.connect(masterMakeupGain);
  if (busCompEnabled) {
    masterMakeupGain.connect(masterBusComp);
    busComp.output.connect(limiter.input);
  } else {
    masterMakeupGain.connect(limiter.input);
  }
  limiter.output.connect(analyser ?? ctx.destination);

  if (analyser) {
    analyser.connect(ctx.destination);
    if (masterAnalyser) limiter.output.connect(masterAnalyser);
    if (channelSplitter && analyserL && analyserR) {
      limiter.output.connect(channelSplitter);
      channelSplitter.connect(analyserL, 0);
      channelSplitter.connect(analyserR, 1);
    }
  }

  // Bus returns sum into the fader, exactly as the live engine did before this refactor.
  reverb.output.connect(masterGain);
  delay.output.connect(masterGain);

  return {
    input: masterGain,
    drumBusInput,
    musicBusInput,
    glueReductionDb: () => ({
      drum: drumGlue.reduction ?? 0,
      music: musicGlue.reduction ?? 0,
    }),
    masterGain,
    loudnessTrimGain,
    fxRack,
    reverb,
    delay,
    limiter,
    output: analyser ?? ctx.destination,
    analyser,
    masterAnalyser,
    analyserL,
    analyserR,
    setLoudnessTrimDb(db: number) {
      appliedTrimDb = clampTrim(db);
      const target = dbToGain(appliedTrimDb);
      const now = ctx.currentTime;
      try {
        if (typeof loudnessTrimGain.gain.cancelScheduledValues === "function") {
          loudnessTrimGain.gain.cancelScheduledValues(now);
        }
        if (typeof loudnessTrimGain.gain.setTargetAtTime === "function") {
          // Short ramp: a genre switch must not click, and a 5 ms time constant is
          // inaudible while still settling well before the first step sounds.
          loudnessTrimGain.gain.setTargetAtTime(target, now, 0.005);
        } else {
          loudnessTrimGain.gain.setValueAtTime(target, now);
        }
      } catch {
        loudnessTrimGain.gain.value = target;
      }
    },
    getLoudnessTrimDb() {
      return appliedTrimDb;
    },
    busCompressorKind: () => busComp.kind(),
    duckDetectorInput: detectorBus,
    limiterKind() {
      return limiter.kind;
    },
    limiterLatencySeconds() {
      return limiter.latencySeconds;
    },
    dispose() {
      try {
        reverb.dispose();
        delay.dispose();
        fxRack.destroy();
        limiter.dispose();
      } catch {
        /* teardown must never throw */
      }
      for (const node of [masterGain, loudnessTrimGain, analyser, masterAnalyser, analyserL, analyserR, channelSplitter, drumBusInput, drumGlue, drumParallel, drumParallelGain, musicBusInput, musicGlue]) {
        try {
          node?.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    },
  };
}

function clampTrim(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(MASTER_TRIM_MIN_DB, Math.min(MASTER_TRIM_MAX_DB, db));
}
