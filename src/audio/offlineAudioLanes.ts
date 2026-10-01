/**
 * **Mixing an audio lane's bytes into an offline render** — the half of the ninth kind that only playback had.
 *
 * The browser has played audio lanes since `audioLanePlayback.ts`, and the offline renderer had no branch for `track_id: "audio"`: the lane fell through to the
 * bottom of `WavExporter`'s dispatch and was sounded as a **synthesised percussion hit** while the MCP reply listed it in `skippedLanes` — a wrong sound *and* a
 * false report. This module is the renderer's half, and it is deliberately shaped like the playback path it has to agree with (`audioLanePlan.ts` →
 * `audioLaneScheduler.ts` → `sampleLoader`), because "what plays" and "what renders" being two separate answers is the failure this codebase spends gates avoiding.
 *
 * ## What it decides, and what it deliberately does not
 *
 * The graph is injected, exactly as it is in `audioLaneScheduler`: the loader and the sink are parameters, so **which lanes render, at what second, at what gain,
 * and what is reported when one cannot** can be proved without an `AudioContext`. The browser adapter is a handful of lines (`startSamplerNote` into the master
 * graph) and is the part least likely to be wrong.
 *
 * ## Two ways an audio lane can be a lane, because the model has two
 *
 *   · **A pattern of notes** — an arrangement's `sampler` track compiles to `track_id: "audio"` with an SFZ instrument and pitched steps. A sampler is one
 *     recording at a different rate per note, so each written note is resolved through `loadNote` and started at its own step, which is exactly what the live
 *     arrangement player does (`playerFromEngine.ts` → `scheduleSamplerSteps`).
 *   · **One sample and no notes** — the ninth kind as a v1 pattern declares it: a lane that names a sample and has nothing to schedule. It starts once, at the
 *     start of the section the flattened pattern is, and a flattened pattern is one section at bar 0, so that second is zero. This is the case the adjudication
 *     called "silent-but-known": the lane has no notes, and it must still be heard rather than reported as skipped.
 *
 * ## Three rules that exist because doing nothing is the worst shape
 *
 *   · **Nothing is dropped in silence.** A lane that is muted or soloed out, one whose `assetId` names nothing, one whose instrument has no note to resolve, and
 *     one whose bytes fail to fetch or decode are all `problems`, each naming the lane and the reason.
 *   · **A failure is per note, not per lane.** A kit whose lowest written note is outside its key range still sounds every note that is inside it, so a failed
 *     note never abandons the rest of the lane; identical reasons are reported once so a broken URL does not produce one entry per step.
 *   · **`pan` is carried, not assumed.** A lane's position is part of what the model says about it, and the sink applies it.
 */
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import { SAMPLE_CATALOGUE, findSampleAsset, sampleReferenceProblem } from "../data/sampleCatalogue";
import type { SampleAsset } from "../data/sampleCatalogue";
import { stepTiming } from "../data/tempoMap";
import type { TempoPoint } from "../data/tempoMap";
import { deriveTrackStates } from "./trackStates";
import type { SampleLoader } from "./sampleLoader";

/**
 * **The one test for "this is an audio lane".**
 *
 * `track_id` reaches a render as caller data (`patternSchema` is `.passthrough()`), so `"Audio"` is a spelling a caller can produce. The guard in `WavExporter`,
 * `hasAudioLane` in the MCP worker and this planner all have to answer the same way: a lane silenced by one, unplanned by another and unreported by a third would
 * be exactly the "ok while doing nothing" state this feature exists to remove. Normalising here is what makes them agree.
 */
export function isAudioLane(track: { track_id?: string } | null | undefined): boolean {
  return (track?.track_id ?? "").toLowerCase() === "audio";
}

/** Which lane a report entry is about — the same identity a caller sees (`laneId` when it has one, else the role). */
export interface OfflineAudioLaneRef {
  /** Position in the pattern's track list, so a caller can find the strip or the stem. */
  trackIndex: number;
  track_id: string;
  laneId?: string;
  name: string;
}

