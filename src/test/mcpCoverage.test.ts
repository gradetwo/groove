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
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TOOLS } from "../../mcp/registry";

/** `resetTrackIdsForTests` is a seam, and the verbs below are how an operation that changes the model names itself. */
const OPERATION = /^(add|set|remove|rename|change|toggle|select|assign|create)/;

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
  setTrackSample: "set_arrangement_track_instrument",
  setTrackSteps: "set_arrangement_track_steps",
  addTrackNote: "add_arrangement_note",
  removeTrackNote: "remove_arrangement_note",
  moveTrackNote: "move_arrangement_note",
  setTrackNoteLength: "set_arrangement_note_length",
  setTrackGain: "set_arrangement_track_gain",
  setArrangementBars: "set_arrangement_bars",
  setArrangementTempo: "set_arrangement_tempo",
  setArrangementTempoMap: "set_arrangement_tempo_map",
  setArrangementTimeSignature: "set_arrangement_time_signature",
  setTrackPan: "set_arrangement_track_pan",
  addTake: "add_arrangement_take",
  selectTrackTake: "select_arrangement_take",
  assignTakeToRange: "assign_arrangement_take_range",
};

/**
 * Operations that need no tool, each with a reason. "Not done yet" is not one of them.
 */
const EXCLUDED: Record<string, string> = {
  toggleStep: "`set_arrangement_track_steps` writes a whole pattern in one call; a toggle would be a second way to say the same thing, and the two would drift",
  resetTrackIdsForTests: "a test seam rather than an operation — it exists so a criterion can predict an id",
};

function everyExport(): string[] {
  const source = readFileSync("src/data/arrangementEdits.ts", "utf8");
  return [...source.matchAll(/^export function ([A-Za-z0-9_]+)\(/gm)].map((match) => match[1]!).sort();
}

function operationsInSource(): string[] {
  return everyExport().filter((name) => OPERATION.test(name));
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
    // The rule the three above implement: a verb that changes the model means a tool, unless a reason is written down.
    for (const name of operationsInSource()) {
      if (name in EXCLUDED) expect(EXCLUDED[name]!.length, `${name} needs a real reason`).toBeGreaterThan(30);
    }
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
    const registry = readFileSync("mcp/registry.ts", "utf8");
    const exported = [...module.matchAll(/^export function (\w+)/gm)].map((match) => match[1]!);

    /** Exported for a caller that is not a tool: the internal helpers the tools are built from. */
    const NOT_A_TOOL = new Set([
      // Resets the process-local arrangement map between criteria; a tool that cleared every arrangement a caller had open would be a foot-gun, not a feature.
      "clearMcpArrangements",
      "edit",
      "flattenMcpArrangement",
      "summariseArrangement",
      "requireArrangement",
      "arrangementFromArgs",
    ]);

    const unreachable = exported.filter((name) => !NOT_A_TOOL.has(name) && !registry.includes(`${name}(`));
    expect(unreachable, `these operations exist but no tool calls them: ${unreachable.join(", ")}`).toEqual([]);
  });
});
