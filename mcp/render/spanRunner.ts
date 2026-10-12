/**
 * ⭐ **The child side of the process-parallel render.**
 *
 * The MCP renderer is a **Node Web Audio host inside the server process** (`mcp/render/headless.ts`), so the way to
 * render a five-minute piece faster is not more `OfflineAudioContext`s in one agent — measured at 1.03–1.13×, because
 * the real graph's worklet thread appears to be one per process — but **more processes**: four of them measured
 * **3.90×** the throughput at 44.1 kHz stereo (`scratch/node-host-scaling.mjs`), which projects 753 s of work to
 * ≈193 s.
 *
 * This module is what one of those processes runs. It is reached through the bundle's hidden mode
 * (`GROOVE_SPAN_JOB=<job.json>` in `mcp/server.ts`) because the bundle is the only thing that can import the app's
 * renderer outside the dev server; the parent writes the job, the child renders **one span** through the same
 * `renderPatternHeadless`, decodes the WAV it hands back and writes raw float samples plus a sidecar of what the
 * render reported, then exits.
 *
 * ⚠️ The samples cross as **16-bit**, because they come back as the WAV the host already encodes. That is the same
 * quantisation the single-pass file gets, so a null test comparing two files compares like with like; it is *not* a
 * path that should carry an intermediate a later stage will re-quantise.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { SequencerPattern } from "../../src/types/genre";
import type { AudioLaneCatalogueRead, RenderOptions } from "./worker";
import type { OfflineAudioLaneReport } from "../../src/audio/offlineAudioLanes";
import { renderPatternHeadless, type HeadlessRenderContext } from "./headless";

/** What the parent writes for one span. */
export interface SpanJob {
  pattern: SequencerPattern;
  /** ⚠️ `chunks` is deliberately **not** carried: the child renders one span, and a forwarded count would recurse. */
  options: RenderOptions & { bars?: number; sampleRate?: number; channels?: 1 | 2; windowBars?: number };
  catalogueRead: AudioLaneCatalogueRead;
  context: HeadlessRenderContext;
  fromBar: number;
  bars: number;
  preRollSec: number;
  /** Where the raw float samples and the sidecar go — written by the child, read by the parent. */
  outStem: string;
}

/** What the child writes beside the samples, so the parent's reply is not poorer than a single-pass render's. */
export interface SpanSidecar {
  channels: number;
  sampleRate: number;
  frames: number;
  /**
   * ⭐ **The renderer's own answer about the window, not the parent's assumption.** The pre-roll a span actually got is
   * not always the one requested — asking for bars before the first bar buys nothing — and assuming it cost a whole
   * debugging round: the first merge trimmed 2 s of music off span 0 and the null test measured −1.3 dBFS across both
   * spans.
   */
  preRollFrames: number;
  chunkEndFrame: number;
  /**
   * ⭐ **What the child asked for and what it got**, recorded because the same window reported `preRollFrames: 0` through
   * one call path and `16000` through another: a discrepancy like that is a field changing in transit, and the only way
   * to see it is to write both sides down.
   */
  windowDebug?: { fromBar: number; bars: number; preRollSec: number; windowBars: number | null; gotPreRollFrames: number; gotChunkEndFrame: number };
  durationSec: number;
  limiterKind: string;
  gs1PatchProblems: string[];
  /** The lane report this span filled, carried so the parent can union them rather than report nothing. */
  audioLanes: OfflineAudioLaneReport;
  problems: string[];
  /** ⭐ The child's own whole-vs-window comparison, present only under `GROOVE_SPAN_SELF_AB=1`. */
  selfAB?: { frames: number; worstDb: string; wholeFrames: number; barFrames: number; offset: number; hostInstalls: number };
}

