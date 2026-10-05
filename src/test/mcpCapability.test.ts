/**
 * **Every feature the app has, and what an agent can reach of it.**
 *
 * The owner asked whether the existing features are all exposed through MCP; the honest way to answer a question like that is to enumerate rather than to remember. This file *is* the answer: one row per user-facing surface, naming the MCP surface that serves it — a **tool**, a **resource**, a **prompt** — or the reason none does.
 *
 * **Three kinds, because they answer different questions.** A tool does something, a resource is something to read, and a prompt is a way of asking. Writing `practice_plan` in the tools column was wrong the first time this file was written, and the criterion caught it: conflating the three makes the map look more capable than the server is.
 *
 * The map is kept true in three directions:
 *
 *   · **every view in `src/views/` must have a row**, so a new screen fails this suite until somebody says what an agent can do with it — the moment when adding a tool is cheap;
 *   · **every name must exist in the right list**, so a rename cannot leave the map describing a surface nobody can reach;
 *   · **a surface with nothing must carry a reason**, because an unexplained gap reads as "covered" to everyone who did not write it.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { PROMPTS, RESOURCES, TOOLS } from "../../mcp/registry";

interface Capability {
  /** The view file, or a named surface that has no view of its own. */
  surface: string;
  /** What a person does there. */
  feature: string;
  /** Tools that reach the same state. */
  tools?: string[];
  /** Resources with the same content, by uri. */
  resources?: string[];
  /** Prompts that ask for the same work. */
  prompts?: string[];
  /** Why the gap is a gap, when the surface has nothing of its own. */
  reason?: string;
}

