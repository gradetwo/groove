/**
 * WAV Offline Exporter & Stems Renderer (P4-01 & P4-02)
 *
 * Provides bit-exact offline rendering of Groove patterns to 16-bit PCM WAV:
 * - Master stereo WAV export with master limiter
 * - Per-track stem WAV export with genre/track/BPM naming
 * - Polymeter, gate, swing, velocity, pitch and stereo panning support
 */

import { DrumPattern, Track } from "../types/genre";
import { createZipArchive } from "../utils/zip";
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
import { playPolySynthNote, DEFAULT_SYNTH_PRESETS } from "./PolySynth";
import { resolveInstrumentPreset } from "./instrumentPresets";
import { TrackState, deriveTrackStates } from "./trackStates";
import { patternSeed, probabilityPasses, resolveRatchet, ratchetVelocityScale } from "./noteEvents";
import { flattenSong } from "../data/songFlatten";
import type { Song } from "../types/song";
import { resolveKickDuckShape, scheduleKickDuck } from "./sidechain";
import { swingOffsetSeconds } from "./swing";
import { resolveRenderTailSec } from "./renderTail";
import { LOUDNESS_TRIM_MAX_DB, LOUDNESS_TRIM_MIN_DB, getGenreLoudnessTrimDb } from "../data/genreMix";
import { createSeededNoiseBuffer, noisePositionFor } from "./noise";
import {
  chordVoicingForStep,
  chordNotesForStep,
  chordVoiceGain,
  chordNoteDuration,
  chordVoiceOnset,
} from "./chordVoicing";
import { resolveChordTreatment } from "../data/genreVoicing";
import { buildMasterGraph } from "./masterGraph";
import {
  limitBuffers,
  MASTER_LIMITER_INTERNAL_CEILING_DB,
  type MasterLimiterKind,
} from "./MasterLimiter";
import { ChannelStrip } from "./ChannelStripDsp";
import { resolveTrackInsertForGenre } from "../data/genreInsert";
import { resolveGroupBus } from "./trackBuses";
import { createGs1Host, type Gs1Host } from "./gs1/Gs1Host";
import { capPlanPolyphony, gs1PatchFor, isGs1RoutingEnabled, planGs1Notes } from "./gs1/gs1Tracks";
import { applyGenreFxToGraph, resolveGenreFx } from "../data/genreFx";

export interface RenderWavOptions {
  bpm?: number;
  swing?: number;
  bars?: number;
  sampleRate?: number;
  trackStates?: TrackState[];
  stemTrackIdx?: number;
  drumKit?: DrumKitType;
  /**
   * Master loudness-match trim in dB. When omitted it is derived from the pattern's
   * `genre_id` (0 dB for custom/unknown ids), exactly like the live engine's
   * `setPattern`, so an exported master matches what the user just heard.
   */
  loudnessTrimDb?: number;
  /**
   * Absolute master makeup in dB. Omitted means the shared default
   * (`MASTER_MAKEUP_DB`), so an export is as loud as playback.
   */
  masterMakeupDb?: number;
  /** Set false to render without the mastering bus compressor (measurement tooling). */
  masterBusCompEnabled?: boolean;
  /**
   * Master true-peak ceiling, dBTP. The graph already accepts it for measurement tooling; forwarding it here
   * lets a probe separate "the sidechain ducked" from "the ceiling gave part of it back".
   */
  limiterCeilingDb?: number;
  /**
   * Called once per render with the limiter that actually ended up in the graph.
   *
   * `createMasterLimiter` prefers an `AudioWorkletNode` and falls back to a `DynamicsCompressor`
   * when the module cannot be loaded. That fallback is silent, and it is not cosmetic: forcing it
   * measures the export **2.36 dB louder overall and 4.83 dB off in one band** (appendix G.14). A
   * renderer that quietly hands back a different file than the one just auditioned is exactly the
   * kind of claim this project does not make, so the kind is reported rather than assumed —
   * `exportMasterWav` / `exportStemsWav` carry it out to their callers.
   */
  onLimiterKind?: (kind: MasterLimiterKind) => void;
  /**
   * Called once per render with how many GS-1 hosts failed to load after their retries.
   *
   * `0` in every normal render. Anything else means a `chords`/`lead` track was voiced by the native
   * synth instead of GS-1, which moves the fingerprint by 0.71-3.66 dB depending on the track
   * (measured; see `GS1_HOST_LOAD_ATTEMPTS`), so the caller has to be able to say so rather than
   * ship a silently different file.
   */
  onGs1HostFailures?: (count: number) => void;
}

