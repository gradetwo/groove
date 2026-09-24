/**
 * Web Audio Synthetic Engine for Groove Studio
 * Pure native Web Audio API synthesizer. Zero sample downloads, zero external latency.
 * Implements sample-accurate lookahead scheduling with swing and track solo/mute/pan.
 */

import { MAX_NOTE_GATE_STEPS, SequencerPattern, SequencerTrack } from "../types/genre";
import { AudioWorkerBridge } from "./AudioWorkerBridge";
import { AudioWorkletClock } from "./AudioWorkletClock";
import {
  DrumKitType,
  synthesizeKick,
  synthesizeSnare,
  synthesizeHiHat,
  synthesizePercussion,
  drumEnvelopeLevelAt,
  instrumentWantsPercussionVoice,
  type DrumVoiceEnvelope,
} from "./DrumKitModels";
import { playPolySynthNote, DEFAULT_SYNTH_PRESETS, SynthPreset } from "./PolySynth";
import { resolveInstrumentPreset } from "./instrumentPresets";
import { EffectsRack, EffectsRackState, DEFAULT_FX_STATE } from "./EffectsRack";
import { LiveRecorder, QuantizedStepResult } from "./LiveRecorder";
import { initIosAudioUnlock } from "./iosAudioUnlock";
import { ecosystemBus } from "./ecosystemBus";
import { safeVelocity, safeTime } from "./dspGuards";
import { computeCatchUp, visualLeadSeconds } from "./schedulerMath";
import { ratchetVelocityScale, resolveRatchet } from "./noteEvents";
import { resolveKickDuckShape, scheduleKickDuck } from "./sidechain";
import { swingMovesStep, swingOffsetSeconds } from "./swing";
import { TrackState, deriveTrackStates } from "./trackStates";
import { createSeededNoiseBuffer, noisePositionFor } from "./noise";
import {
  chordVoicingForStep,
  chordVoiceGain,
  chordNoteDuration,
  chordVoiceOnset,
  CHORD_STRUM_SEC,
  type ChordTreatment,
  chordNotesForStep,
} from "./chordVoicing";
import { resolveChordTreatment } from "../data/genreVoicing";
import { VoiceRegistry } from "./voiceRegistry";
import { type MasterLimiterHandle, type MasterLimiterKind } from "./MasterLimiter";
import { buildMasterGraph, dbToGain, type MasterGraph } from "./masterGraph";
import { polyVoiceVariation, variationSeedFrom } from "./noteVariation";
import { patternSeed } from "./noteEvents";
import { ChannelStrip } from "./ChannelStripDsp";
import { resolveTrackInsertForGenre } from "../data/genreInsert";
import { resolveGroupBus } from "./trackBuses";
import { Gs1VoicePool } from "./gs1/Gs1VoicePool";
import { DEFAULT_GS1_ROUTING_ENABLED, setGs1RoutingEnabled } from "./gs1/gs1Tracks";
import type { TrackInsertParams } from "../data/trackInsert";
import { applyGenreFxToGraph, delayParamsAtTempo, resolveGenreFx, type GenreFxProfile } from "../data/genreFx";
export type { TrackState } from "./trackStates";
import { isDrumTrack, getDefaultDrumKitForGenre } from "../utils/trackUtils";
import {
  LOUDNESS_TRIM_MAX_DB,
  LOUDNESS_TRIM_MIN_DB,
  getGenreLoudnessTrimDb,
  resolveGenreMix,
} from "../data/genreMix";

export type { DrumKitType, EffectsRackState, SynthPreset, QuantizedStepResult };

export interface StepCallbackInfo {
  step: number;
  time: number;
}

/**
 * How long a switched-off GS-1 pool keeps its loaded hosts before being disposed.
 *
 * Long enough that flipping the switch off and back on (or A/B-ing the sound) never pays the
 * worklet + WASM load again, short enough that leaving it off releases the memory. Audible output
 * stops immediately either way — `releaseAll()` is not deferred.
 */
const GS1_DISABLE_GRACE_MS = 3000;

export interface AudioEngineOptions {
  onStep?: (info: StepCallbackInfo) => void;
  onTrackTrigger?: (trackIndices: number[]) => void;
  onPlay?: () => void;
  onStop?: () => void;
  /** Fires when the scheduler had to skip steps after a stall (F-02 diagnostics). */
  onDroppedSteps?: (droppedSteps: number) => void;
  /**
   * GS-1 voice-pool factory. Injectable so a test can observe the live routing decisions
   * (which notes, how long, to which destination) and assert that a transport stop actually
   * silences the worklet voices — neither is observable through the real pool without WASM.
   */
  createGs1Pool?: (ctx: BaseAudioContext) => Gs1VoicePool;
}

export interface TrackChannelStrip {
  gain: GainNode;
  /**
   * Dedicated ducking stage for kick-bass low-end sidechain dip.
   */
  duckGain: GainNode;
  /**
   * The **pre-duck** tap that feeds the bus compressor's detector (A2).
   *
   * It carries the lane's volume (the mixer update sets both), but not the duck, so the compressor's gain follows the
   * programme as it would be without a sidechain. The offline renderer taps the same point, which is what keeps
   * "what you export" and "what you hear" the same graph.
   */
  detectorTap: GainNode;
  /**
   * Polarity stage (Ø). Held at +1 normally and -1 when the channel is inverted, so
   * the sign can be flipped without touching the volume stage (N-01 follow-up).
   */
  polarity: GainNode;
  /**
   * Per-channel analyser, created only while a view asks for real meters
   * (`enableTrackAnalysers`). Pass-through: it does not colour the signal.
   */
  analyser: AnalyserNode | null;
  /**
   * E-10: the track's insert chain (HPF → EQ → compressor → drive).
   *
   * It sits **before the fader**, like a real console channel strip, so the fader stays the
   * last gain in the strip and compression makeup does not change the fader's meaning.
   */
  insert: ChannelStrip;
  /**
   * Stereo mode panner. Exactly one of `panner` / `spatialPanner` is active:
   * the strip is rebuilt when the monitoring mode changes (N-02).
   */
  panner: StereoPannerNode | null;
  /** Binaural (HRTF) panner used when spatial monitoring is enabled. */
  spatialPanner: PannerNode | null;
  sendA: GainNode;
  sendB: GainNode;
}

/** Binaural monitoring layout for the 8 sequencer tracks (N-02 / roadmap P8-03). */
export interface SpatialLayoutEntry {
  /** Degrees, -90 = hard left, 0 = front, +90 = hard right. */
  azimuth: number;
  /** Metres; 1 = on the reference circle. */
  distance: number;
  /** Degrees above the listener plane. */
  elevation: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  /**
   * Genre loudness-match gain. Deliberately a *separate* stage from `masterGain` so
   * `getMasterVolume()` / `getEffectiveMasterVolume()` and the console fader keep
   * meaning "the level the user asked for".
   */
  private loudnessTrimGain: GainNode | null = null;
  /**
   * Master ceiling input node. E-12: this is the `input` of the true-peak lookahead
   * limiter handle (`masterLimiter`), kept under its historical name so the graph
   * introspection tests and downstream analyser wiring still address one node. On the
   * worklet path `masterLimiter.output` is a distinct node; on the compressor fallback
   * the two are the same node.
   */
  private limiter: AudioNode | null = null;
  /** The master ceiling (worklet when available, compressor fallback otherwise). */
  private masterLimiter: MasterLimiterHandle | null = null;
  private analyser: AnalyserNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private channelSplitter: ChannelSplitterNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private isPlaying: boolean = false;

  // Per-track channel strips (P3-09)
  private trackStrips: TrackChannelStrip[] = [];

  // Send effect buses (P3-10)
  /**
   * E-17 / N-16: the whole master chain (fader → FX rack → loudness trim → true-peak
   * limiter → analyser taps) and both send buses now come from one shared builder that the
   * offline renderer also uses. Before this the two graphs had drifted apart: the export
   * contained no sends and no FX rack at all, so reverb-heavy genres bounced dry.
   *
   * The trim sits after the rack on purpose — it has to be a linear gain for the per-genre
   * loudness match to hold (see `masterGraph.ts`).
   */
  private masterGraph: MasterGraph | null = null;

  /**
   * P2.2 / A3: the seed for per-note timbre variation, cached per pattern.
   *
   * Cached because the scheduler asks for it on every note and it is a pure function of the pattern; keyed by the
   * pattern's *identity* so editing a pattern (a new object) picks up a new set of nudges, exactly as the offline
   * renderer does. Without this, playback would be the un-nudged machine the export no longer is.
   */
  private variationSeedCache: { pattern: unknown; seed: number } | null = null;

  private get variationSeed(): number {
    if (!this.pattern) return 0;
    if (this.variationSeedCache?.pattern !== this.pattern) {
      this.variationSeedCache = {
        pattern: this.pattern,
        seed: variationSeedFrom(patternSeed(this.pattern)),
      };
    }
    return this.variationSeedCache.seed;
  }

  /**
   * P6: the GS-1 voices for `chords`/`lead`, or `null` until a context exists.
   *
   * It is inert while `isGs1RoutingEnabled()` is false (the default), so creating it changes
   * nothing: every `tryPlay` returns `false` and the native path below runs exactly as before.
   */
  private gs1Pool: Gs1VoicePool | null = null;

  /** Test seam: when set, replaces `new Gs1VoicePool(ctx)` (see `AudioEngineOptions`). */
  private readonly gs1PoolFactory: ((ctx: BaseAudioContext) => Gs1VoicePool) | null;

  /** Pending teardown after GS-1 was switched off; cancelled if it comes back on in time. */
  private gs1DisposeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Last insert chain applied per track, so an unchanged chain is not pushed again. */
  private appliedInsertRefs: Array<TrackInsertParams | null> = [];

  /** Memoised `resolveTrackInsertForGenre` results, keyed by `genre|role`. */
  private readonly resolvedInsertCache = new Map<string, TrackInsertParams>();

  /** Diagnostics for the skip above (and for the tests that pin it). */
  private patternInsertApplications = 0;

  /**
   * The per-genre FX profile last applied by `setPattern` (N-14). `null` means the genre
   * is unknown — a custom or imported genre keeps the global defaults rather than
   * inheriting some other genre's character.
   */
  private appliedGenreFx: GenreFxProfile | null = null;
  /** Explicit override for composite patterns (the compare view), like the trim's. */
  private genreFxOverride: GenreFxProfile | null = null;

  // Metronome, Count-In, and Loop Region (P3-07)
  private isMetronome: boolean = false;
  private isCountIn: boolean = false;
  private countInRemaining: number = 0;
  private loopRange: [number, number] | null = null;

  /** N-02: binaural (HRTF) monitoring toggle; off by default. */
  private spatialEnabled: boolean = false;
  /** Per-channel analysers for the console meters; off unless a view needs them. */
  private trackAnalysersEnabled: boolean = false;

  // A-05: voice bookkeeping now lives in the shared VoiceRegistry (also used by the
  // chord engine) instead of a private copy per engine.
  private voiceRegistry: VoiceRegistry = new VoiceRegistry(() => (this.ctx ? this.ctx.currentTime : 0));

  // Unlock event handler reference for clean removal
  private unlockHandler: (() => void) | null = null;

  // AudioWorklet Clock & Web Worker Fallback (P5-01)
  private workletClock: AudioWorkletClock;
  private workerBridge: AudioWorkerBridge;

  // Drum Kit Models (P5-02)
  private drumKit: DrumKitType = "808";
  /** Rotates the noise read offset for manual hits, so repeated pad taps do not sound identical. */
  private auditionNoiseCursor = 0;
  /** Acoustic enhancement: Active open hi-hat voices tracked for choking */
  private openHiHatVoices: Array<{ gains: GainNode[]; stopTime: number; envelope?: DrumVoiceEnvelope }> = [];
  private isDrumsOnly: boolean = false;

  // Master DSP Effects Rack (P5-04)
  private masterFxRack: EffectsRack | null = null;

  // Live Sequencer Recording (P5-05)
  private liveRecorder: LiveRecorder = new LiveRecorder();

  // Scheduler state
  private bpm: number = 120;
  private swing: number = 0; // 0 to 0.75
  private currentStep: number = 0;
  private nextStepTime: number = 0;
  private scheduleTimerId: any = null;
  private stepQueue: Array<{ step: number; time: number; activeTracks: number[] }> = [];
  /** A-07: hard cap so a hidden tab (rAF paused) cannot grow this without bound. */
  private static readonly MAX_STEP_QUEUE = 128;
  private lastReportedStep: number = -1;
  private rafId: number | null = null;

  // Meter and quantization
  private totalSteps: number = 16;
  private resolution: "1/8" | "1/16" | "1/32" = "1/16";
  private timeSignature: string = "4/4";

  private lookaheadMs: number = 20; // How frequently to call scheduler (ms) via Web Worker
  private scheduleAheadSec: number = 0.20; // 200ms lookahead prevents dropouts during UI dragging & drawer animations

  // Scheduler health (F-01/F-02): observable counters so stalls and bad steps are
  // diagnosable instead of silently degrading playback.
  private droppedStepCount: number = 0;
  private schedulingErrorCount: number = 0;

