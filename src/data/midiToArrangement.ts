/**
 * A MIDI file read as **arrangement tracks**, not as a step grid.
 *
 * The project already had a MIDI import, and it quantises into the old sixteen-step `DrumPattern` — the model the arrangement was built to replace. An agent or a person importing a real file wants what the file says: several named tracks, notes at their own positions, and each note as long as it is held. That is what this produces, in the same shape the MusicXML import produces, so both imports travel the same path into an arrangement and behave the same way.
 *
 * **Lengths come from the file.** The parser pairs every note-off with its note-on; a note the file never releases has no length, and this picks the arrangement's own default rather than inventing a musical value.
 */
import { parseMidiFile } from "../audio/MidiImporter";
import type { NoteEvent } from "../types/arrangementV2";
import type { ImportedPart } from "./musicxmlImport";

export interface MidiArrangementImport {
  parts: ImportedPart[];
  /** The tempo the file states, in quarter notes per minute. */
  tempoBpm?: number;
  /** The file's own resolution, in ticks per quarter note — reported because a caller comparing two imports needs to know they were read at the same scale. */
  division: number;
  /** The format the file declared: 0 for one track holding every channel, 1 for one track per part. */
  format: number;
  /**
   * What could not be read, said out loud. A file with no notes, or a track whose notes all lack a length, is worth a sentence rather than silence.
   */
  problems: string[];
}

/**
 * A note the file never releases: **a sixteenth of a whole note**, which is the shortest note a DAW grid normally draws and short enough not to smear a chord into the next bar.
 */
const UNRELEASED_NOTE_BEATS = 0.25;

/** Export for the criterion that checks the default, so the number is written once. */
export const DEFAULT_UNRELEASED_LENGTH_BEATS = UNRELEASED_NOTE_BEATS;

export function fromMidi(bytes: Uint8Array): MidiArrangementImport {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBufferLike;
  const parsed = parseMidiFile(buffer);
  const problems: string[] = [];
  const division = parsed.division > 0 ? parsed.division : 480;

  /**
   * Notes are grouped by the **track chunk** they came from, and only a **format-0** file is split further by channel.
   *
   * Format 0 packs a whole band onto one track and separates the instruments by channel, so without the split a song arrives as a single part. Format 1 already gives each part its own track, and a piano piece that happens to use two channels for two hands is one part, not two — splitting there would be worse than not splitting at all.
   */
  const byPart = new Map<string, { name: string; notes: NoteEvent[] }>();
  const format = parsed.format;
  const channelsPerTrack = new Map<number, Set<number>>();
  for (const note of parsed.notes) {
    const channels = channelsPerTrack.get(note.track) ?? new Set<number>();
    channels.add(note.channel);
    channelsPerTrack.set(note.track, channels);
  }

  let withoutLength = 0;
  for (const note of parsed.notes) {
    const splitByChannel = format === 0 && (channelsPerTrack.get(note.track)?.size ?? 0) > 1;
    const key = splitByChannel ? `${note.track}:${note.channel}` : String(note.track);
    const name = partName(parsed.trackNames[note.track], note, splitByChannel);
    const part = byPart.get(key) ?? { name, notes: [] };
    if (note.durationTicks === undefined) withoutLength += 1;
    part.notes.push({
      pitch: note.note,
      startBeats: note.tick / division,
      lengthBeats: (note.durationTicks ?? division * UNRELEASED_NOTE_BEATS) / division,
      velocity: note.velocity,
    });
    byPart.set(key, part);
  }

  const parts = [...byPart.values()]
    .filter((part) => part.notes.length > 0)
    // Sorted by start, then pitch, so two imports of the same file produce the same order and a criterion can compare them.
    .map((part) => ({
      ...part,
      notes: [...part.notes].sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch),
    }));

  /**
   * ⭐ **A track that held nothing is named rather than dropped in silence.**
   *
   * The parts are built from notes, so a track with none simply does not appear — and `problems` spoke only when the *whole file* was empty. In a multi-track file that lets a part vanish with nothing said, which is the difference between "the file has three parts" and "the file had four and one of them was empty".
   */
  const emptyTracks = [...byPart.values()].filter((part) => part.notes.length === 0).map((part) => part.name);
  if (parts.length === 0) problems.push("the file holds no notes");
  else if (emptyTracks.length > 0) {
    problems.push(`${emptyTracks.length} track(s) held no notes and are not parts: ${emptyTracks.join(", ")}`);
  }
  if (!parsed.tempoStated) {
    problems.push("the file states no tempo, so the arrangement's own default applies rather than a number read from the file");
  }
  if (withoutLength > 0) {
    problems.push(
      `${withoutLength} note(s) were never released by the file, so they were given the default length of ${UNRELEASED_NOTE_BEATS} beats`
    );
  }

  return {
    parts,
    /**
     * ⭐ **The tempo is reported only when the file stated it.**
     *
     * A file with no tempo event still needs *some* tempo to place its notes in time, so the parser assumes 120 — and this tool returned that assumption as `tempoBpm: 120`, which reads as "the file says 120". Muse reported it as a contradiction of this tool's own promise ("the tempo the file states"), and it is one: an assumption and a reading must not look alike. The assumption still happens; it is simply not presented as a fact about the file.
     */
    ...(parsed.tempoStated ? { tempoBpm: parsed.bpm } : {}),
    division,
    format: parsed.format,
    problems,
  };
}

/**
 * What to call the track: **the file's own name when it has one**, and a description of where the notes came from when it does not.
 *
 * A nameless track is common — a format-0 file often has one name for everything, or none — and "Track 2" is more use to someone looking at the arrangement than an empty label.
 */
function partName(trackName: string | undefined, note: { track: number; channel: number }, splitByChannel: boolean): string {
  const named = trackName?.trim();
  if (named) return splitByChannel ? `${named} (channel ${note.channel + 1})` : named;
  return splitByChannel ? `Track ${note.track + 1} (channel ${note.channel + 1})` : `Track ${note.track + 1}`;
}
