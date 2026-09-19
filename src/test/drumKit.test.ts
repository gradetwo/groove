import { describe, it, expect, vi } from "vitest";
import {
  DrumKitType,
  synthesizeKick,
  synthesizeSnare,
  synthesizeHiHat,
  synthesizePercussion,
} from "../audio/DrumKitModels";

// Lightweight Web Audio API Mock for Node/Vitest
function createMockAudioContext() {
  const createdNodes: any[] = [];

  const createAudioParam = (initial = 0) => {
    return {
      value: initial,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
    };
  };

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
      node.gain = createAudioParam(0.0);
    } else if (type === "bufferSource") {
      node.buffer = null;
    }

    createdNodes.push(node);
    return node;
  };

  const ctx: any = {
    currentTime: 0.1,
    sampleRate: 44100,
    createOscillator: vi.fn(() => createNode("oscillator")),
    createGain: vi.fn(() => createNode("gain")),
    createBiquadFilter: vi.fn(() => createNode("biquadFilter")),
    createBufferSource: vi.fn(() => createNode("bufferSource")),
    createBuffer: vi.fn((channels, length, sampleRate) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      // `duration` is what the noise-offset assertion bounds against; without it a wrong
      // offset unit (samples vs seconds) cannot be detected at all.
      duration: length / sampleRate,
      getChannelData: vi.fn(() => new Float32Array(length)),
    })),
    destination: { _type: "destination" },
  };

  const mockNoiseBuffer = ctx.createBuffer(1, 44100, 44100);

  return { ctx, createdNodes, mockNoiseBuffer };
}