  // Pattern data
  private pattern: SequencerPattern | null = null;
  // Shares the canonical TrackState shape with the offline renderers (A-05); an
  // inline copy here silently drifted the moment a field was added.
  private trackStates: TrackState[] = [];

  /**
   * Isolated preview of one track's lane — the piano roll's "play just this part".
   *
   * Deliberately **not** implemented by touching `trackStates` (i.e. by soloing the track):
   * that is shared, user-visible state, so entering a preview would light the row's Solo button
   * and leaving it would have to remember what to restore. Instead the scheduler simply skips
   * every other track while a scope is set, which means:
   *
   *   - the previewed track is heard **as it is mixed** — its own mute/solo state still applies,
   *     so the preview cannot claim a track is audible when the arrangement says otherwise;
   *   - nothing outside this object changes, so closing the roll cannot leave the session in a
   *     different state than it was found in.
   */
  private previewScope: { trackIdx: number; fromStep: number; toStep: number } | null = null;

  // Callbacks
  private onStepCallback?: (info: StepCallbackInfo) => void;
  private onTrackTriggerCallback?: (trackIndices: number[]) => void;
  private onPlayCallback?: () => void;
  private onStopCallback?: () => void;
  private onDroppedStepsCallback?: (droppedSteps: number) => void;

  // Noise buffers cache
  private noiseBuffer: AudioBuffer | null = null;

  // Latency & Hearing Protection (P4-05)
  private latencyCompensationMs: number = 0;
  private hearingProtection: boolean = true;
  private maxVolumeLimit: number = 0.85;
  /**
   * Whether `chords`/`lead` are voiced by GS-1. Persisted next to the other audio settings, and
   * applied to the routing switch so the engines read one source of truth.
   */
  private gs1Enabled: boolean = DEFAULT_GS1_ROUTING_ENABLED;
  private currentMasterVolume: number = 0.8;

  // Genre loudness matching (feat/genre-mix-loudness).
  /** dB actually written to `loudnessTrimGain` (post-clamp, post-fallback). */
  private appliedLoudnessTrimDb: number = 0;
  /**
   * Explicit trim override, or `null` for "derive from the pattern's genre".
   * Only the compare view's merged composite needs an override today (a composite
   * carries a synthetic `sync_*` genre id that resolves to no genre); single-genre
   * callers must pass `null` to return to automatic matching.
   */
  private loudnessTrimOverrideDb: number | null = null;

  constructor(options?: AudioEngineOptions) {
    if (options?.onStep) this.onStepCallback = options.onStep;
    if (options?.onTrackTrigger) this.onTrackTriggerCallback = options.onTrackTrigger;
    if (options?.onPlay) this.onPlayCallback = options.onPlay;
    if (options?.onStop) this.onStopCallback = options.onStop;
    if (options?.onDroppedSteps) this.onDroppedStepsCallback = options.onDroppedSteps;
    this.gs1PoolFactory = options?.createGs1Pool ?? null;

    this.workerBridge = new AudioWorkerBridge();
    this.workletClock = new AudioWorkletClock();
    this.workletClock.setOnTick((_now) => {
      this.schedulerLoop();
    });

    this.loadAudioSettings();
    // The routing switch is module state the engines read; the stored setting is the truth.
    setGs1RoutingEnabled(this.gs1Enabled);
    this.initAudioContext();
  }

  /**
   * Initializes AudioContext safely (supports lazy activation on iOS / Safari)
   */
  public initAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    try {
      if (!this.ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
          // E-17 / N-16: one shared master graph for playback and export. Chain:
          //   fader → FX rack → loudness trim → true-peak limiter → analyser taps,
          // with the reverb/delay returns summing into the fader, exactly as before.
          const graph = buildMasterGraph(this.ctx, {
            analysers: true,
            loudnessTrimDb: this.appliedLoudnessTrimDb,
            // The graph owns the detector bus (A2); the strips connect into it as they are built, below.
            busCompDetector: "internal",
            limiterDetector: "internal",
          });
          this.masterGraph = graph;
          this.masterGain = graph.masterGain;
          this.gs1Pool?.dispose();
          this.gs1Pool = this.gs1PoolFactory
            ? this.gs1PoolFactory(this.ctx)
            : new Gs1VoicePool(this.ctx);
          this.limiter = graph.limiter.input;
          this.masterLimiter = graph.limiter;
          this.masterFxRack = graph.fxRack;
          this.loudnessTrimGain = graph.loudnessTrimGain;

          // Metering taps are owned by the graph; these references keep the rest of the
          // engine (analyser getters, spectrum/phase consumers) unchanged.
          this.analyser = graph.analyser;
          this.masterAnalyser = graph.masterAnalyser;
          this.analyserL = graph.analyserL;
          this.analyserR = graph.analyserR;
          this.createNoiseBuffer();
          this.setupTrackStrips(16);

          // Async init AudioWorklet clock (P5-01)
          this.workletClock.init(this.ctx).catch(() => {});
        }
      }

      if (this.ctx) {
        initIosAudioUnlock(this.ctx);
      }

