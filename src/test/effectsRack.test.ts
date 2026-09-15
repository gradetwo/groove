import { describe, it, expect, vi } from "vitest";
import {
  EffectsRack,
  DEFAULT_FX_STATE,
  makeSaturationCurve,
  makeBitcrushCurve,
} from "../audio/EffectsRack";

function createMockAudioContext() {
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

    if (type === "gain") {
      node.gain = createAudioParam(1.0);
    } else if (type === "biquadFilter") {
      node.type = "lowpass";
      node.frequency = createAudioParam(1000);
      node.Q = createAudioParam(1.0);
    } else if (type === "waveShaper") {
      node.curve = null;
      node.oversample = "none";
    } else if (type === "delay") {
      node.delayTime = createAudioParam(0.015);
    } else if (type === "oscillator") {
      node.type = "sine";
      node.frequency = createAudioParam(0.8);
    }

    return node;
  };

  const ctx: any = {
    currentTime: 0,
    sampleRate: 44100,
    createGain: vi.fn(() => createNode("gain")),
    createBiquadFilter: vi.fn(() => createNode("biquadFilter")),
    createWaveShaper: vi.fn(() => createNode("waveShaper")),
    createDelay: vi.fn(() => createNode("delay")),
    createOscillator: vi.fn(() => createNode("oscillator")),
  };

  return ctx;
}

describe("Master DSP Effects Rack (P5-04)", () => {
  describe("Mathematical Curve Generators", () => {
    it("generates bounded Tanh saturation curves within [-1.0, 1.0]", () => {
      const curve = makeSaturationCurve(2.5, 1024);
      expect(curve.length).toBe(1024);

      // Center should be zero (or near zero)
      expect(Math.abs(curve[512])).toBeLessThan(0.01);

      // Ends should be bounded within [-1.0, 1.0]
      expect(curve[0]).toBeGreaterThanOrEqual(-1.0001);
      expect(curve[curve.length - 1]).toBeLessThanOrEqual(1.0001);

      // Monotonically non-decreasing
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
      }
    });

    it("generates stepped quantization curves for Bitcrusher", () => {
      const curve4Bit = makeBitcrushCurve(4, 1024);
      const curve8Bit = makeBitcrushCurve(8, 1024);

      expect(curve4Bit.length).toBe(1024);
      expect(curve8Bit.length).toBe(1024);

      // Distinct value count for 4-bit should be significantly fewer than 8-bit
      const unique4Bit = new Set(Array.from(curve4Bit)).size;
      const unique8Bit = new Set(Array.from(curve8Bit)).size;
      expect(unique4Bit).toBeLessThan(unique8Bit);
      expect(unique4Bit).toBeLessThanOrEqual(33); // 2^4 + 1
    });

    it("resolves the requested bit depth in the Bitcrusher curve (D2)", () => {
      // round(x * stepCount) yields 2 * stepCount + 1 distinct output levels.
      // The old fixed 2048-point table could not resolve more than ~10 bits, so
      // the shipped 12-bit default and every higher depth were meaningless.
      const cases: Array<[number, number]> = [
        [3, 2 ** 3],   // floor of the supported range
        [4, 2 ** 4],
        [8, 2 ** 8],
        [12, 2 ** 12], // DEFAULT_FX_STATE.bitDepth
        [16, 2 ** 16], // ceiling of the supported range
      ];

      for (const [bits, stepCount] of cases) {
        const curve = makeBitcrushCurve(bits);
        expect(new Set(curve).size).toBe(2 * stepCount + 1);
        expect(curve[0]).toBe(-1);
        expect(curve[curve.length - 1]).toBe(1);
      }
    });

    it("sizes the Bitcrusher table from the bit depth (D2)", () => {
      const curve12 = makeBitcrushCurve(12);
      // High bit depths must not be collapsed into a coarser table than the
      // quantization they are supposed to represent.
      expect(curve12.length).toBeGreaterThan(2048);
      expect(curve12.length).toBeGreaterThanOrEqual(4 * 2 ** 12);
    });

    it("normalises saturation to unity small-signal gain (D3)", () => {
      const samples = 2048;
      const dx = 2 / samples; // table spacing
      const center = samples / 2;

      for (const drive of [1, 1.5, 3, 6]) {
        const curve = makeSaturationCurve(drive, samples);
        // Slope at x = 0, measured from the two entries straddling the centre.
        // The old tanh(k*x)/tanh(k) shape had a slope of k/tanh(k) here
        // (+4.39 dB at drive 1.5, +15.56 dB at drive 6).
        const slope = (curve[center + 1] - curve[center - 1]) / (2 * dx);
        expect(slope).toBeGreaterThan(0.99);
        expect(slope).toBeLessThan(1.01);

        let peak = 0;
        for (let i = 0; i < curve.length; i++) {
          peak = Math.max(peak, Math.abs(curve[i]));
        }
        expect(peak).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Rack Initialization & Parameter Control", () => {
    it("initializes with default bypassed state", () => {
      const ctx = createMockAudioContext();
      const rack = new EffectsRack(ctx);

      const state = rack.getState();
      expect(state.filterEnabled).toBe(DEFAULT_FX_STATE.filterEnabled);
      expect(state.saturationEnabled).toBe(DEFAULT_FX_STATE.saturationEnabled);
      expect(state.chorusEnabled).toBe(DEFAULT_FX_STATE.chorusEnabled);
      expect(state.bitcrusherEnabled).toBe(DEFAULT_FX_STATE.bitcrusherEnabled);
      expect(state.bitDepth).toBe(12);

      rack.destroy();
    });

    it("updates Filter parameters accurately", () => {
      const ctx = createMockAudioContext();
      const rack = new EffectsRack(ctx);

      rack.setFilter(true, 4500, 3.5, "highpass");
      const state = rack.getState();
      expect(state.filterEnabled).toBe(true);
      expect(state.filterCutoff).toBe(4500);
      expect(state.filterQ).toBe(3.5);
      expect(state.filterType).toBe("highpass");

      rack.destroy();
    });

    it("updates Saturation and Bitcrusher parameters without throwing", () => {
      const ctx = createMockAudioContext();
      const rack = new EffectsRack(ctx);

      rack.setSaturation(true, 3.2);
      expect(rack.getState().saturationEnabled).toBe(true);
      expect(rack.getState().saturationDrive).toBe(3.2);

      rack.setBitcrusher(true, 8);
      expect(rack.getState().bitcrusherEnabled).toBe(true);
      expect(rack.getState().bitDepth).toBe(8);

      rack.destroy();
    });

    it("updates Stereo Chorus mix and rate", () => {
      const ctx = createMockAudioContext();
      const rack = new EffectsRack(ctx);

      rack.setChorus(true, 0.6, 1.2);
      const state = rack.getState();
      expect(state.chorusEnabled).toBe(true);
      expect(state.chorusMix).toBe(0.6);
      expect(state.chorusRate).toBe(1.2);

      rack.destroy();
    });
  });
});
