/**
 * **MCP is part of the feature, not the step after it.**
 *
 * The owner's instruction, and the reason this is a test rather than a sentence in a document: "MCP needs to be provided from the first moment in a feature's development". A sentence like that gets postponed under time pressure, and being postponed does
 * not look like a failure — it looks like nothing, until somebody asks whether a tool exists.
 *
 * So the guard reads the **source** of the arrangement data layer, finds every exported function that changes the model, and requires each one to be either reachable through an arrangement tool or listed below with a reason. A new operation with neither
 * turns this red while it is being written, which is the moment the tool is cheap to add.
 *
 * Reading the source rather than importing the module is deliberate: the point is to notice an export that **nobody wired up**, and an import list would only see the ones somebody did.
 */
import { registrySource } from "./helpers/registrySource";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TOOLS } from "../../mcp/registry";

/**
 * ⭐ **Read-only exports, each with a reason — and *everything else* counts as an operation.**
 *
 * This used to be the other way round: a white-list of verbs an operation could start with
 * (`/^(add|set|remove|rename|change|toggle|select|assign|create)/`), and anything outside it was invisible to this gate.
 * Measured 2026-10-16, `src/data/arrangementEdits.ts` exported **twelve functions that change the model whose names begin
 * with none of those verbs** — `arpeggiateNotesInRect`, `duplicateNotesByDelta`, `humanizeArrangementNoteVelocity`,
 * `insertTrack`, `legatoNotesInRect`, `quantizeArrangementNoteLengths`, `rampArrangementNoteVelocity`, `rampVelocityInRange`,
 * `replaceTrack`, `stampChordInRect`, `transposeNotesInRange`, `varyArrangementNotes` — so neither this gate nor its
 * Web-side twin (`webEntryReachability.test.ts`, which copied the same expression on purpose) could see them at all.
 * Three of them had a tool all along and were simply not linked to it; one of them had **no Web entry either**, which is
 * precisely the defect the twin exists to catch.
 *
 * The default is now "it changes the model", and the exceptions are named here. The cost is deliberate: a new *query* or
 * validator in this module needs one line with a reason, while a new *operation* is covered the moment it is written.
 * Erring towards "operation" is the right side for a gate whose whole job is to notice that nobody wired something up.
 *
 * ⚠️ **This list and the one in `webEntryReachability.test.ts` must stay identical** — both gates read one module, and two
 * lists that drifted would each be able to cover for the other's blind spot. A criterion below compares them by reading
 * the other file's source.
 */
const READ_ONLY: Record<string, string> = {
  carriesStarterNotes: "a query: does this lane still hold the starter content, or has a person replaced it?",
  starterNotesFor: "a query: the notes a kind is created with, exposed so a caller can tell them from a person's own",
  requireTrackKind: "a validator that throws when a track is missing; it returns nothing and changes nothing",
  notesWithinRect: "a query: which notes fall inside a rectangle — the reader both rectangle edits are built from",
};

/**
 * Operation → the tool that exposes it. Both directions are checked below, so a tool named here that does not exist is also a failure.
 */
const EXPOSED: Record<string, string> = {
  createArrangement: "create_arrangement",
  createArrangementFromTemplate: "create_arrangement",
  addTrack: "add_arrangement_track",
  removeTrack: "remove_arrangement_track",
  changeTrackKind: "set_arrangement_track_kind",
  renameTrack: "rename_arrangement_track",
  setTrackFlag: "set_arrangement_track_flag",
  setTrackParent: "set_arrangement_track_parent",
  setCollapsed: "set_arrangement_track_collapsed",
  setTrackSample: "set_arrangement_track_asset",
  // ⭐ The synth half of choosing a sound: a preset by name, which is what a synth track already sounds through.
  setTrackInstrument: "set_arrangement_track_preset",
  /**
   * ⭐ **The lane's *own* share code, which is a third state.** Not the instrument name above (this repository's handwritten
   * patches, which the resolver falls back to) and not a preset id either: `gs1Patch` is a `gs1.1.…` code naming a sound
   * directly. `apply_gs1_patch` is the tool that takes an arbitrary code, so it is the one mapped here; since this round
   * `load_synth_preset` is the friendlier way to reach the same field with one of the synth's 120 factory presets.
   */
  setTrackGs1Patch: "apply_gs1_patch",
  setTrackSteps: "set_arrangement_track_steps",
  addTrackNote: "add_arrangement_note",
  addTrackNotes: "add_arrangement_notes",
  removeTrackNote: "remove_arrangement_note",
  moveTrackNote: "move_arrangement_note",
  setTrackNoteLength: "set_arrangement_note_length",
  setTrackGain: "set_arrangement_track_gain",
  setTrackAutomation: "set_arrangement_track_automation",
  // ⭐ The region drag's model edit, exposed as an operation: the guard below is what made this a tool rather than an
  // exclusion, which is exactly what its own message asks for ("add one, or add them to EXCLUDED with a reason").
  setTrackRegion: "set_arrangement_region",
  setArrangementBars: "set_arrangement_bars",
  setArrangementTempo: "set_arrangement_tempo",
  setArrangementTempoMap: "set_arrangement_tempo_map",
  setArrangementTimeSignature: "set_arrangement_time_signature",
  setTrackPan: "set_arrangement_track_pan",
  // The mix decisions the /console knobs make, reachable from the protocol: sends to the two buses, and the
  // per-track insert chain (high-pass, three EQ bands, compressor, drive).
  setTrackSends: "set_arrangement_track_sends",
  setTrackInsert: "set_arrangement_track_insert",
  // Binding a lyric to the note it is sung on — the Web entry is the lyrics panel, the protocol entry is this.
  setTrackNoteSyllable: "set_arrangement_vocal_melody",
  setTrackNoteVelocity: "set_arrangement_note_velocity",
  addTake: "add_arrangement_take",
  selectTrackTake: "select_arrangement_take",
  assignTakeToRange: "assign_arrangement_take_range",
  /**
   * ⭐ **Three tools that already existed, linked for the first time by the read-only inversion.** They were reached from
   * `mcp/arrangement.ts` all along (`varyArrangementNotes` at `:928`, `quantizeArrangementNoteLengths` at `:933`,
   * `transposeNotesInRange` at `:985`); what was missing was any record that they are operations, because their names do
   * not start with a verb from the old list.
   */
  varyArrangementNotes: "vary_arrangement_notes",
  quantizeArrangementNoteLengths: "quantize_arrangement_note_lengths",
  transposeNotesInRange: "transpose_arrangement_notes",
};

