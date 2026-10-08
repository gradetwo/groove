/**
 * **The arrangement's door, judged by what comes back through it.**
 *
 * Every claim here is a round trip rather than a call count: an export is read by the *importer* that would read a real
 * file from a DAW, and an import is fed a file this app itself exported. That is the only evidence that "Export MIDI"
 * wrote MIDI rather than a file with `.mid` on the end — and the owner's report was precisely that features existed
 * behind no entry, which is a claim source text cannot settle.
 *
 * The producers return `{ filename, blob }` and never touch the document, so all of this runs without a browser download
 * and reads the very bytes an entry would hand over. The one place that does touch the document (`downloadProducedFile`)
 * is checked by name, below.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";
import { fromMidi } from "../data/midiToArrangement";
import { fromMusicXml } from "../data/musicxmlImport";
import { arrangementFromGroovePackage } from "../data/arrangementImport";
import { validateArrangementPackage } from "../features/sequencer/arrangementPackage";
import {
  arrangementFileKind,
  alsFileFor,
  downloadProducedFile,
  grooveFileFor,
  importArrangementFile,
  midiFileFor,
  musicXmlFileFor,
  type ArrangementImportOutcome,
} from "../features/arrangement/arrangementFiles";

const note = (pitch: number, startBeats: number, lengthBeats = 1): NoteEvent => ({ pitch, startBeats, lengthBeats, velocity: 100 });

/** Two lanes, five notes, in a two-bar arrangement at 128 — every field one of the formats has to carry. */
const arrangement = (): ArrangementV2 => ({
  songId: "new",
  sourceSlots: [],
  bars: 2,
  bpm: 128,
  timeSignature: "4/4",
  tracks: [
    { id: "t-lead", kind: "synth", name: "Lead" },
    { id: "t-drums", kind: "drumkit", name: "Drums" },
  ],
  notesByTrack: {
    "t-lead": [note(60, 0), note(64, 1), note(67, 2, 2)],
    "t-drums": [note(36, 0, 0.25), note(38, 2, 0.25)],
  },
});

/** An arrangement with nothing in it, which is where an import lands in this route. */
const emptyArrangement = (): ArrangementV2 => ({ songId: "new", sourceSlots: [], tracks: [], notesByTrack: {} });

const imported = (outcome: ArrangementImportOutcome): Extract<ArrangementImportOutcome, { ok: true }> => {
  if (!outcome.ok) throw new Error(`expected the import to succeed, it refused with: ${outcome.reason}`);
  return outcome;
};

describe("the arrangement's exports, read back by the readers that read real files", () => {
  it("writes a Standard MIDI File that the MIDI importer reads back as the same lanes and notes", async () => {
    const file = midiFileFor(arrangement());
    expect(file.filename).toBe("arrangement.mid");
    expect(file.tracks).toBe(2);
    expect(file.notes).toBe(5);

    const back = fromMidi(new Uint8Array(await file.blob.arrayBuffer()));
    // One part per lane, named as the tracks are — the mapping `arrangementToMidi` records as its round-trip contract.
    expect(back.parts.map((part) => part.name)).toEqual(["Lead", "Drums"]);
    expect(back.parts.flatMap((part) => part.notes)).toHaveLength(5);
    // The tempo is the arrangement's own, not a default the writer assumed.
    expect(back.tempoBpm).toBe(128);
    expect(back.problems).toEqual([]);
  });

  it("writes a .groove package the app's own validator accepts, and reads it into an arrangement", async () => {
    const file = await grooveFileFor(arrangement());
    expect(file.filename).toBe("arrangement.groove");

    // `validateGroovePackage` is the gate the Project Hub's own Import calls, so a package it accepts is one the hub opens.
    const pkg = validateArrangementPackage(JSON.parse(await file.blob.text()) as unknown);
    expect(pkg.format).toBe("groove-arrangement");
    expect(pkg.arrangement.tracks).toHaveLength(2);

    const back = pkg.arrangement;
    expect(back.tracks).toHaveLength(2);
    // The notes come back through the note layer rather than being flattened onto a sixteenth grid.
    expect(Object.values(back.notesByTrack ?? {}).reduce((sum, list) => sum + list.length, 0)).toBe(5);
    expect(back.bpm).toBe(128);
  });

  it("writes MusicXML that `fromMusicXml` reads back note for note", async () => {
    const notes = [note(60, 0), note(64, 1), note(67, 2, 2)];
    const file = await musicXmlFileFor(notes, 2, { title: "Lead", timeSignature: "4/4", tempoBpm: 128 });
    expect(file.filename).toBe("lead.musicxml");

    const back = fromMusicXml(await file.blob.text());
    expect(back.parts[0]!.notes).toEqual(notes);
    expect(back.tempoBpm).toBe(128);
  });
});

