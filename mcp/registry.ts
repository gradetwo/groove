import { CLIP_SLOTS } from "../src/types/song";
import { audioLaneReplyFields } from "./pattern";
import { legatoGapNote, legatoGapsFor } from "../src/data/legatoGaps";
import {
  STRING_INSTRUMENT_IDS,
  STRING_SITUATION_IDS,
  chordChangeReattackNote,
  chordChangeReattacks,
  type StringInstrument,
  type StringSituation,
} from "../src/data/stringTechniques";
import { z } from "zod";
import { clonePattern, findGenre, getChordProgression, getGenre, getGenreRelations, suggestProgression, libraryIndex, listCategories, listChordProgressions, listGenres, listMasterclasses, searchGenres } from "./library";
import { applyChordProgression } from "./progression";
import { inspectSfzAt } from "./sfzInspectRemote";
import { applyPatternOps, comparePatterns, findTrack, patternStatistics, validatePattern, type PatternOp } from "./pattern";
import { DEFAULT_NOTE_CONVENTION, collectTranspositions, describePitch, type NoteConvention } from "../src/data/pitchTruth";
import { fromMidi } from "../src/data/midiToArrangement";
import { changeUserLibraries } from "./sampleLibraries";
import { resolveGs1Lane } from "../src/audio/gs1/gs1Tracks";
import { decodeGs1PatchCode, type Gs1PatchRoute } from "../src/audio/gs1/gs1PatchCode";
import {
  gs1ParameterReadings,
  gs1RouteOverrideReadings,
  gs1RouteReadings,
  mergeGs1Overrides,
  type ResolvedGs1Overrides,
} from "../src/audio/gs1/gs1ParamOverrides";
import { DEFAULT_PARAMS, MAX_ROUTES } from "../vendor/gs1/src/audio/params";
import { patternFromGenre } from "../src/data/genreMix";
import { MAX_BARS } from "../src/data/arrangementEdits";
import { generateMelody } from "./melody";
import { examplesFor, listExamples } from "./examples";
import { validateProsody } from "./prosody";
import { flattenSong } from "../src/data/songFlatten";
import { catalogueAssetById, listCatalogueInstruments, listSampleLibraries, nearestCatalogueAssetIds } from "./instruments";
import {
  addMcpNote,
  addMcpTake,
  exportMcpArrangementMidi,
  exportMcpMusicXml,
  importMcpMusicXml,
  importMcpLogicProject,
  exportMcpLogicProject,
  importMcpMidi,
  importMcpMusicXmlBytes,
  addMcpTrack,
  assignMcpTakeRange,
  createMcpArrangement,
  describeMcpArrangement,
  flattenMcpArrangement,
  moveMcpNote,
  removeMcpNote,
  removeMcpTrack,
  renameMcpTrack,
  selectMcpTake,
  setMcpTrackCollapsed,
  setMcpTrackFlag,
  setMcpArrangementBars,
  setMcpArrangementTempo,
  setMcpArrangementTempoMap,
  addMcpTrackNotes,
  setMcpArrangementTimeSignature,
  setMcpNoteLength,
  setMcpTrackGain,
  setMcpTrackAsset,
  setMcpTrackKind,
  setMcpTrackPan,
  setMcpTrackParent,
  setMcpTrackRegion,
  setMcpTrackSteps,
  summariseArrangement,
  getMcpArrangement,
} from "./arrangement";
import { APP_VERSION } from "../src/version";
import { exportProjectPackage, validateGroovePackage } from "../src/features/sequencer/projectDb";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportAbleton, exportMidi, loudnessReport, shareUrl, toBase64 } from "./exporting";
import { analyseWavFile, auditionInstrumentNote, renderAudio, renderStems } from "./render/worker";
import {
  renderBudgetSentence,
  renderCostSentence,
  renderOutputSentence,
  HEADLESS_POINTER_SENTENCE,
  headlessParameterDescription,
} from "./render/budget";
import type { ProgressReporter } from "./render/progress";
import { getGenreLoudnessTrimDb } from "../src/data/genreMix";
import { setVocalMelody } from "./vocal";
import { addMcpSection, createMcpSong, duplicateMcpSection, flattenMcpSong, getMcpSong, importMcpSong, makeUniqueMcpSection, mcpSongHistory, setMcpClip, setMcpLaneSlots, setMcpTempo, summariseSong, undoMcpSong } from "./song";
import { deleteMcpCustomGenre, duplicateMcpCustomGenre, getMcpCustomGenre, listMcpCustomGenres, saveMcpCustomGenre } from "./customGenres";
import type { ClipSlot } from "../src/types/song";
import type { SequencerPattern } from "../src/types/genre";
import type { CustomGenre } from "../src/types/customGenre";
import { ARRANGEMENT_TOOLS } from "./registryArrangement";

export * from "./toolKit";
import { clipSlotSchema, unknownGenre, failure, describeGs1Sound, patternSchema, customGenreSchema, opSchema, patternFromArgs, instrumentsByPart, situationsArgument, situationsByPart, ToolDefinition } from "./toolKit";

