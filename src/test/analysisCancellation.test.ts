import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyseWavFileIsolated } from "../../mcp/render/analysis";

/**
 * ⭐ **A cancelled read says so** (third evaluation, L01: cancelling only abandoned the result, never the work).
 *
 * The analysis can now run as a child process, which is the first boundary this path has ever had to interrupt — a
 * synchronous call cannot be cancelled at all. Two contracts are pinned here: an already-aborted signal never starts the
 * work, and no cancellation is ever reported as a normal reading.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const writeWav = (path: string) => {
  const rate = 8000;
  const frames = rate;
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 8000), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
};

describe("cancelling an analysis", () => {
  it("⭐ refuses to start on an aborted signal instead of analysing anyway", async () => {
    const dir = mkdtempSync(join(tmpdir(), "groove-cancel-"));
    dirs.push(dir);
    const file = join(dir, "probe.wav");
    writeWav(file);

    const controller = new AbortController();
    controller.abort();
    await expect(analyseWavFileIsolated(file, undefined, controller.signal)).rejects.toThrow(/cancel/i);

    // And the ordinary path still answers, with the route it took named.
    const read = await analyseWavFileIsolated(file);
    expect(read.worker, "the reply says whether a child answered or this process did").toBe("inline");
    expect(read.durationSec).toBe(1);
  });
});
