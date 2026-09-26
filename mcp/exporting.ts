/**
 * Export and measurement for the MCP server.
 *
 * All of this is pure Node: MIDI is byte-level JS, the Ableton writer is XML plus `CompressionStream` (both
 * available in Node 22), the share codec is base64, and the loudness report is the committed measurement table
 * inlined at build time. Audio *rendering* is the one thing that needs a browser and lives in `render/worker.ts`.
 */
import { generateMidiBytes } from "../src/audio/MidiExporter";
import { buildAbletonLiveSetXml, gzipCompressXml } from "../src/audio/AbletonExporter";
import { encodeSharedSequencer, toSharedTrack, MAX_BASE64_LENGTH } from "../src/audio/SequencerUrlShare";
import type { SequencerPattern } from "../src/types/genre";
import loudnessBaseline from "../scripts/loudness.baseline.json" with { type: "json" };
import { findGenre } from "./library";

/** The deployed app an agent's share link should point at, unless it is told otherwise. */
export const DEFAULT_APP_ORIGIN = "https://groove.wangda.today";

export function appOrigin(): string {
  return process.env.GROOVE_MCP_APP_URL?.replace(/\/$/, "") || DEFAULT_APP_ORIGIN;
}

export interface ExportedBytes {
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
}

/** Standard MIDI File, the same bytes the toolbar's MIDI export writes. */
export function exportMidi(pattern: SequencerPattern, options: { bpm?: number; genreName?: string } = {}): ExportedBytes {
  const genre = pattern.genre_id ? findGenre(pattern.genre_id) : undefined;
  const bytes = generateMidiBytes({
    bpm: options.bpm ?? pattern.bpm ?? 120,
    pattern,
    genreName: options.genreName ?? genre?.name ?? pattern.genre_id ?? "groove",
  });
  return { filename: `${pattern.genre_id || "groove"}_${options.bpm ?? pattern.bpm ?? 120}bpm.mid`, bytes, mimeType: "audio/midi" };
}

/** Ableton Live set: the XML is built here and gzipped with the platform's own compressor. */
export async function exportAbleton(
  pattern: SequencerPattern,
  options: { bpm?: number; genreName?: string; clips?: Array<{ pattern: SequencerPattern; name?: string }> } = {}
): Promise<ExportedBytes> {
  const genre = pattern.genre_id ? findGenre(pattern.genre_id) : undefined;
  const bpm = options.bpm ?? pattern.bpm ?? 120;
  const xml = buildAbletonLiveSetXml({
    bpm,
    pattern,
    genreName: options.genreName ?? genre?.name ?? pattern.genre_id ?? "groove",
    // One clip per section, when the caller is exporting a song rather than a loop.
    ...(options.clips?.length ? { clips: options.clips } : {}),
  } as Parameters<typeof buildAbletonLiveSetXml>[0]);
  const bytes = await gzipCompressXml(xml);
  return {
    filename: `${pattern.genre_id || "groove"}_${bpm}bpm.als`,
    bytes,
    mimeType: "application/x-ableton-live-set",
  };
}

export interface ShareResult {
  url: string;
  degraded: boolean;
  payloadChars: number;
  reason?: "too-large";
}

/**
 * A share link an agent can hand to a human.
 *
 * Unlike the app's own helper this always builds an **absolute** URL (the app's version asks
 * `window.location`, which does not exist here) and it reports the payload size, because "the link was too big
 * and lost its velocities" is something the caller has to be told rather than left to discover.
 */
export function shareUrl(pattern: SequencerPattern, options: { origin?: string } = {}): ShareResult {
  const state = {
    genreId: pattern.genre_id,
    bpm: pattern.bpm,
    swing: pattern.swing ?? 0,
    scale: pattern.scale,
    timeSignature: pattern.timeSignature,
    resolution: pattern.resolution,
    totalSteps: pattern.totalSteps,
    tracks: pattern.tracks.map(toSharedTrack),
  } as Parameters<typeof encodeSharedSequencer>[0];
  const full = encodeSharedSequencer(state);
  const origin = options.origin?.replace(/\/$/, "") || appOrigin();
  if (full && full.length <= MAX_BASE64_LENGTH) {
    return { url: `${origin}/?groove=${full}`, degraded: false, payloadChars: full.length };
  }
  // Retry without the optional per-step arrays: still playable, and honest about it.
  const reduced = encodeSharedSequencer({
    ...state,
    tracks: state.tracks.map((track) => ({ ...track, pitch: undefined, gate: undefined, ratchet: undefined, probability: undefined })),
  });
  if (reduced && reduced.length <= MAX_BASE64_LENGTH) {
    return { url: `${origin}/?groove=${reduced}`, degraded: true, payloadChars: reduced.length };
  }
  return { url: "", degraded: true, payloadChars: reduced?.length ?? 0, reason: "too-large" };
}

/** One row of the committed loudness measurement, or the whole table's shape. */
export interface LoudnessRow {
  category: string;
  legacyLufs: number;
  legacyPeakDb: number;
  arrangedLufs: number;
  arrangedPeakDb: number;
  arrangedTruePeakDb: number;
  arrangedRmsDb: number;
  limiterKind: string;
  trimDb: number;
}

const BASELINE = loudnessBaseline as unknown as {
  generatedAt: string;
  genreCount: number;
  bars: number;
  repeats: number;
  limiter: string;
  genres: Record<string, LoudnessRow>;
};

export function loudnessReport(genreId?: string): Record<string, unknown> {
  const meta = {
    generatedAt: BASELINE.generatedAt,
    genreCount: BASELINE.genreCount,
    bars: BASELINE.bars,
    repeats: BASELINE.repeats,
    limiter: BASELINE.limiter,
    note: "Measured by `npm run check:loudness` through the app's own offline renderer (BS.1770-4 gated loudness).",
  };
  if (!genreId) {
    const lufs = Object.values(BASELINE.genres).map((row) => row.arrangedLufs);
    const sorted = [...lufs].sort((a, b) => a - b);
    return {
      ...meta,
      stats: {
        minLufs: sorted[0],
        medianLufs: sorted[Math.floor(sorted.length / 2)],
        maxLufs: sorted[sorted.length - 1],
        spreadDb: Math.round((sorted[sorted.length - 1] - sorted[0]) * 100) / 100,
      },
      genres: Object.fromEntries(
        Object.entries(BASELINE.genres).map(([id, row]) => [id, { arrangedLufs: row.arrangedLufs, truePeakDb: row.arrangedTruePeakDb, trimDb: row.trimDb }])
      ),
    };
  }
  const row = BASELINE.genres[genreId];
  return row ? { ...meta, genreId, ...row } : { ...meta, genreId, error: `no loudness row for "${genreId}"` };
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
