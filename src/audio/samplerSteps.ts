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
 *
 * ⭐ **And it is where the overlap rule reaches the arrangement the owner plays** (`planSamplerSteps`), with the same
 * `createLegatoVoiceLedger` the offline sink uses carrying the voices (`scheduleSamplerSteps`). The rule itself is
 * `src/audio/legatoJoin.ts`'s and is not restated here — this file only feeds it the plan's own events.
 */
import { STEPS_PER_BEAT } from "../data/noteEvents";
import { stepDuration } from "../data/noteLayer";
import { sampledAssetForLane } from "../data/sampledInstruments";
import { programForIdentity } from "../data/stringTechniques";
import type { StringTechnique } from "../data/stringTechniques";
import { samplerReleaseSeconds, startSamplerNote, type SamplerVoice } from "./samplerVoice";
import { planLegatoJoins, type LegatoJoinCandidate, type LegatoJoinMark } from "./legatoJoin";
import { createLegatoVoiceLedger, type LegatoVoiceReading } from "./legatoVoices";
import type { SampleLoader } from "./sampleLoader";
import type { SequencerTrack } from "../types/genre";

/** One step of one sampler lane that has a note on it: where it starts and what pitch it is. */
export interface SamplerStepEvent {
  /**
   * ⭐ **Which lane this event belongs to**, as an ordinal over the lanes handed to `planSamplerSteps`.
   *
   * It is the identity the overlap rule groups by and the voice ledger keys on, so a note is only ever handed a voice
   * from **its own lane**: two lanes playing the same pitch at the same step are two decisions, not one.
   */
  trackIndex: number;
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
   * ⭐ **The articulation the lane's chosen instrument names**, or absent when it names none.
   *
   * The same field `AudioLaneEvent.technique` carries and for the same reason: `violin_section_spiccato` is a caller
   * saying which articulation they want, and a `-KS` program — several articulations folded into one file behind
   * `sw_last` — has to be told, because six of the eight pinned ones declare no `sw_default` for the articulation being
   * asked for and are otherwise silent. The loader turns the name into a switch value through the file's own `sw_label`.
   */
  technique?: StringTechnique;
  /**
   * The lane's position, −1…1, when it states one.
   *
   * Carried per event rather than looked up by the player, because the player receives a flat list and never sees the lane again — the same reason the choke
   * group and the one-shot flag travel on the resolved note.
   */
  pan?: number;
  /**
   * ⭐ **Which voice of its onset this note is** — the notes of one onset ranked by ascending pitch, lowest first,
   * written by `planLegatoJoins` (`src/audio/legatoJoin.ts`) for every note of every lane the rule examined.
   *
   * The ledger keeps one sounding voice per lane and rank, so a later note can be handed the right one at the voice
   * layer — the same field, from the same rule, the offline renderer's events carry.
   */
  voiceRank?: number;
  /**
   * ⭐ **A handover instead of a new attack**, when the overlap rule says the join is legato.
   *
   * Present means the scheduler must not start this note's own recording from its start but carry the voice already
   * sounding on this lane and rank, moving its pitch and keeping its playback position — the live half of what
   * `createOfflineSamplerSink` has done since `5bb7c7b`. The ledger may still refuse, and it says why rather than
   * going silent (`src/audio/legatoVoices.ts` owns that measurement).
   */
  legato?: LegatoJoinMark;
  /**
   * ⭐ **Whether a later note is planned to be handed this very voice** — written by `planLegatoJoins`, beside
   * `legato` on the notes the rule carries *to*.
   *
   * The scheduler uses it for one thing: a voice that will be carried must be started with a movable end, because
   * `takeOver()` refuses a voice whose end is bound inside its node. Nothing else about such a note changes, and a
   * note that is not handed on keeps exactly the shape it had before this field existed.
   */
  handedOn?: boolean;
}

