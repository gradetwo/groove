/**
 * Scheduling an audio lane's samples — the last piece of the read-only slice's graph, and the same trick as the loader's: **the audio graph is injected**.
 *
 * A real graph needs a browser; the decisions worth testing do not. What lives here is ordering, the second each sample starts at, the gain it carries, and what
 * happens when a sample cannot be loaded — where the bugs are, none of which needs an `AudioContext`. The browser adapter is then a handful of lines that start a
 * buffer source: the part least likely to be wrong and least likely to be testable.
 *
 * It **derives its input from the planner's own** rather than restating the shape, and it **consumes** the plan and the seconds mapping rather than recomputing
 * either — so "when a sample starts" is still defined in exactly one place in this codebase.
 */
import { audioLaneEventSeconds, planAudioLaneEvents } from "./audioLanePlan";
import type { AudioLaneEvent, PlanInput } from "./audioLanePlan";
import type { SampleLoader } from "./sampleLoader";
import { SAMPLE_CATALOGUE } from "../data/sampleCatalogue";
import type { SampleAsset } from "../data/sampleCatalogue";

/** What the scheduler needs from an audio graph. In the browser this starts an `AudioBufferSourceNode`; in a test it records the call. */
export interface SampleSink {
  start(buffer: AudioBuffer, whenSeconds: number, gainDb: number, event: AudioLaneEvent): void;
}

/** The planner's input plus what a tempo map needs, derived rather than restated so the two cannot drift. */
export type ScheduleInput = PlanInput & {
  bpm: number;
  tempoTrack?: Array<{ atBar: number; bpm: number; curve?: "jump" | "linear" }>;
};

export interface AudioLaneScheduleReport {
  scheduled: number;
  seconds: number[];
  problems: string[];
}

/**
 * Plan, load and place every audio lane's sample.
 *
 * Sequential on purpose: a song has few samples, the loader deduplicates decodes anyway, and awaiting in order makes the schedule's order the report's order — which
 * is what a composer reading a failure list expects.
 */
export async function scheduleAudioLaneSamples(
  song: ScheduleInput,
  loader: SampleLoader,
  sink: SampleSink,
  gainDb = 0,
  catalogue: readonly SampleAsset[] = SAMPLE_CATALOGUE
): Promise<AudioLaneScheduleReport> {
  const { events, problems } = planAudioLaneEvents(song, catalogue);
  const seconds: number[] = [];
  let scheduled = 0;

  for (const event of events) {
    try {
      const buffer = await loader.load(event.assetId);
      const when = audioLaneEventSeconds(event, song);
      sink.start(buffer, when, gainDb, event);
      seconds.push(when);
      scheduled += 1;
    } catch (error) {
      // A lane that cannot load is reported with its section, never skipped in silence: silence is the failure this kind exists to avoid.
      problems.push(`section at bar ${event.atBar} · ${event.name}: ${(error as Error).message}`);
    }
  }

  return { scheduled, seconds, problems };
}