/** One sample to place in the render. */
export interface OfflineAudioLaneEvent extends OfflineAudioLaneRef {
  assetId: string;
  /**
   * The MIDI note to resolve, for an instrument. Absent means "the asset's own bytes at their own rate" — a plain sample, not an SFZ program.
   */
  pitch?: number;
  /** Where it starts, measured from the render's beginning, in seconds. */
  atSeconds: number;
  /** The lane's level in dB, from its own `volume` — the one gain stage for the lane. */
  gainDb: number;
  /** The lane's position, −1…1, when it states one. The sink pans by it; `0` and absent are both centre. */
  pan?: number;
}

/** A lane that will not be heard, and why, named so a caller can act on it. */
export interface OfflineAudioLaneProblem extends OfflineAudioLaneRef {
  assetId?: string;
  reason: string;
}

export interface OfflineAudioLanePlan {
  events: OfflineAudioLaneEvent[];
  /** One entry per lane that will contribute audio — the list the reply calls `renderedAudioLanes`. */
  lanes: OfflineAudioLaneRef[];
  /** One entry per lane that cannot, each carrying a reason. Nothing is dropped in silence. */
  problems: OfflineAudioLaneProblem[];
}

export interface OfflineAudioLanePlanOptions {
  bpm?: number;
  tempoTrack?: readonly TempoPoint[];
  /**
   * The step the timeline ends at, used to bound a note's time (`WavExporter` passes the whole pattern's step count).
   * It is **not** the chunk's length — that is `stepSpan` — so an absolute step at the end of a chunk still reads its
   * own start time rather than being clamped to the chunk's first.
   */
  totalSteps?: number;
  /** A stem render plays one track: only the audio lane at this index is planned, so a stem is that stem. */
  stemTrackIdx?: number;
  /**
   * How many steps this call's timeline covers, counting from `stepOffset`. Absent means "from step 0 to
   * `totalSteps`", which is every existing caller.
   */
  stepSpan?: number;
  /**
   * The **absolute** step the chunk starts at, when the caller is rendering a bar range rather than the top of the
   * piece. A different window, not a trimming of the plan: a note whose step is outside `[stepOffset, stepOffset +
   * stepSpan)` is not in this render at all, and a note inside it lands at its own step minus the offset.
   */
  stepOffset?: number;
  /**
   * Seconds to subtract from every planned `atSeconds` after the range is applied.
   *
   * In a chunk context the first sample is at the pre-roll start, so this shifts absolute times onto that local
   * timeline. It is the same shift the synthesised lanes get, and it is applied after the step filter, so the two
   * cannot disagree about which note is on a bar.
   */
  timeOffsetSec?: number;
  /**
   * The track indexes the renderer has silenced (mute, or soloed out), in the renderer's own numbering.
   *
   * Passed in rather than derived when the caller already has the mixer state — `WavExporter` derives it from the same `mixerStates` its synthesised lanes use, so
   * a muted audio lane and a muted synth lane are silenced by one decision rather than two. Absent, the pattern's own `mute`/`solo` flags are read through
   * `deriveTrackStates`, which is the same rule.
   */
  silencedTrackIndexes?: readonly number[];
}

/** The lane's own level, in dB. Unity when the lane states none, which is what "no gain was asked for" means. */
function laneGainDb(track: SequencerTrack): number {
  const volume = track.volume;
  if (typeof volume !== "number" || !Number.isFinite(volume) || volume <= 0) return 0;
  // The mixer clamps a fader at +6 dB (a linear 2), and this is the same ceiling so a stored value cannot become a louder lane than the console allows.
  return 20 * Math.log10(Math.min(2, volume));
}

