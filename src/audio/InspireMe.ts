/**
 * Inspire Me: Controlled Generative Groove Variation (P4-06)
 * Generates genre-aware musical mutations while preserving anchor rhythms:
 * - Keeps Kick downbeat anchors intact
 * - Varies Hi-Hats with ghost notes, ratchets, and off-beat accents
 * - Adds syncopated percussion variations
 * - Mutates melodic bass/lead pitches within musical scales
 */

import { DrumPattern, Track } from "../types/genre";

export type MutationIntensity = "subtle" | "medium" | "wild";

export interface InspireMeOptions {
  intensity?: MutationIntensity;
  preserveKick?: boolean;
  mutateMelodic?: boolean;
  mutatePercussion?: boolean;
  addRatchets?: boolean;
}

// Common musical scale intervals (semitones from root)
const SCALES: Record<string, number[]> = {
  minorPentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  blues: [0, 3, 5, 6, 7, 10],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cloneTrack(t: Track): Track {
  return {
    ...t,
    steps: [...t.steps],
    velocity: t.velocity ? [...t.velocity] : undefined,
    pitch: t.pitch ? [...t.pitch] : undefined,
    ratchet: t.ratchet ? [...t.ratchet] : undefined,
    probability: t.probability ? [...t.probability] : undefined,
  };
}

/**
 * Mutates a pattern musically based on intensity
 */
export function generateVariation(
  sourcePattern: DrumPattern,
  options: InspireMeOptions = {}
): DrumPattern {
  const intensity = options.intensity || "medium";
  const preserveKick = options.preserveKick !== false;
  const mutateMelodic = options.mutateMelodic !== false;
  const mutatePercussion = options.mutatePercussion !== false;
  const addRatchets = options.addRatchets !== false;

  const totalSteps = sourcePattern.totalSteps || 16;
  const newTracks: Track[] = sourcePattern.tracks.map(cloneTrack);

  // Intensity factor: probability threshold
  const probThreshold = intensity === "subtle" ? 0.25 : intensity === "medium" ? 0.5 : 0.8;

  newTracks.forEach((track, trackIdx) => {
    const isKick = trackIdx === 0 || track.instrument === "kick" || /kick/i.test(track.name);
    const isSnare = trackIdx === 1 || track.instrument === "snare" || /snare|clap/i.test(track.name);
    const isHiHat = trackIdx === 2 || track.instrument === "hihat" || /hat/i.test(track.name);
    const isPerc = trackIdx === 3 || track.instrument === "percussion" || /perc/i.test(track.name);
    const isMelodic = trackIdx >= 4;

    // 1. Kick Track: preserve downbeats (steps 0, 4, 8, 12 in 16-step)
    if (isKick) {
      if (!preserveKick || intensity === "wild") {
        for (let s = 0; s < totalSteps; s++) {
          const isDownbeat = s % 4 === 0;
          if (!isDownbeat && Math.random() < probThreshold * 0.3) {
            // Add subtle syncopated ghost kick
            track.steps[s] = track.steps[s] ? 0 : 1;
            if (track.velocity) track.velocity[s] = Math.floor(70 + Math.random() * 25);
          }
        }
      }
      return;
    }

    // 2. Snare / Clap: preserve core backbeat (steps 4, 12), add ghost notes
    if (isSnare) {
      for (let s = 0; s < totalSteps; s++) {
        const isBackbeat = s % 8 === 4;
        if (isBackbeat) {
          // Keep backbeat solid
          track.steps[s] = 1;
          if (track.velocity) track.velocity[s] = 110;
        } else if (mutatePercussion && Math.random() < probThreshold * 0.35) {
          // Ghost snare
          const isGhost = Math.random() < 0.5;
          track.steps[s] = isGhost ? 1 : 0;
          if (track.velocity && isGhost) {
            track.velocity[s] = Math.floor(50 + Math.random() * 30);
          }
        }
      }
      return;
    }

    // 3. Hi-Hat: ratchets, off-beats, and dynamic velocities
    if (isHiHat && mutatePercussion) {
      if (!track.ratchet) track.ratchet = new Array(totalSteps).fill(1);
      for (let s = 0; s < totalSteps; s++) {
        // Off-beat accents on odd 8ths (e.g. 2, 6, 10, 14)
        const isOffbeat = s % 4 === 2;
        if (isOffbeat && Math.random() < 0.7) {
          track.steps[s] = 1;
          if (track.velocity) track.velocity[s] = Math.min(127, Math.floor(100 + Math.random() * 20));
        } else if (Math.random() < probThreshold * 0.4) {
          track.steps[s] = track.steps[s] === 1 ? (Math.random() < 0.3 ? 0 : 1) : (Math.random() < 0.4 ? 1 : 0);
          if (track.velocity && track.steps[s] === 1) {
            track.velocity[s] = Math.floor(60 + Math.random() * 40);
          }
        }

        // Add ratchets on turnaround steps (step 14 or 15)
        if (addRatchets && (s === totalSteps - 2 || s === totalSteps - 1)) {
          if (Math.random() < probThreshold * 0.7) {
            track.steps[s] = 1;
            track.ratchet[s] = pickRandom([2, 3, 4]);
          }
        }
      }
      return;
    }

    // 4. Percussion: syncopated groove shifts
    if (isPerc && mutatePercussion) {
      for (let s = 0; s < totalSteps; s++) {
        if (Math.random() < probThreshold * 0.4) {
          track.steps[s] = Math.random() < 0.4 ? 1 : 0;
          if (track.velocity && track.steps[s] === 1) {
            track.velocity[s] = Math.floor(70 + Math.random() * 35);
          }
        }
      }
      return;
    }

    // 5. Melodic Tracks (Bass / Lead / Chords): mutate pitches within musical scale
    if (isMelodic && mutateMelodic) {
      const scaleName = sourcePattern.scale || "minorPentatonic";
      const intervals = SCALES[scaleName] || SCALES.minorPentatonic;
      const baseOctave = trackIdx === 4 ? 36 : trackIdx === 5 ? 48 : 60;

      if (!track.pitch) {
        track.pitch = new Array(totalSteps).fill(baseOctave);
      }

      for (let s = 0; s < totalSteps; s++) {
        if (track.steps[s] === 1) {
          const isDownbeat = s % 8 === 0;
          if (isDownbeat) {
            // Keep root note on main downbeat for stability
            track.pitch[s] = baseOctave;
          } else if (Math.random() < probThreshold * 0.6) {
            // Select a scale degree
            const degree = pickRandom(intervals);
            track.pitch[s] = baseOctave + degree;
          }
        } else if (Math.random() < probThreshold * 0.25) {
          // Fill in an empty step
          track.steps[s] = 1;
          const degree = pickRandom(intervals);
          track.pitch[s] = baseOctave + degree;
          if (track.velocity) {
            track.velocity[s] = Math.floor(75 + Math.random() * 30);
          }
        }
      }
    }
  });

  return {
    ...sourcePattern,
    tracks: newTracks,
  };
}
