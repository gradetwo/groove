/**
 * **The lyrics leaving the building**: a syllable written by the MIDI export as a `0x05` lyric meta event and by `toMusicXml` as a `<lyric>`, read back by the two
 * importers, and bound to the note it left on.
 *
 * The criterion is a **round trip** rather than "the bytes contain the word", because the failure this is written against is a binding one: a syllable that
 * comes back on the note *after* the one it left on still contains every word and sings the wrong one. So each assertion compares which note carries which
 * syllable, and `SequencerTrack.syllables` deliberately has a `null` between two real syllables — an index that shifts shows up as `够` moving onto the note
 * at step four, which is the mistake this would otherwise pass.
 *
 * The pattern below also puts a **kick at the same tick as the first syllable**. A lyric event carries no channel or pitch, so a reader that matched it by tick
 * alone would hand the word to the drum; the exporter writes the lyric immediately before the note-on it belongs to, and the importer reads it that way.
 */
import { describe, expect, it } from "vitest";
import { generateMidiBytes } from "../audio/MidiExporter";
import { importMidiToPattern, parseMidiFile } from "../audio/MidiImporter";
import { toMusicXml } from "../data/musicxml";
import { fromMusicXml } from "../data/musicxmlImport";
import { fromMidi } from "../data/midiToArrangement";
import { arrangementToMidi } from "../data/arrangementToMidi";
import { TOOLS } from "../../mcp/registry";
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";

const STEPS = 16;

function lane(track_id: SequencerTrack["track_id"], name: string, instrument: string, extra: Partial<SequencerTrack> = {}): SequencerTrack {
  return { track_id, name, instrument, steps: new Array(STEPS).fill(0), ...extra };
}

/** The syllables of the sung lane, with a `null` at step four: the note there sounds but has no word, and the two that do must not move. */
const VOCAL_SYLLABLES: (string | null)[] = (() => {
  const syllables = new Array(STEPS).fill(null) as (string | null)[];
  syllables[0] = "能";
  syllables[8] = "够";
  return syllables;
})();

/**
 * A full eight-lane pattern — the exporter maps a lane to a channel **by its index**, so a pattern with one lane in it is a drum part — with one sung lead and
 * one kick striking at tick zero.
 */
function sungPattern(): SequencerPattern {
  const leadSteps = new Array(STEPS).fill(0);
  leadSteps[0] = 1;
  leadSteps[4] = 1;
  leadSteps[8] = 1;
  const leadPitch = new Array(STEPS).fill(null) as (number | null)[];
  leadPitch[0] = 60;
  leadPitch[4] = 62;
  leadPitch[8] = 64;
  const kickSteps = new Array(STEPS).fill(0);
  kickSteps[0] = 1;
  return {
    genre_id: "test",
    bpm: 120,
    scale: "C major",
    swing: 0,
    totalSteps: STEPS,
    tracks: [
      lane("kick", "Kick", "kick", { steps: kickSteps }),
      lane("snare", "Snare", "snare"),
      lane("hihat", "HiHat", "hihat"),
      lane("percussion", "Perc", "percussion"),
      lane("bass", "Bass", "synth"),
      lane("chords", "Pad", "synth"),
      /**
       * `gate` is two steps, so every note is half a beat: the MusicXML round trip below is checked with `toEqual`, and the reader lengthens anything shorter
       * than an eighth to an eighth (`musicxmlImport.ts`'s own grid). A shorter note would come back at 0.5 beats — a difference of the notation grid's, not of
       * the lyric binding's — and the criterion would be measuring the wrong thing.
       */
      lane("lead", "Lead", "synth", {
        steps: leadSteps,
        pitch: leadPitch,
        gate: new Array(STEPS).fill(2),
        velocity: new Array(STEPS).fill(100),
        syllables: VOCAL_SYLLABLES,
      }),
      lane("fx", "FX", "synth"),
    ],
  };
}

/** The parser and the step importer take `ArrayBufferLike`; a `Uint8Array` is often a view into a larger buffer, so the slice is the file. */
const bufferOf = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBufferLike;

const parse = (bytes: Uint8Array) => parseMidiFile(bufferOf(bytes));

/** What each note of a channel says, as the tuple the binding claim is about. */
const soundingOf = (notes: Array<{ tick: number; note: number; channel: number; syllable?: string }>, channel: number) =>
  notes.filter((note) => note.channel === channel).map((note) => [note.tick, note.note, note.syllable]);