/**
 * How many times a GS-1 host load is attempted before the track falls back to the native synth.
 *
 * Three, because the failure being retried is a transient fetch or module load, not a logical error:
 * a second attempt is the one most likely to succeed, and a persistent failure (no network, no
 * worklet support) is not helped by waiting longer. The point is not to make failure impossible but
 * to stop a coin-flip from silently changing what the export sounds like.
 *
 * The retry is the *second* line of defence. The first is that `fetchCore` now caches the core per
 * URL, so the fetch happens once per page instead of once per host per render — without that, this
 * constant multiplied the very traffic whose failure it exists to tolerate (600 fetches per library
 * render became 1800).
 */
const GS1_HOST_LOAD_ATTEMPTS = 3;

export interface ExportedWav {
  blob: Blob;
  filename: string;
  durationSec: number;
  /**
   * Which master limiter the bounce actually went through.
   *
   * `"fallback"` means the true-peak limiter could not load and a `DynamicsCompressor` was used
   * instead, which measures 2.36 dB louder overall and 4.83 dB off in one band (G.14). Callers are
   * expected to tell the user rather than ship a silently degraded file.
   */
  limiterKind: MasterLimiterKind;
  /**
   * GS-1 hosts that failed to load after retrying; `0` in every normal export.
   *
   * Non-zero means one or more `chords`/`lead` tracks were voiced by the native synth instead, which
   * is audible (0.71-3.66 dB in a band, measured) and must not be reported as a clean export.
   */
  gs1HostFailures: number;
}

export interface ExportedStem {
  blob: Blob;
  filename: string;
  trackName: string;
  trackIdx: number;
  /** GS-1 hosts that failed to load for this stem's render; `0` normally. See `ExportedWav`. */
  gs1HostFailures: number;
}

/**
 * Encodes an AudioBuffer into 16-bit PCM stereo WAV format (RIFF)
 */
