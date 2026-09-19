import { describe, it, expect } from "vitest";
import {
  isNoteInScale,
  quantizePitchToScale,
  quantizeTrackPitches,
  parseScaleString,
  normalizeRootNote,
  getScaleDegree,
  SCALES,
} from "../utils/scaleTheory";

describe("Scale Theory Engine (P6-02)", () => {
  describe("Root normalization and scale parsing", () => {
    it("normalizes flat notes to sharp notes", () => {
      expect(normalizeRootNote("Eb")).toBe("D#");
      expect(normalizeRootNote("Bb")).toBe("A#");
      expect(normalizeRootNote("Gb")).toBe("F#");
      expect(normalizeRootNote("C")).toBe("C");
    });

    it("parses diverse genre scale strings", () => {
      expect(parseScaleString("C minor")).toEqual({ root: "C", scaleId: "minor" });
      expect(parseScaleString("Eb major")).toEqual({ root: "D#", scaleId: "major" });
      expect(parseScaleString("A minor_pentatonic")).toEqual({ root: "A", scaleId: "minor_pentatonic" });
      expect(parseScaleString("F# Dorian")).toEqual({ root: "F#", scaleId: "dorian" });
      expect(parseScaleString("E blues")).toEqual({ root: "E", scaleId: "blues" });
      expect(parseScaleString("D Phrygian Dominant")).toEqual({ root: "D", scaleId: "phrygian_dominant" });
    });
  });

  describe("In-scale pitch validation", () => {
    it("validates C Natural Minor (C, D, D#, F, G, G#, A#)", () => {
      // C3 = 48, D3 = 50, D#3 = 51, F3 = 53, G3 = 55, G#3 = 56, A#3 = 58
      expect(isNoteInScale(48, "C", "minor")).toBe(true);  // C
      expect(isNoteInScale(50, "C", "minor")).toBe(true);  // D
      expect(isNoteInScale(51, "C", "minor")).toBe(true);  // D# (Eb)
      expect(isNoteInScale(52, "C", "minor")).toBe(false); // E (Major 3rd - OUT OF SCALE)
      expect(isNoteInScale(53, "C", "minor")).toBe(true);  // F
      expect(isNoteInScale(55, "C", "minor")).toBe(true);  // G
      expect(isNoteInScale(58, "C", "minor")).toBe(true);  // A# (Bb)
      expect(isNoteInScale(59, "C", "minor")).toBe(false); // B (Major 7th - OUT OF SCALE)
    });

    it("validates A Minor Pentatonic (A, C, D, E, G)", () => {
      // A3 = 57, C4 = 60, D4 = 62, E4 = 64, G4 = 67
      expect(isNoteInScale(57, "A", "minor_pentatonic")).toBe(true);
      expect(isNoteInScale(58, "A", "minor_pentatonic")).toBe(false); // A#
      expect(isNoteInScale(60, "A", "minor_pentatonic")).toBe(true);  // C
      expect(isNoteInScale(62, "A", "minor_pentatonic")).toBe(true);  // D
      expect(isNoteInScale(64, "A", "minor_pentatonic")).toBe(true);  // E
      expect(isNoteInScale(66, "A", "minor_pentatonic")).toBe(false); // F#
      expect(isNoteInScale(67, "A", "minor_pentatonic")).toBe(true);  // G
    });

    it("treats chromatic as always in-scale", () => {
      for (let note = 36; note <= 84; note++) {
        expect(isNoteInScale(note, "C", "chromatic")).toBe(true);
      }
    });
  });

  describe("Pitch quantization", () => {
    it("keeps already in-scale notes unchanged", () => {
      expect(quantizePitchToScale(48, "C", "minor")).toBe(48);
      expect(quantizePitchToScale(51, "C", "minor")).toBe(51);
    });

    it("quantizes out-of-scale E4 (64) to nearest in-scale note in C Minor", () => {
      // In C Minor, D#4=63, F4=65. E4=64 is equidistant; downward preference chooses 63 (D#4/Eb4)
      const quantized = quantizePitchToScale(64, "C", "minor");
      expect([63, 65]).toContain(quantized);
      expect(isNoteInScale(quantized, "C", "minor")).toBe(true);
    });

    it("quantizes an entire track's pitch array", () => {
      // 48 (C3, in), 49 (C#3, out), null, 52 (E3, out), 55 (G3, in)
      const raw = [48, 49, null, 52, 55];
      const result = quantizeTrackPitches(raw, "C", "minor");
      expect(result[0]).toBe(48);
      expect(isNoteInScale(result[1]!, "C", "minor")).toBe(true);
      expect(result[2]).toBeNull();
      expect(isNoteInScale(result[3]!, "C", "minor")).toBe(true);
      expect(result[4]).toBe(55);
    });
  });

  describe("Scale degree calculation", () => {
    it("returns R for root and correct degree labels", () => {
      expect(getScaleDegree(48, "C", "minor")).toBe("R");
      expect(getScaleDegree(51, "C", "minor")).toBe("b3");
      expect(getScaleDegree(55, "C", "minor")).toBe("5");
      expect(getScaleDegree(52, "C", "minor")).toBeNull(); // E is not in C minor
    });
  });
});
