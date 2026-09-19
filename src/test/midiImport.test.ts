import { describe, it, expect } from "vitest";
import { generateMidiBytes } from "../audio/MidiExporter";
import { parseMidiFile, importMidiToPattern } from "../audio/MidiImporter";
import { DrumPattern } from "../types/genre";

describe("MIDI Importer & Round-Trip (P4-03)", () => {
  it("parses SMF header, tracks, BPM, and notes from exported MIDI bytes", () => {
    const testPattern: DrumPattern = {
      genre_id: "test",
      bpm: 128,
      swing: 0,
      scale: "minorPentatonic",
      tracks: [
        {
          name: "Kick",
          track_id: "kick",
          instrument: "kick",
          steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          velocity: [100, 0, 0, 0, 90, 0, 0, 0, 110, 0, 0, 0, 95, 0, 0, 0],
        },
        {
          name: "Snare",
          track_id: "snare",
          instrument: "snare",
          steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
          velocity: [0, 0, 0, 0, 105, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0],
        },
      ],
    };

    const midiBytes = generateMidiBytes({
      bpm: 128,
      pattern: testPattern,
      genreName: "House",
    });

    const parsed = parseMidiFile(midiBytes.buffer.slice(0));
    expect(parsed).toBeDefined();
    expect(parsed.bpm).toBe(128);
    expect(parsed.notes.length).toBeGreaterThanOrEqual(6); // 4 kicks + 2 snares

    // Verify kick notes on channel 9 (MIDI channel 10)
    const kickNotes = parsed.notes.filter((n) => n.note === 36);
    expect(kickNotes.length).toBe(4);
  });

  it("imports MIDI into a quantized 16-step DrumPattern", () => {
    const testPattern: DrumPattern = {
      genre_id: "test",
      bpm: 120,
      swing: 0,
      scale: "minorPentatonic",
      tracks: [
        {
          name: "Kick",
          track_id: "kick",
          instrument: "kick",
          steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        },
        {
          name: "Hihat",
          track_id: "hihat",
          instrument: "hihat",
          steps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        },
      ],
    };

    const midiBytes = generateMidiBytes({
      bpm: 120,
      pattern: testPattern,
    });

    const result = importMidiToPattern(midiBytes.buffer.slice(0), { quantization: "1/16", totalSteps: 16 });
    expect(result.bpm).toBe(120);
    expect(result.pattern.tracks.length).toBe(8);

    // Kick track should have notes on steps 0, 4, 8, 12
    const kickTrack = result.pattern.tracks[0];
    expect(kickTrack.steps[0]).toBe(1);
    expect(kickTrack.steps[4]).toBe(1);
    expect(kickTrack.steps[8]).toBe(1);
    expect(kickTrack.steps[12]).toBe(1);

    // Snare track (step 0, 4, 8, 12 was kick, snare was empty)
    const snareTrack = result.pattern.tracks[1];
    expect(snareTrack.steps[0]).toBe(0);
  });

  it("throws friendly error on invalid or truncated MIDI file", () => {
    const corruptBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
    expect(() => parseMidiFile(corruptBuffer)).toThrow(/Invalid MIDI file/);
  });
});