/** The steps a note actually starts on, with the pitch it carries. A step with no pitch is not a note. */
function pitchedSteps(track: SequencerTrack): Array<{ step: number; pitch: number }> {
  const notes: Array<{ step: number; pitch: number }> = [];
  (track.steps ?? []).forEach((value, step) => {
    if (!value) return;
    const pitch = track.pitch?.[step];
    if (typeof pitch === "number" && pitch > 0) notes.push({ step, pitch });
  });
  return notes;
}

/** Which lanes the pattern itself silences, by the one rule the engine uses (`deriveTrackStates`). */
function silencedFromPattern(tracks: readonly SequencerTrack[]): Set<number> {
  const states = deriveTrackStates({ tracks: [...tracks] });
  const anySolo = states.some((state) => state.solo);
  const silenced = new Set<number>();
  states.forEach((state, index) => {
    if (state.mute || (anySolo && !state.solo)) silenced.add(index);
  });
  return silenced;
}

/**
 * Which lanes will sound, where, and what stops the rest.
 *
 * Pure and total: it reads the catalogue and the pattern and returns a plan, so a caller can print the skip list before a browser is ever started.
 */
export function planOfflineAudioLanes(
  pattern: Pick<SequencerPattern, "tracks" | "bpm" | "totalSteps">,
  catalogue: readonly SampleAsset[] = SAMPLE_CATALOGUE,
  options: OfflineAudioLanePlanOptions = {}
): OfflineAudioLanePlan {
  const tracks = pattern.tracks ?? [];
  const events: OfflineAudioLaneEvent[] = [];
  const lanes: OfflineAudioLaneRef[] = [];
  const problems: OfflineAudioLaneProblem[] = [];
  const silenced = options.silencedTrackIndexes ? new Set(options.silencedTrackIndexes) : silencedFromPattern(tracks);

  const bpm = options.bpm ?? pattern.bpm ?? 120;
  const totalSteps =
    options.totalSteps ??
    pattern.totalSteps ??
    Math.max(16, tracks.reduce((longest, track) => Math.max(longest, track.steps?.length ?? 0), 0));
  /**
   * **The window this call covers, in absolute steps.** Without a chunk it is the whole pattern, and the range test
   * below is then always true — so a caller that never asks for a chunk gets the same plan it always got, note for
   * note and second for second.
   */
  const stepOffset = Math.max(0, Math.floor(options.stepOffset ?? 0));
  const stepSpan = Math.max(0, Math.floor(options.stepSpan ?? totalSteps));
  const timeOffsetSec = Number.isFinite(options.timeOffsetSec) ? (options.timeOffsetSec as number) : 0;
  const inRange = (step: number): boolean => step >= stepOffset && step < stepOffset + stepSpan;
  /**
   * The tempo map is honoured rather than a second `60 / bpm / 4`, so a note in a movement at another tempo lands where the rest of the engine puts it.
   *
   * The timing is asked for the **absolute** end of the window, so `starts[]` is the same array a whole render would
   * have had at those steps: a prefix sum was not restarted at the offset, which would have moved every event.
   */
  const timing = stepTiming(
    { bpm, tempoTrack: options.tempoTrack ? [...options.tempoTrack] : undefined },
    Math.max(totalSteps, stepOffset + stepSpan)
  );
  /** Last index `timing.starts` really has — the bound for a note's own start time. */
  const lastTimedStep = timing.starts.length - 1;

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
    const track = tracks[trackIndex]!;
    if (!isAudioLane(track)) continue;
    if (options.stemTrackIdx !== undefined && options.stemTrackIdx !== trackIndex) continue;

    const ref: OfflineAudioLaneRef = {
      trackIndex,
      track_id: track.track_id,
      ...(track.laneId ? { laneId: track.laneId } : {}),
      name: track.name,
    };

    /**
     * **A silenced lane is reported, not rendered.** The old early return sat before the mute/solo test, so a muted audio lane was mixed *and* listed under
     * `renderedAudioLanes` — audible against the user's instruction and described as played.
     */
    if (silenced.has(trackIndex)) {
      const state = deriveTrackStates({ tracks: [...tracks] })[trackIndex];
      const why = state?.mute ? "the lane is muted" : "another track is soloed, so this lane is soloed out";
      problems.push({ ...ref, ...(track.sample?.assetId ? { assetId: track.sample.assetId } : {}), reason: `${why}, so it is not in the render` });
      continue;
    }

    // The catalogue's own rule, used rather than restated: an audio lane with no sample, or one naming nothing the catalogue holds, is a named problem.
    const problem = sampleReferenceProblem(track, catalogue);
    if (problem) {
      problems.push({ ...ref, ...(track.sample?.assetId ? { assetId: track.sample.assetId } : {}), reason: problem });
      continue;
    }

    const assetId = track.sample!.assetId!;
    const asset = findSampleAsset(assetId, catalogue)!;
    const gainDb = laneGainDb(track);
    const pan = typeof track.pan === "number" && Number.isFinite(track.pan) ? Math.max(-1, Math.min(1, track.pan)) : undefined;

    if (asset.sfz) {
      const notes = pitchedSteps(track);
      if (notes.length === 0) {
        /**
         * An instrument with nothing to resolve is reported rather than guessed at. Playing its root note would invent a pitch the model does not carry, and
         * silence with no explanation is the failure this kind exists to avoid — so the lane is named and the reason says which of the two is missing.
         */
        problems.push({
          ...ref,
          assetId,
          reason: `"${assetId}" is an instrument, and the lane has no pitched steps, so there is no note to resolve from it`,
        });
        continue;
      }
      let planned = 0;
      for (const { step, pitch } of notes) {
        if (!inRange(step)) continue;
        events.push({
          ...ref,
          assetId,
          pitch,
          atSeconds: (timing.starts[Math.min(step, lastTimedStep)] ?? 0) - timeOffsetSec,
          gainDb,
          ...(pan === undefined ? {} : { pan }),
        });
        planned += 1;
      }
      /**
       * **A lane with notes but none in this window contributes nothing, and is not a problem.**
       *
       * It is the same lane the whole render hears; it simply has no note in these bars. Listing it as rendered would
       * claim audio that is not in the buffer, and listing it as a problem would name a defect where there is only a
       * bar range — so it is neither.
       */
      if (planned === 0) continue;
      lanes.push(ref);
      continue;
    }

    /**
     * A plain sample with no notes: heard once, at the start of the section the flattened pattern is. This is the case
     * that used to be reported as skipped.
     *
     * It is step 0 of the timeline, so it belongs to the chunk that contains step 0 and to no other — a sample is not
     * re-triggered at a bar it does not start on.
     */
    if (!inRange(0)) continue;
    events.push({ ...ref, assetId, atSeconds: 0 - timeOffsetSec, gainDb, ...(pan === undefined ? {} : { pan }) });
    lanes.push(ref);
  }

  return { events, lanes, problems };
}

