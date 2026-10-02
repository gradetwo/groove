/**
 * Sounding a sampler lane's steps — the half of the arrangement's playback the engine's sequencer cannot do.
 *
 * **Why this exists rather than a call to `setPattern`.** The engine routes a step to a voice by `track_id`, and its set of roles is closed (`kick`, `snare`, …, `audio`). None of them loads an SFZ: the only
 * playback path that resolves a note to a recording and a rate is `createSampleLoader.loadNote`, which the keyboard audition already uses. A sampler lane handed to the engine as `"audio"` therefore fell
 * through to a synthesised percussion hit — sound, but not the instrument, which is its own kind of wrong.
 *
 * **This is a scheduler, not a second player.** It owns exactly one decision the engine's lane already makes (`steps[index] !== 0` is a note) and one the engine cannot make (which sample that note is). It
 * deliberately reuses `stepsFromNotes`' output — the 0/1 step array and the per-step pitch — so "where does a note land" still has one definition in this codebase, and it places its voices through
 * `startSamplerNote`, so the pitch and the voice's shape are shared with the audition rather than copied. The timing is the engine's own grid: a step is `60 / bpm / STEPS_PER_BEAT` seconds, which is the same arithmetic
 * `AudioEngine.getStepDuration` uses for a 1/16 resolution, and **that one number gives each note both its onset and its end** — the end being the lane's `gate` (`stepDuration`), because a note here is held
 * for as long as the lane says and not until the user stops the transport.
 *
 * **Every event is scheduled at once, ahead of time.** The browser's audio clock is what plays them, exactly as the engine's lookahead scheduler relies on it, so there is no timer to drift.
 */
import { STEPS_PER_BEAT } from "../data/noteEvents";
import { stepDuration } from "../data/noteLayer";
import { sampledAssetForLane } from "../data/sampledInstruments";
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
  /**
   * **How long the note sounds, in steps** — the lane's `gate`, read through the model's one rule (`noteLayer.stepDuration`,
   * 0.8 when the step states none).
   *
   * It travels on the event rather than being looked up again by the scheduler because the scheduler is the only place that
   * knows a step's length in seconds: it converts this with the same `stepSeconds` it places the onset with, so a note's start
   * and its end cannot be built from two different readings of the grid. Before this was carried, `startSamplerNote` was called
   * with a start and no length, and — unlike an offline render, which ends by itself — a browser note then rang until the user
   * stopped the transport or closed the tab.
   */
  gateSteps: number;
  /**
   * The lane's position, −1…1, when it states one.
   *
   * Carried per event rather than looked up by the player, because the player receives a flat list and never sees the lane again — the same reason the choke
   * group and the one-shot flag travel on the resolved note.
   */
  pan?: number;
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
    /**
     * ⭐ **The one resolver, so a lane the written table maps is a sampler lane here too.**
     *
     * A lane with no `sample` of its own used to be skipped, which was right while only a v2 `sampler` track
     * compiled to `track_id: "audio"`. A **genre lane** whose `instrument` the table maps (`piano_lead`,
     * `walking_upright`, …) carries no `sample` field and is exactly as much a recorded lane, so "which asset is
     * this lane's sound" is asked in one place (`sampledAssetForLane`) rather than answered twice.
     */
    const assetId = sampledAssetForLane(lane);
    if (!assetId) continue;
    lane.steps.forEach((value, step) => {
      if (!value) return;
      /**
       * ⭐ **A step can carry a chord, and this read one note of it.**
       *
       * The pattern model keeps `pitches` as a stack per step — the shape the offline planner
       * (`offlineAudioLanes.pitchedSteps`), `AbletonExporter`, `MidiExporter` and `chordVoicing` all read — while
       * this scheduler read the flattened singular `pitch`, so a piano chord in an arrangement sounded its lowest
       * note alone. The stack is preferred where it exists and the singular field stays the fallback, so every lane
       * written before this starts exactly the voices it did.
       */
      const stack = lane.pitches?.[step];
      const single = lane.pitch?.[step];
      const pitches: number[] =
        Array.isArray(stack) && stack.length > 0
          ? stack.filter((candidate): candidate is number => typeof candidate === "number" && candidate > 0)
          : typeof single === "number" && single > 0
            ? [single]
            : [];
      /**
       * A step with no pitch is **reported as no event**, not defaulted to middle C. Every note in the model carries
       * a pitch, so a missing one means the lane was built from something other than these notes, and playing an
       * arbitrary note for it would hide that.
       */
      if (pitches.length === 0) return;
      const pan = typeof lane.pan === "number" && Number.isFinite(lane.pan) ? Math.max(-1, Math.min(1, lane.pan)) : undefined;
      const gateSteps = stepDuration(lane, step);
      for (const pitch of pitches) {
        events.push({ sourceTrackId, assetId, step, pitch, gateSteps, ...(pan === undefined ? {} : { pan }) });
      }
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
          // The same `stepSeconds` that places the onset gives the note its end, so a lane's timing is one reading of the grid.
          seconds: event.gateSteps * stepSeconds,
          /**
           * ⭐ **The region's loop declaration, which stopped at this line.** `startSamplerNote` has honoured `loop_mode`
           * since the sustaining-strings fix, and this scheduler never passed it — so a `loop_sustain` program
           * (`karoryfer-meatbass` writes it) was cut at the note's gate on the live arrangement path while the offline
           * render let it hold. One seam, two answers, and the live one was the wrong one.
           */
          ...(note.loopMode === undefined ? {} : { loopMode: note.loopMode }),
          ...(note.loopStartFrames === undefined ? {} : { loopStartFrames: note.loopStartFrames }),
          ...(note.loopEndFrames === undefined ? {} : { loopEndFrames: note.loopEndFrames }),
          ...(input.gainDb === undefined ? {} : { gainDb: input.gainDb }),
          ...(event.pan === undefined ? {} : { pan: event.pan }),
        })
      );
    } catch (error) {
      // Named with its track and step: an instrument's own gaps ("no region covers this note") are the useful message, and swallowing them is how a silent step becomes a mystery.
      problems.push(`${event.sourceTrackId} step ${event.step}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { started: voices.length, voices, problems };
}