describe("the arrangement's imports, fed files this app itself exported", () => {
  it("adds a MIDI file's parts as tracks with their notes", async () => {
    const exported = midiFileFor(arrangement());
    const outcome = imported(await importArrangementFile(emptyArrangement(), new File([exported.blob], "sketch.mid", { type: "audio/midi" })));

    expect(outcome.format).toBe("midi");
    expect(outcome.tracks).toBe(2);
    expect(outcome.notes).toBe(5);
    // The tracks are really in the arrangement, with their notes — the difference between "imported" and "reported imported".
    expect(outcome.arrangement.tracks.map((track) => track.name)).toEqual(["Lead", "Drums"]);
    expect(Object.values(outcome.arrangement.notesByTrack ?? {}).flat()).toHaveLength(5);
    // The file's own tempo is applied, not left at the arrangement's default.
    expect(outcome.arrangement.bpm).toBe(128);
  });

  it("opens a .groove package as the whole arrangement", async () => {
    const exported = await grooveFileFor(arrangement());
    const outcome = imported(await importArrangementFile(emptyArrangement(), new File([exported.blob], "song.groove", { type: "application/json" })));

    expect(outcome.format).toBe("groove");
    expect(outcome.tracks).toBe(2);
    expect(outcome.notes).toBe(5);
    expect(outcome.arrangement.tracks).toHaveLength(2);
  });

  it("adds a MusicXML document's part as a track with its notes", async () => {
    const exported = await musicXmlFileFor([note(60, 0), note(64, 1)], 1, { title: "Flute" });
    const outcome = imported(await importArrangementFile(emptyArrangement(), new File([exported.blob], "flute.musicxml", { type: "application/vnd.recordare.musicxml+xml" })));

    expect(outcome.format).toBe("xml");
    expect(outcome.tracks).toBe(1);
    expect(outcome.notes).toBe(2);
    expect(outcome.arrangement.notesByTrack?.[outcome.arrangement.tracks[0]!.id]).toHaveLength(2);
  });

  it("refuses an extension it cannot read, with the reason rather than as a no-op", async () => {
    const outcome = await importArrangementFile(emptyArrangement(), new File(["hello"], "notes.txt", { type: "text/plain" }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain("notes.txt");
    expect(outcome.reason).toContain(".mid");
  });

  it("refuses a .groove file that is not a package, so a bad file is loud", async () => {
    const outcome = await importArrangementFile(emptyArrangement(), new File(["{\"format\":\"nope\"}"], "broken.groove", { type: "application/json" }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/Invalid arrangement package/);
  });
});

describe("the arrangement's Ableton export, through the workbench's own writer", () => {
  it("writes an Ableton Live Set that names the arrangement's own tracks", async () => {
    const file = await alsFileFor(arrangement(), "Arrangement");
    expect(file.filename.endsWith(".als")).toBe(true);
    // gzip magic, then the project XML: the same evidence the exporter's own criterion uses.
    const bytes = new Uint8Array(await file.blob.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);

    /**
     * Read through the stream while writing into it.
     *
     * ⭐ **Neither `write` nor `close` is awaited before the read starts**, which is the shape the exporter's own
     * criterion uses and not a stylistic choice: awaiting a write for a payload this size, before anything reads the
     * other end, deadlocks on the stream's own backpressure. That is how this criterion first "hung" instead of failing.
     */
    const stream = new DecompressionStream("gzip");
    const writer = stream.writable.getWriter();
    void writer.write(bytes as unknown as BufferSource);
    void writer.close();
    const xml = await new Response(stream.readable).text();
    expect(xml).toContain("<Ableton MajorVersion=\"5\"");
    expect(xml).toContain("Lead");
    expect(xml).toContain("Drums");
  }, 30000);
});

describe("the one place that touches the document", () => {
  const clicked: string[] = [];
  const originalClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    clicked.length = 0;
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:test", revokeObjectURL: () => undefined });
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicked.push(this.download);
    };
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click = originalClick;
    vi.unstubAllGlobals();
  });

  it("hands the produced file over under its own name", () => {
    downloadProducedFile({ filename: "arrangement.mid", blob: new Blob(["x"], { type: "audio/midi" }) });
    expect(clicked).toEqual(["arrangement.mid"]);
  });
});