export interface SamplerStepInput {
  context: BaseAudioContext;
  destination: AudioNode;
  /** The same SFZ-aware loader the audition uses; the note resolution and the decode cache are therefore shared, not duplicated. */
  loader: SampleLoader;
  /** When the pattern starts, in context time. Defaults to the context's now, which is what pressing play means. */
  startSeconds?: number;
  /**
   * ⭐ **Resume at this step instead of at the top.**
   *
   * The transport can be paused and continued from where it stopped, and these lanes are placed on the audio clock
   * outside the engine — so without this the engine's own lanes would continue from step *N* while the sampler's
   * started over from step 0, which is a wrong arrangement rather than a wrong sound. Events before this step belong
   * to the part of the pass that was already played and are skipped, and the grid is shifted so this step lands at
   * `startSeconds` (or now). The arithmetic lives here, next to the one place that converts a step to seconds, so the
   * resumed grid and the first pass cannot be built from two different readings of it.
   *
   * Absent (or 0) is the first pass, untouched.
   */
  fromStep?: number;
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
  /**
   * ⭐ **What the voice layer did with the plan's handovers** — the live path's own reading, from the same
   * `createLegatoVoiceLedger` the offline sink uses: how many notes carried the sounding voice instead of starting a
   * recording, and every handover that was refused with the reason. Present so "the rule asked and the voice layer
   * could not" is readable here rather than inferred from the recording count.
   */
  legato: LegatoVoiceReading;
}

/** The tempo a step is measured at when the caller states none — the same 120 `scheduleSamplerSteps` falls back to. */
const DEFAULT_STEP_BPM = 120;

export interface SamplerStepPlanOptions {
  /**
   * ⭐ **The tempo, so the rule can measure an overlap at all.**
   *
   * Every question the overlap rule asks is in seconds — "was the previous voice still sounding when this note
   * began?" — and a step is only seconds once a tempo says so. Absent means 120, which is what the scheduler assumes
   * for an unstated bpm; the player always passes the arrangement's own tempo.
   */
  bpm?: number;
}

/**
 * The steps of every sampler lane that carry a note.
 *
 * Pure, and separate from the playing, because "which steps sound and at what pitch" is the part that goes wrong quietly and the part a criterion can judge without an `AudioContext`.
 *
 * ⭐ **And it is where the overlap rule runs on the live arrangement path**, exactly as `planOfflineAudioLanes` runs it
 * for a render: after the events are built, `planLegatoJoins` ranks each onset's notes into voices and marks the ones
 * the bow carries instead of re-attacking. The rule is not re-implemented here — the same function the offline
 * planner calls is called with this planner's own events, and the two fields it writes mean the same thing.
 */
export function planSamplerSteps(
  lanes: readonly { sourceTrackId: string; lane: SequencerTrack }[],
  options: SamplerStepPlanOptions = {}
): SamplerStepEvent[] {
  const events: SamplerStepEvent[] = [];
  lanes.forEach(({ sourceTrackId, lane }, trackIndex) => {
    /**
     * ⭐ **The one resolver, so a lane the written table maps is a sampler lane here too.**
     *
     * A lane with no `sample` of its own used to be skipped, which was right while only a v2 `sampler` track
     * compiled to `track_id: "audio"`. A **genre lane** whose `instrument` the table maps (`piano_lead`,
     * `walking_upright`, …) carries no `sample` field and is exactly as much a recorded lane, so "which asset is
     * this lane's sound" is asked in one place (`sampledAssetForLane`) rather than answered twice.
     */
    const assetId = sampledAssetForLane(lane);
    if (!assetId) return;
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
      const technique = programForIdentity(lane.instrument ?? "")?.technique;
      for (const pitch of pitches) {
        events.push({
          trackIndex,
          sourceTrackId,
          assetId,
          step,
          pitch,
          gateSteps,
          ...(pan === undefined ? {} : { pan }),
          ...(technique === undefined ? {} : { technique }),
        });
      }
    });
  });

  /**
   * ⭐ **The overlap rule, over this planner's own events — the same call `planOfflineAudioLanes` makes.**
   *
   * The plan's own seconds are `step × stepSeconds`, which is the arithmetic `scheduleSamplerSteps` places the onset
   * with; only their differences matter to the rule, so the transport's later `startSeconds` shift cannot change a
   * decision. The two fields are written back onto the events the scheduler will walk, and nothing else about them
   * moves.
   */
  const bpm = options.bpm && options.bpm > 0 ? options.bpm : DEFAULT_STEP_BPM;
  const stepSeconds = 60 / bpm / STEPS_PER_BEAT;
  const joined = planLegatoJoins<LegatoJoinCandidate>(
    events.map((event) => ({
      trackIndex: event.trackIndex,
      name: event.sourceTrackId,
      assetId: event.assetId,
      pitch: event.pitch,
      atSeconds: event.step * stepSeconds,
      seconds: event.gateSteps * stepSeconds,
    }))
  );
  joined.events.forEach((marked, index) => {
    const event = events[index]!;
    event.voiceRank = marked.voiceRank;
    event.legato = marked.legato;
    event.handedOn = marked.handedOn;
  });
  return events;
}

