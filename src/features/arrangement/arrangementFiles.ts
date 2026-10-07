/**
 * The arrangement's **way in and out**: the files it can write and the files it can read.
 *
 * The new editor shipped with a working engine behind it and no door in front of it. `arrangementToMidi` was written
 * to hand an arrangement to a DAW and nothing on the new route called it; `fromMidi` and `fromMusicXml` could read a
 * real file and only the MCP server could reach them; `toMusicXml`/`fromMusicXml` were not in the browser bundle at
 * all. The owner's report is that shape — *"有些是功能有了，页面没做入口"*.
 *
 * **Produce first, download second — and that split is the point.** Every producer here returns a `ProducedFile`
 * (`{ filename, blob }`) and writes nothing: `downloadProducedFile` is the one place that touches the document. So a
 * criterion can read the very bytes an entry would hand the browser back through the importer, which is the only
 * evidence that "export MIDI" produced a MIDI file rather than a file with `.mid` on it.
 *
 * **The heavy half is imported when it is asked for.** The WAV/MP3/stems renderers, the Ableton writer, the project
 * package writer and the MusicXML reader/writer are all `await import(...)`ed inside their own producer. This route
 * is a lazy chunk and a first-paint budget exists; a person who opens the arrangement and exports nothing must not
 * pay for an offline renderer or for a notation parser.
 */
import type { ArrangementV2, NoteEvent } from "../../types/arrangementV2";
import type { GrooveProject, GrooveProjectArrangement } from "../../types/project";
import type { MidiArrangementImport } from "../../data/midiToArrangement";
import { arrangementToMidi } from "../../data/arrangementToMidi";
import { unzipSync, zipSync } from "fflate";
import { logicProjectBundle } from "../../data/arrangementToLogic";
import { fromLogicProjectBase64 } from "../../data/logicToArrangement";
import { arrangementWithImportedParts, arrangementFromGroovePackage, type ArrangementImportResult } from "../../data/arrangementImport";
import { barsOf } from "../../audio/chunkedMasterWav";
import { compileArrangementToPattern } from "../../data/arrangementCompile";
import type { MusicXmlBytesImport } from "../../data/musicxmlImport";
import { DEFAULT_FX_STATE } from "../../audio/EffectsRack";

/**
 * The genre id an arrangement's exports are named under.
 *
 * An arrangement has no genre — that is what the `/new` route is — but the file names, the `.groove` package's own
 * validator and the exporter's sanitising all want a word, so it is one word rather than a guess at a genre.
 */
export const ARRANGEMENT_FILE_STEM = "arrangement";

/** What an entry produced, before anything hands it to a browser. */
export interface ProducedFile {
  filename: string;
  blob: Blob;
}

/** A file production that carries the facts the interface has to report rather than only the bytes. */
export interface ProducedMidi extends ProducedFile {
  kind: "midi";
  tracks: number;
  notes: number;
  /** Anything the arrangement asked for that a MIDI file cannot carry. Said, not dropped. */
  problems: string[];
}

export interface ProducedGroove extends ProducedFile {
  kind: "groove";
  name: string;
}

export interface ProducedAls extends ProducedFile {
  kind: "als";
}

/** A rendered audio file, with the two degradation flags every audio export in this app reports. */
export interface ProducedAudio extends ProducedFile {
  kind: "wav" | "mp3" | "stems";
  workletsUnavailable: boolean;
  gs1HostFailures: number;
  limiterKind: string;
  bitrateKbps?: number;
}

export interface ProducedMusicXml extends ProducedFile {
  kind: "musicxml";
  notes: number;
}

/** `{tracks, notes, problems}` — shared by the MIDI export and the two imports. */
export interface ImportCounts {
  tracks: number;
  notes: number;
  problems: string[];
}

/**
 * An import's outcome: the arrangement to install, or the refusal to show. Both are results, never an exception to swallow.
 *
 * ⭐ **`mapped` is the one fact the interface cannot recompute from the arrangement.** A part a person named became a
 * `sampler` track, and the report says so; a part they left alone did not, and the report says that too. Counting it
 * here rather than in the view keeps "what the import did" one value instead of a number a presenter re-derives from a
 * list it does not own.
 */
