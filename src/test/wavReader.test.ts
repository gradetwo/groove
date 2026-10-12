import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { maxDifference, readWav } from "../../scripts/lib/wav.mjs";

/**
 * The oracle's own half, proved before anything is compared with it.
 *
 * sfizz cannot be installed here (its releases ship macOS/Windows binaries and a source tarball), so a Linux oracle means building it in CI. What can be proved
 * locally is that this project **reads** a rendered file correctly — and a comparison built on a reader nobody has tested measures the reader as much as the
 * renderer. So a WAV is written here by hand, with a signal whose peak, RMS and length are known by construction, and read back.
 */
const writeWav = (path: string, { sampleRate = 44100, channels = 1, bits = 16, frames }: { sampleRate?: number; channels?: number; bits?: number; frames: number[][] }) => {
  const frameCount = frames[0].length;
  const bytesPerSample = bits / 8;
  const dataLength = frameCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(bits === 32 ? 3 : 1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataLength, 40);
  let at = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let c = 0; c < channels; c += 1) {
      const value = Math.max(-1, Math.min(1, frames[c][frame]));
      if (bits === 16) buffer.writeInt16LE(Math.round(value * 32767), at);
      else if (bits === 24) {
        const raw = Math.round(value * 8388607);
        buffer.writeUInt8(raw & 0xff, at);
        buffer.writeUInt8((raw >> 8) & 0xff, at + 1);
        buffer.writeUInt8((raw >> 16) & 0xff, at + 2);
      } else buffer.writeFloatLE(value, at);
      at += bytesPerSample;
    }
  }
  writeFileSync(path, buffer);
};

const tmp = () => mkdtempSync(join(tmpdir(), "wav-"));

describe("the WAV reader", () => {
  it("reports a known signal's length, peak and RMS — the numbers every comparison will use", () => {
    const path = join(tmp(), "half.wav");
    // Alternating +0.5 / -0.5: peak is exactly 0.5 and RMS is exactly 0.5, so any reader error is visible rather than plausible.
    const samples = Array.from({ length: 1000 }, (_, index) => (index % 2 === 0 ? 0.5 : -0.5));
    writeWav(path, { frames: [samples] });
    const wav = readWav(path);
    expect(wav.sampleRate).toBe(44100);
    expect(wav.channels).toBe(1);
    expect(wav.frames).toBe(1000);
    expect(wav.peak).toBeCloseTo(0.5, 3);
    expect(wav.rms).toBeCloseTo(0.5, 3);
  });

  it("handles stereo and 32-bit float, which is what this project's own exporter writes", () => {
    const path = join(tmp(), "stereo.wav");
    writeWav(path, { bits: 32, channels: 2, frames: [new Array(64).fill(0.25), new Array(64).fill(-0.5)] });
    const wav = readWav(path);
    expect(wav.channels).toBe(2);
    expect(wav.frames).toBe(64);
    expect(wav.peak).toBeCloseTo(0.5, 5);
    expect(wav.data[0][0]).toBeCloseTo(0.25, 5);
    expect(wav.data[1][7]).toBeCloseTo(-0.5, 5);
  });

  it("finds where two renders differ, which is the shape every oracle comparison needs", () => {
    const a = { channels: 1, frames: 4, data: [Float32Array.from([0, 0, 0, 0])] };
    const b = { channels: 1, frames: 4, data: [Float32Array.from([0, 0, 0.5, 0])] };
    const diff = maxDifference(a as never, b as never);
    expect(diff.max).toBeCloseTo(0.5, 6);
    expect(diff.frame).toBe(2);
    // Identical renders are exactly zero, so a "they agree" criterion cannot pass by epsilon.
    expect(maxDifference(a as never, a as never).max).toBe(0);
  });

  it("refuses a file that is not a WAV, rather than returning silence", () => {
    const path = join(tmp(), "not.wav");
    writeFileSync(path, "this is not a wav file at all, not even close");
    expect(() => readWav(path)).toThrow(/not a RIFF\/WAVE|too short/);
  });
});
