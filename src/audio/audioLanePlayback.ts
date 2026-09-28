/**
 * The audio-lane playback path, composed for the first time for a caller that is not a test.
 *
 * Every piece already existed and each was tested on its own — the planner, the loader, the browser sink, the scheduler — but nothing in the application had ever called any of them
 * (a repository-wide search found the names only in `src/audio` and `src/test`). This is the entry point that makes the path reachable, which is the difference between a tested slice and
 * a feature.
 *
 * **It is deliberately the smallest composition that can make a sound**: plan the lanes from the song and catalogue, load each lane's sample through the SFZ-aware loader, place them
 * through the sink. No new scheduling logic lives here — if this file grows any, that logic belongs in the module that already owns it.
 *
 * **And it does nothing when there is nothing to do.** A song with no `track_id: "audio"` track, or a catalogue that resolves nothing, returns an empty report rather than a failure:
 * an empty catalogue is this project's shipped state, so every existing song must keep behaving exactly as it does today.
 */
import type { SampleAsset } from "../data/sampleCatalogue";
import { SAMPLE_CATALOGUE } from "../data/sampleCatalogue";
import { browserSampleLoader, browserSampleSink } from "./browserSampleGraph";
import { planAudioLaneEvents, type PlanInput } from "./audioLanePlan";
import { scheduleAudioLaneSamples, type AudioLaneScheduleReport, type ScheduleInput } from "./audioLaneScheduler";

export interface AudioLanePlaybackInput {
  song: ScheduleInput;
  context: BaseAudioContext;
  destination: AudioNode;
  catalogue?: readonly SampleAsset[];
  /** Lane gain in dB, applied by the sink. */
  gainDb?: number;
}

export interface AudioLanePlaybackResult extends AudioLaneScheduleReport {
  /** How many lanes the plan found, before any of them were loaded — the number that answers "was there anything to play". */
  planned: number;
}

export async function playAudioLanes(input: AudioLanePlaybackInput): Promise<AudioLanePlaybackResult> {
  const catalogue = input.catalogue ?? SAMPLE_CATALOGUE;
  const plan = planAudioLaneEvents(input.song as PlanInput, catalogue);

  // Nothing to play: reported as zero rather than as a problem, because a song without audio lanes is the normal case and not a fault.
  if (plan.events.length === 0) {
    return { planned: 0, scheduled: 0, seconds: [], problems: [...plan.problems] };
  }

  const loader = browserSampleLoader(input.context, catalogue);
  const sink = browserSampleSink(input.context, input.destination);
  const report = await scheduleAudioLaneSamples(input.song, loader, sink, input.gainDb ?? 0, catalogue);
  return { planned: plan.events.length, ...report };
}