      if (this.ctx && this.ctx.state === "suspended") {
        this.cleanupUnlockListeners();
        this.unlockHandler = () => {
          if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
          }
          initIosAudioUnlock(this.ctx).unlock();
          this.cleanupUnlockListeners();
        };
        window.addEventListener("click", this.unlockHandler, { once: true });
        window.addEventListener("touchstart", this.unlockHandler, { once: true });
        window.addEventListener("keydown", this.unlockHandler, { once: true });
      }
    } catch (e) {
      console.warn("[AudioEngine] Error initializing AudioContext:", e);
    }

    return this.ctx;
  }

  private cleanupUnlockListeners(): void {
    if (typeof window === "undefined" || !this.unlockHandler) return;
    window.removeEventListener("click", this.unlockHandler);
    window.removeEventListener("touchstart", this.unlockHandler);
    window.removeEventListener("keydown", this.unlockHandler);
    this.unlockHandler = null;
  }

  public async resume(): Promise<void> {
    initIosAudioUnlock(this.ctx).unlock();
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn("[AudioEngine] Error resuming AudioContext:", e);
      }
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    // V-01: seeded, not `Math.random()`. A random bed made every render differ from the
    // last, so the offline exporter could not be guaranteed to match playback and no
    // sample-level regression gate was possible.
    this.noiseBuffer = createSeededNoiseBuffer(this.ctx, 2);
  }

  // The reverb and delay send buses used to live here as a hard-coded convolver and a
  // 250 ms feedback delay with no damped loop and no reachable parameters. They are now
  // `ReverbBus` / `DelayBus`, built by `buildMasterGraph` so the offline renderer gets the
  // same buses (E-09 + E-17).

  /**
   * Semicircular slot for track `idx` (N-02). Drums sit in front, melodic tracks fan
   * out to the sides so the mix keeps a natural "band in front of you" image.
   */
  public getSpatialSlot(idx: number, total = 8): SpatialLayoutEntry {
    const clampedTotal = Math.max(2, total);
    const t = clampedTotal === 1 ? 0.5 : idx / (clampedTotal - 1);
    const azimuth = -70 + t * 140; // -70° (left) .. +70° (right)
    const distance = 1 + (idx % 3) * 0.25;
    const elevation = idx % 2 === 0 ? 4 : -4;
    return { azimuth, distance, elevation };
  }

  /** Writes a spatial slot onto a PannerNode using the AudioParams API. */
  private applyPannerPosition(panner: PannerNode, slot: SpatialLayoutEntry): void {
    const { azimuth, distance, elevation } = slot;
    const azimuthRad = (azimuth * Math.PI) / 180;
    const elevationRad = (elevation * Math.PI) / 180;
    const x = Math.sin(azimuthRad) * Math.cos(elevationRad) * distance;
    const y = Math.sin(elevationRad) * distance;
    const z = -Math.cos(azimuthRad) * Math.cos(elevationRad) * distance;

    try {
      const anyPanner = panner as unknown as {
        positionX?: AudioParam;
        positionY?: AudioParam;
        positionZ?: AudioParam;
      };
      if (anyPanner.positionX && anyPanner.positionY && anyPanner.positionZ) {
        const now = this.ctx ? this.ctx.currentTime : 0;
        anyPanner.positionX.setValueAtTime(x, now);
        anyPanner.positionY.setValueAtTime(y, now);
        anyPanner.positionZ.setValueAtTime(z, now);
      } else if (typeof (panner as unknown as { setPosition?: (x: number, y: number, z: number) => void }).setPosition === "function") {
        // Deprecated but still the only option on older engines.
        (panner as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(x, y, z);
      }
    } catch {
      // Position is cosmetic for the mix; never let it break playback.
    }
  }

  /**
   * Enables/disables binaural (HRTF) monitoring (N-02). Rebuilds the channel strips
   * with the appropriate panner, so the unused model costs no CPU. Voices scheduled
   * after this call use the new chain; currently sounding voices may be cut briefly,
   * which is why this is a monitoring-mode toggle and not a per-note effect.
   */
  public setSpatialMode(enabled: boolean): void {
    if (this.spatialEnabled === enabled) return;
    this.spatialEnabled = enabled;
    if (!this.ctx) return;
    const tracksToBuild = Math.max(16, this.pattern?.tracks?.length || 0);
    this.releaseTrackStrips();
    this.setupTrackStrips(tracksToBuild);
  }

  /**
   * Creates (or removes) a pass-through analyser per channel so a mixing view can show
   * real signal meters instead of an approximation. Off by default: 16 analysers cost
   * CPU and are only useful while such a view is mounted.
   */
  public enableTrackAnalysers(enabled: boolean): void {
    if (this.trackAnalysersEnabled === enabled) return;
    this.trackAnalysersEnabled = enabled;
    if (!this.ctx) return;
    const tracksToBuild = Math.max(16, this.pattern?.tracks?.length || 0);
    this.releaseTrackStrips();
    this.setupTrackStrips(tracksToBuild);
  }

  public areTrackAnalysersEnabled(): boolean {
    return this.trackAnalysersEnabled;
  }

  /** Real per-channel analyser, or null when meters are not enabled/available. */
  public getTrackAnalyser(trackIdx: number): AnalyserNode | null {
    return this.trackStrips[trackIdx]?.analyser ?? null;
  }

  /** Readonly access to the channel strips array. */
  public getTrackStrips(): readonly TrackChannelStrip[] {
    return this.trackStrips;
  }

  public getSpatialMode(): boolean {
    return this.spatialEnabled;
  }

  /** Current spatial slot of every track, for UI display. */
  public getSpatialLayout(trackCount = 8): SpatialLayoutEntry[] {
    return Array.from({ length: trackCount }, (_, i) => this.getSpatialSlot(i, trackCount));
  }

  /** Disconnects and drops the current strips (used when switching panner model). */
  private releaseTrackStrips(): void {
    for (const strip of this.trackStrips) {
      try {
        strip.gain.disconnect();
        strip.duckGain.disconnect();
        strip.polarity.disconnect();
        strip.analyser?.disconnect();
        strip.panner?.disconnect();
        strip.spatialPanner?.disconnect();
        strip.insert.dispose();
        strip.sendA.disconnect();
        strip.sendB.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.trackStrips = [];
    this.appliedInsertRefs = [];
    this.openHiHatVoices = [];
  }

  /**
   * E-11: the group bus a track belongs on.
   *
   * Tracks connect here rather than to the fader, so the glue stage cannot be bypassed by adding
   * a track. The role→bus decision lives in `trackBuses.ts` because the offline renderer has to
   * make exactly the same one.
   */
  /**
   * Where a hand-on-the-record scratch should play, and on which context.
   *
   * The scrub is a *manual* voice, so it goes into the music bus (through the insert chain, the fader
   * and the limiter, exactly like a note) rather than straight to the destination: that is what keeps it
   * inside the master ceiling and means the same context — and the same clock — as everything else.
   *
   * Returns `null` before the engine has been started, which is the honest answer: there is nothing to
   * play into yet.
   */
  public getScrubTarget(): { ctx: AudioContext; destination: AudioNode } | null {
    if (!this.ctx) return null;
    const destination = this.masterGraph ? this.masterGraph.musicBusInput : this.masterGain;
    if (!destination) return null;
    return { ctx: this.ctx, destination };
  }

  private busInputFor(trackIdx: number): GainNode {
    const fallback = this.masterGain!;
    if (!this.masterGraph) return fallback;
    const track = this.pattern?.tracks[trackIdx];
    const bus = resolveGroupBus(track?.track_id, track?.name);
    return bus === "drum" ? this.masterGraph.drumBusInput : this.masterGraph.musicBusInput;
  }

  private setupTrackStrips(numTracks?: number): void {
    if (!this.ctx || !this.masterGain) return;
    const count = numTracks ?? Math.max(16, this.pattern?.tracks?.length || 0);
    this.trackStrips = [];
    for (let i = 0; i < count; i++) {
      // E-10: voices feed the insert chain first, then the fader. The chain's defaults come
      // from the track's role, so every track arrives with a mixed channel strip.
      const role = this.pattern?.tracks[i]?.track_id;
      // Genre-aware: the role default is the starting point, the genre's patch is the
      // character (see `genreInsert.ts`). Both live + export resolve through the same call.
      const insert = new ChannelStrip(
        this.ctx,
        this.pattern?.tracks[i]?.insert ??
          resolveTrackInsertForGenre(role, this.pattern?.genre_id)
      );

      const duckGain = this.ctx.createGain();
      duckGain.gain.setValueAtTime(1, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.8, this.ctx.currentTime);

      insert.output.connect(duckGain);
      duckGain.connect(gain);

      // The pre-duck tap: same source as `duckGain`, so the sidechain cannot reach it.
      const detectorTap = this.ctx.createGain();
      detectorTap.gain.setValueAtTime(0.8, this.ctx.currentTime);
      insert.output.connect(detectorTap);
      const detectorBus = this.masterGraph?.duckDetectorInput ?? null;
      if (detectorBus) detectorTap.connect(detectorBus);

      const polarity = this.ctx.createGain();
      polarity.gain.setValueAtTime(1, this.ctx.currentTime);

      // Optional per-channel analyser: inserting it is transparent to the audio path.
      let analyser: AnalyserNode | null = null;
      let stripOut: AudioNode = polarity;
      if (this.trackAnalysersEnabled && typeof this.ctx.createAnalyser === "function") {
        analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        polarity.connect(analyser);
        stripOut = analyser;
      }

      let panner: StereoPannerNode | null = null;
      let spatialPanner: PannerNode | null = null;

      if (this.spatialEnabled && typeof this.ctx.createPanner === "function") {
        // N-02: binaural monitoring — every track sits on a semicircle around the
        // listener instead of being hard-panned in stereo.
        spatialPanner = this.ctx.createPanner();
        spatialPanner.panningModel = "HRTF";
        spatialPanner.distanceModel = "inverse";
        spatialPanner.refDistance = 1;
        spatialPanner.maxDistance = 12;
        spatialPanner.rolloffFactor = 0.6;
        const slot = this.getSpatialSlot(i, numTracks);
        this.applyPannerPosition(spatialPanner, slot);
        gain.connect(polarity);
        stripOut.connect(spatialPanner);
        spatialPanner.connect(this.busInputFor(i));
      } else if (typeof this.ctx.createStereoPanner === "function") {
        panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(0, this.ctx.currentTime);
        gain.connect(polarity);
        stripOut.connect(panner);
        panner.connect(this.busInputFor(i));
      } else {
        gain.connect(polarity);
        stripOut.connect(this.busInputFor(i));
      }

      /**
       * The sends tap **after** the panner, not before it.
       *
       * They used to tap `stripOut` — the polarity/analyser stage, which is *upstream* of the
       * `StereoPannerNode`. A hard-panned track therefore fed a mono, centred signal into the reverb
       * and the delay, so its wet tail returned in the middle of the image while the dry signal sat
       * on one side, and the per-genre curated sends lost the width they were curated for. The
       * offline renderer has always tapped post-pan (`tPan.connect(sendA)` in `WavExporter`), and its
       * comment claimed the live engine did the same — so playback and the exported file disagreed
       * about the one thing a send is for. Post-pan is also the conventional send point: the effect
       * follows its source.
       */
      const sendTap: AudioNode = panner ?? spatialPanner ?? stripOut;

      const sendA = this.ctx.createGain();
      sendA.gain.setValueAtTime(0, this.ctx.currentTime);
      if (this.masterGraph) {
        sendTap.connect(sendA);
        sendA.connect(this.masterGraph.reverb.input);
      }

      const sendB = this.ctx.createGain();
      sendB.gain.setValueAtTime(0, this.ctx.currentTime);
      if (this.masterGraph) {
        sendTap.connect(sendB);
        sendB.connect(this.masterGraph.delay.input);
      }

      this.trackStrips.push({
        gain,
        duckGain,
        detectorTap,
        polarity,
        analyser,
        panner,
        spatialPanner,
        sendA,
        sendB,
        insert,
      });
    }
    this.syncTrackGains();
  }

  public getTrackDestination(trackIdx: number): AudioNode {
    // E-10: the strip's entry point is the insert chain, not the fader.
    return this.trackStrips[trackIdx]?.insert.input || this.masterGain!;
  }

  public setPattern(pattern: SequencerPattern, resetStates = false): void {
    this.pattern = pattern;
    const neededTracks = Math.max(16, pattern.tracks?.length || 0);
    if (this.ctx && this.trackStrips.length < neededTracks) {
      this.releaseTrackStrips();
      this.setupTrackStrips(neededTracks);
    }
    if (pattern.totalSteps) {
      this.totalSteps = pattern.totalSteps;
    } else if (pattern.tracks && pattern.tracks.length > 0 && pattern.tracks[0].steps) {
      this.totalSteps = pattern.tracks[0].steps.length;
    } else {
      this.totalSteps = 16;
    }
    if (pattern.resolution) {
      this.resolution = pattern.resolution;
    }
    if (pattern.timeSignature) {
      this.timeSignature = pattern.timeSignature;
    }
    if (resetStates) {
      if (typeof pattern.bpm === "number" && pattern.bpm > 0) {
        this.setBpm(pattern.bpm);
      }
      if (typeof pattern.swing === "number") {
        this.setSwing(pattern.swing > 1 ? pattern.swing / 100 : pattern.swing);
      }
      const genreId = (pattern as any).genre_id || (pattern as any).genreId;
      if (genreId) {
        this.setDrumKit(getDefaultDrumKitForGenre({ id: genreId }));
      }
    }
    if (resetStates || this.trackStates.length !== pattern.tracks.length) {
      this.trackStates = deriveTrackStates(pattern);
    } else {
      // Synchronize trackStates (mute, solo, volume, pan, sends) with pattern tracks
      pattern.tracks.forEach((t, idx) => {
        if (this.trackStates[idx]) {
          if (t.mute !== undefined) this.trackStates[idx].mute = Boolean(t.mute);
          if (t.solo !== undefined) this.trackStates[idx].solo = Boolean(t.solo);
          if (t.volume !== undefined) this.trackStates[idx].volume = t.volume;
          if (t.pan !== undefined) this.trackStates[idx].pan = t.pan;
          if (t.sendA !== undefined) this.trackStates[idx].sendA = t.sendA;
          if (t.sendB !== undefined) this.trackStates[idx].sendB = t.sendB;
        }
      });
    }
    // E-10: apply each track's insert chain. A track with no stored chain takes the
    // role's factory default, which is what makes a freshly loaded genre arrive already
    // mixed rather than flat.
    //
    // Only the tracks whose chain actually changed are re-applied. `setPattern` runs on *every*
    // pattern commit — every step toggle, every timbre change, every coalesced drag — so pushing
    // all eight chains each time was pure repeated work on the main thread while the transport
    // was running. The resolved default is memoised per (genre, role), because
    // `resolveTrackInsertForGenre` builds a fresh object each call and identity is how "unchanged"
    // is decided here.
    this.pattern?.tracks.forEach((track, idx) => {
      const resolved = this.resolveInsertFor(track);
      if (this.appliedInsertRefs[idx] === resolved) return;
      this.appliedInsertRefs[idx] = resolved;
      this.patternInsertApplications += 1;
      this.setTrackInsert(idx, resolved);
    });
    this.syncTrackGains();
    // Loudness matching is *not* a per-track mix concern: it only needs the pattern's
    // genre id, so centralising it here covers the studio, every audition path, the
    // detail preview, the challenge view and both offline exporters at once.
    this.applyLoudnessTrimForPattern(pattern);
    // N-14: the genre's master FX and bus character, applied at the same moment and from
    // the same `genre_id` as the loudness trim.
    this.applyGenreFxForPattern(pattern);
  }

  /**
   * E-05: writes a mixer parameter without zipper noise.
   *
   * Pan and the two sends used to be stepped with `setValueAtTime` on every
   * `setTrackState` call — and the console issues one of those on *every frame* of a
   * knob drag — so dragging a pan pot or a send slider produced audible stepping.
   * Volume and polarity already ramped; this is the one helper the rest of the mixer
   * now goes through.
   *
   * The write is skipped when the parameter is already at the target, so the per-frame
   * cost is a comparison instead of a scheduled automation event.
   */
  private rampParam(param: AudioParam | null | undefined, target: number, now: number): void {
    if (!param) return;
    try {
      if (Math.abs(param.value - target) < 1e-4) return;
      if (typeof param.setTargetAtTime === "function") {
        if (typeof param.cancelScheduledValues === "function") param.cancelScheduledValues(now);
        param.setTargetAtTime(target, now, 0.01);
      } else if (typeof param.setValueAtTime === "function") {
        param.setValueAtTime(target, now);
      }
    } catch {
      /* Mixer cosmetics must never break playback. */
    }
  }

  /**
   * E-10: applies an insert-chain edit to one track.
   *
   * Merges over whatever the strip currently holds, so a UI that sends one field at a time
   * (the common case for a knob drag) behaves identically to one that sends the whole chain.
   */
  public setTrackInsert(trackIdx: number, patch: Partial<TrackInsertParams>): void {
    const strip = this.trackStrips[trackIdx];
    if (!strip) return;
    strip.insert.setParams(patch);
  }

  /**
   * Live gain reduction of a track's insert compressor, in dB (≤ 0).
   *
   * Read straight from the running `DynamicsCompressorNode`, so the effects page's meter is a
   * measurement of the audio path rather than a second estimate of it.
   */
  public getTrackCompressorReductionDb(trackIdx: number): number {
    // The insert chain owns the compressor node, so the reading comes from the strip that is
    // actually processing the track rather than from a parallel calculation.
    return this.trackStrips[trackIdx]?.insert.getCompressorReductionDb() ?? 0;
  }

  /** The insert chain a track is currently using, or null when the strip does not exist. */
  public getTrackInsert(trackIdx: number): TrackInsertParams | null {
    const strip = this.trackStrips[trackIdx];
    return strip ? strip.insert.getParams() : null;
  }

  /**
   * The chain a track should be using: its own stored chain, or the genre default for its role.
   *
   * Memoised because the resolver allocates, and `setPattern` needs a *stable* reference to tell
   * "this track did not change" from "this track changed".
   */
  private resolveInsertFor(track: SequencerTrack): TrackInsertParams {
    if (track.insert) return track.insert;
    const key = `${this.pattern?.genre_id ?? ""}|${track.track_id}`;
    const cached = this.resolvedInsertCache.get(key);
    if (cached) return cached;
    if (this.resolvedInsertCache.size > 512) this.resolvedInsertCache.clear();
    const resolved = resolveTrackInsertForGenre(track.track_id, this.pattern?.genre_id);
    this.resolvedInsertCache.set(key, resolved);
    return resolved;
  }

  /** How many per-track chains have been pushed since construction (diagnostic + test seam). */
  public getPatternInsertApplications(): number {
    return this.patternInsertApplications;
  }

  public syncTrackGains(): void {
    if (!this.ctx || this.trackStrips.length === 0) return;
    const anySolo = this.trackStates.some((t) => t.solo);
    const now = this.ctx.currentTime;

    this.trackStates.forEach((state, idx) => {
      const strip = this.trackStrips[idx];
      if (!strip) return;
      const track = this.pattern?.tracks[idx];
      const isDrum = track ? isDrumTrack(track, idx) : idx < 4;
      const isSilenced = Boolean(state.mute) || (anySolo && !state.solo) || (this.isDrumsOnly && !isDrum);
      const targetGain = isSilenced ? 0 : (state.volume !== undefined ? Math.max(0, Math.min(1.0, state.volume)) : 0.8);

      try {
        if (typeof strip.gain.gain.cancelScheduledValues === "function") {
          strip.gain.gain.cancelScheduledValues(now);
        }
        if (typeof strip.gain.gain.setTargetAtTime === "function") {
          strip.gain.gain.setTargetAtTime(targetGain, now, 0.005);
        } else if (typeof strip.gain.gain.setValueAtTime === "function") {
          strip.gain.gain.setValueAtTime(targetGain, now);
        }
      } catch (_) {
        try {
          if (typeof strip.gain.gain.setValueAtTime === "function") {
            strip.gain.gain.setValueAtTime(targetGain, now);
          }
        } catch (_) {}
      }

      // The detector tap follows the same volume (and the same silence), so a muted or quiet lane counts for exactly
      // what it contributes — but never the duck, which is applied between them.
      try {
        strip.detectorTap.gain.setTargetAtTime(targetGain, now, 0.005);
      } catch (_) {
        try {
          strip.detectorTap.gain.setValueAtTime(targetGain, now);
        } catch (_) {}
      }

      // Polarity (Ø): a 1 ms ramp keeps the flip click-free while staying effectively
      // instantaneous for the listener.
      try {
        const target = state.phaseInvert ? -1 : 1;
        if (strip.polarity.gain.value !== target) {
          if (typeof strip.polarity.gain.cancelScheduledValues === "function") {
            strip.polarity.gain.cancelScheduledValues(now);
          }
          if (typeof strip.polarity.gain.linearRampToValueAtTime === "function") {
            strip.polarity.gain.linearRampToValueAtTime(target, now + 0.001);
          } else {
            strip.polarity.gain.setValueAtTime(target, now);
          }
        }
      } catch {
        /* polarity is cosmetic for the mix; never let it break playback */
      }

      if (state.pan !== undefined && strip.panner) {
        this.rampParam(strip.panner.pan, Math.max(-1.0, Math.min(1.0, state.pan)), now);
      }
      // N-02: in binaural mode the pan control shifts the track's azimuth instead.
      if (state.pan !== undefined && strip.spatialPanner) {
        const base = this.getSpatialSlot(idx, this.trackStates.length || 8);
        const shifted: SpatialLayoutEntry = {
          ...base,
          azimuth: Math.max(-90, Math.min(90, base.azimuth + Math.max(-1, Math.min(1, state.pan)) * 30)),
        };
        this.applyPannerPosition(strip.spatialPanner, shifted);
      }
      if (state.sendA !== undefined && strip.sendA) {
        this.rampParam(strip.sendA.gain, isSilenced ? 0 : Math.max(0, Math.min(1.0, state.sendA)), now);
      }
      if (state.sendB !== undefined && strip.sendB) {
        this.rampParam(strip.sendB.gain, isSilenced ? 0 : Math.max(0, Math.min(1.0, state.sendB)), now);
      }
    });
  }

  public setTotalSteps(steps: number): void {
    this.totalSteps = Math.max(4, steps);
  }

  public getTotalSteps(): number {
    return this.totalSteps;
  }

  public setResolution(resolution: "1/8" | "1/16" | "1/32"): void {
    this.resolution = resolution;
  }

  public getResolution(): "1/8" | "1/16" | "1/32" {
    return this.resolution;
  }

  public setTimeSignature(sig: string): void {
    this.timeSignature = sig;
  }

  public getTimeSignature(): string {
    return this.timeSignature;
  }

  public getStepDuration(): number {
    const beatSec = 60.0 / this.bpm;
    const parts = (this.timeSignature || "4/4").split("/");
    const denom = parseInt(parts[1], 10) || 4;
    const baseSec = denom === 8 ? beatSec / 2 : denom === 2 ? beatSec * 2 : beatSec;

    if (this.resolution === "1/8") {
      return baseSec / 2;
    } else if (this.resolution === "1/32") {
      return baseSec / 8;
    }
    return baseSec / 4;
  }

  public setBpm(bpm: number): void {
    this.bpm = Math.max(30, Math.min(300, bpm));
    // A tempo-synced delay must follow the tempo, or a genre's dotted-eighth throw drifts
    // off the beat the moment the user nudges the BPM.
    if (this.appliedGenreFx?.delayDivision && this.masterGraph) {
      this.masterGraph.delay.setParams(delayParamsAtTempo(this.appliedGenreFx, this.bpm));
    }
    ecosystemBus.publishClockSync(this.bpm, this.isPlaying, this.currentStep);
  }

  public setSwing(swing: number): void {
    this.swing = Math.max(0, Math.min(0.75, swing));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public getSwing(): number {
    return this.swing;
  }

  private loadAudioSettings(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem("groove_audio_settings_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.latencyCompensationMs === "number") {
          this.latencyCompensationMs = parsed.latencyCompensationMs;
        }
        if (typeof parsed.hearingProtection === "boolean") {
          this.hearingProtection = parsed.hearingProtection;
        }
        if (typeof parsed.maxVolumeLimit === "number") {
          this.maxVolumeLimit = parsed.maxVolumeLimit;
        }
        if (typeof parsed.gs1Enabled === "boolean") {
          this.gs1Enabled = parsed.gs1Enabled;
        }
        if (typeof parsed.masterVolume === "number") {
          this.currentMasterVolume = Math.max(0, Math.min(1, parsed.masterVolume));
        }
      }
    } catch {
      // Ignore storage parse error
    }
  }

  private saveAudioSettings(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const data = {
        latencyCompensationMs: this.latencyCompensationMs,
        hearingProtection: this.hearingProtection,
        maxVolumeLimit: this.maxVolumeLimit,
        gs1Enabled: this.gs1Enabled,
        masterVolume: this.currentMasterVolume,
      };
      localStorage.setItem("groove_audio_settings_v1", JSON.stringify(data));
    } catch {
      // Ignore storage write error
    }
  }

  public getOutputLatency(): number {
    if (!this.ctx) return 0;
    const lat = (this.ctx as any).outputLatency || (this.ctx as any).baseLatency || 0;
    return Math.round(lat * 1000);
  }

  public getLatencyCompensation(): number {
    return this.latencyCompensationMs;
  }

  /**
   * E-12: lookahead introduced by the master true-peak limiter, in seconds.
   *
   * The whole master bus is delayed by this much on the worklet path (0 on the
   * compressor fallback). Live playback and the offline bounce are delayed identically,
   * so the exporter-parity rule is unaffected; the value is exposed for reporting and
   * for any future latency-compensation display.
   */
  public getMasterLimiterLatencySeconds(): number {
    return this.masterLimiter ? this.masterLimiter.latencySeconds : 0;
  }

  /** E-12: which master ceiling is installed ("worklet" or "fallback"). */
  public getMasterLimiterKind(): MasterLimiterKind {
    return this.masterLimiter ? this.masterLimiter.kind : "fallback";
  }

  public setLatencyCompensation(ms: number): void {
    this.latencyCompensationMs = Math.max(-100, Math.min(100, ms));
    this.saveAudioSettings();
  }

  public isHearingProtectionEnabled(): boolean {
    return this.hearingProtection;
  }

  /** True while GS-1 voices `chords`/`lead`. */
  public isGs1Enabled(): boolean {
    return this.gs1Enabled;
  }

  /**
   * Turn the GS-1 voices for `chords`/`lead` on or off.
   *
   * Applies immediately (the routing switch is what both engines consult) and persists. Turning it
   * off silences the loaded hosts so a note cannot hang, and the next notes are voiced natively.
   */
  public setGs1Enabled(enabled: boolean): void {
    this.gs1Enabled = enabled;
    setGs1RoutingEnabled(enabled);
    if (!enabled) {
      // Silence first, release later.
      //
      // This used to `getParams()`-free synchronously: `releaseAll()` + `dispose()` inside the
      // click handler, which tears down every worklet node and frees its WASM on the main thread
      // while the transport is running — the reported "switching it feels like it hangs". Notes
      // have to stop immediately, but the teardown does not have to happen before the next frame,
      // and if the user flips the switch back the loaded hosts are exactly what we want to keep.
      this.gs1Pool?.releaseAll();
      this.clearGs1DisposeTimer();
      this.gs1DisposeTimer = setTimeout(() => {
        this.gs1DisposeTimer = null;
        this.gs1Pool?.dispose();
        this.gs1Pool = null;
      }, GS1_DISABLE_GRACE_MS);
    } else {
      // Re-enabled inside the grace period: keep the hosts that are still loaded.
      this.clearGs1DisposeTimer();
    }
    this.saveAudioSettings();
  }

  private clearGs1DisposeTimer(): void {
    if (this.gs1DisposeTimer !== null) {
      clearTimeout(this.gs1DisposeTimer);
      this.gs1DisposeTimer = null;
    }
  }

  public setHearingProtection(enabled: boolean): void {
    this.hearingProtection = enabled;
    this.setMasterVolume(this.currentMasterVolume);
    this.saveAudioSettings();
  }

  public getMaxVolumeLimit(): number {
    return this.maxVolumeLimit;
  }

  public setMaxVolumeLimit(limit: number): void {
    this.maxVolumeLimit = Math.max(0.1, Math.min(1.0, limit));
    this.setMasterVolume(this.currentMasterVolume);
    this.saveAudioSettings();
  }

  /**
   * Master fader position (0..1). Reflects the persisted value, so a UI that mounts
   * later (the hardware console) shows the real level instead of guessing a default.
   */
  public getMasterVolume(): number {
    return this.currentMasterVolume;
  }

  /** Level actually applied to the master bus after hearing protection is enforced. */
  public getEffectiveMasterVolume(): number {
    return this.hearingProtection
      ? Math.min(this.maxVolumeLimit, this.currentMasterVolume)
      : this.currentMasterVolume;
  }

  public setMasterVolume(vol: number): void {
    this.currentMasterVolume = Math.max(0, Math.min(1.0, vol));
    const effective = this.hearingProtection
      ? Math.min(this.maxVolumeLimit, this.currentMasterVolume)
      : this.currentMasterVolume;
    if (this.masterGain && this.ctx) {
      /**
       * Q11: smooth the master fader instead of stepping it.
       *
       * `setValueAtTime` on every pointer move during a fader drag is a staircase — the
       * classic "zipper" artefact — and `setHearingProtection` / `setMaxVolumeLimit` both call
       * straight into here, so toggling the limiter also clicked. A 15 ms `setTargetAtTime`
       * reaches the new level within a frame or two and is inaudible as a step. The parameter
       * is pinned first so a target change mid-ramp starts from where the ramp actually is.
       */
      const param = this.masterGain.gain;
      const now = this.ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.max(0.0001, param.value), now);
      param.setTargetAtTime(Math.max(0.0001, effective), now, 0.015);
    }
    // Persisted so the level survives a reload and stays consistent across views.
    this.saveAudioSettings();
  }

  /**
   * Genre loudness matching — sets the master loudness trim.
   *
   * `db === null` returns to automatic mode (the trim is derived from the loaded
   * pattern's `genre_id` on every `setPattern`). A finite number pins an explicit
   * override, which is what the compare view needs for its merged `sync_*`
   * composite; a single-genre caller sharing that engine must reset it with
   * `setLoudnessTrimDb(null)` or the composite's value would leak into the audition.
   *
   * The fader (`getMasterVolume` / `getEffectiveMasterVolume`) and the hearing
   * protection clamp are intentionally untouched: this stage is separate, sits
   * before the limiter, and is clamped to the measured range.
   */
  public setLoudnessTrimDb(db: number | null): void {
    if (db === null || !Number.isFinite(db)) {
      this.loudnessTrimOverrideDb = null;
      // Returning to automatic mode must re-derive from whatever pattern is loaded,
      // not drop to 0 dB until the next setPattern.
      if (this.pattern) {
        this.applyLoudnessTrimForPattern(this.pattern);
      } else {
        this.applyLoudnessTrim(0);
      }
      return;
    }
    this.loudnessTrimOverrideDb = Math.max(
      LOUDNESS_TRIM_MIN_DB,
      Math.min(LOUDNESS_TRIM_MAX_DB, db)
    );
    this.applyLoudnessTrim(this.loudnessTrimOverrideDb);
  }

  /** Trim in dB currently applied to the master bus (0 when no genre is loaded). */
  public getLoudnessTrimDb(): number {
    return this.appliedLoudnessTrimDb;
  }

  /** Linear gain of the loudness-match stage — mirrors `dbToGain(getLoudnessTrimDb())`. */
  public getLoudnessTrimGain(): number {
    return dbToGain(this.appliedLoudnessTrimDb);
  }

  /** Resolves and applies the trim that the given pattern's genre asks for. */
  private applyLoudnessTrimForPattern(pattern: SequencerPattern): void {
    if (this.loudnessTrimOverrideDb !== null) {
      this.applyLoudnessTrim(this.loudnessTrimOverrideDb);
      return;
    }
    // Unknown ids (custom genres, imported patterns, masterclass + sync composites)
    // deliberately get 0 dB rather than a guess.
    this.applyLoudnessTrim(resolveGenreMix(pattern.genre_id) ? getGenreLoudnessTrimDb(pattern.genre_id) : 0);
  }

  /**
   * Applies a genre's master FX rack and send-bus character (N-14).
   *
   * Mirrors `applyLoudnessTrimForPattern`: same trigger point, same `genre_id`, same
   * "unknown genre means do nothing" rule. The delay's musical division is converted with
   * the **playing** tempo (`pattern.bpm`), never the genre's metadata `default_bpm` — 87 of
   * 159 genres declare a pattern tempo that differs from their metadata tempo, so using
   * the wrong one would put the repeats off the beat on more than half the library.
   */
  private applyGenreFxForPattern(pattern: SequencerPattern): void {
    if (this.genreFxOverride) {
      this.applyGenreFx(this.genreFxOverride, pattern.bpm || this.bpm);
      return;
    }
    this.applyGenreFx(resolveGenreFx(pattern.genre_id), pattern.bpm || this.bpm);
  }

  private applyGenreFx(fx: GenreFxProfile | null, playingBpm: number): void {
    this.appliedGenreFx = fx;
    // Unknown genre: leave the rack and buses exactly as the user left them.
    if (!fx) return;

    // One shared applier (see `genreFx.ts`), so playback and the offline bounce cannot
    // diverge in how a genre's FX are applied.
    if (this.masterGraph) applyGenreFxToGraph(this.masterGraph, fx, playingBpm);
  }

  /** The genre FX profile currently in effect, or null for an unknown genre. */
  public getAppliedGenreFx(): GenreFxProfile | null {
    return this.appliedGenreFx;
  }

  /**
   * Pins the FX profile explicitly (or `null` to return to deriving it from the pattern).
   * Only the compare view's merged composite needs this today, exactly like the loudness
   * trim override: a composite carries a synthetic genre id that resolves to no genre.
   */
  public setGenreFxOverride(fx: GenreFxProfile | null): void {
    this.genreFxOverride = fx;
    if (this.pattern) this.applyGenreFxForPattern(this.pattern);
  }

  private applyLoudnessTrim(db: number): void {
    const clamped = Math.max(LOUDNESS_TRIM_MIN_DB, Math.min(LOUDNESS_TRIM_MAX_DB, db));
    this.appliedLoudnessTrimDb = Number.isFinite(clamped) ? clamped : 0;
    // Delegated to the shared graph so the offline renderer applies the trim through the
    // identical code path (E-17). The graph ramps it, so a genre switch is silent.
    this.masterGraph?.setLoudnessTrimDb(this.appliedLoudnessTrimDb);
  }

  public setTrackState(trackIdx: number, state: Partial<TrackState>): void {
    if (!this.trackStates[trackIdx]) {
      this.trackStates[trackIdx] = {
        mute: false,
        solo: false,
        volume: 0.8,
        pan: 0,
        sendA: 0,
        sendB: 0,
        phaseInvert: false,
      };
    }
    this.trackStates[trackIdx] = { ...this.trackStates[trackIdx], ...state };
    this.syncTrackGains();
  }

  public getTrackState(trackIdx: number): TrackState | undefined {
    return this.trackStates[trackIdx];
  }

  public getTrackStates(): TrackState[] {
    return [...this.trackStates];
  }

  public setMetronome(enabled: boolean): void {
    this.isMetronome = enabled;
  }

  public getMetronome(): boolean {
    return this.isMetronome;
  }

  public setCountIn(enabled: boolean): void {
    this.isCountIn = enabled;
  }

  public getCountIn(): boolean {
    return this.isCountIn;
  }

  public setLoopRange(range: [number, number] | null): void {
    if (range && range[0] < range[1]) {
      this.loopRange = range;
    } else {
      this.loopRange = null;
    }
  }

  public getLoopRange(): [number, number] | null {
    return this.loopRange;
  }

  /**
   * Restricts the transport to one track's lane over a step range — the piano roll's isolated
   * preview.
   *
   * While a scope is set the scheduler emits **only** that track and wraps inside
   * `[fromStep, toStep)`, reusing the ordinary transport (and therefore the ordinary lookahead
   * scheduler, voice path, playhead reporting and `stop()`). Nothing else on the engine is
   * mutated: `trackStates` is untouched, so the preview cannot leave mute/solo behind, and the
   * caller does not have to restore anything beyond clearing the scope.
   *
   * `null` clears it. Out-of-range or inverted spans clear it rather than silently playing the
   * whole pattern, because a preview that quietly plays everything is worse than no preview.
   */
  public setPreviewScope(scope: { trackIdx: number; fromStep: number; toStep: number } | null): void {
    if (!scope) {
      this.previewScope = null;
      return;
    }
    const from = Math.max(0, Math.floor(scope.fromStep));
    const to = Math.floor(scope.toStep);
    const trackIdx = Math.floor(scope.trackIdx);
    const trackCount = this.pattern?.tracks?.length ?? 0;
    if (!(to > from) || trackIdx < 0 || (trackCount > 0 && trackIdx >= trackCount)) {
      this.previewScope = null;
      return;
    }
    this.previewScope = { trackIdx, fromStep: from, toStep: to };
  }

  public getPreviewScope(): { trackIdx: number; fromStep: number; toStep: number } | null {
    return this.previewScope ? { ...this.previewScope } : null;
  }

  /**
   * Start playing **only** `scope`, atomically.
   *
   * `play()` clears any scope (see its comment), so a caller that wants a scoped run cannot do
   * `setPreviewScope(...)` followed by `play()` — the scope would be gone before the first step was
   * scheduled. This is the one entry point that sets a scope and starts in the same call. Returns
   * whether the engine accepted the scope, so the caller reports what happened rather than assuming.
   */
  public playScoped(scope: { trackIdx: number; fromStep: number; toStep: number }): boolean {
    this.setPreviewScope(scope);
    if (!this.previewScope) return false;
    void this.play({ keepPreviewScope: true });
    return true;
  }

  public setDrumsOnly(enabled: boolean): void {
    this.isDrumsOnly = enabled;
    this.syncTrackGains();
  }

  public getDrumsOnly(): boolean {
    return this.isDrumsOnly;
  }

  public static calculateTapTempo(taps: number[]): number {
    if (taps.length < 2) return 120;
    const intervals: number[] = [];
    for (let i = 1; i < taps.length; i++) {
      intervals.push(taps[i] - taps[i - 1]);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avg <= 0) return 120;
    const bpm = Math.round(60000 / avg);
    return Math.max(40, Math.min(240, bpm));
  }

  private playMetronome(time: number, isDownbeat: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, time);

    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.05);
    this.registerVoice(osc, gain, time + 0.05);
  }

  /**
   * Registers a scheduled voice to allow immediate cancellation on stop/pause (panic)
   */
  private registerVoice(source: AudioScheduledSourceNode, gain: GainNode, stopTime: number): void {
    this.voiceRegistry.register(source, gain, stopTime);
  }

  /**
   * Cancels all scheduled voices with a fast 5ms release ramp to prevent hanging notes and clicks.
   *
   * GS-1 notes are allocated inside the worklet's own voice table, not in the native
   * `voiceRegistry`, so panicking only the registry left them ringing — which is the "a few notes
   * still sound after I hit stop" report. A sustain pad is scheduled three steps long, so those
   * tails were audible for up to a second after the transport stopped. The pool's all-notes-off
   * silences them without tearing the hosts down, so playback can resume immediately.
   */
  public panic(): void {
    this.voiceRegistry.panic();
    this.gs1Pool?.releaseAll();
    this.openHiHatVoices = [];
  }

  public async play(options: { keepPreviewScope?: boolean } = {}): Promise<void> {
    /**
     * A full play clears any preview scope, because that is what the user just asked for.
     *
     * The scope exists so the piano roll can loop one lane in isolation; while it is set, the
     * scheduler skips every other track. Pressing the arrangement's own Play button with a scope
     * left over therefore played *only that lane*, with nothing on screen saying so — reported as
     * "after writing a chord progression, playback in the workspace only plays the chords". The
     * scope belongs to the preview, not to the transport, so the transport clears it.
     *
     * `keepPreviewScope` is the one visible exception, and only `playScoped` passes it: a scoped run
     * has to keep the scope it just set. Making it a named option rather than a second method keeps
     * the clearing in one place, so a future caller cannot get the old behaviour by accident.
     */
    const scoped = options.keepPreviewScope ? this.previewScope : null;
    if (!options.keepPreviewScope) this.previewScope = null;
    if (!this.ctx) {
      this.initAudioContext();
    }
    initIosAudioUnlock(this.ctx).unlock();
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (this.isPlaying) return;

    this.isPlaying = true;
    if (this.onPlayCallback) {
      this.onPlayCallback();
    }
    ecosystemBus.publishClockStart(this.bpm);
    // `scoped`, not `this.previewScope`: a full play cleared the property just above, and a scoped
    // run has already had its scope read into this local.
    this.currentStep = scoped
      ? scoped.fromStep
      : this.loopRange && this.loopRange[0] >= 0
        ? this.loopRange[0]
        : 0;
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (this.isCountIn) {
      const beatSec = 60.0 / this.bpm;
      for (let b = 0; b < 4; b++) {
        this.playMetronome(now + 0.035 + b * beatSec, b === 0);
      }
      this.nextStepTime = now + 0.035 + 4 * beatSec;
    } else {
      this.nextStepTime = now + 0.035;
    }
    this.stepQueue = [];
    this.lastReportedStep = -1;

    // P4-05: Soft fade-in prevents speaker pops and protects hearing
    if (this.masterGain && this.ctx) {
      const effective = this.hearingProtection
        ? Math.min(this.maxVolumeLimit, this.currentMasterVolume)
        : this.currentMasterVolume;
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.setValueAtTime(0.001, t);
      this.masterGain.gain.exponentialRampToValueAtTime(Math.max(0.001, effective), t + 0.035);
    }

    this.schedulerLoop();
    this.startScheduler();
    this.startPlayheadSync();
  }

  public pause(): void {
    this.isPlaying = false;
    ecosystemBus.publishClockStop();
    this.stopScheduler();
    this.stopPlayheadSync();
    this.panic();
    if (this.onStopCallback) {
      this.onStopCallback();
    }
  }

  public stop(): void {
    this.isPlaying = false;
    ecosystemBus.publishClockStop();
    this.stopScheduler();
    this.stopPlayheadSync();
    this.panic();
    this.currentStep = 0;
    this.lastReportedStep = -1;
    this.stepQueue = [];
    if (this.onStopCallback) {
      this.onStopCallback();
    }
  }

  /**
   * Replaces the step callback without recreating the engine.
   *
   * `onStep` used to be constructable only, unlike `onPlay` and `onStop`. That asymmetry is why
   * every view built its engine inside an effect and then had to keep that effect's dependencies
   * stable: a callback that captured changing state forced a full engine teardown and rebuild, which
   * drops every scheduled voice and re-allocates the graph mid-session. With this setter a caller can
   * own one engine and keep its callback current, which is what `useAudioEngineInstance` does.
   */
  public setOnStep(cb: (info: StepCallbackInfo) => void): void {
    this.onStepCallback = cb;
  }

  public setOnPlay(cb: () => void): void {
    this.onPlayCallback = cb;
  }

  public setOnStop(cb: () => void): void {
    this.onStopCallback = cb;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getMasterAnalyser(): AnalyserNode | null {
    return this.masterAnalyser || this.analyser;
  }

  public getStereoAnalysers(): { left: AnalyserNode | null; right: AnalyserNode | null } {
    return {
      left: this.analyserL || this.analyser,
      right: this.analyserR || this.analyser,
    };
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Whether audio cannot currently be heard even though the transport may be running.
   *
   * The iOS silent switch (and any browser that refuses to resume a suspended context without a
   * fresh gesture) leaves `state === "suspended"`: `play()` returns, the scheduler starts, the
   * playhead advances, and **nothing is audible**. That is worse than a failure, because the UI
   * asserts success — the button lights up and the user concludes the app is broken.
   *
   * So the state is exposed rather than assumed: callers start playback, then ask. `null` context
   * means audio was never initialised, which is also "cannot be heard".
   */
  public isAudioBlocked(): boolean {
    return !this.ctx || this.ctx.state !== "running";
  }

  public getCurrentStep(): number {
    return this.currentStep;
  }

  /** Scheduler health snapshot (F-01/F-02) — used by tests and diagnostics. */
  public getSchedulerHealth(): { droppedSteps: number; schedulingErrors: number; queuedSteps: number } {
    return {
      droppedSteps: this.droppedStepCount,
      schedulingErrors: this.schedulingErrorCount,
      queuedSteps: this.stepQueue.length,
    };
  }

  private startScheduler(): void {
    if (this.scheduleTimerId) {
      clearInterval(this.scheduleTimerId);
      this.scheduleTimerId = null;
    }

    // Primary clock source: AudioWorkletClock (sample-accurate AudioWorklet with Worker fallback, P5-01)
    const rate = this.ctx ? this.ctx.sampleRate : 44100;
    this.workletClock.start(this.lookaheadMs, rate);

    // Watchdog backup interval ensures scheduling loop keeps running without any stalls
    this.scheduleTimerId = setInterval(() => {
      if (this.isPlaying) {
        this.schedulerLoop();
      }
    }, 40);
  }

  private stopScheduler(): void {
    this.workletClock.stop();
    if (this.scheduleTimerId) {
      clearInterval(this.scheduleTimerId);
      this.scheduleTimerId = null;
    }
  }

  private startPlayheadSync(): void {
    const sync = () => {
      if (!this.isPlaying || !this.ctx) return;

      // A-07: a hidden tab keeps scheduling audio but needs no visual playhead, so
      // drop the backlog instead of letting it accumulate for hours.
      if (typeof document !== "undefined" && document.hidden) {
        this.stepQueue.length = 0;
        if (typeof requestAnimationFrame !== "undefined") {
          this.rafId = requestAnimationFrame(sync);
        }
        return;
      }

      const now = this.ctx.currentTime;
      /**
       * "The playhead is early" (item 7): a voice scheduled at `t` is *rendered* at `t` but
       * reaches the speakers at `t + outputLatency`, so advancing the playhead the instant
       * `currentTime` passes the scheduled time puts the picture ahead of the sound. The fix
       * is to compare against a time that has already reached the listener.
       *
       * The compensation is clamped to half a step, and it is 0 wherever the browser reports
       * no latency — which is why the tests and the offline bounce are unaffected.
       */
      const visualLeadSec = visualLeadSeconds({
        outputLatencySec: this.getOutputLatency() / 1000,
        limiterLatencySec: this.getMasterLimiterLatencySeconds(),
        compensationMs: this.latencyCompensationMs,
        stepDur: this.getStepDuration(),
      });

      let latestStep = -1;
      let latestTime = 0;

      while (this.stepQueue.length > 0 && this.stepQueue[0].time <= now + visualLeadSec) {
        const item = this.stepQueue.shift()!;
        latestStep = item.step;
        latestTime = item.time;
        if (item.activeTracks.length > 0 && this.onTrackTriggerCallback) {
          this.onTrackTriggerCallback(item.activeTracks);
        }
      }

      if (latestStep !== -1 && latestStep !== this.lastReportedStep) {
        this.lastReportedStep = latestStep;
        if (this.onStepCallback) {
          this.onStepCallback({ step: latestStep, time: latestTime });
        }
      }

      if (typeof requestAnimationFrame !== "undefined") {
        this.rafId = requestAnimationFrame(sync);
      }
    };

    if (typeof requestAnimationFrame !== "undefined") {
      this.rafId = requestAnimationFrame(sync);
    }
  }

  private stopPlayheadSync(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public setOnTrackTrigger(callback?: (trackIndices: number[]) => void): void {
    this.onTrackTriggerCallback = callback;
  }

  private schedulerLoop(): void {
    if (!this.ctx || !this.isPlaying || !this.pattern) return;

    const stepDur = this.getStepDuration();
    // A preview plays the scope's own range, not the pattern or the transport loop.
    const preview = this.previewScope;
    const stepsCount = preview
      ? Math.max(1, preview.toStep - preview.fromStep)
      : this.totalSteps > 0
        ? this.totalSteps
        : 16;
    const rangeStart = preview ? preview.fromStep : null;

    // F-02: recover from a stall (backgrounded tab, GC pause, iOS suspend → resume,
    // a heavy render pass) instead of firing every missed step at "now".
    // Without this, `Math.max(currentTime, …)` below clamps a whole backlog onto the
    // same instant and the result is a burst of coincident voices, not music.
    const now = this.ctx.currentTime;
    const catchUp = computeCatchUp({
      currentStep: this.currentStep,
      nextStepTime: this.nextStepTime,
      now,
      stepDur,
      stepsCount,
      loopRange: this.loopRange,
    });
    if (catchUp.droppedSteps > 0) {
      this.currentStep = catchUp.currentStep;
      this.nextStepTime = catchUp.nextStepTime;
      this.droppedStepCount += catchUp.droppedSteps;
      if (this.onDroppedStepsCallback) {
        this.onDroppedStepsCallback(catchUp.droppedSteps);
      }
    }

    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAheadSec) {
      let step = this.currentStep;
      if (rangeStart !== null) {
        // Preview scope owns the range: wrap inside it and ignore the transport loop.
        const lEnd = rangeStart + stepsCount;
        if (step < rangeStart || step >= lEnd) {
          step = rangeStart;
          this.currentStep = rangeStart;
        }
      } else if (this.loopRange) {
        const [lStart, lEnd] = this.loopRange;
        if (step < lStart || step >= lEnd) {
          step = lStart;
          this.currentStep = lStart;
        }
      }

      // P0.5: the off-8th moves the full amount and the off-16ths half (see `audio/swing.ts`); the old
      // odd-step-only rule left every 8th-note pattern dead straight.
      const swingOffset = swingOffsetSeconds(step, this.swing, stepDur);
      const latencyOffset = this.latencyCompensationMs / 1000;
      const actualStepTime = Math.max(this.ctx.currentTime, this.nextStepTime + swingOffset + latencyOffset);

      // F-01: a throw from any single voice must never wedge the transport.
      // The grid advances unconditionally below, so a bad step is skipped, not replayed forever.
      try {
        if (this.isMetronome) {
          const isDownbeat = (step % 4 === 0);
          this.playMetronome(actualStepTime, isDownbeat);
        }

        const activeTracks = this.scheduleStep(step, actualStepTime, stepDur);
        this.stepQueue.push({ step, time: actualStepTime, activeTracks });
        if (this.stepQueue.length > AudioEngine.MAX_STEP_QUEUE) {
          this.stepQueue.splice(0, this.stepQueue.length - AudioEngine.MAX_STEP_QUEUE);
        }
      } catch (err) {
        this.schedulingErrorCount += 1;
        if (this.schedulingErrorCount <= 5) {
          console.warn(`[AudioEngine] step ${step} failed to schedule; continuing transport`, err);
        }
      }

      // Keep monotonic un-swung grid advancement
      this.nextStepTime += stepDur;
      if (rangeStart !== null) {
        this.currentStep = rangeStart + ((this.currentStep - rangeStart + 1) % stepsCount);
      } else if (this.loopRange) {
        const [lStart, lEnd] = this.loopRange;
        const loopLen = Math.max(1, lEnd - lStart);
        this.currentStep = lStart + ((this.currentStep - lStart + 1) % loopLen);
      } else {
        this.currentStep = (this.currentStep + 1) % stepsCount;
      }
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number): number[] {
    const activeTracks: number[] = [];
    if (!this.pattern || !this.ctx) return activeTracks;
    // Narrowed once for the callbacks below, where `this.ctx` would widen back to nullable.
    const ctx = this.ctx;

    const anySolo = this.trackStates.some((t) => t.solo);

    this.pattern.tracks.forEach((track, trackIdx) => {
      const state = this.trackStates[trackIdx] || { mute: false, solo: false, volume: 0.8, pan: 0 };
      if (state.mute) return;
      if (anySolo && !state.solo) return;
      if (this.isDrumsOnly && !isDrumTrack(track, trackIdx)) return;
      /**
       * Isolated preview: skip every track but the previewed one.
       *
       * This sits *after* the mute/solo/drums-only rules on purpose — the preview then shows the
       * track as the mix actually treats it instead of overriding the user's own solo/mute.
       */
      if (this.previewScope && trackIdx !== this.previewScope.trackIdx) return;

      // Independent track loop length (Polymeter)
      const trackLen = (track.trackLength && track.trackLength > 0)
        ? track.trackLength
        : (track.steps ? track.steps.length : 16);
      const stepIdx = trackLen > 0 ? step % trackLen : step;

      const stepVal = track.steps ? track.steps[stepIdx] : 0;
      const isStepActive = stepVal > 0;
      if (!isStepActive) return;

      // Probability check (Chance: 0 - 100)
      // V-01 note: this is the one place where live playback is deliberately NOT
      // identical to an export. Chance is a performance feature, so live rolls
      // `Math.random()` on every pass; the three exporters share the seeded
      // `probabilityPasses()` in `noteEvents.ts` instead, so re-exporting a project
      // always yields the same notes. Do not "fix" this by seeding live playback.
      const prob = (track.probability && track.probability[stepIdx] !== undefined)
        ? track.probability[stepIdx]
        : 100;
      if (prob < 100 && Math.random() * 100 > prob) {
        return;
      }

      const velVal = track.velocity && track.velocity[stepIdx] !== undefined ? track.velocity[stepIdx] : 100;
      // H-01/F-03: track volume is applied exactly once, by the track strip gain node.
      // It used to be multiplied into the velocity as well (amplitude ∝ volume²),
      // which made live playback disagree with the offline WAV renderer.
      const normalizedVel = velVal / 127;
      const pitchVal = track.pitch && track.pitch[stepIdx] !== undefined && track.pitch[stepIdx] !== null ? track.pitch[stepIdx]! : 0;
      const gateVal = (track.gate && track.gate[stepIdx] !== undefined) ? track.gate[stepIdx] : 0.8;

      // Independent per-track swing offset
      const trackSwingOffset = (track.swing !== undefined ? track.swing / 100 : 0);
      const effSwing = Math.max(0, Math.min(0.75, this.swing + trackSwingOffset));
      /**
       * M11: a track with its own swing must carry the same two live-only adjustments the caller
       * already folded into `time` — the latency compensation every voice is shifted by, and the
       * `>= currentTime` clamp that keeps a late step in the future.
       *
       * This branch rebuilt the time from `nextStepTime` alone, so a track with independent swing
       * fired a full latency-compensation ahead of every other track, and ahead of its own export
       * (a bounce has no output latency to compensate). Only the swing term may differ here.
       */
      const trackStepTime = (swingMovesStep(step) && effSwing !== this.swing)
        ? Math.max(
            ctx.currentTime,
            this.nextStepTime + (effSwing * 0.5) * stepDur + this.latencyCompensationMs / 1000
          )
        : time;

      // Ratchet / Subdivisions
      const isHatTriplet = (track.track_id === "hihat" || track.name.toLowerCase().includes("hat")) && stepVal === 3;
      /**
       * Q10: route through the same `resolveRatchet` the exporters use.
       *
       * Live playback took `track.ratchet[stepIdx]` raw, while every exporter clamps it to
       * 1..8 (`noteEvents.ts`). A malformed or imported value — or simply a corrupt pattern —
       * therefore fired an unbounded burst of voices in one step live, and the live take could
       * never match its own bounce. One shared function is the only way those two stay equal.
       */
      const ratchet = resolveRatchet(
        track.ratchet ? track.ratchet[stepIdx] : undefined,
        isHatTriplet
      );

      activeTracks.push(trackIdx);

      if (ratchet > 1) {
        const subDur = stepDur / ratchet;
        for (let r = 0; r < ratchet; r++) {
          const subTime = trackStepTime + r * subDur;
          const subVel = normalizedVel * ratchetVelocityScale(r, ratchet);
          this.triggerInstrument(trackIdx, track.name, subTime, subVel, pitchVal, stepVal, subDur, gateVal, false, noisePositionFor(trackIdx, stepIdx, r), stepIdx);
        }
      } else {
        this.triggerInstrument(trackIdx, track.name, trackStepTime, normalizedVel, pitchVal, stepVal, stepDur, gateVal, false, noisePositionFor(trackIdx, stepIdx), stepIdx);
      }
    });

    return activeTracks;
  }

  /**
   * Converts MIDI note number to frequency in Hertz
   */
  public static midiToFreq(midiNote: number | null | undefined, fallbackNote = 60): number {
    const note = (midiNote !== undefined && midiNote !== null && midiNote > 0) ? midiNote : fallbackNote;
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  /**
   * Preview a single track note immediately
   */
  public triggerNote(
    trackIdx: number,
    trackName: string,
    velocity = 0.8,
    pitch: number | null = 0,
    stepVal = 1,
    gateVal = 0.8,
    stepIdx = -1,
    /**
     * Play *this* instrument instead of the track's declared one.
     *
     * A manual hit is allowed to be about a sound rather than a lane: the phone's clap and rimshot pads
     * write into the snare lane (that is where a backbeat lives) but they are their own models, and
     * auditioning them as the lane's declared instrument would make two different pads sound identical.
     * The scheduler never passes it, so a pattern still renders exactly as its data says.
     */
    instrumentOverride?: string
  ): void {
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return;
    initIosAudioUnlock(this.ctx).unlock();
    if (this.ctx.state === "suspended") this.ctx.resume();
    const stepDur = this.getStepDuration();
    const trackId = (this.pattern?.tracks[trackIdx]?.track_id || "").toLowerCase();
    const lowerName = trackName.toLowerCase();
    const defaultPitch =
      trackId === "bass" || lowerName.includes("bass")
        ? 48
        : trackId === "chords" || trackId === "chord" || lowerName.includes("chord") || lowerName.includes("pad")
        ? 60
        : trackId === "lead" || lowerName.includes("lead")
        ? 72
        : 0;
    const pitchVal = pitch !== null && pitch !== undefined && pitch > 0 ? pitch : defaultPitch;

    // P5-05: Real-time Live Sequencer Recording
    if (this.isPlaying && this.liveRecorder.getIsArmed()) {
      this.liveRecorder.recordTrigger(trackIdx, pitchVal, velocity, this.currentStep, this.totalSteps);
    }

    this.triggerInstrument(trackIdx, trackName, this.ctx.currentTime, velocity, pitchVal, stepVal, stepDur, gateVal, true, 0, stepIdx);
  }

  /**
   * Audition a **complete chord** in one call — the notes as one voicing.
   *
   * Why this exists: `triggerNote` is a single-note preview, and on a `chords` track it routes
   * through the same genre treatment the sequencer uses, which *voices the note it is given*.
   * Calling it once per chord member therefore harmonised every member — a four-note chord
   * produced twelve voices in the same register (measured: 24 oscillators instead of 8), which
   * is the "chord audition sounds wrong" report. Passing the finished voicing here plays exactly
   * those notes, through the same filter/preset/insert path the arrangement will use, and through
   * the track's own destination so what is heard is what is mixed.
   *
   * `notes` is the voicing the caller is about to write, so audition and result cannot differ.
   */
  public previewChord(
    trackIdx: number,
    trackName: string,
    notes: number[],
    velocity = 0.8,
    durationSeconds?: number
  ): void {
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return;
    initIosAudioUnlock(this.ctx).unlock();
    if (this.ctx.state === "suspended") this.ctx.resume();

    const voiced = (Array.isArray(notes) ? notes : []).filter((n) => Number.isFinite(n) && n > 0);
    if (voiced.length === 0) return;

    // One voice per note, all sharing a single onset and a single duration — a chord, not a
    // sequence of notes. The duration is expressed in the caller's seconds (the piano roll uses
    // its own step length) so the audition matches the bar length it is previewing.
    const stepDur = this.getStepDuration();
    const gateVal =
      durationSeconds !== undefined && stepDur > 0
        ? Math.max(0.05, Math.min(MAX_NOTE_GATE_STEPS, durationSeconds / stepDur))
        : 0.9;

    const track = this.pattern?.tracks?.[trackIdx];
    const preset = resolveInstrumentPreset(track?.instrument, (track?.track_id || "").toLowerCase());
    const treatment = resolveChordTreatment(this.pattern?.genre_id, track?.instrument);
    const effective: ChordTreatment =
      treatment ?? { style: "triad", articulation: "block", gateScale: 1, strumSeconds: CHORD_STRUM_SEC };

    const dest = this.getTrackDestination(trackIdx);
    const start = Math.max(this.ctx.currentTime, safeTime(this.ctx.currentTime, this.ctx.currentTime));
    const dur = chordNoteDuration(stepDur, gateVal, effective);
    const voiceVel = safeVelocity(velocity) * chordVoiceGain(voiced.length);

    voiced.forEach((note, i) => {
      const voice = playPolySynthNote(this.ctx!, dest, note, chordVoiceOnset(start, i, effective), dur, voiceVel, preset);
      voice.sources.forEach((src, idx) => {
        this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
      });
    });
    void trackName;
  }

  private triggerInstrument(
    trackIdx: number,
    trackName: string,
    time: number,
    vel: number,
    pitch: number,
    stepVal = 1,
    stepDur = 0.125,
    gateVal = 0.8,
    isAudition = false,
    /**
     * E-06: deterministic position used to pick each hit's noise read offset, so repeated
     * hits are not bit-identical. Must be derived only from values the offline renderer
     * can reproduce (track/step/ratchet index) — never from a clock — or exporter parity
     * breaks.
     */
    noisePosition = 0,
    /**
     * Which step of the pattern this voice belongs to, or `-1` for an audition.
     *
     * Needed by the chords track: a genre whose chords are expanded into the pattern carries the
     * actual notes per step in `pitches`, and the voice must play *those* rather than a voicing of
     * the root.
     */
    stepIdx = -1,
    /**
     * Play *this* instrument instead of the track's declared one.
     *
     * A manual hit may be about a sound rather than a lane: the phone's clap and rimshot pads write into
     * the snare lane (that is where a backbeat lives) but they are their own models, and auditioning them
     * as the lane's declared instrument would make two different pads sound identical. The scheduler never
     * passes it, so a pattern still renders exactly as its data says.
     */
    instrumentOverride?: string
  ): void {
    if (!this.ctx) return;
    const dest = isAudition ? (this.masterGain || this.getTrackDestination(trackIdx)) : this.getTrackDestination(trackIdx);

    // F-01: every voice funnels through here, so this is the single choke point that
    // keeps user-controlled zeros (muted fader, velocity 0, NaN from a bad import)
    // out of `exponentialRampToValueAtTime`, which would otherwise throw and wedge
    // the scheduler loop for the rest of the session.
    const safeVel = safeVelocity(vel);
    const safeStartTime = Math.max(this.ctx.currentTime, safeTime(time, this.ctx.currentTime));

    const trackId = (this.pattern?.tracks[trackIdx]?.track_id || "").toLowerCase();
    const lowerName = trackName.toLowerCase();
    // Timbre fix: the genre data declares a per-track instrument; resolve it once here
    // instead of always reaching for the fixed per-role preset. Drum voices never use
    // this preset — their dispatch below is untouched.
    const synthPreset = resolveInstrumentPreset(this.pattern?.tracks[trackIdx]?.instrument, trackId);

    if (trackId === "kick" || lowerName.includes("kick")) {
      this.playKick(dest, safeStartTime, safeVel, pitch, noisePosition);
      ecosystemBus.publishTransientHit("master", safeVel, pitch);
      this.applyKickDuckOnBass(safeStartTime, safeVel);
    } else if (trackId === "snare" || lowerName.includes("snare")) {
      // D8: 51 of 159 shipped snare tracks declare `clap` or `rimshot` as their instrument, and
      // the dispatch used to drop that on the floor — every one of them got a plain snare while
      // the genre data, the arrangement prose and the timbre baseline all claimed otherwise.
      // Those two names already have real models in the percussion library, so a declared
      // clap/rim is voiced there; a plain snare (`tight_snare`, `acoustic_snare`, `808_snare`,
      // …) keeps the snare model.
      const snareInstrument = instrumentOverride ?? this.pattern?.tracks[trackIdx]?.instrument;
      if (instrumentWantsPercussionVoice(snareInstrument)) {
        this.playPercussion(dest, safeStartTime, safeVel, pitch, noisePosition, snareInstrument);
      } else {
        this.playSnare(dest, safeStartTime, safeVel, pitch, noisePosition);
      }
    } else if (trackId === "hihat" || trackId === "hat" || lowerName.includes("hihat") || lowerName.includes("hat")) {
      this.playHiHat(dest, safeStartTime, safeVel, pitch, stepVal, stepDur, gateVal, noisePosition);
    } else if (trackId === "percussion" || trackId === "perc" || lowerName.includes("perc") || lowerName.includes("clap")) {
      // Defect A: hand the declared instrument (e.g. `rim_shaker`, `rimshot`) to the
      // percussion model library so the genre's percussion track is what is heard,
      // instead of every genre collapsing onto one cowbell / clap.
      this.playPercussion(
        dest,
        safeStartTime,
        safeVel,
        pitch,
        noisePosition,
        instrumentOverride ?? this.pattern?.tracks[trackIdx]?.instrument
      );
    } else if (trackId === "bass" || lowerName.includes("bass")) {
      this.playBass(dest, safeStartTime, safeVel, pitch, stepDur, gateVal, synthPreset, stepIdx, trackIdx);
    } else if (trackId === "chords" || trackId === "chord" || lowerName.includes("chord") || lowerName.includes("pad")) {
      // Genre-appropriate chord treatment: which notes *and* how they are played.
      // Rock/metal get thirdless power chords struck short, jazz gets extended voicings
      // comped with space, ambient gets a thirdless wash that rings past the step.
      // Resolved from the genre id, with the chords track's instrument as the fallback
      // for custom genres.
      const chordTreatment = resolveChordTreatment(
        this.pattern?.genre_id,
        this.pattern?.tracks[trackIdx]?.instrument
      );
      const effectivePitch = pitch > 0 ? pitch : (this.pattern?.tracks[trackIdx]?.pitch?.find((p) => (p ?? 0) > 0) ?? 60);
      this.playChord(
        dest,
        safeStartTime,
        safeVel,
        effectivePitch,
        stepDur,
        gateVal,
        synthPreset,
        chordTreatment,
        trackIdx,
        stepIdx,
        chordNotesForStep(this.pattern?.tracks[trackIdx], stepIdx, effectivePitch, this.pattern?.scale, {
          style: chordTreatment.style,
        })
      );
    } else if (trackId === "lead" || lowerName.includes("lead")) {
      this.playLead(dest, safeStartTime, safeVel, pitch, stepDur, gateVal, synthPreset, trackIdx, stepIdx);
    } else if (trackId === "fx" || lowerName.includes("fx")) {
      this.playFX(dest, safeStartTime, safeVel, pitch, stepDur, gateVal, synthPreset, stepIdx, trackIdx);
    } else {
      this.playPercussion(
        dest,
        safeStartTime,
        safeVel,
        pitch,
        noisePosition,
        this.pattern?.tracks[trackIdx]?.instrument
      );
    }
  }

  // --- HARDWARE DRUM MACHINE MODELS (P5-02) & POLYPHONIC SYNTH (P5-03) ---

  public setDrumKit(kit: DrumKitType): void {
    this.drumKit = kit;
  }

  public getDrumKit(): DrumKitType {
    return this.drumKit;
  }

  public getMasterFxRack(): EffectsRack | null {
    return this.masterFxRack;
  }

  public setMasterFilter(enabled: boolean, cutoff: number, q: number, type?: BiquadFilterType): void {
    if (this.masterFxRack) this.masterFxRack.setFilter(enabled, cutoff, q, type);
  }

  public setMasterSaturation(enabled: boolean, drive: number): void {
    if (this.masterFxRack) this.masterFxRack.setSaturation(enabled, drive);
  }

  public setMasterChorus(enabled: boolean, mix: number, rate?: number): void {
    if (this.masterFxRack) this.masterFxRack.setChorus(enabled, mix, rate);
  }

  public setMasterBitcrusher(enabled: boolean, bitDepth: number): void {
    if (this.masterFxRack) this.masterFxRack.setBitcrusher(enabled, bitDepth);
  }

  public getLiveRecorder(): LiveRecorder {
    return this.liveRecorder;
  }

  public setRecordArmed(armed: boolean): void {
    this.liveRecorder.setArmed(armed);
  }

  public getIsRecordArmed(): boolean {
    return this.liveRecorder.getIsArmed();
  }

  /**
   * Play one track's voice once, right now — a *manual* hit, not a scheduled step.
   *
   * The phone's 即兴 module is a step editor whose pads and cells are instruments: tapping one has to
   * sound immediately, whatever the transport is doing (that is the whole point of a pad — you play it,
   * you do not wait for the loop). `triggerInstrument` already voices every track type and already takes
   * an `isAudition` flag, but that flag routes an audition through the master gain, and the comment in
   * `playChord` says why the *track's* destination is where a preview belongs: it is the sound as mixed,
   * with the track's own fader and inserts. So this calls the same dispatch with the track's destination.
   *
   * `track` is a track id (what screens have) or an index. Returns false when there is nothing to play —
   * no engine yet, or no such track — which is the honest answer for a tap before the first audition.
   */
  public auditionTrack(track: string | number, velocity = 1, instrument?: string): boolean {
    if (!this.ctx || !this.pattern?.tracks?.length) return false;
    const index =
      typeof track === "number"
        ? track
        : this.pattern.tracks.findIndex(
            (item) => (item.track_id || "").toLowerCase() === String(track).toLowerCase()
          );
    const patternTrack = this.pattern.tracks[index];
    if (!patternTrack) return false;
    const trackName = patternTrack.name || patternTrack.track_id || "";
    this.triggerInstrument(
      index,
      trackName,
      this.ctx.currentTime,
      velocity,
      patternTrack.pitch?.find((value) => (value ?? 0) > 0) ?? 0,
      1,
      this.getStepDuration(),
      0.8,
      /**
       * `isAudition` is *false* on purpose: the hit goes through the track's own strip, so a pad sounds
       * the way that lane sounds in the loop rather than a dry version of it.
       */
      false,
      /**
       * The noise read offset. `-1` would index the shared noise buffer from a negative position; `0` is
       * the same "first hit of the bar" every time, which is exactly what a hand-played pad wants to avoid
       * sounding mechanical about. A cheap counter gives each tap its own offset without a clock, so the
       * call stays deterministic per tap count.
       */
      this.auditionNoiseCursor++ % 16,
      -1,
      /** A pad can name the model it means: the clap and rim pads write into the snare lane but must not
       *  sound like a plain snare (see `triggerInstrument`'s `instrumentOverride`). */
      instrument
    );
    return true;
  }

  private playKick(dest: AudioNode, time: number, vel: number, pitchOffset: number, noisePosition = 0): void {
    if (!this.ctx) return;
    const voice = synthesizeKick(this.ctx, dest, time, vel, pitchOffset, this.drumKit, this.noiseBuffer, noisePosition);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  /**
   * Kick/bass low-frequency sidechain ducking.
   *
   * P0.3: the depth and release come from the genre's `duck` setting (`audio/sidechain.ts`), which the
   * offline renderer schedules from the same helper. The old inline formula (`max(0.65, 1 - 0.3 * vel)`,
   * 3 ms in, 65 ms out) measured at most 0.25 dB of duck through the app's own render path — inaudible.
   */
  private applyKickDuckOnBass(time: number, vel: number): void {
    if (!this.pattern?.tracks) return;
    const shape = resolveKickDuckShape(this.pattern.genre_id, vel);
    this.pattern.tracks.forEach((track, idx) => {
      const tid = (track.track_id || "").toLowerCase();
      const tname = (track.name || "").toLowerCase();
      if (tid === "bass" || tname.includes("bass")) {
        const strip = this.trackStrips[idx];
        if (strip?.duckGain) {
          try {
            scheduleKickDuck(strip.duckGain.gain, time, shape);
          } catch {
            // AudioParam scheduling guard
          }
        }
      }
    });
  }

  private playSnare(dest: AudioNode, time: number, vel: number, pitchOffset: number, noisePosition = 0): void {
    if (!this.ctx) return;
    const voice = synthesizeSnare(this.ctx, dest, time, vel, pitchOffset, this.drumKit, this.noiseBuffer, noisePosition);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  private playHiHat(dest: AudioNode, time: number, vel: number, pitchOffset: number, stepVal = 1, stepDur = 0.125, gateVal = 0.8, noisePosition = 0): void {
    if (!this.ctx) return;

    // Acoustic Choke Group: Closed hi-hat (stepVal 1 or 3) cuts ringing open hi-hat (stepVal 2)
    if (stepVal === 1 || stepVal === 3) {
      for (const openHat of this.openHiHatVoices) {
        if (openHat.stopTime > time) {
          for (const gNode of openHat.gains) {
            try {
              const g = gNode.gain;
              /**
               * Q1: anchor the fade at the value the envelope *will* have at `time`.
               *
               * `time` is a lookahead-scheduled future instant, so neither `g.value` (the
               * value now) nor a bare `setValueAtTime` is the right anchor: reading `g.value`
               * after cancelling the hat's own decay ramp froze it at its last scheduled
               * value and then stepped to silence — a click plus a level jump on every choke.
               * `drumEnvelopeLevelAt` evaluates the same curve the ramp draws, so 3 ms is
               * enough for an inaudible fade and the level is continuous.
               */
              const anchor = openHat.envelope
                ? Math.max(0.0001, drumEnvelopeLevelAt(openHat.envelope, time))
                : Math.max(0.0001, g.value);
              g.cancelScheduledValues(time);
              g.setValueAtTime(anchor, time);
              g.exponentialRampToValueAtTime(0.0001, time + 0.003);
            } catch {
              // AudioParam scheduling guard
            }
          }
        }
      }
      this.openHiHatVoices = this.openHiHatVoices.filter((v) => v.stopTime > time);
    }

    const voice = synthesizeHiHat(this.ctx, dest, time, vel, pitchOffset, this.drumKit, stepVal, stepDur, gateVal, this.noiseBuffer, noisePosition);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });

    if (stepVal === 2 && voice.gains.length > 0) {
      this.openHiHatVoices.push({ gains: voice.gains, stopTime: voice.stopTime, envelope: voice.envelope });
      if (this.openHiHatVoices.length > 16) {
        this.openHiHatVoices.shift();
      }
    }
  }

  private playPercussion(
    dest: AudioNode,
    time: number,
    vel: number,
    pitchOffset: number,
    noisePosition = 0,
    instrument?: string | null
  ): void {
    if (!this.ctx) return;
    const voice = synthesizePercussion(
      this.ctx,
      dest,
      time,
      vel,
      pitchOffset,
      this.drumKit,
      this.noiseBuffer,
      noisePosition,
      instrument
    );
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  private playBass(
    dest: AudioNode,
    time: number,
    vel: number,
    pitchOffset: number,
    stepDur = 0.125,
    gateVal = 0.8,
    preset: SynthPreset = DEFAULT_SYNTH_PRESETS.acidBass,
    /** The pattern step, for the per-note variation seed (P2.2/A3). */
    step = 0,
    trackIdx = 0
  ): void {
    if (!this.ctx) return;
    const midi = pitchOffset > 0 ? pitchOffset : 36;
    const dur = stepDur * gateVal;
    const voice = playPolySynthNote(
      this.ctx,
      dest,
      midi,
      time,
      dur,
      vel,
      preset,
      polyVoiceVariation(this.variationSeed, trackIdx ?? 0, step)
    );
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  /**
   * E-01: the `chords` track now plays a real voicing instead of one note.
   *
   * It previously triggered a single note from the step's `pitch`, so no genre had any
   * harmony at all — every `common_chords` progression stopped at the UI. The voicing is
   * derived from the pattern's scale and the step's own root, so the authored bass line
   * is preserved and no genre file needed editing.
   *
   * `style` is the genre-appropriate voice (rock gets power chords, jazz gets
   * 7ths/9ths/quartal, ambient gets a thirdless wash); callers resolve it from the genre
   * id and the track's instrument via `resolveVoicingStyle`. A generic 1-3-5 was the
   * wrong answer for most of the library.
   *
   * `WavExporter` performs the identical call, because "exporter parity" is a hard rule
   * here — the voicing itself lives in the shared `chordVoicing` module for that reason.
   */
  private playChord(
    dest: AudioNode,
    time: number,
    vel: number,
    pitchOffset: number,
    stepDur = 0.125,
    gateVal = 0.8,
    preset: SynthPreset = DEFAULT_SYNTH_PRESETS.warmPad,
    treatment?: ChordTreatment,
    trackIdx?: number,
    /** The pattern step, for the per-note variation seed (P2.2/A3). */
    step = 0,
    /**
     * The notes to sound. Passed in by the caller from `chordNotesForStep`, so a **stored** chord
     * (the pattern's `pitches`, expanded per genre by `applyGenreExpression`) is played verbatim
     * and the automatic voicing is skipped — otherwise the harmony would be voiced twice. Plain
     * `pitch` steps still arrive as `undefined` and are voiced here, exactly as before.
     */
    storedNotes?: number[]
  ): void {
    if (!this.ctx) return;
    const midi = pitchOffset > 0 ? pitchOffset : 60;
    const notes =
      storedNotes && storedNotes.length > 0
        ? storedNotes
        : chordVoicingForStep(midi, this.pattern?.scale, treatment ? { style: treatment.style } : {});
    // P6: if GS-1 voices this track, it takes the notes and the native path is skipped entirely
    // — playing both would double the harmony. `tryPlay` returns false whenever GS-1 is disabled,
    // not yet loaded, or has no patch for this instrument, which is the native fallback.
    if (trackIdx !== undefined && this.gs1Pool) {
      const effective: ChordTreatment =
        treatment ?? { style: "triad", articulation: "block", gateScale: 1, strumSeconds: CHORD_STRUM_SEC };
      const gs1Notes = notes.map((note, i) => ({
        note,
        /**
         * A3's per-note variation, arriving as per-note tuning because GS-1 has no per-note cutoff (ABI 9). The same
         * `polyVoiceVariation` the native path uses, with `i` as the note index so the voices inside one stab differ.
         */
        ...(() => {
          const variation = polyVoiceVariation(this.variationSeed, trackIdx ?? 0, step, i);
          return variation ? { cents: variation.detuneCents } : {};
        })(),
        // Same onset helper as the native path, so a strum/roll cannot drift apart between the
        // two engines.
        time: chordVoiceOnset(time, i, effective),
        // `chordNoteDuration` ALREADY multiplies by `treatment.gateScale`. Multiplying by it
        // again here made every GS-1 chord the square of its articulation: stabs became 13 ms
        // clicks (0.3² = 0.09×) and pads became nine-step rings (3.0² = 9×), which is also why
        // sustained chords kept sounding after the transport stopped. GS-1 and native chords
        // must have the same length — that is the whole point of the articulation table.
        duration: chordNoteDuration(stepDur, gateVal, effective),
        velocity: vel * chordVoiceGain(notes.length),
      }));
      // Route through the track's own destination even when this is an audition. Audition passes
      // `masterGain`, and a host can only be bound to one destination: asking the pool for the
      // master instead made it tear down the live host and rebuild it against the master, so the
      // next sequencer note found a mismatched slot, fell back to native, and triggered another
      // rebuild — a host churn loop that is exactly the "audition has latency / does not sound"
      // report. The track strip is also where a preview belongs: it is the sound as mixed.
      const gs1Dest = this.getTrackDestination(trackIdx);
      if (
        this.gs1Pool.tryPlay(trackIdx, "chords", this.pattern?.tracks[trackIdx]?.instrument, gs1Notes, gs1Dest)
      ) {
        return;
      }
    }
    // Note length and onset spread are part of the genre's answer, not fixed values: a
    // funk stab, a jazz comp, a strummed guitar chord and an ambient pad differ mainly
    // in how long they ring and whether the notes roll.
    const effective: ChordTreatment =
      treatment ?? { style: "triad", articulation: "block", gateScale: 1, strumSeconds: CHORD_STRUM_SEC };
    const dur = chordNoteDuration(stepDur, gateVal, effective);
    // Hold the voicing's summed power at the single note it replaces, so adding
    // harmony is not heard as a level jump (and does not push the limiter harder on
    // every genre at once).
    const voiceVel = vel * chordVoiceGain(notes.length);
    notes.forEach((note, i) => {
      const noteTime = chordVoiceOnset(time, i, effective);
      const voice = playPolySynthNote(
        this.ctx!,
        dest,
        note,
        noteTime,
        dur,
        voiceVel,
        preset,
        polyVoiceVariation(this.variationSeed, trackIdx ?? 0, step, i)
      );
      voice.sources.forEach((src, idx) => {
        this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
      });
    });
  }

  private playLead(
    dest: AudioNode,
    time: number,
    vel: number,
    pitchOffset: number,
    stepDur = 0.125,
    gateVal = 0.8,
    preset: SynthPreset = DEFAULT_SYNTH_PRESETS.analogLead,
    trackIdx?: number,
    /** The pattern step, for the per-note variation seed (P2.2/A3). */
    step = 0
  ): void {
    if (!this.ctx) return;
    const midi = pitchOffset > 0 ? pitchOffset : 72;
    const dur = stepDur * gateVal * 1.5;
    // P6: same contract as `playChord` — GS-1 takes the note or the native engine does.
    if (trackIdx !== undefined && this.gs1Pool) {
      const instrument = this.pattern?.tracks[trackIdx]?.instrument;
      const leadVariation = polyVoiceVariation(this.variationSeed, trackIdx ?? 0, step, 0);
      if (
        this.gs1Pool.tryPlay(
          trackIdx,
          "lead",
          instrument,
          [{ note: midi, time, duration: dur, velocity: vel, ...(leadVariation ? { cents: leadVariation.detuneCents } : {}) }],
          dest
        )
      ) {
        return;
      }
    }
    const voice = playPolySynthNote(
      this.ctx,
      dest,
      midi,
      time,
      dur,
      vel,
      preset,
      polyVoiceVariation(this.variationSeed, trackIdx ?? 0, step)
    );
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
  }

  private playFX(
    dest: AudioNode,
    time: number,
    vel: number,
    pitchOffset: number,
    stepDur = 0.125,
    gateVal = 0.8,
    preset: SynthPreset = DEFAULT_SYNTH_PRESETS.noiseSweep,
    /** The pattern step, for the per-note variation seed (P2.2/A3). */
    step = 0,
    trackIdx = 0
  ): void {
    if (!this.ctx) return;

    /**
     * A **texture** instrument goes to GS-1 with its recording (P2.5), exactly as the exporter's fx branch does.
     *
     * The lane is an `fx` lane; the instrument is what says "this is a sample". Asked before the riser split, because
     * a routed instrument has a host and the host is the whole answer — and if it cannot take the note (still loading,
     * or no patch), the native paths below are the fallback, which is the same bargain every other GS-1 role makes.
     */
    if (this.gs1Pool) {
      const midiFallback = pitchOffset > 0 ? pitchOffset : 60;
      if (
        this.gs1Pool.tryPlay(
          trackIdx,
          "fx",
          this.pattern?.tracks[trackIdx]?.instrument,
          [{ note: midiFallback, time, duration: stepDur * gateVal * 1.5, velocity: vel }],
          dest
        )
      ) {
        return;
      }
    }

    // Every genre declares `noise_sweep` for its fx track, and the swept saw-through-
    // bandpass riser below is exactly that sound — it is also byte-identical to
    // WavExporter.synthFX, which the exporter-parity principle requires. Only a future
    // non-sweep fx instrument takes the poly-synth path.
    if (preset !== DEFAULT_SYNTH_PRESETS.noiseSweep) {
      const midi = pitchOffset > 0 ? pitchOffset : 72;
      const dur = stepDur * gateVal * 1.5;
      const voice = playPolySynthNote(
      this.ctx,
      dest,
      midi,
      time,
      dur,
      vel,
      preset,
      polyVoiceVariation(this.variationSeed, trackIdx ?? 0, step)
    );
      voice.sources.forEach((src, idx) => {
        this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
      });
      return;
    }

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const startF = pitchOffset > 24 
      ? AudioEngine.midiToFreq(pitchOffset, 69) 
      : 880 * Math.pow(2, pitchOffset / 12);
    osc.frequency.setValueAtTime(startF, time);
    const noteDuration = Math.max(0.1, Math.min(3.0, stepDur * gateVal * 1.2));
    osc.frequency.exponentialRampToValueAtTime(90, time + noteDuration * 0.9);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2000, time);
    filter.frequency.exponentialRampToValueAtTime(200, time + noteDuration * 0.9);
    filter.Q.value = 5.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + noteDuration + 0.02);
    this.registerVoice(osc, gain, time + noteDuration + 0.02);
  }

  public destroy(): void {
    this.clearGs1DisposeTimer();
    this.stop();
    this.panic();
    this.cleanupUnlockListeners();
    this.workletClock.destroy();
    this.workerBridge.destroy();
    // E-17: the graph owns the buses, the rack, the limiter and the analyser taps, so a
    // single dispose covers them (disposing the rack separately would double-free).
    if (this.masterGraph) {
      this.masterGraph.dispose();
      this.masterGraph = null;
    }
    this.masterLimiter = null;
    this.masterFxRack = null;
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.gs1Pool?.dispose();
    this.gs1Pool = null;
    this.masterGain = null;
    this.loudnessTrimGain = null;
    this.limiter = null;
    this.analyser = null;
    this.masterAnalyser = null;
    this.channelSplitter = null;
    this.analyserL = null;
    this.analyserR = null;
  }
}
