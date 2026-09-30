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
import { songSlug } from "../../src/utils/songSlug";
// The naming rule lives in `src/data` because it is pure: a criterion can hold it without starting a browser.
import { stemFilename } from "../../src/data/stemNaming";
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
  /** Render rate: an analysis render can ask for 8000 and get fewer samples, not a relabelled file. */
  sampleRate?: number;
  /** 1 for a mono analysis render; the default stays the stereo the exporter has always produced. */
  channels?: 1 | 2;
  /**
   * Explicit master-bus trim, in dB, overriding whatever the genre's own trim would be.
   *
   * The offline graph has carried `loudnessTrimDb` all along (`masterGraph.ts:81`, `WavExporter.ts:74`), and `AudioEngine` applies the same
   * number live (`:384`) — but nothing on the MCP side could set it, so a caller that measured a track at −17 LUFS had no way to ask for
   * −14 except by hand-computing a gain and editing the pattern. This is the mechanism a loudness write tool needs; the tool is next.
   */
  loudnessTrimDb?: number;
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
    async ({ pattern: patternArg, format, bars, bitrateKbps, trackPeaks, sampleRate, channels: channelCount, loudnessTrimDb }) => {
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
        /**
         * The analysis lever, and it is honest on both sides: `WavExporter` builds its context with this rate
         * (`src/audio/WavExporter.ts:320` — `new OfflineContextClass(2, lengthInSamples, sampleRate)`), so a lower rate really does
         * render fewer samples rather than relabelling a 44.1 kHz file. An energy curve or a spectrum does not need 44.1 kHz, and at
         * 8 kHz a three-minute song is about a fifth of the work. The channel count is still the exporter's two: mono needs that
         * parameter thread through as well, and it is not done yet.
         */
        ...(sampleRate ? { sampleRate } : {}),
        ...(channelCount ? { channels: channelCount } : {}),
        ...(Number.isFinite(loudnessTrimDb) ? { loudnessTrimDb } : {}),
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
    {
      pattern,
      format: options.format,
      bars: options.bars,
      bitrateKbps: options.bitrateKbps,
      trackPeaks: options.trackPeaks === true,
      sampleRate: options.sampleRate,
      channels: options.channels,
      loudnessTrimDb: options.loudnessTrimDb,
    }
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
  // `songSlug` keeps an ASCII name byte-identical, gives a non-ASCII title a stable token of its own instead of collapsing it to `master` (which
  // made two differently-named songs share one path and overwrite), and leaves an unnamed song on its historical default.
  const middle = songSlug(options.nameSlug);
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
/**
 * The energy curve an agent can reason about, at one value per second.
 *
 * This is the cheap half of the evaluation's proposal: it needs no new render path, because the WAV it reads is already decoded — and
 * a curve is the measurement a closed loop actually uses ("the build should rise into the drop"), where a single LUFS figure cannot
 * say whether anything moved. One second is deliberately bpm-free: the caller may not know the tempo, and a second is coarse enough to
 * be stable and fine enough to show a build over eight bars.
 */
export function energyCurveDb(channels: Float32Array[], sampleRate: number): { curve: number[]; spreadDb: number } {
  const perWindow = Math.max(1, Math.floor(sampleRate));
  const total = channels[0]?.length ?? 0;
  const windows: number[] = [];
  for (let start = 0; start + perWindow <= total; start += perWindow) {
    let sum = 0;
    let count = 0;
    for (const channel of channels) {
      for (let i = start; i < start + perWindow; i += 1) {
        const value = channel[i];
        sum += value * value;
        count += 1;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    windows.push(Number((20 * Math.log10(Math.max(rms, 1e-6))).toFixed(2)));
  }
  // The spread is the plainest statement of "something happened across this song": the loudest window minus the quietest.
  const spread = windows.length ? Math.max(...windows) - Math.min(...windows) : 0;
  return { curve: windows, spreadDb: Number(spread.toFixed(2)) };
}

export function analyseWavFile(filePath: string): Record<string, unknown> {
  const { channels, sampleRate } = decodeWav(readFileSync(filePath));
  return {
    filePath,
    sampleRate,
    channels: channels.length,
    durationSec: channels[0].length / sampleRate,
    ...measure(channels, sampleRate),
    /**
     * The curve lives with the metrics rather than behind its own tool: an agent that has rendered a song already has the WAV, and
     * one more call to read a curve it could have had for free would be the token economy this project keeps refusing to waste.
     */
    ...(() => {
      const { curve, spreadDb } = energyCurveDb(channels, sampleRate);
      return { energyCurveDb: curve, energySpreadDb: spreadDb };
    })(),
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
    /**
     * Where the worst one is, in seconds — the position a count cannot give.
     *
     * A composer asked for exactly this: `discontinuities` fell from 2406 to 2013 on a song with real clip switches, and a single
     * number cannot say whether the remainder are splice clicks at section boundaries or the music's own transients. The counter
     * has always computed the index (`worstIndex`); this is the same number expressed where the caller can look at it. Aggregating
     * by section boundary is the next step and needs the boundary list, which `flattenSong` already returns.
     */
    worstDiscontinuitySec: clicks.worstIndex === null ? null : Number((clicks.worstIndex / sampleRate).toFixed(4)),
    correlation: channels.length > 1 ? channelCorrelation(channels[0], channels[1]) : 1,
    sideToMidDb: sideToMidDb(channels),
    tailRmsDb: tailRmsDb(channels, sampleRate, 50),
    finalPeakDb: finalPeakDb(channels, sampleRate, 5),
    centroidHz: fingerprint.centroidHz,
    bandDb: fingerprint.bandDb,
  };
}

/**
 * **Per-track stems, written one at a time.**
 *
 * The app has had this in the browser for a while (`exportStemsWav`, behind the sequencer's export menu) and the MCP surface had no way to ask for it: an agent could render the whole mix and not the parts, which is the difference between hearing a balance problem and fixing one.
 *
 * **One stem per evaluation, and the bytes are written before the next render starts.** The browser-side packer learned that lesson already — its own comment records that a `Promise.all` over every stem materialises all of them at once, and eight stereo stems of a three-minute song is not something to hold in a page — so the same shape is used here: render one, hand its bytes to Node, write it, drop it.
 *
 * **The name is decided here rather than in the page**, which makes it one testable rule instead of two: `songSlug` already sanitises a name for a filename, and the track index keeps two identically-named tracks from overwriting each other.
 */
export interface StemResult {
  path: string;
  filename: string;
  trackName: string;
  trackIdx: number;
  bytes: number;
  /** Measured from the rendered buffer, not estimated from the pattern. */
  durationSec: number;
  sampleRate: number;
  channels: number;
  truePeakDb: number;
  /** True when the stem rendered to silence, which is a fact worth reporting rather than a file nobody can hear. */
  silent: boolean;
}

export async function renderStems(
  pattern: SequencerPattern,
  options: RenderOptions
): Promise<{ dir: string; stems: StemResult[]; sampleRate: number; bpm: number }> {
  if (process.env.GROOVE_MCP_NO_BROWSER === "1") {
    throw new Error("audio rendering is disabled (GROOVE_MCP_NO_BROWSER=1); stems are rendered through the same offline engine as everything else");
  }
  const page = await ensurePage();
  const dir = outputDirectory(options);
  const bpm = pattern.bpm || 120;
  const stems: StemResult[] = [];
  let sampleRate = options.sampleRate ?? 44100;

  for (let index = 0; index < pattern.tracks.length; index += 1) {
    const track = pattern.tracks[index]!;
    const rendered = await page.evaluate(
      async ({ pattern: patternArg, stemTrackIdx, bars, sampleRate: rate, channels: channelCount }) => {
        const specifier = (path: string) => path;
        const [wav, loudness] = await Promise.all([
          import(/* @vite-ignore */ specifier("/src/audio/WavExporter.ts")),
          import(/* @vite-ignore */ specifier("/src/test/helpers/loudness.ts")),
        ]);
        const buffer = await wav.renderPatternOffline(patternArg as never, {
          bars: Math.max(1, Math.min(64, bars ?? 1)),
          stemTrackIdx,
          ...(rate ? { sampleRate: rate } : {}),
          ...(channelCount ? { channels: channelCount } : {}),
        });
        const channelsOut: Float32Array[] = [];
        for (let c = 0; c < buffer.numberOfChannels; c += 1) channelsOut.push(buffer.getChannelData(c));
        const bytes = wav.encodeAudioBufferToWav(buffer);
        let binary = "";
        const view = new Uint8Array(bytes);
        const chunk = 0x8000;
        for (let i = 0; i < view.length; i += chunk) {
          binary += String.fromCharCode(...view.subarray(i, i + chunk));
        }
        return {
          base64: btoa(binary),
          durationSec: buffer.duration,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          truePeakDb: loudness.truePeakDbChannels(channelsOut),
        };
      },
      {
        pattern,
        stemTrackIdx: index,
        bars: options.bars,
        sampleRate: options.sampleRate,
        channels: options.channels,
      }
    );

    const bytes = Buffer.from(rendered.base64, "base64");
    const filename = stemFilename(track.name || track.track_id || `track_${index + 1}`, index, bpm);
    const target = path.join(dir, filename);
    writeFileSync(target, bytes);
    sampleRate = rendered.sampleRate;
    stems.push({
      path: target,
      filename,
      trackName: track.name || track.track_id || `track_${index + 1}`,
      trackIdx: index,
      bytes: bytes.length,
      durationSec: Number(rendered.durationSec.toFixed(3)),
      sampleRate: rendered.sampleRate,
      channels: rendered.channels,
      truePeakDb: Number(rendered.truePeakDb.toFixed(2)),
      // −120 dB is the floor below which a float render is silence for any practical purpose.
      silent: rendered.truePeakDb <= -120,
    });
  }

  return { dir, stems, sampleRate, bpm };
}