/** Where a sample is started, with what rate and position. The graph is injected, so this is the whole browser-independent contract. */
export interface OfflineAudioLaneSink {
  start(buffer: AudioBuffer, event: OfflineAudioLaneEvent, ratio: number): void;
}

export interface OfflineAudioLaneReport {
  /**
   * Lanes that contributed at least one sample to the mix.
   *
   * **A lane may appear here *and* in `problems`**, and that is the honest reading of a partly-resolved instrument: one note of a kit can have no region while the
   * rest sound, and calling the whole lane skipped would hide the notes that did reach the file.
   */
  lanes: OfflineAudioLaneRef[];
  /** Samples actually started — one per note for an instrument, one for a plain sample. */
  events: number;
  /** Problems, each naming its lane and the reason — a muted lane, a catalogue miss, a note no region covers, a failed fetch. */
  problems: OfflineAudioLaneProblem[];
  /**
   * Why the **catalogue itself** could not be read, when that is the reason every lane is unresolvable.
   *
   * Named with the path that was tried, because "no sample X" and "the manifest could not be read at /…/manifest.json" send a reader to different places — and an
   * unreadable manifest must never turn into a silent, report-free render.
   */
  catalogueProblem?: string;
}

export interface OfflineAudioLaneScheduleInput {
  pattern: Pick<SequencerPattern, "tracks" | "bpm" | "totalSteps">;
  loader: SampleLoader;
  sink: OfflineAudioLaneSink;
  catalogue?: readonly SampleAsset[];
  /** Why the catalogue is unavailable, when the caller knows; travels into the report rather than being swallowed. */
  catalogueProblem?: string;
  bpm?: number;
  tempoTrack?: readonly TempoPoint[];
  totalSteps?: number;
  /** The chunk window, threaded to the planner unchanged — see `OfflineAudioLanePlanOptions`. */
  stepSpan?: number;
  stepOffset?: number;
  timeOffsetSec?: number;
  stemTrackIdx?: number;
  silencedTrackIndexes?: readonly number[];
}

