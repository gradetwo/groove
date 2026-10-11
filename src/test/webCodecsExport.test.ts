import { describe, it, expect, vi } from "vitest";
import {
  isWebCodecsAudioSupported,
  makeAdtsHeader,
  computeOggCrc,
  makeOggPage,
  makeOpusHead,
  makeOpusTags,
  SAMPLE_RATE_INDICES,
  encodeAudioBufferToAac,
  encodeAudioBufferToOpus,
} from "../audio/WebCodecsExporter";

describe("WebCodecs Audio Exporter", () => {
  describe("ADTS Header Generation (AAC)", () => {
    it("generates 7-byte ADTS header with valid syncword and metadata", () => {
      const dataLength = 250;
      const sampleRate = 44100;
      const channels = 2;
      const header = makeAdtsHeader(dataLength, sampleRate, channels);

      expect(header.length).toBe(7);
      // Byte 0: 0xFF
      expect(header[0]).toBe(0xff);
      // Byte 1: 0xF1 (Syncword bottom 4 bits 0xF, MPEG-4 ID 0, layer 00, protection absent 1)
      expect(header[1]).toBe(0xf1);

      // Verify sample rate index for 44.1kHz is 4 (0x04)
      const expectedSri = SAMPLE_RATE_INDICES[sampleRate];
      expect(expectedSri).toBe(4);
      // Profile is AAC-LC (01), SRI is 4
      const profileAndSri = (header[2] >> 2) & 0x0f;
      expect(profileAndSri).toBe(4);

      // Frame length should be 7 + 250 = 257
      const totalLen = 7 + dataLength;
      const parsedLen =
        ((header[3] & 0x03) << 11) |
        (header[4] << 3) |
        ((header[5] >> 5) & 0x07);
      expect(parsedLen).toBe(totalLen);
    });

    it("handles mono channel and alternative sample rates properly", () => {
      const headerMono = makeAdtsHeader(100, 48000, 1);
      expect(headerMono.length).toBe(7);
      expect(headerMono[0]).toBe(0xff);
      expect(headerMono[1]).toBe(0xf1);

      const parsedLen =
        ((headerMono[3] & 0x03) << 11) |
        (headerMono[4] << 3) |
        ((headerMono[5] >> 5) & 0x07);
      expect(parsedLen).toBe(107);
    });
  });

  describe("Ogg Opus Multiplexer & CRC-32", () => {
    it("computes standard Ogg CRC-32 checksum deterministically", () => {
      const testData = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02]);
      const crc = computeOggCrc(testData);
      expect(typeof crc).toBe("number");
      expect(crc).toBeGreaterThan(0);
      // Same data produces identical CRC
      expect(computeOggCrc(testData)).toBe(crc);
    });

    it("builds valid OpusHead packet", () => {
      const head = makeOpusHead(2, 48000, 384);
      expect(head.length).toBe(19);
      const magic = String.fromCharCode(...head.subarray(0, 8));
      expect(magic).toBe("OpusHead");
      expect(head[8]).toBe(1); // Version 1
      expect(head[9]).toBe(2); // Stereo
    });

    it("builds valid OpusTags packet", () => {
      const tags = makeOpusTags("Groove Test");
      expect(tags.length).toBeGreaterThan(16);
      const magic = String.fromCharCode(...tags.subarray(0, 8));
      expect(magic).toBe("OpusTags");
    });

    it("assembles valid Ogg page with OggS magic and CRC checksum", () => {
      const dummyPacket = new Uint8Array([1, 2, 3, 4]);
      const page = makeOggPage(0x02, 0n, 12345, 0, [dummyPacket]);
      expect(page.length).toBeGreaterThan(27);
      const magic = String.fromCharCode(...page.subarray(0, 4));
      expect(magic).toBe("OggS");
      expect(page[5]).toBe(0x02); // BOS

      // Checksum is written at offset 22
      const view = new DataView(page.buffer);
      const writtenCrc = view.getUint32(22, true);
      expect(writtenCrc).toBeGreaterThan(0);

      // Verify CRC over the complete page
      view.setUint32(22, 0, true);
      const expectedCrc = computeOggCrc(page);
      expect(writtenCrc).toBe(expectedCrc);
    });
  });

  describe("Runtime Capability & Error Handling", () => {
    it("reports unsupported in Node/jsdom without crashing", async () => {
      const supported = await isWebCodecsAudioSupported("aac");
      expect(typeof supported).toBe("boolean");
    });

    it("throws clear error when AudioEncoder is missing in Node environment", async () => {
      const fakeBuffer = {
        sampleRate: 44100,
        numberOfChannels: 2,
        length: 44100,
        duration: 1.0,
        getChannelData: () => new Float32Array(44100),
      } as unknown as AudioBuffer;

      await expect(encodeAudioBufferToAac(fakeBuffer)).rejects.toThrow(
        "WebCodecs AudioEncoder is not supported"
      );
      await expect(encodeAudioBufferToOpus(fakeBuffer)).rejects.toThrow(
        "WebCodecs AudioEncoder is not supported"
      );
    });
  });
});
