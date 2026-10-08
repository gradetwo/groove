/**
 * ⭐ **One decode per unchanged file** (mcp/render/worker.ts, `analyseWavFile`).
 *
 * Two tools call this function and a creation run paid for the same decode, measure and energy curve twice — measured at
 * 2.73 s and 2.58 s with byte-identical replies — so the second call should not redo the work. The cache is keyed by path,
 * mtime and size, which is what makes both halves below true at once: an unchanged file hands back the value it already
 * has, and a file that changed is analysed again rather than serving a stale curve.
 *
 * Both assertions are meant to be able to fail. The identity assertion is red before the cache exists, and the staleness
 * assertion turns red if the key is weakened to the path alone, which is how the key was chosen.
 */
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyseWavFile } from "../../mcp/render/worker";

/** A minimal 16-bit mono RIFF/WAVE of `samples` frames, silent but for a ramp. */
function wavBytes(samples: number, sampleRate = 8000): Buffer {
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) data.writeInt16LE((i % 64) * 64, i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe("analyseWavFile", () => {
  it("⭐ hands back what it already analysed, and re-analyses a file that changed", () => {
    const dir = mkdtempSync(join(tmpdir(), "groove-analysis-"));
    const file = join(dir, "one.wav");
    writeFileSync(file, wavBytes(1600));
    const when = new Date("2026-01-01T00:00:00Z");
    utimesSync(file, when, when);

    const first = analyseWavFile(file);
    const second = analyseWavFile(file);
    /**
     * ⭐ **The signal is `cache`, not object identity** (third evaluation, section 6 added the field). This used to assert
     * `first === second`, which was a proxy for "not re-analysed" — and a proxy that the new field replaces: the reply now
     * says whether it was measured or remembered, which is the thing a caller acts on (161 s against 0.005 s), and it says
     * it about a fresh object each time so no caller can mutate a cached reply by accident.
     */
    expect({ first: first.cache, second: second.cache }).toEqual({ first: "miss", second: "hit" });
    expect(second).toEqual({ ...first, cache: "hit" });

    // A longer file with a newer mtime must not serve the curve computed for the shorter one.
    writeFileSync(file, wavBytes(3200));
    const later = new Date("2026-01-01T00:10:00Z");
    utimesSync(file, later, later);
    const third = analyseWavFile(file);
    expect({ durationSec: third.durationSec }).toEqual({ durationSec: 3200 / 8000 });
    expect({ changed: third.cache }).toEqual({ changed: "miss" });
  });
});
