/**
 * Music Theory Engine for Chord Progressions & Voicings
 * Handles scale degrees, chord qualities (triads, 7ths, power chords),
 * inversions, piano MIDI mapping, and guitar fretboard fingerings.
 */

export type ChordQuality = 
  // Power Chords
  | "5"
  // Triads (3和弦)
  | "maj"
  | "min"
  | "dim"
  | "aug"
  | "sus2"
  | "sus4"
  // 7th Chords (7和弦)
  | "maj7"
  | "min7"
  | "7"
  | "m7b5"
  | "dim7"
  | "mMaj7"
  // Extended Chords
  | "add9"
  | "maj9"
  | "min9"
  | "9"
  | "6"
  | "m6";

export type Inversion = 0 | 1 | 2 | 3;

export interface ChordDefinition {
  root: string;           // e.g. "C", "F#", "Bb"
  quality: ChordQuality;  // e.g. "maj", "min7", "5"
  inversion?: Inversion;  // 0 = root, 1 = 1st, 2 = 2nd
  duration?: number;      // in beats (default 4 = 1 bar)
  customName?: string;
}

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export const FLAT_TO_SHARP_MAP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

export function normalizeNote(note: string): string {
  const clean = note.trim();
  return FLAT_TO_SHARP_MAP[clean] || clean;
}

export function noteToMidi(note: string, octave = 4): number {
  const norm = normalizeNote(note);
  const idx = NOTE_NAMES.indexOf(norm as any);
  if (idx === -1) return 60; // fallback C4
  return 12 * (octave + 1) + idx;
}

export function midiToNoteName(midi: number): { note: string; octave: number } {
  const noteIdx = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { note: NOTE_NAMES[noteIdx], octave };
}

// Chord semitone interval formulas
export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  // Power chord: Root + Perfect 5th
  "5": [0, 7],
  
  // Triads (3和弦)
  "maj": [0, 4, 7],
  "min": [0, 3, 7],
  "dim": [0, 3, 6],
  "aug": [0, 4, 8],
  "sus2": [0, 2, 7],
  "sus4": [0, 5, 7],

  // 7th Chords (7和弦)
  "maj7": [0, 4, 7, 11],
  "min7": [0, 3, 7, 10],
  "7": [0, 4, 7, 10],
  "m7b5": [0, 3, 6, 10],
  "dim7": [0, 3, 6, 9],
  "mMaj7": [0, 3, 7, 11],

  // Extended & Color Chords
  "add9": [0, 4, 7, 14],
  "maj9": [0, 4, 7, 11, 14],
  "min9": [0, 3, 7, 10, 14],
  "9": [0, 4, 7, 10, 14],
  "6": [0, 4, 7, 9],
  "m6": [0, 3, 7, 9],
};

