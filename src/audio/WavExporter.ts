/**
 * WAV Offline Exporter & Stems Renderer (P4-01 & P4-02)
 *
 * Provides bit-exact offline rendering of Groove patterns to 16-bit PCM WAV:
 * - Master stereo WAV export with master limiter
 * - Per-track stem WAV export with genre/track/BPM naming
 * - Polymeter, gate, swing, velocity, pitch and stereo panning support
 */

import { DrumPattern, Track } from "../types/genre";
import { TrackState } from "./AudioEngine";
import { createZipArchive } from "../utils/zip";
import { DrumKitType, synthesizeKick, synthesizeSnare, synthesizeHiHat, synthesizePercussion } from "./DrumKitModels";
import { playPolySynthNote, DEFAULT_SYNTH_PRESETS } from "./PolySynth";

export interface RenderWavOptions {
  bpm?: number;
  swing?: number;
  bars?: number;
  sampleRate?: number;
  trackStates?: TrackState[];
  stemTrackIdx?: number;
  drumKit?: DrumKitType;
}

export interface ExportedWav {
  blob: Blob;
  filename: string;
  durationSec: number;
}

export interface ExportedStem {
  blob: Blob;
  filename: string;
  trackName: string;
  trackIdx: number;
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
    let sL = Math.max(-1, Math.min(1, leftChannel[i]));
    const intL = sL < 0 ? sL * 0x8000 : sL * 0x7fff;
    view.setInt16(offset, intL, true);
    offset += 2;

    // Right sample clamp & convert
    let sR = Math.max(-1, Math.min(1, rightChannel[i]));
    const intR = sR < 0 ? sR * 0x8000 : sR * 0x7fff;
    view.setInt16(offset, intR, true);
    offset += 2;
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
  const bpm = options.bpm || pattern.bpm || 120;
  const swing = options.swing !== undefined ? options.swing : (pattern.swing || 0);
  const bars = Math.max(1, options.bars || 1);
  const stepDur = 60 / bpm / 4;
  const patternSteps =
    (pattern as any).totalSteps && (pattern as any).totalSteps > 0
      ? (pattern as any).totalSteps
      : pattern.tracks[0]?.steps.length || 16;
  const totalSteps = patternSteps * bars;
  const totalDurationSec = totalSteps * stepDur + 0.6; // Tail for decay/release

  const OfflineContextClass =
    (typeof window !== "undefined" && (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)) ||
    (globalThis as any).OfflineAudioContext;

  if (!OfflineContextClass) {
    throw new Error("OfflineAudioContext is not supported in this environment");
  }

  const lengthInSamples = Math.ceil(totalDurationSec * sampleRate);
  const ctx = new OfflineContextClass(2, lengthInSamples, sampleRate);

