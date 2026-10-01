/**
 * An arrangement written as a **Standard MIDI File, format 1** — the mirror of `midiToArrangement.ts`.
 *
 * The project could import a MIDI file into an arrangement and could not export one, and the asymmetry was
 * reported by a composer who works through MCP: *"arrangement 只能存在 groove 里，拿不出来给 DAW 继续做"* — the
 * arrangement lived here and could not be handed to the tool that would finish the job. This is the export half.
 *
 * **Format 1, one track per lane, plus a conductor track.** Format 1 is what a DAW shows as a track list, and it
 * is what the importer already expects: it reads one part per track chunk and only splits a **format 0** file by
 * channel. So the mapping round-trips — each lane comes back as the part it was.
 *
 * Three details are load-bearing for that round trip and are easy to get wrong:
 *
 *   1. **Every track carries a name event, the conductor track included.** The importer collects track names into
 *      one array in the order the name events appear, and looks a track's name up by its chunk index. A track with
 *      no name shifts every later index, so a lane silently takes its neighbour's name. Naming the conductor track
 *      keeps the indices aligned.
 *   2. **Positions are integer ticks at a stated division.** The importer divides ticks by the file's own
 *      division, so `startBeats * division` has to be a whole number for a note to come back where it started.
 *      Anything finer is rounded, and that is **reported** rather than left for the caller to notice.
 *   3. **A lyric is written immediately before the note-on it is sung on**, as the `0x05` event the format reserves for a syllable. The event carries no
 *      channel or pitch, so "immediately before" is the only statement of which note it belongs to, and the importer reads it that way.
 *
 * What MIDI cannot hold is stated rather than approximated: a folder track has no MIDI counterpart and is left
 * out, and two notes of one pitch that overlap on one lane are indistinguishable in the event stream (MIDI pairs
 * note-offs with note-ons first-in-first-out), which the `problems` list says out loud.
 */
import type { ArrangementV2, NoteEvent, TrackKindV2 } from "../types/arrangementV2";
import { beatsPerBar } from "./noteEvents";

/** Ticks per quarter note. 480 is what the importer assumes, what the app's other MIDI writer writes, and a division every DAW reads. */
export const ARRANGEMENT_MIDI_DIVISION = 480;

/** The conductor track is not a lane, so it is named here once rather than at each use. */
const CONDUCTOR_TRACK_NAME = "Conductor";

/** The channels a melodic lane may take, in order, with channel 10 (index 9) left out because General MIDI reserves it for drums. */
const MELODIC_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];

export interface ArrangementToMidiOptions {
  /** Ticks per quarter note; 480 unless a caller has a reason for another. */
  division?: number;
  /** What to call the conductor track. */
  conductorName?: string;
}

export interface ArrangementMidiTempoEvent {
  /** Where the change takes effect, in ticks from the start. */
  tick: number;
  /** The whole bar it belongs to — `0` for the arrangement's own tempo. */
  atBar: number;
  bpm: number;
}

export interface ArrangementMidiTrack {
  /** The arrangement lane this track was written from. */
  id: string;
  name: string;
  kind: TrackKindV2;
  channel: number;
  notes: number;
}

export interface ArrangementMidiFile {
  bytes: Uint8Array;
  /** Always 1: one track per lane is the mapping the importer's format-1 path reads back. */
  format: 1;
  division: number;
  /** One entry per lane written, folders excepted; the conductor track is not listed because it is not a lane. */
  tracks: ArrangementMidiTrack[];
  notes: number;
  bpm: number;
  /** The signature written, normalised — `"4/4"` when the arrangement states none. */
  timeSignature: string;
  /** Every tempo the file states, deduplicated by tick, in time order. */
  tempoEvents: ArrangementMidiTempoEvent[];
  /** Anything the arrangement asked for that a MIDI file cannot carry, said rather than dropped in silence. */
  problems: string[];
}

