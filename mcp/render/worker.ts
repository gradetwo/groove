/**
 * The one part of the MCP server that needs a browser.
 *
 * Audio rendering is genuinely a browser capability here: the app's engine *is* Web Audio plus the GS-1 wasm
 * host, and re-implementing a second renderer in Node would produce a second sound — the exact failure this
 * codebase spends gates avoiding. So this starts the app's **dev** server (so no test hook ever ships in the
 * production bundle) and drives a headless Chromium page that imports the real `renderPatternOffline`, the same
 * route `scripts/measure_genre_loudness.mjs` and `scripts/analyze_export_audio.mjs` take.
 *
 * The cost is a browser process, so it is started **lazily** — only the two audio tools need it — and torn down
 * when the server exits. `GROOVE_MCP_NO_BROWSER=1` refuses instead, which is what a locked-down deployment wants.
 */
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import type { SequencerPattern } from "../../src/types/genre";
import { measureLoudness, truePeakDbChannels } from "../../src/test/helpers/loudness";
import { fingerprintChannels } from "../../src/test/helpers/timbre";
import {
  channelCorrelation,
  clickAnalysis,
  clippedSampleCount,
  finalPeakDb,
  samplePeakDb,
  sideToMidDb,
  tailRmsDb,
} from "../../src/test/helpers/audioMetrics";

export interface RenderOptions {
  format: "wav" | "mp3";
  bars?: number;
  bitrateKbps?: number;
  genreId?: string;
  /**
   * A slug for the file name, from the caller's own song title.
   *
   * The server has never let model text name a file, and it still does not: this is whitelisted to `[a-z0-9-]`, lowercased, cut
   * to 40 characters, and joined to the genre and tempo rather than replacing them. What it buys is a file called
   * `neo-soul_my-ballad_80bpm.mp3` instead of `neo-soul_master_80bpm.mp3` for a caller that named its song.
   */
  nameSlug?: string;
  /**
   * Also render each track in isolation and report its peak.
   *
   * Off by default because it costs one extra render per track (eight on a full pattern) and most calls only
   * want a file. An agent asking "is the balance sane?" flips it on and gets the answer in one round trip.
   */
  trackPeaks?: boolean;
  /** Where to write; defaults to `GROOVE_MCP_OUT` or a fresh temp directory. */
  outputDir?: string;
}

export interface RenderResult {
  path: string;
  filename: string;
  bytes: number;
  durationSec: number;
  sampleRate: number;
  channels: number;
  limiterKind: string;
  truePeakDb: number;
  integratedLufs: number;
  /** Per-track peaks, so an agent can see the balance without a second call. */
  trackPeaksDb: Record<string, number>;
}

interface RendererState {
  child: ChildProcess | null;
  browser: import("playwright").Browser | null;
  page: import("playwright").Page | null;
  port: number;
}

const state: RendererState = { child: null, browser: null, page: null, port: 0 };

function appRoot(): string {
  // `dist-mcp/groove-mcp.mjs` sits next to the repo root it was built from.
  return process.env.GROOVE_MCP_ROOT || process.cwd();
}

async function ensurePage(): Promise<import("playwright").Page> {
  if (state.page) return state.page;

  const root = appRoot();
  const port = Number(process.env.GROOVE_MCP_PORT || 5399);
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) {
    throw new Error(`cannot render: ${viteBin} not found. Run the server from the repository root, or set GROOVE_MCP_ROOT.`);
  }

  state.child = spawn(process.execPath, [viteBin, "--port", String(port), "--strictPort"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve();
    };
    state.child?.stdout?.on("data", onData);
    state.child?.stderr?.on("data", onData);
    state.child?.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60000);
  });

  const { chromium } = await import("playwright");
  state.browser = await chromium.launch({ args: ["--no-sandbox"] });
  state.page = await state.browser.newPage();
  state.port = port;
  await state.page.goto(`http://127.0.0.1:${port}`, { waitUntil: "domcontentloaded" });
  return state.page;
}

/** Tear the browser and dev server down; called on process exit and by `stopRenderer()`. */
export async function stopRenderer(): Promise<void> {
  try {
    await state.browser?.close();
  } catch {
    /* already gone */
  }
  state.browser = null;
  state.page = null;
  if (state.child && !state.child.killed) state.child.kill("SIGTERM");
  state.child = null;
}