/**
 * Beat this on the audio clock: load each event's note and start it at the time the step names.
 *
 * Sequential on purpose, like `scheduleAudioLaneSamples`: the loader's decode cache is keyed by asset, and awaiting in order makes the report's order the plan's order — which is what a composer reading a
 * failure list expects.
 */
export async function scheduleSamplerSteps(events: readonly SamplerStepEvent[], input: SamplerStepInput): Promise<SamplerStepReport> {
  const stepSeconds = 60 / (input.bpm && input.bpm > 0 ? input.bpm : DEFAULT_STEP_BPM) / STEPS_PER_BEAT;
  /**
   * ⭐ **One ledger for this pass** — the same `createLegatoVoiceLedger` the offline sampler sink builds. It is created
   * here rather than inside the voice because it is a fact about a performance: which lane's which voice is still
   * sounding, and how much of its recording it has spent. One pass is one performance, so one ledger.
   */
  const ledger = createLegatoVoiceLedger();
  /**
   * ⭐ **The grid's origin, which is the top of the pattern or the step a resume continued from.**
   *
   * Shifting the origin back by `fromStep` is what makes `startSeconds + event.step * stepSeconds` place the resumed
   * step at `startSeconds` rather than `fromStep` steps later. The skipped events are not "dropped": their part of the
   * pass has already been heard, and scheduling them in the past would fire them all at once as a burst.
   */
  const fromStep = Math.max(0, input.fromStep ?? 0);
  const startSeconds = input.startSeconds ?? input.context.currentTime - fromStep * stepSeconds;
  const voices: SamplerVoice[] = [];
  const problems: string[] = [];

  for (const event of events) {
    if (event.step < fromStep) continue;
    try {
      const note = await input.loader.loadNote(event.assetId, event.pitch, event.technique === undefined ? undefined : { technique: event.technique });
      const whenSeconds = startSeconds + event.step * stepSeconds;
      // The same `stepSeconds` that places the onset gives the note its end, so a lane's timing is one reading of the grid.
      const seconds = event.gateSteps * stepSeconds;
      const ratio = Number.isFinite(note.ratio) && note.ratio > 0 ? note.ratio : 1;
      /**
       * ⭐ **A voice that will be handed on is started with a movable end, and only such a voice.**
       *
       * A voice started with `start(when, 0, seconds)` has its end **inside the node**, which a later `stop()` cannot
       * move (W3C: `duration` is "the duration of sound to be played", not a stop time) — so `takeOver()` refuses it
       * and the ledger would report `voice-cannot-be-extended` for a handover the rule allowed. The offline sink gives
       * every cut-short note a release ramp; the live path gives it to exactly the notes the rule names as `handedOn`,
       * under the offline sink's own measurement (`seconds < buffer.duration / ratio`, i.e. "this note is cut off
       * while the recording still had sound in it"). A note nobody will be handed — the overwhelming majority — keeps
       * the scheduled length it has today, byte for byte.
       */
      const recordingSeconds = note.buffer.duration / ratio;
      const startVoice = (): SamplerVoice =>
        startSamplerNote({
          context: input.context,
          destination: input.destination,
          buffer: note.buffer,
          ratio: note.ratio,
          whenSeconds,
          seconds,
          /** ⭐ The legato restriction was the bug: a plain note needs the release too (see `samplerReleaseSeconds`). */
          ...(samplerReleaseSeconds(seconds, recordingSeconds) === undefined
            ? {}
            : { releaseSeconds: samplerReleaseSeconds(seconds, recordingSeconds)! }),
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
        });
      /**
       * ⭐ **The plan's handover is performed by the ledger, not by a second copy of the rule.** `event.legato` is
       * `planLegatoJoins`' answer and `event.voiceRank` is the line of the chord it names; the ledger either carries
       * the sounding voice (`takeOver`) or refuses by name and starts a fresh attack, and either way the note sounds.
       */
      voices.push(
        ledger.play({
          trackIndex: event.trackIndex,
          name: event.sourceTrackId,
          rank: event.voiceRank ?? 0,
          pitch: event.pitch,
          atSeconds: whenSeconds,
          seconds,
          ratio: note.ratio,
          recordingSeconds: note.buffer.duration,
          ...(event.legato === undefined ? {} : { join: event.legato }),
          start: startVoice,
        })
      );
    } catch (error) {
      // Named with its track and step: an instrument's own gaps ("no region covers this note") are the useful message, and swallowing them is how a silent step becomes a mystery.
      problems.push(`${event.sourceTrackId} step ${event.step}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { started: voices.length, voices, problems, legato: ledger.reading() };
}
