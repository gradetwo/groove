/**
 * **The app's export path, wired to the same catalogue playback uses.**
 *
 * `WavExporter` has mixed audio lanes since the render work landed, but only for a caller that hands it `RenderWavOptions.audioLaneCatalogue`: `useExportActions` passed none, so a lane a
 * user built exported **silence with no report** — the same "ok while doing nothing" this workstream keeps removing. Playback already resolves lanes through the app's one catalogue
 * runtime (`appCatalogueRuntime`, loaded at transport start in `useTransportControls` and at project creation in `NewProjectView`), so an export resolves them through the **same instance**
 * rather than a second loader: one manifest fetch per session, single-flighted by the runtime, and two paths that cannot disagree about which asset ids exist.
 *
 * Three rules, each the shape the server already uses:
 *
 *   · **The catalogue is fetched before a lane can resolve anything**, and only for a pattern that actually carries an audio lane — so a synthesised export pays nothing (the manifest is
 *     ~1.6 MB, and `mcp/render/worker.ts` gates on the same condition for the same reason).
 *   · **Failure is reported, never a silent skip.** The runtime returns its problems rather than throwing; they are carried beside the lane report so a manifest that 404s is
 *     distinguishable from a manifest that simply does not hold the asset.
 *   · **A lane that rendered and a lane that did not are both stated.** `audioLaneExportFacts` turns the reporter's own `lanes`/`problems` lists into the lines the export UI shows.
 */
import type {
  OfflineAudioLaneProblem,
  OfflineAudioLaneRef,
  OfflineAudioLaneReport,
} from "../../../audio/offlineAudioLanes";
import type { RenderWavOptions } from "../../../audio/WavExporter";
import type { SampleAsset } from "../../../data/sampleCatalogue";
import { isSampledLane } from "../../../data/sampledInstruments";

/** The two render options every app-side audio export must carry. Both optional, so "no audio lane" is the empty object. */
export type AudioLaneRenderOptions = Pick<RenderWavOptions, "audioLaneCatalogue" | "onAudioLanes">;

/**
 * True when a pattern carries a lane that sounds a catalogue recording — the gate that keeps the manifest fetch off a
 * purely synthesised export.
 *
 * ⭐ **Widened past `track_id === "audio"`, because that stopped being the only shape a recorded lane has.** A genre lane
 * whose `instrument` the written table maps (`piano_lead`, `walking_upright`, …) is a recording too, and a gate that only
 * knew the ninth kind would export that lane as its built-in synthesiser while never fetching the catalogue that could
 * have sounded it. `isSampledLane` is the same predicate the MCP worker's `hasAudioLane` and the lane planners use, so all
 * four answer together.
 */
export function hasAudioLane(pattern: { tracks?: Array<{ track_id?: string; instrument?: string; sample?: { assetId?: string } }> }): boolean {
  return (pattern.tracks ?? []).some((track) => (track.track_id || "").toLowerCase() === "audio" || isSampledLane(track));
}

/** The render options an export hands the exporter, built from a catalogue the app already resolved. */
export function audioLaneRenderOptions(
  catalogue: readonly SampleAsset[],
  onReport: (report: OfflineAudioLaneReport) => void
): AudioLaneRenderOptions {
  return { audioLaneCatalogue: catalogue, onAudioLanes: onReport };
}

/** What the export UI has to be able to say about the lanes. */
export interface AudioLaneExportFacts {
  /** Names of the lanes whose bytes reached the mix. */
  rendered: string[];
  /** One line per lane that could not be mixed, already naming the lane and the reason. */
  problems: string[];
}

/** The lane's identity as a person sees it: the strip's name, else its `laneId`, else its kind. */
function laneName(ref: OfflineAudioLaneRef | OfflineAudioLaneProblem): string {
  return ref.name || ref.laneId || ref.track_id || "audio lane";
}

/**
 * The rendered and skipped lists, as the two facts the UI shows.
 *
 * `catalogueProblems` are the runtime's own load failures, prepended: with an empty catalogue the lane reporter can only say "no samples ship with the app yet", which is a **different
 * fact** from "the manifest 404'd", and a user has to be able to tell which one happened.
 */
export function audioLaneExportFacts(
  report: OfflineAudioLaneReport | null,
  catalogueProblems: readonly string[] = []
): AudioLaneExportFacts {
  return {
    rendered: (report?.lanes ?? []).map(laneName),
    problems: [
      ...catalogueProblems.map((problem) => `sample catalogue: ${problem}`),
      ...(report?.problems ?? []).map((problem) => `${laneName(problem)}: ${problem.reason}`),
    ],
  };
}

/**
 * Merge two reports about the same export.
 *
 * `exportStemsWav` renders once **per track**, so the reporter is called once per stem and each call sees only that stem's own lane. Keeping the last would drop a problem found while
 * rendering an earlier stem — the exact silence this wiring removes — so the reports are accumulated instead. A lane is identified the way the report identifies it; a repeated call
 * about the same lane is not counted twice.
 */
export function mergeAudioLaneReports(a: OfflineAudioLaneReport, b: OfflineAudioLaneReport): OfflineAudioLaneReport {
  const key = (lane: OfflineAudioLaneRef) => `${lane.trackIndex}|${lane.laneId ?? lane.track_id}`;
  const seen = new Set(a.lanes.map(key));
  const lanes = [...a.lanes];
  for (const lane of b.lanes) {
    if (seen.has(key(lane))) continue;
    seen.add(key(lane));
    lanes.push(lane);
  }
  return { lanes, events: a.events + b.events, problems: [...a.problems, ...b.problems] };
}

export interface PreparedAudioLaneExport {
  /** Spread into the exporter's options. Empty when the pattern has no audio lane, which is the no-op case. */
  options: AudioLaneRenderOptions;
  /** Problems from loading the catalogue itself; the lane report cannot see these. */
  catalogueProblems: readonly string[];
  /** The accumulated lane report once a render has run, or `null` when no lane render happened. */
  report: () => OfflineAudioLaneReport | null;
}

/**
 * Load the catalogue an audio lane resolves against, and hand back the options the exporter needs.
 *
 * `loadCatalogue` is injected rather than imported so a criterion can exercise this without a network, and so the application passes `appCatalogueRuntime.load` — the very call
 * playback makes, which is what keeps the two from disagreeing about an asset id.
 */
export async function prepareAudioLaneExport(
  pattern: { tracks?: Array<{ track_id?: string }> },
  loadCatalogue: () => Promise<{ assets: SampleAsset[]; problems: string[] }>
): Promise<PreparedAudioLaneExport> {
  // A pattern with no audio lane cannot have one to render, so the manifest is not fetched and the options stay empty — additive by construction.
  if (!hasAudioLane(pattern)) {
    return { options: {}, catalogueProblems: [], report: () => null };
  }

  const { assets, problems } = await loadCatalogue();
  let accumulated: OfflineAudioLaneReport | null = null;
  return {
    options: audioLaneRenderOptions(assets, (report) => {
      accumulated = accumulated ? mergeAudioLaneReports(accumulated, report) : report;
    }),
    catalogueProblems: problems,
    report: () => accumulated,
  };
}
