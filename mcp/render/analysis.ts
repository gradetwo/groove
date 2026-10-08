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
const analysisCache = new Map<string, { key: string; value: Record<string, unknown> }>();

export function analyseWavFile(filePath: string, only?: { discontinuities?: boolean }): Record<string, unknown> {
  const stat = statSync(filePath);
  /**
   * ⭐ **The cache key carries the request** (finding F07 / section 6's light analysis): the same file analysed for
   * loudness only and analysed fully are two different answers, and a key that ignored `only` would hand one caller the
   * other's reply.
   */
  const key = `${stat.size}:${stat.mtimeMs}:${only?.discontinuities === false ? "light" : "full"}`;
  const cached = analysisCache.get(filePath);
  if (cached !== undefined && cached.key === key) return cached.value;
  const value = buildAnalysis(filePath, only);
  analysisCache.set(filePath, { key, value });
  return value;
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