// Friendly display symbols for chord qualities
export const CHORD_QUALITY_META: Record<ChordQuality, {
  nameZh: string;
  nameEn: string;
  symbol: string;
  category: "power" | "triad" | "seventh" | "extended";
  descZh: string;
  descEn: string;
}> = {
  "5": {
    nameZh: "五和弦 (Power 和弦)",
    nameEn: "Power Chord (5th)",
    symbol: "5",
    category: "power",
    descZh: "仅由根音与五音组成，纯粹、有力、通透，摇滚与金属必备。",
    descEn: "Pure root and fifth without a third, raw and powerful for rock and metal."
  },
  "maj": {
    nameZh: "大三和弦",
    nameEn: "Major Triad",
    symbol: "",
    category: "triad",
    descZh: "明亮、稳定、开朗的基本三和弦。",
    descEn: "Bright, resolute, and uplifting foundational triad."
  },
  "min": {
    nameZh: "小三和弦",
    nameEn: "Minor Triad",
    symbol: "m",
    category: "triad",
    descZh: "柔和、忧郁、内省的情感三和弦。",
    descEn: "Somber, melancholic, and introspective triad."
  },
  "dim": {
    nameZh: "减三和弦",
    nameEn: "Diminished Triad",
    symbol: "dim",
    category: "triad",
    descZh: "紧张、收缩、不稳定，具强烈倾向性。",
    descEn: "Tense, unstable, with strong directional pull."
  },
  "aug": {
    nameZh: "增三和弦",
    nameEn: "Augmented Triad",
    symbol: "aug",
    category: "triad",
    descZh: "梦幻、扩张、悬疑感。",
    descEn: "Dreamy, expansive, and mysterious harmonic color."
  },
  "sus2": {
    nameZh: "挂二和弦",
    nameEn: "Suspended 2nd",
    symbol: "sus2",
    category: "triad",
    descZh: "空灵、微凉、通透的民谣与流行常用色彩。",
    descEn: "Open, ethereal sound replacing the third with a major second."
  },
  "sus4": {
    nameZh: "挂四和弦",
    nameEn: "Suspended 4th",
    symbol: "sus4",
    category: "triad",
    descZh: "期待感强烈的未解决张力，通常解决到大三和弦。",
    descEn: "Suspended tension longing to resolve down to the major third."
  },
  "maj7": {
    nameZh: "大七和弦",
    nameEn: "Major 7th",
    symbol: "maj7",
    category: "seventh",
    descZh: "温暖、浪漫、城市流行与爵士灵魂音色。",
    descEn: "Lush, romantic, and warm jazz/city-pop staple."
  },
  "min7": {
    nameZh: "小七和弦",
    nameEn: "Minor 7th",
    symbol: "m7",
    category: "seventh",
    descZh: "深邃、感伤且丝滑的 R&B / Neo-Soul 基石。",
    descEn: "Silky, soulful, and evocative foundation of modern R&B."
  },
  "7": {
    nameZh: "属七和弦",
    nameEn: "Dominant 7th",
    symbol: "7",
    category: "seventh",
    descZh: "布鲁斯狂放色彩与强烈解决倾向的核心和弦。",
    descEn: "Bluesy, energized tension commanding resolution."
  },
  "m7b5": {
    nameZh: "半减七和弦",
    nameEn: "Half-Diminished 7th",
    symbol: "m7b5",
    category: "seventh",
    descZh: "小调 ii-V-i 的黄金前导，宿命与深沉感。",
    descEn: "The essential ii chord in minor key 2-5-1 progressions."
  },
  "dim7": {
    nameZh: "减七和弦",
    nameEn: "Diminished 7th",
    symbol: "dim7",
    category: "seventh",
    descZh: "高度对称张力，古典与探戈戏剧性转折。",
    descEn: "Symmetrical tension creating sudden dramatic shifts."
  },
  "mMaj7": {
    nameZh: "小大七和弦",
    nameEn: "Minor Major 7th",
    symbol: "m(maj7)",
    category: "seventh",
    descZh: "007 谍战色彩、神秘莫测的黑夜和声。",
    descEn: "Noir, mysterious James Bond aesthetic."
  },
  "add9": {
    nameZh: "加九和弦",
    nameEn: "Add 9",
    symbol: "add9",
    category: "extended",
    descZh: "如阳光穿透森林般的清新明澈感。",
    descEn: "Shimmering, acoustic sheen popular in contemporary pop."
  },
  "maj9": {
    nameZh: "大九和弦",
    nameEn: "Major 9th",
    symbol: "maj9",
    category: "extended",
    descZh: "高级法式浪漫与奢华爵士质感。",
    descEn: "Opulent, sophisticated jazz and city-pop luxury."
  },
  "min9": {
    nameZh: "小九和弦",
    nameEn: "Minor 9th",
    symbol: "m9",
    category: "extended",
    descZh: "Neo-Soul / Lo-Fi 标志性醇厚和弦。",
    descEn: "Deep, velvety warmth powering Lo-Fi and Neo-Soul."
  },
  "9": {
    nameZh: "属九和弦",
    nameEn: "Dominant 9th",
    symbol: "9",
    category: "extended",
    descZh: "放克抓耳铜管律动的标志性伴奏色彩。",
    descEn: "Funky, groove-heavy color championed by James Brown."
  },
  "6": {
    nameZh: "大六和弦",
    nameEn: "Major 6th",
    symbol: "6",
    category: "extended",
    descZh: "摇摆乐与复古爵士的甜美恬淡终结音。",
    descEn: "Vintage swing and sweet nostalgic resolution."
  },
  "m6": {
    nameZh: "小六和弦",
    nameEn: "Minor 6th",
    symbol: "m6",
    category: "extended",
    descZh: "多利亚调式色彩，波萨诺瓦的经典音符。",
    descEn: "Bossa Nova and Dorian modal flavor with dark elegance."
  },
};

