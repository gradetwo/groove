import { describe, it, expect } from "vitest";
import { generateVariation } from "../audio/InspireMe";
import { DrumPattern } from "../types/genre";

describe("Inspire Me Controlled Variation (P4-06)", () => {
  const seedPattern: DrumPattern = {
    genre_id: "test",
    bpm: 124,
    swing: 10,
    scale: "minorPentatonic",
    tracks: [
      { name: "Kick", track_id: "kick", instrument: "kick", steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], velocity: Array(16).fill(100) },
      { name: "Snare", track_id: "snare", instrument: "snare", steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], velocity: Array(16).fill(100) },
      { name: "Hi-Hat", track_id: "hihat", instrument: "hihat", steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], velocity: Array(16).fill(80) },
      { name: "Perc", track_id: "percussion", instrument: "percussion", steps: Array(16).fill(0), velocity: Array(16).fill(80) },
      { name: "Bass", track_id: "bass", instrument: "synth", steps: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0], pitch: Array(16).fill(36), velocity: Array(16).fill(90) },
    ],
  };

  it("preserves Kick anchor downbeats while mutating", () => {
    const variation = generateVariation(seedPattern, { intensity: "medium", preserveKick: true });

    // Steps 0, 4, 8, 12 of kick should remain intact
    expect(variation.tracks[0].steps[0]).toBe(1);
    expect(variation.tracks[0].steps[4]).toBe(1);
    expect(variation.tracks[0].steps[8]).toBe(1);
    expect(variation.tracks[0].steps[12]).toBe(1);
  });

  it("adds musical hat ratchets or accents without breaking structure", () => {
    const variation = generateVariation(seedPattern, { intensity: "wild", addRatchets: true });
    const hatTrack = variation.tracks[2];

    expect(hatTrack.steps.length).toBe(16);
    expect(hatTrack.ratchet).toBeDefined();
    // Ratchets should be valid numbers >= 1
    hatTrack.ratchet?.forEach((r: number) => {
      expect(r).toBeGreaterThanOrEqual(1);
    });
  });

  it("mutates bassline pitches strictly within defined scale intervals", () => {
    const variation = generateVariation(seedPattern, { intensity: "wild", mutateMelodic: true });
    const bassTrack = variation.tracks[4];

    // Minor pentatonic intervals from root 36 (C2): 36, 39, 41, 43, 46
    const allowedNotes = new Set([36, 39, 41, 43, 46]);
    bassTrack.steps.forEach((step: number, s: number) => {
      if (step === 1 && bassTrack.pitch) {
        expect(allowedNotes.has(bassTrack.pitch[s] as number)).toBe(true);
      }
    });
  });
});
