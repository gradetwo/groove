/**
 * Standard MIDI file generator (SMF Type 0) for 8-track groove patterns.
 * Supports variable-length quantity (VLQ) delta timing, tempo meta events,
 * lyric meta events (0x05) and General MIDI drum/instrument mapping.
 *
 * **A syllable is written as `FF 05 <len> <utf-8>` on the note-on that starts its note**, which is the event the format reserves for a lyric. It is *not*
 * also written as a `0x01` text event: this file is the DAW export, the syllable has one event of its own, and a reader that showed both would print the
 * word twice. Notation output — where a text event might be the only thing a program reads — is MusicXML's job, and `toMusicXml` writes the `<lyric>` there.
 */

import { MAX_NOTE_GATE_STEPS, SequencerPattern, SequencerTrack } from "../types/genre";
import { patternSeed, probabilityPasses } from "./noteEvents";
import { chordNotesForStep } from "./chordVoicing";

export interface ExportMidiOptions {
  bpm: number;
  pattern: SequencerPattern;
  genreName?: string;
}

// Track index to General MIDI mapping
// Tracks 0-3 are drums (Channel 10 = index 9 in 0-indexed MIDI)
// Tracks 4-7 are melodic/harmonic instruments (Channels 1, 2, 3, 4 = indices 0, 1, 2, 3)
/**
 * The same eight-row track mapping `AbletonExporter.TRACK_MIDI_MAPPINGS` writes, with a GM program where that
 * one has a default name. **No note names appear here on purpose**: the Ableton table labels its rows in
 * Ableton's naming (note 60 is C3) because those labels describe what the receiving DAW shows, and a second set
 * of labels here would be a second place for them to drift. The numbers are the mapping; `baseNote` on the
 * other table is what becomes an export's pitch offset.
 */
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
  type: "noteOn" | "noteOff" | "meta" | "lyric";
  channel?: number;
  /** Which lane wrote this event, so a lyric can be kept next to its own lane's note-on even when two lanes share a channel (every drum lane is channel 10). */
  lane?: number;
  note?: number;
  velocity?: number;
  metaData?: number[];
}

/**
 * The order events sharing a tick are written in — and **the lyric ordering is what makes the importer's binding right**.
 *
 * A lyric meta event carries no channel, so in a format-0 file (every lane in one chunk) it cannot be matched to a note by its own bytes: it has to be the
 * event immediately before the note-on it annotates. The rank below interleaves each lane's lyric with that lane's note-on, so a syllable on the lead lands on
 * the lead note even when the kick strikes at the same tick. Lane rather than channel, because every drum lane is channel 10 and two of them striking together
 * would otherwise be indistinguishable here. Meta events stay first, because a tempo or a program change is in effect from the beginning of the tick, not
 * after the first note of it.
 */