export function encodeAudioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const leftChannel = buffer.getChannelData(0);
  const rightChannel = numChannels > 1 ? buffer.getChannelData(1) : leftChannel;
  const numSamples = leftChannel.length;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");

  // "fmt " sub-chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, format, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // "data" sub-chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Interleave samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    // Left sample clamp & convert
    let sL = Math.max(-1, Math.min(1, leftChannel[i] || 0));
    const intL = sL < 0 ? sL * 0x8000 : sL * 0x7fff;
    view.setInt16(offset, intL, true);
    offset += 2;

    // Right sample clamp & convert — only when the buffer really is stereo.
    // F-10: writing a second channel into a mono allocation used to overflow the
    // DataView (RangeError) and lose the whole export.
    if (numChannels > 1) {
      let sR = Math.max(-1, Math.min(1, rightChannel[i] || 0));
      const intR = sR < 0 ? sR * 0x8000 : sR * 0x7fff;
      view.setInt16(offset, intR, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function midiToFreq(midiNote: number | null | undefined, fallback = 60): number {
  const note = midiNote !== undefined && midiNote !== null && midiNote > 0 ? midiNote : fallback;
  return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * Synthesizes a pattern offline via OfflineAudioContext
 */
export async function renderPatternOffline(
  pattern: DrumPattern,
  options: RenderWavOptions = {}
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate || 44100;
  // F-10: clamp render parameters — a negative bpm produced a negative
  // `lengthInSamples`, and an unbounded `bars` could allocate gigabytes.
  const bpm = Math.max(20, Math.min(300, options.bpm || pattern.bpm || 120));
  const bars = Math.max(1, Math.min(64, Math.floor(options.bars || 1)));
  const baseSwing = options.swing !== undefined
    ? (options.swing > 1 ? options.swing / 100 : options.swing)
    : (pattern.swing ? (pattern.swing > 1 ? pattern.swing / 100 : pattern.swing) : 0);
  const swing = Math.max(0, Math.min(0.75, baseSwing));
  const stepDur = 60 / bpm / 4;
  const patternSteps =
    (pattern as any).totalSteps && (pattern as any).totalSteps > 0
      ? (pattern as any).totalSteps
      : pattern.tracks[0]?.steps.length || 16;
  const totalSteps = patternSteps * bars;
  // P0.6: the tail is the pattern's own reverb/delay decay, not a fixed 0.6 s. `genreFx` is resolved a few
  // lines below for the graph; resolve it here first so the render length can depend on it.
  const tailGenreFx = resolveGenreFx(pattern.genre_id);
  const tailSec = resolveRenderTailSec(tailGenreFx, bpm);
  const totalDurationSec = totalSteps * stepDur + tailSec;

  const OfflineContextClass =
    (typeof window !== "undefined" && (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)) ||
    (globalThis as any).OfflineAudioContext;

  if (!OfflineContextClass) {
    throw new Error("OfflineAudioContext is not supported in this environment");
  }

  const lengthInSamples = Math.ceil(totalDurationSec * sampleRate);
  const ctx = new OfflineContextClass(2, lengthInSamples, sampleRate);

  // Genre loudness-match trim. Applied through the shared graph below so the offline
  // renderer uses the *same* stage, in the same relative position, as playback.
  const loudnessTrimDb = Math.max(
    LOUDNESS_TRIM_MIN_DB,
    Math.min(
      LOUDNESS_TRIM_MAX_DB,
      options.loudnessTrimDb !== undefined && Number.isFinite(options.loudnessTrimDb)
        ? options.loudnessTrimDb
        : getGenreLoudnessTrimDb(pattern.genre_id)
    )
  );

  // E-17 / N-16: the bounce now renders through the SAME master graph as playback —
  // fader → FX rack → loudness trim → true-peak limiter — and, crucially, through the same reverb
  // and delay sends. Previously the exporter had neither sends nor an FX rack, so the
  // per-genre `sendA`/`sendB` values (curated for all 159 genres) and anything the user
  // dialled into FLT/DRIVE/CHORUS/LO-FI simply did not reach the file. It also used a
  // 0.85 fader against the live engine's 0.8, an unrelated ~0.5 dB offset; both now come
  // from `MASTER_FADER_DEFAULT`.
  const graph = buildMasterGraph(ctx, {
    loudnessTrimDb,
    masterMakeupDb: options.masterMakeupDb,
    masterBusCompEnabled: options.masterBusCompEnabled,
    limiterCeilingDb: options.limiterCeilingDb,
  });

  // N-14: the genre's master FX and bus character, applied through the same shared
  // applier the live engine uses, at the same *playing* tempo (never the metadata
  // `default_bpm`). An unknown/custom genre resolves to null and the graph keeps its
  // defaults, exactly as playback does.
  if (tailGenreFx) applyGenreFxToGraph(graph, tailGenreFx, bpm);

  // V-01: the same seeded generator the live engine uses. `Math.random()` here meant an
  // export never matched the audition it was rendered from, which broke the project's
  // exporter-parity guarantee and made every render irreproducible.
  const noiseBuf = createSeededNoiseBuffer(ctx, 2);

  // Pre-configure track channel strips (Gain + Stereo Panner).
  // F-03: when the caller does not supply mixer state we derive it from the pattern
  // itself (same helper the live engine uses), so a rendered master honours
  // mute / solo / volume / pan instead of silently exporting everything at 0.8 centre.
  const mixerStates: TrackState[] = options.trackStates ?? deriveTrackStates(pattern);
  const trackStrips: Array<{
    gain: GainNode;
    duckGain: GainNode;
    polarity: GainNode;
    pan: StereoPannerNode;
    /** E-10: the same pre-fader insert chain the live engine builds. */
    insert: ChannelStrip;
  }> = [];
  const numTracks = pattern.tracks.length;
  // Hoisted above the strip loop because the send taps below need to know whether the
  // track is silenced — the live engine zeroes a muted/soloed-out track's sends too.
  const anySolo = mixerStates.some((s) => s.solo);
  const silenced = (state: TrackState): boolean => Boolean(state.mute) || (anySolo && !state.solo);
  const clamp01 = (value: unknown): number =>
    Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : 0;

  for (let t = 0; t < numTracks; t++) {
    const tState = mixerStates[t] || { mute: false, solo: false, volume: 0.8, pan: 0, sendA: 0, sendB: 0 };
    // E-10: the bounce gets the same channel strip as playback — high-pass, EQ,
    // compressor and drive — or the export would be missing the very thing that makes a
    // genre's tracks sit together. A track with no stored chain takes its role default.
    const tInsert = new ChannelStrip(
      ctx,
      pattern.tracks[t]?.insert ??
        resolveTrackInsertForGenre(pattern.tracks[t]?.track_id, pattern.genre_id)
    );

    const tDuckGain = ctx.createGain();
    tDuckGain.gain.setValueAtTime(1, 0);
    tInsert.output.connect(tDuckGain);

    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(Math.max(0, Math.min(2, tState.volume)), 0);
    tDuckGain.connect(tGain);

    // N-01 follow-up: polarity must be honoured offline too, otherwise an inverted
    // channel would sound different in the exported master than in the console.
    const tPolarity = ctx.createGain();
    tPolarity.gain.setValueAtTime(tState.phaseInvert ? -1 : 1, 0);

    const tPan = ctx.createStereoPanner();
    tPan.pan.setValueAtTime(Math.max(-1, Math.min(1, tState.pan)), 0);

    tGain.connect(tPolarity);
    tPolarity.connect(tPan);
    // E-11: through the group bus, never straight to the fader — the same decision the live
    // engine makes, from the same function (`trackBuses.ts`), which is what keeps the two graphs
    // identical where it matters.
    const bus = resolveGroupBus(pattern.tracks[t]?.track_id, pattern.tracks[t]?.name);
    tPan.connect(bus === "drum" ? graph.drumBusInput : graph.musicBusInput);

    // Exporter parity for the send buses: the live engine taps post-pan into `sendA`
    // (reverb) and `sendB` (delay), ramped with `setTargetAtTime`. The same tap point and
    // the same ramps are used here so a genre's curated sends survive the bounce.
    const sendA = ctx.createGain();
    sendA.gain.setValueAtTime(0, 0);
    sendA.gain.setTargetAtTime(silenced(tState) ? 0 : clamp01(tState.sendA), 0, 0.01);
    tPan.connect(sendA);
    sendA.connect(graph.reverb.input);

    const sendB = ctx.createGain();
    sendB.gain.setValueAtTime(0, 0);
    sendB.gain.setTargetAtTime(silenced(tState) ? 0 : clamp01(tState.sendB), 0, 0.01);
    tPan.connect(sendB);
    sendB.connect(graph.delay.input);

    trackStrips.push({ gain: tGain, duckGain: tDuckGain, polarity: tPolarity, pan: tPan, insert: tInsert });
  }

  /**
   * P6 parity: the *same* routing decision the live engine makes, resolved before any note is
   * scheduled so the render loop stays synchronous.
   *
   * A host is created, awaited and connected here — before `startRendering()` — because the
   * scheduler below runs straight-line and must not await. The patch is pushed once, up front.
   */
  const gs1Hosts = new Map<number, Gs1Host>();
  let gs1HostFailures = 0;
  if (isGs1RoutingEnabled() && typeof ctx.audioWorklet?.addModule === "function") {
    for (let t = 0; t < numTracks; t++) {
      /**
       * A stem render only ever plays its own track, so it must not build hosts for the others.
       *
       * Each GS-1 host instantiates a WASM core in that context's worklet scope, and the page's WASM
       * memory budget is finite and **not** reclaimable: measured with
       * `scripts/probe_gs1_memory_release.mjs`, a page builds **~124** hosts and then every further
       * `WebAssembly.instantiate` fails with `RangeError: ... Out of memory`, whatever teardown is
       * used (`dispose()`, an explicit `gc()`, and `OfflineAudioContext.close()` — which does not even
       * exist). Past that point `renderPatternOffline` voices the chords/lead tracks with the native
       * synth, so the export stops matching the audition (measured on `ambient`: chords +13.05 dB,
       * lead -16.56 dB) until the page is reloaded.
       *
       * That made the stems path cost 2 hosts per stem render — 16 per export for nothing, since 14
       * of those hosts belong to tracks the render drops on the first line of its scheduling loop.
       * Skipping them is free and takes the budget from ~7 exports per page to ~31.
       */
      if (options.stemTrackIdx !== undefined && options.stemTrackIdx !== t) continue;
      const track = pattern.tracks[t];
      const routed = track ? gs1PatchFor(track.track_id, track.instrument) : null;
      if (!routed) continue;
      /**
       * Bounded retry, then report — this used to be a silent single attempt.
       *
       * `createGs1Host` fetches the WASM core **over the network** and loads a worklet module, so
       * its failure is transient by nature, and a bare `catch` left that track on the native synth
       * *for that render only*. Measured on `chicago-house` (3 bars, fingerprint delta against a
       * clean render): one GS-1 host failing moves the sound by **0.71 dB** in band 6 for the
       * chords track and **3.66 dB** in band 9 for the lead — which is the magnitude, and the
       * genre-dependent spread, of the rare repeat-render outliers recorded in appendix G.14.
       *
       * In other words the export's *sound* depended on whether a fetch won a race, silently. That
       * is the same defect as the silent limiter fallback (G.14): a renderer that hands back a
       * different file than the one that was auditioned, and says nothing. The retry makes the
       * transient case not happen; the count makes the persistent case impossible to miss.
       */
      let host: Gs1Host | null = null;
      for (let attempt = 0; attempt < GS1_HOST_LOAD_ATTEMPTS && !host; attempt++) {
        try {
          const candidate = await createGs1Host({ context: ctx });
          await candidate.ready;
          host = candidate;
        } catch {
          // Retried below; the last failure is counted after the loop.
        }
      }
      if (!host) {
        gs1HostFailures += 1;
        continue;
      }
      host.setPatch(routed.params);
      host.output.connect(trackStrips[t].insert.input);
      gs1Hosts.set(t, host);
    }
  }
  options.onGs1HostFailures?.(gs1HostFailures);

  const drumKit: DrumKitType = options.drumKit || "808";
  const exportSeed = patternSeed(pattern as unknown as { genre_id?: string; bpm?: number; totalSteps?: number });

  // Acoustic Enhancement: Track open hi-hat voices for offline choke group
  const openHiHatVoices: Array<{ gains: GainNode[]; stopTime: number; envelope?: DrumVoiceEnvelope }> = [];

  // Step scheduling loop
  for (let step = 0; step < totalSteps; step++) {
    const unswungTime = step * stepDur;

    pattern.tracks.forEach((track: Track, trackIdx: number) => {
      // Stem mode check: only render requested track if stemTrackIdx is specified
      if (options.stemTrackIdx !== undefined && options.stemTrackIdx !== trackIdx) {
        return;
      }

      const state = mixerStates[trackIdx] || { mute: false, solo: false, volume: 0.8, pan: 0 };
      if (state.mute) return;
      if (anySolo && !state.solo) return;

      const trackLen = track.trackLength && track.trackLength > 0 ? track.trackLength : track.steps.length;
      const stepIdx = trackLen > 0 ? step % trackLen : step;
      const stepVal = track.steps[stepIdx] || 0;
      if (stepVal <= 0) return;

      // F-03/N-04: probability gates offline rendering, but with a DETERMINISTIC roll
      // so re-exporting the same project is reproducible and every exporter agrees.
      const probability = track.probability?.[stepIdx];
      if (!probabilityPasses(probability, exportSeed, trackIdx, stepIdx)) {
        return;
      }

      // F-03/P0.5: per-track swing offset, from the shared rule both engines use.
      const trackSwingOffset = track.swing !== undefined ? track.swing / 100 : 0;
      const effSwing = Math.max(0, Math.min(0.75, swing + trackSwingOffset));
      const swingOffset = swingOffsetSeconds(step, effSwing, stepDur);
      const stepTime = unswungTime + swingOffset;

      const velVal = track.velocity && track.velocity[stepIdx] !== undefined ? track.velocity[stepIdx] : 100;
      const normalizedVel = velVal / 127;
      const pitchVal = track.pitch && track.pitch[stepIdx] !== undefined && track.pitch[stepIdx] !== null ? track.pitch[stepIdx]! : 0;
      const gateVal = track.gate && track.gate[stepIdx] !== undefined ? track.gate[stepIdx] : 0.8;

      const trackDest = trackStrips[trackIdx].insert.input;
      const trackId = (track.track_id || "").toLowerCase();
      const lowerName = track.name.toLowerCase();
      // Exporter parity: resolve the same per-track instrument the live engine does, so a
      // genre's declared timbre survives an offline bounce instead of falling back to the
      // fixed per-role preset. Drum voices ignore this (their dispatch is untouched).
      const synthPreset = resolveInstrumentPreset(track.instrument, trackId);

      // Ratchet
      const isHatTriplet = (trackId === "hihat" || lowerName.includes("hat")) && stepVal === 3;
      const ratchet = resolveRatchet(track.ratchet?.[stepIdx], isHatTriplet);

      const subDur = stepDur / ratchet;
      for (let r = 0; r < ratchet; r++) {
        const subTime = stepTime + r * subDur;
        const subVel = normalizedVel * ratchetVelocityScale(r, ratchet);

        // Synthesis Dispatch with physical drum kit modeling and polyphonic synth
        if (trackId === "kick" || lowerName.includes("kick")) {
          synthesizeKick(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r));
          // Kick-bass sidechain ducking, scheduled from the same shape the live engine uses
          // (`audio/sidechain.ts`), so an export matches what was auditioned.
          const duckShape = resolveKickDuckShape(pattern.genre_id, subVel);
          pattern.tracks.forEach((tTrack: Track, tIdx: number) => {
            const tTid = (tTrack.track_id || "").toLowerCase();
            const tName = (tTrack.name || "").toLowerCase();
            if (tTid === "bass" || tName.includes("bass")) {
              const bassStrip = trackStrips[tIdx];
              if (bassStrip?.duckGain) {
                try {
                  scheduleKickDuck(bassStrip.duckGain.gain, subTime, duckShape);
                } catch {
                  // Guard against scheduling errors
                }
              }
            }
          });
        } else if (trackId === "snare" || lowerName.includes("snare")) {
          // D8 parity with `AudioEngine`: a declared clap/rimshot is voiced by the percussion
          // library, everything else by the snare model.
          if (instrumentWantsPercussionVoice(track.instrument)) {
            synthesizePercussion(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r), track.instrument);
          } else {
            synthesizeSnare(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r));
          }
        } else if (trackId === "hihat" || trackId === "hat" || lowerName.includes("hihat") || lowerName.includes("hat")) {
          // Acoustic Enhancement: Hi-Hat Choke Group (parity with AudioEngine)
          if (stepVal === 1 || stepVal === 3) {
            for (const openHat of openHiHatVoices) {
              if (openHat.stopTime > subTime) {
                for (const gNode of openHat.gains) {
                  try {
                    const g = gNode.gain;
                    // Q1: same analytic anchor as the live engine. Reading `g.value` here
                    // anchored the fade at "now" instead of at the scheduled `subTime`, so
                    // the exported choke stepped and clicked while the live one did not.
                    const anchor = openHat.envelope
                      ? Math.max(0.0001, drumEnvelopeLevelAt(openHat.envelope, subTime))
                      : Math.max(0.0001, g.value);
                    g.cancelScheduledValues(subTime);
                    g.setValueAtTime(anchor, subTime);
                    g.exponentialRampToValueAtTime(0.0001, subTime + 0.003);
                  } catch {
                    // Guard against scheduling errors
                  }
                }
              }
            }
          }
          const hatVoice = synthesizeHiHat(ctx, trackDest, subTime, subVel, pitchVal, drumKit, stepVal, subDur, gateVal, noiseBuf, noisePositionFor(trackIdx, stepIdx, r));
          if (stepVal === 2 && hatVoice.gains.length > 0) {
            openHiHatVoices.push({ gains: hatVoice.gains, stopTime: hatVoice.stopTime, envelope: hatVoice.envelope });
            if (openHiHatVoices.length > 16) {
              openHiHatVoices.shift();
            }
          }
        } else if (trackId === "percussion" || trackId === "perc" || lowerName.includes("perc") || lowerName.includes("clap")) {
          synthesizePercussion(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r), track.instrument);
        } else if (trackId === "bass" || lowerName.includes("bass")) {
          const midi = pitchVal > 0 ? pitchVal : 36;
          playPolySynthNote(ctx, trackDest, midi, subTime, subDur * gateVal, subVel, synthPreset);
        } else if (trackId === "chords" || trackId === "chord" || lowerName.includes("chord") || lowerName.includes("pad")) {
          // E-01: identical voicing to `AudioEngine.playChord`. Exporter parity is a
          // hard rule in this project, so both sides call the same shared module and
          // apply the same per-voice gain — never re-implement it here.
          const midi = pitchVal > 0 ? pitchVal : 60;
          // Same genre-appropriate chord treatment as `AudioEngine.playChord` — voicing,
          // note length and onset spread. Resolving any of the three differently here
          // would silently break exporter parity for every rock, jazz and ambient genre.
          const treatment = resolveChordTreatment(pattern.genre_id, track.instrument);
          // The stored stack wins (see `chordNotesForStep`): a genre whose chords are expanded into
          // the pattern must render *those* notes here too, or live/export parity breaks the moment
          // a chord is stored — which is the whole reason this is one shared call.
          const notes = chordNotesForStep(track, stepIdx, midi, pattern.scale, { style: treatment.style });
          const voiceVel = subVel * chordVoiceGain(notes.length);
          const chordDur = chordNoteDuration(subDur, gateVal, treatment);
          // P6: if GS-1 voices this track, it takes the notes and the native voices are skipped —
          // playing both would double the harmony. The frame plan comes from the shared planner,
          // so the live engine and this renderer cannot disagree about when a note sounds.
          const chordHost = gs1Hosts.get(trackIdx);
          if (chordHost) {
            const planned = planGs1Notes({
              role: "chords",
              instrument: track.instrument,
              notes: notes.map((note, i) => ({
                note,
                time: chordVoiceOnset(subTime, i, treatment),
                duration: chordDur,
                velocity: voiceVel,
              })),
              sampleRate: ctx.sampleRate,
              latencyFrames: chordHost.scheduledNoteLatencyFrames,
            });
            if (planned) {
              const capped = capPlanPolyphony(planned);
              for (const plannedNote of capped.notes) {
                chordHost.noteOnAt(plannedNote.note, plannedNote.velocity, plannedNote.atFrame, plannedNote.pan);
                chordHost.noteOffAt(plannedNote.note, plannedNote.offFrame);
              }
              return;
            }
          }
          notes.forEach((note, i) => {
            playPolySynthNote(
              ctx,
              trackDest,
              note,
              chordVoiceOnset(subTime, i, treatment),
              chordDur,
              voiceVel,
              synthPreset
            );
          });
        } else if (trackId === "lead" || lowerName.includes("lead")) {
          const midi = pitchVal > 0 ? pitchVal : 72;
          const leadDur = subDur * gateVal * 1.5;
          const leadHost = gs1Hosts.get(trackIdx);
          if (leadHost) {
            const planned = planGs1Notes({
              role: "lead",
              instrument: track.instrument,
              notes: [{ note: midi, time: subTime, duration: leadDur, velocity: subVel }],
              sampleRate: ctx.sampleRate,
              latencyFrames: leadHost.scheduledNoteLatencyFrames,
            });
            if (planned) {
              const plannedNote = planned.notes[0];
              leadHost.noteOnAt(plannedNote.note, plannedNote.velocity, plannedNote.atFrame, plannedNote.pan);
              leadHost.noteOffAt(plannedNote.note, plannedNote.offFrame);
              return;
            }
          }
          playPolySynthNote(ctx, trackDest, midi, subTime, leadDur, subVel, synthPreset);
        } else if (trackId === "fx" || lowerName.includes("fx")) {
          // Same split as AudioEngine.playFX: `noise_sweep` keeps the shared swept riser,
          // anything else is voiced by the poly synth with the track's own preset.
          if (synthPreset === DEFAULT_SYNTH_PRESETS.noiseSweep) {
            synthFX(ctx, trackDest, subTime, subVel, pitchVal, subDur, gateVal);
          } else {
            const midi = pitchVal > 0 ? pitchVal : 72;
            playPolySynthNote(ctx, trackDest, midi, subTime, subDur * gateVal * 1.5, subVel, synthPreset);
          }
        } else {
          synthesizePercussion(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf, noisePositionFor(trackIdx, stepIdx, r), track.instrument);
        }
      }
    });
  }

  // Wait for the limiter module before rendering: an OfflineAudioContext renders in
  // one shot, so a worklet that installed after `startRendering()` would silently
  // leave the whole bounce on the compressor fallback.
  const limiterKind = await graph.limiter.ready;
  options.onLimiterKind?.(limiterKind);

  const rendered = await ctx.startRendering();
  if (limiterKind === "worklet") return rendered;

  /**
   * The fallback path has no true-peak ceiling — its own warning says so ("no true-peak ceiling,
   * no lookahead. Peak limiting is degraded") — and that let a hot arrangement render *above* the
   * contract: measured on `tropical-house`, **+1.75 dBTP** in one run and −1.30 dBTP in the next,
   * from the same code, because whether the AudioWorklet could be registered is not something the
   * caller can rely on. Every export is re-run through the **same kernel the worklet runs**
   * (`limitBuffers`), so the ceiling is a property of the renderer rather than of the platform's
   * worklet support. The compressor's own reduction still applies first; this only removes what is
   * left above the ceiling.
   */
  const channels: Float32Array[] = [];
  for (let c = 0; c < rendered.numberOfChannels; c += 1) channels.push(rendered.getChannelData(c));
  const guarded = applyOfflineCeiling(channels, rendered.sampleRate);
  const out = ctx.createBuffer(rendered.numberOfChannels, rendered.length, rendered.sampleRate);
  for (let c = 0; c < rendered.numberOfChannels; c += 1) out.copyToChannel(guarded.channels[c], c);
  return out;
}

