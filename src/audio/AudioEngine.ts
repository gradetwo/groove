/**
 * Web Audio Synthetic Engine for Groove Studio
 * Pure native Web Audio API synthesizer. Zero sample downloads, zero external latency.
 * Implements sample-accurate lookahead scheduling with swing and track solo/mute/pan.
 */

import { SequencerPattern, SequencerTrack } from "../types/genre";
import { AudioWorkerBridge } from "./AudioWorkerBridge";
import { AudioWorkletClock } from "./AudioWorkletClock";
import { DrumKitType, synthesizeKick, synthesizeSnare, synthesizeHiHat, synthesizePercussion } from "./DrumKitModels";
import { playPolySynthNote, DEFAULT_SYNTH_PRESETS, SynthPreset } from "./PolySynth";
import { resolveInstrumentPreset } from "./instrumentPresets";
import { EffectsRack, EffectsRackState, DEFAULT_FX_STATE } from "./EffectsRack";
import { LiveRecorder, QuantizedStepResult } from "./LiveRecorder";
import { initIosAudioUnlock } from "./iosAudioUnlock";
import { ecosystemBus } from "./ecosystemBus";
import { safeVelocity, safeTime } from "./dspGuards";
import { computeCatchUp } from "./schedulerMath";
import { TrackState, deriveTrackStates } from "./trackStates";
import { createSeededNoiseBuffer, noisePositionFor } from "./noise";
import {
  chordVoicingForStep,
  chordVoiceGain,
  chordNoteDuration,
  chordVoiceOnset,
  CHORD_STRUM_SEC,
  type ChordTreatment,
} from "./chordVoicing";
import { resolveChordTreatment } from "../data/genreVoicing";
import { VoiceRegistry } from "./voiceRegistry";
import { type MasterLimiterHandle, type MasterLimiterKind } from "./MasterLimiter";
import { buildMasterGraph, dbToGain, type MasterGraph } from "./masterGraph";
import { ChannelStrip } from "./ChannelStripDsp";
import { resolveTrackInsertForGenre } from "../data/genreInsert";
import { resolveGroupBus } from "./trackBuses";
import { Gs1VoicePool } from "./gs1/Gs1VoicePool";
import type { TrackInsertParams } from "../data/trackInsert";
import { applyGenreFxToGraph, delayParamsAtTempo, resolveGenreFx, type GenreFxProfile } from "../data/genreFx";
export type { TrackState } from "./trackStates";
import { isDrumTrack } from "../utils/trackUtils";
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

export interface AudioEngineOptions {
  onStep?: (info: StepCallbackInfo) => void;
  onTrackTrigger?: (trackIndices: number[]) => void;
  onStop?: () => void;
  /** Fires when the scheduler had to skip steps after a stall (F-02 diagnostics). */
  onDroppedSteps?: (droppedSteps: number) => void;
}

export interface TrackChannelStrip {
  gain: GainNode;
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
   * P6: the GS-1 voices for `chords`/`lead`, or `null` until a context exists.
   *
   * It is inert while `isGs1RoutingEnabled()` is false (the default), so creating it changes
   * nothing: every `tryPlay` returns `false` and the native path below runs exactly as before.
   */
  private gs1Pool: Gs1VoicePool | null = null;

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

  // Callbacks
  private onStepCallback?: (info: StepCallbackInfo) => void;
  private onTrackTriggerCallback?: (trackIndices: number[]) => void;
  private onStopCallback?: () => void;
  private onDroppedStepsCallback?: (droppedSteps: number) => void;

  // Noise buffers cache
  private noiseBuffer: AudioBuffer | null = null;

  // Latency & Hearing Protection (P4-05)
  private latencyCompensationMs: number = 0;
  private hearingProtection: boolean = true;
  private maxVolumeLimit: number = 0.85;
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
    if (options?.onStop) this.onStopCallback = options.onStop;
    if (options?.onDroppedSteps) this.onDroppedStepsCallback = options.onDroppedSteps;

    this.workerBridge = new AudioWorkerBridge();
    this.workletClock = new AudioWorkletClock();
    this.workletClock.setOnTick((_now) => {
      this.schedulerLoop();
    });

