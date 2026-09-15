import { describe, it, expect, vi } from "vitest";
import {
  midiToFreq,
  DEFAULT_SYNTH_PRESETS,
  playPolySynthNote,
  SynthPreset,
} from "../audio/PolySynth";
import { FakeAudioContext } from "./helpers/fakeAudio";

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

  /**
   * The curated FX voices are the only presets that use the optional `noiseMix` /
   * `pitchSweepCents` extensions. Both additions live inside `playPolySynthNote`, which
   * is the single function the live engine and the offline WAV renderer share, so one
   * set of assertions covers exporter parity by construction.
   */
  describe("Extended voice parameters (curated FX presets)", () => {
    /** Scheduled frequency ramp targets, in order, for one oscillator. */
    function rampTargets(param: { events: Array<{ type: string; value: number }> }) {
      return param.events.filter((e) => e.type === "exponentialRampToValueAtTime").map((e) => e.value);
    }

    /** Plays one note on the shared fake graph (cast to the Web Audio base type). */
    function playOn(ctx: FakeAudioContext, midi: number, dur: number, preset: SynthPreset) {
      const dest = ctx.createGain();
      return playPolySynthNote(
        ctx as unknown as BaseAudioContext,
        dest as unknown as AudioNode,
        midi,
        0.5,
        dur,
        0.8,
        preset
      );
    }

    it("keeps a plain melodic preset on the two-oscillator path", () => {
      const ctx = new FakeAudioContext();
      const voice = playOn(ctx, 60, 0.3, DEFAULT_SYNTH_PRESETS.saxLead);

      expect(voice.sources).toHaveLength(2);
      expect(voice.gains).toHaveLength(1);
      expect(ctx.createdBufferSources).toHaveLength(0);
    });

    it("adds a looping noise source for a noise-based FX preset", () => {
      const ctx = new FakeAudioContext();
      const voice = playOn(ctx, 72, 0.3, DEFAULT_SYNTH_PRESETS.vinylCrackle);

      expect(voice.sources).toHaveLength(3);
      expect(voice.gains).toHaveLength(2);
      // The noise bed must be looped (it is only a quarter-second long) and started.
      expect(ctx.createdBufferSources).toHaveLength(1);
      expect(ctx.createdBufferSources[0].loop).toBe(true);
      expect(ctx.createdBufferSources[0].buffer).toBeTruthy();
    });

    it("glides the oscillator pitch down for tape_stop / sub_drop and up for noise_rise", () => {
      const ctxDown = new FakeAudioContext();
      playOn(ctxDown, 60, 0.4, DEFAULT_SYNTH_PRESETS.tapeStop);
      const downOsc = ctxDown.createdOscillators[0];
      const downTargets = rampTargets(downOsc.frequency);
      expect(downTargets).toHaveLength(1);
      expect(downTargets[0]).toBeLessThan(downOsc.frequency.events[0].value);

      const ctxUp = new FakeAudioContext();
      playOn(ctxUp, 60, 0.4, DEFAULT_SYNTH_PRESETS.noiseRise);
      const upOsc = ctxUp.createdOscillators[0];
      const upTargets = rampTargets(upOsc.frequency);
      expect(upTargets).toHaveLength(1);
      expect(upTargets[0]).toBeGreaterThan(upOsc.frequency.events[0].value);
    });

    it("never schedules a non-positive or non-finite frequency ramp", () => {
      // The ramp targets are clamped by `safeFreq`, so an extreme sweep stays legal.
      for (const key of ["tapeStop", "sweepDown", "subDrop", "laserZap", "noiseRise", "sineLead"]) {
        const ctx = new FakeAudioContext();
        playOn(ctx, 21, 0.4, DEFAULT_SYNTH_PRESETS[key]);
        for (const osc of ctx.createdOscillators) {
          for (const target of rampTargets(osc.frequency)) {
            expect(Number.isFinite(target), key).toBe(true);
            expect(target, key).toBeGreaterThan(0);
          }
        }
      }
    });
  });
});
