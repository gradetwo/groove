/**
 * Standard MIDI file generator (SMF Type 0) for 8-track groove patterns.
 * Supports variable-length quantity (VLQ) delta timing, tempo meta events,
 * and General MIDI drum/instrument mapping.
 */

import { SequencerPattern, SequencerTrack } from "../types/genre";

export interface ExportMidiOptions {
  bpm: number;
  pattern: SequencerPattern;
  genreName?: string;
}

// Track index to General MIDI mapping
// Tracks 0-3 are drums (Channel 10 = index 9 in 0-indexed MIDI)
// Tracks 4-7 are melodic/harmonic instruments (Channels 1, 2, 3, 4 = indices 0, 1, 2, 3)
const TRACK_MIDI_MAPPINGS = [
  { isDrum: true, channel: 9, baseNote: 36, program: 0 },  // Kick: Acoustic Bass Drum
  { isDrum: true, channel: 9, baseNote: 38, program: 0 },  // Snare: Acoustic Snare
  { isDrum: true, channel: 9, baseNote: 42, program: 0 },  // Hihat: Closed Hi-Hat
  { isDrum: true, channel: 9, baseNote: 39, program: 0 },  // Percussion: Hand Clap
  { isDrum: false, channel: 0, baseNote: 36, program: 38 }, // Bass: Synth Bass 1
  { isDrum: false, channel: 1, baseNote: 48, program: 80 }, // Chords: Synth Pad / Polysynth
  { isDrum: false, channel: 2, baseNote: 60, program: 81 }, // Lead: Lead 2 (sawtooth)
  { isDrum: false, channel: 3, baseNote: 72, program: 98 }, // FX: FX 3 (crystal)
];

// Helper: encode Variable Length Quantity (VLQ)
function writeVLQ(value: number): number[] {
  const bytes: number[] = [];
  let buffer = value & 0x7f;
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= 0x80;
    buffer += (value & 0x7f);
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }
  return bytes;
}

interface MidiEvent {
  tick: number;
  type: "noteOn" | "noteOff" | "meta";
  channel?: number;
  note?: number;
  velocity?: number;
  metaData?: number[];
}

/**
 * Generate MIDI Type 0 byte array from sequencer pattern
 */
