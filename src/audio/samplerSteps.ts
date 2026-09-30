/**
 * Sounding a sampler lane's steps — the half of the arrangement's playback the engine's sequencer cannot do.
 *
 * **Why this exists rather than a call to `setPattern`.** The engine routes a step to a voice by `track_id`, and its set of roles is closed (`kick`, `snare`, …, `audio`). None of them loads an SFZ: the only
 * playback path that resolves a note to a recording and a rate is `createSampleLoader.loadNote`, which the keyboard audition already uses. A sampler lane handed to the engine as `"audio"` therefore fell
 * through to a synthesised percussion hit — sound, but not the instrument, which is its own kind of wrong.
 *
 * **This is a scheduler, not a second player.** It owns exactly one decision the engine's lane already makes (`steps[index] !== 0` is a note) and one the engine cannot make (which sample that note is). It
 * deliberately reuses `stepsFromNotes`' output — the 0/1 step array and the per-step pitch — so "where does a note land" still has one definition in this codebase, and it places its voices through
 * `startSamplerNote`, so the pitch and the voice's lifetime are the audition's, not a copy. The timing is the engine's own grid: a step is `60 / bpm / STEPS_PER_BEAT` seconds, which is the same arithmetic
 * `AudioEngine.getStepDuration` uses for a 1/16 resolution.
 *
 * **Every event is scheduled at once, ahead of time.** The browser's audio clock is what plays them, exactly as the engine's lookahead scheduler relies on it, so there is no timer to drift.
 */
import { STEPS_PER_BEAT } from "../data/noteEvents";
import { startSamplerNote, type SamplerVoice } from "./samplerVoice";
import type { SampleLoader } from "./sampleLoader";
import type { SequencerTrack } from "../types/genre";

/** One step of one sampler lane that has a note on it: where it starts and what pitch it is. */
export interface SamplerStepEvent {
  /** The v2 track the lane came from, so a failure or a stop can name a track a user sees. */
  sourceTrackId: string;
  /** The catalogue asset this lane's instrument is. */
  assetId: string;
  /** The step index in the flattened pattern — the position the engine would have triggered at. */
  step: number;
  /** MIDI note number, the pitch this step sounds. */
  pitch: number;
}

export interface SamplerStepInput {
  context: BaseAudioContext;
  destination: AudioNode;
  /** The same SFZ-aware loader the audition uses; the note resolution and the decode cache are therefore shared, not duplicated. */
  loader: SampleLoader;
  /** When the pattern starts, in context time. Defaults to the context's now, which is what pressing play means. */
  startSeconds?: number;
  /** The lane's level, so a scheduled note is mixed like a played one. */
  gainDb?: number;
  bpm?: number;
}

export interface SamplerStepReport {
  /** How many notes were actually started — the honest count, since a step whose sample could not be loaded started nothing. */
  started: number;
  /** The voices, so the caller can stop the notes a transport stop has to silence — the arrangement's stop cannot reach them otherwise. */
  voices: SamplerVoice[];
  /** Notes that could not be resolved or decoded, each with the track and step that failed. Silence with a reason is the standard this path is held to. */
  problems: string[];
}

/**
 * The steps of every sampler lane that carry a note.
 *
 * Pure, and separate from the playing, because "which steps sound and at what pitch" is the part that goes wrong quietly and the part a criterion can judge without an `AudioContext`.
 */
export function planSamplerSteps(
  lanes: readonly { sourceTrackId: string; lane: SequencerTrack }[]
): SamplerStepEvent[] {
  const events: SamplerStepEvent[] = [];
  for (const { sourceTrackId, lane } of lanes) {
    // A lane with no `sample` is not a sampler lane: there is no instrument to resolve, and inventing one would be the silent default this path exists to avoid.
    const assetId = lane.sample?.assetId;
    if (!assetId) continue;
    lane.steps.forEach((value, step) => {
      if (!value) return;
      const pitch = lane.pitch?.[step];
      /**
       * A step with no pitch is **reported as no event**, not defaulted to middle C. Every note in the model carries a pitch, so a missing one means the lane was built from something other than these notes,
       * and playing an arbitrary note for it would hide that.
       */
      if (typeof pitch !== "number" || pitch <= 0) return;
      events.push({ sourceTrackId, assetId, step, pitch });
    });
  }
  return events;
}

/**
 * Beat this on the audio clock: load each event's note and start it at the time the step names.
 *
 * Sequential on purpose, like `scheduleAudioLaneSamples`: the loader's decode cache is keyed by asset, and awaiting in order makes the report's order the plan's order — which is what a composer reading a
 * failure list expects.
 */
export async function scheduleSamplerSteps(events: readonly SamplerStepEvent[], input: SamplerStepInput): Promise<SamplerStepReport> {
  const stepSeconds = 60 / (input.bpm && input.bpm > 0 ? input.bpm : 120) / STEPS_PER_BEAT;
  const startSeconds = input.startSeconds ?? input.context.currentTime;
  const voices: SamplerVoice[] = [];
  const problems: string[] = [];

  for (const event of events) {
    try {
      const note = await input.loader.loadNote(event.assetId, event.pitch);
      voices.push(
        startSamplerNote({
          context: input.context,
          destination: input.destination,
          buffer: note.buffer,
          ratio: note.ratio,
          whenSeconds: startSeconds + event.step * stepSeconds,
          ...(input.gainDb === undefined ? {} : { gainDb: input.gainDb }),
        })
      );
    } catch (error) {
      // Named with its track and step: an instrument's own gaps ("no region covers this note") are the useful message, and swallowing them is how a silent step becomes a mystery.
      problems.push(`${event.sourceTrackId} step ${event.step}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { started: voices.length, voices, problems };
}
