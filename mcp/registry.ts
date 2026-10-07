/**
 * ⭐ **The registry is a barrel now.**
 *
 * It holds three things and nothing else: the **tool list** (each group lives in its own `registry*.ts`), the
 * **resources**, and the **prompts**. The tool bodies, the schemas and the helpers they need moved out one group at a
 * time — this file was seventeen hundred lines and is not, and every import below is one the body actually uses.
 * `scripts/check_dead_exports.mjs` and the unused-import rule keep it that way.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { examplesFor } from "./examples";
import { loudnessReport } from "./exporting";
import { getGenre, libraryIndex, listMasterclasses } from "./library";
import { ARRANGEMENT_TOOLS } from "./registryArrangement";
import { ARRANGEMENT_NOTE_TOOLS } from "./registryArrangementNotes";
import { PROJECT_TOOLS } from "./registryProject";
import { LIBRARY_TOOLS } from "./registryLibrary";
import { GS1_TOOLS } from "./registryGs1";
import { CHORD_TOOLS } from "./registryChords";
import { VOCAL_TOOLS } from "./registryVocals";
import { RENDER_TOOLS } from "./registryRender";
import { FILE_TOOLS } from "./registryFiles";
import { ANALYSIS_TOOLS } from "./registryAnalysis";
import { EXAMPLE_TOOLS } from "./registryExamples";
import { changelog, type ToolDefinition } from "./toolKit";

export * from "./toolKit";

export const TOOLS: ToolDefinition[] = [
  ...EXAMPLE_TOOLS,
  ...ANALYSIS_TOOLS,
  ...FILE_TOOLS,
  ...RENDER_TOOLS,
  ...VOCAL_TOOLS,
  ...CHORD_TOOLS,
  ...GS1_TOOLS,
  ...LIBRARY_TOOLS,
  ...PROJECT_TOOLS,
  /**
   * ⭐ **The arrangement surface, which names an arrangement and a track.**
   *
   * These add a track, choose the kind, point a sampler at a catalogue asset, write notes, complete a take, mix and
   * render. The v1 song model they replaced is still the renderer's internal currency, but no tool in this list asks a
   * caller for a pattern — the tools that did were retired with it.
   */
  ...ARRANGEMENT_TOOLS,
  ...ARRANGEMENT_NOTE_TOOLS,
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
    description: "Write a playable arrangement for a genre, using the library's own material as the starting point.",
    arguments: [
      { name: "genre", description: "genre id (see list_genres)", required: true },
      { name: "mood", description: "how it should feel, e.g. 'darker, more space'", required: false },
    ],
    build: (args) => [
      `Compose an 8-bar groove in the "${args.genre}" genre for Groove Lab.`,
      "",
      `1. Call get_genre with id "${args.genre}" and read its bpm, key, meter, instrumentation, rhythm features and production tips.`,
      `2. Call create_arrangement with genreId "${args.genre}". That seeds the tracks from the genre's own material — keep its tempo, meter and swing unless the brief says otherwise.`,
      `3. Change it with the arrangement tools only (add_arrangement_notes, add_arrangement_note, move_arrangement_note, set_arrangement_note_length, quantize_arrangement_note_lengths, vary_arrangement_notes, transpose_arrangement_notes, remove_arrangement_note). Never hand back an edit you did not make through a tool, so every change stays reproducible.`,
      args.mood ? `4. The brief: ${args.mood}. Say which calls express it.` : `4. Keep the groove idiomatic: name the two or three calls that carry its character.`,
      `5. Check it (validate_arrangement), describe it (describe_arrangement) and render it (render_arrangement) so a human can hear it.`,
      "",
      "Report the calls you made and what each one changed musically.",
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
      `Ground every claim in tool output: get_genre (cultural context, rhythm features, sound design, drum pattern, production tips, radar metrics), create_arrangement with genreId "${args.genre}" then describe_arrangement (what the default material actually plays) and get_loudness_report (how loud it measures).`,
      "Quote the arrangement's numbers rather than describing it vaguely, and finish with the three decisions a producer would have to make to sound convincing in this style.",
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
      `2. Start from the genre's own material (create_arrangement with genreId "${args.genreId}") rather than from nothing; the first example is that material unchanged, and it is the baseline every change is measured against.`,
      "3. Make your changes with the arrangement tools (add_arrangement_notes, set_arrangement_tempo, transpose_arrangement_notes, …) so every edit is reproducible from the calls alone. If you need harmony, suggest_progression chooses a progression for a feeling and renders it in a key; if you need a line, generate_melody writes one contour-first, in key, inside a bounded range, and the same seed reproduces it.",
      "4. Say what you changed and why, and quote the numbers you checked: describe_arrangement for the tracks and steps, validate_arrangement for correctness, and — if you render — the loudness, true peak and peak headroom render_arrangement returns.",
      "5. If a change went wrong, undo_arrangement returns the arrangement to the state before it, so an experiment does not have to be permanent.",
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
      "For each step say what to practise, which genre's material to start from (create_arrangement with that genreId), and how they will know they got it right (a number from describe_arrangement or validate_arrangement).",
    ]
      .filter(Boolean)
      .join("\n"),
  },
];