export function generateMidiBytes(options: ExportMidiOptions): Uint8Array {
  const { bpm, pattern } = options;
  const TICKS_PER_QUARTER = 480;
  const resolution = pattern.resolution || "1/16";
  const ticksPerStep = resolution === "1/8" 
    ? TICKS_PER_QUARTER / 2 
    : resolution === "1/32" 
    ? TICKS_PER_QUARTER / 8 
    : TICKS_PER_QUARTER / 4;
  const noteDurationTicks = Math.round(ticksPerStep * 0.85);

  const allEvents: MidiEvent[] = [];

  // 1. Tempo Meta Event at tick 0
  const safeBpm = Math.max(20, Math.min(300, bpm || 120));
  const microsecondsPerBeat = Math.round(60000000 / safeBpm);
  const tempoBytes = [
    (microsecondsPerBeat >> 16) & 0xff,
    (microsecondsPerBeat >> 8) & 0xff,
    microsecondsPerBeat & 0xff,
  ];
  allEvents.push({
    tick: 0,
    type: "meta",
    metaData: [0xff, 0x51, 0x03, ...tempoBytes],
  });

  // 2. Program Change for melodic channels at tick 0
  TRACK_MIDI_MAPPINGS.forEach((mapping) => {
    if (!mapping.isDrum) {
      allEvents.push({
        tick: 0,
        type: "meta",
        metaData: [0xc0 | mapping.channel, mapping.program],
      });
    }
  });

  // 3. Scan each track and generate NoteOn / NoteOff events
  pattern.tracks.forEach((track: SequencerTrack, trackIdx: number) => {
    const mapping = TRACK_MIDI_MAPPINGS[trackIdx] || TRACK_MIDI_MAPPINGS[0];
    const steps = track.steps || [];
    const velocities = track.velocity || [];
    const pitches = track.pitch || [];
    const isHat = track.track_id === "hihat" || track.name.toLowerCase().includes("hat");

    steps.forEach((stepVal, stepIdx) => {
      if (stepVal <= 0) return;

      const tickStart = stepIdx * ticksPerStep;
      const tickEnd = tickStart + noteDurationTicks;
      const vel = velocities[stepIdx] !== undefined ? velocities[stepIdx] : 100;
      let pitchOffset = (pitches[stepIdx] !== undefined && pitches[stepIdx] !== null) 
        ? pitches[stepIdx]! 
        : mapping.baseNote;
      
      if (isHat) {
        if (stepVal === 2) pitchOffset = 46; // GM Open Hi-Hat
        else if (stepVal === 3) pitchOffset = 44; // GM Pedal Hi-Hat
        else pitchOffset = 42; // GM Closed Hi-Hat
      }

      const noteNumber = Math.max(0, Math.min(127, pitchOffset));

      // For chords, generate triad
      if (track.track_id === "chords" || track.name.toLowerCase().includes("chord")) {
        const chordNotes = [noteNumber, noteNumber + 3, noteNumber + 7];
        chordNotes.forEach((n) => {
          allEvents.push({
            tick: tickStart,
            type: "noteOn",
            channel: mapping.channel,
            note: Math.min(127, n),
            velocity: vel,
          });
          allEvents.push({
            tick: tickEnd,
            type: "noteOff",
            channel: mapping.channel,
            note: Math.min(127, n),
            velocity: 0,
          });
        });
      } else {
        allEvents.push({
          tick: tickStart,
          type: "noteOn",
          channel: mapping.channel,
          note: noteNumber,
          velocity: vel,
        });
        allEvents.push({
          tick: tickEnd,
          type: "noteOff",
          channel: mapping.channel,
          note: noteNumber,
          velocity: 0,
        });
      }
    });
  });

  // 4. Sort events chronologically
  allEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type === "meta") return -1;
    if (b.type === "meta") return 1;
    if (a.type === "noteOff" && b.type === "noteOn") return -1;
    if (a.type === "noteOn" && b.type === "noteOff") return 1;
    return 0;
  });

  // 5. Serialize track events with delta times
  const trackBytes: number[] = [];
  let lastTick = 0;

  for (const ev of allEvents) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;
    trackBytes.push(...writeVLQ(delta));

    if (ev.type === "meta" && ev.metaData) {
      trackBytes.push(...ev.metaData);
    } else if (ev.type === "noteOn") {
      trackBytes.push(0x90 | (ev.channel! & 0x0f), ev.note! & 0x7f, ev.velocity! & 0x7f);
    } else if (ev.type === "noteOff") {
      trackBytes.push(0x80 | (ev.channel! & 0x0f), ev.note! & 0x7f, 0x00);
    }
  }

  // End of track marker (delta 0, 0xFF 0x2F 0x00)
  trackBytes.push(...writeVLQ(0));
  trackBytes.push(0xff, 0x2f, 0x00);

  // 6. Build MThd header chunk (14 bytes)
  const headerBytes = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // length 6
    0x00, 0x00,             // format 0 (single track)
    0x00, 0x01,             // 1 track
    (TICKS_PER_QUARTER >> 8) & 0xff,
    TICKS_PER_QUARTER & 0xff, // division (480)
  ];

  // 7. Build MTrk track chunk
  const trackLength = trackBytes.length;
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    (trackLength >> 24) & 0xff,
    (trackLength >> 16) & 0xff,
    (trackLength >> 8) & 0xff,
    trackLength & 0xff,
  ];

  const totalLength = headerBytes.length + trackHeader.length + trackBytes.length;
  const result = new Uint8Array(totalLength);
  result.set(headerBytes, 0);
  result.set(trackHeader, headerBytes.length);
  result.set(trackBytes, headerBytes.length + trackHeader.length);

  return result;
}

/**
 * Triggers browser download of the generated MIDI file
 */