/** A minimal 16-bit PCM WAV reader: find `fmt ` and `data` rather than assuming the 44-byte canonical header. */
export function decodePcm16Wav(bytes: Uint8Array): { channels: Float32Array[]; sampleRate: number; frames: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("the span render did not return a RIFF/WAVE file");
  let at = 12;
  let channelCount = 0;
  let sampleRate = 0;
  let bits = 0;
  let dataAt = -1;
  let dataLength = 0;
  while (at + 8 <= bytes.length) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      channelCount = view.getUint16(at + 10, true);
      sampleRate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
    } else if (id === "data") {
      dataAt = at + 8;
      dataLength = Math.min(size, bytes.length - dataAt);
    }
    at += 8 + size + (size % 2);
  }
  if (channelCount === 0 || dataAt < 0) throw new Error("the span render returned a WAV with no fmt/data chunk");
  if (bits !== 16) throw new Error(`the span render returned ${bits}-bit samples; the merge expects 16`);
  const frames = Math.floor(dataLength / (channelCount * 2));
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frames));
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = view.getInt16(dataAt + (frame * channelCount + channel) * 2, true);
      channels[channel]![frame] = sample / 32768;
    }
  }
  return { channels, sampleRate, frames };
}

/** Render one span and write it out. Called by the bundle's hidden mode; never by the protocol path. */
export async function runSpanJob(jobPath: string): Promise<void> {
  const job = JSON.parse(await fs.readFile(jobPath, "utf8")) as SpanJob;
  const rendered = await renderPatternHeadless(
    job.pattern,
    {
      ...job.options,
      headless: true,
      bars: job.bars,
      fromBar: job.fromBar,
      preRollSec: job.preRollSec,
      ...(job.options.windowBars === undefined ? {} : { windowBars: job.options.windowBars }),
      /**
       * ⚠️ **A child renders exactly one span, and must be told so explicitly now that the default is automatic.**
       *
       * While `chunks` had no default, "absent" meant one pass and a child could not recurse. With an automatic default
       * the child computed a span count of its own from the piece's length and spawned spans of its own — a fork bomb,
       * seen as two SIGKILLed smoke runs. The count is the parent's decision; the child's is 1.
       */
      chunks: 1,
      ...(job.options.sampleRate === undefined ? {} : { sampleRate: job.options.sampleRate }),
    },
    job.catalogueRead,
    job.context
  );
  const decoded = decodePcm16Wav(new Uint8Array(Buffer.from(rendered.base64, "base64")));
  const timeline = (rendered as { spanTimeline?: { preRollFrames: number; chunkEndFrame: number } }).spanTimeline;
  /**
   * ⭐ **The child's own A/B, inside the process whose render is in question.** Everything outside this process has been
   * ruled out — the option set, the JSON round trip, the merge, both hosts' window arithmetic — so the question is now
   * whether *this* process renders the window differently from the whole. `GROOVE_SPAN_SELF_AB=1` renders the whole
   * pattern here too and reports the difference beside the span, which tells the two remaining causes apart: the
   * process's environment, or the job it was handed.
   */
  const selfAB = await (async () => {
    if (process.env.GROOVE_SPAN_SELF_AB !== "1") return null;
    const whole = await renderPatternHeadless(job.pattern, { ...job.options, headless: true, bars: 1 }, job.catalogueRead, job.context);
    const wholeDecoded = decodePcm16Wav(new Uint8Array(Buffer.from(whole.base64, "base64")));
    const barFrames = Math.round((60 / (job.pattern.bpm ?? 120)) * 4 * decoded.sampleRate);
    const offset = job.fromBar * barFrames;
    const from = timeline?.preRollFrames ?? decoded.frames;
    const length = Math.min((timeline?.chunkEndFrame ?? decoded.frames) - from, wholeDecoded.frames - offset);
    let worst = 0;
    for (let i = 0; i < length; i += 1) worst = Math.max(worst, Math.abs(decoded.channels[0]![from + i]! - wholeDecoded.channels[0]![offset + i]!));
    return { frames: length, worstDb: worst <= 1e-9 ? "-inf" : (20 * Math.log10(worst)).toFixed(1), wholeFrames: wholeDecoded.frames, barFrames, offset, hostInstalls: (globalThis as unknown as { __grooveHostInstalls?: number }).__grooveHostInstalls ?? 0 };
  })();

  const sidecar: SpanSidecar = {
    channels: decoded.channels.length,
    sampleRate: decoded.sampleRate,
    frames: decoded.frames,
    preRollFrames: timeline?.preRollFrames ?? 0,
    chunkEndFrame: timeline?.chunkEndFrame ?? decoded.frames,
    durationSec: rendered.durationSec,
    limiterKind: rendered.limiterKind,
    gs1PatchProblems: rendered.gs1PatchProblems ?? [],
    audioLanes: rendered.audioLanes ?? { lanes: [], events: 0, problems: [] },
    problems: rendered.problems ?? [],
    windowDebug: {
      fromBar: job.fromBar,
      bars: job.bars,
      preRollSec: job.preRollSec,
      windowBars: job.options.windowBars ?? null,
      gotPreRollFrames: timeline?.preRollFrames ?? -1,
      gotChunkEndFrame: timeline?.chunkEndFrame ?? -1,
    },
    ...(selfAB ? { selfAB } : {}),
  };
  await fs.mkdir(path.dirname(job.outStem), { recursive: true });
  await fs.writeFile(`${job.outStem}.f32`, Buffer.concat(decoded.channels.map((channel) => Buffer.from(channel.buffer, channel.byteOffset, channel.byteLength))));
  await fs.writeFile(`${job.outStem}.json`, JSON.stringify(sidecar));
  process.stdout.write(`${JSON.stringify({ ok: true, outStem: job.outStem, ...sidecar })}\n`);
}

