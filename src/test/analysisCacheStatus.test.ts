import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyseWavFile } from "../../mcp/render/analysis";

/**
 * ⭐ **Say whether the numbers were measured or remembered** (third evaluation, section 6: cache status).
 *
 * The cache is the difference between 161 s and 0.005 s on the same file — the evaluation's own F07 pair — and the reply
 * said nothing about which one a caller had just received, so an agent could not tell a free re-ask from minutes of work.
 * The key is the file's size and mtime **plus the request**: a loudness-only answer and a full one are two different
 * answers and must not be served for each other.
 */
const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

/** ⭐ A real 16-bit PCM WAV, because the analyser decodes the app's own format rather than a fixture's fiction. */
const writeWav = (path: string, seconds = 1, sampleRate = 8000) => {
  const frames = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 8000), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
};

describe("the analysis reply's cache status", () => {
  it("⭐ is a miss on the first read, a hit on the second, and never crosses requests", () => {
    const dir = mkdtempSync(join(tmpdir(), "groove-cache-"));
    tempDirs.push(dir);
    const file = join(dir, "probe.wav");
    writeWav(file);

    expect(analyseWavFile(file).cache, "the first read measured it").toBe("miss");
    expect(analyseWavFile(file).cache, "the second read was free").toBe("hit");
    // ⭐ The key carries the request: a light answer must not be handed to a caller who asked for the full one.
    expect(analyseWavFile(file, { discontinuities: false }).cache, "a different question, a different answer").toBe("miss");
    expect(analyseWavFile(file, { discontinuities: false }).cache).toBe("hit");
    expect(analyseWavFile(file).cache, "and the full answer is still the full answer").toBe("hit");
  });
});
