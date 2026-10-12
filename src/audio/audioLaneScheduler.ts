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
import { audioLaneEventSeconds, audioLaneInstrumentSeconds, audioLaneTotalSteps, planAudioLaneEvents } from "./audioLanePlan";
import type { AudioLaneEvent, PlanInput } from "./audioLanePlan";
import type { LoadedNote, SampleLoader } from "./sampleLoader";
import { SAMPLE_CATALOGUE } from "../data/sampleCatalogue";
import type { SampleAsset } from "../data/sampleCatalogue";

/**
 * What the scheduler needs from an audio graph. In the browser this starts an `AudioBufferSourceNode`; in a test it
 * records the call.
 *
 * `note` is the loader's own answer for a pitched event — the playback rate, and the region facts a buffer cannot carry
 * (its `loop_mode` and the loop's bounds). It is a parameter rather than something the sink re-derives from the event
 * because the note-to-region resolution lives in the loader, and asking the graph to repeat it would be the second
 * implementation this file exists to avoid. `null` for a plain sample, which has no SFZ and therefore no region.
 */
export interface SampleSink {
  start(buffer: AudioBuffer, whenSeconds: number, gainDb: number, event: AudioLaneEvent, note: LoadedNote | null): void;
}

/** The planner's input plus what a tempo map needs, derived rather than restated so the two cannot drift. */
export type ScheduleInput = PlanInput & {
  bpm: number;
  tempoTrack?: Array<{ atBar: number; bpm: number; curve?: "jump" | "linear" }>;
  /** The flattened pattern's length, so an instrument event's step has a bounded second. Absent means "as far as the events reach". */
  totalSteps?: number;
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
  const totalSteps = audioLaneTotalSteps(events, song.totalSteps);

  for (const event of events) {
    try {
      /**
       * ⭐ **An instrument event resolves a note; a plain sample takes the bytes as they are.**
       *
       * The difference is not cosmetic: `load` decodes one recording and plays it at its own rate, which is what a
       * one-shot sample means, while `loadNote` picks the region that covers this pitch and returns the playback ratio
       * for it — the same resolution the keyboard audition and the arrangement sampler use. A lane with a `pitch` is a
       * lane whose sound is an instrument, so it is the second.
       */
      const pitch = typeof event.pitch === "number" && event.pitch > 0 ? event.pitch : undefined;
      /**
       * ⭐ **The lane's chosen articulation travels with the note** — see `AudioLaneEvent.technique`. The scheduler does not
       * interpret it; it hands the name to the loader, which is the layer that can see the file's own `sw_label`s. A lane
       * that names none passes no option, which is exactly the old call.
       */
      const note = pitch === undefined ? null : await loader.loadNote(event.assetId, pitch, event.technique === undefined ? undefined : { technique: event.technique });
      const buffer = note === null ? await loader.load(event.assetId) : note.buffer;
      /**
       * ⭐ **The planner's own second and length are consumed, not recomputed.**
       *
       * Since the overlap rule needs "when does this note start and how long does it sound" *before* the scheduler runs,
       * `planAudioLaneEvents` answers it once — through `audioLaneInstrumentSeconds`, the same reading of the grid — and
       * writes both onto the event. Recomputing them here would be the second implementation of one thing this codebase
       * spends gates avoiding; the arithmetic is still called, from the fallback branch, for a plan built before the
       * tempo was known (or by a caller that handed in its own events).
       */
      const untimed = pitch !== undefined && (event.atSeconds === undefined || event.seconds === undefined);
      const timing = untimed ? audioLaneInstrumentSeconds(event.atStep, song, totalSteps) : null;
      /**
       * An instrument note is placed from its **step**, through the tempo map; a plain sample from its **section's bar**,
       * as it always was. See `audioLaneInstrumentSeconds` for why the two are not one call.
       */
      const when = event.atSeconds ?? (timing === null ? audioLaneEventSeconds(event, song) : timing.atSeconds);
      /**
       * The end of an instrument note, in seconds, is the lane's own `gate` times the step's own length — required,
       * because a browser voice started with no end rings until the transport stops. A plain sample is left without one:
       * its bytes **are** the event, and cutting them at a stated length would truncate a recording that outlasts its
       * catalogue entry.
       */
      const seconds_ =
        event.seconds ?? (timing !== null && event.gateSteps !== undefined ? event.gateSteps * timing.stepSeconds : undefined);
      sink.start(buffer, when, gainDb, seconds_ === undefined ? event : { ...event, seconds: seconds_ }, note);
      seconds.push(when);
      scheduled += 1;
    } catch (error) {
      // A lane that cannot load is reported with its section, never skipped in silence: silence is the failure this kind exists to avoid.
      problems.push(`section at bar ${event.atBar} · ${event.name}: ${(error as Error).message}`);
    }
  }

  return { scheduled, seconds, problems };
}