/**
 * Apply the master true-peak ceiling to finished channel buffers.
 *
 * Pure and exported so the guarantee is unit-testable without an AudioContext: the offline renderer
 * calls it when the graph could not run the limiter worklet, and the test drives hot, quiet and
 * already-limited material through it.
 *
 * The kernel is the worklet's own (same class, same parameters) and it delays by its lookahead, which
 * is also what the in-graph worklet does — so a guarded render is aligned with a worklet render.
 */
export function applyOfflineCeiling(
  channels: readonly Float32Array[],
  sampleRate: number
): { channels: Float32Array[]; gainReductionDb: number } {
  const result = limitBuffers(
    channels.map((channel) => Float32Array.from(channel)),
    sampleRate,
    { ceilingDb: MASTER_LIMITER_INTERNAL_CEILING_DB }
  );
  return { channels: result.channels, gainReductionDb: result.gainReductionDb };
}

function synthFX(ctx: BaseAudioContext, dest: AudioNode, time: number, vel: number, pitchOffset: number, stepDur: number, gateVal: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const startF = pitchOffset > 24 ? midiToFreq(pitchOffset, 69) : 880 * Math.pow(2, pitchOffset / 12);
  osc.frequency.setValueAtTime(startF, time);
  const noteDuration = Math.max(0.1, Math.min(3.0, stepDur * gateVal * 1.2));
  osc.frequency.exponentialRampToValueAtTime(90, time + noteDuration * 0.9);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2000, time);
  filter.frequency.exponentialRampToValueAtTime(200, time + noteDuration * 0.9);
  filter.Q.value = 5.0;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vel * 0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.start(time);
  osc.stop(time + noteDuration + 0.02);
}