const CAPABILITIES: Capability[] = [
  {
    surface: "AnalyzerView",
    feature: "look at a sound: spectrum, loudness, key",
    tools: ["analyze_audio", "spectral_balance", "estimate_key", "get_loudness_report"],
    resources: ["groove://loudness"],
  },
  {
    surface: "ChallengeView",
    feature: "practise against a plan",
    prompts: ["practice_plan"],
    /**
     * The plan is the part an agent can write and read; the **rank and streak** beside it are a record of what the person sitting there has done — not a property of the music, and not something an agent should be able to claim.
     */
    reason: "the practice plan is reachable as a prompt; rank and streak are a record of a person's own playing rather than of the music",
  },
  {
    surface: "ChordProgressionsView",
    feature: "find, hear and export progressions; arpeggiate or strum them",
    /**
     * The panel's arpeggiator and strummer — its patterns, rates, octaves, gates and strum directions — are now baked into the pattern by
     * `apply_pattern_ops`' `transform_pattern` op, which calls the same engine (`src/utils/arpeggiatorTheory.ts`) the panel plays through. The
     * audition itself stays a live performance surface, like the console's faders: nothing to store beyond the notes the transform writes.
     */
    tools: ["list_chord_progressions", "get_chord_progression", "suggest_progression", "apply_pattern_ops"],
  },
  {
    surface: "CompareView",
    feature: "compare two genres, side by side",
    tools: ["compare_genres"],
  },
  {
    surface: "CustomGenreMakerView",
    feature: "fork a genre and save your own",
    tools: ["list_genres", "get_genre", "get_pattern", "apply_pattern_ops", "list_custom_genres", "get_custom_genre", "save_custom_genre", "delete_custom_genre", "duplicate_custom_genre"],
    /**
     * **The gap this row used to describe, and what is left of it.** Saving lived only in the browser's IndexedDB, which the Node server does not have, so an agent could read the library it would fork from and keep nothing. The store now sits behind `CustomGenreStore`, and the tools above save, read, copy and delete a genre — a fork
     * through `save_custom_genre` carries the library's defaults because it calls the maker's own `forkGenre`.
     *
     * What remains unreachable is **reach, not saving**: the server keeps its genres in the process for the session, so it can neither read nor change the genres a person saved in the app, and the genres it saves do not survive a restart. That is the store the server owns, exactly as the arrangement and song maps are.
     */
    reason: "saving now works, but into the server's own process-local store: an agent cannot reach the genres saved in the browser's IndexedDB, and what it saves for the session does not survive a restart",
  },
  {
    surface: "ExploreListView",
    feature: "browse and search the library",
    tools: ["list_genres", "search_genres", "list_categories"],
    resources: ["groove://genres"],
  },
  {
    surface: "GalaxyView",
    feature: "see how genres relate",
    tools: ["get_genre_relations"],
  },
  {
    surface: "GenreDetailView",
    feature: "read one genre's recipe and hear it",
    tools: ["get_genre"],
    resources: ["groove://genre/{id}", "groove://examples/{genre}"],
    prompts: ["explain_genre", "compose_groove"],
  },
  {
    surface: "HardwareConsoleView",
    feature: "play the console's controls while it sounds",
    tools: ["set_lane_slots", "apply_pattern_ops"],
    prompts: ["compose_groove"],
    /**
     * The console is a **performance surface**: its faders write to the live engine, and the state that matters afterwards is the pattern the engine is playing, which the listed tools do reach. A tool that moved a fader mid-render would be a tool for nothing.
     */
    reason: "the console edits live playback parameters rather than stored state; the pattern it plays is reachable",
  },
  {
    surface: "HorizontalTimelineView",
    feature: "arrange sections along a horizontal timeline",
    tools: ["create_song", "add_section", "duplicate_section", "set_clip", "get_song", "undo_song"],
  },
  {
    surface: "VerticalTimelineView",
    feature: "the same arrangement, stacked",
    tools: ["get_song", "set_clip", "set_lane_slots", "add_section"],
  },
  {
    surface: "KickAnatomyView",
    feature: "design a kick drum's own sound",
    tools: ["apply_pattern_ops", "get_pattern"],
    prompts: ["compose_groove"],
    reason: "the anatomy editor writes live synth parameters; the pattern that results is reachable, the individual parameter is not",
  },
  {
    surface: "MasterclassView",
    feature: "learn from worked examples",
    tools: ["list_masterclasses", "get_example"],
    resources: ["groove://masterclasses", "groove://examples/{genre}"],
  },
  {
    surface: "NewProjectView",
    feature: "the arrangement: tracks, notes, instruments, mixing",
    tools: [
      "create_arrangement",
      "add_arrangement_track",
      "add_arrangement_note",
      "move_arrangement_note",
      "remove_arrangement_note",
      "set_arrangement_note_length",
      "set_arrangement_region",
      "set_arrangement_bars",
      "set_arrangement_track_gain",
      "set_arrangement_track_pan",
      "set_arrangement_track_asset",
      "list_arrangement_instruments",
      "render_arrangement",
    ],
  },
  {
    surface: "StudioView",
    feature: "the pattern studio: lanes, clips, inserts, mixing",
    tools: ["get_pattern", "set_lane_slots", "apply_pattern_ops", "validate_pattern", "pattern_statistics", "set_tempo"],
    prompts: ["compose_groove", "compose_with_examples"],
  },
  {
    surface: "arrangement: audition and editors",
    feature: "press keys to hear an instrument; write notes in the roll; read the score",
    tools: ["render_arrangement", "export_arrangement_musicxml", "import_arrangement_musicxml"],
    /**
     * **The three editors are readings, not state.** A keyboard is a way to press a note, a roll is a way to place one, and a stave is a way to read one: everything they change is a `NoteEvent`, and the tools above are how an agent writes, hears and exports those. There is no "open the
     * score" tool for the same reason there is no "click the third key" tool.
     */
    reason: "the keyboard, the roll and the score are input and display surfaces over the note model, which the tools do reach; the surfaces themselves have nothing of their own to expose",
  },
  {
    surface: "sharing and export",
    feature: "share a link; export a song, a pattern or a score",
    tools: ["share_url", "export_groove", "import_groove", "export_midi", "export_arrangement_ableton", "export_arrangement_musicxml", "export_arrangement_midi"],
    resources: ["groove://changelog", "groove://docs"],
  },
  {
    surface: "loudness and rendering",
    feature: "measure, normalise and render audio",
    tools: ["normalize_loudness", "get_loudness_report", "render_arrangement", "render_song"],
  },
  {
    surface: "voice",
    feature: "write and check a vocal line",
    tools: ["synthesize_vocal", "set_arrangement_vocal_melody", "validate_prosody"],
  },
];

