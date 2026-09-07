import { describe, it, expect } from "vitest";
import { generateMidiBytes } from "../audio/MidiExporter";
import { encodeSharedSequencer, decodeSharedSequencer, SharedSequencerState } from "../audio/SequencerUrlShare";
import { AudioEngine } from "../audio/AudioEngine";
import { ALL_GENRES } from "../data/genres";

describe("Audio & Sequencer Utilities", () => {
  const sampleGenre = ALL_GENRES[0]; // e.g. Chicago House

  describe("MIDI Exporter", () => {
    it("generates valid SMF Type 0 byte array with headers", () => {
      expect(sampleGenre).toBeDefined();
      expect(sampleGenre.sequencer_pattern).toBeDefined();

      const bytes = generateMidiBytes({
        bpm: sampleGenre.bpm_range[0],
        pattern: sampleGenre.sequencer_pattern,
        genreName: sampleGenre.name,
      });

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(30);

      // Check MThd header: 4D 54 68 64
      expect(bytes[0]).toBe(0x4d);
      expect(bytes[1]).toBe(0x54);
      expect(bytes[2]).toBe(0x68);
      expect(bytes[3]).toBe(0x64);

      // Check header length = 6
      expect(bytes[7]).toBe(6);

      // Check format = 0
      expect(bytes[9]).toBe(0);

      // Check track count = 1
      expect(bytes[11]).toBe(1);

      // Check MTrk chunk marker: 4D 54 72 6B
      expect(bytes[14]).toBe(0x4d);
      expect(bytes[15]).toBe(0x54);
      expect(bytes[16]).toBe(0x72);
      expect(bytes[17]).toBe(0x6b);

      // Check end of track marker at the end: FF 2F 00
      const len = bytes.length;
      expect(bytes[len - 3]).toBe(0xff);
      expect(bytes[len - 2]).toBe(0x2f);
      expect(bytes[len - 1]).toBe(0x00);
    });
  });

  describe("Sequencer URL Sharing", () => {
    it("encodes and decodes state reversibly", () => {
      const originalState: SharedSequencerState = {
        genreId: sampleGenre.id,
        bpm: 126,
        swing: 0.15,
        scaleKey: "F",
        scaleMode: "minor",
        tracks: sampleGenre.sequencer_pattern.tracks.map((t) => ({
          name: t.name,
          steps: t.steps.map((s) => ({
            active: s.active,
            velocity: s.velocity,
            pitch: s.pitch,
          })),
          mute: false,
          solo: false,
          volume: 0.8,
        })),
      };

      const encoded = encodeSharedSequencer(originalState);
      expect(encoded).toBeTruthy();
      expect(typeof encoded).toBe("string");
      // URL-safe (no +, /, =)
      expect(encoded).not.toMatch(/[+/=]/);

      const decoded = decodeSharedSequencer(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.genreId).toBe(originalState.genreId);
      expect(decoded!.bpm).toBe(originalState.bpm);
      expect(decoded!.swing).toBe(originalState.swing);
      expect(decoded!.scaleKey).toBe(originalState.scaleKey);
      expect(decoded!.scaleMode).toBe(originalState.scaleMode);
      expect(decoded!.tracks.length).toBe(originalState.tracks.length);

      // Compare active steps
      for (let i = 0; i < decoded!.tracks.length; i++) {
        const origTrack = originalState.tracks[i];
        const decTrack = decoded!.tracks[i];
        expect(decTrack.name).toBe(origTrack.name);
        for (let s = 0; s < 16; s++) {
          expect(Boolean(decTrack.steps[s].active)).toBe(Boolean(origTrack.steps[s].active));
        }
      }
    });

    it("handles corrupted or invalid base64 gracefully", () => {
      expect(decodeSharedSequencer("")).toBeNull();
      expect(decodeSharedSequencer("invalid-base-64-string!!@@")).toBeNull();
      expect(decodeSharedSequencer("e30=")).toBeNull(); // empty object {}
    });
  });

  describe("Audio Engine Lifecycle", () => {
    it("creates an instance and configures parameters without errors", () => {
      const engine = new AudioEngine();
      engine.setBpm(130);
      engine.setSwing(0.2);
      engine.setMasterVolume(0.9);
      engine.setPattern(sampleGenre.sequencer_pattern);

      expect(engine.getIsPlaying()).toBe(false);
      expect(engine.getCurrentStep()).toBe(0);

      engine.destroy();
    });
  });
});
