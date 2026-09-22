/**
 * MP3 export.
 *
 * ## Why there is a library here at all
 *
 * A browser cannot write an MP3. `MediaRecorder` produces webm/opus or m4a/AAC, never MP3, and no Web Audio API
 * encodes one — so the format users ask for by name is the one format the platform will not give us. This uses
 * `@breezystack/lamejs` (a maintained fork of lamejs; LAME is **LGPL-3.0**). The licence, its provenance and the
 * redistribution reasoning are in `public/THIRD_PARTY_NOTICES.md`, which ships with the app.
 *
 * ## Why it is a dynamic import, and why that is asserted
 *
 * The encoder is 259 KB (67 KB gzipped). That is fine for a lazy chunk and unacceptable in the first paint, so
 * the import lives **inside the function** below — not at module scope, where a stray re-export could drag it
 * into the entry bundle. `mp3Export.test.ts` reads this file and fails if the specifier ever moves to a static
 * `import`, and the bundle budget gate independently proves the chunk is not in the initial route.
 *
 * ## What it renders
 *
 * The **same master** as the WAV export: `renderPatternOffline` is shared, so an MP3 and a WAV of one pattern
 * are the same performance with the same limiter, sample rate and ceiling. Two exports of the same groove
 * disagreeing with each other would be a bug, not a nuance.
 */
import { DrumPattern } from "../types/genre";
import { renderPatternOffline, type RenderWavOptions } from "./WavExporter";
import type { MasterLimiterKind } from "./MasterLimiter";

export interface ExportedMp3 {
  blob: Blob;
  filename: string;
  durationSec: number;
  /** The master limiter the bounce actually went through; see `ExportedWav`. */
  limiterKind: MasterLimiterKind;
  /** GS-1 hosts that failed to load for this render; `0` normally. See `ExportedWav`. */
  gs1HostFailures: number;
  bitrateKbps: number;
  /** `true` when the render rate was not one LAME accepts and had to be resampled. */
  resampled: boolean;
}

export interface Mp3ExportOptions extends RenderWavOptions {
  /** Constant bitrate. 192 kbps is transparent for a drum machine at half the size of 320. */
  bitrateKbps?: number;
  /** 0-1, reported per block so a long render can show progress instead of appearing hung. */
  onProgress?: (fraction: number) => void;
}

/**
 * LAME accepts MPEG-1 Layer III at these rates only.
 *
 * A buffer at any other rate is resampled here rather than handed to the encoder, which would either throw or —
 * worse — write a file at the wrong pitch.
 */
const LAME_RATES = [32000, 44100, 48000] as const;

export function nearestLameRate(sampleRate: number): number {
  return LAME_RATES.reduce((best, rate) => (Math.abs(rate - sampleRate) < Math.abs(best - sampleRate) ? rate : best));
}

/** Linear-interpolating resampler; only used when the render rate is not one LAME accepts. */
export function resampleChannel(channel: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return channel;
  const length = Math.max(1, Math.round((channel.length * to) / from));
  const out = new Float32Array(length);
  const ratio = (channel.length - 1) / Math.max(1, length - 1);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const low = Math.floor(position);
    const high = Math.min(channel.length - 1, low + 1);
    const t = position - low;
    out[i] = channel[low] * (1 - t) + channel[high] * t;
  }
  return out;
}

/** `Float32Array` of -1..1 into the 16-bit integers LAME wants. */
export function toInt16(channel: Float32Array): Int16Array {
  const out = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, channel[i]));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

/** LAME's natural block: a multiple of 576 samples, the Layer III granule pair. */
const BLOCK_SIZE = 1152;

/**
 * Blocks between yields.
 *
 * Encoding is synchronous work on the main thread. Without a yield the tab freezes for the whole render and the
 * progress toast never repaints; once per 64 blocks is often enough for the UI to breathe and rare enough not to
 * dominate the encode.
 */
const BLOCKS_PER_YIELD = 64;

export async function encodeAudioBufferToMp3(
  buffer: AudioBuffer,
  options: { bitrateKbps?: number; onProgress?: (fraction: number) => void } = {}
): Promise<{ blob: Blob; resampled: boolean; bitrateKbps: number }> {
  const bitrateKbps = options.bitrateKbps ?? 192;
  // The one dynamic import. Keep it inside the function: see the note at the top of the file.
  const { Mp3Encoder } = await import("@breezystack/lamejs");

  const targetRate = nearestLameRate(buffer.sampleRate);
  const resampled = targetRate !== buffer.sampleRate;
  const leftSource = buffer.getChannelData(0);
  const rightSource = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftSource;
  const left = toInt16(resampled ? resampleChannel(leftSource, buffer.sampleRate, targetRate) : leftSource);
  const right = toInt16(resampled ? resampleChannel(rightSource, buffer.sampleRate, targetRate) : rightSource);

  const encoder = new Mp3Encoder(2, targetRate, bitrateKbps);
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < left.length; offset += BLOCK_SIZE) {
    const encoded = encoder.encodeBuffer(left.subarray(offset, offset + BLOCK_SIZE), right.subarray(offset, offset + BLOCK_SIZE));
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
    options.onProgress?.(Math.min(1, (offset + BLOCK_SIZE) / left.length));
    if ((offset / BLOCK_SIZE) % BLOCKS_PER_YIELD === BLOCKS_PER_YIELD - 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  return {
    blob: new Blob(chunks as BlobPart[], { type: "audio/mpeg" }),
    resampled,
    bitrateKbps,
  };
}

/** The master MP3: the same render, the same ceiling, the same naming as the WAV export. */
export async function exportMasterMp3(
  pattern: DrumPattern,
  genreId = "groove",
  options: Mp3ExportOptions = {}
): Promise<ExportedMp3> {
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
  const { blob, resampled, bitrateKbps } = await encodeAudioBufferToMp3(audioBuf, {
    bitrateKbps: options.bitrateKbps,
    onProgress: options.onProgress,
  });
  const bpm = options.bpm || pattern.bpm || 120;
  const sanitizedGenre = (genreId || "groove").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  return {
    blob,
    filename: `${sanitizedGenre}_master_${bpm}bpm.mp3`,
    durationSec: audioBuf.duration,
    limiterKind,
    gs1HostFailures,
    bitrateKbps,
    resampled,
  };
}