function outputDirectory(options: RenderOptions): string {
  const dir = options.outputDir || process.env.GROOVE_MCP_OUT || mkdtempSync(path.join(os.tmpdir(), "groove-mcp-"));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Render a pattern (or a genre's default pattern) and measure it in the same pass.
 *
 * Returning the measurements alongside the file is deliberate: "here is a 4-bar WAV" is far less useful to an
 * agent than "here is a 4-bar WAV, 8.1 s, -1.3 dBTP, -14.2 LUFS, and the hi-hat is 12 dB above the chords".
 */
export async function renderAudio(pattern: SequencerPattern, options: RenderOptions): Promise<RenderResult> {
  if (process.env.GROOVE_MCP_NO_BROWSER === "1") {
    throw new Error("audio rendering is disabled (GROOVE_MCP_NO_BROWSER=1); the library, pattern, MIDI and share tools do not need a browser");
  }
  const page = await ensurePage();
  const result = await page.evaluate(
    async ({ pattern: patternArg, format, bars, bitrateKbps, trackPeaks }) => {
      /**
       * These specifiers are resolved by the *browser* (the app's dev server), not by Node, so they are built
       * from variables: a literal would send `tsc` looking for `/src/...` on the filesystem and fail.
       */
      const specifier = (path: string) => path;
      const [wav, mp3, loudness, metrics] = await Promise.all([
        import(/* @vite-ignore */ specifier("/src/audio/WavExporter.ts")),
        import(/* @vite-ignore */ specifier("/src/audio/Mp3Exporter.ts")),
        import(/* @vite-ignore */ specifier("/src/test/helpers/loudness.ts")),
        import(/* @vite-ignore */ specifier("/src/test/helpers/audioMetrics.ts")),
      ]);
      const barsArg = Math.max(1, Math.min(64, bars ?? 1));
      let limiterKind = "fallback";
      const buffer = await wav.renderPatternOffline(patternArg as never, {
        bars: barsArg,
        onLimiterKind: (kind: string) => {
          limiterKind = kind;
        },
      });
      const channels: Float32Array[] = [];
      for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));

      /**
       * Per-track peaks: one isolated render per track, only when asked.
       *
       * `btoa` needs a binary string, and building one character at a time for eight renders is slower than the
       * renders themselves, so the conversion is chunked.
       */
      const trackPeaksDb: Record<string, number> = {};
      if (trackPeaks) {
        for (const track of (patternArg as unknown as { tracks: Array<{ track_id: string }> }).tracks) {
          const solo = {
            ...(patternArg as unknown as Record<string, unknown>),
            tracks: (patternArg as unknown as { tracks: Array<Record<string, unknown>> }).tracks.map((t) =>
              t.track_id === track.track_id
                ? t
                : { ...t, steps: (t.steps as number[]).map(() => 0), velocity: undefined }
            ),
          };
          try {
            const soloBuffer = await wav.renderPatternOffline(solo as never, { bars: barsArg });
            const soloChannels: Float32Array[] = [];
            for (let c = 0; c < soloBuffer.numberOfChannels; c += 1) soloChannels.push(soloBuffer.getChannelData(c));
            trackPeaksDb[track.track_id] = metrics.samplePeakDb(soloChannels);
          } catch {
            trackPeaksDb[track.track_id] = Number.NEGATIVE_INFINITY;
          }
        }
      }

      /** Bytes as base64: a `number[]` of 788,000 entries is megabytes of JSON to serialise and parse. */
      const toBase64 = (bytes: Uint8Array): string => {
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
        }
        return btoa(binary);
      };
      const wavBytes = new Uint8Array(wav.encodeAudioBufferToWav(buffer));
      if (format === "mp3") {
        const encoded = await mp3.encodeAudioBufferToMp3(buffer, { bitrateKbps: bitrateKbps ?? 192 });
        const mp3Bytes = new Uint8Array(await encoded.blob.arrayBuffer());
        return {
          base64: toBase64(mp3Bytes),
          durationSec: buffer.duration,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          limiterKind,
          truePeakDb: loudness.truePeakDbChannels(channels),
          integratedLufs: loudness.measureLoudness(channels, buffer.sampleRate).integratedLufs,
          trackPeaksDb,
        };
      }
      return {
        base64: toBase64(wavBytes),
        durationSec: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        limiterKind,
        truePeakDb: loudness.truePeakDbChannels(channels),
        integratedLufs: loudness.measureLoudness(channels, buffer.sampleRate).integratedLufs,
        trackPeaksDb,
      };
    },
    { pattern, format: options.format, bars: options.bars, bitrateKbps: options.bitrateKbps, trackPeaks: options.trackPeaks === true }
  );

  const dir = outputDirectory(options);
  const bpm = pattern.bpm ?? 120;
  /**
   * `genre_master_<bpm>bpm` by default, and `genre_<slug>_<bpm>bpm` when the caller's song has a name.
   *
   * The slug comes from the *caller's title*, never from model prose: it is whitelisted to `[a-z0-9-]` (so nothing can escape the
   * output directory, no separators, no dots, no unicode surprises), lowercased, collapsed and cut to 40 characters, and an
   * empty result falls back to the previous `master` form. The genre and the tempo are always present, so the file still says
   * what it is even if the title is nonsense.
   */
  const slug = (options.nameSlug ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const middle = slug.length > 0 ? slug : "master";
  const filename = `${options.genreId ?? pattern.genre_id ?? "groove"}_${middle}_${bpm}bpm.${options.format}`;
  const file = path.join(dir, filename.replace(/[^a-z0-9_.-]/gi, "_"));
  const written = Buffer.from(result.base64, "base64");
  writeFileSync(file, written);

  return {
    path: file,
    filename: path.basename(file),
    bytes: written.length,
    durationSec: result.durationSec,
    sampleRate: result.sampleRate,
    channels: result.channels,
    limiterKind: result.limiterKind,
    truePeakDb: result.truePeakDb,
    integratedLufs: result.integratedLufs,
    trackPeaksDb: result.trackPeaksDb,
  };
}

