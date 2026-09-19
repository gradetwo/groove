/**
 * Music Theory Scale Engine for Scale-Locked Sequencer Matrix (P6-02)
 *
 * Supports:
 * - 12-Tone Chromatic, Natural Major & Minor, Minor/Major Pentatonic,
 *   Blues, Dorian, Phrygian Dominant, Harmonic Minor, Hirajoshi, Mixolydian.
 * - String parsing (e.g. "C minor", "F# dorian", "Eb major").
 * - In-scale pitch validation, nearest-pitch quantization, and scale degree calculation.
 */

export interface ScaleDefinition {
  id: string;
  name: { zh: string; en: string };
  intervals: number[]; // semitone offsets from root (e.g. [0, 2, 4, 5, 7, 9, 11])
  degreeLabels: string[]; // degree symbols (e.g. ["1", "2", "3", "4", "5", "6", "7"])
  desc: { zh: string; en: string };
}

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type NoteName = typeof NOTE_NAMES[number];

export const FLAT_TO_SHARP: Record<string, NoteName> = {
  "Db": "C#",
  "Eb": "D#",
  "Gb": "F#",
  "Ab": "G#",
  "Bb": "A#",
  "C": "C", "D": "D", "E": "E", "F": "F", "G": "G", "A": "A", "B": "B",
  "C#": "C#", "D#": "D#", "F#": "F#", "G#": "G#", "A#": "A#",
};

export const SCALES: Record<string, ScaleDefinition> = {
  chromatic: {
    id: "chromatic",
    name: { zh: "半音阶 (全部音符)", en: "Chromatic (All Notes)" },
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    degreeLabels: ["1", "#1", "2", "#2", "3", "4", "#4", "5", "#5", "6", "#6", "7"],
    desc: { zh: "自由使用全部 12 个半音，无任何音高限制", en: "Full 12-semitone chromatic scale without restrictions" },
  },
  minor_pentatonic: {
    id: "minor_pentatonic",
    name: { zh: "小调五声", en: "Minor Pentatonic" },
    intervals: [0, 3, 5, 7, 10],
    degreeLabels: ["1", "b3", "4", "5", "b7"],
    desc: { zh: "最不易走音的即兴音阶，广泛用于摇滚、布鲁斯与电子", en: "Virtually zero chance of wrong notes, foundational for Rock, Blues & EDM" },
  },
  minor: {
    id: "minor",
    name: { zh: "自然小调 (Aeolian)", en: "Natural Minor (Aeolian)" },
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degreeLabels: ["1", "2", "b3", "4", "5", "b6", "b7"],
    desc: { zh: "深沉、忧郁、戏剧性，电子舞曲与流行音乐的标准基石", en: "Emotional, moody and dramatic, the bedrock of Electronic & Pop" },
  },
  major: {
    id: "major",
    name: { zh: "自然大调 (Ionian)", en: "Natural Major (Ionian)" },
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degreeLabels: ["1", "2", "3", "4", "5", "6", "7"],
    desc: { zh: "明亮、开阔、积极，适用于流行、放克与大调律动", en: "Bright, uplifting, and clear, ideal for Pop, Funk & House anthems" },
  },
  major_pentatonic: {
    id: "major_pentatonic",
    name: { zh: "大调五声", en: "Major Pentatonic" },
    intervals: [0, 2, 4, 7, 9],
    degreeLabels: ["1", "2", "3", "5", "6"],
    desc: { zh: "温润通透，极富歌唱性，常见于民谣、乡村与温暖放克", en: "Soulful, warm and melodic, widely used in Gospel, R&B and Soul" },
  },
  blues: {
    id: "blues",
    name: { zh: "布鲁斯音阶", en: "Blues Scale" },
    intervals: [0, 3, 5, 6, 7, 10],
    degreeLabels: ["1", "b3", "4", "b5", "5", "b7"],
    desc: { zh: "加入灵魂蓝音 (b5 蓝调音)，带来浓厚根源与撕裂张力", en: "Features the iconic blue note (b5) for earthy soul and grit" },
  },
  dorian: {
    id: "dorian",
    name: { zh: "多利亚调式 (Dorian)", en: "Dorian Mode" },
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degreeLabels: ["1", "2", "b3", "4", "5", "6", "b7"],
    desc: { zh: "略带爵士光泽的小调，升6度赋予其不落俗套的摩登感", en: "Jazzy minor mode with natural 6th, defining Disco, Funk & French House" },
  },
  phrygian_dominant: {
    id: "phrygian_dominant",
    name: { zh: "弗里吉亚属调式", en: "Phrygian Dominant" },
    intervals: [0, 1, 4, 5, 7, 8, 10],
    degreeLabels: ["1", "b2", "3", "4", "5", "b6", "b7"],
    desc: { zh: "西班牙/中东异域色彩，广泛用于 Psytrance、重金属与电影原声", en: "Exotic Spanish/Middle-Eastern flavor, staple of Psytrance & Heavy Metal" },
  },
  harmonic_minor: {
    id: "harmonic_minor",
    name: { zh: "和声小调", en: "Harmonic Minor" },
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degreeLabels: ["1", "2", "b3", "4", "5", "b6", "7"],
    desc: { zh: "大7度带来强烈古典哥特与新古典神秘张力", en: "Raised 7th delivers classical tension and gothic neoclassical elegance" },
  },
  hirajoshi: {
    id: "hirajoshi",
    name: { zh: "平调子 (Hirajoshi)", en: "Hirajoshi" },
    intervals: [0, 2, 3, 7, 8],
    degreeLabels: ["1", "2", "b3", "5", "b6"],
    desc: { zh: "传统日本琴韵五声，神秘禅意，常用于 Cyberpunk 与 Ambient", en: "Traditional Japanese pentatonic scale, evoking cinematic cyber/ambient tension" },
  },
  mixolydian: {
    id: "mixolydian",
    name: { zh: "混合多利亚 (Mixolydian)", en: "Mixolydian Mode" },
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degreeLabels: ["1", "2", "3", "4", "5", "6", "b7"],
    desc: { zh: "属7音大调，经典摇滚、放克与电子即兴的标配", en: "Major mode with dominant 7th, beloved in Classic Rock & Funk" },
  },
};

