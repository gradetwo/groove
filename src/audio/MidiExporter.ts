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
  const TICKS_PER_16TH = TICKS_PER_QUARTER / 4; // 120 ticks per 16th step
  const NOTE_DURATION_TICKS = 100; // 16th note gate

  const allEvents: MidiEvent[] = [];

  // 1. Tempo Meta Event at tick 0
  const microsecondsPerBeat = Math.round(60000000 / Math.max(20, Math.min(300, bpm)));
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

    steps.forEach((step, stepIdx) => {
      if (!step.active) return;

      const tickStart = stepIdx * TICKS_PER_16TH;
      const tickEnd = tickStart + NOTE_DURATION_TICKS;
      const vel = Math.round(Math.max(1, Math.min(127, (step.velocity ?? 0.8) * 127)));
      const pitchOffset = step.pitch ?? 0;
      const noteNumber = Math.max(0, Math.min(127, mapping.baseNote + pitchOffset));

      // For chords, generate triad (root, +3 or +4, +7)
      if (track.name.toLowerCase() === "chords") {
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

  // 4. Sort events chronologically. If ticks equal, noteOff before noteOn, meta first.
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
  a.download = safeName + ".mid";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
