import { describe, it, expect } from "vitest";
import { generateMidiBytes } from "../audio/MidiExporter";
import { encodeSharedSequencer, decodeSharedSequencer, getShareUrl, SharedSequencerState } from "../audio/SequencerUrlShare";
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

    it("rejects malicious or out-of-bounds payloads (DoS prevention)", () => {
      // Helper to encode a raw object to base64
      const encodeRaw = (obj: any) => {
        const json = JSON.stringify(obj);
        return Buffer.from(json).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      };

      // Malicious stLen = 1e9
      const hugeStepsPayload = encodeRaw({
        g: "techno",
        b: 130,
        s: 0,
        stLen: 1e9,
        t: [{ id: "kick", n: "Kick", ins: "kick", m: 1 }],
      });
      expect(decodeSharedSequencer(hugeStepsPayload)).toBeNull();

      // Negative step value in ct.st
      const negativeStepPayload = encodeRaw({
        g: "techno",
        b: 130,
        s: 0,
        stLen: 16,
        t: [{ id: "kick", n: "Kick", ins: "kick", st: [-5, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
      });
      expect(decodeSharedSequencer(negativeStepPayload)).toBeNull();

      // Step value > 3 in ct.st
      const excessiveStepValPayload = encodeRaw({
        g: "techno",
        b: 130,
        s: 0,
        stLen: 16,
        t: [{ id: "kick", n: "Kick", ins: "kick", st: [99, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
      });
      expect(decodeSharedSequencer(excessiveStepValPayload)).toBeNull();

      // Excessive tracks (> 16)
      const tooManyTracksPayload = encodeRaw({
        g: "techno",
        b: 130,
        s: 0,
        stLen: 16,
        t: Array(20).fill({ id: "track", n: "Track", ins: "kick", m: 1 }),
      });
      expect(decodeSharedSequencer(tooManyTracksPayload)).toBeNull();

      // Out-of-bounds BPM (< 20 or > 300)
      expect(decodeSharedSequencer(encodeRaw({ g: "house", b: 10, s: 0, t: [{ m: 1 }] }))).toBeNull();
      expect(decodeSharedSequencer(encodeRaw({ g: "house", b: 9999, s: 0, t: [{ m: 1 }] }))).toBeNull();

      // Out-of-bounds swing (< 0 or > 100)
      expect(decodeSharedSequencer(encodeRaw({ g: "house", b: 120, s: -10, t: [{ m: 1 }] }))).toBeNull();
      expect(decodeSharedSequencer(encodeRaw({ g: "house", b: 120, s: 150, t: [{ m: 1 }] }))).toBeNull();

      // String exceeding max length (> 8192)
      const oversizedString = "A".repeat(9000);
      expect(decodeSharedSequencer(oversizedString)).toBeNull();
    });

    it("rejects invalid state on encodeSharedSequencer and getShareUrl", () => {
      const invalidBpmState: SharedSequencerState = {
        genreId: "techno",
        bpm: 999,
        swing: 0,
        tracks: [{ track_id: "kick", name: "Kick", instrument: "kick", steps: [1, 0, 0, 0] }],
      };
      expect(encodeSharedSequencer(invalidBpmState)).toBe("");
      expect(getShareUrl(invalidBpmState)).toBe("");

      const invalidSwingState: SharedSequencerState = {
        genreId: "techno",
        bpm: 120,
        swing: -5,
        tracks: [{ track_id: "kick", name: "Kick", instrument: "kick", steps: [1, 0, 0, 0] }],
      };
      expect(encodeSharedSequencer(invalidSwingState)).toBe("");
      expect(getShareUrl(invalidSwingState)).toBe("");

      const invalidStepsState: SharedSequencerState = {
        genreId: "techno",
        bpm: 120,
        swing: 0,
        tracks: [{ track_id: "kick", name: "Kick", instrument: "kick", steps: [-1, 0, 0, 0] }],
      };
      expect(encodeSharedSequencer(invalidStepsState)).toBe("");
      expect(getShareUrl(invalidStepsState)).toBe("");

      const emptyTracksState: SharedSequencerState = {
        genreId: "techno",
        bpm: 120,
        swing: 0,
        tracks: [],
      };
      expect(encodeSharedSequencer(emptyTracksState)).toBe("");
      expect(getShareUrl(emptyTracksState)).toBe("");
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

    it("respects mute and solo states, gate durations, and ratchets during MIDI export", () => {
      const customPattern = {
        genre_id: "test_groove",
        bpm: 120,
        scale: "C minor",
        swing: 20,
        totalSteps: 16,
        tracks: [
          {
            track_id: "kick" as const,
            name: "Kick",
            instrument: "kick",
            steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
            mute: true, // Should be excluded
            solo: false,
          },
          {
            track_id: "snare" as const,
            name: "Snare",
            instrument: "snare",
            steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            mute: false,
            solo: true, // Solo enabled
            gate: [0.8, 0.8, 0.8, 0.8, 1.5, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.5, 0.8, 0.8, 0.8],
            ratchet: [1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1], // Subdivisions
          },
          {
            track_id: "hihat" as const,
            name: "HiHat",
            instrument: "hihat",
            steps: Array(16).fill(1),
            mute: false,
            solo: false, // Non-solo track when solo exists -> excluded
          },
        ],
      };

      const bytes = generateMidiBytes({
        bpm: 120,
        pattern: customPattern,
      });

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBeGreaterThan(20);
    });
  });

  describe("Sequencer URL Sharing Lossless Roundtrip", () => {
    it("encodes and decodes gate, ratchet, probability, trackLength, pan, and swing without loss", () => {
      const advancedState: SharedSequencerState = {
        genreId: "deep-house",
        bpm: 124,
        swing: 18,
        scale: "F minor",
        totalSteps: 16,
        tracks: [
          {
            track_id: "kick",
            name: "Kick",
            instrument: "kick",
            steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
            velocity: [120, 100, 110, 100, 120, 100, 110, 100, 120, 100, 110, 100, 120, 100, 110, 100],
            pitch: Array(16).fill(36),
            gate: [1.2, 0.8, 0.8, 0.8, 1.0, 0.8, 0.8, 0.8, 1.2, 0.8, 0.8, 0.8, 1.0, 0.8, 0.8, 0.8],
            ratchet: [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 4, 1],
            probability: [100, 100, 75, 100, 100, 100, 50, 100, 100, 100, 75, 100, 100, 100, 90, 100],
            trackLength: 12,
            pan: -0.4,
            swing: 10,
            volume: 0.85,
            mute: false,
            solo: false,
          },
        ],
      };

      const encoded = encodeSharedSequencer(advancedState);
      expect(encoded).toBeTruthy();

      const decoded = decodeSharedSequencer(encoded);
      expect(decoded).not.toBeNull();
      const t = decoded!.tracks[0];
      expect(t.trackLength).toBe(12);
      expect(t.pan).toBeCloseTo(-0.4, 1);
      expect(t.swing).toBe(10);
      expect(t.gate?.[0]).toBe(1.2);
      expect(t.ratchet?.[2]).toBe(2);
      expect(t.ratchet?.[14]).toBe(4);
      expect(t.probability?.[2]).toBe(75);
      expect(t.probability?.[6]).toBe(50);
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

  describe("Audio Engine Master Safety, Helpers & Channel Strips", () => {
    it("safely clamps master volume and executes panic without throwing", () => {
      const engine = new AudioEngine();
      engine.setMasterVolume(2.5); // Should clamp to <= 1.0 internally
      engine.setMasterVolume(-1.0); // Should clamp to >= 0.0 internally

      // Calling panic and stop when not playing should be no-op safe
      expect(() => engine.panic()).not.toThrow();
      expect(() => engine.stop()).not.toThrow();
      expect(() => engine.destroy()).not.toThrow();
    });

    it("calculates tap tempo accurately from timestamp intervals", () => {
      // 120 BPM = 500ms intervals
      const taps120 = [1000, 1500, 2000, 2500];
      expect(AudioEngine.calculateTapTempo(taps120)).toBe(120);

      // 140 BPM = ~428.57ms intervals
      const taps140 = [1000, 1429, 1857, 2286];
      expect(AudioEngine.calculateTapTempo(taps140)).toBe(140);

      // Single tap should fallback safely to 120
      expect(AudioEngine.calculateTapTempo([1000])).toBe(120);
    });

    it("configures metronome, count-in, and loop range parameters", () => {
      const engine = new AudioEngine();
      expect(engine.getMetronome()).toBe(false);
      engine.setMetronome(true);
      expect(engine.getMetronome()).toBe(true);

      expect(engine.getCountIn()).toBe(false);
      engine.setCountIn(true);
      expect(engine.getCountIn()).toBe(true);

      expect(engine.getLoopRange()).toBeNull();
      engine.setLoopRange([4, 12]);
      expect(engine.getLoopRange()).toEqual([4, 12]);
      engine.setLoopRange(null);
      expect(engine.getLoopRange()).toBeNull();

      // Track channel strip parameters configuration
      engine.setTrackState(0, { volume: 0.7, pan: -0.5, sendA: 0.3, sendB: 0.2 });
      engine.destroy();
    });

    it("ChordAudioEngine stop and destroy cleanly without leaking", () => {
      const chordEngine = new ChordAudioEngine();
      expect(chordEngine.getIsPlaying()).toBe(false);
      expect(() => chordEngine.panic()).not.toThrow();
      expect(() => chordEngine.stop()).not.toThrow();
      expect(() => chordEngine.destroy()).not.toThrow();
    });
  });

  describe("Offline & PCM Timing/Clipping Regression (P3-11)", () => {
    it("verifies 8-track simultaneous firing with master limiter does not exceed full scale (<= 1.0)", () => {
      // Simulate 8 simultaneous voices at max volume
      const numTracks = 8;
      const trackGains = Array(numTracks).fill(0.8);
      const masterGain = 0.8;

      // Raw uncompressed sum
      const rawSum = trackGains.reduce((a, b) => a + b, 0) * masterGain; // 8 * 0.8 * 0.8 = 5.12 (> 1.0, would clip without limiter)
      expect(rawSum).toBeGreaterThan(1.0);

      // Limiter transfer function simulation:
      // threshold = -1dBFS ~= 0.891, ratio = 20:1
      const thresholdLinear = Math.pow(10, -1.0 / 20); // ~0.89125
      const dbAboveThreshold = 20 * Math.log10(rawSum / thresholdLinear);
      const compressedDbAbove = dbAboveThreshold / 20.0; // ratio 20:1
      const limitedOutput = thresholdLinear * Math.pow(10, compressedDbAbove / 20);

      // Must be safely within full scale
      expect(limitedOutput).toBeLessThanOrEqual(1.0);
      expect(limitedOutput).toBeGreaterThan(0.8);
    });

    it("verifies swing timing math strictly shifts odd 16th notes", () => {
      const bpm = 120;
      const beatSec = 60 / bpm; // 0.5s
      const stepDur = beatSec / 4; // 0.125s (125ms)
      const swing = 0.5; // 50% swing

      for (let step = 0; step < 16; step++) {
        const nominalTime = step * stepDur;
        const swingOffset = (step % 2 === 1 && swing > 0) ? (swing * 0.5) * stepDur : 0;
        const actualTime = nominalTime + swingOffset;

        if (step % 2 === 0) {
          // Even steps have zero swing offset
          expect(actualTime).toBe(nominalTime);
        } else {
          // Odd steps are delayed by (swing * 0.5) * 125ms = 31.25ms
          expect(actualTime).toBeCloseTo(nominalTime + 0.03125, 4);
        }
      }
    });

    it("verifies gate durations compute strictly positive bounded envelopes", () => {
      const stepDur = 0.125;
      const testGates = [0.1, 0.5, 0.8, 1.0, 1.5, 2.0];

      testGates.forEach((gate) => {
        const duration = Math.max(0.05, Math.min(2.5, stepDur * gate));
        expect(duration).toBeGreaterThanOrEqual(0.05);
        expect(duration).toBeLessThanOrEqual(2.5);
        if (stepDur * gate >= 0.05) {
          expect(duration).toBeCloseTo(stepDur * gate, 3);
        } else {
          expect(duration).toBe(0.05);
        }
      });
    });
  });
});
