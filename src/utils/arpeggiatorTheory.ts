/**
 * Smart Arpeggiator & Strumming Theory Engine (P6-03)
 * Supports:
 * - 5 classic arpeggio patterns: Up, Down, Up-Down, Random, Converge
 * - Multi-octave expansion (1-3 octaves)
 * - Strumming simulation (Down, Up, Alternate with micro-delays 10-80ms)
 * - 16/32-step sequencer baking (converting chord progressions into melodic synth/lead patterns)
 */

import { ChordDefinition, getChordMidiNotes, formatChordName } from "./chordTheory";

export type ArpPatternType = "up" | "down" | "up_down" | "random" | "converge";
export type ArpRate = "1/8" | "1/16" | "1/8T" | "1/16T";
export type StrumDirection = "down" | "up" | "alternate";

export interface ArpConfig {
  pattern: ArpPatternType;
  rate: ArpRate;
  octaves: number; // 1, 2, or 3
  gate: number;    // 0.2 to 1.0 (note duration ratio)
}

export interface StrumConfig {
  direction: StrumDirection;
  speedMs: number; // 10ms - 80ms
}

export const DEFAULT_ARP_CONFIG: ArpConfig = {
  pattern: "up_down",
  rate: "1/16",
  octaves: 2,
  gate: 0.8,
};

export const DEFAULT_STRUM_CONFIG: StrumConfig = {
  direction: "down",
  speedMs: 25,
};

export interface BakedArpeggioResult {
  steps: number[];
  pitches: (number | null)[];
  velocities: number[];
  gates: number[];
  targetTrackId: "lead" | "chords";
  totalHits: number;
}

/**
 * Expands a base chord voicing across multiple octaves
 */
export function expandVoicingAcrossOctaves(baseNotes: number[], octaves = 1): number[] {
  if (baseNotes.length === 0) return [];
  const unique = Array.from(new Set(baseNotes)).sort((a, b) => a - b);
  const result: number[] = [];

  for (let oct = 0; oct < octaves; oct++) {
    const shift = oct * 12;
    unique.forEach((midi) => {
      const shifted = midi + shift;
      if (shifted <= 108 && !result.includes(shifted)) {
        result.push(shifted);
      }
    });
  }

  return result.sort((a, b) => a - b);
}

/**
 * Builds an arpeggio sequence array from a set of notes according to pattern type
 */
export function buildArpeggioPattern(notes: number[], pattern: ArpPatternType): number[] {
  if (notes.length <= 1) return [...notes];

  const sortedAsc = [...notes].sort((a, b) => a - b);

  switch (pattern) {
    case "up":
      return sortedAsc;

    case "down":
      return [...sortedAsc].reverse();

    case "up_down": {
      // 1-2-3-4-3-2 (avoid repeating top and bottom notes)
      const descMiddle = sortedAsc.slice(1, -1).reverse();
      return [...sortedAsc, ...descMiddle];
    }

    case "converge": {
      // Outside-in: [low0, high0, low1, high1, ...]
      const result: number[] = [];
      let left = 0;
      let right = sortedAsc.length - 1;
      while (left <= right) {
        if (left === right) {
          result.push(sortedAsc[left]);
        } else {
          result.push(sortedAsc[left]);
          result.push(sortedAsc[right]);
        }
        left++;
        right--;
      }
      return result;
    }

    case "random": {
      // Seeded random walk through notes
      return [...sortedAsc];
    }

    default:
      return sortedAsc;
  }
}

/**
 * Calculates strumming delays and velocities for each note in a chord voicing
 */
export function calculateStrumTiming(
  notes: number[],
  direction: StrumDirection,
  speedMs: number,
  chordIndex = 0
): Array<{ midi: number; delaySec: number; velocityScale: number }> {
  if (notes.length === 0) return [];

  const actualDir =
    direction === "alternate"
      ? chordIndex % 2 === 0
        ? "down"
        : "up"
      : direction;

  const sorted = [...notes].sort((a, b) => a - b);
  const ordered = actualDir === "down" ? sorted : [...sorted].reverse();
  const stepDelaySec = Math.max(0.005, Math.min(0.1, speedMs / 1000));

  return ordered.map((midi, i) => {
    // Slight accentuation on initial string hit, natural decay/sweep across
    const velocityScale = 1.0 - (i / ordered.length) * 0.15;
    return {
      midi,
      delaySec: i * stepDelaySec,
      velocityScale,
    };
  });
}

/**
 * Bakes an array of chords into a 16 or 32 step sequencer pattern using the arpeggiator config
 */
export function bakeProgressionToSequencer(options: {
  chords: ChordDefinition[];
  arpConfig?: Partial<ArpConfig>;
  totalSteps?: number;
  targetTrackId?: "lead" | "chords";
  baseVelocity?: number;
}): BakedArpeggioResult {
  const {
    chords,
    arpConfig: userConfig,
    totalSteps = 16,
    targetTrackId = "lead",
    baseVelocity = 105,
  } = options;

  const config: ArpConfig = { ...DEFAULT_ARP_CONFIG, ...userConfig };

  const steps = Array(totalSteps).fill(0);
  const pitches: (number | null)[] = Array(totalSteps).fill(null);
  const velocities = Array(totalSteps).fill(0);
  const gates = Array(totalSteps).fill(config.gate);

  if (chords.length === 0) {
    return { steps, pitches, velocities, gates, targetTrackId, totalHits: 0 };
  }

  // Determine steps allocated per chord
  const chordCount = chords.length;
  const stepsPerChord = Math.max(1, Math.floor(totalSteps / chordCount));

  // Determine step jump based on rate
  // In a 16-step grid: 1/16 = 1 step per note; 1/8 = 2 steps per note; 1/8T = triplet feel
  const stepInterval = config.rate === "1/8" ? 2 : 1;

  let totalHits = 0;

  chords.forEach((chordDef, cIdx) => {
    const chordStartStep = cIdx * stepsPerChord;
    const chordEndStep = Math.min(totalSteps, (cIdx + 1) * stepsPerChord);

    // Get chord MIDI notes (without duplicate bass notes, starting around C4)
    const rawNotes = getChordMidiNotes(
      chordDef.root,
      chordDef.quality,
      4,
      chordDef.inversion || 0,
      "piano"
    );

    // Filter out deep bass root if piano voicing added it (keep voicing in melodious 48-84 register)
    const upperVoicing = rawNotes.filter((n) => n >= 48);
    const voicing = upperVoicing.length > 0 ? upperVoicing : rawNotes;

    // Expand across octaves
    const expanded = expandVoicingAcrossOctaves(voicing, config.octaves);

    // Build arpeggio sequence
    const arpSequence = buildArpeggioPattern(expanded, config.pattern);

    let patternIdx = 0;

    for (let s = chordStartStep; s < chordEndStep; s += stepInterval) {
      if (s >= totalSteps) break;

      let midi = arpSequence[patternIdx % arpSequence.length];

      if (config.pattern === "random") {
        // Controlled musical random choice
        const randIdx = Math.floor(Math.random() * expanded.length);
        midi = expanded[randIdx];
      }

      steps[s] = 1;
      pitches[s] = midi;

      // Dynamic accent: downbeats of chord are slightly punchier
      const isChordDownbeat = s === chordStartStep;
      velocities[s] = isChordDownbeat ? Math.min(127, baseVelocity + 15) : baseVelocity;
      gates[s] = config.gate;

      totalHits++;
      patternIdx++;
    }
  });

  return {
    steps,
    pitches,
    velocities,
    gates,
    targetTrackId,
    totalHits,
  };
}