/**
 * Operations that need no tool, each with a reason. "Not done yet" is not one of them.
 */
const EXCLUDED: Record<string, string> = {
  toggleStep: "`set_arrangement_track_steps` writes a whole pattern in one call; a toggle would be a second way to say the same thing, and the two would drift",
  duplicateNotesByDelta:
    "a rectangle copy, and the interface's own copy acts on the **exact marked set** (`arrangement-copy-selection`) rather than on geometry — a scattered selection is not a rectangle, and re-deriving one would copy notes the person did not select. The protocol reaches the notes one at a time through add_arrangement_note",
  removeNotesWithinRect:
    "the deletion half of that rectangle pair, with the same reason: the interface removes the marked set, and remove_arrangement_note removes one note, which is what a protocol caller asks for",
  legatoNotesInRect:
    "a note-length edit driven by a selection, and the protocol sets one length at a time through set_arrangement_note_length",
  /**
   * ⭐ **The selection gestures the inversion surfaced.** Each is a Web editing action over the roll's marks; the protocol
   * writes the notes it wants one at a time, and a *selection* is a surface concept with no protocol equivalent (a tool
   * call names notes, not a selection). Writing the policy down once, here, is the point of the four entries — before the
   * inversion nothing asked whether these needed a tool.
   */
  stampChordInRect:
    "a selection gesture: the roll's marks decide where the chord lands, and the protocol writes the notes it wants through add_arrangement_note",
  arpeggiateNotesInRect:
    "the arpeggio half of the same gesture — the marks decide the span — and the protocol adds the notes one at a time",
  humanizeArrangementNoteVelocity:
    "a humanising pass over a selection; the hash that makes it reproducible is a Web editing decision, and the protocol sets one note's velocity through set_arrangement_note_velocity",
  rampArrangementNoteVelocity:
    "a velocity ramp drawn across a selection, which a protocol caller expresses by writing the velocities it wants (set_arrangement_note_velocity)",
  rampVelocityInRange:
    "the span-scoped form of that ramp; its caller is `arrangementFormPlan`'s form port, not a tool",
  insertTrack:
    "an undo primitive rather than an operation: `arrangementHistory`'s track commands call it to put a track back at its index, and the protocol reaches those through add_arrangement_track",
  replaceTrack:
    "the same for a whole track object — how a kind change and a track restore put the previous track back — reached through set_arrangement_track_kind",
  resetTrackIdsForTests: "a test seam rather than an operation — it exists so a criterion can predict an id",
};

