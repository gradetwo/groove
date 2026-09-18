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
      expect(engine.getTrackState(0)?.volume).toBe(0.7);
      expect(engine.getTrackState(0)?.pan).toBe(-0.5);

      // Verify Mute and Solo updates via setTrackState
      engine.setTrackState(0, { mute: true });
      expect(engine.getTrackState(0)?.mute).toBe(true);
      engine.setTrackState(0, { mute: false, solo: true });
      expect(engine.getTrackState(0)?.mute).toBe(false);
      expect(engine.getTrackState(0)?.solo).toBe(true);

      engine.destroy();
    });

    it("synchronizes trackStates mute and solo when setPattern is invoked", () => {
      const engine = new AudioEngine();
      const testPattern = {
        name: "Test Beat",
        tracks: [
          { track_id: "kick", name: "Kick", steps: [1, 0, 0, 0], mute: false, solo: false },
          { track_id: "snare", name: "Snare", steps: [0, 0, 1, 0], mute: false, solo: false },
        ],
      };

      engine.setPattern(testPattern as any);
      expect(engine.getTrackState(0)?.mute).toBe(false);
      expect(engine.getTrackState(1)?.mute).toBe(false);

      // Toggle mute on Kick
      const mutedPattern = {
        ...testPattern,
        tracks: [
          { ...testPattern.tracks[0], mute: true },
          testPattern.tracks[1],
        ],
      };
      engine.setPattern(mutedPattern as any);
      expect(engine.getTrackState(0)?.mute).toBe(true);
      expect(engine.getTrackState(1)?.mute).toBe(false);

      // Toggle solo on Snare
      const soloPattern = {
        ...testPattern,
        tracks: [
          { ...testPattern.tracks[0], mute: false },
          { ...testPattern.tracks[1], solo: true },
        ],
      };
      engine.setPattern(soloPattern as any);
      expect(engine.getTrackState(0)?.solo).toBe(false);
      expect(engine.getTrackState(1)?.solo).toBe(true);

      engine.destroy();
    });

    it("synchronizes bpm, swing, and drumKit when setPattern is invoked with resetStates = true", () => {
      const engine = new AudioEngine();
      engine.setBpm(120);
      engine.setSwing(0);
      engine.setDrumKit("808");

      const genrePattern = {
        name: "Synthwave Pattern",
        genre_id: "synthwave",
        bpm: 105,
        swing: 20, // 20% swing -> 0.20
        tracks: [
          { track_id: "kick", name: "Kick", steps: [1, 0, 0, 0] },
        ],
      };

      engine.setPattern(genrePattern as any, true);
      expect(engine.getBpm()).toBe(105);
      expect(engine.getSwing()).toBeCloseTo(0.20, 2);
      expect(engine.getDrumKit()).toBe("cyber");

      // Also test delta-blues -> acoustic
      engine.setPattern({
        name: "Delta Blues",
        genre_id: "delta-blues",
        bpm: 76,
        swing: 0.45,
        tracks: [],
      } as any, true);
      expect(engine.getBpm()).toBe(76);
      expect(engine.getSwing()).toBeCloseTo(0.45, 2);
      expect(engine.getDrumKit()).toBe("acoustic");

      engine.destroy();
    });

    it("ChordAudioEngine stop and destroy cleanly without leaking", () => {
      const chordEngine = new ChordAudioEngine();
      expect(chordEngine.getIsPlaying()).toBe(false);
      expect(() => chordEngine.panic()).not.toThrow();
      expect(() => chordEngine.stop()).not.toThrow();
      expect(() => chordEngine.destroy()).not.toThrow();
    });

    it("ChordAudioEngine configures and plays arpeggiator and strumming (P6-03)", () => {
      const chordEngine = new ChordAudioEngine();
      chordEngine.setArpConfig({ pattern: "up_down", rate: "1/16", octaves: 2, gate: 0.7 });
      expect(chordEngine.getArpConfig()).toEqual({
        pattern: "up_down",
        rate: "1/16",
        octaves: 2,
        gate: 0.7,
      });

      chordEngine.setStrumConfig({ direction: "alternate", speedMs: 35 });
      expect(chordEngine.getStrumConfig()).toEqual({
        direction: "alternate",
        speedMs: 35,
      });

      // Audition chord in strum mode
      chordEngine.setStyle("strum");
      const strumNotes = chordEngine.triggerChord({ root: "C", quality: "maj", duration: 4 }, "guitar", "strum");
      expect(strumNotes.length).toBeGreaterThan(0);

      // Audition chord in arpeggio mode
      chordEngine.setStyle("arpeggio");
      const arpNotes = chordEngine.triggerChord({ root: "A", quality: "min", duration: 4 }, "piano", "arpeggio");
      expect(arpNotes.length).toBeGreaterThan(0);

      chordEngine.destroy();
    });
  });

  describe("Offline & PCM Timing/Clipping Regression (P3-11)", () => {
    // The master limiter is a real DynamicsCompressorNode created inside
    // AudioEngine.initAudioContext() (threshold -1dBFS, knee 0, ratio 20:1), but
    // jsdom has no AudioContext (`'AudioContext' in window === false`), so it
    // cannot be exercised here. Covering it needs a Web Audio harness: install a
    // mock (or node-web-audio-api OfflineAudioContext), render 8 simultaneous
    // voices and measure the master-bus peak. The previous version of this test
    // re-implemented the limiter transfer function inline and asserted on that
    // copy, which proved nothing about the shipped engine.

    it("derives step duration from BPM, time signature and resolution", () => {
      const engine = new AudioEngine();
      engine.setBpm(120);
      engine.setTimeSignature("4/4");
      engine.setResolution("1/16");
      expect(engine.getStepDuration()).toBeCloseTo(0.125, 6); // 120 BPM, 16th notes

      engine.setResolution("1/8");
      expect(engine.getStepDuration()).toBeCloseTo(0.25, 6);
      engine.setResolution("1/32");
      expect(engine.getStepDuration()).toBeCloseTo(0.0625, 6);

      // 7/8 counts eighths, so one denominator unit is half as long.
      engine.setTimeSignature("7/8");
      engine.setResolution("1/16");
      expect(engine.getStepDuration()).toBeCloseTo(0.0625, 6);

      engine.setBpm(60);
      expect(engine.getStepDuration()).toBeCloseTo(0.125, 6);
      engine.destroy();
    });

    it("triggers onPlay callback on play() and onStop on pause() and stop()", async () => {
      let playCount = 0;
      let stopCount = 0;
      const engine = new AudioEngine({
        onPlay: () => {
          playCount++;
        },
        onStop: () => {
          stopCount++;
        },
      });

      await engine.play();
      expect(playCount).toBe(1);
      expect(engine.getIsPlaying()).toBe(true);

      engine.pause();
      expect(stopCount).toBe(1);
      expect(engine.getIsPlaying()).toBe(false);

      await engine.play();
      expect(playCount).toBe(2);

      engine.stop();
      expect(stopCount).toBe(2);
      expect(engine.getIsPlaying()).toBe(false);
      engine.destroy();
    });

    // The odd-step swing offset (`(swing * 0.5) * stepDur` in AudioEngine's
    // private schedulerLoop) and the per-track gate envelope
    // (`stepDur * gateVal` inside the private playBass/playChord/playLead/playFX
    // voices) only run while a real AudioContext drives the scheduler. Both need
    // the same Web Audio mock harness described above; asserting an inline copy
    // of that arithmetic would be a self-fulfilling test, so those cases were
    // removed rather than left in place.
  });
});
