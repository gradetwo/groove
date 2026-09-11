import { describe, it, expect } from "vitest";
import { 
  getChordMidiNotes, 
  romanToChord, 
  formatChordName, 
  getGuitarFretboardChord,
  CHORD_INTERVALS 
} from "../utils/chordTheory";
import { POPULAR_PROGRESSIONS } from "../data/popularProgressions";

describe("Chord Theory & Progression Engine", () => {
  it("should calculate correct MIDI notes for major, minor, power, and 7th chords", () => {
    // C major triad: C4 (60), E4 (64), G4 (67) + bass C3 (48)
    const cMaj = getChordMidiNotes("C", "maj", 4, 0, "piano");
    expect(cMaj).toContain(60);
    expect(cMaj).toContain(64);
    expect(cMaj).toContain(67);

    // A minor triad: A4 (69), C5 (72), E5 (76)
    const aMin = getChordMidiNotes("A", "min", 4, 0, "piano");
    expect(aMin).toContain(69);
    expect(aMin).toContain(72);
    expect(aMin).toContain(76);

    // C5 Power Chord: Root + 5th + octave
    const c5 = getChordMidiNotes("C", "5", 4, 0, "power-guitar");
    expect(c5.length).toBe(3);
    expect(c5[1] - c5[0]).toBe(7); // Perfect fifth interval
    expect(c5[2] - c5[0]).toBe(12); // Octave interval

    // G7 Dominant 7th: Root + Major 3rd + Perfect 5th + Minor 7th
    const g7 = getChordMidiNotes("G", "7", 4, 0, "piano");
    expect(g7).toContain(67); // G4
    expect(g7).toContain(71); // B4
    expect(g7).toContain(74); // D5
    expect(g7).toContain(77); // F5
  });

  it("should support chord inversions correctly", () => {
    // C major 1st inversion (E in bass)
    const cMaj1st = getChordMidiNotes("C", "maj", 4, 1, "piano");
    expect(cMaj1st).toBeDefined();
    // Inverted chord structure contains all pitch classes
    const pitchClasses = cMaj1st.map(m => m % 12);
    expect(pitchClasses).toContain(0); // C
    expect(pitchClasses).toContain(4); // E
    expect(pitchClasses).toContain(7); // G
  });

  it("should translate Roman numerals to correct real chords in various keys", () => {
    // In C Major: I -> C, V -> G, vi -> Am, IV -> F
    expect(romanToChord("I", "C").displayName).toBe("C");
    expect(romanToChord("V", "C").displayName).toBe("G");
    expect(romanToChord("vi", "C").displayName).toBe("Am");
    expect(romanToChord("IV", "C").displayName).toBe("F");

    // In G Major: I -> G, V -> D, vi -> Em, IV -> C
    expect(romanToChord("I", "G").displayName).toBe("G");
    expect(romanToChord("V", "G").displayName).toBe("D");
    expect(romanToChord("vi", "G").displayName).toBe("Em");
    expect(romanToChord("IV", "G").displayName).toBe("C");

    // 7th chords: ii7 in C is Dm7, V7 in C is G7
    expect(romanToChord("ii7", "C").displayName).toBe("Dm7");
    expect(romanToChord("V7", "C").displayName).toBe("G7");
    expect(romanToChord("Imaj7", "C").displayName).toBe("Cmaj7");
  });

  it("should compute playable 6-string guitar fretboard fingerings", () => {
    const cChord = getGuitarFretboardChord("C", "maj");
    expect(cChord.frets.length).toBe(6);
    expect(cChord.frets[1]).toBe(3); // A string 3rd fret (C)
    expect(cChord.frets[2]).toBe(2); // D string 2nd fret (E)
    expect(cChord.frets[4]).toBe(1); // B string 1st fret (C)

    // Power chord C5
    const c5Chord = getGuitarFretboardChord("C", "5");
    expect(c5Chord.frets.length).toBe(6);
    expect(c5Chord.midiNotes.length).toBeGreaterThanOrEqual(2);
  });

  it("should verify popular chord progressions catalog completeness", () => {
    expect(POPULAR_PROGRESSIONS.length).toBeGreaterThanOrEqual(10);
    POPULAR_PROGRESSIONS.forEach((prog) => {
      expect(prog.id).toBeTruthy();
      expect(prog.name.zh).toBeTruthy();
      expect(prog.name.en).toBeTruthy();
      expect(prog.roman.length).toBeGreaterThanOrEqual(3);
      expect(prog.chords.length).toBeGreaterThanOrEqual(3);
      expect(prog.songs.length).toBeGreaterThanOrEqual(2);
      expect(prog.suggestedBpm).toBeGreaterThan(0);
    });
  });

  it("should map popular progressions to valid ChordDefinition arrays for Studio workbench", () => {
    const sampleProg = POPULAR_PROGRESSIONS[0];
    const mapped = sampleProg.roman.map((rom) => {
      const { root, quality } = romanToChord(rom, "C", false);
      return { root, quality, duration: 4 };
    });

    expect(mapped.length).toBe(sampleProg.roman.length);
    mapped.forEach((c) => {
      expect(c.root).toBeTruthy();
      expect(c.quality).toBeTruthy();
      expect(c.duration).toBe(4);
      const midiNotes = getChordMidiNotes(c.root, c.quality);
      expect(midiNotes.length).toBeGreaterThanOrEqual(3);
    });
  });
});
