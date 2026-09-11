import { describe, it, expect, vi } from "vitest";
import {
  midiToFreq,
  DEFAULT_SYNTH_PRESETS,
  playPolySynthNote,
  SynthPreset,
} from "../audio/PolySynth";

function createMockAudioContext() {
  const createdNodes: any[] = [];

  const createAudioParam = (initial = 0) => ({
    value: initial,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });

  const createNode = (type: string) => {
    const node: any = {
      _type: type,
      connect: vi.fn((dest) => dest),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    if (type === "oscillator") {
      node.type = "sine";
      node.frequency = createAudioParam(440);
      node.detune = createAudioParam(0);
    } else if (type === "gain") {
      node.gain = createAudioParam(1.0);
    } else if (type === "biquadFilter") {
      node.type = "lowpass";
      node.frequency = createAudioParam(1000);
      node.Q = createAudioParam(1.0);
    }

    createdNodes.push(node);
    return node;
  };

  const ctx: any = {
    currentTime: 0.2,
    sampleRate: 44100,
    createOscillator: vi.fn(() => createNode("oscillator")),
    createGain: vi.fn(() => createNode("gain")),
    createBiquadFilter: vi.fn(() => createNode("biquadFilter")),
  };

  return { ctx, createdNodes };
}

describe("4-Voice Polyphonic Synthesizer (P5-03)", () => {
  describe("Pitch & Frequency Math", () => {
    it("converts MIDI note numbers to standard concert pitch frequencies accurately", () => {
      // A4 = 69 = 440 Hz
      expect(midiToFreq(69)).toBeCloseTo(440, 2);
      // A3 = 57 = 220 Hz
      expect(midiToFreq(57)).toBeCloseTo(220, 2);
      // A5 = 81 = 880 Hz
      expect(midiToFreq(81)).toBeCloseTo(880, 2);
      // C4 (Middle C) = 60 ~= 261.63 Hz
      expect(midiToFreq(60)).toBeCloseTo(261.626, 2);
    });
  });

  describe("Built-in Synth Presets", () => {
    const presetKeys = Object.keys(DEFAULT_SYNTH_PRESETS) as (keyof typeof DEFAULT_SYNTH_PRESETS)[];

    it("defines the standard factory presets", () => {
      expect(presetKeys).toContain("analogLead");
      expect(presetKeys).toContain("warmPad");
      expect(presetKeys).toContain("deepPluck");
      expect(presetKeys).toContain("acidBass");
    });

    presetKeys.forEach((key) => {
      it(`preset ${key} has valid oscillator types and positive ADSR values`, () => {
        const p: SynthPreset = DEFAULT_SYNTH_PRESETS[key];
        expect(p.name).toBeTruthy();
        expect(["sine", "square", "sawtooth", "triangle"]).toContain(p.osc1Type);
        expect(["sine", "square", "sawtooth", "triangle"]).toContain(p.osc2Type);
        expect(p.filterCutoff).toBeGreaterThan(0);
        expect(p.filterQ).toBeGreaterThan(0);

        expect(p.adsr.attack).toBeGreaterThanOrEqual(0.001);
        expect(p.adsr.decay).toBeGreaterThanOrEqual(0.01);
        expect(p.adsr.sustain).toBeGreaterThanOrEqual(0.0);
        expect(p.adsr.sustain).toBeLessThanOrEqual(1.0);
        expect(p.adsr.release).toBeGreaterThanOrEqual(0.01);
      });
    });
  });

  describe("Voice Synthesis & ADSR Enveloping", () => {
    it("instantiates dual oscillators, resonant filter, and ADSR gain envelope", () => {
      const { ctx, createdNodes } = createMockAudioContext();
      const dest = ctx.createGain();

      const voice = playPolySynthNote(ctx, dest, 60, 0.5, 0.3, 0.8, DEFAULT_SYNTH_PRESETS.analogLead);

      expect(voice).toBeDefined();
      expect(voice.sources.length).toBe(2); // Dual oscillators
      expect(voice.gains.length).toBe(1); // Amp envelope
      expect(voice.stopTime).toBeGreaterThan(0.5 + 0.3);

      // Verify oscillators started at note onset
      voice.sources.forEach((src) => {
        expect(src.start).toHaveBeenCalledWith(0.5);
        expect(src.stop).toHaveBeenCalled();
      });

      const filters = createdNodes.filter((n) => n._type === "biquadFilter");
      expect(filters.length).toBeGreaterThanOrEqual(1);
    });

    it("handles polyphony across different octave ranges safely", () => {
      const { ctx } = createMockAudioContext();
      const dest = ctx.createGain();

      const lowVoice = playPolySynthNote(ctx, dest, 36, 0.1, 0.2, 0.9, DEFAULT_SYNTH_PRESETS.acidBass);
      const midVoice = playPolySynthNote(ctx, dest, 60, 0.1, 0.4, 0.7, DEFAULT_SYNTH_PRESETS.warmPad);
      const highVoice = playPolySynthNote(ctx, dest, 84, 0.1, 0.15, 0.8, DEFAULT_SYNTH_PRESETS.deepPluck);

      expect(lowVoice.stopTime).toBeGreaterThan(0.1);
      expect(midVoice.stopTime).toBeGreaterThan(0.1);
      expect(highVoice.stopTime).toBeGreaterThan(0.1);
    });
  });
});
