/**
 * ⭐ **"The recordings this pass needs are in memory, so the transport may start" — the wait between pressing play and hearing audio.**
 *
 * ## The defect this removes
 *
 * A genre whose lanes the palette maps sounds its recorded lanes from a scheduler (`samplerLanePlayback.ts`), and that scheduler **awaits a
 * network fetch and a decode for every note it places**: `scheduleSamplerSteps` walks the plan and `await`s `loader.loadNote(...)` before it
 * starts each voice. The transport, meanwhile, is already running — so the two halves of the performance disagree by the whole download:
 *
 *   · the engine's own lanes play from the first step, and the recorded lanes are **stood down** for exactly those lanes, so the bar opens
 *     with the bass and the piano *missing* rather than late;
 *   · and when the bytes finally arrive, every onset whose time has already passed is started **immediately** — `BufferSourceNode.start(t)`
 *     with `t` in the past plays at once — so the first pass arrives as a compressed burst rather than as music.
 *
 * That is the "先静音后补" failure the owner reported as bad experience, and no amount of progress reporting fixes it: the notes are in the
 * wrong place on the clock whatever the UI says. So the order has to be **ready, then start**.
 *
 * ## The shape, and where it comes from
 *
 * `smplr`, the closest mainstream web sampler, states both halves and is the model here
 * (<https://raw.githubusercontent.com/danigb/smplr/main/README.md>, "Using an instrument"):
 *
 * · *"#### Wait for audio loading — You can start playing notes as soon as one sample is loaded. To wait for all of them, await either:
 *   `piano.ready` — resolves to `void` (preferred for new code)."* — a **readiness promise**, which is what this function returns in effect;
 * · *"#### Load progress — Track how many samples have loaded via the `onLoadProgress` option or the `loadProgress` getter: …
 *   `total` is known before loading starts, so you can display a determinate progress bar."* — **a count of loaded/total**, which is what
 *   {@link SamplerLanePreparation} carries and what `onProgress` reports as it changes.
 *
 * ⚠️ **And a failure is a reported state, not an endless wait.** `smplr`'s counterpart for a note that did not load is `fallback: "none"`
 * ("plays nothing") with the failure visible to the caller; here the failure sentences travel in `problems` for `reportSampledLaneProblems`,
 * so "this lane has no recording" is a sentence a person can read rather than a lane that is quiet for no stated reason. Nothing in this
 * module waits on a request that has already failed, and nothing swallows one.
 *
 * ## What it does not do
 *
 * It does not choose the lanes: {@link audibleSamplerLanesOf} / {@link samplerLanesOf} do, and they are **called from here rather than
 * re-derived**, so the set that is warmed is by construction the set the scheduler will sound. It does not start a voice, place a note, or
 * touch the transport — it only fills the loader's caches, which is why the scheduler that follows it is a cache hit rather than a second
 * download.
 */
import { planSamplerSteps } from "./samplerSteps";
import { audibleSamplerLanesOf, samplerLanesOf, type SamplerLane } from "./samplerLanePlayback";
import { sampledStandDownIndexes } from "./sampledLanes";
import { findSampleAsset } from "../data/sampleCatalogue";
import type { SampleLoader } from "./sampleLoader";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern } from "../types/genre";

/** How far along the wait is, in the shape a progress display needs: a count that only ever grows, and its total. */
export interface SamplerLaneProgress {
  /** Distinct notes resolved so far. */
  loaded: number;
  /** Distinct notes this pass needs, known before the first request — which is what makes the display determinate. */
  total: number;
}

/** What one preparation found. */
export interface SamplerLanePreparation extends SamplerLaneProgress {
  /** True when every needed note is decoded and ready to sound. */
  ready: boolean;
  /** True when there was nothing to load, which is the ordinary case for a genre with no mapped lane. */
  empty: boolean;
  /**
   * One sentence per note that could not be resolved or decoded, in the scheduler's own report shape.
   *
   * ⭐ **Never empty-and-silent.** `ready: false` with `problems: []` would be a state a caller could only guess at; every failure here names
   * the lane, the pitch and the reason, which is the standard `scheduleSamplerSteps` already holds itself to.
   */
  problems: string[];
}

export interface PrepareSamplerLanesInput {
  pattern: SequencerPattern;
  /** The catalogue the lanes were resolved against, so the loader reads the same assets the resolver did. */
  catalogue: readonly SampleAsset[];
  /** The loader the scheduler will sound through — **the same one**, or this step is a second download rather than a warm-up. */
  loader: SampleLoader;
  /** The pattern's tempo, which `planSamplerSteps` needs to measure an overlap. */
  bpm?: number;
  /**
   * The lanes to warm, when the caller has already picked them — the arrangement player's own list.
   *
   * Omitted, the lanes are chosen exactly as {@link createSamplerLanePlayback} would choose them: the caller's own list when one is handed
   * in, otherwise the pattern's recorded lanes filtered by the engine's mute state. Both of those are the exported helpers rather than a
   * second copy of the rule, which is what keeps "what will sound" and "what was warmed" the same set.
   */
  lanes?: readonly SamplerLane[];
  /** The engine's lane states, so a muted lane is not warmed either — the same two accessors the controller is given. */
  getTrackState?: (index: number) => { mute?: boolean; solo?: boolean } | undefined;
  getTrackStates?: () => readonly { mute?: boolean; solo?: boolean }[];
  /** Called after every note resolves, on both the success and the failure path, so a display never freezes at the last success. */
  onProgress?: (progress: SamplerLaneProgress) => void;
}

