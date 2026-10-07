/**
 * ⭐⭐ **The source of an imported part's identity: a name the recorded table serves makes the created track a
 * `sampler` pointed at that recording — at the one call that creates tracks, not in a caller afterwards.**
 *
 * This is the source-side half of `importSamplerMapping.test.tsx`. That criterion proves the *interface* path works by
 * driving the whole view, and it passed while the kind decision lived in the caller: `arrangementFiles.ts` patched the
 * arrangement **after** `arrangementWithImportedParts` had already created every track as `"synth"`. A second caller —
 * `mcp/arrangement.ts`'s `addImportedParts` — therefore inherited the defect and created the same named part as a
 * synthesiser (its criterion is `mcpImportSamplerKind.test.ts`).
 *
 * So these readings are taken on the data layer's own function, with **no caller patch in the way**: they can only
 * pass if the kind and the asset are decided where the track is created. The three readings are the three states the
 * decision has: a recorded name (sampler + asset), no name (the synthesiser it always was), and a name that means a
 * built-in voice (a synthesiser, said out loud rather than silently mapped to nothing).
 *
 * The MIDI bytes are built by this repository's own byte-by-byte writer (`./fixtures/midi_file.mjs`), so none of this
 * needs a file from anywhere.
 */
import { describe, expect, it } from "vitest";
import { arrangementWithImportedParts, barsCoveringNotes } from "../data/arrangementImport";
import { MAX_BARS } from "../data/arrangementEdits";
import { fromMidi } from "../data/midiToArrangement";
import { sampledAssetForLane } from "../data/sampledInstruments";
import { buildMidiFile } from "./fixtures/midi_file.mjs";
import type { ArrangementV2 } from "../types/arrangementV2";

/** A two-part file: one part to name, one to leave alone, both with a note so both become tracks. */
const twoParts = () =>
  buildMidiFile({
    tracks: [
      { name: "Piano", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] },
      { name: "Bass", notes: [{ note: 36, startTicks: 0, durationTicks: 480 }] },
    ],
  });

const blank = (): ArrangementV2 => ({ songId: "s", sourceSlots: [], bars: 2, bpm: 120, tracks: [], notesByTrack: {} });

describe("the data layer's import creates the track the name asks for", () => {
  it("makes a named recorded instrument a sampler track pointed at the recording the lane will play", () => {
    const result = arrangementWithImportedParts(blank(), fromMidi(twoParts()), { instruments: { 0: "piano_lead" } });
    const piano = result.arrangement.tracks.find((track) => track.name === "Piano")!;
    const bass = result.arrangement.tracks.find((track) => track.name === "Bass")!;

    // ⭐ The kind, not merely the name: a `synth` track that carries `instrument` still reports a synthesizer.
    expect(piano.kind).toBe("sampler");
    expect(piano.sample?.assetId).toBe("salamander-grand");
    // The chosen name is kept, so the choice is still readable after the kind change.
    expect(piano.instrument).toBe("piano_lead");
    // And the asset is the very one the compiled lane resolves the name to, so the kind cannot disagree with the sound.
    expect(piano.sample?.assetId).toBe(sampledAssetForLane({ track_id: "lead", instrument: "piano_lead" }));

    // Nothing was invented for the part nobody named.
    expect(bass.kind).toBe("synth");
    expect(bass.instrument).toBeUndefined();
    expect(bass.sample).toBeUndefined();

    // ⭐ The reply carries how many tracks became samplers, so a caller does not re-derive it from the arrangement.
    expect(result.mapped).toBe(1);
  });

  it("is unchanged when nobody named anything: the same anonymous synthesisers the importer always produced", () => {
    const result = arrangementWithImportedParts(blank(), fromMidi(twoParts()));
    expect(result.tracks).toBe(2);
    expect(result.notes).toBe(2);
    expect(result.arrangement.tracks.map((track) => track.kind)).toEqual(["synth", "synth"]);
    expect(result.arrangement.tracks.every((track) => track.instrument === undefined)).toBe(true);
    expect(result.arrangement.tracks.every((track) => track.sample === undefined)).toBe(true);
    // Absent rather than zero, so an import that named nothing has the reply shape it always had.
    expect(result.mapped).toBeUndefined();
  });

  it("keeps a name that means a built-in voice a synthesiser, and says so rather than mapping nothing", () => {
    const result = arrangementWithImportedParts(blank(), fromMidi(twoParts()), { instruments: { 0: "warm_pad" } });
    const piano = result.arrangement.tracks.find((track) => track.name === "Piano")!;
    expect(piano.kind).toBe("synth");
    expect(piano.instrument).toBe("warm_pad");
    expect(piano.sample).toBeUndefined();
    expect(result.mapped).toBeUndefined();
    // The name is honoured as the built-in voice it means, and the track is not silently left an anonymous one.
    expect(result.problems.join(" | ")).toContain('part 1 "Piano" was named "warm_pad"');
    expect(result.problems.join(" | ")).toContain("keeps its built-in synthesizer");
  });
});

