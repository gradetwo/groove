import { describe, it, expect } from "vitest";
import { generateMidiBytes } from "../audio/MidiExporter";
import { encodeSharedSequencer, decodeSharedSequencer, SharedSequencerState } from "../audio/SequencerUrlShare";
import { AudioEngine } from "../audio/AudioEngine";
import { generateEuclidean } from "../audio/Euclidean";
import { ALL_GENRES } from "../data/genres";

describe("Audio & Sequencer Utilities", () => {
  const sampleGenre = ALL_GENRES[0]; // Chicago House

  describe("MIDI Exporter", () => {
    it("generates valid SMF Type 0 byte array with headers", () => {
      expect(sampleGenre).toBeDefined();
      expect(sampleGenre.sequencer_pattern).toBeDefined();

      const bytes = generateMidiBytes({
        bpm: sampleGenre.default_bpm || 120,
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
        swing: 15,
        scale: "C minor",
        tracks: sampleGenre.sequencer_pattern.tracks.map((t) => ({
          track_id: t.track_id,
          name: t.name,
          instrument: t.instrument,
          steps: [...t.steps],
          velocity: t.velocity ? [...t.velocity] : undefined,
          pitch: t.pitch ? [...t.pitch] : undefined,
          mute: false,
          solo: false,
          volume: 0.8,
        })),
      };

      const encoded = encodeSharedSequencer(originalState);
      expect(encoded).toBeTruthy();
      expect(typeof encoded).toBe("string");
      expect(encoded).not.toMatch(/[+/=]/);

      const decoded = decodeSharedSequencer(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.genreId).toBe(originalState.genreId);
      expect(decoded!.bpm).toBe(originalState.bpm);
      expect(decoded!.swing).toBe(originalState.swing);
      expect(decoded!.tracks.length).toBe(originalState.tracks.length);

      // Compare active steps
      for (let i = 0; i < decoded!.tracks.length; i++) {
        const origTrack = originalState.tracks[i];
        const decTrack = decoded!.tracks[i];
        expect(decTrack.name).toBe(origTrack.name);
        for (let s = 0; s < 16; s++) {
          expect(decTrack.steps[s]).toBe(origTrack.steps[s]);
        }
      }
    });

    it("encodes and decodes extended meter and resolution states", () => {
      const extendedState: SharedSequencerState = {
        genreId: sampleGenre.id,
        bpm: 140,
        swing: 25,
        scale: "D dorian",
        timeSignature: "6/8",
        resolution: "1/32",
        totalSteps: 24,
        tracks: [
          {
            track_id: "kick",
            name: "Kick",
            instrument: "kick",
            steps: Array(24).fill(0).map((_, i) => (i % 6 === 0 ? 1 : 0)),
            mute: false,
            solo: false,
            volume: 0.9,
          },
        ],
      };

      const encoded = encodeSharedSequencer(extendedState);
      const decoded = decodeSharedSequencer(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.timeSignature).toBe("6/8");
      expect(decoded!.resolution).toBe("1/32");
      expect(decoded!.totalSteps).toBe(24);
      expect(decoded!.tracks[0].steps.length).toBe(24);
      expect(decoded!.tracks[0].steps[0]).toBe(1);
      expect(decoded!.tracks[0].steps[6]).toBe(1);
    });

    it("handles corrupted or invalid base64 gracefully", () => {
      expect(decodeSharedSequencer("")).toBeNull();
      expect(decodeSharedSequencer("invalid-base-64-string!!@@")).toBeNull();
      expect(decodeSharedSequencer("e30=")).toBeNull(); // empty object {}
    });
  });

  describe("Audio Engine Lifecycle & Configuration", () => {
    it("creates an instance and configures parameters without errors", () => {
      const engine = new AudioEngine();
      engine.setBpm(130);
      engine.setSwing(0.2);
      engine.setMasterVolume(0.9);
      engine.setPattern(sampleGenre.sequencer_pattern);

      expect(engine.getIsPlaying()).toBe(false);
      expect(engine.getCurrentStep()).toBe(0);

      // Verify dynamic steps and resolution setters
      engine.setTotalSteps(32);
      expect(engine.getTotalSteps()).toBe(32);

      engine.setResolution("1/32");
      expect(engine.getResolution()).toBe("1/32");

      engine.setTimeSignature("3/8");
      expect(engine.getTimeSignature()).toBe("3/8");

      engine.destroy();
    });
  });

  describe("Extended MIDI Exporter", () => {
    it("exports MIDI with custom resolution and step counts", () => {
      const customPattern = {
        ...sampleGenre.sequencer_pattern,
        timeSignature: "3/4",
        resolution: "1/8" as const,
        totalSteps: 24,
      };

      const bytes = generateMidiBytes({
        bpm: 110,
        pattern: customPattern,
        genreName: "Waltz Groove",
      });

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(30);
    });
  });

  describe("Euclidean Rhythm Generator", () => {
    it("generates correct Euclidean distribution for classic rhythms", () => {
      // 3 in 8 (Tresillo): [1, 0, 0, 1, 0, 0, 1, 0]
      const tresillo = generateEuclidean(8, 3, 0);
      expect(tresillo).toHaveLength(8);
      expect(tresillo.filter((x) => x === 1)).toHaveLength(3);

      // 4 in 16 (Four on the Floor): should hit every 4 steps
      const four = generateEuclidean(16, 4, 0);
      expect(four).toHaveLength(16);
      expect(four.filter((x) => x === 1)).toHaveLength(4);

      // Rotation works properly
      const rotated = generateEuclidean(8, 3, 1);
      expect(rotated).toHaveLength(8);
      expect(rotated.filter((x) => x === 1)).toHaveLength(3);
    });
  });
});
