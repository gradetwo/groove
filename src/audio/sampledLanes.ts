/**
 * **The one place a rendered pattern is asked "which lanes sound through a catalogue recording, and can this
 * catalogue actually serve them".**
 *
 * The table lives in `src/data/sampledInstruments.ts` and answers what an instrument name *means*. This module
 * answers the two questions a **renderer** has to answer about a whole pattern — *which* lanes are recordings, and
 * *which of those this mirror can serve* — and it is one module because three callers have to agree:
 *
 *   * `WavExporter` (every offline render, bounce, stem and export) stands the synthesiser down for the lanes that
 *     will be mixed from their own bytes;
 *   * `AudioEngine` (both live paths — the studio's transport and the arrangement player) does the same through
 *     `prepareSampledLanes`;
 *   * `playArrangementV2` and the audio-lane planners decide which lanes to schedule.
 *
 * If a second copy of "is this lane a recording" existed, a lane could be mixed twice — once as a synthesiser and
 * once as the piano — or, worse, not at all, which is the silent-sampler failure this whole workstream exists to
 * remove.
 *
 * ## Why the catalogue decides, and not the table alone
 *
 * The owner's rule is **"a recording by default, and a synthesiser when the recording is not there"**. The table
 * cannot know whether the recording is there: the mirror is configured at runtime (`VITE_SAMPLE_ROOT`), and the
 * shipped default serves nothing. So the table says "this lane is a piano" and the **catalogue** says "and here are
 * the bytes". A lane the table maps but the catalogue cannot serve is **left to the synthesiser** — audibly wrong
 * for one render, and reported (see `sampledInstrumentGap`) rather than silent.
 *
 * The two are separate functions rather than one flag because the two answers mean different things: a lane can be
 * a recording that this mirror does not carry, and a report has to be able to say exactly that.
 */
import { isAudioLane } from "./offlineAudioLanes";
import { findSampleAsset, type SampleAsset } from "../data/sampleCatalogue";
import { isSampledLane, sampledAssetForLane, sampledInstrumentGap } from "../data/sampledInstruments";
import type { SequencerPattern, SequencerTrack } from "../types/genre";

/** A lane whose sound is a catalogue recording, with the asset that names it. */
export interface SampledLaneRef {
  /** Position in the pattern's track list, which is what the engine's dispatch and the mixer address a lane by. */
  trackIndex: number;
  assetId: string;
  /** The lane's own name, so a report can name the track a user sees. */
  name: string;
}

/** The lanes of a pattern whose sound the lane itself, or the written table, says is a catalogue recording. */
export function sampledLaneRefs(pattern: Pick<SequencerPattern, "tracks">): SampledLaneRef[] {
  const refs: SampledLaneRef[] = [];
  (pattern.tracks ?? []).forEach((track: SequencerTrack, trackIndex: number) => {
    const assetId = sampledAssetForLane(track);
    if (assetId === undefined) return;
    refs.push({ trackIndex, assetId, name: track.name || track.track_id });
  });
  return refs;
}

/**
 * The lanes that **will actually be mixed from their own bytes** — the stand-down set the synthesiser dispatch
 * reads.
 *
 * Three tests, and every one of them is a fact rather than an intention:
 *
 *   1. the lane is a recording ({@link sampledAssetForLane});
 *   2. the catalogue holds that asset — so a lane mapped to a library this mirror does not carry keeps the
 *      synthesiser it has today, which is the owner's stated fallback;
 *   3. the lane is not a v1 `audio` lane that resolved nothing — those are stood down **unconditionally**, because
 *      an `audio` lane has no synthesised voice at all and voicing one is the "drum hit under the sample" bug
 *      `WavExporter` already records. Leaving it to the fallback would resurrect that bug rather than fix it.
 *
 * Returned as a `Map` rather than a `Set` so a caller can name the asset it stood a lane down for, which is what
 * `AudioEngine.prepareSampledLanes` reports and what a criterion can read.
 */
export function sampledStandDownIndexes(
  pattern: Pick<SequencerPattern, "tracks">,
  catalogue: readonly SampleAsset[]
): Map<number, string> {
  const stoodDown = new Map<number, string>();
  (pattern.tracks ?? []).forEach((track: SequencerTrack, trackIndex: number) => {
    const assetId = sampledAssetForLane(track);
    if (assetId !== undefined && findSampleAsset(assetId, catalogue)) {
      stoodDown.set(trackIndex, assetId);
      return;
    }
    if (isAudioLane(track) && assetId !== undefined) stoodDown.set(trackIndex, assetId);
  });
  return stoodDown;
}

/**
 * The **executable** sentences a render or a play should carry about the lanes it left to the synthesiser,
 * each naming the lane and the next step.
 *
 * Only the lanes that *asked* to be a recording get a sentence: a lane whose name is a synthesiser by definition
 * (`warm_pad`, `saw_lead`, …) is not a problem and must not be reported as one, or every render would carry sixty
 * lines of noise and the real gaps would be invisible inside them. `sampledInstrumentGap` is what draws that line,
 * and it returns `undefined` for those.
 *
 * `problems` is the shape both `scheduleOfflineAudioLanes` and the audio-lane planner already use — a list of
 * sentences with the lane named in them — so this composes with the existing reports rather than introducing a
 * third shape.
 */
export function sampledInstrumentProblems(
  pattern: Pick<SequencerPattern, "tracks">,
  catalogue: readonly SampleAsset[]
): string[] {
  const problems: string[] = [];
  (pattern.tracks ?? []).forEach((track: SequencerTrack, trackIndex: number) => {
    const gap = sampledInstrumentGap(track, catalogue);
    if (gap === undefined) return;
    problems.push(`${track.name || track.track_id} (track ${trackIndex}): ${gap}`);
  });
  return problems;
}

/**
 * ⭐ **The one place a playback path's stand-down failures become visible, rather than a silent empty set.**
 *
 * `AudioEngine.prepareSampledLanes` already returns the sentences for every mapped lane this catalogue cannot serve
 * (`sampledInstrumentProblems`, above) — including the case that matters most here, a **mirror that is not
 * configured at all**, where every recorded lane quietly keeps its synthesiser. The transport read those sentences and
 * logged them; the engine-owning hooks did not, so a whole playback route could fall back to synthesis with nothing
 * anywhere saying why. That is the "a control that lies" shape this repository keeps removing, in its audio form.
 *
 * The two destinations are the same two the transport already uses, and for the same reason: a `console.warn` with a
 * stable `[sampled-instrument]` prefix for a developer reading the network panel, and the `problems` array for a caller
 * that wants to surface them in the interface. `warn` is injectable so a criterion can assert the sentence without
 * spying on the console.
 *
 * Returns the problems so a caller can compose them into its own report instead of only logging them.
 */
export function reportSampledLaneProblems(
  problems: readonly string[],
  warn: (message: string) => void = (message) => {
    // eslint-disable-next-line no-console -- the same prefix and shape `useTransportControls` reports lane problems with
    console.warn(message);
  }
): string[] {
  const reported = problems.map((problem) => `[sampled-instrument] ${problem}`);
  for (const line of reported) warn(line);
  return reported;
}

/** Whether this lane's sound is a catalogue recording, whatever the catalogue holds. Re-exported for the audio chain. */
export { isSampledLane };