/**
 * Normalize input note string to standard sharp note name
 */
export function normalizeRootNote(note: string): NoteName {
  const clean = note.trim();
  return FLAT_TO_SHARP[clean] || "C";
}

/**
 * Parse human scale strings like "C minor", "F# dorian", "G major", "A# minor_pentatonic"
 */
export function parseScaleString(scaleStr?: string): { root: NoteName; scaleId: string } {
  if (!scaleStr) return { root: "C", scaleId: "minor" };
  const trimmed = scaleStr.trim();
  const parts = trimmed.split(/[\s_]+/);
  if (parts.length === 0) return { root: "C", scaleId: "minor" };

  const rawRoot = parts[0];
  const root = normalizeRootNote(rawRoot);

  const rawScale = parts.slice(1).join("_").toLowerCase();
  if (!rawScale) return { root, scaleId: "minor" };

  if (rawScale.includes("pentatonic")) {
    if (rawScale.includes("maj")) return { root, scaleId: "major_pentatonic" };
    return { root, scaleId: "minor_pentatonic" };
  }
  if (rawScale.includes("blues")) return { root, scaleId: "blues" };
  if (rawScale.includes("dorian")) return { root, scaleId: "dorian" };
  if (rawScale.includes("phrygian")) return { root, scaleId: "phrygian_dominant" };
  if (rawScale.includes("harmonic")) return { root, scaleId: "harmonic_minor" };
  if (rawScale.includes("hirajoshi")) return { root, scaleId: "hirajoshi" };
  if (rawScale.includes("mixo")) return { root, scaleId: "mixolydian" };
  if (rawScale.includes("chrom")) return { root, scaleId: "chromatic" };
  if (rawScale.includes("maj")) return { root, scaleId: "major" };
  if (rawScale.includes("min")) return { root, scaleId: "minor" };

  return { root, scaleId: "minor" };
}

/**
 * Check if a given MIDI note is in the specified scale
 */
export function isNoteInScale(midiNote: number, rootNote: NoteName, scaleId: string): boolean {
  if (midiNote <= 0) return false;
  const scale = SCALES[scaleId] || SCALES.minor;
  if (scale.id === "chromatic") return true;

  const rootMidiOffset = NOTE_NAMES.indexOf(rootNote);
  const notePitchClass = midiNote % 12;
  const relInterval = (notePitchClass - rootMidiOffset + 12) % 12;
  return scale.intervals.includes(relInterval);
}

/**
 * Get scale degree label for a note (e.g. "R", "b3", "5") or null if out of scale
 */
export function getScaleDegree(midiNote: number, rootNote: NoteName, scaleId: string): string | null {
  if (midiNote <= 0) return null;
  const scale = SCALES[scaleId] || SCALES.minor;
  const rootMidiOffset = NOTE_NAMES.indexOf(rootNote);
  const notePitchClass = midiNote % 12;
  const relInterval = (notePitchClass - rootMidiOffset + 12) % 12;
  const idx = scale.intervals.indexOf(relInterval);
  if (idx === -1) return null;
  if (idx === 0) return "R";
  return scale.degreeLabels[idx] || `${idx + 1}`;
}

/**
 * Quantize an out-of-scale MIDI note to the nearest in-scale note
 */
export function quantizePitchToScale(midiNote: number, rootNote: NoteName, scaleId: string): number {
  if (midiNote <= 0) return midiNote;
  const scale = SCALES[scaleId] || SCALES.minor;
  if (scale.id === "chromatic") return midiNote;

  if (isNoteInScale(midiNote, rootNote, scaleId)) {
    return midiNote;
  }

  // Search nearest in-scale note within +/- 6 semitones
  for (let offset = 1; offset <= 6; offset++) {
    // Prefer downward step first for natural minor resolution, then upward
    const down = midiNote - offset;
    if (isNoteInScale(down, rootNote, scaleId)) return down;
    const up = midiNote + offset;
    if (isNoteInScale(up, rootNote, scaleId)) return up;
  }

  return midiNote;
}

/**
 * Quantize an array of pitch steps to the selected scale
 */
export function quantizeTrackPitches(
  pitches: (number | null | undefined)[],
  rootNote: NoteName,
  scaleId: string
): (number | null)[] {
  return pitches.map((p) => {
    if (p === null || p === undefined || p <= 0) return p ?? null;
    return quantizePitchToScale(p, rootNote, scaleId);
  });
}
