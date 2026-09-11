/**
 * Standard MIDI File (SMF) Parser & Groove Importer (P4-03)
 * Supports SMF Type 0 and Type 1, variable-length quantity decoding,
 * running status, tempo meta-events, and intelligent 8-track mapping.
 */

import { DrumPattern, Track } from "../types/genre";

export interface ParsedMidiNote {
  tick: number;
  channel: number;
  note: number;
  velocity: number;
}

export interface MidiImportOptions {
  quantization?: "1/8" | "1/16" | "1/32";
  totalSteps?: number;
}

export interface MidiImportResult {
  pattern: DrumPattern;
  bpm: number;
  notesFound: number;
  trackNames: string[];
}

class ByteReader {
  private view: DataView;
  public pos: number = 0;

  constructor(buffer: ArrayBufferLike) {
    this.view = new DataView(buffer as ArrayBuffer);
  }

  public get length(): number {
    return this.view.byteLength;
  }

  public readUint8(): number {
    if (this.pos >= this.view.byteLength) return 0;
    return this.view.getUint8(this.pos++);
  }

  public readUint16(): number {
    if (this.pos + 2 > this.view.byteLength) return 0;
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }

  public readUint32(): number {
    if (this.pos + 4 > this.view.byteLength) return 0;
    const v = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return v;
  }

  public readString(len: number): string {
    let str = "";
    for (let i = 0; i < len; i++) {
      str += String.fromCharCode(this.readUint8());
    }
    return str;
  }

  public readBytes(len: number): Uint8Array {
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = this.readUint8();
    }
    return arr;
  }

  public readVLQ(): number {
    let val = 0;
    let b = 0;
    do {
      if (this.pos >= this.view.byteLength) break;
      b = this.readUint8();
      val = (val << 7) | (b & 0x7f);
    } while (b & 0x80);
    return val;
  }
}

/**
 * Parses raw MIDI ArrayBuffer into notes and BPM
 */
export function parseMidiFile(buffer: ArrayBufferLike): {
  format: number;
  tracksCount: number;
  division: number;
  bpm: number;
  notes: ParsedMidiNote[];
  trackNames: string[];
} {
  const reader = new ByteReader(buffer);

  const headerTag = reader.readString(4);
  if (headerTag !== "MThd") {
    throw new Error("Invalid MIDI file: Missing MThd header");
  }

  const headerLength = reader.readUint32();
  const format = reader.readUint16();
  const tracksCount = reader.readUint16();
  const division = reader.readUint16();

  if (headerLength > 6) {
    reader.pos += headerLength - 6; // skip extra header bytes if any
  }

  let bpm = 120;
  const notes: ParsedMidiNote[] = [];
  const trackNames: string[] = [];

  for (let t = 0; t < tracksCount && reader.pos < reader.length; t++) {
    const chunkTag = reader.readString(4);
    const chunkLen = reader.readUint32();
    const chunkEnd = reader.pos + chunkLen;

    if (chunkTag !== "MTrk") {
      reader.pos = chunkEnd;
      continue;
    }

    let currentTick = 0;
    let runningStatus = 0;

    while (reader.pos < chunkEnd && reader.pos < reader.length) {
      const delta = reader.readVLQ();
      currentTick += delta;

      let status = reader.readUint8();
      if ((status & 0x80) === 0) {
        // Running status: this byte is the first data byte
        reader.pos--;
        status = runningStatus;
      } else {
        runningStatus = status;
      }

      if (status === 0xff) {
        // Meta event
        const metaType = reader.readUint8();
        const metaLen = reader.readVLQ();
        if (metaType === 0x51 && metaLen === 3) {
          // Set Tempo: 3 bytes microseconds per quarter note
          const b1 = reader.readUint8();
          const b2 = reader.readUint8();
          const b3 = reader.readUint8();
          const us = (b1 << 16) | (b2 << 8) | b3;
          if (us > 0) {
            bpm = Math.round(60000000 / us);
          }
        } else if (metaType === 0x03) {
          // Track Name
          const name = reader.readString(metaLen);
          trackNames.push(name);
        } else {
          reader.pos += metaLen;
        }
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx
        const sysLen = reader.readVLQ();
        reader.pos += sysLen;
      } else {
        const msgType = status & 0xf0;
        const channel = status & 0x0f;

        if (msgType === 0x90) {
          // Note On
          const note = reader.readUint8();
          const vel = reader.readUint8();
          if (vel > 0) {
            notes.push({ tick: currentTick, channel, note, velocity: vel });
          }
        } else if (msgType === 0x80) {
          // Note Off
          reader.readUint8(); // note
          reader.readUint8(); // vel
        } else if (msgType === 0xa0 || msgType === 0xb0 || msgType === 0xe0) {
          reader.readUint8();
          reader.readUint8();
        } else if (msgType === 0xc0 || msgType === 0xd0) {
          reader.readUint8();
        }
      }
    }

    reader.pos = chunkEnd;
  }

  return { format, tracksCount, division: division || 480, bpm, notes, trackNames };
}