export type ArrangementImportOutcome =
  | ({ ok: true; filename: string } & ImportCounts & { arrangement: ArrangementV2; format: string; mapped?: number })
  | { ok: false; filename: string; reason: string };

/** Only the characters a file name may carry, and not so many of them that a filesystem refuses the name. */
function safeFileStem(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-\u4e00-\u9fa5]/gi, "_")
      .replace(/_+/g, "_")
      .substring(0, 40) || ARRANGEMENT_FILE_STEM
  );
}

/** A number the user can act on: the time signature the arrangement states, or four-four. */
function parseTimeSignature(signature: string | undefined): { beatsPerMeasure: number; beatType: number } {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec((signature ?? "").trim());
  const beatsPerMeasure = match ? Number(match[1]) : 4;
  const beatType = match ? Number(match[2]) : 4;
  if (!Number.isFinite(beatsPerMeasure) || !Number.isFinite(beatType) || beatsPerMeasure <= 0 || beatType <= 0) {
    return { beatsPerMeasure: 4, beatType: 4 };
  }
  return { beatsPerMeasure, beatType };
}

/**
 * The arrangement's notes as a Standard MIDI File.
 *
 * `arrangementToMidi` says in its own header that "writing the file is the MCP tool's job" — it returns bytes and
 * nothing else. This is the browser's half of that sentence: the same bytes, given a name and a MIME type.
 */
export function midiFileFor(arrangement: ArrangementV2, stem = ARRANGEMENT_FILE_STEM): ProducedMidi {
  const file = arrangementToMidi(arrangement);
  return {
    kind: "midi",
    filename: `${safeFileStem(stem)}.mid`,
    // The `Blob` constructor copies the bytes, so the view the writer returned is not handed on.
    blob: new Blob([file.bytes as unknown as BlobPart], { type: "audio/midi" }),
    tracks: file.tracks.length,
    notes: file.notes,
    problems: file.problems,
  };
}

/**
 * The arrangement compiled into the v1 pattern shape the package writer takes.
 *
 * ⭐ **The notes are passed explicitly, and that is not a detail.** `compileArrangementToPattern`'s second parameter is
 * "the notes to compile, or a compile the caller already has" and it defaults to *empty* — the arrangement's own
 * `notesByTrack` is content that lives with the tracks, not a field the compile reaches into. The player passes it
 * (`playArrangementV2(arrangement, arrangement.notesByTrack, …)`); every exporter here has to do the same, or an export
 * writes a pattern whose lanes are all silence. The first version of this file forgot, and the round-trip criterion
 * caught it as "0 notes".
 */
function compiledPatternFor(arrangement: ArrangementV2) {
  return compileArrangementToPattern(arrangement, arrangement.notesByTrack ?? {});
}

/**
 * The project half of a `.groove` package, built from an arrangement.
 *
 * The arrangement has no genre and no name, which is what `/new` means, so the package says exactly that:
 * `genreId: "arrangement"`. It cannot be empty — `validateGroovePackage` refuses a package without a genre id, and a
 * package the app's own validator refuses is not an export.
 */