describe("Hardware Drum Machine Models (P5-02)", () => {
  const kits: DrumKitType[] = ["808", "909", "acoustic", "cyber"];

  kits.forEach((kit) => {
    describe(`Drum Kit Model: ${kit.toUpperCase()}`, () => {
      it(`synthesizes Kick drum for ${kit} without throwing and schedules sources`, () => {
        const { ctx, mockNoiseBuffer } = createMockAudioContext();
        const dest = ctx.createGain();

        const result = synthesizeKick(ctx, dest, 0.5, 0.9, 0, kit, mockNoiseBuffer);

        expect(result).toBeDefined();
        expect(result.sources.length).toBeGreaterThan(0);
        expect(result.gains.length).toBeGreaterThan(0);
        expect(result.stopTime).toBeGreaterThan(0.5);

        // Ensure all scheduled sources received start() and stop() calls.
        // E-06: noise layers now also pass a read offset, so this matches the schedule
        // time rather than the exact argument list — and additionally pins that any
        // offset passed is a valid buffer position, which the old assertion could not.
        result.sources.forEach((src) => {
          expect(src.start).toHaveBeenCalled();
          const call = (src.start as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
          expect(call[0]).toBe(0.5);
          if (call.length > 1) {
            const offset = call[1] as number;
            expect(Number.isFinite(offset)).toBe(true);
            expect(offset).toBeGreaterThanOrEqual(0);
            /**
             * The upper bound is the assertion that actually has teeth.
             *
             * `offset` is a buffer read position in **seconds**. The v2.0.47 regression had
             * `noiseStartOffset` returning *sample counts*, so offsets like 20492 were handed to
             * `start(when, offset)` — outside the buffer, which every browser clamps to the end,
             * i.e. silence. Hi-hats, percussion and the snare-wire layer were silent for a whole
             * release while this suite stayed green, because the old assertion only checked
             * `Number.isFinite(offset) && offset >= 0`. `noiseStartOffset` deliberately leaves
             * 0.5 s of tail after the offset, so offset + 0.5 s must still land inside the buffer.
             */
            expect(offset + 0.5).toBeLessThanOrEqual(mockNoiseBuffer.duration);
          }
          expect(src.stop).toHaveBeenCalled();
        });
      });

      it(`synthesizes Snare drum for ${kit} with tone and noise components`, () => {
        const { ctx, mockNoiseBuffer } = createMockAudioContext();
        const dest = ctx.createGain();

        const result = synthesizeSnare(ctx, dest, 0.5, 0.85, 0, kit, mockNoiseBuffer);

        expect(result).toBeDefined();
        expect(result.sources.length).toBeGreaterThan(0);
        expect(result.stopTime).toBeGreaterThan(0.5);
      });

      it(`synthesizes Hi-Hat (closed, open, triplet) for ${kit}`, () => {
        const { ctx, mockNoiseBuffer } = createMockAudioContext();
        const dest = ctx.createGain();

        // StepVal: 1 = closed, 2 = open, 3 = triplet
        [1, 2, 3].forEach((stepVal) => {
          const result = synthesizeHiHat(ctx, dest, 0.5, 0.8, 0, kit, stepVal, 0.125, 0.8, mockNoiseBuffer);
          expect(result).toBeDefined();
          expect(result.sources.length).toBeGreaterThan(0);
          expect(result.stopTime).toBeGreaterThan(0.5);
        });
      });

      it(`synthesizes Percussion for ${kit}`, () => {
        const { ctx, mockNoiseBuffer } = createMockAudioContext();
        const dest = ctx.createGain();

        const result = synthesizePercussion(ctx, dest, 0.5, 0.75, 0, kit, mockNoiseBuffer);

        expect(result).toBeDefined();
        expect(result.sources.length).toBeGreaterThan(0);
        expect(result.stopTime).toBeGreaterThan(0.5);
      });
    });
  });

  describe("808 Specific Circuit Modeling", () => {
    it("configures deep Bridged-T oscillator pitch sweep down to 42Hz", () => {
      const { ctx, createdNodes, mockNoiseBuffer } = createMockAudioContext();
      const dest = ctx.createGain();

      synthesizeKick(ctx, dest, 0.1, 1.0, 0, "808", mockNoiseBuffer);

      const osc = createdNodes.find((n) => n._type === "oscillator");
      expect(osc).toBeDefined();
      expect(osc.type).toBe("sine");
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(160, 0.1);
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(42, 0.38);
    });
  });

  describe("909 Specific Attack Transient & Punch", () => {
    it("features punchy attack sweep down to 48Hz", () => {
      const { ctx, createdNodes, mockNoiseBuffer } = createMockAudioContext();
      const dest = ctx.createGain();

      synthesizeKick(ctx, dest, 0.1, 1.0, 0, "909", mockNoiseBuffer);

      const osc = createdNodes.find((n) => n._type === "oscillator");
      expect(osc).toBeDefined();
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(260, 0.1);
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(48, expect.closeTo(0.15, 2));
    });
  });

  describe("Kick Design Presets & Custom Presets Integration (P-NEXT)", () => {
    it("synthesizes kick drum using built-in Kick Design presets", () => {
      const { ctx, mockNoiseBuffer } = createMockAudioContext();
      const dest = ctx.createGain();

      const presets = [
        "kick:berlin-orphic",
        "kick:detroit-mechanical",
        "kick:somatic-808-gravity",
        "kick:industrial-revolt",
        "kick:acoustic-beater-skin",
        "kick:neural-click-clock",
      ];

      presets.forEach((kit) => {
        const result = synthesizeKick(ctx, dest, 0.2, 0.9, 0, kit, mockNoiseBuffer);
        expect(result).toBeDefined();
        expect(result.sources.length).toBeGreaterThan(0);
        expect(result.stopTime).toBeGreaterThan(0.2);
      });
    });

    it("synthesizes snare, hihat, and percussion when a Kick Design preset is selected", () => {
      const { ctx, mockNoiseBuffer } = createMockAudioContext();
      const dest = ctx.createGain();

      const snareResult = synthesizeSnare(ctx, dest, 0.2, 0.8, 0, "kick:berlin-orphic", mockNoiseBuffer);
      expect(snareResult.sources.length).toBeGreaterThan(0);

      const hatResult = synthesizeHiHat(ctx, dest, 0.2, 0.8, 0, "kick:detroit-mechanical", 1, 0.125, 0.8, mockNoiseBuffer);
      expect(hatResult.sources.length).toBeGreaterThan(0);

      const percResult = synthesizePercussion(ctx, dest, 0.2, 0.8, 0, "kick:acoustic-beater-skin", mockNoiseBuffer);
      expect(percResult.sources.length).toBeGreaterThan(0);
    });
  });
});
