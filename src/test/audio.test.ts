import { describe, it, expect } from "vitest";
import { generateMidiBytes } from "../audio/MidiExporter";
import { encodeSharedSequencer, decodeSharedSequencer, SharedSequencerState } from "../audio/SequencerUrlShare";
import { AudioEngine } from "../audio/AudioEngine";
import { generateEuclidean, EUCLIDEAN_PRESETS } from "../audio/Euclidean";
import { ChordAudioEngine } from "../audio/ChordAudioEngine";
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
    it("generates exact element-by-element Bjorklund distribution for classic rhythms", () => {
      // 3 in 8 (Tresillo): [1, 0, 0, 1, 0, 0, 1, 0]
      const tresillo = generateEuclidean(8, 3, 0);
      expect(tresillo).toEqual([1, 0, 0, 1, 0, 0, 1, 0]);

      // 4 in 16 (Four on the Floor)
      const four = generateEuclidean(16, 4, 0);
      expect(four).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);

      // 5 in 8 (Cinquillo)
      const cinquillo = generateEuclidean(8, 5, 0);
      expect(cinquillo).toEqual([1, 0, 1, 1, 0, 1, 1, 0]);

      // 2 in 5
      const twoInFive = generateEuclidean(5, 2, 0);
      expect(twoInFive).toEqual([1, 0, 1, 0, 0]);

      // Edge cases: k = 0 and k = n
      expect(generateEuclidean(4, 0)).toEqual([0, 0, 0, 0]);
      expect(generateEuclidean(4, 4)).toEqual([1, 1, 1, 1]);

      // Rotation shifts elements forward
      const rotatedTresillo = generateEuclidean(8, 3, 1);
      // Shifted by 1 position: index 0 gets 0 (from end), index 1 gets 1
      expect(rotatedTresillo).toEqual([0, 1, 0, 0, 1, 0, 0, 1]);
    });

    it("verifies all 8 built-in EUCLIDEAN_PRESETS produce non-empty valid patterns", () => {
      expect(EUCLIDEAN_PRESETS).toHaveLength(8);
      EUCLIDEAN_PRESETS.forEach((preset) => {
        const pattern = generateEuclidean(preset.n, preset.k, preset.rot);
        expect(pattern).toHaveLength(preset.n);
        const activeCount = pattern.filter((x) => x === 1).length;
        expect(activeCount).toBe(preset.k);
      });
    });
  });

  describe("Audio Engine Master Safety & Panic", () => {
    it("safely clamps master volume and executes panic without throwing", () => {
      const engine = new AudioEngine();
      engine.setMasterVolume(2.5); // Should clamp to <= 1.0 internally
      engine.setMasterVolume(-1.0); // Should clamp to >= 0.0 internally

      // Calling panic and stop when not playing should be no-op safe
      expect(() => engine.panic()).not.toThrow();
      expect(() => engine.stop()).not.toThrow();
      expect(() => engine.destroy()).not.toThrow();
    });

    it("ChordAudioEngine stop and destroy cleanly without leaking", () => {
      const chordEngine = new ChordAudioEngine();
      expect(chordEngine.getIsPlaying()).toBe(false);
      expect(() => chordEngine.panic()).not.toThrow();
      expect(() => chordEngine.stop()).not.toThrow();
      expect(() => chordEngine.destroy()).not.toThrow();
    });
  });
});