function eventRank(event: MidiEvent): number {
  if (event.type === "meta") return 0;
  if (event.type === "noteOff") return 1;
  const lane = event.lane ?? event.channel ?? 0;
  return (event.type === "lyric" ? 2 : 3) + lane * 2;
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
  const anySolo = pattern.tracks.some((t) => t.solo);
  const totalSteps = pattern.totalSteps || (pattern.tracks[0]?.steps?.length || 16);
  const globalSwing = (pattern.swing !== undefined ? pattern.swing / 100 : 0);
  const exportSeed = patternSeed(pattern as unknown as { genre_id?: string; bpm?: number; totalSteps?: number });

  pattern.tracks.forEach((track: SequencerTrack, trackIdx: number) => {
    if (track.mute) return;
    if (anySolo && !track.solo) return;

    const mapping = TRACK_MIDI_MAPPINGS[trackIdx] || TRACK_MIDI_MAPPINGS[0];
    const steps = track.steps || [];
    const velocities = track.velocity || [];
    const pitches = track.pitch || [];
    const gates = track.gate || [];
    const ratchets = track.ratchet || [];
    const probabilities = track.probability || [];
    const trackSwing = (track.swing !== undefined ? track.swing / 100 : 0);
    const effSwing = Math.max(0, Math.min(0.75, globalSwing + trackSwing));

    const isHat = track.track_id === "hihat" || track.name.toLowerCase().includes("hat");
    const trackLen = (track.trackLength && track.trackLength > 0) ? track.trackLength : (steps.length || 16);

    for (let step = 0; step < totalSteps; step++) {
      const stepIdx = trackLen > 0 ? step % trackLen : step;
      const stepVal = steps[stepIdx] || 0;
      if (stepVal <= 0) continue;

      // N-04: honour per-step probability deterministically so MIDI matches the WAV
      // render (which used to roll Math.random) and re-exporting is reproducible.
      if (!probabilityPasses(probabilities[stepIdx], exportSeed, trackIdx, stepIdx)) continue;

      // Base tick position with swing offset on odd steps
      let stepTick = step * ticksPerStep;
      if (step % 2 === 1 && effSwing > 0) {
        stepTick += Math.round(effSwing * 0.5 * ticksPerStep);
      }

      const vel = Math.max(1, Math.min(127, velocities[stepIdx] !== undefined ? velocities[stepIdx] : 100));
      /**
       * ⭐ **The floor stays, the ceiling goes.** `MAX_NOTE_GATE_STEPS` is the step grid's own editing limit — a
       * piano roll resize, a genre library's authored gate — and it has no business capping what an arrangement
       * exports: the arrangement states `lengthBeats` with no upper bound, the compile now hands that length to
       * every lane, and the WAV renderer honours it as written (`WavExporter` reads `gate` without clamping). An
       * exporter that quietly cut a four-bar pad to one bar would disagree with the file the creator just
       * auditioned, which is the class of failure this project keeps refusing to ship.
       *
       * The `0.1` floor is a different thing and stays: a zero or negative gate is a degenerate note, not a long
       * one.
       */
      const gateVal = (gates[stepIdx] !== undefined) ? Math.max(0.1, gates[stepIdx]) : 0.8;

      let pitchOffset = (pitches[stepIdx] !== undefined && pitches[stepIdx] !== null) 
        ? pitches[stepIdx]! 
        : mapping.baseNote;
      
      if (isHat) {
        if (stepVal === 2) pitchOffset = 46; // GM Open Hi-Hat
        else if (stepVal === 3) pitchOffset = 44; // GM Pedal Hi-Hat
        else pitchOffset = 42; // GM Closed Hi-Hat
      } else if (!mapping.isDrum && pitchOffset <= 24 && pitchOffset > 0) {
        pitchOffset = mapping.baseNote + pitchOffset;
      }

      const noteNumber = Math.max(0, Math.min(127, pitchOffset));

      const isHatTriplet = isHat && stepVal === 3;
      const ratchet = (ratchets[stepIdx] && ratchets[stepIdx] > 1)
        ? ratchets[stepIdx]
        : (isHatTriplet ? 3 : 1);

      const stack = track.pitches?.[stepIdx];
      const hasStack = Array.isArray(stack) && stack.length > 0;
      const isChords = track.track_id === "chords" || track.name.toLowerCase().includes("chord");
      const chordNotes = hasStack
        ? stack!.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
        : isChords
          ? (chordNotesForStep(track, stepIdx, noteNumber, pattern.scale) || [noteNumber, noteNumber + 3, noteNumber + 7])
          : null;
      const notesToExport = chordNotes && chordNotes.length > 0 ? chordNotes : [noteNumber];

      /**
       * The syllable this step is sung on, written as a lyric meta event at the tick the step sounds on. One event per **step**, not per note: a chord is one
       * sung syllable, and a ratchet is one syllable struck several times, so the event is written once and the note-on it precedes is the chord's first.
       */
      const syllable = typeof track.syllables?.[stepIdx] === "string" ? track.syllables[stepIdx]!.trim() : "";
      if (syllable) {
        const text = [...new TextEncoder().encode(syllable)];
        allEvents.push({
          tick: stepTick,
          type: "lyric",
          channel: mapping.channel,
          lane: trackIdx,
          metaData: [0xff, 0x05, ...writeVLQ(text.length), ...text],
        });
      }

      if (ratchet > 1) {
        const subTicks = Math.round(ticksPerStep / ratchet);
        const subNoteTicks = Math.max(12, Math.round(subTicks * gateVal));
        for (let r = 0; r < ratchet; r++) {
          const subStart = stepTick + r * subTicks;
          const subEnd = subStart + subNoteTicks;
          const subVel = Math.min(127, Math.round(vel * (0.85 + (r / ratchet) * 0.15)));

          notesToExport.forEach((n) => {
            const safeNote = Math.max(0, Math.min(127, Math.round(n)));
            allEvents.push({
              tick: subStart,
              type: "noteOn",
              channel: mapping.channel,
              lane: trackIdx,
              note: safeNote,
              velocity: subVel,
            });
            allEvents.push({
              tick: subEnd,
              type: "noteOff",
              channel: mapping.channel,
              lane: trackIdx,
              note: safeNote,
              velocity: 0,
            });
          });
        }
      } else {
        const noteTicks = Math.max(16, Math.round(ticksPerStep * gateVal));
        const tickEnd = stepTick + noteTicks;

        notesToExport.forEach((n) => {
          const safeNote = Math.max(0, Math.min(127, Math.round(n)));
          allEvents.push({
            tick: stepTick,
            type: "noteOn",
            channel: mapping.channel,
            lane: trackIdx,
            note: safeNote,
            velocity: vel,
          });
          allEvents.push({
            tick: tickEnd,
            type: "noteOff",
            channel: mapping.channel,
            lane: trackIdx,
            note: safeNote,
            velocity: 0,
          });
        });
      }
    }
  });

  // 4. Sort events chronologically
  allEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    return eventRank(a) - eventRank(b);
  });

  // 5. Serialize track events with delta times
  const trackBytes: number[] = [];
  let lastTick = 0;

  for (const ev of allEvents) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;
    trackBytes.push(...writeVLQ(delta));

    if ((ev.type === "meta" || ev.type === "lyric") && ev.metaData) {
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