import { PROJECT_TOOLS } from "./registryProject";

import { LIBRARY_TOOLS } from "./registryLibrary";

import { GS1_TOOLS } from "./registryGs1";

import { PATTERN_TOOLS } from "./registryPattern";

import { SONG_TOOLS } from "./registrySong";

import { RENDER_TOOLS } from "./registryRender";

import { FILE_TOOLS } from "./registryFiles";

import { changelog, estimateKey } from "./toolKit";

import { ANALYSIS_TOOLS } from "./registryAnalysis";

import { EXAMPLE_TOOLS } from "./registryExamples";

export const TOOLS: ToolDefinition[] = [
  ...EXAMPLE_TOOLS,
  ...ANALYSIS_TOOLS,
  ...FILE_TOOLS,
  ...RENDER_TOOLS,
  ...SONG_TOOLS,
  ...PATTERN_TOOLS,
  ...GS1_TOOLS,
  ...LIBRARY_TOOLS,
  ...PROJECT_TOOLS,
  ...ARRANGEMENT_TOOLS,
  /**
   * The arrangement surface — the v2 model the interface has used since `/new`.
   *
   * It sits first because it is where a project starts: the song tools below build a **v1 song** (clips, sections, lane slots), and an agent asked to "start a new arrangement" should not have to reach past that to find the tools that add tracks, choose
   * an instrument, write steps or file a recording.
   *
   * The kind list is repeated in the schemas rather than shared through a constant, because a `z.enum` is what a client reads for its own validation — and one source of truth for it is `TrackKindV2`, which the compiler checks these against.
   */
  /**
   * B6 — the arrangement, not the loop.
   *
   * Everything above builds or renders a *pattern*. These three let an agent compose a song: `create_song` seeds
   * clip A (from the genre's arranged pattern, the same one the app plays), `add_section` places it on a timeline,
   * and `render_song` bounces the whole arrangement through the same offline engine `render_audio` uses — the
   * flattening is `flattenSong`, so the tool cannot render something the app would not.
   */
];

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  /** Fixed resources have no template; templated ones expose `{id}` in the URI. */
  read: (id?: string) => string;
}

export const RESOURCES: ResourceDefinition[] = [
  {
    uri: "groove://genres",
    name: "Genre library index",
    description: "Every genre id, the category counts and the total.",
    mimeType: "application/json",
    read: () => JSON.stringify(libraryIndex()),
  },
  {
    uri: "groove://genre/{id}",
    name: "Genre document",
    description: "One genre in full, as `get_genre` returns it.",
    mimeType: "application/json",
    read: (id) => JSON.stringify(getGenre(String(id ?? "")) ?? { error: `unknown genre "${id}"` }),
  },
  {
    uri: "groove://loudness",
    name: "Loudness baseline",
    description: "The committed LUFS/true-peak measurement for every genre.",
    mimeType: "application/json",
    read: () => JSON.stringify(loudnessReport()),
  },
  {
    /**
     * Worked examples, as a resource because that is what they are: reference material a client can list and read.
     */
    uri: "groove://examples/{genre}",
    name: "Worked examples",
    description: "Composition examples for a genre — each with the recipe that produced it, so an agent imitates the chain rather than the JSON.",
    mimeType: "application/json",
    read: (genreId?: string) => JSON.stringify(examplesFor(genreId ?? "chicago-house")),
  },
  {
    uri: "groove://masterclasses",
    name: "Masterclasses",
    description: "The shipped lesson list.",
    mimeType: "application/json",
    read: () => JSON.stringify(listMasterclasses()),
  },
  {
    /**
     * The contract itself. `docs/MCP.md` documented this URI and the registry never declared it — the same class of mismatch as the
     * changelog below, found by the gate that now compares the two sides rather than by a reader noticing.
     */
    uri: "groove://docs",
    name: "MCP contract",
    description: "This server's contract: the tools, resources and prompts it exposes, and what each one promises.",
    mimeType: "text/markdown",
    read: () => {
      try {
        return readFileSync(path.resolve("docs/MCP.md"), "utf8");
      } catch (error) {
        return `could not read docs/MCP.md: ${(error as Error).message}`;
      }
    },
  },
  {
    /**
     * The resource `docs/MCP.md` has documented since the contract was written and the registry never declared.
     *
     * A reader of the contract saw a resource that did not exist; an agent that asked for it got "not found". It is the release
     * notes the app itself shows, so the data was always there — only the declaration was missing, which is why the gate now
     * compares the documented URIs against the declared ones rather than trusting either side.
     */
    uri: "groove://changelog",
    name: "Changelog",
    description: "The release notes the app itself shows, newest first.",
    mimeType: "application/json",
    read: () => JSON.stringify(changelog()),
  },
];

/**
 * The committed changelog, as the app ships it.
 *
 * Read from the same file the web build copies into `dist/`, so the agent and the UI cannot disagree about what changed.
 */