/** The identity of one note, so a pitch repeated across a bar is resolved once: which asset, which pitch, which articulation. */
function noteKey(assetId: string, pitch: number, technique: string | undefined): string {
  return `${assetId}\u0000${pitch}\u0000${technique ?? ""}`;
}

/**
 * ⭐ **The lanes that will be silenced if their bytes are late — so they are the ones worth waiting for.**
 *
 * This is **not** a second opinion about which lanes are recordings. `sampledStandDownIndexes` is the function `AudioEngine.prepareSampledLanes`
 * itself uses to decide which synthesisers to stand down (`src/audio/sampledLanes.ts`), and a lane that is not in its answer keeps its
 * synthesiser — so it will be *heard*, however late a download is, and there is nothing to wait for. Warming exactly that set is what makes the
 * wait neither too long (it never fetches a lane the engine is still synthesising) nor too short (it never skips a lane that will be silent).
 *
 * ⭐ **An empty catalogue warms nothing, and that is the same rule rather than a special case.** With no assets, nothing is stood down, so
 * nothing is silent and nothing is fetched — which is also what keeps a mirror-less build from touching the network to "prepare" a lane that is
 * still a synthesiser.
 *
 * A lane the catalogue does serve is included even when it is currently muted: the mutes change with the audition mode, and the loader's cache
 * is what makes the mode switch free.
 */
export function standDownSamplerLanes(
  pattern: Pick<SequencerPattern, "tracks">,
  catalogue: readonly SampleAsset[]
): SamplerLane[] {
  const stoodDown = sampledStandDownIndexes(pattern, catalogue);
  const lanes: SamplerLane[] = [];
  (pattern.tracks ?? []).forEach((track, index) => {
    const assetId = stoodDown.get(index);
    if (assetId === undefined) return;
    /**
     * A v1 `audio` lane is stood down **unconditionally** (it has no synthesised voice to fall back to), and when the catalogue does not carry
     * its asset there is no address to fetch — the stand-down's own report names that lane, so trying to load it here would only add a second,
     * worse sentence beside the real one.
     */
    if (!findSampleAsset(assetId, catalogue)) return;
    lanes.push({ sourceTrackId: track.track_id ?? track.name ?? `lane-${index}`, lane: track });
  });
  return lanes;
}

/**
 * Resolve and decode every recording this pass needs, reporting progress, and answer whether it is ready.
 *
 * **Resolves rather than rejects**, including when every note failed: a caller that is about to decide whether to start a transport needs the
 * answer, not an exception, and the sentences it needs to show a person are in `problems`. A caller that wants to treat "nothing loaded" as a
 * refusal reads `ready === false && !empty`.
 */
export async function prepareSamplerLanes(input: PrepareSamplerLanesInput): Promise<SamplerLanePreparation> {
  const lanes =
    input.lanes ??
    (input.getTrackState && input.getTrackStates
      ? audibleSamplerLanesOf(input.pattern, input.getTrackState, input.getTrackStates)
      : samplerLanesOf(input.pattern));
  const events = planSamplerSteps(lanes, input.bpm === undefined ? {} : { bpm: input.bpm });

  /**
   * ⭐ **Deduplicated by note, because a bar repeats pitches.** A walking bass plays the same note on several steps, and the loader's decode
   * cache would collapse those into one decode anyway — but they would still be N `loadNote` calls, each re-running `resolveInstrumentNote`
   * over the whole expanded program. Asking once per distinct note is what makes the `total` below a number a person recognises
   * ("eleven recordings"), and it is why `onProgress` cannot stall on a long repeated lane.
   */
  const wanted = new Map<string, { assetId: string; pitch: number; technique?: string }>();
  for (const event of events) {
    const key = noteKey(event.assetId, event.pitch, event.technique);
    if (!wanted.has(key)) wanted.set(key, { assetId: event.assetId, pitch: event.pitch, ...(event.technique === undefined ? {} : { technique: event.technique }) });
  }

  const problems: string[] = [];
  let loaded = 0;
  const total = wanted.size;
  input.onProgress?.({ loaded, total });

  for (const note of wanted.values()) {
    try {
      await input.loader.loadNote(note.assetId, note.pitch, note.technique === undefined ? undefined : { technique: note.technique });
      loaded += 1;
    } catch (error) {
      // Named with its lane and pitch, exactly as `scheduleSamplerSteps` names a failure — the same problem must not read two ways.
      problems.push(
        `${note.assetId} note ${note.pitch}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    input.onProgress?.({ loaded, total });
  }

  return {
    loaded,
    total,
    ready: problems.length === 0,
    empty: total === 0,
    problems,
  };
}