describe("lyrics in a MIDI export", () => {
  it("writes a 0x05 lyric on the note it is sung on, not on the note that happens to share its tick", () => {
    const bytes = generateMidiBytes({ bpm: 120, pattern: sungPattern() });
    const parsed = parse(bytes);

    // Step zero is tick 0, step four 480, step eight 960 at a sixteenth grid and 480 ticks per quarter.
    expect(soundingOf(parsed.notes, 2)).toEqual([
      [0, 60, "能"],
      [480, 62, undefined],
      [960, 64, "够"],
    ]);
    // The kick is on channel 10 at tick zero and must have been left alone: a lyric bound by tick would have landed here.
    expect(soundingOf(parsed.notes, 9)).toEqual([[0, 36, undefined]]);
  });

  it("is reachable through the MCP `export_midi` tool, whose schema did not have to change", () => {
    /**
     * ⭐ The repository's own rule is that a capability may not exist only inside a test or only behind the interface: a composer working through MCP exports
     * the pattern whose lane carries `syllables`, and the words have to be in the bytes the tool returns. No tool was added or altered for this — the pattern
     * schema already passed `syllables` through (`src/test/mcpSchemaPassthrough.test.ts`), and the writing happens in the exporter both callers share.
     */
    const tool = TOOLS.find((candidate) => candidate.name === "export_midi")!;
    expect(tool, "export_midi must be on the MCP surface").toBeTruthy();
    const result = tool.handler({ pattern: sungPattern(), bpm: 120 }) as { base64: string; bytes: number };
    const bytes = new Uint8Array(Buffer.from(result.base64, "base64"));
    expect(result.bytes).toBe(bytes.length);
    expect(soundingOf(parse(bytes).notes, 2)).toEqual([
      [0, 60, "能"],
      [480, 62, undefined],
      [960, 64, "够"],
    ]);
  });

  it("puts the syllables back on their own steps, so the null between them does not shift the rest", () => {
    const result = importMidiToPattern(bufferOf(generateMidiBytes({ bpm: 120, pattern: sungPattern() })), { totalSteps: STEPS, quantization: "1/16" });
    const lead = result.pattern.tracks.find((candidate) => candidate.track_id === "lead")!;

    // The whole array, not just the words that are in it: `够` on step eight is the assertion an off-by-one binding fails.
    expect(lead.syllables).toEqual(VOCAL_SYLLABLES);
    // A lane that was never sung stays an instrumental lane rather than gaining a row of nulls.
    expect(result.pattern.tracks.find((candidate) => candidate.track_id === "kick")!.syllables).toBeUndefined();
  });

  it("keeps two drum lanes' words apart although every drum lane is channel 10", () => {
    /**
     * Every drum lane shares MIDI channel 10, so channel cannot separate their lyrics — only the order of the events can. The kick strikes a two-note stack at
     * one tick and the snare strikes once, a shape where matching lyrics to notes by channel alone would hand the snare's word to the kick's second note.
     */
    const kickSteps = new Array(STEPS).fill(0);
    kickSteps[0] = 1;
    const snareSteps = new Array(STEPS).fill(0);
    snareSteps[0] = 1;
    const kickSyllables = new Array(STEPS).fill(null) as (string | null)[];
    kickSyllables[0] = "咚";
    const snareSyllables = new Array(STEPS).fill(null) as (string | null)[];
    snareSyllables[0] = "哒";
    const kickPitches = new Array(STEPS).fill(null) as (number[] | null)[];
    kickPitches[0] = [36, 43];
    const pattern: SequencerPattern = {
      genre_id: "test",
      bpm: 120,
      scale: "C major",
      totalSteps: STEPS,
      tracks: [
        lane("kick", "Kick", "kick", { steps: kickSteps, pitches: kickPitches, syllables: kickSyllables }),
        lane("snare", "Snare", "snare", { steps: snareSteps, syllables: snareSyllables }),
      ],
    };

    const result = importMidiToPattern(bufferOf(generateMidiBytes({ bpm: 120, pattern })), { totalSteps: STEPS });
    expect(result.pattern.tracks.find((candidate) => candidate.track_id === "kick")!.syllables?.[0]).toBe("咚");
    expect(result.pattern.tracks.find((candidate) => candidate.track_id === "snare")!.syllables?.[0]).toBe("哒");
  });
});