/**
 * Calculates all MIDI notes in a chord given root, quality, octave, and inversion.
 */
export function getChordMidiNotes(
  rootNote: string, 
  quality: ChordQuality, 
  octave = 4, 
  inversion: Inversion = 0,
  instrument: "piano" | "guitar" | "power-guitar" = "piano"
): number[] {
  const rootMidi = noteToMidi(rootNote, octave);
  const intervals = CHORD_INTERVALS[quality] || CHORD_INTERVALS["maj"];
  let notes = intervals.map(inter => rootMidi + inter);

  // Apply inversion
  if (inversion > 0 && notes.length > 1) {
    const invCount = Math.min(inversion, notes.length - 1);
    for (let i = 0; i < invCount; i++) {
      const lowNote = notes.shift()!;
      notes.push(lowNote + 12);
    }
  }

  // Instrument-specific voicing adjustment
  if (instrument === "power-guitar" || quality === "5") {
    // Power chords: double root at octave + 5th, deep bass register
    const baseRoot = noteToMidi(rootNote, 2); // E2-A2 range
    return [baseRoot, baseRoot + 7, baseRoot + 12];
  }

  if (instrument === "guitar") {
    // Return realistic 5-6 string guitar voicing
    return getGuitarVoicing(rootNote, quality, inversion);
  }

  // Piano: add deep root bass note on octave 2 or 3 for rich full sound
  const bassNote = notes[0] - 12;
  return [bassNote, ...notes];
}

/**
 * Generates realistic 6-string guitar fret positions (Standard Tuning: E2, A2, D3, G3, B3, E4)
 * Returns array of 6 numbers: fret number (0-15) or -1 if string is muted.
 */
export interface GuitarFretboardChord {
  frets: number[]; // String 6 (low E) to String 1 (high E)
  baseFret: number;
  fingerings?: number[];
  midiNotes: number[];
}

export const GUITAR_TUNING_MIDI = [40, 45, 50, 55, 59, 64]; // E2, A2, D3, G3, B3, E4