/**
 * Plan, load and place every audio lane — the offline twin of `scheduleAudioLaneSamples`.
 *
 * **Every note is attempted.** A lane whose first written note is outside its instrument's key range must still sound the notes that are inside it, so a failure
 * never short-circuits the lane. Identical reasons are reported once (`trackIndex::reason`), which keeps one dead URL from producing one entry per step without
 * hiding a second, different failure.
 */
export async function scheduleOfflineAudioLanes(input: OfflineAudioLaneScheduleInput): Promise<OfflineAudioLaneReport> {
  const plan = planOfflineAudioLanes(input.pattern, input.catalogue ?? SAMPLE_CATALOGUE, {
    ...(input.bpm === undefined ? {} : { bpm: input.bpm }),
    ...(input.tempoTrack === undefined ? {} : { tempoTrack: input.tempoTrack }),
    ...(input.totalSteps === undefined ? {} : { totalSteps: input.totalSteps }),
    ...(input.stepSpan === undefined ? {} : { stepSpan: input.stepSpan }),
    ...(input.stepOffset === undefined ? {} : { stepOffset: input.stepOffset }),
    ...(input.timeOffsetSec === undefined ? {} : { timeOffsetSec: input.timeOffsetSec }),
    ...(input.stemTrackIdx === undefined ? {} : { stemTrackIdx: input.stemTrackIdx }),
    ...(input.silencedTrackIndexes === undefined ? {} : { silencedTrackIndexes: input.silencedTrackIndexes }),
  });

  const problems: OfflineAudioLaneProblem[] = [...plan.problems];
  const reported = new Set(problems.map((problem) => `${problem.trackIndex}::${problem.reason}`));
  const started = new Set<number>();
  let events = 0;

  for (const event of plan.events) {
    try {
      if (event.pitch === undefined) {
        const buffer = await input.loader.load(event.assetId);
        input.sink.start(buffer, event, 1);
      } else {
        const note = await input.loader.loadNote(event.assetId, event.pitch);
        input.sink.start(note.buffer, event, note.ratio);
      }
      events += 1;
      started.add(event.trackIndex);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const key = `${event.trackIndex}::${reason}`;
      if (reported.has(key)) continue;
      reported.add(key);
      problems.push({
        trackIndex: event.trackIndex,
        track_id: event.track_id,
        ...(event.laneId ? { laneId: event.laneId } : {}),
        name: event.name,
        assetId: event.assetId,
        reason,
      });
    }
  }

  /**
   * "Rendered" is "at least one sample reached the mix", not "the lane had no failure": a kit whose note 60 has no region still sounds every other note, and the
   * reply has to be able to say both. A lane that failed before starting anything is only in `problems`.
   */
  const rendered = plan.lanes.filter((lane) => started.has(lane.trackIndex));
  return {
    lanes: rendered,
    events,
    problems,
    ...(input.catalogueProblem ? { catalogueProblem: input.catalogueProblem } : {}),
  };
}
