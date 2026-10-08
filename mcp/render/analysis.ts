/**
 * ⭐ **One decode per unchanged file, and never a stale one.** The analysis itself lives here rather than in the render
 * worker so a file-size budget that pins the worker's size stays honest: this module is small, and the worker only
 * re-exports the function whose behaviour callers depend on.
 */
import { readFileSync, statSync } from "node:fs";
import { decodeWav, measure, energyCurveDb } from "./worker";

/**
 * Two tools call this (spectral_balance and analyze_audio)
 * and a creation run paid twice for the same decode, measure and curve — 2.73 s and 2.58 s with byte-identical replies.
 * The key is the file's size and mtime, so an unchanged file hands back what it already has while a changed one is
 * analysed again; the path alone would have served a stale curve, which is the failure this key exists to prevent.
 */
/**
 * ⭐ **One entry per file *and per request*** (third evaluation, section 6: cache status).
 *
 * The map used to be keyed by the file alone, so a loudness-only read and a full read shared a slot and each evicted the
 * other: alternating between them re-ran the full analysis — the 161 s measurement, every time — while both replies
 * reported a plausible "miss". Two questions about one file are two answers; the key says so now, and only a changed file
 * (size or mtime) invalidates either of them.
 */
const analysisCache = new Map<string, { key: string; value: Record<string, unknown> }>();

export function analyseWavFile(filePath: string, only?: { discontinuities?: boolean }): Record<string, unknown> {
  const stat = statSync(filePath);
  /**
   * ⭐ **Whether this answer was measured now or remembered** (third evaluation, section 6: cache status).
   *
   * The cache is the difference between 161 s and 0.005 s on the same file — the evaluation's own F07 numbers — and the
   * reply said nothing about which of the two a caller had just received. An agent budgeting its time (and its owner's
   * patience) can act on that difference: a cached reading is free to re-ask, a fresh one cost minutes.
   */
  const served = (value: Record<string, unknown>, cached: boolean) => ({ ...value, cache: cached ? "hit" : "miss" });
  /**
   * ⭐ **The cache key carries the request** (finding F07 / section 6's light analysis): the same file analysed for
   * loudness only and analysed fully are two different answers, and a key that ignored `only` would hand one caller the
   * other's reply.
   */
  const key = `${stat.size}:${stat.mtimeMs}:${only?.discontinuities === false ? "light" : "full"}`;
  const slot = `${filePath}:${only?.discontinuities === false ? "light" : "full"}`;
  const cached = analysisCache.get(slot);
  if (cached !== undefined && cached.key === key) return served(cached.value, true);
  const value = buildAnalysis(filePath, only);
  analysisCache.set(slot, { key, value });
  return served(value, false);
}

function buildAnalysis(filePath: string, only?: { discontinuities?: boolean }): Record<string, unknown> {
  const { channels, sampleRate } = decodeWav(readFileSync(filePath));
  return {
    filePath,
    sampleRate,
    channels: channels.length,
    durationSec: channels[0].length / sampleRate,
    ...measure(channels, sampleRate, only),
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

/**
 * ⭐ **The host half of F07's second slice: run the analysis as a child process.**
 *
 * Measured before this: a two-minute analysis held the event loop for 10.5 s with a 20 ms timer getting **zero** ticks.
 * The child is the **same bundle** this process was started from — the pattern `spanHosts.ts` already uses, and the reason
 * is the same: the bundle is what can import the app's own code outside the dev server. A child can also be **killed**,
 * which is the cancellation the evaluation asked for (L01) and which a synchronous call cannot offer.
 *
 * Two deliberate choices:
 *   · **No child under a test runner or the dev server.** `process.argv[1]` is not a bundle then, so this returns
 *     `undefined` and the caller analyses in-process — the readings are identical either way.
 *   · **A failed child falls back rather than failing the read**: the reply says `worker: "inline"` so a caller can see
 *     which path answered, instead of a silent degradation that only looks like a worker.
 */
function analysisChildEntry(): string | undefined {
  const entry = process.argv[1];
  return entry && entry.endsWith(".mjs") ? entry : undefined;
}

export async function analyseWavFileInChild(
  filePath: string,
  only?: { discontinuities?: boolean }
): Promise<Record<string, unknown> | undefined> {
  const entry = analysisChildEntry();
  if (!entry) return undefined;
  const { spawn } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const jobPath = join(mkdtempSync(join(tmpdir(), "groove-analysis-")), "job.json");
  writeFileSync(jobPath, JSON.stringify({ path: filePath, ...(only === undefined ? {} : { only }) }));
  return await new Promise<Record<string, unknown> | undefined>((resolve) => {
    const child = spawn(process.execPath, [entry], {
      env: { ...process.env, GROOVE_ANALYSIS_JOB: jobPath },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.stderr.resume();
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => {
      if (code !== 0) return resolve(undefined);
      try {
        resolve(JSON.parse(out) as Record<string, unknown>);
      } catch {
        resolve(undefined);
      }
    });
  });
}

/**
 * ⭐ **What the tools call**: the child when there is one, the in-process analysis otherwise, with the path it took
 * reported in the reply.
 */
export async function analyseWavFileIsolated(
  filePath: string,
  only?: { discontinuities?: boolean }
): Promise<Record<string, unknown>> {
  const isolated = await analyseWavFileInChild(filePath, only);
  if (isolated !== undefined) return { ...isolated, worker: "child" };
  return { ...analyseWavFile(filePath, only), worker: "inline" };
}