/**
 * ⭐ **The source-side A/B, replayed inside the bundle.**
 *
 * `scratch/node-entry-ab.ts` proved that the renderer, the entry point and the Node host are all bit-exact when the code
 * runs **from source**; the same sequence inside the **bundle** is what differs (the child's self-A/B measures −1.3 dB).
 * This runs it here, so the next comparison is bundle-internal-direct against bundle-child: if this is bit-exact, the
 * difference is the job/child path; if it is not, the difference is how esbuild binds `node-web-audio-api`.
 */
export async function runSelfAb(): Promise<void> {
  const { createArrangementFromTemplate } = await import("../../src/data/arrangementEdits");
  const { compileArrangementToPattern } = await import("../../src/data/arrangementCompile");
  const arrangement = createArrangementFromTemplate("drums-bass-chords", "bundle-self-ab");
  const pattern = compileArrangementToPattern(arrangement, arrangement.notesByTrack ?? {});
  const catalogueRead = { text: "" } as Parameters<typeof renderPatternHeadless>[2];
  const context = { publicRoot: "public", sampleRoot: "public/samples" } as Parameters<typeof renderPatternHeadless>[3];
  const base = { headless: true, sampleRate: 8000, channels: 1 } as unknown as Parameters<typeof renderPatternHeadless>[1];
  const whole = await renderPatternHeadless(pattern, { ...base, bars: 1 }, catalogueRead, context);
  const windowed = await renderPatternHeadless(pattern, { ...base, bars: 2, fromBar: 2, preRollSec: 2 }, catalogueRead, context);
  const wholeDecoded = decodePcm16Wav(new Uint8Array(Buffer.from(whole.base64, "base64")));
  const windowDecoded = decodePcm16Wav(new Uint8Array(Buffer.from(windowed.base64, "base64")));
  const timeline = (windowed as unknown as { spanTimeline?: { preRollFrames: number; chunkEndFrame: number } }).spanTimeline;
  const barFrames = Math.round((60 / (pattern.bpm ?? 120)) * 4 * 8000);
  const from = timeline?.preRollFrames ?? 0;
  const offset = 2 * barFrames;
  const length = Math.min((timeline?.chunkEndFrame ?? windowDecoded.frames) - from, wholeDecoded.frames - offset);
  let worst = 0;
  for (let i = 0; i < length; i += 1) worst = Math.max(worst, Math.abs(windowDecoded.channels[0]![from + i]! - wholeDecoded.channels[0]![offset + i]!));
  process.stdout.write(
    `${JSON.stringify({
      mode: "bundle-self-ab",
      hostInstalls: (globalThis as unknown as { __grooveHostInstalls?: number }).__grooveHostInstalls ?? 0,
      barFrames,
      framesCompared: length,
      worstDb: worst <= 1e-9 ? "-inf" : (20 * Math.log10(worst)).toFixed(1),
      timeline: timeline ?? null,
    })}\n`
  );
}