export function getGuitarFretboardChord(root: string, quality: ChordQuality): GuitarFretboardChord {
  const normRoot = normalizeNote(root);
  const rootIdx = NOTE_NAMES.indexOf(normRoot as any);

  // Preset standard open and barre chord shapes
  if (quality === "5") {
    // Power chord on 6th or 5th string
    if (rootIdx <= 5) {
      // 6th string root (E, F, F#, G, G#, A)
      const f = (rootIdx - 4 + 12) % 12; // E is 0
      return {
        frets: [f, f + 2, f + 2, -1, -1, -1],
        baseFret: Math.max(1, f),
        midiNotes: [40 + f, 45 + f + 2, 50 + f + 2],
      };
    } else {
      // 5th string root (A, A#, B, C, C#, D, D#)
      const f = (rootIdx - 9 + 12) % 12; // A is 0
      return {
        frets: [-1, f, f + 2, f + 2, -1, -1],
        baseFret: Math.max(1, f),
        midiNotes: [45 + f, 50 + f + 2, 55 + f + 2],
      };
    }
  }

  // Major / Minor standard Barre or Open shapes
  const isMin = quality.includes("min") || quality === "m7b5" || quality === "dim";
  const is7th = quality.includes("7") || quality === "9";

  // Check common open chords first
  if (normRoot === "C" && quality === "maj") {
    return { frets: [-1, 3, 2, 0, 1, 0], baseFret: 1, midiNotes: [48, 52, 55, 60, 64] };
  }
  if (normRoot === "A" && quality === "min") {
    return { frets: [-1, 0, 2, 2, 1, 0], baseFret: 1, midiNotes: [45, 52, 57, 60, 64] };
  }
  if (normRoot === "G" && quality === "maj") {
    return { frets: [3, 2, 0, 0, 0, 3], baseFret: 1, midiNotes: [43, 47, 50, 55, 59, 67] };
  }
  if (normRoot === "E" && quality === "min") {
    return { frets: [0, 2, 2, 0, 0, 0], baseFret: 1, midiNotes: [40, 47, 52, 55, 59, 64] };
  }
  if (normRoot === "D" && quality === "maj") {
    return { frets: [-1, -1, 0, 2, 3, 2], baseFret: 1, midiNotes: [50, 57, 62, 66] };
  }
  if (normRoot === "F" && quality === "maj") {
    return { frets: [1, 3, 3, 2, 1, 1], baseFret: 1, midiNotes: [41, 48, 53, 57, 60, 65] };
  }

  // E-Shape Barre chord (rooted on 6th string)
  const fret6 = (rootIdx - 4 + 12) % 12; // E string
  let fretsE: number[];
  if (isMin) {
    fretsE = is7th ? [fret6, fret6 + 2, fret6, fret6, fret6, fret6] : [fret6, fret6 + 2, fret6 + 2, fret6, fret6, fret6];
  } else {
    fretsE = is7th ? [fret6, fret6 + 2, fret6, fret6 + 1, fret6, fret6] : [fret6, fret6 + 2, fret6 + 2, fret6 + 1, fret6, fret6];
  }

  const midiNotes: number[] = [];
  fretsE.forEach((f, strIdx) => {
    if (f >= 0) midiNotes.push(GUITAR_TUNING_MIDI[strIdx] + f);
  });

  return {
    frets: fretsE,
    baseFret: Math.max(1, fret6),
    midiNotes,
  };
}

export function getGuitarVoicing(root: string, quality: ChordQuality, inversion = 0): number[] {
  const fretChord = getGuitarFretboardChord(root, quality);
  return fretChord.midiNotes;
}

/**
 * Roman Numeral Mapping Engine
 * Maps Roman numerals (I, ii, iii, IV, V, vi, vii°, bVI, bVII) to ChordDefinitions
 * in any specified Root Key and Mode.
 */
export interface ScaleDegreeMapping {
  numeral: string;
  degree: number; // 0-11 semitones from root
  defaultQuality: ChordQuality;
}

export const MAJOR_SCALE_DEGREES: ScaleDegreeMapping[] = [
  { numeral: "I",    degree: 0,  defaultQuality: "maj" },
  { numeral: "ii",   degree: 2,  defaultQuality: "min" },
  { numeral: "iii",  degree: 4,  defaultQuality: "min" },
  { numeral: "IV",   degree: 5,  defaultQuality: "maj" },
  { numeral: "V",    degree: 7,  defaultQuality: "maj" },
  { numeral: "vi",   degree: 9,  defaultQuality: "min" },
  { numeral: "vii°", degree: 11, defaultQuality: "dim" },
  // Borrowed chords
  { numeral: "bVII", degree: 10, defaultQuality: "maj" },
  { numeral: "bVI",  degree: 8,  defaultQuality: "maj" },
  { numeral: "bIII", degree: 3,  defaultQuality: "maj" },
  { numeral: "iv",   degree: 5,  defaultQuality: "min" },
  { numeral: "v",    degree: 7,  defaultQuality: "min" },
];

export const MINOR_SCALE_DEGREES: ScaleDegreeMapping[] = [
  { numeral: "i",    degree: 0,  defaultQuality: "min" },
  { numeral: "ii°",  degree: 2,  defaultQuality: "dim" },
  { numeral: "III",  degree: 3,  defaultQuality: "maj" },
  { numeral: "iv",   degree: 5,  defaultQuality: "min" },
  { numeral: "v",    degree: 7,  defaultQuality: "min" },
  { numeral: "V",    degree: 7,  defaultQuality: "maj" }, // Harmonic minor dominant
  { numeral: "VI",   degree: 8,  defaultQuality: "maj" },
  { numeral: "VII",  degree: 10, defaultQuality: "maj" },
  { numeral: "vii°", degree: 11, defaultQuality: "dim" },
];