/** A byte-level event, with an `order` so note-offs sort before note-ons at the same tick and a `serial` so events within one order keep the sequence they were built in. */
interface WriteEvent {
  tick: number;
  order: number;
  bytes: number[];
  /**
   * A tie-break inside one tick and one order, used for one thing: **a lyric has to be the event immediately before its own note-on**.
   *
   * `order` alone cannot say that when a chord has several note-ons at one tick, and the importer binds a `0x05` event to the note-on that follows it — the
   * event carries no channel or pitch, so adjacency is the only statement of which note it belongs to that the format has.
   */
  serial?: number;
}

/**
 * Variable-length quantity, which is how every delta time is written.
 *
 * The same arithmetic as `src/audio/MidiExporter.ts`; duplicated rather than shared because that module is the
 * **step-model** writer and this one must be free to change without re-proving that file's bytes.
 */
function writeVLQ(value: number): number[] {
  const bytes: number[] = [];
  let buffer = value & 0x7f;
  let rest = value >> 7;
  while (rest > 0) {
    buffer <<= 8;
    buffer |= 0x80;
    buffer += rest & 0x7f;
    rest >>= 7;
  }
  for (;;) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

/** `FF 03 <len> <utf8>` — a person's text, written as UTF-8, which is what the importer tries first. */
function trackNameBytes(name: string): number[] {
  const text = [...new TextEncoder().encode(name)];
  return [0xff, 0x03, ...writeVLQ(text.length), ...text];
}

/**
 * `FF 05 <len> <utf8>` — a syllable, the event the format reserves for a lyric, written as UTF-8 for the same reason a track name is.
 *
 * No `0x01` text event is written beside it. A `0x05` is the lyric; a second text event would say the same word twice, and a reader that displays both would
 * show it twice. Notation output is MusicXML's job, and that writer emits a real `<lyric>`.
 */
function lyricBytes(text: string): number[] {
  const bytes = [...new TextEncoder().encode(text)];
  return [0xff, 0x05, ...writeVLQ(bytes.length), ...bytes];
}

/** `FF 51 03 <µs per quarter>` — the tempo, as the format states it. */
function tempoBytes(bpm: number): number[] {
  const microsecondsPerQuarter = Math.round(60_000_000 / bpm);
  return [0xff, 0x51, 0x03, (microsecondsPerQuarter >> 16) & 0xff, (microsecondsPerQuarter >> 8) & 0xff, microsecondsPerQuarter & 0xff];
}

/**
 * `FF 58 04 <numerator> <log2 denominator> <clocks per click> <32nds per quarter>`.
 *
 * The denominator is written as its power of two because that is the format's own encoding. A denominator that is
 * not a power of two cannot be written exactly; the nearest one is used and the difference is reported.
 */
function timeSignatureBytes(numerator: number, denominator: number): { bytes: number[]; exact: boolean } {
  const power = Math.max(0, Math.min(7, Math.round(Math.log2(denominator))));
  const exact = 2 ** power === denominator;
  // A click per beat: 24 MIDI clocks is a quarter note, so an eighth-note beat gets twelve and a half-note beat forty-eight.
  const clocksPerClick = Math.max(1, Math.min(255, Math.round((24 * 4) / denominator)));
  return { bytes: [0xff, 0x58, 0x04, numerator & 0xff, power, clocksPerClick, 8], exact };
}

/** `MTrk` plus its length and body, ended with the end-of-track meta event every reader expects. */
function trackChunk(events: WriteEvent[]): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order || (a.serial ?? 0) - (b.serial ?? 0));
  const body: number[] = [];
  let previous = 0;
  for (const event of sorted) {
    body.push(...writeVLQ(Math.max(0, event.tick - previous)), ...event.bytes);
    previous = event.tick;
  }
  body.push(0x00, 0xff, 0x2f, 0x00);
  const length = body.length;
  return [
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...body,
  ];
}

/**
 * The signature an arrangement states, or 4/4.
 *
 * An arrangement that says nothing plays in four-four — the model's own documented default — so writing `4/4`
 * explicitly is a reading of the model rather than an invention.
 */