    this.loadAudioSettings();
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
          });
          this.masterGraph = graph;
          this.masterGain = graph.masterGain;
          this.gs1Pool?.dispose();
          this.gs1Pool = new Gs1VoicePool(this.ctx);
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
    this.releaseTrackStrips();
    this.setupTrackStrips(16);
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
    this.releaseTrackStrips();
    this.setupTrackStrips(16);
  }

  public areTrackAnalysersEnabled(): boolean {
    return this.trackAnalysersEnabled;
  }

  /** Real per-channel analyser, or null when meters are not enabled/available. */
  public getTrackAnalyser(trackIdx: number): AnalyserNode | null {
    return this.trackStrips[trackIdx]?.analyser ?? null;
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
  }

  /**
   * E-11: the group bus a track belongs on.
   *
   * Tracks connect here rather than to the fader, so the glue stage cannot be bypassed by adding
   * a track. The role→bus decision lives in `trackBuses.ts` because the offline renderer has to
   * make exactly the same one.
   */
  private busInputFor(trackIdx: number): GainNode {
    const fallback = this.masterGain!;
    if (!this.masterGraph) return fallback;
    const track = this.pattern?.tracks[trackIdx];
    const bus = resolveGroupBus(track?.track_id, track?.name);
    return bus === "drum" ? this.masterGraph.drumBusInput : this.masterGraph.musicBusInput;
  }

  private setupTrackStrips(numTracks = 16): void {
    if (!this.ctx || !this.masterGain) return;
    this.trackStrips = [];
    for (let i = 0; i < numTracks; i++) {
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

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.8, this.ctx.currentTime);

      insert.output.connect(gain);

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

      const sendA = this.ctx.createGain();
      sendA.gain.setValueAtTime(0, this.ctx.currentTime);
      if (this.masterGraph) {
        stripOut.connect(sendA);
        sendA.connect(this.masterGraph.reverb.input);
      }

      const sendB = this.ctx.createGain();
      sendB.gain.setValueAtTime(0, this.ctx.currentTime);
      if (this.masterGraph) {
        stripOut.connect(sendB);
        sendB.connect(this.masterGraph.delay.input);
      }

      this.trackStrips.push({ gain, polarity, analyser, panner, spatialPanner, sendA, sendB, insert });
    }
    this.syncTrackGains();
  }

  public getTrackDestination(trackIdx: number): AudioNode {
    // E-10: the strip's entry point is the insert chain, not the fader.
    return this.trackStrips[trackIdx]?.insert.input || this.masterGain!;
  }

  public setPattern(pattern: SequencerPattern, resetStates = false): void {
    this.pattern = pattern;
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
    this.pattern?.tracks.forEach((track, idx) => {
      this.setTrackInsert(
        idx,
        track.insert ?? resolveTrackInsertForGenre(track.track_id, this.pattern?.genre_id)
      );
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

  /** The insert chain a track is currently using, or null when the strip does not exist. */
  public getTrackInsert(trackIdx: number): TrackInsertParams | null {
    const strip = this.trackStrips[trackIdx];
    return strip ? strip.insert.getParams() : null;
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
      this.masterGain.gain.setValueAtTime(effective, this.ctx.currentTime);
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
   * Cancels all scheduled voices with a fast 5ms release ramp to prevent hanging notes and clicks
   */
  public panic(): void {
    this.voiceRegistry.panic();
  }

  public async play(): Promise<void> {
    if (!this.ctx) {
      this.initAudioContext();
    }
    initIosAudioUnlock(this.ctx).unlock();
    if (this.ctx && this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (this.isPlaying) return;

    this.isPlaying = true;
    ecosystemBus.publishClockStart(this.bpm);
    this.currentStep = (this.loopRange && this.loopRange[0] >= 0) ? this.loopRange[0] : 0;
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
    }, 25);
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
      // Anticipation offset of 25ms aligns visual playhead with monitor refresh
      const visualLeadSec = 0.025;

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
    const stepsCount = this.totalSteps > 0 ? this.totalSteps : 16;

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
      if (this.loopRange) {
        const [lStart, lEnd] = this.loopRange;
        if (step < lStart || step >= lEnd) {
          step = lStart;
          this.currentStep = lStart;
        }
      }

      // Swing pushes odd steps (1, 3, 5...) slightly forward
      const swingOffset = (step % 2 === 1 && this.swing > 0) ? (this.swing * 0.5) * stepDur : 0;
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
      if (this.loopRange) {
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

    const anySolo = this.trackStates.some((t) => t.solo);

    this.pattern.tracks.forEach((track, trackIdx) => {
      const state = this.trackStates[trackIdx] || { mute: false, solo: false, volume: 0.8, pan: 0 };
      if (state.mute) return;
      if (anySolo && !state.solo) return;
      if (this.isDrumsOnly && !isDrumTrack(track, trackIdx)) return;

      // Independent track loop length (Polymeter)
      const trackLen = (track.trackLength && track.trackLength > 0)
        ? track.trackLength
        : (track.steps ? track.steps.length : 16);
      const stepIdx = trackLen > 0 ? step % trackLen : step;

      const stepVal = track.steps ? track.steps[stepIdx] : 0;
      const isStepActive = stepVal > 0;
      if (!isStepActive) return;

      // Probability check (Chance: 0 - 100)
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
      const trackStepTime = (step % 2 === 1 && effSwing !== this.swing)
        ? (this.nextStepTime + (effSwing * 0.5) * stepDur)
        : time;

      // Ratchet / Subdivisions
      const isHatTriplet = (track.track_id === "hihat" || track.name.toLowerCase().includes("hat")) && stepVal === 3;
      const ratchet = (track.ratchet && track.ratchet[stepIdx] && track.ratchet[stepIdx] > 1)
        ? track.ratchet[stepIdx]
        : (isHatTriplet ? 3 : 1);

      activeTracks.push(trackIdx);

      if (ratchet > 1) {
        const subDur = stepDur / ratchet;
        for (let r = 0; r < ratchet; r++) {
          const subTime = trackStepTime + r * subDur;
          const subVel = normalizedVel * (0.85 + (r / ratchet) * 0.15);
          this.triggerInstrument(trackIdx, track.name, subTime, subVel, pitchVal, stepVal, subDur, gateVal, false, noisePositionFor(trackIdx, stepIdx, r));
        }
      } else {
        this.triggerInstrument(trackIdx, track.name, trackStepTime, normalizedVel, pitchVal, stepVal, stepDur, gateVal, false, noisePositionFor(trackIdx, stepIdx));
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
  public triggerNote(trackIdx: number, trackName: string, velocity = 0.8, pitch: number | null = 0, stepVal = 1, gateVal = 0.8): void {
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return;
    initIosAudioUnlock(this.ctx).unlock();
    if (this.ctx.state === "suspended") this.ctx.resume();
    const stepDur = this.getStepDuration();
    const pitchVal = pitch !== null && pitch !== undefined && pitch > 0 ? pitch : 0;

    // P5-05: Real-time Live Sequencer Recording
    if (this.isPlaying && this.liveRecorder.getIsArmed()) {
      this.liveRecorder.recordTrigger(trackIdx, pitchVal, velocity, this.currentStep, this.totalSteps);
    }

    this.triggerInstrument(trackIdx, trackName, this.ctx.currentTime, velocity, pitchVal, stepVal, stepDur, gateVal, true);
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
    noisePosition = 0
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
    } else if (trackId === "snare" || lowerName.includes("snare")) {
      this.playSnare(dest, safeStartTime, safeVel, pitch, noisePosition);
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
        this.pattern?.tracks[trackIdx]?.instrument
      );
    } else if (trackId === "bass" || lowerName.includes("bass")) {
      this.playBass(dest, safeStartTime, safeVel, pitch, stepDur, gateVal, synthPreset);
    } else if (trackId === "chords" || trackId === "chord" || lowerName.includes("chord") || lowerName.includes("pad")) {
      // Genre-appropriate chord treatment: which notes *and* how they are played.
      // Rock/metal get thirdless power chords struck short, jazz gets extended voicings
      // comped with space, ambient gets a thirdless wash that rings past the step.
      // Resolved from the genre id, with the chords track's instrument as the fallback
      // for custom genres.
      this.playChord(
        dest,
        safeStartTime,
        safeVel,
        pitch,
        stepDur,
        gateVal,
        synthPreset,
        resolveChordTreatment(
          this.pattern?.genre_id,
          this.pattern?.tracks[trackIdx]?.instrument
        ),
        trackIdx
      );
    } else if (trackId === "lead" || lowerName.includes("lead")) {
      this.playLead(dest, safeStartTime, safeVel, pitch, stepDur, gateVal, synthPreset, trackIdx);
    } else if (trackId === "fx" || lowerName.includes("fx")) {
      this.playFX(dest, safeStartTime, safeVel, pitch, stepDur, gateVal, synthPreset);
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

  private playKick(dest: AudioNode, time: number, vel: number, pitchOffset: number, noisePosition = 0): void {
    if (!this.ctx) return;
    const voice = synthesizeKick(this.ctx, dest, time, vel, pitchOffset, this.drumKit, this.noiseBuffer, noisePosition);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
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
    const voice = synthesizeHiHat(this.ctx, dest, time, vel, pitchOffset, this.drumKit, stepVal, stepDur, gateVal, this.noiseBuffer, noisePosition);
    voice.sources.forEach((src, idx) => {
      this.registerVoice(src, voice.gains[idx] || (voice.gains[0] as GainNode), voice.stopTime);
    });
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
    preset: SynthPreset = DEFAULT_SYNTH_PRESETS.acidBass
  ): void {
    if (!this.ctx) return;
    const midi = pitchOffset > 0 ? pitchOffset : 36;
    const dur = stepDur * gateVal;
    const voice = playPolySynthNote(this.ctx, dest, midi, time, dur, vel, preset);
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
    trackIdx?: number
  ): void {
    if (!this.ctx) return;
    const midi = pitchOffset > 0 ? pitchOffset : 60;
    const notes = chordVoicingForStep(
      midi,
      this.pattern?.scale,
      treatment ? { style: treatment.style } : {}
    );
    // P6: if GS-1 voices this track, it takes the notes and the native path is skipped entirely
    // — playing both would double the harmony. `tryPlay` returns false whenever GS-1 is disabled,
    // not yet loaded, or has no patch for this instrument, which is the native fallback.
    if (trackIdx !== undefined && this.gs1Pool) {
      const treatmentGate = treatment?.gateScale ?? 1;
      const gs1Notes = notes.map((note, i) => ({
        note,
        time: time + (treatment ? CHORD_STRUM_SEC * 0 : 0) + i * (treatment?.strumSeconds ?? 0),
        duration:
          chordNoteDuration(stepDur, gateVal, treatment ?? { gateScale: 1 }) * treatmentGate,
        velocity: vel * chordVoiceGain(notes.length),
      }));
      if (
        this.gs1Pool.tryPlay(
          trackIdx,
          "chords",
          this.pattern?.tracks[trackIdx]?.instrument,
          gs1Notes,
          dest
        )
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
      const voice = playPolySynthNote(this.ctx!, dest, note, noteTime, dur, voiceVel, preset);
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
    trackIdx?: number
  ): void {
    if (!this.ctx) return;
    const midi = pitchOffset > 0 ? pitchOffset : 72;
    const dur = stepDur * gateVal * 1.5;
    // P6: same contract as `playChord` — GS-1 takes the note or the native engine does.
    if (trackIdx !== undefined && this.gs1Pool) {
      const instrument = this.pattern?.tracks[trackIdx]?.instrument;
      if (this.gs1Pool.tryPlay(trackIdx, "lead", instrument, [{ note: midi, time, duration: dur, velocity: vel }], dest)) {
        return;
      }
    }
    const voice = playPolySynthNote(this.ctx, dest, midi, time, dur, vel, preset);
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
    preset: SynthPreset = DEFAULT_SYNTH_PRESETS.noiseSweep
  ): void {
    if (!this.ctx) return;

    // Every genre declares `noise_sweep` for its fx track, and the swept saw-through-
    // bandpass riser below is exactly that sound — it is also byte-identical to
    // WavExporter.synthFX, which the exporter-parity principle requires. Only a future
    // non-sweep fx instrument takes the poly-synth path.
    if (preset !== DEFAULT_SYNTH_PRESETS.noiseSweep) {
      const midi = pitchOffset > 0 ? pitchOffset : 72;
      const dur = stepDur * gateVal * 1.5;
      const voice = playPolySynthNote(this.ctx, dest, midi, time, dur, vel, preset);
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
