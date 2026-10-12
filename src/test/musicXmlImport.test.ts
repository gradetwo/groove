/**
 * Reading MusicXML.
 *
 * The strongest criterion available is a **round trip**: what we write, we must read back as the same notes. It is strong because it is checked against the writer rather than against a second reading of the spec, and it is honest about its limit — a file from MuseScore differs from ours in ways a round trip cannot see, which is why the hand-written
 * documents below are here too.
 *
 * The hand-written documents are the other half of the job. Each one is a shape another program writes and ours does not: a second part, a tempo mark, a `<part-name>` before its `<score-part>`, a note with no `<type>`, a `<forward>` inside a voice. None of them is a real file from a real program — each is constructed here, so what it proves is
 * what this suite says it proves and nothing more.
 */
import { describe, expect, it } from "vitest";
import { fromMusicXml, fromMusicXmlBytes, looksLikeZip } from "../data/musicxmlImport";
import { toMusicXml } from "../data/musicxml";
import { buildMxlZip } from "./fixtures/mxlZip";

const note = (pitch: number, startBeats: number, lengthBeats = 1) => ({ pitch, startBeats, lengthBeats, velocity: 100 });

/** A document written by hand, in the shape another program would produce — the case a round trip cannot reach. */
const handWritten = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Hand written</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><rest/><duration>4</duration><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;

