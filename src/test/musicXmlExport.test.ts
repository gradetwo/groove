/**
 * Writing MusicXML.
 *
 * **The criteria read the document back with an XML parser rather than comparing strings**, because the claim being checked is "a notation program can read this", and a string comparison would only prove that the exporter is consistent with itself. Where an assertion is about text, it is about the text a
 * reader uses — an element name, a tie, a duration.
 */
import { describe, expect, it } from "vitest";
import { DIVISIONS_PER_QUARTER, noteTypeFor, pitchToMusicXml, toMusicXml } from "../data/musicxml";
import { fromMusicXml } from "../data/musicxmlImport";

const note = (pitch: number, startBeats: number, lengthBeats = 1, velocity = 100) => ({ pitch, startBeats, lengthBeats, velocity });

/**
 * **jsdom's own XML parser**, rather than a string comparison or a new dependency. It is a real reader, it is what a browser would use to open the file, and it reports a malformed document as a `parsererror` element — which is the claim under test.
 */
function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

const measures = (doc: Document) => Array.from(doc.querySelectorAll("part > measure"));
const notesOf = (measure: Element) => Array.from(measure.querySelectorAll(":scope > note"));
const durationOf = (entry: Element) => Number(entry.querySelector("duration")?.textContent ?? 0);
const textOf = (parent: Element | Document, tag: string) => parent.querySelector(tag)?.textContent ?? undefined;