describe("lyrics in a MusicXML export", () => {
  const sung: NoteEvent[] = [
    { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100, syllable: "能" },
    { pitch: 62, startBeats: 1, lengthBeats: 1, velocity: 100 },
    { pitch: 64, startBeats: 2, lengthBeats: 1, velocity: 100, syllable: "够" },
  ];

  it("writes a <lyric> with a <syllabic> and a <text>, on the sung notes only", () => {
    const xml = toMusicXml(sung, 1);
    expect(xml).toContain('<lyric number="1"><syllabic>single</syllabic><text>能</text></lyric>');
    expect(xml).toContain('<lyric number="1"><syllabic>single</syllabic><text>够</text></lyric>');
    // Two lyrics for two syllables: an unsung note gains none, and no syllable is written twice.
    expect(xml.match(/<lyric /g) ?? []).toHaveLength(2);
  });

  it("reads them back onto the same notes, in the same order", () => {
    const back = fromMusicXml(toMusicXml(sung, 1)).parts[0]!.notes;
    expect(back).toEqual(sung);
    expect(back.map((note) => [note.pitch, note.syllable])).toEqual([
      [60, "能"],
      [62, undefined],
      [64, "够"],
    ]);
  });

  it("writes a tied note's lyric once, on its head, and reads it back on the one note", () => {
    // A six-beat note in 4/4 is two written notes: the syllable belongs to the note, not to each piece of it.
    const tied: NoteEvent[] = [{ pitch: 60, startBeats: 0, lengthBeats: 6, velocity: 100, syllable: "长" }];
    const xml = toMusicXml(tied, 2);
    // A whole note tied to a half note is two `<note>` elements; the lyric is written on the first and not repeated on the tie's tail.
    expect(xml.match(/<lyric /g) ?? []).toHaveLength(1);
    expect(fromMusicXml(xml).parts[0]!.notes).toEqual(tied);
  });

  it("moves a lyric written under a chord member onto the note the chord hangs off", () => {
    /**
     * The specification puts the syllable on a chord's first note, which is where this writer puts it — but an editor may attach it to whichever member the
     * singer's line was drawn under, and the model holds one syllable per sounding event. The hand-written document is the case a round trip cannot reach.
     */
    const imported = fromMusicXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>梦</text></lyric></note>
      <note><rest/><duration>2</duration><type>half</type></note>
    </measure>
  </part>
</score-partwise>`
    ).parts[0]!.notes;

    expect(imported).toEqual([
      { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100, syllable: "梦" },
      { pitch: 64, startBeats: 0, lengthBeats: 1, velocity: 100 },
    ]);
  });

  it("moves a lyric written under a tie's continuation back to the note the tie began on", () => {
    const imported = fromMusicXml(
      `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="stop"/><lyric number="1"><syllabic>single</syllabic><text>一</text></lyric></note>
    </measure>
  </part>
</score-partwise>`
    ).parts[0]!.notes;

    // One note of four beats, with its syllable: two notes in the file are one sounding event in the model.
    expect(imported).toEqual([{ pitch: 60, startBeats: 0, lengthBeats: 4, velocity: 100, syllable: "一" }]);
  });
});

describe("the two formats together", () => {
  it("carries the lyrics from the step grid through the MIDI file and into the score, note for note", () => {
    /**
     * ⭐ **The criterion the adjudication row asks for.** The words start in `SequencerTrack.syllables`, leave as a `.mid`, are read back as notes, are written
     * as MusicXML and read back again — and every syllable is still on the note it started on. Each hop is the real importer, so a mistake in the VLQ delta,
     * the event order or the `<lyric>` placement shows up here and nowhere else.
     */
    const notes = fromMidi(generateMidiBytes({ bpm: 120, pattern: sungPattern() })).parts.find((part) => part.notes.some((note) => note.syllable))!.notes;
    expect(notes.map((note) => [note.pitch, note.startBeats, note.syllable])).toEqual([
      [60, 0, "能"],
      [62, 1, undefined],
      [64, 2, "够"],
    ]);

    const back = fromMusicXml(toMusicXml(notes, 1)).parts[0]!.notes;
    expect(back).toEqual(notes);
  });

  it("carries an arrangement's lyrics through `arrangementToMidi`, chord and all", () => {
    /**
     * A chord is two notes at one tick; the lyric belongs to the sounding event, so it comes back on one of them and not on both. The writer puts the lyric
     * immediately before its own note-on, which is the only way a channel-less event can say which note it belongs to.
     */
    const arrangement: ArrangementV2 = {
      songId: "s",
      tracks: [{ id: "t1", kind: "instrument", name: "Voice" }],
      notesByTrack: {
        t1: [
          { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100, syllable: "能" },
          { pitch: 64, startBeats: 0, lengthBeats: 1, velocity: 100 },
          { pitch: 62, startBeats: 1, lengthBeats: 1, velocity: 100, syllable: "够" },
        ],
      },
      sourceSlots: [],
    };

    expect(fromMidi(arrangementToMidi(arrangement).bytes).parts[0]!.notes).toEqual([
      { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100, syllable: "能" },
      { pitch: 64, startBeats: 0, lengthBeats: 1, velocity: 100 },
      { pitch: 62, startBeats: 1, lengthBeats: 1, velocity: 100, syllable: "够" },
    ]);
  });
});

describe("a file with no lyrics", () => {
  it("imports exactly as it did before, without gaining an empty lyric anywhere", () => {
    // The instrumental pattern is the sung one with the syllables removed: nothing else about it changes.
    const instrumental: SequencerPattern = {
      ...sungPattern(),
      tracks: sungPattern().tracks.map(({ syllables: _dropped, ...rest }) => rest),
    };
    const bytes = generateMidiBytes({ bpm: 120, pattern: instrumental });

    expect(parse(bytes).notes.every((note) => note.syllable === undefined)).toBe(true);
    expect(fromMidi(bytes).parts.every((part) => part.notes.every((note) => note.syllable === undefined))).toBe(true);
    // An instrumental lane has no syllable array at all — not an array of nulls, which would be a lyric row on every track.
    expect(importMidiToPattern(bufferOf(bytes)).pattern.tracks.every((track) => track.syllables === undefined)).toBe(true);

    const notes: NoteEvent[] = [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }];
    const xml = toMusicXml(notes, 1);
    expect(xml).not.toContain("<lyric");
    expect(fromMusicXml(xml).parts[0]!.notes).toEqual(notes);
  });
});