/**
 * Standard 8 tracks template
 */
export function createDefaultPatternTracks(stepCount: number): Track[] {
  return [
    { name: "Kick", track_id: "kick", instrument: "kick", steps: new Array(stepCount).fill(0), velocity: new Array(stepCount).fill(100), pitch: new Array(stepCount).fill(36), volume: 0.9, pan: 0 },
    { name: "Snare", track_id: "snare", instrument: "snare", steps: new Array(stepCount).fill(0), velocity: new Array(stepCount).fill(100), pitch: new Array(stepCount).fill(38), volume: 0.85, pan: 0 },
    { name: "Hi-Hat", track_id: "hihat", instrument: "hihat", steps: new Array(stepCount).fill(0), velocity: new Array(stepCount).fill(90), pitch: new Array(stepCount).fill(42), volume: 0.75, pan: 0.1 },
    { name: "Percussion", track_id: "percussion", instrument: "percussion", steps: new Array(stepCount).fill(0), velocity: new Array(stepCount).fill(85), pitch: new Array(stepCount).fill(39), volume: 0.7, pan: -0.1 },
    { name: "Bass", track_id: "bass", instrument: "synth", steps: new Array(stepCount).fill(0), velocity: new Array(stepCount).fill(90), pitch: new Array(stepCount).fill(36), volume: 0.8, pan: 0 },
    { name: "Chords", track_id: "chords", instrument: "synth", steps: new Array(stepCount).fill(0), velocity: new Array(stepCount).fill(80), pitch: new Array(stepCount).fill(48), volume: 0.7, pan: -0.2 },
    { name: "Lead", track_id: "lead", instrument: "synth", steps: new Array(stepCount).fill(0), velocity: new Array(stepCount).fill(85), pitch: new Array(stepCount).fill(60), volume: 0.75, pan: 0.2 },
    { name: "FX", track_id: "fx", instrument: "synth", steps: new Array(stepCount).fill(0), velocity: new Array(stepCount).fill(70), pitch: new Array(stepCount).fill(72), volume: 0.6, pan: 0 },
  ];
}

/**
 * Imports a MIDI file and quantizes it into a DrumPattern
 */
export function importMidiToPattern(
  buffer: ArrayBufferLike,
  options: MidiImportOptions = {}
): MidiImportResult {
  const { bpm, division, notes, trackNames } = parseMidiFile(buffer);
  const totalSteps = options.totalSteps || 16;
  const resolution = options.quantization || "1/16";

  const ticksPerStep = resolution === "1/8"
    ? division / 2
    : resolution === "1/32"
    ? division / 8
    : division / 4;

  const tracks = createDefaultPatternTracks(totalSteps);

  for (const n of notes) {
    const rawStep = Math.round(n.tick / ticksPerStep);
    if (rawStep < 0) continue;
    const stepIdx = rawStep % totalSteps;

    // Target track index
    let targetTrackIdx = -1;

    // Channel 10 (channel 9) is standard drum channel
    if (n.channel === 9) {
      if (n.note === 35 || n.note === 36) targetTrackIdx = 0; // Kick
      else if (n.note === 38 || n.note === 40) targetTrackIdx = 1; // Snare
      else if (n.note === 42 || n.note === 44) targetTrackIdx = 2; // Hi-hat closed
      else targetTrackIdx = 3; // Percussion / Clap / Open hat
    } else {
      // Melodic or general MIDI
      if (n.note <= 42) {
        targetTrackIdx = 4; // Bass
      } else if (n.note <= 58) {
        targetTrackIdx = 5; // Chords / Pad
      } else if (n.note <= 72) {
        targetTrackIdx = 6; // Lead
      } else {
        targetTrackIdx = 7; // FX
      }
    }

    if (targetTrackIdx >= 0 && targetTrackIdx < tracks.length) {
      const t = tracks[targetTrackIdx];
      t.steps[stepIdx] = 1;
      if (t.velocity) {
        t.velocity[stepIdx] = Math.max(1, Math.min(127, n.velocity));
      }
      if (t.pitch) {
        t.pitch[stepIdx] = n.note;
      }
    }
  }

  const pattern: DrumPattern = {
    genre_id: "imported",
    bpm,
    swing: 0,
    scale: "minorPentatonic",
    tracks,
  };

  return {
    pattern,
    bpm,
    notesFound: notes.length,
    trackNames,
  };
}