export function downloadMidiFile(options: ExportMidiOptions, filename?: string): void {
  const bytes = generateMidiBytes(options);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const nameBase = options.genreName ? options.genreName.toLowerCase().replace(/[^a-z0-9_-]/g, "_") : "groove";
  const safeName = filename || (nameBase + "-pattern");
  a.download = safeName.endsWith(".mid") ? safeName : safeName + ".mid";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports chord progression to standard MIDI file
 */
export function exportChordsMidi(
  chords: Array<{ root: string; quality: any; duration?: number; inversion?: any }>,
  bpm: number,
  filename = "groove_chords.mid"
): void {
  const TICKS_PER_QUARTER = 480;
  const allEvents: MidiEvent[] = [];

  // Tempo meta
  const safeBpm = Math.max(20, Math.min(300, bpm || 120));
  const microsecondsPerBeat = Math.round(60000000 / safeBpm);
  allEvents.push({
    tick: 0,
    type: "meta",
    metaData: [
      0xff, 0x51, 0x03,
      (microsecondsPerBeat >> 16) & 0xff,
      (microsecondsPerBeat >> 8) & 0xff,
      microsecondsPerBeat & 0xff,
    ],
  });

  // Acoustic Grand Piano Program Change on channel 0
  allEvents.push({
    tick: 0,
    type: "meta",
    metaData: [0xc0, 0x00], // Program 0 = Acoustic Grand Piano
  });

  let currentTick = 0;
  chords.forEach((chord) => {
    const beats = chord.duration ?? 4;
    const durTicks = beats * TICKS_PER_QUARTER;
    const noteDur = Math.max(TICKS_PER_QUARTER, durTicks - 40);

    // Import helper dynamically if needed or use basic midi calculation
    const intervals: Record<string, number[]> = {
      "5": [0, 7],
      "maj": [0, 4, 7],
      "min": [0, 3, 7],
      "dim": [0, 3, 6],
      "aug": [0, 4, 8],
      "sus2": [0, 2, 7],
      "sus4": [0, 5, 7],
      "maj7": [0, 4, 7, 11],
      "min7": [0, 3, 7, 10],
      "7": [0, 4, 7, 10],
      "m7b5": [0, 3, 6, 10],
      "dim7": [0, 3, 6, 9],
      "add9": [0, 4, 7, 14],
      "maj9": [0, 4, 7, 11, 14],
      "min9": [0, 3, 7, 10, 14],
      "9": [0, 4, 7, 10, 14],
      "6": [0, 4, 7, 9],
    };

    const notesTable = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const rootIdx = notesTable.indexOf(chord.root);
    const rootMidi = 60 + (rootIdx >= 0 ? rootIdx : 0);
    const chordInts = intervals[chord.quality] || [0, 4, 7];
    const midiNotes = [rootMidi - 12, ...chordInts.map((inter) => rootMidi + inter)];

    midiNotes.forEach((m) => {
      allEvents.push({
        tick: currentTick,
        type: "noteOn",
        channel: 0,
        note: m,
        velocity: 96,
      });
      allEvents.push({
        tick: currentTick + noteDur,
        type: "noteOff",
        channel: 0,
        note: m,
        velocity: 0,
      });
    });

    currentTick += durTicks;
  });

  allEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type === "meta") return -1;
    if (b.type === "meta") return 1;
    if (a.type === "noteOff" && b.type === "noteOn") return -1;
    if (a.type === "noteOn" && b.type === "noteOff") return 1;
    return 0;
  });

  const trackBytes: number[] = [];
  let lastTick = 0;
  for (const ev of allEvents) {
    const delta = Math.max(0, ev.tick - lastTick);
    lastTick = ev.tick;
    trackBytes.push(...writeVLQ(delta));
    if (ev.type === "meta" && ev.metaData) {
      trackBytes.push(...ev.metaData);
    } else if (ev.type === "noteOn") {
      trackBytes.push(0x90 | (ev.channel! & 0x0f), ev.note! & 0x7f, ev.velocity! & 0x7f);
    } else if (ev.type === "noteOff") {
      trackBytes.push(0x80 | (ev.channel! & 0x0f), ev.note! & 0x7f, 0x00);
    }
  }
  trackBytes.push(...writeVLQ(0));
  trackBytes.push(0xff, 0x2f, 0x00);

  const headerBytes = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (TICKS_PER_QUARTER >> 8) & 0xff,
    TICKS_PER_QUARTER & 0xff,
  ];

  const trackLength = trackBytes.length;
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (trackLength >> 24) & 0xff,
    (trackLength >> 16) & 0xff,
    (trackLength >> 8) & 0xff,
    trackLength & 0xff,
  ];

  const result = new Uint8Array(headerBytes.length + trackHeader.length + trackBytes.length);
  result.set(headerBytes, 0);
  result.set(trackHeader, headerBytes.length);
  result.set(trackBytes, headerBytes.length + trackHeader.length);

  const blob = new Blob([result as unknown as BlobPart], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".mid") ? filename : filename + ".mid";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const MidiExporter = {
  generateMidiBytes,
  downloadMidiFile,
  exportChordsMidi,
};

