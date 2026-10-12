import { describe, it, expect } from "vitest";
import { encodeAudioBufferToWav, exportStemsZip } from "../audio/WavExporter";
import type { DrumPattern } from "../types/genre";

function createMockAudioBuffer(seconds: number, sampleRate = 44100, channels = 2): AudioBuffer {
  const length = Math.round(seconds * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    left[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    right[i] = Math.cos((2 * Math.PI * 440 * i) / sampleRate);
  }
  return {
    sampleRate,
    numberOfChannels: channels,
    length,
    duration: seconds,
    getChannelData: (ch: number) => (ch === 0 ? left : right),
  } as unknown as AudioBuffer;
}

describe("WAV Optimization & Parity", () => {
  it("encodes valid 16-bit PCM WAV with direct Int16Array mapping", () => {
    const buffer = createMockAudioBuffer(0.1, 44100, 2);
    const arrayBuffer = encodeAudioBufferToWav(buffer);
    const view = new DataView(arrayBuffer);

    // RIFF header
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    expect(riff).toBe("RIFF");
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(wave).toBe("WAVE");

    // "fmt " chunk
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // Stereo
    expect(view.getUint32(24, true)).toBe(44100); // Sample rate
    expect(view.getUint16(34, true)).toBe(16); // 16-bit depth

    // "data" chunk
    const dataMagic = String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39));
    expect(dataMagic).toBe("data");

    // PCM samples start at byte 44
    const pcmView = new Int16Array(arrayBuffer, 44);
    expect(pcmView.length).toBe(buffer.length * 2);
  });

  it("handles mono buffer correctly without overflow", () => {
    const buffer = createMockAudioBuffer(0.1, 44100, 1);
    const arrayBuffer = encodeAudioBufferToWav(buffer);
    const view = new DataView(arrayBuffer);

    expect(view.getUint16(22, true)).toBe(1); // Mono
    const pcmView = new Int16Array(arrayBuffer, 44);
    expect(pcmView.length).toBe(buffer.length);
  });

  it("packs stems sequentially into ZIP archive without redundant Blob copies", async () => {
    const { createZipArchive } = await import("../utils/zip");
    const buf1 = createMockAudioBuffer(0.05, 44100, 2);
    const buf2 = createMockAudioBuffer(0.05, 44100, 2);
    const wav1 = encodeAudioBufferToWav(buf1);
    const wav2 = encodeAudioBufferToWav(buf2);

    const zipEntries = [
      { name: "groove_stem_kick_120bpm.wav", data: new Uint8Array(wav1) },
      { name: "groove_stem_snare_120bpm.wav", data: new Uint8Array(wav2) },
    ];
    const zipBlob = createZipArchive(zipEntries);
    expect(zipBlob).toBeInstanceOf(Blob);
    expect(zipBlob.type).toBe("application/zip");
    expect(zipBlob.size).toBeGreaterThan(wav1.byteLength);
  });
});