  // Master Limiter and Gain
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.85, 0);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-1.0, 0);
  limiter.knee.setValueAtTime(0.0, 0);
  limiter.ratio.setValueAtTime(20.0, 0);
  limiter.attack.setValueAtTime(0.003, 0);
  limiter.release.setValueAtTime(0.05, 0);

  masterGain.connect(limiter);
  limiter.connect(ctx.destination);

  // Generate 2-second white noise buffer
  const noiseBuf = ctx.createBuffer(1, sampleRate * 2, sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  // Pre-configure track channel strips (Gain + Stereo Panner)
  const trackStrips: Array<{ gain: GainNode; pan: StereoPannerNode }> = [];
  const numTracks = pattern.tracks.length;

  for (let t = 0; t < numTracks; t++) {
    const tState = options.trackStates?.[t] || { mute: false, solo: false, volume: 0.8, pan: 0 };
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(tState.volume, 0);

    const tPan = ctx.createStereoPanner();
    tPan.pan.setValueAtTime(Math.max(-1, Math.min(1, tState.pan)), 0);

    tGain.connect(tPan);
    tPan.connect(masterGain);
    trackStrips.push({ gain: tGain, pan: tPan });
  }

  const anySolo = options.trackStates?.some((s) => s.solo);
  const drumKit: DrumKitType = options.drumKit || "808";

  // Step scheduling loop
  for (let step = 0; step < totalSteps; step++) {
    const unswungTime = step * stepDur;
    const swingOffset = step % 2 === 1 && swing > 0 ? (swing * 0.5) * stepDur : 0;
    const stepTime = unswungTime + swingOffset;

    pattern.tracks.forEach((track: Track, trackIdx: number) => {
      // Stem mode check: only render requested track if stemTrackIdx is specified
      if (options.stemTrackIdx !== undefined && options.stemTrackIdx !== trackIdx) {
        return;
      }

      const state = options.trackStates?.[trackIdx] || { mute: false, solo: false, volume: 0.8, pan: 0 };
      if (state.mute) return;
      if (anySolo && !state.solo) return;

      const trackLen = track.trackLength && track.trackLength > 0 ? track.trackLength : track.steps.length;
      const stepIdx = trackLen > 0 ? step % trackLen : step;
      const stepVal = track.steps[stepIdx] || 0;
      if (stepVal <= 0) return;

      const velVal = track.velocity && track.velocity[stepIdx] !== undefined ? track.velocity[stepIdx] : 100;
      const normalizedVel = (velVal / 127) * 1.0;
      const pitchVal = track.pitch && track.pitch[stepIdx] !== undefined && track.pitch[stepIdx] !== null ? track.pitch[stepIdx]! : 0;
      const gateVal = track.gate && track.gate[stepIdx] !== undefined ? track.gate[stepIdx] : 0.8;

      const trackDest = trackStrips[trackIdx].gain;
      const trackId = (track.track_id || "").toLowerCase();
      const lowerName = track.name.toLowerCase();

      // Ratchet
      const isHatTriplet = (trackId === "hihat" || lowerName.includes("hat")) && stepVal === 3;
      const ratchet = track.ratchet && track.ratchet[stepIdx] && track.ratchet[stepIdx] > 1
        ? track.ratchet[stepIdx]
        : (isHatTriplet ? 3 : 1);

      const subDur = stepDur / ratchet;
      for (let r = 0; r < ratchet; r++) {
        const subTime = stepTime + r * subDur;
        const subVel = normalizedVel * (0.85 + (r / ratchet) * 0.15);

        // Synthesis Dispatch with physical drum kit modeling and polyphonic synth
        if (trackId === "kick" || lowerName.includes("kick")) {
          synthesizeKick(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf);
        } else if (trackId === "snare" || lowerName.includes("snare")) {
          synthesizeSnare(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf);
        } else if (trackId === "hihat" || trackId === "hat" || lowerName.includes("hihat") || lowerName.includes("hat")) {
          synthesizeHiHat(ctx, trackDest, subTime, subVel, pitchVal, drumKit, stepVal, subDur, gateVal, noiseBuf);
        } else if (trackId === "percussion" || trackId === "perc" || lowerName.includes("perc") || lowerName.includes("clap")) {
          synthesizePercussion(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf);
        } else if (trackId === "bass" || lowerName.includes("bass")) {
          const midi = pitchVal > 0 ? pitchVal : 36;
          playPolySynthNote(ctx, trackDest, midi, subTime, subDur * gateVal, subVel, DEFAULT_SYNTH_PRESETS.acidBass);
        } else if (trackId === "chords" || trackId === "chord" || lowerName.includes("chord") || lowerName.includes("pad")) {
          const midi = pitchVal > 0 ? pitchVal : 60;
          playPolySynthNote(ctx, trackDest, midi, subTime, subDur * gateVal * 1.5, subVel, DEFAULT_SYNTH_PRESETS.warmPad);
        } else if (trackId === "lead" || lowerName.includes("lead")) {
          const midi = pitchVal > 0 ? pitchVal : 72;
          playPolySynthNote(ctx, trackDest, midi, subTime, subDur * gateVal * 1.5, subVel, DEFAULT_SYNTH_PRESETS.analogLead);
        } else if (trackId === "fx" || lowerName.includes("fx")) {
          synthFX(ctx, trackDest, subTime, subVel, pitchVal, subDur, gateVal);
        } else {
          synthesizePercussion(ctx, trackDest, subTime, subVel, pitchVal, drumKit, noiseBuf);
        }
      }
    });
  }

  return await ctx.startRendering();
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
 * Exports Master Mix as a downloadable WAV Blob
 */
export async function exportMasterWav(
  pattern: DrumPattern,
  genreId = "groove",
  options: RenderWavOptions = {}
): Promise<ExportedWav> {
  const audioBuf = await renderPatternOffline(pattern, options);
  const wavArrayBuffer = encodeAudioBufferToWav(audioBuf);
  const blob = new Blob([wavArrayBuffer], { type: "audio/wav" });
  const bpm = options.bpm || pattern.bpm || 120;
  const sanitizedGenre = (genreId || "groove").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const filename = `${sanitizedGenre}_master_${bpm}bpm.wav`;

  return {
    blob,
    filename,
    durationSec: audioBuf.duration,
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
    const audioBuf = await renderPatternOffline(pattern, {
      ...options,
      stemTrackIdx: i,
    });
    const wavArrayBuffer = encodeAudioBufferToWav(audioBuf);
    const blob = new Blob([wavArrayBuffer], { type: "audio/wav" });
    const filename = `${sanitizedGenre}_stem_${trackName}_${bpm}bpm.wav`;

    stems.push({
      blob,
      filename,
      trackName: track.name,
      trackIdx: i,
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
): Promise<{ blob: Blob; filename: string }> {
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