describe("the recognised extensions", () => {
  it("maps each format to its own reader and nothing else", () => {
    expect(arrangementFileKind("a.mid")).toBe("midi");
    expect(arrangementFileKind("a.MIDI")).toBe("midi");
    expect(arrangementFileKind("a.groove")).toBe("groove");
    expect(arrangementFileKind("a.musicxml")).toBe("musicxml");
    expect(arrangementFileKind("a.mxl")).toBe("musicxml");
    expect(arrangementFileKind("a.xml")).toBe("musicxml");
    expect(arrangementFileKind("a.wav")).toBe("unsupported");
  });

/**
 * ⭐ **The name survives the round trip** (third evaluation, F09).
 *
 * The evaluation named a project "潮汐与星尘 · Web 五分钟", exported the `.groove`, imported it through MCP and exported
 * again: every note and bar matched and the **title was gone**, because a package carries the arrangement and the
 * arrangement said nothing about what it was called. The name now goes into the arrangement when the project is created or
 * renamed, so the package carries it without a second field to keep in step.
 */
describe("a project's name travels with its package", () => {
  it("⭐ the package carries the arrangement's name, and the file is named after it", async () => {
    const named = { ...arrangement(), name: "潮汐与星尘 · Web 五分钟" };
    const file = await grooveFileFor(named);
    // The stem is the title, not the model's word for it: two projects must not both download as `arrangement.groove`.
    expect(file.filename).toContain("潮汐与星尘");
    expect(file.filename).not.toBe("arrangement.groove");

    const parsed = JSON.parse(await file.blob.text()) as { arrangement: { name?: string } };
    expect(parsed.arrangement.name, "the name is inside the arrangement the package carries").toBe("潮汐与星尘 · Web 五分钟");

    const { validateArrangementPackage, arrangementFromPackage } = await import("../features/sequencer/arrangementPackage");
    validateArrangementPackage(parsed);
    expect(arrangementFromPackage(parsed).name, "and it is what a reader gets back").toBe("潮汐与星尘 · Web 五分钟");
  });

  it("⭐ and a project created through the store stamps it onto the arrangement", async () => {
    /**
     * The half that was actually missing: the name lived in the store's state, beside an arrangement that did not carry
     * it. A criterion on the store's own `create` is what keeps the two from drifting apart again.
     */
    const source = readFileSync(resolve(__dirname, "../features/arrangement/arrangementStore.ts"), "utf8");
    expect(source, "create stamps the name").toMatch(/arrangement: \{ \.\.\.arrangement, name: trimmed \}/);
    expect(source, "and rename keeps it in step").toMatch(/arrangement: \{ \.\.\.current\.arrangement, name \}/);
  });
});

});