export function grooveProjectFor(arrangement: ArrangementV2): GrooveProject {
  const pattern = compiledPatternFor(arrangement);
  const now = Date.now();
  return {
    id: `arrangement_${now}`,
    name: "Arrangement",
    genreId: ARRANGEMENT_FILE_STEM,
    genreName: "Arrangement",
    bpm: arrangement.bpm ?? 120,
    swing: 0,
    timeSignature: arrangement.timeSignature ?? "4/4",
    resolution: "1/16",
    stepCount: pattern.totalSteps ?? pattern.tracks[0]?.steps?.length ?? 16,
    patterns: { A: pattern, B: { ...pattern, tracks: [] } },
    activeSlot: "A",
    songMode: false,
    songChain: ["A"],
    loopRange: null,
    effectsRack: { ...DEFAULT_FX_STATE },
    drumKit: "808",
    isMetronome: false,
    isCountIn: false,
    tags: ["Arrangement"],
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The arrangement as a `.groove` package.
 *
 * **The same writer the workbench's own export uses** (`exportProjectPackage`, the function `exportProjectToGrooveFile`
 * is a two-line download around), called with the package's **v2 `arrangement` half filled in**. That field exists
 * precisely because "exporting a song was lossy: the arrangement was dropped and there was nowhere to drop it into" —
 * and an arrangement is exactly what this route has. So the file carries both halves: the v1 two-pattern project every
 * older reader understands, and the clips that make re-opening it faithful.
 */
export async function grooveFileFor(arrangement: ArrangementV2, stem = "arrangement"): Promise<ProducedGroove> {
  const { buildArrangementPackage, validateArrangementPackage } = await import("../sequencer/arrangementPackage");
  // ⭐ The package carries the arrangement itself: no compiled pattern, no clips and no project half.
  const pkg = buildArrangementPackage(arrangement);
  // The app's own validator is the gate on the way out too: a package this refuses must never reach a person's disk.
  validateArrangementPackage(pkg);
  const safeStem = safeFileStem(stem);
  return {
    kind: "groove",
    filename: `${safeStem}.groove`,
    blob: new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" }),
    name: safeStem,
  };
}

/** The arrangement as an Ableton Live Set, through the workbench's own writer. */
export async function alsFileFor(arrangement: ArrangementV2, name = "Arrangement"): Promise<ProducedAls> {
  const { exportAbletonLiveSet } = await import("../../audio/AbletonExporter");
  const result = await exportAbletonLiveSet({
    bpm: arrangement.bpm ?? 120,
    pattern: compiledPatternFor(arrangement),
    genreName: name,
    scaleName: "chromatic",
  });
  return { kind: "als", filename: result.filename, blob: result.blob };
}

/** The audio-lane options an app-side render needs, so a sampler lane is mixed rather than silently empty. */
async function audioLaneOptions(pattern: ReturnType<typeof compileArrangementToPattern>) {
  const [{ prepareAudioLaneExport }, { appCatalogueRuntime }] = await Promise.all([
    import("../sequencer/hooks/audioLaneExport"),
    import("../../data/sampleCatalogueRuntime"),
  ]);
  return prepareAudioLaneExport(pattern, () => appCatalogueRuntime.load());
}

/** The common options every audio export is handed, so the three cannot disagree about the performance. */
function renderOptionsFor(arrangement: ArrangementV2) {
  return { bpm: arrangement.bpm ?? 120, swing: 0, drumKit: "808" as const };
}

/**
 * The arrangement's master, rendered offline to a 16-bit WAV.
 *
 * ⭐ **A long arrangement is rendered in spans at once.** Measured (2026-10-07): 5:03 of audio takes **753 s** in one
 * `OfflineAudioContext` — 0.40× realtime on one core of eight — and K concurrent contexts reach ≈2.8× at K=4, with K
 * contexts in one page as good as K pages. So from `CHUNKED_EXPORT_FROM_BARS` up, the master goes through
 * `exportMasterWavChunked`: same renderer, same options, same reply shape, K spans in flight and a merged file.
 *
 * The floor is not decoration. A chunk carries `preRollSec` of warm-up (one reverb impulse by default), so a piece
 * that is barely longer than its own pre-roll would spend more time warming up than rendering; sixteen bars is where
 * the measured curve starts paying. Below it the single-pass road is byte-for-byte what it always was — which is also
 * the reference a listener (and the equivalence probe) compares against.
 */
const CHUNKED_EXPORT_FROM_BARS = 16;

/**
 * ⚠️ **Off, until the in-app measurement shows the win the standalone probe promised.**
 *
 * `src/audio/chunkedMasterWav.ts` is complete and its merge has criteria, but wired as the default it made a 5-minute
 * export **no faster** — a 14-minute run against the single pass's 11 m 54 s, watched rather than assumed. The
 * standalone probe rendered K contexts in a bare page and measured ≈2.8× at K=4; the app's page also holds the
 * **running realtime `AudioContext`** (and the GS-1 worklet), and Chromium's offline contexts appear to queue behind
 * it — the first thing to measure next (`spanMs` is returned per span for exactly that), along with whether each span
 * re-prepares the audio lanes. Until then an unverified slower path must not be the default: a creator waiting twelve
 * minutes is the baseline this goal exists to cut, not to lengthen.
 */
const CHUNKED_EXPORT_ENABLED = false;

export async function wavFileFor(arrangement: ArrangementV2): Promise<ProducedAudio> {
  const pattern = compiledPatternFor(arrangement);
  const lanes = await audioLaneOptions(pattern);
  const options = { ...renderOptionsFor(arrangement), ...lanes.options };
  if (CHUNKED_EXPORT_ENABLED && barsOf(pattern) >= CHUNKED_EXPORT_FROM_BARS) {
    const { exportMasterWavChunked } = await import("../../audio/chunkedMasterWav");
    const result = await exportMasterWavChunked(pattern, ARRANGEMENT_FILE_STEM, options);
    return {
      kind: "wav",
      filename: result.filename,
      blob: result.blob,
      workletsUnavailable: result.workletsUnavailable,
      gs1HostFailures: result.gs1HostFailures,
      limiterKind: result.limiterKind,
    };
  }
  const { exportMasterWav } = await import("../../audio/WavExporter");
  const result = await exportMasterWav(pattern, ARRANGEMENT_FILE_STEM, options);
  return {
    kind: "wav",
    filename: result.filename,
    blob: result.blob,
    workletsUnavailable: result.workletsUnavailable,
    gs1HostFailures: result.gs1HostFailures,
    limiterKind: result.limiterKind,
  };
}

/** The same master, encoded to MP3. The encoder is fetched on this click, exactly as the workbench does it. */
export async function mp3FileFor(arrangement: ArrangementV2): Promise<ProducedAudio> {
  const { exportMasterMp3 } = await import("../../audio/Mp3Exporter");
  const pattern = compiledPatternFor(arrangement);
  const lanes = await audioLaneOptions(pattern);
  const result = await exportMasterMp3(pattern, ARRANGEMENT_FILE_STEM, { ...renderOptionsFor(arrangement), ...lanes.options });
  return {
    kind: "mp3",
    filename: result.filename,
    blob: result.blob,
    workletsUnavailable: result.workletsUnavailable,
    gs1HostFailures: result.gs1HostFailures,
    limiterKind: result.limiterKind,
    bitrateKbps: result.bitrateKbps,
  };
}

/** One WAV per track, packed into a zip. */
export async function stemsFileFor(arrangement: ArrangementV2): Promise<ProducedAudio> {
  const { exportStemsZip } = await import("../../audio/WavExporter");
  const pattern = compiledPatternFor(arrangement);
  const lanes = await audioLaneOptions(pattern);
  const result = await exportStemsZip(pattern, ARRANGEMENT_FILE_STEM, { ...renderOptionsFor(arrangement), ...lanes.options });
  return {
    kind: "stems",
    filename: result.filename,
    blob: result.blob,
    workletsUnavailable: result.workletsUnavailable,
    gs1HostFailures: result.gs1HostFailures,
    limiterKind: "rendered",
  };
}

/**
 * A track's notes as MusicXML — **the score leaving the building**.
 *
 * `toMusicXml` and `fromMusicXml` were complete and unreachable: nothing in the application imported either module,
 * so `musicxml` did not appear once in the shipped web bundle. They are `await import`ed here, which is what puts
 * them in the browser as their **own** chunk rather than in the first paint — the same treatment `ScoreV2` gives
 * VexFlow and for the same reason.
 */
export async function musicXmlFileFor(
  notes: readonly NoteEvent[],
  bars: number,
  options: { title?: string; timeSignature?: string; tempoBpm?: number } = {}
): Promise<ProducedMusicXml> {
  const { toMusicXml } = await import("../../data/musicxml");
  const { beatsPerMeasure, beatType } = parseTimeSignature(options.timeSignature);
  const title = options.title?.trim() || "Score";
  const xml = toMusicXml(notes, bars, {
    title,
    // The part name is the track's own, so a file read back names the track it came from rather than "Part 1".
    partName: title,
    beatsPerMeasure,
    beatType,
    ...(options.tempoBpm === undefined ? {} : { tempoBpm: options.tempoBpm }),
  });
  return {
    kind: "musicxml",
    filename: `${safeFileStem(title)}.musicxml`,
    blob: new Blob([xml], { type: "application/vnd.recordare.musicxml+xml" }),
    notes: notes.length,
  };
}

/** Hand a produced file to the browser. The **one** place in this module that touches the document. */
export function downloadProducedFile(file: ProducedFile): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Which reader a chosen file belongs to, from its own name. Extension-first because a file picker gives no more. */
export type ArrangementFileKind = "midi" | "groove" | "musicxml" | "unsupported" | "logic";

export function arrangementFileKind(filename: string): ArrangementFileKind {
  const lower = filename.trim().toLowerCase();
  if (lower.endsWith(".mid") || lower.endsWith(".midi")) return "midi";
  if (lower.endsWith(".groove")) return "groove";
  if (lower.endsWith(".musicxml") || lower.endsWith(".mxl") || lower.endsWith(".xml")) return "musicxml";
  /**
   * ⭐ **A Logic project arrives as the zip our own export writes** (`.logicx.zip`, `docs/OPEN_WORK.md` 266). A bare
   * `.zip` is accepted too and then *checked by its contents* — `Alternatives/<n>/ProjectData` — because the extension
   * alone would claim any archive is a Logic project. A `.groove` package is JSON, not a zip, so there is no ambiguity
   * with the format above.
   */
  if (lower.endsWith(".logicx.zip") || lower.endsWith(".zip")) return "logic";
  return "unsupported";
}

/** A `File` read as bytes, through its own `arrayBuffer` — the one call that works for binary and text alike. */
async function bytesOf(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * A MIDI file **read but not yet placed** — the shape the mapping dialog needs and the shape the placement then uses.
 *
 * The split exists because identity is a decision a person makes, and the decision needs the file's own part list in
 * front of it. `fromMidi` already produces that list (each part's name verbatim and its notes), so the read is the
 * same one the no-dialog path performs; keeping the result rather than re-reading the `File` is what makes the two
 * paths one parse and guarantees the dialog is describing exactly the parts that will be placed.
 */
export interface ReadMidiImport {
  filename: string;
  imported: MidiArrangementImport;
}

/** A MIDI read as a result rather than an exception: either the parts, or the reader's own sentence. */
export type MidiImportRead = { ok: true; read: ReadMidiImport } | { ok: false; filename: string; reason: string };

/**
 * A MIDI file as tracks in the arrangement.
 *
 * The parts the reader produced are **added** to what is on screen, and the file's own tempo and meter are applied
 * when it states them — said in the reply rather than silently kept at 120, which is the same rule `fromMidi`
 * records for itself.
 *
 * ⭐ **`instruments` is the person's answer, keyed by part index**, and it is threaded to the one place that knows
 * what to do with it (`arrangementWithImportedParts`). Keyed rather than positional because `fromMidi` drops a track
 * chunk that holds no notes, so an array would slide: "the violin ended up on the bass" is not a failure anyone
 * would notice in time. **Absent, every part is exactly the track it was before this parameter existed** — the
 * default is unchanged, and that is the property the criterion on this path asserts.
 */
export async function importMidiIntoArrangement(
  arrangement: ArrangementV2,
  file: File,
  instruments?: Record<number, string>
): Promise<ArrangementImportOutcome> {
  const read = await readMidiForImport(file);
  if (!read.ok) return { ok: false, filename: read.filename, reason: read.reason };
  return placeMidiIntoArrangement(arrangement, read.read, instruments);
}

/**
 * Read a `.mid` into parts, without placing anything — what the mapping dialog is shown from.
 *
 * The heavy reader is still `await import`ed here rather than at module load, so the first paint does not pay for
 * the MIDI parser merely because the route can import one.
 */
export async function readMidiForImport(file: File): Promise<MidiImportRead> {
  try {
    const { fromMidi } = await import("../../data/midiToArrangement");
    return { ok: true, read: { filename: file.name, imported: fromMidi(await bytesOf(file)) } };
  } catch (error) {
    return { ok: false, filename: file.name, reason: describeError(error) };
  }
}

/**
 * Place an **already read** MIDI file into the arrangement, with the instruments a person named.
 *
 * Separate from the read so the interface can show the file's parts before deciding, and so the decision is applied
 * to the very parse the dialog described rather than to a second one that could differ.
 *
 * ⭐ **The mapped parts become `sampler` tracks inside `arrangementWithImportedParts`, not here.** This function used
 * to upgrade them afterwards (`withMappedPartsAsSamplers`), keyed by part index and resolving the name through
 * `sampledInstrumentFor` a second time — which made the interface path right and left `mcp/arrangement.ts`'s own
 * import creating the same named part as a synthesiser. The name→kind decision now lives once, at the creation call
 * (`importedPartVoice`), and the count it produces travels back as `placed.mapped`; nothing is re-derived here from a
 * list this function does not own.
 */
export function placeMidiIntoArrangement(
  arrangement: ArrangementV2,
  read: ReadMidiImport,
  instruments?: Record<number, string>
): ArrangementImportOutcome {
  const { imported, filename } = read;
  const placed = arrangementWithImportedParts(arrangement, imported, instruments === undefined ? {} : { instruments });
  /**
   * ⭐ The tempo and meter used to be spread in here, and only here — so the data layer and the MCP import applied
   * neither. `arrangementWithImportedParts` owns that rule now (`importedTempoAndMeter`), and this wrapper has
   * nothing left to add.
   */
  const next: ArrangementV2 = placed.arrangement;
  return {
    ok: true,
    filename,
    format: "midi",
    tracks: placed.tracks,
    notes: placed.notes,
    problems: placed.problems,
    ...(placed.mapped === undefined ? {} : { mapped: placed.mapped }),
    arrangement: next,
  };
}

/**
 * A `.groove` package as **the** arrangement — a whole project, so it replaces rather than accumulates.
 *
 * The package is read through `validateGroovePackage`, which is the app's own gate and the very function the Project
 * Hub's own Import calls: a file the hub would refuse is refused here with the same sentence, and a file the hub
 * accepts opens here. Nothing is written to the project store, because importing an arrangement is not a request to
 * file a new project in a hub this route does not show.
 */
export /**
 * ⭐ **A Logic project read into this model** — the owner's "Web 补 Logic 导入入口" (2026-10-05).
 *
 * The export side has written `Alternatives/<n>/ProjectData` and its `MetaData.plist` since v2.34.46, and `MCP` could
 * already read a Logic project back (`import_logic_project`), but the web could not: `arrangementFileKind` did not
 * know the name, so the file fell to "unsupported". This reads the zip, takes those two entries, hands them to the
 * same reader MCP uses (`fromLogicProjectBase64`), and places the resulting parts with
 * `arrangementWithImportedParts` — the same placement the MIDI and MusicXML paths use, so nothing here re-keys or
 * reorders anything.
 *
 * ⚠️ **What it does not claim**: that a *real* Logic project imports. What is shown is that a project **our export
 * wrote** round-trips, which is what the MCP tests assert too. A real one is a Mac question (`needs`).
 */
async function importLogicIntoArrangement(arrangement: ArrangementV2, file: File): Promise<ArrangementImportOutcome> {
  try {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const names = Object.keys(entries);
    const projectData = names.find((name) => /^Alternatives\/[^/]+\/ProjectData$/.test(name));
    if (!projectData) {
      return {
        ok: false,
        filename: file.name,
        reason: `"${file.name}" has no Alternatives/<n>/ProjectData, so it is not a Logic project this route reads`,
      };
    }
    const metaData = names.find((name) => /^Alternatives\/[^/]+\/MetaData\.plist$/.test(name));
    const imported = fromLogicProjectBase64({
      projectDataBase64: toBase64(entries[projectData]!),
      metaDataBase64: toBase64(metaData ? entries[metaData]! : new Uint8Array()),
    });
    const placed = arrangementWithImportedParts(arrangement, { parts: imported.parts }, {});
    return {
      ok: true,
      filename: file.name,
      format: "logic",
      tracks: placed.tracks,
      notes: placed.notes,
      problems: [...(placed.problems ?? []), ...imported.problems],
      arrangement: placed.arrangement,
    };
  } catch (error) {
    return { ok: false, filename: file.name, reason: describeError(error) };
  }
}

/** Bytes as base64, the mirror of `logicToArrangement`'s own decoder, so both sides agree on the alphabet. */
function toBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function importGrooveIntoArrangement(arrangement: ArrangementV2, file: File): Promise<ArrangementImportOutcome> {
  try {
    const { arrangementFromPackage } = await import("../sequencer/arrangementPackage");
    const carried = arrangementFromPackage(JSON.parse(await file.text()));
    // ⭐ The package already carries an arrangement, so nothing is projected: the counts come from it directly.
    const imported: ArrangementImportResult = {
      arrangement: carried,
      trackIds: carried.tracks.map((track) => track.id),
      tracks: carried.tracks.length,
      notes: Object.values(carried.notesByTrack ?? {}).reduce((sum, list) => sum + list.length, 0),
      problems: [],
    };
    return { ok: true, filename: file.name, format: "groove", tracks: imported.tracks, notes: imported.notes, problems: imported.problems, arrangement: imported.arrangement };
  } catch (error) {
    return { ok: false, filename: file.name, reason: describeError(error) };
  }
}

/**
 * ⭐ **A MusicXML document read but not yet placed** — the same shape the MIDI path keeps for its mapping dialog, and
 * for the same reason.
 *
 * The measured gap this closes: `importMusicXmlIntoArrangement` had **no `instruments` parameter at all**, so a
 * MusicXML file's parts became `synth` tracks with their names written on them and no way for the person to say
 * "this part is a recording" — while the MIDI path one screen up could. The reader already produces the part list the
 * dialog needs (`{name, notes}`, exactly `ImportedPart`), so keeping the read rather than re-reading the `File` is
 * what makes the dialog describe the very parts that will be placed.
 */
export interface ReadMusicXmlImport {
  filename: string;
  imported: MusicXmlBytesImport;
}

/** A MusicXML read as a result rather than an exception: either the parts, or the reader's own sentence. */
export type MusicXmlImportRead = { ok: true; read: ReadMusicXmlImport } | { ok: false; filename: string; reason: string };

/**
 * Read a MusicXML document **into parts, without placing anything** — what the mapping dialog is shown from.
 *
 * The heavy reader stays `await import`ed, so the first paint does not pay for a notation parser merely because the
 * route can import one.
 */
export async function readMusicXmlForImport(file: File): Promise<MusicXmlImportRead> {
  try {
    const { fromMusicXmlBytes } = await import("../../data/musicxmlImport");
    return { ok: true, read: { filename: file.name, imported: await fromMusicXmlBytes(await bytesOf(file)) } };
  } catch (error) {
    return { ok: false, filename: file.name, reason: describeError(error) };
  }
}

/**
 * Place an **already read** MusicXML file into the arrangement, with the instruments a person named.
 *
 * Separate from the read for the same reason `placeMidiIntoArrangement` is: so the interface can show the file's
 * parts before deciding, and so the decision is applied to the very parse the dialog described. The file's own tempo
 * and meter are applied when it states them; `format` is the reader's own answer (`xml` or `mxl`), not the extension.
 *
 * ⭐ **`instruments` is handed to the one place that decides identity, exactly as the MIDI path hands it over.**
 * `arrangementWithImportedParts` writes the chosen name onto the track's instrument slot, derives the track's *kind*
 * from it (`importedPartVoice`), and counts what became a sampler as `placed.mapped` — so this function derives
 * nothing a second time. The names are keyed by **part index**, so a part that holds no notes — which never becomes a
 * track — cannot slide the names onto the wrong tracks.
 */
export function placeMusicXmlIntoArrangement(
  arrangement: ArrangementV2,
  read: ReadMusicXmlImport,
  instruments?: Record<number, string>
): ArrangementImportOutcome {
  const { imported, filename } = read;
  const placed = arrangementWithImportedParts(arrangement, imported, instruments === undefined ? {} : { instruments });
  const beatType = imported.beatType;
  const beatsPerMeasure = imported.beatsPerMeasure;
  const next: ArrangementV2 = {
    ...placed.arrangement,
    ...(imported.tempoBpm === undefined ? {} : { bpm: imported.tempoBpm }),
    ...(beatsPerMeasure === undefined || beatType === undefined ? {} : { timeSignature: `${beatsPerMeasure}/${beatType}` }),
  };
  return {
    ok: true,
    filename,
    format: imported.format,
    tracks: placed.tracks,
    notes: placed.notes,
    problems: placed.problems,
    ...(placed.mapped === undefined ? {} : { mapped: placed.mapped }),
    arrangement: next,
  };
}

/**
 * A MusicXML document (or a compressed `.mxl`) as tracks in the arrangement.
 *
 * `fromMusicXmlBytes` decides between the two by the bytes rather than by the name, and reports which it read, so a
 * `.xml` that is really a zip is read rather than refused.
 *
 * ⭐ **`instruments` is the person's answer, keyed by part index** — the parameter this entry point was missing, and
 * the whole of the "MusicXML has no mapping dialog" gap. Absent, every part is exactly the track it was before this
 * parameter existed, which is the property the criterion on the no-dialog path asserts.
 */
export async function importMusicXmlIntoArrangement(
  arrangement: ArrangementV2,
  file: File,
  instruments?: Record<number, string>
): Promise<ArrangementImportOutcome> {
  const read = await readMusicXmlForImport(file);
  if (!read.ok) return { ok: false, filename: read.filename, reason: read.reason };
  return placeMusicXmlIntoArrangement(arrangement, read.read, instruments);
}

/** Dispatch a chosen file to its reader. An unknown extension is a refusal with the reason, never a no-op. */
export async function importArrangementFile(arrangement: ArrangementV2, file: File): Promise<ArrangementImportOutcome> {
  switch (arrangementFileKind(file.name)) {
    case "midi":
      return importMidiIntoArrangement(arrangement, file);
    case "groove":
      return importGrooveIntoArrangement(arrangement, file);
    case "musicxml":
      return importMusicXmlIntoArrangement(arrangement, file);
    case "logic":
      return importLogicIntoArrangement(arrangement, file);
    default:
      return { ok: false, filename: file.name, reason: `"${file.name}" is not a file this route reads (.mid, .midi, .groove, .musicxml, .mxl, .logicx.zip, .zip)` };
  }
}

/**
 * Anything thrown, as a sentence — **the shared one** (`src/utils/describeError.ts`), re-exported so the fifteen call
 * sites in this module keep their import. It moved because the two sequencer hooks had grown their own byte-identical
 * copies, and because the moved version was also fixed: `JSON.stringify(undefined)` returns `undefined`, so the old
 * body could hand `undefined` to a message that shows an `{error}` placeholder verbatim.
 */
import { describeError } from "../../utils/describeError";

export { describeError };

/**
 * The arrangement written as a `.logicx` **package**, delivered as a zip.
 *
 * ⚠️ **The name says both extensions on purpose** (docs/OPEN_WORK.md 266): a `.logicx` is a *directory*, and a browser
 * can only hand a user one file, so this is `… .logicx.zip` rather than `… .logicx`, which would suggest they had been
 * given the directory itself.
 *
 * ⚠️ **What this does not claim** (docs/OPEN_WORK.md 243): that real Logic opens the package, or which versions accept
 * it — neither can be shown on this machine. What is shown is that our own reader opens it and returns the notes.
 *
 * The shape follows its siblings: producers return a name and a blob and write nothing, and `downloadProducedFile`
 * remains the one place that touches the document.
 */
/** A `.logicx` package on its way out: the same shape as its siblings, with a zip rather than a directory. */
export interface ProducedLogic {
  kind: "logic";
  filename: string;
  blob: Blob;
  tracks: number;
  notes: number;
  problems: string[];
}

export function logicFileFor(arrangement: ArrangementV2, stem = ARRANGEMENT_FILE_STEM): ProducedLogic {
  const parts = arrangement.tracks
    .filter((track) => track.kind !== "folder")
    .map((track) => ({ name: track.name, notes: arrangement.notesByTrack?.[track.id] ?? [] }));
  const bundle = logicProjectBundle(parts, arrangement.bpm ?? 120);
  const zipped = zipSync(bundle.files);
  return {
    kind: "logic",
    filename: `${safeFileStem(stem)}.logicx.zip`,
    blob: new Blob([zipped as unknown as BlobPart], { type: "application/zip" }),
    tracks: parts.length,
    notes: parts.reduce((total, part) => total + part.notes.length, 0),
    problems: [],
  };
}
