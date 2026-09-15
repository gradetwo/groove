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
  /** Master true-peak ceiling, dBTP. Defaults to the limiter's own default. */
  limiterCeilingDb?: number;
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
  /** Lookahead latency of the ceiling, seconds (0 on the compressor fallback). */
  limiterLatencySeconds(): number;
  dispose(): void;
}

/** Default master fader level. Kept at the live engine's historical value. */
export const MASTER_FADER_DEFAULT = 0.8;

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

  const reverb = new ReverbBus(ctx, options.reverb ?? DEFAULT_REVERB_PARAMS);
  const delay = new DelayBus(ctx, options.delay ?? DEFAULT_DELAY_PARAMS);

  // The default ceiling is the internal one (the -1.0 dBTP contract minus the detector
  // margin): the module's own detector under-reads the independent BS.1770 meter by up to
  // 0.12 dB, so targeting the contract exactly shipped files that measured *above* it.
  // See MASTER_LIMITER_DETECTOR_MARGIN_DB.
  const limiter = createMasterLimiter(ctx, {
    ceilingDb: options.limiterCeilingDb ?? MASTER_LIMITER_INTERNAL_CEILING_DB,
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

  // Signal chain: fader → FX rack → linear loudness trim → true-peak limiter.
  // The trim must come after every nonlinear stage for the match to be a real gain —
  // see the topology note in the module header.
  // The group buses are the only way a track reaches the fader.
  drumGlue.connect(masterGain);
  drumParallelGain.connect(masterGain);
  musicGlue.connect(masterGain);
  masterGain.connect(fxRack.inputNode);
  fxRack.outputNode.connect(loudnessTrimGain);
  loudnessTrimGain.connect(limiter.input);
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
