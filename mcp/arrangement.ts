/**
 * The v2 arrangement surface an agent composes with.
 *
 * The MCP tools could build a **v1 song** — clips, sections, lane slots — and nothing else. The arrangement the interface has used since `/new` was unreachable: an agent could not add a track, choose the kind of one, point a sampler at one of the mirrored
 * libraries, write the steps a track plays, or file a recording onto it. That gap is what this module closes.
 *
 * **The operations are the interface's own.** Every function here calls `src/data/arrangementEdits`, the same code a track row's button calls, so "what the agent did" and "what a person did" cannot drift into two behaviours — and each has the criteria
 * that layer already carries. What is added is the part the interface does not need: a process-local map keyed by id, because MCP calls are stateless and the id is how a later call names the same arrangement.
 *
 * The map is deliberately not persisted, exactly as the song map is not: the application owns projects, and this is a scratchpad for one session.
 */
import {
  TEMPLATES,
  addTake,
  addTrack,
  assignTakeToRange,
  changeTrackKind,
  createArrangement,
  createArrangementFromTemplate,
  removeTrack,
  renameTrack,
  selectTrackTake,
  setCollapsed,
  setTrackFlag,
  setTrackParent,
  setTrackSample,
  setTrackSteps,
} from "../src/data/arrangementEdits";
import type { ArrangementV2, TrackKindV2, TrackV2 } from "../src/types/arrangementV2";
import type { PlannedTake } from "../src/data/takePlanning";

const arrangements = new Map<string, ArrangementV2>();
let idSequence = 0;

export function clearMcpArrangements(): void {
  arrangements.clear();
  idSequence = 0;
}

export function getMcpArrangement(arrangementId: string): ArrangementV2 | undefined {
  return arrangements.get(arrangementId);
}

/** Every function that changes an arrangement reports the same way: a summary, plus anything wrong with the request. */
export interface ArrangementEditResult {
  summary: ArrangementSummary;
  problems: string[];
}

export interface ArrangementTrackSummary {
  id: string;
  kind: TrackKindV2;
  name: string;
  muted: boolean;
  soloed: boolean;
  collapsed: boolean;
  parentId?: string;
  /** The catalogue asset a sampler track plays, when one is chosen. */
  sampleAssetId?: string;
  /** The steps it plays, as the data holds them — so an agent can read back what it wrote. */
  steps: number[];
  /** How many of those steps are on, which is the number a person would count. */
  stepsOn: number;
  /** Take ids in recorded order, and which one plays. */
  takes: string[];
  selectedTakeId?: string;
}

export interface ArrangementSummary {
  arrangementId: string;
  songId: string;
  trackCount: number;
  tracks: ArrangementTrackSummary[];
  /** The templates a caller may name, so the list is discoverable rather than guessable. */
  templates: string[];
  /** Anything that would stop it being heard: an empty arrangement, a sampler with no instrument. */
  problems: string[];
}

function requireArrangement(arrangementId: string): ArrangementV2 {
  const arrangement = arrangements.get(arrangementId);
  if (!arrangement) throw new Error(`unknown arrangementId "${arrangementId}" — create one with create_arrangement`);
  return arrangement;
}

function summariseTrack(track: TrackV2, arrangement: ArrangementV2): ArrangementTrackSummary {
  const steps = arrangement.notesByTrack?.[track.id] ?? [];
  return {
    id: track.id,
    kind: track.kind,
    name: track.name,
    muted: track.muted === true,
    soloed: track.soloed === true,
    collapsed: track.collapsed === true,
    ...(track.parentId ? { parentId: track.parentId } : {}),
    ...(track.sample ? { sampleAssetId: track.sample.assetId } : {}),
    steps: [...steps],
    stepsOn: steps.filter((value) => value !== 0).length,
    takes: (track.takes ?? []).map((take) => take.id),
    ...(track.selectedTakeId ? { selectedTakeId: track.selectedTakeId } : {}),
  };
}

/**
 * The id is passed in rather than read off the arrangement, because the model has no id field: an arrangement belongs to a `songId` and nothing more. Identity for the MCP surface is the key in this module's map, which is why it travels
 * alongside.
 */