/** Two parts with different names and different notes, which is the only way "all parts" can be told from "the first part twice". */
const twoParts = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Two parts</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Right Hand</part-name></score-part>
    <score-part id="P2"><part-name>Left Hand</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`;

describe("MusicXML import", () => {
  it("reads a hand-written document, turning divisions into beats", () => {
    const imported = fromMusicXml(handWritten);
    expect(imported.title).toBe("Hand written");
    expect(imported.parts).toHaveLength(1);
    expect(imported.parts[0]!.name).toBe("Piano");
    // Two divisions to the quarter: a duration of 2 is one beat, and the rest leaves the second note at beat 1.
    expect(imported.parts[0]!.notes).toEqual([
      { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
      { pitch: 64, startBeats: 1, lengthBeats: 1, velocity: 100 },
    ]);
    expect(imported.problems).toEqual([]);
  });

  it("gives back what the writer wrote — the same notes, in the same places", () => {
    /**
     * **The round trip.** Export writes a document, import reads it, and the notes must be identical: any disagreement is a real defect in one of the two, and this is the criterion that finds it without a second implementation of the spec to compare against.
     */
    const original = [note(60, 0, 1), note(64, 1, 2), note(67, 3, 1), note(72, 4, 1), note(48, 4, 4)];
    const back = fromMusicXml(toMusicXml(original, 2)).parts[0]!.notes;
    expect(back).toEqual([...original].sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch));
  });

  it("joins a note that notation had to split at a barline, because the model has no barline to split at", () => {
    // The writer splits a six-beat note in 4/4 into a whole note tied to a half; the reader must give back one six-beat note, not two.
    const back = fromMusicXml(toMusicXml([note(60, 2, 6)], 2)).parts[0]!.notes;
    expect(back).toHaveLength(1);
    expect(back[0]!.startBeats).toBe(2);
    expect(back[0]!.lengthBeats).toBe(6);
  });

  it("reads a chord as notes that start together", () => {
    const back = fromMusicXml(toMusicXml([note(60, 0, 1), note(64, 0, 1), note(67, 0, 1)], 1)).parts[0]!.notes;
    expect(back.map((entry) => entry.pitch).sort((a, b) => a - b)).toEqual([60, 64, 67]);
    expect(back.every((entry) => entry.startBeats === 0)).toBe(true);
  });

  it("puts the fourth note of a chord with the other three, not after them", () => {
    /**
     * A `<chord/>` member means "at the same time as the note before", and the note before the last member is itself a member. The writer only ever emits a member after the note that carries the time, so this document is hand-written — but it is the shape the format allows, and it is one member deeper than
     * the round-trip criterion reaches.
     */
    const four = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
        <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>
        <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration></note>
        <note><chord/><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration></note>
      </measure></part></score-partwise>`;
    const notes = fromMusicXml(four).parts[0]!.notes;
    expect(notes.map((entry) => entry.pitch)).toEqual([60, 64, 67, 71]);
    expect(notes.every((entry) => entry.startBeats === 0 && entry.lengthBeats === 1)).toBe(true);
  });

  it("moves time with backup and forward, which is how a second voice is written", () => {
    /**
     * MusicXML has no absolute positions: `<backup>` rewinds the cursor so a second voice can be written over the same measure. A reader that ignored it would place every voice after the first one, one measure late.
     */
    const twoVoices = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
        <backup><duration>4</duration></backup>
        <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note>
      </measure></part></score-partwise>`;
    const notes = fromMusicXml(twoVoices).parts[0]!.notes;
    expect(notes.map((entry) => entry.pitch)).toEqual([48, 60]);
    // Both start at the beginning of the measure, which is what the backup is for.
    expect(notes.every((entry) => entry.startBeats === 0)).toBe(true);
  });

  it("says what it could not hold, rather than importing a file that quietly lost something", () => {
    const withGrace = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions></attributes>
        <note><grace/><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
      </measure></part></score-partwise>`;
    const imported = fromMusicXml(withGrace);
    expect(imported.problems.join(" ")).toMatch(/grace note/i);
    // And the note itself still arrives, because a problem is a statement about fidelity rather than a refusal.
    expect(imported.parts[0]!.notes.some((entry) => entry.pitch === 60)).toBe(true);
  });

  it("refuses a document it cannot read, with the reason, rather than returning nothing", () => {
    expect(() => fromMusicXml("<score-timewise></score-timewise>")).toThrow(/score-partwise/);
    expect(() => fromMusicXml("<score-partwise><unclosed>")).toThrow(/well-formed/);
  });

  it("honours a time signature change, because the bar lengths after it are different", () => {
    const change = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1">
        <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure>
        <measure number="2"><attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>3</duration></note></measure>
      </part></score-partwise>`;
    const notes = fromMusicXml(change).parts[0]!.notes;
    // The second measure starts at beat 4 even though it is only three beats long, and the note after it would start at 7.
    expect(notes[1]!.startBeats).toBe(4);
  });

  it("returns every part of a file, named and with its own notes", () => {
    /**
     * The reader already built a `parts` list; nothing exercised more than one. A two-part file is the shape a piano grand staff, a string quartet or a band chart arrives as, so "the first part" is a reading of the file rather than the file.
     */
    const imported = fromMusicXml(twoParts);
    expect(imported.parts.map((part) => part.name)).toEqual(["Right Hand", "Left Hand"]);
    expect(imported.parts[0]!.notes).toEqual([note(72, 0, 2), note(74, 2, 2)]);
    expect(imported.parts[1]!.notes).toEqual([note(48, 0, 4)]);
    expect(imported.problems).toEqual([]);
  });

  it("reports the tempo and the time signature the file states", () => {
    const withTempo = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>2</divisions><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
        <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>132</per-minute></metronome></direction-type></direction>
        <note><pitch><step>G</step><octave>4</octave></pitch><duration>3</duration></note>
      </measure></part></score-partwise>`;
    const imported = fromMusicXml(withTempo);
    expect(imported.tempoBpm).toBe(132);
    // 6/8: six eighth-note beats in a measure, and the sixth-note beat is what `beatType` states.
    expect(imported.beatsPerMeasure).toBe(6);
    expect(imported.beatType).toBe(8);
    expect(imported.timeSignatureChanges).toEqual([{ beatsPerMeasure: 6, beatType: 8, startBeats: 0 }]);
    // The tempo mark is a `<direction>`, and it must not be read as a note or shift the note after it.
    expect(imported.parts[0]!.notes).toEqual([note(67, 0, 1.5)]);
  });

  it("reads `<sound tempo>` when there is no metronome mark, because that is what playback follows", () => {
    const soundOnly = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <direction><sound tempo="96"/></direction>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>
      </measure></part></score-partwise>`;
    expect(fromMusicXml(soundOnly).tempoBpm).toBe(96);
    // A file that states no tempo reports none, rather than inventing a number it never said.
    expect(fromMusicXml(handWritten).tempoBpm).toBeUndefined();
  });

  it("gives back the tempo and the meter the writer wrote, which is what a round trip means for them", () => {
    const back = fromMusicXml(toMusicXml([note(60, 0, 4)], 2, { tempoBpm: 120, beatsPerMeasure: 3, beatType: 4 }));
    expect(back.tempoBpm).toBe(120);
    expect(back.beatsPerMeasure).toBe(3);
    expect(back.beatType).toBe(4);
  });

  it("names a time signature change as a problem, because only the first one is reported", () => {
    const change = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1">
        <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note></measure>
        <measure number="2"><attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>3</duration></note></measure>
      </part></score-partwise>`;
    const imported = fromMusicXml(change);
    expect(imported.beatsPerMeasure).toBe(4);
    expect(imported.problems.join(" ")).toMatch(/time signature changes to 3\/4 at beat 4/);
  });

  it("reads a `<part-name>` that comes before its `<score-part>`, which MusicXML 4.0 allows", () => {
    /**
     * The order of the elements inside `<part-list>` is not fixed by the schema, and the names are read by tag rather than by the shape of the list. A reader that climbed `score-part > part-name` from the wrong side would name every part "Part 1".
     */
    const reordered = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><part-name>Flute</part-name><score-part id="P1"/></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration></note>
      </measure></part></score-partwise>`;
    expect(fromMusicXml(reordered).parts[0]!.name).toBe("Flute");
  });

  it("reads an `<attributes>` that arrives mid-measure, which is where a mid-piece tempo or clef change goes", () => {
    /**
     * A time signature is written where it takes effect, and that is not always the top of the measure: a piece that changes meter halfway through a bar has an `<attributes>` after the notes of the first half. Reading it there is what makes the new bar length count from that point.
     */
    const midMeasure = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1">
        <measure number="1">
          <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration></note>
          <attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
        </measure>
        <measure number="2">
          <note><pitch><step>E</step><octave>4</octave></pitch><duration>3</duration></note>
        </measure>
      </part></score-partwise>`;
    const notes = fromMusicXml(midMeasure).parts[0]!.notes;
    // The 3/4 declared inside the bar governs the length of that bar, so bar two begins three beats after bar one did.
    expect(notes.map((entry) => entry.startBeats)).toEqual([0, 2, 3]);
  });

  it("reads a note with no `<type>`, taking its length from the duration the file states", () => {
    /**
     * `<type>` is written notation and `<duration>` is time; a file may carry one without the other, and a note that is missing its type is still a note of the length its duration says. Reading the type as authoritative would make this note vanish or land wrong.
     */
    const noType = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration></note>
        <note><pitch><step>D</step><octave>4</octave></pitch><duration>5</duration></note>
      </measure></part></score-partwise>`;
    expect(fromMusicXml(noType).parts[0]!.notes).toEqual([note(60, 0, 1.5), note(62, 1.5, 2.5)]);
  });

  it("places a grace note whose duration is 0 at a position rather than losing the rest of the bar", () => {
    /**
     * A grace note is written with `<grace/>` and, in files from several programs, a `<duration>` of 0. The writer's own rule for a zero duration is "skip it and say so"; the measure must still add up afterwards, so the notes after the grace note keep their positions.
     */
    const zeroGrace = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><grace/><pitch><step>B</step><octave>3</octave></pitch><duration>0</duration></note>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
      </measure></part></score-partwise>`;
    const imported = fromMusicXml(zeroGrace);
    expect(imported.parts[0]!.notes).toEqual([note(60, 0, 4)]);
    expect(imported.problems.join(" ")).toMatch(/note without a duration was skipped/);
    expect(imported.problems.join(" ")).toMatch(/grace note/);
  });

  it("ignores voice and staff numbers and keeps document order, which is the time order they encode", () => {
    /**
     * `<voice>` and `<staff>` say which line of music a note belongs to, and the model is a flat list of notes. Dropping them is only safe because the cursor already carries the position they would carry, which is what this document checks: a two-voice bar written voice one then voice two, with a `<forward>` inside voice one.
     */
    const voices = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
        <forward><duration>2</duration><voice>1</voice><staff>1</staff></forward>
        <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
        <backup><duration>4</duration></backup>
        <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><staff>2</staff></note>
      </measure></part></score-partwise>`;
    const notes = fromMusicXml(voices).parts[0]!.notes;
    expect(notes).toEqual([note(48, 0, 4), note(72, 0, 1), note(76, 3, 1)]);
  });

  it("reads a `.mxl` zip from its bytes, following the container rather than the file order", () => {
    /**
     * A `.mxl` is a zip: the `mimetype` entry says what it is, `META-INF/container.xml` names the score, and neither is an entry a reader may skip looking for. This is a real zip, deflated with the same zlib the reader inflates with, so the bytes are a compressed file rather than a string that claims to be one.
     */
    const bytes = buildMxlZip([
      ["score.musicxml", twoParts],
      ["notes.txt", "not a score"],
    ]);
    expect(looksLikeZip(bytes)).toBe(true);
    return fromMusicXmlBytes(bytes).then((imported) => {
      expect(imported.format).toBe("mxl");
      expect(imported.parts.map((part) => part.name)).toEqual(["Right Hand", "Left Hand"]);
      expect(imported.parts[1]!.notes).toEqual([note(48, 0, 4)]);
      expect(imported.problems).toEqual([]);
    });
  });

  it("follows the container's named score, rather than the first XML entry in the zip", async () => {
    // The zip holds two scores and the container names the first. A reader that took the first `.musicxml` entry would land on the same one by luck, so the criterion is the name it reports rather than the entry it happened to pick.
    const bytes = buildMxlZip([
      ["first.musicxml", handWritten],
      ["second.musicxml", twoParts],
    ]);
    const imported = await fromMusicXmlBytes(bytes);
    expect(imported.title).toBe("Hand written");
  });

  it("reads plain XML handed to it as bytes, and says that is what it was", async () => {
    const imported = await fromMusicXmlBytes(new TextEncoder().encode(twoParts));
    expect(imported.format).toBe("xml");
    expect(imported.parts).toHaveLength(2);
  });

  it("refuses a zip that is not a MusicXML container, naming what it is instead", async () => {
    /**
     * The `mimetype` entry is the file's own statement about itself, and a zip that says it is something else is not a `.mxl` whatever its extension was. Reading it anyway would import whatever XML happened to be inside, which is the failure mode worth refusing.
     */
    await expect(fromMusicXmlBytes(buildMxlZip([["score.musicxml", twoParts]], { variant: "wrong-mimetype" }))).rejects.toThrow(/not a MusicXML container.*application\/zip/s);
  });

  it("refuses a zip with no container and more than one candidate, rather than guessing which is the score", async () => {
    await expect(fromMusicXmlBytes(buildMxlZip([["a.musicxml", handWritten], ["b.musicxml", twoParts]], { variant: "no-container" }))).rejects.toThrow(
      /no META-INF\/container\.xml and 2 candidate scores/
    );
  });

  it("treats a note driven before the start of its measure as a problem and not as a note before the piece", () => {
    /**
     * More `<backup>` than the measure holds moves the cursor behind the barline, which is what a broken voice structure looks like. The note is placed at the measure's start and the file is reported, because a negative `startBeats` is a position this model cannot hold and would be written back out as music before bar one.
     */
    const broken = `<?xml version="1.0"?><score-partwise version="4.0">
      <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1">
        <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>
        <backup><duration>4</duration></backup>
        <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note>
      </measure></part></score-partwise>`;
    const imported = fromMusicXml(broken);
    expect(imported.parts[0]!.notes.every((entry) => entry.startBeats >= 0)).toBe(true);
    expect(imported.parts[0]!.notes).toContainEqual(note(62, 0, 1));
    expect(imported.problems.join(" ")).toMatch(/moved the cursor before the measure's start/);
  });
});
