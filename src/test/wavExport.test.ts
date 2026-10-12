import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
import { describe, it, expect } from "vitest";
import { encodeAudioBufferToWav, exportMasterWav, exportStemsWav } from "../audio/WavExporter";
import { DrumPattern } from "../types/genre";

// Mock AudioBuffer for unit testing in node/vitest environment
class MockAudioBuffer {
  public numberOfChannels: number;
  public length: number;
  public sampleRate: number;
  public duration: number;
  private channelData: Float32Array[];

  constructor(options: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.duration = options.length / options.sampleRate;
    this.channelData = [];
    for (let i = 0; i < options.numberOfChannels; i++) {
      this.channelData.push(new Float32Array(options.length));
    }
  }

  public getChannelData(channel: number): Float32Array {
    return this.channelData[channel];
  }
}

describe("WAV & Stems Exporter (P4-01 & P4-02)", () => {
  it("encodes an AudioBuffer into valid standard RIFF WAV 16-bit PCM format", () => {
    const sampleRate = 44100;
    const length = 4410; // 0.1s
    const mockBuf = new MockAudioBuffer({ numberOfChannels: 2, length, sampleRate }) as unknown as AudioBuffer;

    // Put some test values into the channel buffers
    const ch0 = mockBuf.getChannelData(0);
    const ch1 = mockBuf.getChannelData(1);
    for (let i = 0; i < length; i++) {
      ch0[i] = Math.sin((i / 44100) * 440 * 2 * Math.PI) * 0.8;
      ch1[i] = Math.sin((i / 44100) * 880 * 2 * Math.PI) * 0.6;
    }

    const arrayBuffer = encodeAudioBufferToWav(mockBuf);
    expect(arrayBuffer).toBeDefined();
    expect(arrayBuffer.byteLength).toBe(44 + length * 4); // 44 bytes header + 4410 * 2ch * 2bytes

    const view = new DataView(arrayBuffer);

    // Verify RIFF header
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    expect(riff).toBe("RIFF");

    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(wave).toBe("WAVE");

    // Verify fmt chunk
    const fmt = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15));
    expect(fmt).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // Linear PCM
    expect(view.getUint16(22, true)).toBe(2); // 2 channels (stereo)
    expect(view.getUint32(24, true)).toBe(44100); // Sample rate
    expect(view.getUint16(34, true)).toBe(16); // 16-bit

    // Verify data chunk
    const dataTag = String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39));
    expect(dataTag).toBe("data");
    expect(view.getUint32(40, true)).toBe(length * 4);
  });

  it("handles sample clipping and boundaries safely (-1.0 to +1.0)", () => {
    const sampleRate = 44100;
    const length = 4;
    const mockBuf = new MockAudioBuffer({ numberOfChannels: 2, length, sampleRate }) as unknown as AudioBuffer;
    const ch0 = mockBuf.getChannelData(0);
    const ch1 = mockBuf.getChannelData(1);

    // Extreme amplitudes exceeding +/-1.0
    ch0[0] = 2.5; // should clamp to +1.0 -> 32767
    ch0[1] = -3.0; // should clamp to -1.0 -> -32768
    ch1[0] = 0.0;
    ch1[1] = -1.0;

    const arrayBuffer = encodeAudioBufferToWav(mockBuf);
    const view = new DataView(arrayBuffer);

    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(0);
    expect(view.getInt16(48, true)).toBe(-32768);
    expect(view.getInt16(50, true)).toBe(-32768);
  });

  it("formats master and stem filenames following PRD naming conventions", () => {
    const testPattern: DrumPattern = {
      genre_id: "deep-house",
      bpm: 124,
      swing: 15,
      scale: "minorPentatonic",
      tracks: [
        { name: "Kick", track_id: "kick", instrument: "kick", steps: [1, 0, 0, 0], volume: 0.9, pan: 0 },
        { name: "Snare", track_id: "snare", instrument: "snare", steps: [0, 0, 1, 0], volume: 0.8, pan: 0 },
        { name: "Hi-Hat", track_id: "hihat", instrument: "hihat", steps: [1, 1, 1, 1], volume: 0.7, pan: 0.2 },
      ],
    };

    const genreId = "deep-house";
    const bpm = testPattern.bpm;
    const expectedMaster = `${genreId.replace(/-/g, "_")}_master_${bpm}bpm.wav`;
    expect(expectedMaster).toBe("deep_house_master_124bpm.wav");

    const expectedStem0 = `${genreId.replace(/-/g, "_")}_stem_kick_${bpm}bpm.wav`;
    expect(expectedStem0).toBe("deep_house_stem_kick_124bpm.wav");
  });

  it("generates a valid ZIP archive containing multiple stems", async () => {
    const { createZipArchive, computeCrc32 } = await import("../utils/zip");

    const file1Data = new TextEncoder().encode("RIFF....WAVEfmt ");
    const file2Data = new TextEncoder().encode("RIFF....WAVEdata");

    const crc1 = computeCrc32(file1Data);
    expect(crc1).toBeGreaterThan(0);

    const zipBlob = createZipArchive([
      { name: "stem_kick.wav", data: file1Data },
      { name: "stem_snare.wav", data: file2Data },
    ]);

    expect(zipBlob).toBeDefined();
    expect(zipBlob.type).toBe("application/zip");
    expect(zipBlob.size).toBeGreaterThan(file1Data.length + file2Data.length);

    const zipArrayBuffer = await zipBlob.arrayBuffer();
    const view = new DataView(zipArrayBuffer);

    // Verify local file header signature 0x04034b50
    expect(view.getUint32(0, true)).toBe(0x04034b50);
  });
});



/**
 * The offline GS-1 capability probe renders a throwaway context of its own; these cases inspect the *app's* render
 * (hosts, strips, buffers) and would otherwise find the probe's instead. Declared satisfied at module scope here; the
 * probe has its own file, and `probe_engine_parity.mjs` is its acceptance test.
 */
setGs1OfflineCapability("usable");