/**
 * B2 — render a whole song, through the same renderer as everything else.
 *
 * There is deliberately no second renderer: the arrangement is flattened into one pattern
 * (`flattenSong`, which applies each section's clip, repeats, mutes and velocity scale) and handed to
 * `renderPatternOffline` with `bars: 1`, because the flattened pattern's `totalSteps` *is* the song. Every
 * measurement, gate, limiter path and stem exporter therefore keeps working on a song unchanged.
 *
 * `songMode` is the caller's decision (the app renders the song when the project is in song mode and the loop
 * otherwise); this function always renders the arrangement it is given.
 */
export async function renderSongOffline(
  song: Song,
  options: RenderWavOptions = {}
): Promise<AudioBuffer> {
  const flattened = flattenSong(song);
  if (!flattened.totalBars || flattened.totalSteps <= 0) {
    throw new Error(`cannot render the song: ${flattened.problems.join("; ") || "no playable bars"}`);
  }
  return renderPatternOffline(flattened.pattern, { ...options, bars: 1 });
}

/**
 * Exports Master Mix as a downloadable WAV Blob
 */
export async function exportMasterWav(
  pattern: DrumPattern,
  genreId = "groove",
  options: RenderWavOptions = {}
): Promise<ExportedWav> {
  let limiterKind: MasterLimiterKind = "fallback";
  let gs1HostFailures = 0;
  const audioBuf = await renderPatternOffline(pattern, {
    ...options,
    onLimiterKind: (kind) => {
      limiterKind = kind;
      options.onLimiterKind?.(kind);
    },
    onGs1HostFailures: (count) => {
      gs1HostFailures = count;
      options.onGs1HostFailures?.(count);
    },
  });
  const wavArrayBuffer = encodeAudioBufferToWav(audioBuf);
  const blob = new Blob([wavArrayBuffer], { type: "audio/wav" });
  const bpm = options.bpm || pattern.bpm || 120;
  const sanitizedGenre = (genreId || "groove").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const filename = `${sanitizedGenre}_master_${bpm}bpm.wav`;

  return {
    blob,
    filename,
    durationSec: audioBuf.duration,
    limiterKind,
    gs1HostFailures,
  };
}