function readTimeSignature(signature: string | undefined): { numerator: number; denominator: number; text: string } {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec((signature ?? "").trim());
  const numerator = match ? Number(match[1]) : 4;
  const denominator = match ? Number(match[2]) : 4;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) {
    return { numerator: 4, denominator: 4, text: "4/4" };
  }
  return { numerator, denominator, text: `${numerator}/${denominator}` };
}

/**
 * The arrangement as Standard MIDI File bytes, plus what the file could not carry.
 *
 * Pure: it takes the arrangement and returns bytes, so the criteria can read the result back through the real
 * importer without a file ever touching a disk. Writing the file is the MCP tool's job.
 */
export function arrangementToMidi(arrangement: ArrangementV2, options: ArrangementToMidiOptions = {}): ArrangementMidiFile {
  const division = Math.max(1, Math.round(options.division ?? ARRANGEMENT_MIDI_DIVISION));
  const bpm = Math.max(20, Math.min(300, Math.round(arrangement.bpm ?? 120)));
  const signature = readTimeSignature(arrangement.timeSignature);
  const meter = timeSignatureBytes(signature.numerator, signature.denominator);
  const beatsInBar = beatsPerBar(signature.text);

  const problems: string[] = [];
  if (!meter.exact) {
    const writtenPower = Math.max(0, Math.min(7, Math.round(Math.log2(signature.denominator))));
    problems.push(
      `the time signature ${signature.text} has a denominator that is not a power of two, which MIDI cannot write; the file states ${signature.numerator}/${2 ** writtenPower}`
    );
  }

  /**
   * **The tempo events, deduplicated by tick.** The arrangement's own `bpm` is what plays before the first point,
   * exactly as `bpmAtBar` reads it, so it is written at tick 0 and each map point overrides it at its own bar. A
   * point at bar 0 therefore replaces the tick-0 tempo rather than fighting it, which is what a reader would do
   * with two events at one tick and is better said once.
   */
  const byTick = new Map<number, ArrangementMidiTempoEvent>();
  const tempoEventFor = (atBar: number, value: number): ArrangementMidiTempoEvent => ({
    tick: Math.round(atBar * beatsInBar * division),
    atBar,
    bpm: Math.max(20, Math.min(300, Math.round(value))),
  });
  const base = tempoEventFor(0, bpm);
  byTick.set(base.tick, base);
  for (const point of arrangement.tempoTrack ?? []) {
    const event = tempoEventFor(Math.max(0, Math.round(point.atBar)), point.bpm);
    byTick.set(event.tick, event);
  }
  const tempoEvents = [...byTick.values()].sort((a, b) => a.tick - b.tick || a.atBar - b.atBar);

  const conductorEvents: WriteEvent[] = [
    { tick: 0, order: -1, bytes: trackNameBytes(options.conductorName ?? CONDUCTOR_TRACK_NAME) },
    { tick: 0, order: -1, bytes: meter.bytes },
    ...tempoEvents.map((event) => ({ tick: event.tick, order: -1, bytes: tempoBytes(event.bpm) })),
  ];

  let roundedStarts = 0;
  let roundedLengths = 0;
  let clampedVelocities = 0;
  let clampedPitches = 0;
  let overlaps = 0;
  let notes = 0;

  const tracks: ArrangementMidiTrack[] = [];
  const chunks: number[][] = [trackChunk(conductorEvents)];
  let melodicIndex = 0;
  for (const track of arrangement.tracks) {
    // A folder groups other tracks and makes no sound; MIDI has no folder, so writing one would be inventing a track.
    if (track.kind === "folder") continue;
    const channel = track.kind === "drumkit" ? 9 : MELODIC_CHANNELS[melodicIndex++ % MELODIC_CHANNELS.length]!;
    const laneNotes = arrangement.notesByTrack?.[track.id] ?? [];
    const events: WriteEvent[] = [{ tick: 0, order: -1, bytes: trackNameBytes(track.name) }];

    /**
     * **Overlapping notes of one pitch are the one thing the format cannot say.** A MIDI reader pairs the earliest
     * unreleased note-on with the earliest note-off, so two overlapping strikes of one key come back with each
     * other's lengths. Detected here so the caller is told, instead of finding a different performance.
     */
    const byPitch = new Map<number, NoteEvent[]>();
    for (const note of laneNotes) {
      const list = byPitch.get(note.pitch) ?? [];
      list.push(note);
      byPitch.set(note.pitch, list);
    }
    for (const list of byPitch.values()) {
      const sorted = [...list].sort((a, b) => a.startBeats - b.startBeats);
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i]!.startBeats < sorted[i - 1]!.startBeats + sorted[i - 1]!.lengthBeats - 1e-9) overlaps += 1;
      }
    }

    /**
     * **Sorted by start, then pitch, and each lyric is written immediately before its own note-on.** The order is fixed rather than the array's, because the
     * importer reads a lyric as belonging to the note-on that follows it: two notes at one tick must not be able to swap places between two writes of the
     * same arrangement. A `serial` keeps that adjacency when a chord writes several note-ons at one tick.
     */
    let serial = 0;
    for (const note of [...laneNotes].sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch)) {
      const rawStart = Math.max(0, note.startBeats) * division;
      const rawLength = Math.max(0, note.lengthBeats) * division;
      const startTick = Math.round(rawStart);
      // At least a tick, because a note with no duration is not a note: the importer refuses to report a zero length for the same reason.
      const durationTicks = Math.max(1, Math.round(rawLength));
      if (Math.abs(rawStart - startTick) > 1e-9) roundedStarts += 1;
      if (Math.abs(rawLength - durationTicks) > 1e-9) roundedLengths += 1;

      const pitch = Math.round(note.pitch);
      const velocity = Math.round(note.velocity);
      if (pitch < 0 || pitch > 127) clampedPitches += 1;
      /**
       * **Velocity 1 rather than 0.** A note-on with velocity zero *is* a note-off in MIDI, so a note exported at
       * velocity 0 would arrive as a release with nothing to release and the note would vanish. The model's own
       * type says 1–127 for the same reason.
       */
      if (velocity < 1 || velocity > 127) clampedVelocities += 1;
      const safePitch = Math.max(0, Math.min(127, pitch));
      const safeVelocity = Math.max(1, Math.min(127, velocity));

      const syllable = note.syllable?.trim();
      if (syllable) events.push({ tick: startTick, order: 1, serial: serial++, bytes: lyricBytes(syllable) });
      events.push({ tick: startTick, order: 1, serial: serial++, bytes: [0x90 | channel, safePitch, safeVelocity] });
      events.push({ tick: startTick + durationTicks, order: 0, serial: serial++, bytes: [0x80 | channel, safePitch, 0x40] });
      notes += 1;
    }

    chunks.push(trackChunk(events));
    tracks.push({ id: track.id, name: track.name, kind: track.kind, channel, notes: laneNotes.length });
  }

  if (roundedStarts > 0) {
    problems.push(`${roundedStarts} note(s) start between ticks at a division of ${division} and were rounded to the nearest one`);
  }
  if (roundedLengths > 0) {
    problems.push(`${roundedLengths} note(s) are not a whole number of ticks long at a division of ${division} and were rounded`);
  }
  if (clampedPitches > 0) problems.push(`${clampedPitches} note(s) had a pitch outside 0–127 and were clamped`);
  if (clampedVelocities > 0) {
    problems.push(`${clampedVelocities} note(s) had a velocity outside 1–127 and were clamped (a velocity of 0 is a note-off in MIDI)`);
  }
  if (overlaps > 0) {
    problems.push(
      `${overlaps} note(s) overlap another of the same pitch on one lane; MIDI cannot tell those apart, so a re-import pairs the note-offs first-in-first-out`
    );
  }

  const header = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // header length
    0x00, 0x01, // format 1: several tracks, one part each
    (chunks.length >> 8) & 0xff,
    chunks.length & 0xff,
    (division >> 8) & 0xff,
    division & 0xff,
  ];

  return {
    bytes: new Uint8Array([...header, ...chunks.flat()]),
    format: 1,
    division,
    tracks,
    notes,
    bpm,
    timeSignature: signature.text,
    tempoEvents,
    problems,
  };
}
