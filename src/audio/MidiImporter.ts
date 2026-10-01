/**
 * Standard MIDI File (SMF) Parser & Groove Importer (P4-03)
 * Supports SMF Type 0 and Type 1, variable-length quantity decoding,
 * running status, tempo and time-signature meta-events, `0x05` lyric meta-events,
 * and intelligent 8-track mapping.
 */

import { DrumPattern, Track } from "../types/genre";

export interface ParsedMidiNote {
  tick: number;
  channel: number;
  note: number;
  velocity: number;
  /**
   * **How long the note is held, in ticks** — absent when the file never released it.
   *
   * The step-model importer never needed this; an arrangement does. A DAW track holds *notes*, and a note without a length is a drum hit at best. It is paired from the file's own note-offs rather than guessed, and a file that leaves a note hanging says so by leaving this undefined instead of having a length invented for it.
   */
  durationTicks?: number;
  /**
   * Which track chunk the note came from, counting from zero.
   *
   * A format-1 file is **several tracks with names**, and `trackNames[track]` is the name of this one; without the index a multi-track file collapses into a single anonymous part.
   */
  track: number;
  /**
   * The syllable a `0x05` lyric meta event wrote for this note, when the file carries one.
   *
   * The event carries no channel, so it is bound to the note-on it **immediately precedes at the same tick** — which is where every writer puts it and where
   * this project's exporter puts it. Binding by tick alone would be wrong in a format-0 file, where a whole band shares one chunk: a syllable on the lead
   * would land on the kick that struck at the same instant.
   */
  syllable?: string;
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

/**
 * The three-step decoding above, as a function so a criterion can call it with bytes rather than through a whole file.
 */
export function decodeMidiText(bytes: Uint8Array): string {
  /**
   * NULs are stripped with a string replacement rather than a regular expression: a control character in a pattern trips `no-control-regex`, and the lint rule is right that it is usually a mistake.
   *
   * `split`/`join` rather than `String.prototype.replaceAll`, which is ES2021: `tsconfig.json` targets ES2020 with `lib: ["ES2020", …]`, so `replaceAll` is a **compile error** here even though every runtime that runs this app has it. Both branches of this merge arrived at the same spelling, for the same reason.
   */
  const trimmed = (text: string) => text.split("\u0000").join("").trimEnd();
  try {
    return trimmed(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    // Not UTF-8: the other encoding a Chinese file is likely to use.
  }
  try {
    return trimmed(new TextDecoder("gbk").decode(bytes));
  } catch {
    // An environment without the GBK table (a stripped ICU) still deserves a name rather than an exception.
  }
  return trimmed(String.fromCharCode(...bytes));
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

  /**
   * ⭐ **Text a person wrote**, as opposed to a tag the format defines.
   *
   * Standard MIDI Files say text is ASCII, and every real file in the wild that carries Chinese writes either **UTF-8** or **GBK** in these bytes. Reading them one byte at a time produced names like `Ã÷Ìì»á¸üºÃ` — which is GBK for "明天会更好", as measured on a real file — and `é¢ç´` for a UTF-8 "钢琴". The bytes are the file's, so the decoding is chosen from them rather than assumed:
   *
   *   · **UTF-8 first, strictly**: valid UTF-8 is the only case where a wrong guess is impossible for ASCII too, and a name that decodes cleanly is left alone.
   *   · **GBK second**, because that is what the other half of the files use. GBK bytes are almost never valid UTF-8, so the first rule rarely has to be second-guessed.
   *   · **Latin-1 last**, so an undecodable name still shows something rather than nothing.
   *
   * Trailing NULs are stripped: a real file pads a short name with them, and `贝司    (BB)\u0000` is not a name.
   */
  public readText(len: number): string {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
    this.pos += len;
    return decodeMidiText(bytes);
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
  /** Whether the file **stated** a tempo, so a caller can tell this parser's assumed 120 from a reading of the file. */
  tempoStated: boolean;
  /**
   * ⭐ **The file's own time signature, when it states one** — `"3/4"`, `"6/8"` — read from the `0x58` meta event.
   *
   * It was not read before, and an arrangement that carries a `timeSignature` could be exported and not read
   * back, which is exactly the asymmetry the MIDI export was written to close. The **first** stated signature is
   * the one reported: it is the one in effect at the start of the music, which is what an arrangement's single
   * `timeSignature` field can hold. A file that changes meter later is read by its opening meter, and the later
   * changes are not lost from the file — only unread, which this field does not claim otherwise.
   */
  timeSignature?: string;
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

  /**
   * ⭐ **120 is what a file that says nothing gets, and the caller is told that it said nothing.**
   *
   * Muse, importing through the MCP server, reported that a MIDI file with no tempo event came back as `tempoBpm: 120`, which contradicts the promise that the number is "the tempo the file states". The default is right — something has to be assumed to place the notes in time — but a caller cannot tell an assumption from a measurement, and this project does not let those two look alike.
   */
  let bpm = 120;
  let tempoStated = false;
  /** The first time signature the file states, which is the meter it opens in. */
  let timeSignature: string | undefined;
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
    /**
     * **The notes this track has started and not yet released**, keyed by channel and note number.
     *
     * A queue rather than a single index, because a file may start the same note twice before releasing either — and pairing a note-off with the wrong one gives the first note the second note's length. Absent pairing would leave every note the same length, which is exactly the difference between a DAW import and a step grid.
     */
    const sounding = new Map<string, number[]>();
    /**
     * The last `0x05` lyric read, waiting for the note-on it annotates.
     *
     * A lyric meta event has no channel, so it cannot be matched to a sounding note by anything it carries; the format's own convention is that it sits
     * immediately before the note-on it belongs to, and that is the rule here. It is only used at the **same tick**, so a lyric whose note never arrives
     * binds to nothing rather than sliding onto whatever note comes next.
     */
    let pendingLyric: { tick: number; text: string } | undefined;
    /**
     * Pair a note-off with the **earliest** unreleased note of that channel and number, which is what a synthesiser does when the same key is struck twice without a release between.
     *
     * A note-off with no matching note-on is not an error worth refusing the file over: it is a truncated or hand-edited file, and the alternative — throwing — would make a file that plays perfectly well unimportable.
     */
    const closeNote = (channel: number, note: number) => {
      const queue = sounding.get(`${channel}:${note}`);
      const index = queue?.shift();
      if (index === undefined) return;
      const started = notes[index];
      if (started === undefined) return;
      // At least a tick, because a zero-length note is not a note: some files emit note-on and note-off in the same event and would otherwise produce something that cannot sound.
      started.durationTicks = Math.max(1, currentTick - started.tick);
    };

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
            // The file said it, so the number is a reading rather than this parser's assumption.
            tempoStated = true;
          }
        } else if (metaType === 0x03) {
          // Track Name — a person's text, so it is decoded rather than read byte for byte.
          const name = reader.readText(metaLen);
          trackNames.push(name);
        } else if (metaType === 0x58) {
          /**
           * Time Signature: numerator, then the denominator as its **power of two**, then clocks per click and
           * 32nds per quarter, which nothing here needs. Read as a meter rather than skipped, so a file this
           * server wrote can be read back as the arrangement it came from.
           */
          const numerator = metaLen >= 1 ? reader.readUint8() : 0;
          const denominatorPower = metaLen >= 2 ? reader.readUint8() : 0;
          if (metaLen > 2) reader.pos += metaLen - 2;
          if (timeSignature === undefined && numerator > 0) {
            timeSignature = `${numerator}/${2 ** Math.min(7, Math.max(0, denominatorPower))}`;
          }
        } else if (metaType === 0x05) {
          /**
           * Lyric: a syllable, in the same encoding question as a track name and with the same answer. Held rather than discarded, because the note-on that
           * follows it at this tick is the note it is sung on.
           */
          const text = reader.readText(metaLen).trim();
          pendingLyric = text ? { tick: currentTick, text } : undefined;
        } else if (metaType === 0x01 || metaType === 0x04) {
          // Text and instrument name: decoded and dropped, because nothing in this model holds either.
          reader.readText(metaLen);
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
            /**
             * The waiting lyric is claimed here, and only when it sits at this tick: that is the note-on it was written for.
             */
            const syllable = pendingLyric?.tick === currentTick ? pendingLyric.text : undefined;
            pendingLyric = undefined;
            notes.push({ tick: currentTick, channel, note, velocity: vel, track: t, ...(syllable === undefined ? {} : { syllable }) });
            const key = `${channel}:${note}`;
            const queue = sounding.get(key) ?? [];
            queue.push(notes.length - 1);
            sounding.set(key, queue);
          } else {
            // A note-on with velocity zero is a note-off, and files use it constantly — ignoring it would leave most of a real file's notes with no length at all.
            closeNote(channel, note);
          }
        } else if (msgType === 0x80) {
          // Note Off
          closeNote(channel, reader.readUint8());
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

  return { format, tracksCount, division: division || 480, bpm, tempoStated, ...(timeSignature === undefined ? {} : { timeSignature }), notes, trackNames };
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
      /**
       * The syllable goes back where it came from: the step it sounds on. A lane with no lyric stays `undefined` — an instrumental line, exactly as before —
       * and a step with no word stays `null`, so the syllables that do exist keep their own index instead of sliding onto their neighbours.
       */
      if (n.syllable) {
        if (!t.syllables) t.syllables = new Array(totalSteps).fill(null);
        t.syllables[stepIdx] = n.syllable;
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