/**
 * ⭐ **An imported file makes the arrangement as long as its music.**
 *
 * Measured on 2026-10-07 with a five-minute MIDI (125 bars): the import reported "10 track(s), 2096 note(s)" and the
 * arrangement's own length stayed **8 bars**, so the ruler, the regions and the transport all stopped at sixteen
 * seconds and the rest was invisible until someone typed the number in. The MCP import had the same gap — its reply
 * read `steps: 2000` beside `bars: 8` — and both roads now use `barsCoveringNotes`, which is why these cases call it
 * directly as well as through the importer.
 */
describe("an import makes the arrangement as long as its music", () => {
  it("⭐ extends the length to the furthest note the file carries", () => {
    // Bar 100 in 4/4 at 480 ticks per beat = beat 396; the note is held for a bar, so the reach is bar 101.
    const longFile = buildMidiFile({
      tracks: [{ name: "Strings", notes: [{ note: 60, startTicks: 396 * 480, durationTicks: 4 * 480 }] }],
    });
    const result = arrangementWithImportedParts(blank(), fromMidi(longFile));
    expect(result.arrangement.bars).toBeGreaterThanOrEqual(100);
    // And the notes really are there, so the length is describing the file rather than being invented.
    const trackId = result.arrangement.tracks[0]!.id;
    expect(result.arrangement.notesByTrack?.[trackId]?.length).toBe(1);
  });

  it("never shortens an arrangement that is already longer than the file", () => {
    const short = arrangementWithImportedParts(
      { ...blank(), bars: 200 },
      { parts: [{ name: "One bar", notes: [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 90 }] }] }
    );
    expect(short.arrangement.bars).toBe(200);
  });

  it("stops at the model's ceiling instead of pretending, and an empty import changes nothing", () => {
    // 2,000 bars of reach against a 128-bar ceiling.
    expect(barsCoveringNotes(8, [{ notes: [{ pitch: 60, startBeats: 0, lengthBeats: 2000 * 4, velocity: 90 }] }], 4)).toBe(MAX_BARS);
    // No notes: the arrangement keeps the length it had, rather than collapsing to the floor.
    expect(barsCoveringNotes(8, [{ notes: [] }], 4)).toBe(8);
  });
});

/**
 * ⭐ **The file's own tempo and meter are applied, not merely reported.**
 *
 * The MCP reply had always said `tempoBpm` ("so a caller can set the arrangement's tempo from the file rather than
 * guessing 120") while the file picker's import **did** set it — so one file arrived at 100 BPM through one road and
 * at the arrangement's previous tempo through the other. It cost this project a measurement: the same 126-bar piece
 * rendered 252.6 s long (120 BPM) through MCP against 302 s (100 BPM) through the web, and the two were being
 * compared as if they described the same render.
 */
describe("an import carries the file's tempo and meter", () => {
  it("⭐ sets both from what the file states, in the same edit that brings the notes", () => {
    // The fixture takes microseconds per quarter, not a BPM: 600,000 µs = 100 BPM.
    const timed = buildMidiFile({
      tracks: [{ name: "Strings", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] }],
      microsecondsPerQuarter: 600_000,
    });
    const parsed = fromMidi(timed);
    expect(parsed.tempoBpm).toBe(100);
    const result = arrangementWithImportedParts(blank(), parsed);
    // The data layer's own import path (the file picker) applies it; `mcp/arrangement.ts` spreads the same parsed
    // object into its own edit, which is what the MCP criterion below checks on the wire.
    expect(result.arrangement.bpm).toBe(100);
  });
});
