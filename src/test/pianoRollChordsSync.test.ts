import { describe, it, expect, vi } from "vitest";
import { notesFromTrack, withTrackNotes } from "../features/sequencer/rollModel";
import { SequencerPattern, SequencerTrack } from "../types/genre";
import { generateMidiBytes } from "../audio/MidiExporter";
import { buildAbletonLiveSetXml } from "../audio/AbletonExporter";
import { sequencerReducer, createInitialSequencerState } from "../features/sequencer/useSequencerStore";
import { ALL_GENRES } from "../data/genres";

describe("Piano Roll & Chord Data Synchronization", () => {
  const baseTrack: SequencerTrack = {
    track_id: "chords",
    name: "Chords / Pad",
    instrument: "synth_chord",
    steps: [1, 0, 0, 0, 1, 0, 0, 0],
    pitch: [60, null, null, null, 64, null, null, null],
    pitches: [[60, 64, 67], null, null, null, [64, 67, 71], null, null, null],
    velocity: [100, 0, 0, 0, 95, 0, 0, 0],
    gate: [1.5, 0.8, 0.8, 0.8, 2.0, 0.8, 0.8, 0.8],
  };

  const pattern: SequencerPattern = {
    genre_id: "house",
    bpm: 124,
    scale: "C major",
    tracks: [baseTrack],
  };

  it("notesFromTrack extracts every chord note from pitches", () => {
    const notes = notesFromTrack(baseTrack, 60, "C major");
    // Step 0 has 3 notes: 60, 64, 67
    const step0Notes = notes.filter((n) => n.stepIdx === 0);
    expect(step0Notes).toHaveLength(3);
    expect(step0Notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([60, 64, 67]);

    // Step 4 has 3 notes: 64, 67, 71
    const step4Notes = notes.filter((n) => n.stepIdx === 4);
    expect(step4Notes).toHaveLength(3);
    expect(step4Notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual([64, 67, 71]);
  });

  it("notesFromTrack falls back to chordVoicing when pitches is empty on chords track", () => {
    const monophonicChords: SequencerTrack = {
      track_id: "chords",
      name: "Chords / Pad",
      instrument: "synth_chord",
      steps: [1, 0, 0, 0],
      pitch: [60, null, null, null],
      velocity: [100, 0, 0, 0],
      gate: [1.0, 0.8, 0.8, 0.8],
    };

    const notes = notesFromTrack(monophonicChords, 60, "C major");
    expect(notes.length).toBeGreaterThanOrEqual(3);
    expect(notes[0].stepIdx).toBe(0);
    expect(notes.map((n) => n.midi)).toContain(60);
  });

  it("SET_PITCH transposes pitches chord stack in sync with root pitch changes", () => {
    const genre = ALL_GENRES[0];
    const initial = createInitialSequencerState(genre);
    const testState = {
      ...initial,
      pattern: {
        ...initial.pattern,
        tracks: [baseTrack],
      },
    };

    // Transpose step 0 root from 60 to 62 (+2 semitones)
    const nextState = sequencerReducer(testState, {
      type: "SET_PITCH",
      trackIdx: 0,
      stepIdx: 0,
      pitch: 62,
    });

    const updatedTrack = nextState.pattern.tracks[0];
    expect(updatedTrack.pitch?.[0]).toBe(62);
    // pitches stack must also be transposed by +2 semitones: [60, 64, 67] -> [62, 66, 69]
    expect(updatedTrack.pitches?.[0]).toEqual([62, 66, 69]);
  });

  it("MidiExporter exports every note of a chord from pitches", () => {
    const midiBytes = generateMidiBytes({
      bpm: 124,
      pattern,
    });

    expect(midiBytes).toBeInstanceOf(Uint8Array);
    expect(midiBytes.length).toBeGreaterThan(0);
    // Midi header check MThd
    expect(midiBytes[0]).toBe(0x4d); // 'M'
    expect(midiBytes[1]).toBe(0x54); // 'T'
    expect(midiBytes[2]).toBe(0x68); // 'h'
    expect(midiBytes[3]).toBe(0x64); // 'd'
  });

  it("AbletonExporter includes all chord note numbers in XML KeyTracks", () => {
    const xml = buildAbletonLiveSetXml({
      bpm: 124,
      pattern,
    });

    // Both chords from step 0 (60, 64, 67) and step 4 (64, 67, 71)
    expect(xml).toContain('<MidiKey Value="60" />');
    expect(xml).toContain('<MidiKey Value="64" />');
    expect(xml).toContain('<MidiKey Value="67" />');
    expect(xml).toContain('<MidiKey Value="71" />');
  });

  it("withTrackNotes maintains both pitches stack and lowest note in pitch", () => {
    const customNotes = [
      { stepIdx: 0, midi: 48, gate: 1.0, velocity: 100 },
      { stepIdx: 0, midi: 52, gate: 1.0, velocity: 100 },
      { stepIdx: 0, midi: 55, gate: 1.0, velocity: 100 },
      { stepIdx: 2, midi: 60, gate: 0.8, velocity: 90 },
    ];

    const updatedPattern = withTrackNotes(pattern, 0, customNotes, 8);
    const chordsTrack = updatedPattern.tracks[0];

    // Step 0 stack: [48, 52, 55]
    expect(chordsTrack.pitches?.[0]).toEqual([48, 52, 55]);
    // Step 0 root: lowest note 48
    expect(chordsTrack.pitch?.[0]).toBe(48);

    // Step 2 monophonic: [60]
    expect(chordsTrack.pitches?.[2]).toEqual([60]);
    expect(chordsTrack.pitch?.[2]).toBe(60);

    // Read back via notesFromTrack
    const readBack = notesFromTrack(chordsTrack, 60, "C major");
    expect(readBack).toHaveLength(4);
    expect(readBack.filter((n) => n.stepIdx === 0)).toHaveLength(3);
    expect(readBack.filter((n) => n.stepIdx === 2)).toHaveLength(1);
  });
});