/**
 * Exports each track as an isolated Stem WAV (P4-02)
 */
export async function exportStemsWav(
  pattern: DrumPattern,
  genreId = "groove",
  options: RenderWavOptions = {}
): Promise<ExportedStem[]> {
  const bpm = options.bpm || pattern.bpm || 120;
  const sanitizedGenre = (genreId || "groove").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const stems: ExportedStem[] = [];

  for (let i = 0; i < pattern.tracks.length; i++) {
    const track = pattern.tracks[i];
    const trackName = (track.track_id || track.name || `track_${i + 1}`).toLowerCase().replace(/[^a-z0-9_-]/gi, "_");
    let stemGs1Failures = 0;
    const audioBuf = await renderPatternOffline(pattern, {
      ...options,
      stemTrackIdx: i,
      onGs1HostFailures: (count) => {
        stemGs1Failures = count;
      },
    });
    const wavArrayBuffer = encodeAudioBufferToWav(audioBuf);
    const blob = new Blob([wavArrayBuffer], { type: "audio/wav" });
    const filename = `${sanitizedGenre}_stem_${trackName}_${bpm}bpm.wav`;

    stems.push({
      blob,
      filename,
      trackName: track.name,
      trackIdx: i,
      gs1HostFailures: stemGs1Failures,
    });
  }

  return stems;
}

/**
 * Packages all stems into an uncompressed ZIP archive (P4-02)
 */
export async function exportStemsZip(
  pattern: DrumPattern,
  genreId = "groove",
  options: RenderWavOptions = {}
): Promise<{ blob: Blob; filename: string; gs1HostFailures: number }> {
  const stems = await exportStemsWav(pattern, genreId, options);
  const bpm = options.bpm || pattern.bpm || 120;
  const sanitizedGenre = (genreId || "groove").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

  const zipEntries = await Promise.all(
    stems.map(async (stem) => ({
      name: stem.filename,
      data: new Uint8Array(await stem.blob.arrayBuffer()),
    }))
  );

  const zipBlob = createZipArchive(zipEntries);
  const zipFilename = `${sanitizedGenre}_stems_${bpm}bpm.zip`;

  return {
    blob: zipBlob,
    filename: zipFilename,
    // Summed across stems: each stem renders independently, so each can lose its own GS-1 host.
    gs1HostFailures: stems.reduce((n, stem) => n + stem.gs1HostFailures, 0),
  };
}

/**
 * Triggers a client-side file download
 */
export function triggerWavDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

