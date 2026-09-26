import { describe, it, expect } from "vitest";
import {
  buildAbletonLiveSetXml,
  exportAbletonLiveSet,
  TRACK_COLOR_PALETTES,
  TRACK_MIDI_MAPPINGS,
  ExportAlsOptions,
} from "../audio/AbletonExporter";
import { SequencerPattern } from "../types/genre";

describe("Ableton Live (.als) Project Exporter (P7-01)", () => {
  const mockPattern: SequencerPattern = {
    genre_id: "techno",
    bpm: 130,
    timeSignature: "4/4",
    resolution: "1/16",
    scale: "minor",
    swing: 20,
    totalSteps: 16,
    tracks: [
      {
        track_id: "kick",
        name: "Kick 909",
        instrument: "kick",
        steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        velocity: [127, 0, 0, 0, 110, 0, 0, 0, 120, 0, 0, 0, 110, 0, 0, 0],
        volume: 0.9,
        pan: 0.0,
      },
      {
        track_id: "snare",
        name: "Snare Drum",
        instrument: "snare",
        steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        velocity: [0, 0, 0, 0, 115, 0, 0, 0, 0, 0, 0, 0, 115, 0, 0, 0],
        sendA: 0.25,
      },
      {
        track_id: "hihat",
        name: "Hi-Hat",
        instrument: "hihat",
        steps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 0],
        ratchet: [1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      },
      {
        track_id: "percussion",
        name: "Clap",
        instrument: "clap",
        steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        mute: true,
      },
      {
        track_id: "bass",
        name: "Acid Bass",
        instrument: "synth_bass",
        steps: [1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        pitch: [36, null, 36, null, null, 39, null, null, 41, null, null, 43, null, null, 36, null],
        solo: true,
      },
      {
        track_id: "chords",
        name: "Dub Chords",
        instrument: "polysynth",
        steps: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        pitch: [48, null, null, null, null, null, null, null, 51, null, null, null, null, null, null, null],
        sendA: 0.5,
        sendB: 0.4,
      },
      {
        track_id: "lead",
        name: "Saw Lead",
        instrument: "lead",
        steps: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        pitch: [60, 63, 67, 70, 60, 63, 67, 70, 60, 63, 67, 70, 60, 63, 67, 72],
      },
      {
        track_id: "fx",
        name: "Noise Sweep",
        instrument: "fx",
        steps: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        pitch: [72],
      },
    ],
  };

  it("builds valid Ableton XML schema string with 8 tracks and master controls", () => {
    const xml = buildAbletonLiveSetXml({
      bpm: 130,
      pattern: mockPattern,
      genreName: "Berlin Techno",
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Ableton MajorVersion="5" MinorVersion="10.0_377"');
    expect(xml).toContain("</Ableton>");

    // Check 8 MIDI tracks
    const midiTracks = xml.match(/<MidiTrack Id="\d+"/g);
    expect(midiTracks).toHaveLength(8);

    // Check Return tracks (A-Reverb, B-Delay)
    const returnTracks = xml.match(/<ReturnTrack Id="\d+"/g);
    expect(returnTracks).toHaveLength(2);

    // Check Master track
    expect(xml).toContain("<MasterTrack Id=");
    expect(xml).toContain('<EffectiveName Value="Master" />');
    expect(xml).toContain('<Manual Value="130" />'); // BPM

    // Check Time signature
    expect(xml).toContain('<Numerator Value="4" />');
    expect(xml).toContain('<Denominator Value="4" />');

    // Check Scene naming
    expect(xml).toContain('Value="Berlin Techno Groove"');
  });

  it("assigns distinct 70-color palette indices and mixer attributes per track", () => {
    const xml = buildAbletonLiveSetXml({
      bpm: 120,
      pattern: mockPattern,
      genreName: "Deep House",
    });

    // Track 0: Kick (ColorIndex 154)
    expect(xml).toContain('<EffectiveName Value="Kick 909" />');
    expect(xml).toContain('<ColorIndex Value="154" />');

    // Track 1: Snare (ColorIndex 157, Send A = 0.25)
    expect(xml).toContain('<EffectiveName Value="Snare Drum" />');
    expect(xml).toContain('<ColorIndex Value="157" />');

    // Track 3: Clap (Muted)
    expect(xml).toContain('<EffectiveName Value="Clap" />');
    expect(xml).toContain('<ColorIndex Value="159" />');
    // Mute should set Speaker Manual to false
    expect(xml).toContain('<Speaker>\n\t\t\t\t\t\t<LomId Value="0" />\n\t\t\t\t\t\t<Manual Value="false" />');

    // Track 4: Bass (Soloed)
    expect(xml).toContain('<EffectiveName Value="Acid Bass" />');
    expect(xml).toContain('<ColorIndex Value="163" />');
    expect(xml).toContain('<SoloSink Value="true" />');

    // Track 5: Chords (Send A and Send B)
    expect(xml).toContain('<EffectiveName Value="Dub Chords" />');
    expect(xml).toContain('<Manual Value="0.5" />'); // Send A
    expect(xml).toContain('<Manual Value="0.4" />'); // Send B
  });

  it("converts notes, ratchets, swing, and chord voicings into KeyTracks", () => {
    const xml = buildAbletonLiveSetXml({
      bpm: 124,
      pattern: mockPattern,
      genreName: "Minimal",
    });

    // Kick notes (C1 = MIDI 36)
    expect(xml).toContain('<MidiKey Value="36" />');
    expect(xml).toContain('<MidiNoteEvent Time="0.000000"');
    expect(xml).toContain('Velocity="127"');

    // Hi-Hat ratchet: step 2 has ratchet=2 -> creates sub-events
    // Step 2 is at 0.5 beat, subdivision at 0.5 and 0.5 + 0.125 = 0.625
    expect(xml).toContain('Time="0.500000"');
    expect(xml).toContain('Time="0.625000"');

    // Open Hi-Hat at step 14 (stepVal=2 -> MIDI 46)
    expect(xml).toContain('<MidiKey Value="46" />');

    // Chords expansion: step 0 has baseNote 48 -> expands to 48, 51, 55 (triad)
    expect(xml).toContain('<MidiKey Value="48" />');
    expect(xml).toContain('<MidiKey Value="51" />');
    expect(xml).toContain('<MidiKey Value="55" />');
  });

  it("exports a valid gzip-compressed .als file package", async () => {
    const options: ExportAlsOptions = {
      bpm: 128,
      pattern: mockPattern,
      genreName: "Peak Time Techno",
    };

    const result = await exportAbletonLiveSet(options);

    expect(result.filename).toBe("Peak_Time_Techno.als");
    expect(result.xml).toBeDefined();
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.blob).toBeInstanceOf(Blob);

    // Verify gzip magic bytes (0x1f, 0x8b)
    expect(result.data[0]).toBe(0x1f);
    expect(result.data[1]).toBe(0x8b);
    expect(result.data.length).toBeGreaterThan(500);

    // Decompress and verify round-trip
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(result.data as unknown as BufferSource);
    writer.close();
    const decompressed = await new Response(ds.readable).text();

    expect(decompressed).toContain("<Ableton MajorVersion=\"5\"");
    expect(decompressed).toContain("<MasterTrack Id=");
    expect(decompressed).toContain("Peak Time Techno Groove");
  });

  it("handles polymeter loop lengths and non-4/4 time signatures gracefully", () => {
    const polyPattern: SequencerPattern = {
      genre_id: "polymeter_balkan",
      bpm: 140,
      timeSignature: "7/8",
      resolution: "1/8",
      scale: "dorian",
      totalSteps: 7,
      tracks: [
        {
          track_id: "kick",
          name: "Balkan Kick",
          instrument: "kick",
          trackLength: 7,
          steps: [1, 0, 1, 0, 1, 0, 0],
        },
      ],
    };

    const xml = buildAbletonLiveSetXml({
      bpm: 140,
      pattern: polyPattern,
      genreName: "Balkan Beats",
    });

    expect(xml).toContain('<Numerator Value="7" />');
    expect(xml).toContain('<Denominator Value="8" />');
    // Resolution 1/8 -> stepBeats = 0.5 -> total 7 steps * 0.5 = 3.5 beats
    expect(xml).toContain('<CurrentEnd Value="3.5" />');
    expect(xml).toContain('<LoopEnd Value="3.5" />');
  });
});

  /**
   * The baseline "one clip per section" has to change, stated as a check on the **artifact** Ableton opens rather than on the
   * code that writes it (`docs/DAW_MCP_REFACTOR.md`, stage 5's ALS item).
   *
   * Today the exporter takes **one pattern** and emits **one** `MidiClip` at `Time="0"`. When it gains a clip list, this test is
   * the diff: the same parse, with one element per section at distinct, increasing start positions.
   */
describe("Ableton exporter · the clip shape (stage 5's ALS item)", () => {
  it("writes exactly one MidiClip today, at time zero", () => {
    // Its own minimal pattern: the other suite's `mockPattern` is scoped to that block, and this check is about the clip shape.
    const pattern = {
      genre_id: "techno",
      bpm: 130,
      timeSignature: "4/4",
      resolution: "1/16",
      totalSteps: 16,
      tracks: [
        {
          track_id: "kick",
          name: "Kick",
          steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          velocity: new Array(16).fill(100),
          pitch: [36],
        },
      ],
    } as unknown as SequencerPattern;
    const xml = buildAbletonLiveSetXml({ bpm: 130, pattern, genreName: "Berlin Techno" } as never);
    /**
     * The **session** clip slot is `Id="0"` and holds one `MidiClip` at `Time="0"` — the builder hard-codes that pair, and a
     * multi-section export is exactly this becoming a slot per section. Counting `<MidiClip>` elements would not say anything:
     * a Live set also carries arrangement clips and one slot per track.
     */
    expect(xml).toContain('<ClipSlot Id="0">');
    const session = xml.slice(xml.indexOf('<ClipSlot Id="0">'));
    expect(session.slice(0, session.indexOf("</ClipSlot>"))).toContain('<MidiClip Id="');
    expect(xml).toMatch(/<MidiClip Id="\d+" Time="0">/);
  });

  /**
   * One clip per **section**, which in Ableton's session matrix means one clip per **scene** — the shape a song export needs and
   * a single flattened clip could not express. The builder places each of `clips` in scene *i*; with one clip, everything is
   * exactly as it was (the other suite's six cases still pass untouched).
   */
  it("fills a scene per clip and leaves the rest empty", () => {
    const pattern = (trackId: string) =>
      ({
        genre_id: "techno",
        bpm: 130,
        timeSignature: "4/4",
        resolution: "1/16",
        totalSteps: 16,
        tracks: [
          {
            track_id: trackId,
            name: trackId,
            steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
            velocity: new Array(16).fill(100),
            pitch: [36],
          },
        ],
      }) as unknown as SequencerPattern;

    const one = buildAbletonLiveSetXml({ bpm: 130, pattern: pattern("kick"), genreName: "x" } as never);
    const two = buildAbletonLiveSetXml({
      bpm: 130,
      pattern: pattern("kick"),
      genreName: "x",
      clips: [
        { pattern: pattern("kick"), name: "verse" },
        { pattern: pattern("snare"), name: "chorus" },
      ],
    } as never);

    /**
     * The empty-slot template is what a scene without a clip looks like, so one more section means one fewer of them — per
     * track. (Counting `<MidiClip>` inside a scene's slot is not possible with a regex: the match runs past the slot's own
     * boundary and finds the next track's clip, which is how the first version of this check read 7 where it expected 0.)
     */
    const emptySlots = (xml: string) => (xml.match(/<ClipSlot><Value \/><\/ClipSlot>/g) ?? []).length;
    // The set carries eight tracks (the palette's size), each with eight scenes: a second clip fills one more scene in **every**
    // track, so the drop is a multiple of the track count rather than one.
    const drop = emptySlots(one) - emptySlots(two);
    expect(drop).toBeGreaterThan(0);
    expect(drop % 8).toBe(0);
  });
});