export function romanToChord(
  numeral: string, 
  keyRoot = "C", 
  isMinorKey = false
): { root: string; quality: ChordQuality; displayName: string } {
  const normKey = normalizeNote(keyRoot);
  const keyIdx = NOTE_NAMES.indexOf(normKey as any);
  const scaleList = isMinorKey ? MINOR_SCALE_DEGREES : MAJOR_SCALE_DEGREES;

  // Strip 7, maj7, 5, etc. from numeral to find base degree
  let baseNumeral = numeral.replace(/(maj7|m7|7|5|add9|sus4|sus2|dim7|m7b5)/g, "");
  if (!baseNumeral) baseNumeral = numeral;

  // Exact-case first: the minor table carries **both** `v` (diatonic, minor) and `V` (the
  // harmonic-minor dominant, major). A case-insensitive lookup finds `v` first and makes the
  // dominant unreachable — the Andalusian cadence's `i–VII–VI–V` then played E minor where every
  // chart, and the card, says E major.
  const found = scaleList.find(d => d.numeral === baseNumeral)
    || scaleList.find(d => d.numeral.toLowerCase() === baseNumeral.toLowerCase())
    || MAJOR_SCALE_DEGREES[0];

  const chordRootIdx = (keyIdx + found.degree) % 12;
  const chordRoot = NOTE_NAMES[chordRootIdx];

  // Determine chord quality.
  //
  // The *case* of the numeral decides the chord family before the scale's diatonic default does:
  // `VI7` in C is the secondary dominant A7, not Amin7 — the diatonic default for degree 6 would
  // make it minor, which is a different chord and a different sound. Only a lowercase base
  // (`ii`, `vi`, `iv`) is minor; an uppercase one (`II`, `VI`, `III`) is major.
  let quality: ChordQuality = found.defaultQuality;
  const hasLetter = /[ivIV]/.test(baseNumeral);
  const baseIsLowercase = hasLetter && baseNumeral === baseNumeral.toLowerCase() && !baseNumeral.startsWith("b");
  if (hasLetter) {
    // The numeral's case is the chord family; the scale only supplies the default for a bare
    // degree. This is what makes borrowed/alterable numerals behave: `iv` in a major key is the
    // minor subdominant, `VI` in a major key (or `V` in a minor key) is major.
    if (!baseIsLowercase && found.defaultQuality === "min") quality = "maj";
    else if (baseIsLowercase && found.defaultQuality === "maj") quality = "min";
  }
  const isBaseMinor = baseIsLowercase || (!hasLetter && found.defaultQuality === "min");
  if (numeral.includes("maj7")) quality = "maj7";
  else if (numeral.includes("m7") || numeral.includes("min7") || (numeral.includes("7") && isBaseMinor)) quality = "min7";
  else if (numeral.includes("7")) quality = "7";
  else if (numeral.includes("5")) quality = "5";
  else if (numeral.includes("add9")) quality = "add9";
  else if (numeral.includes("sus4")) quality = "sus4";
  else if (numeral.includes("sus2")) quality = "sus2";
  else if (numeral.includes("dim")) quality = "dim";

  const symbol = CHORD_QUALITY_META[quality].symbol;
  const displayName = `${chordRoot}${symbol}`;

  return { root: chordRoot, quality, displayName };
}

export function formatChordName(root: string, quality: ChordQuality, inversion: Inversion = 0): string {
  const normRoot = normalizeNote(root);
  const symbol = CHORD_QUALITY_META[quality]?.symbol || "";
  let baseName = `${normRoot}${symbol}`;
  if (inversion > 0) {
    const intervals = CHORD_INTERVALS[quality];
    if (intervals && intervals.length > inversion) {
      const rootMidi = noteToMidi(normRoot);
      const bassMidi = rootMidi + intervals[inversion];
      const bassNote = midiToNoteName(bassMidi).note;
      baseName += `/${bassNote}`;
    }
  }
  return baseName;
}
