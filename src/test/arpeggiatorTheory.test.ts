import { describe, it, expect } from "vitest";
import {
  expandVoicingAcrossOctaves,
  buildArpeggioPattern,
  calculateStrumTiming,
  bakeProgressionToSequencer,
} from "../utils/arpeggiatorTheory";
import { ChordDefinition } from "../utils/chordTheory";

describe("Smart Arpeggiator & Strumming Theory Engine (P6-03)", () => {
  const cMajNotes = [60, 64, 67]; // C4, E4, G4

  it("expands voicing across multiple octaves correctly", () => {
    const singleOctave = expandVoicingAcrossOctaves(cMajNotes, 1);
    expect(singleOctave).toEqual([60, 64, 67]);

    const twoOctaves = expandVoicingAcrossOctaves(cMajNotes, 2);
    expect(twoOctaves).toEqual([60, 64, 67, 72, 76, 79]);
  });

  it("generates Up pattern", () => {
    const pattern = buildArpeggioPattern(cMajNotes, "up");
    expect(pattern).toEqual([60, 64, 67]);
  });

  it("generates Down pattern", () => {
    const pattern = buildArpeggioPattern(cMajNotes, "down");
    expect(pattern).toEqual([67, 64, 60]);
  });

  it("generates Up-Down pattern without duplicate peak/valley notes", () => {
    const notes = [60, 64, 67, 72];
    const pattern = buildArpeggioPattern(notes, "up_down");
    // Should be 60, 64, 67, 72, 67, 64
    expect(pattern).toEqual([60, 64, 67, 72, 67, 64]);
  });

  it("generates Converge pattern from outside-in", () => {
    const notes = [60, 64, 67, 72];
    const pattern = buildArpeggioPattern(notes, "converge");
    // [low0, high0, low1, high1] -> 60, 72, 64, 67
    expect(pattern).toEqual([60, 72, 64, 67]);
  });

  it("calculates Strumming timings with down and up stroke directions", () => {
    const downStrum = calculateStrumTiming(cMajNotes, "down", 30, 0);
    expect(downStrum.length).toBe(3);
    expect(downStrum[0].midi).toBe(60);
    expect(downStrum[0].delaySec).toBe(0);
    expect(downStrum[1].midi).toBe(64);
    expect(downStrum[1].delaySec).toBeCloseTo(0.03, 3);
    expect(downStrum[2].midi).toBe(67);
    expect(downStrum[2].delaySec).toBeCloseTo(0.06, 3);

    const upStrum = calculateStrumTiming(cMajNotes, "up", 30, 0);
    expect(upStrum[0].midi).toBe(67);
    expect(upStrum[1].midi).toBe(64);
    expect(upStrum[2].midi).toBe(60);
  });

  it("bakes a chord progression to a 16-step sequencer pattern", () => {
    const chords: ChordDefinition[] = [
      { root: "C", quality: "maj" },
      { root: "A", quality: "min" },
      { root: "F", quality: "maj" },
      { root: "G", quality: "maj" },
    ];

    const baked = bakeProgressionToSequencer({
      chords,
      arpConfig: { pattern: "up", rate: "1/16", octaves: 1, gate: 0.75 },
      totalSteps: 16,
      targetTrackId: "lead",
    });

    expect(baked.steps.length).toBe(16);
    expect(baked.pitches.length).toBe(16);
    expect(baked.totalHits).toBe(16); // 16 1/16th notes filled
    expect(baked.targetTrackId).toBe("lead");

    // All active steps should have a valid MIDI pitch
    for (let i = 0; i < 16; i++) {
      expect(baked.steps[i]).toBe(1);
      expect(typeof baked.pitches[i]).toBe("number");
      expect(baked.pitches[i]!).toBeGreaterThan(0);
      expect(baked.gates[i]).toBe(0.75);
    }
  });

  it("handles 1/8 note rate baking with step gaps", () => {
    const chords: ChordDefinition[] = [
      { root: "C", quality: "maj" },
      { root: "G", quality: "maj" },
    ];

    const baked = bakeProgressionToSequencer({
      chords,
      arpConfig: { pattern: "down", rate: "1/8" },
      totalSteps: 16,
    });

    // 1/8 note stepInterval = 2 -> 8 hits out of 16 steps
    expect(baked.totalHits).toBe(8);
    expect(baked.steps[0]).toBe(1);
    expect(baked.steps[1]).toBe(0);
    expect(baked.steps[2]).toBe(1);
    expect(baked.steps[3]).toBe(0);
  });
});