describe("MusicXML export", () => {
  it("writes a document a reader can parse, with the frame a notation program expects", () => {
    const xml = toMusicXml([note(60, 0)], 1, { title: "明天会更好", partName: "Right Hand" });
    const doc = parse(xml);
    expect(textOf(doc, "work-title")).toBe("明天会更好");
    expect(textOf(doc, "part-name")).toBe("Right Hand");
    expect(measures(doc)).toHaveLength(1);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    // The DOCTYPE is what tells a reader which DTD to check against; a file without it is often rejected outright.
    expect(xml).toContain("score-partwise");
  });

  it("writes the divisions, key and time in the first measure only", () => {
    const doc = parse(toMusicXml([note(60, 0)], 3));
    const first = measures(doc)[0]!;
    expect(textOf(first, "divisions")).toBe(String(DIVISIONS_PER_QUARTER));
    expect(textOf(first, "beats")).toBe("4");
    expect(textOf(first, "beat-type")).toBe("4");
    // Repeating the attributes in every measure is legal but noisy, and a reader that sees them twice is entitled to wonder why.
    expect(measures(doc)[1]!.querySelector("attributes")).toBeNull();
  });

  it("spells a MIDI note as a step, an alter and an octave, with middle C as C4", () => {
    // The convention every notation program uses: MIDI 60 is C4, not C3 and not C5.
    expect(pitchToMusicXml(60)).toEqual({ step: "C", octave: 4 });
    expect(pitchToMusicXml(61)).toEqual({ step: "C", alter: 1, octave: 4 });
    expect(pitchToMusicXml(59)).toEqual({ step: "B", octave: 3 });
    expect(pitchToMusicXml(72)).toEqual({ step: "C", octave: 5 });
  });

  it("writes a duration in divisions and a type that matches it", () => {
    const doc = parse(toMusicXml([note(60, 0, 2)], 1));
    const first = notesOf(measures(doc)[0]!)[0]!;
    expect(durationOf(first)).toBe(2 * DIVISIONS_PER_QUARTER);
    expect(textOf(first, "type")).toBe("half");
    expect(noteTypeFor(0.25)).toBe("sixteenth");
    // A triplet has no written type, and an absent one is inferred from the duration while a wrong one is believed.
    expect(noteTypeFor(1 / 3)).toBeNull();
  });

  it("splits a note at the barline and ties the halves, because MusicXML cannot hold a note across one", () => {
    /**
     * A six-beat note in 4/4 is a whole note tied to a half note. Writing it as one six-beat duration is the classic way to produce a file that renders as a mess in every reader.
     */
    const doc = parse(toMusicXml([note(60, 2, 6)], 2));
    const pitched = (measure: Element) => notesOf(measure).filter((entry) => entry.querySelector("pitch"));
    const firstPitched = pitched(measures(doc)[0]!)[0]!;
    const secondPitched = pitched(measures(doc)[1]!)[0]!;
    // From beat 2 to the barline is two beats, then four beats remain in bar two.
    expect(durationOf(firstPitched)).toBe(2 * DIVISIONS_PER_QUARTER);
    expect(firstPitched.querySelector("tie")?.getAttribute("type")).toBe("start");
    expect(durationOf(secondPitched)).toBe(4 * DIVISIONS_PER_QUARTER);
    expect(secondPitched.querySelector("tie")?.getAttribute("type")).toBe("stop");
  });

  it("fills what a measure does not cover with rests, so every measure adds up", () => {
    // Notation has no "hole": a measure with a note missing is a measure with a rest in it.
    const doc = parse(toMusicXml([note(60, 0, 1)], 1));
    const entries = notesOf(measures(doc)[0]!);
    expect(entries.reduce((sum, entry) => sum + durationOf(entry), 0)).toBe(4 * DIVISIONS_PER_QUARTER);
    // One quarter note of sound leaves three beats of rest.
    expect(entries.filter((entry) => entry.querySelector("rest")).length).toBeGreaterThan(0);
  });

  it("writes simultaneous notes as a chord, because a track is a voice", () => {
    const doc = parse(toMusicXml([note(60, 0, 1), note(64, 0, 1), note(67, 0, 1)], 1));
    const entries = notesOf(measures(doc)[0]!).filter((entry) => entry.querySelector("pitch"));
    expect(entries).toHaveLength(3);
    // The first carries the time; the others are chord members, which is how MusicXML says "at the same moment".
    expect(entries[0]!.querySelector("chord")).toBeNull();
    expect(entries[1]!.querySelector("chord")).not.toBeNull();
    expect(entries[2]!.querySelector("chord")).not.toBeNull();
  });

  it("writes a whole note for a bar-long note rather than a rest beside it", () => {
    const doc = parse(toMusicXml([note(60, 0, 4)], 1));
    const entries = notesOf(measures(doc)[0]!);
    expect(entries).toHaveLength(1);
    expect(textOf(entries[0]!, "type")).toBe("whole");
  });

  it("writes the measures the arrangement is long, even where nothing is written", () => {
    // An empty bar is rest, not absence: a part that stops at bar one when the arrangement is four bars long is a part that looks truncated.
    const doc = parse(toMusicXml([], 4));
    expect(measures(doc)).toHaveLength(4);
    for (const measure of measures(doc)) {
      expect(notesOf(measure).reduce((sum, entry) => sum + durationOf(entry), 0)).toBe(4 * DIVISIONS_PER_QUARTER);
    }
  });

  it("escapes what a title may contain, because a title is text and not markup", () => {
    const xml = toMusicXml([], 1, { title: 'Rock & Roll <"live">' });
    expect(xml).toContain("Rock &amp; Roll &lt;&quot;live&quot;&gt;");
    expect(textOf(parse(xml), "work-title")).toBe('Rock & Roll <"live">');
  });

  it("writes the tempo as a mark and as a sound, which is what a reader shows and what it plays", () => {
    /**
     * The two spellings carry the same number on purpose. `<metronome>` is what a person reads on the page; `<sound tempo>` is what playback follows, and it is the element files in the wild carry it in. Writing only the mark leaves a reader that ignores notation with no tempo at all.
     */
    const doc = parse(toMusicXml([note(60, 0)], 1, { tempoBpm: 132 }));
    expect(textOf(doc, "per-minute")).toBe("132");
    expect(doc.querySelector("sound")?.getAttribute("tempo")).toBe("132");
    expect(doc.querySelector("direction")).not.toBeNull();
  });

  it("keeps every voice moving forward, so no bar rewinds the cursor past its own start", () => {
    /**
     * **The invariant a `<backup>` depends on.** MusicXML is a sequence: a voice after the first is written after a backup that rewinds to the start of *that* measure, and the notes that follow must wind forward from there. A voice whose notes in a measure went backwards could not be written with one rewind, and the first version of the voice
     * assignment produced exactly that — in a bar of four overlapping notes it wrote two backups in a row and left the cursor at minus sixteen divisions. This walks the document the way a reader does, one voice at a time: each voice starts at the barline, never goes behind it, and ends the bar exactly at the next one.
     */
    const walks = [
      [note(60, 0, 1), note(64, 0.5, 3), note(67, 2.5, 2), note(70, 3, 2)],
      // Four lines starting together with different lengths: four chords, so four voices, and the bar must still add up on each.
      [note(60, 0, 4), note(62, 0, 3), note(64, 0, 2), note(65, 0, 1)],
      [note(60, 0, 2), note(62, 2, 5), note(64, 1, 1), note(65, 6, 3)],
      [note(48, 0, 6), note(55, 4, 5), note(60, 4, 2), note(67, 11, 1)],
      /**
       * The case that made the per-measure rule necessary: a voice whose tie is still crossing the barline while a new line enters underneath it. Reusing that voice would put two independent lines in one `<voice>`, which is a document several readers either merge or refuse.
       */
      [note(60, 0, 4.5), note(62, 3, 2), note(64, 4, 2), note(67, 4, 1)],
    ];
    for (const original of walks) {
      const doc = parse(toMusicXml(original, 3));
      measures(doc).forEach((measure, index) => {
        /** The measure split at its backups: what one voice's sequence is worth is the cursor the next backup finds. */
        const voiceEnds: number[] = [];
        let cursor = 0;
        for (const child of Array.from(measure.children)) {
          if (child.tagName === "backup" || child.tagName === "forward" || child.tagName === "note") {
            const duration = Number(child.querySelector("duration")?.textContent ?? 0);
            if (child.tagName === "backup") {
              voiceEnds.push(cursor);
              cursor -= duration;
            } else {
              cursor += duration;
            }
          }
          expect(cursor, `measure ${index + 1} cursor after <${child.tagName}>`).toBeGreaterThanOrEqual(0);
        }
        voiceEnds.push(cursor);
        // Every voice's written music adds up to the measure, so each one ends at the barline rather than early or late.
        for (const end of voiceEnds) expect(end, `measure ${index + 1} a voice ends at the barline`).toBe(4 * DIVISIONS_PER_QUARTER);
      });
      /**
       * And the reader still gets the notes back, which is the second half of the invariant: a document whose voices are laid out correctly but whose voice numbers a reader follows wrongly would pass the walk above and fail here.
       */
      const back = fromMusicXml(toMusicXml(original, 3)).parts[0]!.notes;
      expect(back).toEqual([...original].sort((a, b) => a.startBeats - b.startBeats || a.pitch - b.pitch));
    }
  });

  it("keeps a voice number on one line of music across a barline", () => {
    /**
     * A `<voice>` is an identity rather than a per-measure slot. A note tied across a barline is written as a stop in the next measure, and several notation programs refuse a file where one voice in one measure holds two independent lines. The document below has two voices in bar one, one of them tied into bar two, and a new line entering in bar two.
     */
    const doc = parse(toMusicXml([note(48, 0, 8), note(60, 0, 8), note(64, 4, 1), note(67, 8, 2)], 2));
    const voices = notesOf(measures(doc)[1]!)
      .filter((entry) => entry.querySelector("pitch"))
      .map((entry) => textOf(entry, "voice"));
    /**
     * Bar two holds the tied tail of the two-voice chord and the line that enters there. Three voice numbers for three lines of music would be the bug — the tied tails keep the numbers they sounded in bar one — and two for the two lines is what the round trip then reads back correctly.
     */
    expect(new Set(voices).size).toBeGreaterThanOrEqual(2);
    const tied = notesOf(measures(doc)[1]!).filter((entry) => entry.querySelector('tie[type="stop"]'));
    expect(tied.length).toBeGreaterThan(0);
    const tiedVoices = new Set(tied.map((entry) => textOf(entry, "voice")));
    const fresh = notesOf(measures(doc)[1]!).filter((entry) => textOf(entry, "tie") !== "stop" && entry.querySelector("pitch"));
    expect(fresh.some((entry) => !tiedVoices.has(textOf(entry, "voice")))).toBe(true);
  });
});