/**
 * A key estimate from the notes, not from the audio.
 *
 * The profile weights are Krumhansl-Kessler's (published, and short enough to carry here): correlate the pitch-class histogram against
 * each rotation of the major and minor profiles and take the best. The honest limit is in the return value — `fit` is a correlation, so a
 * pattern with three notes will report a key and a low fit rather than pretending to certainty.
 */


export interface PromptDefinition {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  build: (args: Record<string, string>) => string;
}

export const PROMPTS: PromptDefinition[] = [
  {
    name: "compose_groove",
    title: "Compose a groove",
    description: "Write a playable pattern for a genre, using the library's own defaults as the starting point.",
    arguments: [
      { name: "genre", description: "genre id (see list_genres)", required: true },
      { name: "mood", description: "how it should feel, e.g. 'darker, more space'", required: false },
    ],
    build: (args) => [
      `Compose an 8-bar groove in the "${args.genre}" genre for Groove Lab.`,
      "",
      `1. Call get_genre with id "${args.genre}" and read its bpm, key, meter, instrumentation, rhythm features and production tips.`,
      `2. Call get_pattern for the same genre. That pattern is the tradition you are writing in — keep its tempo, meter and swing unless the brief says otherwise.`,
      `3. Change it with apply_pattern_ops only (set_step, clear_step, set_velocity, humanize, swing, …). Never hand back a pattern you did not produce through the tool, so the operations stay reproducible.`,
      args.mood ? `4. The brief: ${args.mood}. Say which ops express it.` : `4. Keep the groove idiomatic: name the two or three ops that carry its character.`,
      `5. Validate it (validate_pattern) and describe it (pattern_statistics), then give the share_url so a human can hear it.`,
      "",
      "Report the ops you applied and what each one changed musically.",
    ].join("\n"),
  },
  {
    name: "explain_genre",
    title: "Explain a genre",
    description: "Explain why a genre sounds the way it does, grounded in the library's recorded data.",
    arguments: [{ name: "genre", description: "genre id", required: true }],
    build: (args) => [
      `Explain the "${args.genre}" genre to someone who produces music but has never made it.`,
      "",
      `Ground every claim in tool output: get_genre (cultural context, rhythm features, sound design, drum pattern, production tips, radar metrics), get_pattern (what the default pattern actually plays) and pattern_statistics (density, off-beats, velocity spread).`,
      "Quote the pattern's numbers rather than describing it vaguely, and finish with the three decisions a producer would have to make to sound convincing in this style.",
    ].join("\n"),
  },
  {
    /**
     * The few-shot prompt the evaluation asked for, and the one that closes the loop with workstream 5's examples: it makes the agent
     * **read a recipe before writing one**, which is what turns an example library into a teaching device rather than a pile of JSON.
     */
    name: "compose_with_examples",
    title: "Compose a section from a worked example",
    description: "Imitate a worked example's recipe rather than its JSON: read the examples for a genre, then build a section with the same tools.",
    arguments: [
      { name: "genreId", description: "the genre to work in", required: true },
      { name: "goal", description: "what the section should do, e.g. 'a four-bar verse that leaves room for a vocal'", required: true },
    ],
    build: (args) => [
      `Compose in ${args.genreId} for this goal: ${args.goal}.`,
      "",
      `1. Read \`groove://examples/${args.genreId}\` (or call get_example with genreId "${args.genreId}"). Each example carries a **recipe** — the tool calls, in order, that produced it — and that recipe is what you are imitating, not the pattern's JSON.`,
      "2. Start from the genre's own arranged pattern (get_pattern) rather than from nothing; the first example is that pattern, unchanged, and it is the baseline every change is measured against.",
      "3. Make your changes with apply_pattern_ops (set_step, set_velocity, clear_track, set_chord_progression, …) so every edit is reproducible from the calls alone. If you need harmony, suggest_progression chooses a progression for a feeling and renders it in a key; if you need a line, generate_melody writes one contour-first, in key, inside a bounded range, and the same seed reproduces it.",
      "4. Say what you changed and why, and quote the numbers you checked: pattern_statistics for density and velocity spread, validate_pattern for correctness, and — if you render — the loudness, true peak and energy curve analyze_audio returns.",
      "5. If a change went wrong, undo_song returns the song to the state before it, so an experiment does not have to be permanent.",
    ].join("\n"),
  },
  {
    name: "practice_plan",
    title: "Practice plan",
    description: "Build a study order from the app's own masterclass and tutorial data.",
    arguments: [
      { name: "goal", description: "what the learner wants to be able to do", required: true },
      { name: "level", description: "beginner | intermediate | advanced", required: false },
    ],
    build: (args) => [
      `Build a practice plan for someone whose goal is: ${args.goal}.`,
      args.level ? `Assume they are ${args.level}.` : "",
      "",
      "Use list_masterclasses for the lessons the app ships, list_genres to pick the genres they should study in order, and get_genre for each pick's rhythm features and production tips.",
      "For each step say what to practise, which genre's default pattern to copy (get_pattern), and how they will know they got it right (a number from pattern_statistics).",
    ]
      .filter(Boolean)
      .join("\n"),
  },
];