export function summariseArrangement(arrangementId: string, arrangement: ArrangementV2): ArrangementSummary {
  const problems: string[] = [];
  if (arrangement.tracks.length === 0) problems.push("the arrangement has no tracks, so it would render nothing");
  for (const track of arrangement.tracks) {
    // Stated because it is the mistake an agent makes here: a sampler with no instrument is silent, and silence reads as a bug in the renderer.
    if (track.kind === "sampler" && !track.sample) problems.push(`"${track.name}" is a sampler with no instrument, so it will be silent`);
    if (track.parentId && !arrangement.tracks.some((candidate) => candidate.id === track.parentId)) {
      problems.push(`"${track.name}" names a folder that is not there`);
    }
  }
  return {
    arrangementId,
    songId: arrangement.songId,
    trackCount: arrangement.tracks.length,
    tracks: arrangement.tracks.map((track) => summariseTrack(track, arrangement)),
    templates: TEMPLATES.map((template) => template.id),
    problems,
  };
}

export interface CreateMcpArrangementInput {
  songId?: string;
  /** A template id, one of `templates` in any summary. */
  templateId?: string;
  /** The kind the blank template's single track gets; ignored when a template is named. */
  blankKind?: TrackKindV2;
}

export function createMcpArrangement(input: CreateMcpArrangementInput = {}): ArrangementSummary {
  const songId = input.songId ?? "mcp";
  if (input.templateId !== undefined && !TEMPLATES.some((template) => template.id === input.templateId)) {
    throw new Error(`unknown templateId "${input.templateId}" — the templates are ${TEMPLATES.map((template) => template.id).join(", ")}, or omit it for a blank arrangement`);
  }
  const base = input.templateId
    ? createArrangementFromTemplate(songId, input.templateId, input.blankKind)
    : createArrangement(songId, input.blankKind ?? "instrument");
  const id = `arrangement-${++idSequence}`;
  arrangements.set(id, base);
  return summariseArrangement(id, base);
}

function edit(arrangementId: string, apply: (arrangement: ArrangementV2) => ArrangementV2): ArrangementEditResult {
  const arrangement = requireArrangement(arrangementId);
  const next = apply(arrangement);
  arrangements.set(arrangementId, next);
  const summary = summariseArrangement(arrangementId, next);
  return { summary, problems: summary.problems };
}

export function addMcpTrack(arrangementId: string, kind: TrackKindV2, name?: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => addTrack(arrangement, kind, name ?? defaultTrackName(kind)));
}

function defaultTrackName(kind: TrackKindV2): string {
  const names: Record<TrackKindV2, string> = { instrument: "Instrument", drumkit: "Drums", sampler: "Sampler", fx: "Effect", folder: "Folder" };
  return names[kind];
}

export function removeMcpTrack(arrangementId: string, trackId: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => removeTrack(arrangement, trackId)));
}

export function setMcpTrackKind(arrangementId: string, trackId: string, kind: TrackKindV2): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => changeTrackKind(arrangement, trackId, kind)));
}

export function renameMcpTrack(arrangementId: string, trackId: string, name: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => renameTrack(arrangement, trackId, name)));
}

export function setMcpTrackFlag(arrangementId: string, trackId: string, flag: "muted" | "soloed", value: boolean): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setTrackFlag(arrangement, trackId, flag, value)));
}

/** `null` detaches a track from its folder, which is why the parameter is nullable rather than optional. */
export function setMcpTrackParent(arrangementId: string, trackId: string, parentId: string | null): ArrangementEditResult {
  return edit(arrangementId, (arrangement) =>
    refuseUnknownTrack(arrangement, trackId, () => setTrackParent(arrangement, trackId, parentId ?? undefined))
  );
}

export function setMcpTrackInstrument(arrangementId: string, trackId: string, assetId: string): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(unknownTrack(arrangement, trackId));
    /**
     * The data layer refuses a non-sampler by returning the arrangement unchanged, which is right for a button and wrong for a caller that cannot see the screen: an agent that points an instrument at a drum track must be told, not left to notice
     * that nothing changed.
     */
    if (track.kind !== "sampler") throw new Error(`"${track.name}" is a ${track.kind} track, and only a sampler track plays a catalogue instrument`);
    return setTrackSample(arrangement, trackId, assetId);
  });
}

export function setMcpTrackSteps(arrangementId: string, trackId: string, steps: readonly number[]): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setTrackSteps(arrangement, trackId, steps)));
}

export interface AddMcpTakeInput {
  trackId: string;
  /** Audio for a sampler, a sequence for anything else — the one field that distinguishes them. */
  source: "audio" | "midi";
  label?: string;
  /** When it finished, in epoch milliseconds; defaults to now, which is what "just recorded" means. */
  recordedAt?: number;
  /** The bars it covered, when the transport was rolling. */
  startBar?: number;
  endBar?: number;
}