const toolNames = new Set(TOOLS.map((tool) => tool.name));
const resourceUris = new Set(RESOURCES.map((resource) => resource.uri));
const promptNames = new Set(PROMPTS.map((prompt) => prompt.name));

describe("MCP · what an agent can reach of what the app can do", () => {
  it("gives every view in the app a row, so a new screen cannot go unasked", () => {
    const views = readdirSync("src/views")
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => name.replace(/\.tsx$/, ""));
    const mapped = new Set(CAPABILITIES.map((entry) => entry.surface));
    const missing = views.filter((view) => !mapped.has(view));
    expect(missing, `these views have no MCP row: ${missing.join(", ")} — say what an agent can do there, or why nothing can`).toEqual([]);
  });

  it("names tools, resources and prompts that exist, each in its own list", () => {
    const wrong: string[] = [];
    for (const capability of CAPABILITIES) {
      for (const tool of capability.tools ?? []) if (!toolNames.has(tool)) wrong.push(`${capability.surface} → tool ${tool}`);
      for (const uri of capability.resources ?? []) if (!resourceUris.has(uri)) wrong.push(`${capability.surface} → resource ${uri}`);
      for (const prompt of capability.prompts ?? []) if (!promptNames.has(prompt)) wrong.push(`${capability.surface} → prompt ${prompt}`);
    }
    // A name in the wrong column is how this file first lied: `practice_plan` is a prompt, and listing it as a tool made the server look more capable than it is.
    expect(wrong, `these rows name something that does not exist in that list: ${wrong.join(", ")}`).toEqual([]);
  });

  it("says why when a surface has nothing of its own, rather than leaving it blank", () => {
    const unexplained = CAPABILITIES.filter((entry) => (entry.tools ?? []).length === 0 && (entry.resources ?? []).length === 0 && (entry.prompts ?? []).length === 0 && !entry.reason).map(
      (entry) => entry.surface
    );
    expect(unexplained).toEqual([]);
  });

  it("covers the surfaces that are not views, because the question is about features and not about files", () => {
    // The arrangement's editors and the sharing/render/voice paths have no view of their own, and are exactly where a gap would hide.
    const surfaces = CAPABILITIES.map((entry) => entry.surface);
    for (const surface of ["arrangement: audition and editors", "sharing and export", "loudness and rendering", "voice"]) {
      expect(surfaces).toContain(surface);
    }
  });

  it("报告每个能力面的覆盖情况，供人核对", () => {
    /**
     * Printed rather than only asserted: the point of the map is that a person can read the answer, and a table in a test log is the version of it that cannot go stale.
     */
    const rows = CAPABILITIES.map((entry) => {
      const parts = [
        ...(entry.tools ?? []).map((name) => `tool:${name}`),
        ...(entry.resources ?? []).map((uri) => `resource:${uri}`),
        ...(entry.prompts ?? []).map((name) => `prompt:${name}`),
      ];
      return `   ${entry.surface.padEnd(28)} ${parts.length > 0 ? parts.join(" ") : `—— ${entry.reason}`}`;
    });
    console.log(`\n能力覆盖（${CAPABILITIES.length} 个能力面）:\n${rows.join("\n")}\n`);
    expect(CAPABILITIES.length).toBeGreaterThan(0);
  });
});
