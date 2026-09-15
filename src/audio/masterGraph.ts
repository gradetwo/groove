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
 * ## Topology (identical to the previous live chain, which is what the loudness baseline
 * was measured through)
 *
 * ```
 *   tracks + bus returns ─► masterGain (user fader)
 *                             └► loudnessTrimGain (per-genre match)
 *                                  └► fxRack ─► limiter ─► analysers ─► destination
 * ```
 *
 * The trim sits **before** the limiter deliberately: the limiter stays the absolute
 * output ceiling, so a genre needing a positive trim cannot push the master past it.
 * The bus returns tap into `masterGain`, i.e. *after* the trim and *before* the FX rack —
 * so the master fader moves the wet signal too, which is how a real console behaves.
 */
import { EffectsRack, DEFAULT_FX_STATE, type EffectsRackState } from "./EffectsRack";
import { ReverbBus, DEFAULT_REVERB_PARAMS, type ReverbParams } from "./ReverbBus";
import { DelayBus, DEFAULT_DELAY_PARAMS, type DelayParams } from "./DelayBus";
import { createMasterLimiter, type MasterLimiterHandle, type MasterLimiterKind } from "./MasterLimiter";

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
  /** The per-genre loudness-match stage, a separate node from the fader. */
  readonly loudnessTrimGain: GainNode;
  /** Master FX rack (FLT / DRIVE / CHORUS / LO-FI). */
  readonly fxRack: EffectsRack;
  /** Reverb send bus: tracks' `sendA` connects to `.input`, `.output` is already patched. */
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

  const limiter = createMasterLimiter(ctx, {
    ...(options.limiterCeilingDb !== undefined ? { ceilingDb: options.limiterCeilingDb } : {}),
  });

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

  // Signal chain. Same order as the live engine has always used.
  masterGain.connect(loudnessTrimGain);
  loudnessTrimGain.connect(fxRack.inputNode);
  fxRack.outputNode.connect(limiter.input);
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
      for (const node of [masterGain, loudnessTrimGain, analyser, masterAnalyser, analyserL, analyserR, channelSplitter]) {
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