function everyExport(): string[] {
  const source = readFileSync("src/data/arrangementEdits.ts", "utf8");
  return [...source.matchAll(/^export function ([A-Za-z0-9_]+)\(/gm)].map((match) => match[1]!).sort();
}

function operationsInSource(): string[] {
  /**
   * ⭐ **Everything that is not named as read-only is an operation.** `everyExport` reads the source rather than the module
   * for the reason this file's header gives: the point is to notice an export nobody wired up, and an import list would
   * only see the ones somebody did.
   */
  return everyExport().filter((name) => !(name in READ_ONLY));
}

/** The read-only names the Web-side twin pins, read from its source so the two cannot drift apart in silence. */
function readOnlyInTheOtherGate(): string[] {
  const source = readFileSync("src/test/webEntryReachability.test.ts", "utf8");
  const start = source.indexOf("const READ_ONLY");
  const block = source.slice(start, source.indexOf("};", start));
  return [...block.matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map((match) => match[1]!).sort();
}

describe("the arrangement surface covers the arrangement layer", () => {
  it("exposes every operation that changes the model, or says why not", () => {
    const uncovered = operationsInSource().filter((name) => !(name in EXPOSED) && !(name in EXCLUDED));
    expect(
      uncovered,
      `these operations change the arrangement and no MCP tool reaches them — add one, or add them to EXCLUDED with a reason: ${uncovered.join(", ")}`
    ).toEqual([]);
  });

  it("names a tool that exists, so the map cannot rot in the other direction", () => {
    const names = new Set(TOOLS.map((tool) => tool.name));
    const missing = Object.entries(EXPOSED)
      .filter(([, tool]) => !names.has(tool))
      .map(([operation, tool]) => `${operation} → ${tool}`);
    expect(missing, `these mappings name tools that are not registered: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not keep an exclusion for an operation that is gone", () => {
    // A stale exclusion is how a rule like this stops meaning anything: the name it excuses no longer exists, and the next reader assumes it was checked. Checked against **every** export rather than the verb-filtered list, because an exclusion may
    // legitimately name something whose name does not look like an operation — that is part of why it is excluded rather than covered.
    const operations = new Set(everyExport());
    const stale = [...Object.keys(EXPOSED), ...Object.keys(EXCLUDED)].filter((name) => !operations.has(name));
    expect(stale, `these are no longer exported by the arrangement layer: ${stale.join(", ")}`).toEqual([]);
  });

  it("keeps MCP first for anything added later, which is what the operation verb marks", () => {
    // The rule the three above implement: the default is "it changes the model" and needs a tool, unless a reason says otherwise.
    for (const name of operationsInSource()) {
      if (name in EXCLUDED) expect(EXCLUDED[name]!.length, `${name} needs a real reason`).toBeGreaterThan(30);
    }
  });

  it("⭐ erring towards 'operation' is only cheap while the read-only list stays a list of reasons", () => {
    /**
     * ⭐ **The inversion is only safe if the exception list cannot quietly become a dump.** A blank reason, or one that
     * just restates the name, would turn "everything else is an operation" into "everything is exempt" — a worse blind
     * spot than the verb list it replaced. So each exception carries a sentence, and the list is short enough to read.
     */
    for (const [name, reason] of Object.entries(READ_ONLY)) {
      expect(reason.length, `${name} needs a real reason, not a label`).toBeGreaterThan(40);
      expect(reason, `${name}'s reason should say what it is`).toMatch(/^a (query|validator)/);
    }
    expect(Object.keys(READ_ONLY).length, "a long exception list means the default is wrong").toBeLessThan(8);
  });

  it("⭐ classifies the read-only exports exactly as the Web-side gate does", () => {
    /**
     * ⭐ **Two gates, one module, and therefore one list.** `webEntryReachability.test.ts` copied the verb expression from
     * here on purpose ("the two gates must agree about what counts as an operation that changes the model, or one of them
     * will cover for the other's blind spot"). With the default inverted, that agreement now has to be checked rather than
     * assumed: two lists that drifted apart would each hide the other's gap. The other file's source is read so the pin
     * is about what is written, not about what this file hopes is written.
     */
    expect(
      readOnlyInTheOtherGate(),
      "these two files must classify the same exports as read-only — see the note on READ_ONLY"
    ).toEqual(Object.keys(READ_ONLY).sort());
  });
});

/**
 * ⭐ **The layer above the layer.** `mcpCoverage` checks that every data-layer operation reaches a tool; this checks that every **operation written for MCP** is actually reachable from one. The gap it closes was real: `exportMcpMusicXml` was written, exported, imported into the registry — and no tool used it, while a commit message said one did. Nothing caught that, because a function that no tool names is
 * simply dead code, which no type checker objects to.
 *
 * The rule is mechanical: an exported function in `mcp/arrangement.ts` must be **named** by some tool's handler in `mcp/registry.ts`, or be in the list below with a reason.
 */
describe("MCP · the operations written for MCP reach a tool", () => {
  it("names every exported operation from a tool handler, or says why not", () => {
    const module = readFileSync("mcp/arrangement.ts", "utf8");
    const registry = registrySource();
    const exported = [...module.matchAll(/^export function (\w+)/gm)].map((match) => match[1]!);

    /** Exported for a caller that is not a tool: the internal helpers the tools are built from. */
    const NOT_A_TOOL = new Set([
      // Resets the process-local arrangement map between criteria; a tool that cleared every arrangement a caller had open would be a foot-gun, not a feature.
      "clearMcpArrangements",
      "edit",
      "flattenMcpArrangement",
      // ⭐ A helper the flatten is built from: it narrows an arrangement's notes to a bar span, and the tool that
      // benefits (`render_arrangement`, through `flattenMcpArrangement`) never names it. Exported because the
      // boundary it decides — an exclusive end, and a note kept when it is still sounding — is worth testing
      // without rendering anything.
      "notesInBarRange",
      "summariseArrangement",
      "requireArrangement",
      "arrangementFromArgs",
    ]);

    const unreachable = exported.filter((name) => !NOT_A_TOOL.has(name) && !registry.includes(`${name}(`));
    expect(unreachable, `these operations exist but no tool calls them: ${unreachable.join(", ")}`).toEqual([]);
  });
});