/**
 * Analyse a WAV this server produced, with no browser.
 *
 * Only the metrics are returned — never the PCM — because the caller is a model: a 10-second stereo float array
 * would be four million numbers of context for a result that is eight.
 */
export function analyseWavFile(filePath: string): Record<string, unknown> {
  const { channels, sampleRate } = decodeWav(readFileSync(filePath));
  return {
    filePath,
    sampleRate,
    channels: channels.length,
    durationSec: channels[0].length / sampleRate,
    ...measure(channels, sampleRate),
  };
}

/** 16-bit PCM RIFF/WAVE — the only format the app's own exporter writes. */
export function decodeWav(buffer: Buffer): { channels: Float32Array[]; sampleRate: number } {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let offset = 12;
  let format = 0;
  let channelCount = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataStart = 0;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      format = buffer.readUInt16LE(body);
      channelCount = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bits = buffer.readUInt16LE(body + 14);
    } else if (id === "data") {
      dataStart = body;
      dataLength = size;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (format !== 1 || bits !== 16) throw new Error("only 16-bit PCM WAV is supported (what the exporter writes)");
  const frames = Math.floor(dataLength / (channelCount * 2));
  const channels: Float32Array[] = Array.from({ length: channelCount }, () => new Float32Array(frames));
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      channels[channel][frame] = buffer.readInt16LE(dataStart + (frame * channelCount + channel) * 2) / 32768;
    }
  }
  return { channels, sampleRate };
}

/** The shared measurement set: the same helpers the export audit and the loudness gate use. */
export function measure(channels: Float32Array[], sampleRate: number): Record<string, unknown> {
  const clicks = clickAnalysis(channels, sampleRate);
  const fingerprint = fingerprintChannels(channels, sampleRate);
  return {
    truePeakDb: truePeakDbChannels(channels),
    samplePeakDb: samplePeakDb(channels),
    integratedLufs: measureLoudness(channels, sampleRate).integratedLufs,
    pinnedSamples: clippedSampleCount(channels),
    discontinuities: clicks.count,
    worstDiscontinuityDb: clicks.worstDb,
    correlation: channels.length > 1 ? channelCorrelation(channels[0], channels[1]) : 1,
    sideToMidDb: sideToMidDb(channels),
    tailRmsDb: tailRmsDb(channels, sampleRate, 50),
    finalPeakDb: finalPeakDb(channels, sampleRate, 5),
    centroidHz: fingerprint.centroidHz,
    bandDb: fingerprint.bandDb,
  };
}
