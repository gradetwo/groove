import { describe, it, expect, vi } from "vitest";
import {
  midiToFreq,
  DEFAULT_SYNTH_PRESETS,
  playPolySynthNote,
  velocityCurve,
  SynthPreset,
} from "../audio/PolySynth";
import { FakeAudioContext, FakeGainNode } from "./helpers/fakeAudio";

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

/**
 * Amplitude-envelope continuity regression tests.
 *
 * `playPolySynthNote` schedules its 4-stage ADSR on a single amp `GainNode`. When
 * the gate ended before the attack or decay ramp had finished, the old code forced
 * the sustain level with an unconditional `setValueAtTime` on top of the running
 * ramp — a step discontinuity in amplitude, i.e. a broadband click (worst on low
 * notes, where it is least masked). These tests read the scheduled automation back
 * off `FakeAudioParam.events`, rebuild the envelope exactly as Web Audio renders
 * it, and assert it is continuous at the gate and still lands on the initial floor
 * by `noteEndTime`.
 *
 * Every assertion loops over the whole `DEFAULT_SYNTH_PRESETS` table, so a future
 * long-decay or long-attack preset cannot silently reintroduce the click.
 */
describe("Amplitude envelope continuity (click fix)", () => {
  const TIME = 0.5; // note onset — matches the shared fake graph used above
  const VEL = 0.8;
  const FLOOR = 0.0001; // the envelope's initial/final value
  const SHORT_NOTE = 0.1; // 1/16 at 120 BPM with a 0.8 gate — the audit's case
  // E-13: the amp level now goes through the velocity curve and an annotated preset's
  // attack/decay are stretched at sub-unity velocity, so the mirror of the scheduled
  // envelope has to include the same curve and scaling the engine uses.
  const VEL_CURVE = velocityCurve(VEL);

  type AmpEvent = { type: string; value: number; time: number };

  /** Plays one note and returns the amp gain's scheduled events, time-ordered. */
  function ampEnvelope(preset: SynthPreset, dur: number, midi = 36): AmpEvent[] {
    const ctx = new FakeAudioContext();
    const dest = ctx.createGain();
    const voice = playPolySynthNote(
      ctx as unknown as BaseAudioContext,
      dest as unknown as AudioNode,
      midi,
      TIME,
      dur,
      VEL,
      preset
    );
    // The amp envelope is the last gain pushed: noise presets push their noise
    // gain first, the melodic path pushes only the amp gain.
    const amp = voice.gains[voice.gains.length - 1] as unknown as FakeGainNode;
    return [...amp.gain.events].sort((a, b) => a.time - b.time);
  }

  /**
   * Evaluates the scheduled envelope at `t` the way Web Audio does: a
   * `setValueAtTime` holds its value, and an `exponentialRampToValueAtTime`
   * interpolates exponentially from the previous event to its target. Every
   * envelope this code schedules uses strictly increasing event times, so
   * consecutive events are always the ramp's true endpoints.
   */
  function envelopeValueAt(events: AmpEvent[], t: number): number {
    if (events.length === 0) return NaN;
    if (t <= events[0].time) return events[0].value;
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const next = events[i];
      if (t > next.time) continue;
      if (next.type === "setValueAtTime") return t < next.time ? prev.value : next.value;
      const frac = next.time === prev.time ? 1 : (t - prev.time) / (next.time - prev.time);
      return prev.value * Math.pow(next.value / prev.value, frac);
    }
    return events[events.length - 1].value;
  }

  /** The value of the (single) event scheduled at exactly `t`, or NaN. */
  function valueScheduledAt(events: AmpEvent[], t: number): number {
    const at = events.filter((e) => Math.abs(e.time - t) < 1e-9);
    return at.length > 0 ? at[at.length - 1].value : NaN;
  }

  /**
   * The velocity-scaled attack/decay endpoints `playPolySynthNote` schedules, mirroring
   * the `attackScale` / `decayScale` operands exactly. For an un-annotated preset, or any
   * preset at full velocity, the scales are 1 and these are the raw ADSR times.
   */
  function ampTiming(preset: SynthPreset) {
    const attackScale = 1 + (preset.velocityToAttack ?? 0) * (1 - VEL_CURVE);
    const decayScale = 1 + (preset.velocityToDecay ?? 0) * (1 - VEL_CURVE);
    const attackEnd = TIME + Math.max(0.002, preset.adsr.attack * attackScale);
    const decayEnd = attackEnd + Math.max(0.01, preset.adsr.decay * decayScale);
    return { attackEnd, decayEnd };
  }

  /**
   * The analytic value the preceding ramp reaches at `noteReleaseStart`, mirroring
   * the formula in `playPolySynthNote` operand-for-operand so the comparison is exact.
   */
  function analyticReleaseValue(preset: SynthPreset, dur: number): number {
    const maxVolume = VEL_CURVE * 0.8;
    const attackStart = FLOOR;
    const attackPeak = Math.max(0.001, maxVolume);
    const { attackEnd, decayEnd } = ampTiming(preset);
    const sustainLevel = Math.max(0.0001, maxVolume * preset.adsr.sustain);
    const noteReleaseStart = TIME + Math.max(0.05, dur);
    return noteReleaseStart <= attackEnd
      ? attackStart * Math.pow(attackPeak / attackStart, (noteReleaseStart - TIME) / (attackEnd - TIME))
      : noteReleaseStart < decayEnd
        ? attackPeak * Math.pow(sustainLevel / attackPeak, (noteReleaseStart - attackEnd) / (decayEnd - attackEnd))
        : sustainLevel;
  }

  function gateEnd(dur: number): number {
    return TIME + Math.max(0.05, dur);
  }

  function noteEnd(dur: number, preset: SynthPreset): number {
    return gateEnd(dur) + Math.max(0.01, preset.adsr.release);
  }

  const presetEntries = Object.entries(DEFAULT_SYNTH_PRESETS);

  it("schedules the gate value from the preceding ramp for every preset (no step at noteReleaseStart)", () => {
    let decayClipped = 0;
    for (const [key, preset] of presetEntries) {
      const events = ampEnvelope(preset, SHORT_NOTE);
      const release = gateEnd(SHORT_NOTE);
      const { decayEnd } = ampTiming(preset);
      if (release < decayEnd) decayClipped++;

      // The event at the gate carries the analytic value of the ramp running into it…
      expect(valueScheduledAt(events, release), key).toBeCloseTo(
        analyticReleaseValue(preset, SHORT_NOTE),
        10
      );
      // …so the envelope is continuous across the gate.
      const before = envelopeValueAt(events, release - 1e-9);
      const at = envelopeValueAt(events, release);
      expect(Math.abs(at - before), `${key} jump at gate`).toBeLessThan(1e-6);
    }
    // The 1/16 gate really does cut the decay for a large part of the table.
    expect(decayClipped).toBeGreaterThan(10);
  });

  it("is continuous when a long attack is still rising at the gate (attackEnd > noteReleaseStart)", () => {
    const dur = 0.05; // the shortest gate `playPolySynthNote` allows
    const release = gateEnd(dur);
    let longAttack = 0;
    for (const [key, preset] of presetEntries) {
      const { attackEnd } = ampTiming(preset);
      if (attackEnd <= release) continue;
      longAttack++;

      const events = ampEnvelope(preset, dur);
      const at = valueScheduledAt(events, release);
      expect(at, key).toBeCloseTo(analyticReleaseValue(preset, dur), 10);
      expect(
        Math.abs(envelopeValueAt(events, release) - envelopeValueAt(events, release - 1e-9)),
        `${key} jump mid-attack`
      ).toBeLessThan(1e-6);

      // The buggy version forced the (louder) sustain level mid-attack; the fixed
      // envelope must stay on the quiet attack curve instead.
      const sustainLevel = Math.max(0.0001, VEL_CURVE * 0.8 * preset.adsr.sustain);
      expect(at, `${key} must not step to sustain mid-attack`).toBeLessThan(sustainLevel);
    }
    expect(longAttack).toBeGreaterThanOrEqual(5);
  });

  it("keeps the removed bass808 step out of the 1/16 envelope", () => {
    // Worked example: decay 0.9 s, sustain 0.55 on a 1/16 note. The decay curve
    // sits ~4.6 dB above sustain at the gate, and the old unconditional
    // setValueAtTime stepped down to sustain exactly there.
    const preset = DEFAULT_SYNTH_PRESETS.bass808;
    const events = ampEnvelope(preset, SHORT_NOTE);
    const release = gateEnd(SHORT_NOTE);
    const sustainLevel = Math.max(0.0001, VEL_CURVE * 0.8 * preset.adsr.sustain);
    const at = valueScheduledAt(events, release);

    expect(at).toBeGreaterThan(sustainLevel); // the removed step was a drop
    expect(20 * Math.log10(at / sustainLevel)).toBeGreaterThan(4); // ~4.6 dB
    expect(envelopeValueAt(events, release)).toBeCloseTo(
      envelopeValueAt(events, release - 1e-9),
      6
    );
  });

  it("returns the envelope to the initial floor by noteEndTime for every preset", () => {
    for (const [key, preset] of presetEntries) {
      for (const dur of [0.05, SHORT_NOTE, 0.125, 1.0]) {
        const events = ampEnvelope(preset, dur);
        const end = noteEnd(dur, preset);
        const last = events[events.length - 1];
        expect(last.time, `${key}@${dur} last event time`).toBeCloseTo(end, 9);
        expect(last.value, `${key}@${dur} last event value`).toBeCloseTo(FLOOR, 9);
        expect(envelopeValueAt(events, end), `${key}@${dur} floor`).toBeCloseTo(FLOOR, 9);
        // Nothing is scheduled past the stop time, so the note cannot hang.
        for (const e of events) {
          expect(e.time, `${key}@${dur} event past note end`).toBeLessThanOrEqual(end + 1e-9);
        }
      }
    }
  });

  it("never schedules a non-positive exponential target on the amp envelope", () => {
    for (const [key, preset] of presetEntries) {
      for (const dur of [0.05, SHORT_NOTE, 0.5]) {
        for (const e of ampEnvelope(preset, dur)) {
          if (e.type !== "exponentialRampToValueAtTime") continue;
          expect(Number.isFinite(e.value), `${key}@${dur} finite target`).toBe(true);
          expect(e.value, `${key}@${dur} positive target`).toBeGreaterThan(0);
        }
      }
    }
  });
});