export function addMcpTake(arrangementId: string, input: AddMcpTakeInput): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === input.trackId);
    if (!track) throw new Error(unknownTrack(arrangement, input.trackId));
    const id = `take-${(track.takes?.length ?? 0) + 1}`;
    const planned: PlannedTake = {
      take: { id, recordedAt: input.recordedAt ?? Date.now(), source: input.source, ...(input.label ? { label: input.label } : {}) },
      ...(input.startBar !== undefined && input.endBar !== undefined
        ? { region: { startBar: input.startBar, endBar: input.endBar, takeId: id } }
        : {}),
    };
    return addTake(arrangement, input.trackId, planned);
  });
}

/** `null` clears the choice, so a track returns to whatever a region says. */
export function selectMcpTake(arrangementId: string, trackId: string, takeId: string | null): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(unknownTrack(arrangement, trackId));
    if (takeId !== null && !(track.takes ?? []).some((take) => take.id === takeId)) {
      throw new Error(`"${track.name}" has no take "${takeId}" — its takes are ${(track.takes ?? []).map((take) => take.id).join(", ") || "none"}`);
    }
    return selectTrackTake(arrangement, trackId, takeId ?? undefined);
  });
}

/**
 * Claim an existing take for a bar range — the comping action, as opposed to filing a new recording.
 *
 * `add_arrangement_take` claims a range when the recording covered one, which is the common case. This is the other one: a take recorded earlier, or a whole one, claimed for part of the arrangement. The range logic is `assignTakeToRange`, which splits any
 * range the new one crosses so ranges stay disjoint.
 */
export function assignMcpTakeRange(arrangementId: string, trackId: string, takeId: string, startBar: number, endBar: number): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => {
    const track = arrangement.tracks.find((candidate) => candidate.id === trackId);
    if (!track) throw new Error(unknownTrack(arrangement, trackId));
    if (!(track.takes ?? []).some((take) => take.id === takeId)) {
      throw new Error(`"${track.name}" has no take "${takeId}" — its takes are ${(track.takes ?? []).map((take) => take.id).join(", ") || "none"}`);
    }
    if (endBar <= startBar) throw new Error(`the range must end after it starts (got ${startBar} to ${endBar})`);
    return assignTakeToRange(arrangement, trackId, startBar, endBar, takeId);
  });
}

/** Folding a folder. Display only, which the tool's own description repeats because a client reads that and not this. */
export function setMcpTrackCollapsed(arrangementId: string, trackId: string, collapsed: boolean): ArrangementEditResult {
  return edit(arrangementId, (arrangement) => refuseUnknownTrack(arrangement, trackId, () => setCollapsed(arrangement, trackId, collapsed)));
}

function unknownTrack(arrangement: ArrangementV2, trackId: string): string {
  const known = arrangement.tracks.map((track) => track.id).join(", ");
  return `no track "${trackId}" in this arrangement — its tracks are ${known || "none"}`;
}

/** Runs an edit only for a track that exists, so "nothing happened" is never the answer to a typo. */
function refuseUnknownTrack(arrangement: ArrangementV2, trackId: string, apply: () => ArrangementV2): ArrangementV2 {
  if (!arrangement.tracks.some((track) => track.id === trackId)) throw new Error(unknownTrack(arrangement, trackId));
  return apply();
}

/** One line per track, for a caller reading a log rather than parsing a summary. */
export function describeMcpArrangement(arrangementId: string): string {
  const arrangement = requireArrangement(arrangementId);
  const summary = summariseArrangement(arrangementId, arrangement);
  const lines = summary.tracks.map((track) => {
    const parts = [`${track.id}  ${track.name} (${track.kind})`];
    if (track.sampleAssetId) parts.push(`plays ${track.sampleAssetId}`);
    if (track.steps.length > 0) parts.push(`${track.stepsOn}/${track.steps.length} steps`);
    if (track.takes.length > 0) parts.push(`${track.takes.length} take(s)${track.selectedTakeId ? `, ${track.selectedTakeId} playing` : ""}`);
    if (track.muted) parts.push("muted");
    return `  ${parts.join(" · ")}`;
  });
  return [`${summary.arrangementId} (${summary.trackCount} track(s))`, ...lines, ...summary.problems.map((problem) => `  ⚠ ${problem}`)].join("\n");
}
