import { describe, it, expect } from "vitest";
import {
  calculatePhaseCorrelation,
  calculateStereoWidth,
  frequencyToX,
  xToFrequency,
  frequencyToNoteName,
  getFrequencyBandInfo,
  findZeroCrossing,
  FREQUENCY_BANDS,
} from "../utils/audioAnalysis";

describe("Acoustic & DSP Audio Analysis (P6-05)", () => {
  describe("Phase Correlation Coefficient", () => {
    it("returns +1.0 for identical mono signals (Float32Array)", () => {
      const left = new Float32Array([0.1, 0.5, 0.8, -0.4, -0.9, 0.2]);
      const right = new Float32Array([0.1, 0.5, 0.8, -0.4, -0.9, 0.2]);
      const r = calculatePhaseCorrelation(left, right);
      expect(r).toBeCloseTo(1.0, 4);
    });

    it("returns +1.0 for identical mono signals (Uint8Array)", () => {
      const left = new Uint8Array([128, 180, 240, 60, 20, 150]);
      const right = new Uint8Array([128, 180, 240, 60, 20, 150]);
      const r = calculatePhaseCorrelation(left, right);
      expect(r).toBeCloseTo(1.0, 4);
    });

    it("returns -1.0 for 180-degree anti-phase inverted signals", () => {
      const left = new Float32Array([0.2, 0.7, -0.5, -0.8, 0.3]);
      const right = new Float32Array([-0.2, -0.7, 0.5, 0.8, -0.3]);
      const r = calculatePhaseCorrelation(left, right);
      expect(r).toBeCloseTo(-1.0, 4);
    });

    it("returns near 0.0 for orthogonal uncorrelated signals", () => {
      // 90-degree phase shift sine vs cosine
      const n = 100;
      const left = new Float32Array(n);
      const right = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const theta = (i / n) * Math.PI * 4;
        left[i] = Math.sin(theta);
        right[i] = Math.cos(theta);
      }
      const r = calculatePhaseCorrelation(left, right);
      expect(Math.abs(r)).toBeLessThan(0.05);
    });

    it("handles silence safely without NaN", () => {
      const silence = new Float32Array(64);
      const r = calculatePhaseCorrelation(silence, silence);
      expect(r).toBe(1.0);
    });
  });

  describe("Stereo Width & Balance Calculation", () => {
    it("reports 0% stereo width for pure mono signal", () => {
      const left = new Float32Array([0.5, 0.2, -0.3, 0.4]);
      const right = new Float32Array([0.5, 0.2, -0.3, 0.4]);
      const { width, balance } = calculateStereoWidth(left, right);
      expect(width).toBe(0);
      expect(balance).toBe(0);
    });

    it("reports wide stereo width and right balance when right is louder", () => {
      const left = new Float32Array([0.1, -0.1, 0.05, -0.05]);
      const right = new Float32Array([0.8, -0.8, 0.7, -0.7]);
      const { width, balance } = calculateStereoWidth(left, right);
      expect(width).toBeGreaterThan(30);
      expect(balance).toBeGreaterThan(0.5);
    });
  });

  describe("Logarithmic Frequency Mapping", () => {
    it("maps 20Hz to 0 and 20000Hz to width", () => {
      const width = 1000;
      expect(frequencyToX(20, 20, 20000, width)).toBe(0);
      expect(frequencyToX(20000, 20, 20000, width)).toBe(width);
    });

    it("maps 1000Hz to logarithmic center-right", () => {
      const width = 1000;
      const x1k = frequencyToX(1000, 20, 20000, width);
      expect(x1k).toBeGreaterThan(width * 0.4);
      expect(x1k).toBeLessThan(width * 0.7);
    });

    it("reverses coordinate back to frequency accurately", () => {
      const width = 800;
      const testFreqs = [50, 120, 440, 1500, 5000, 12000];
      for (const f of testFreqs) {
        const x = frequencyToX(f, 20, 20000, width);
        const recovered = xToFrequency(x, 20, 20000, width);
        expect(recovered).toBeCloseTo(f, 0);
      }
    });
  });

  describe("Frequency to Note Name & Pitch Detection", () => {
    it("correctly identifies A4 = 440Hz", () => {
      const res = frequencyToNoteName(440);
      expect(res.note).toBe("A");
      expect(res.octave).toBe(4);
      expect(Math.abs(res.cents)).toBeLessThanOrEqual(1);
    });

    it("correctly identifies C1 ~ 32.7Hz sub bass", () => {
      const res = frequencyToNoteName(32.703);
      expect(res.note).toBe("C");
      expect(res.octave).toBe(1);
    });

    it("correctly identifies C5 ~ 523.25Hz", () => {
      const res = frequencyToNoteName(523.25);
      expect(res.note).toBe("C");
      expect(res.octave).toBe(5);
    });
  });

  describe("Frequency Bands Classification", () => {
    it("contains 7 standard production frequency bands", () => {
      expect(FREQUENCY_BANDS.length).toBe(7);
    });

    it("classifies 45Hz as sub-bass", () => {
      const band = getFrequencyBandInfo(45);
      expect(band.bandId).toBe("sub_bass");
    });

    it("classifies 120Hz as bass", () => {
      const band = getFrequencyBandInfo(120);
      expect(band.bandId).toBe("bass");
    });

    it("classifies 1000Hz as mid", () => {
      const band = getFrequencyBandInfo(1000);
      expect(band.bandId).toBe("mid");
    });

    it("classifies 10000Hz as air", () => {
      const band = getFrequencyBandInfo(10000);
      expect(band.bandId).toBe("air");
    });
  });

  describe("Zero-Crossing Waveform Synchronization", () => {
    it("detects upward zero-crossing point in float buffer", () => {
      const buf = new Float32Array([-0.5, -0.3, -0.1, 0.2, 0.6, 0.4]);
      const idx = findZeroCrossing(buf);
      expect(idx).toBe(3);
    });

    it("detects upward zero-crossing in byte buffer (128 centered)", () => {
      const buf = new Uint8Array([80, 100, 120, 140, 180, 150]);
      const idx = findZeroCrossing(buf);
      expect(idx).toBe(3);
    });
  });
});
