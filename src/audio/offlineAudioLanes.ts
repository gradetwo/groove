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
import { isSampledLane, sampledAssetForLane, sampledDrumVoicingForLane } from "../data/sampledInstruments";
import { programForIdentity } from "../data/stringTechniques";
import type { StringTechnique } from "../data/stringTechniques";
import { stepTiming } from "../data/tempoMap";
import type { TempoPoint } from "../data/tempoMap";
import { stepDuration } from "../data/noteLayer";
import { deriveTrackStates } from "./trackStates";
import type { SampleLoader, LoadedNote } from "./sampleLoader";
import { planLegatoJoins, type LegatoJoinMark, type LegatoJoinReading } from "./legatoJoin";
import type { LegatoVoiceReading } from "./legatoVoices";

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
  /**
   * **How long the voice sounds, in seconds** — the note's own end, computed from the lane's `gate` (see `noteSeconds`).
   *
   * Absent means **the sample's own length**: the plain-sample lane, where the bytes *are* the whole event and cutting them at a
   * number the catalogue states would truncate a sample that is longer than its catalogue entry claims. The sink resolves it to
   * `buffer.duration`, which starts the source for exactly its own bytes — the same sound as omitting a length, but with a
   * scheduled end rather than none.
   *
   * It is present for every **instrument** note, which is the case that needs it: one recording pitched by `ratio` can be far
   * longer than the note written, and before this was carried the lane's voices were started with no end at all.
   */
  seconds?: number;
  /** The lane's level in dB, from its own `volume` — the one gain stage for the lane. */
  gainDb: number;
  /** The lane's position, −1…1, when it states one. The sink pans by it; `0` and absent are both centre. */
  pan?: number;
  /**
   * ⭐ **The articulation the lane's chosen instrument names** — the same field `AudioLaneEvent.technique` carries, so the
   * live scheduler and the offline renderer ask the loader the same question about the same file.
   *
   * `violin_section_spiccato` is a caller saying which articulation they want; a `-KS` keyswitch program has to be told,
   * because six of the eight pinned ones declare no `sw_default` for the articulation being asked for and are otherwise
   * silent. The loader turns the name into a switch value through the file's own `sw_label`
   * (`src/audio/sfz/keyswitch.ts`), and refuses a name the file does not carry rather than guessing. Absent means the
   * file's own `sw_default` decides, exactly as before.
   */
  technique?: StringTechnique;
  /**
   * ⭐ **Which voice of its onset this note is** — the notes of one onset ranked by ascending pitch, lowest first.
   *
   * Written by `planLegatoJoins` for every pitched event of every lane it examined, so the voice layer can keep one
   * sounding voice per rank and a later note can be handed the right one. Absent on a plain-sample event, which has
   * no pitch and therefore no voice.
   */
  voiceRank?: number;
  /**
   * ⭐ **A handover instead of a new attack**, when the overlap rule says the join is legato (`src/audio/legatoJoin.ts`).
   *
   * Present means: **do not start this note's own recording from its start**. Continue the voice that is already
   * sounding on this rank and move its pitch, carrying its playback position — the shape Kontakt's Time Machine
   * Legato describes ("carry its current playback position over to each following note, rather than playing each
   * Sample from the beginning"). The sink may still refuse, and it must **say so** rather than go silent: the one
   * refusal the plan cannot see is whether the recording has enough left in it
   * (`src/audio/legatoVoices.ts` owns that measurement).
   */
  legato?: LegatoJoinMark;
  /**
   * ⭐ **Whether a later note is planned to be handed this very voice** — written by `planLegatoJoins` on the note a
   * join carries *from*, as opposed to `legato`, which is set on the note carried *to* (`src/audio/legatoJoin.ts`).
   *
   * The offline sink does not consult it: `createOfflineSamplerSink` gives **every** note whose written end arrives
   * before its recording a movable end (`releaseSeconds`), so a handover is possible whatever the rule names. It is
   * declared here because the rule writes it on every planner's own events, and the live sinks — which make movable
   * only the voices named here — are the callers that need it.
   */
  handedOn?: boolean;
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
  /**
   * ⭐ **What the overlap rule decided**, computed here because it is a fact about the notes rather than about the
   * audio: how many onsets landed on a chord that had not released, how many notes those were, and how many of
   * them are handed over to the voice already sounding instead of starting their own attack
   * (`src/audio/legatoJoin.ts`). Empty when no lane overlaps anything.
   */
  legato?: LegatoJoinReading;
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

/**
 * **How long a note sounds, in seconds** — read from the lane, not invented here.
 *
 * A note's length in this model is `gate` ("sounding length in steps", `types/genre.ts`), and the rule for reading it lives in
 * one place: `noteLayer.stepDuration`, which is also what `AudioEngine` and the offline synth dispatch voice a step by. The
 * offline sampler lane was the one path that read no length at all, so it placed every note with a start and nothing else and
 * the voice rang until the render stopped.
 *
 * **Why a lane's consecutive steps are not one longer note.** A held note is `gate > 1` on one step — the arrangement's
 * `lengthBeats` is projected onto exactly that field — while consecutive steps with the same pitch are *separate* attacks
 * (`noteEvents.ts`: a step array "cannot express… a note held across four of them"; `stepsFromNotes` marks only a note's start).
 * Merging a run of them would turn three repeated sixteenths into one sustained note, which is a change of meaning in the other
 * direction, and the data carries no tie marker that could tell the two apart.
 */
function noteSeconds(track: SequencerTrack, step: number, timing: { lengthAt: (step: number) => number }): number {
  return stepDuration(track, step) * timing.lengthAt(step);
}

/**
 * The steps a note actually starts on, with the pitches they carry. A step with no pitch is not a note.
 *
 * ⭐ **A step can carry a chord, and until this read the stack it could not.** The pattern model keeps
 * `pitches` as an array per step — the shape `AbletonExporter`, `MidiExporter`, `chordVoicing` and `genreMid`
 * all read — while this lane was reading the flattened singular `pitch`, so a column with three notes started
 * one voice and the other two were silent. The stack is preferred where it exists and the singular field stays
 * the fallback, so every pattern written before this keeps starting exactly the voices it did.
 */
function pitchedSteps(track: SequencerTrack, fallbackPitch?: number): Array<{ step: number; pitch: number }> {
  const notes: Array<{ step: number; pitch: number }> = [];
  (track.steps ?? []).forEach((value, step) => {
    if (!value) return;
    const stack = track.pitches?.[step];
    if (Array.isArray(stack) && stack.length > 0) {
      for (const pitch of stack) if (typeof pitch === "number" && pitch > 0) notes.push({ step, pitch });
      return;
    }
    const pitch = track.pitch?.[step];
    if (typeof pitch === "number" && pitch > 0) notes.push({ step, pitch });
    /**
     * ⭐ **A drum lane's step carries no pitch — its role supplies one.**
     *
     * `kick`, `snare`, `hihat` and `percussion` are one instrument each, so the genre data writes `steps` and `velocity`
     * and no `pitch` column at all. The note comes from `src/audio/drumRoles.ts` (General MIDI Percussion, the map the
     * library itself is written in), and the caller passes it here once it has resolved the lane to a kit. Without it
     * this function returns nothing for a drum lane and the planner reports "an instrument, and the lane has no pitched
     * steps" — a true sentence about a lane that is not missing anything, which is how the drum half of the catalogue
     * stayed unreachable while the melodic half played.
     *
     * A lane that *does* write a `pitch` keeps it: the fallback is a **fallback**, so a pattern that deliberately
     * places a hit on another pad still plays that pad.
     */
    else if (fallbackPitch !== undefined) notes.push({ step, pitch: fallbackPitch });
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
    /**
     * ⭐ **A lane is an audio lane when it sounds a catalogue recording — not only when its `track_id` is `"audio"`.**
     *
     * The ninth kind is one shape a recorded lane takes; the other is a **genre lane** whose `instrument` the
     * written table (`src/data/sampledInstruments.ts`) maps to a catalogue asset (`piano_lead`, `walking_upright`,
     * `strings_lead`, …). Those lanes carry notes rather than one sample, and this planner already voices an
     * instrument lane correctly: one `loadNote` per written pitch, the `pitches` stack read so a chord is a chord,
     * the lane's `gate` as the note's end, its `volume` as the gain and its `pan` as the position. Widening the
     * predicate is the whole of the change here — nothing below had to learn a new shape.
     */
    if (!isAudioLane(track) && !isSampledLane(track)) continue;
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

    /**
     * The catalogue's own rule, used rather than restated: a lane with no recording, or one naming nothing the
     * catalogue holds, is a named problem. The `assetId` for the report comes from the same resolver the rest of
     * this planner uses, so a lane the *table* maps is reported with **its** asset rather than with whatever
     * `sample` field it happens to carry (a mapped lane carries none).
     */
    const problem = sampleReferenceProblem(track, catalogue);
    if (problem) {
      problems.push({ ...ref, ...(sampledAssetForLane(track) ? { assetId: sampledAssetForLane(track)! } : {}), reason: problem });
      continue;
    }

    const assetId = sampledAssetForLane(track)!;
    const asset = findSampleAsset(assetId, catalogue)!;
    const gainDb = laneGainDb(track);
    const pan = typeof track.pan === "number" && Number.isFinite(track.pan) ? Math.max(-1, Math.min(1, track.pan)) : undefined;
    /** The lane's chosen articulation, read where the lane is still visible — see `OfflineAudioLaneEvent.technique`. */
    const technique = programForIdentity(track.instrument ?? "")?.technique;

    if (asset.sfz) {
      /**
       * ⭐ **A drum lane's notes come from its role, and a melodic lane's from the pattern.**
       *
       * `sampledDrumVoicingForLane` is the same function `sampledAssetForLane` used to choose this asset, so the note
       * and the kit that answers it cannot come from two different decisions — which is the defect this whole module is
       * shaped to avoid. A lane that is not a drum lane gets `undefined` and behaves exactly as before.
       */
      const drumNote = sampledDrumVoicingForLane(track)?.note;
      const notes = pitchedSteps(track, drumNote);
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
          /**
           * Both changes are kept, and they are independent: the window decides **where** a note lands (and drops the
           * ones outside the chunk), the gate decides **how long** it sounds. The sampler fix added the duration, the
           * offset work added the window and the shift, and neither is a correction of the other.
           */
          atSeconds: (timing.starts[Math.min(step, lastTimedStep)] ?? 0) - timeOffsetSec,
          seconds: noteSeconds(track, step, timing),
          gainDb,
          ...(pan === undefined ? {} : { pan }),
          ...(technique === undefined ? {} : { technique }),
        });
        /**
         * Counted, because a lane whose every note fell outside this window is not in this render: listing it as
         * rendered would claim audio that is not in the buffer, and calling it a problem would name a defect where
         * there is only a bar range. The line sat just past the end of the hunk I merged by hand, which is exactly
         * where a hunk-boundary resolution loses a line — the typecheck passed and only the criteria caught it.
         */
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
     *
     * No `seconds` here, and that is deliberate: the bytes are the whole event, so the sink starts it for its own
     * length rather than for a catalogue entry the file may outlast. An instrument's note has a gate to honour; a
     * one-shot sample is simply its own length.
     */
    if (!inRange(0)) continue;
    events.push({ ...ref, assetId, atSeconds: 0 - timeOffsetSec, gainDb, ...(pan === undefined ? {} : { pan }) });
    lanes.push(ref);
  }

  /**
   * ⭐ **The overlap rule runs over the finished event list, here, as a pass with no audio in it.**
   *
   * It is applied at the end rather than while the events are being built because it is a fact about the plan as a
   * whole — an onset is a chord only once every note of it has been placed, and whether a voice is still sounding
   * is a question about seconds, which only exist after `stepTiming` has answered. Being a pass also means the rule
   * can be judged on its own (`planLegatoJoins`) without a loader, a context or a catalogue.
   */
  const joined = planLegatoJoins(events);
  return {
    events: joined.events,
    lanes,
    problems,
    ...(joined.reading.lanes.length > 0 ? { legato: joined.reading } : {}),
  };
}

/** Where a sample is started, with what rate and position. The graph is injected, so this is the whole browser-independent contract. */
export interface OfflineAudioLaneSink {
  /**
   * Start the event's voice.
   *
   * **Every voice the sink starts must be given an end.** `event.seconds` is the note's length when the planner could compute
   * one (every instrument note); when it is absent the sink uses the buffer's own `duration`, which is the same sound but with a
   * scheduled stop rather than none. A voice started with neither is the defect this contract exists to name: a sampler lane
   * whose notes rang until the render ended, and whose every retrigger only piled another endless voice onto the mix.
   *
   * ⭐ **`note` carries what a buffer cannot say**, for an instrument event: SFZ's `loop_mode` and `loop_start`/`loop_end`,
   * alongside the choke group, `one_shot` and `note_polyphony` that already travelled on `LoadedNote`. Without it the loop
   * opcodes reached the resolver, were read correctly, and were dropped **at this boundary** — the sink signature was the
   * last place they could be lost, and it was where they were lost.
   */
  start(buffer: AudioBuffer, event: OfflineAudioLaneEvent, ratio: number, note?: LoadedNote): void;
  /**
   * ⭐ **What the voice layer did with the plan's handovers, when it can say.**
   *
   * `event.legato` is a *request*: the plan can see that the previous voice has not released and that the pitch
   * moves, and it cannot see whether that voice's **recording** has enough left in it to reach the end of the note
   * it is being handed — that needs the decoded buffer, which only the sink has. So the sink may refuse a handover,
   * and when it does it must start a fresh attack rather than go silent. This is where it reports how many it
   * performed and why it refused the rest, so "the join was asked for and not made" cannot be mistaken for "the
   * join was made". Absent means the sink does not perform handovers at all, which is the browser adapter's state
   * before this existed and remains a valid one for a fake.
   */
  legatoReading?(): LegatoVoiceReading;
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
  /**
   * ⭐ **What the overlap rule decided, and what the voice layer could do with it.**
   *
   * `planned` is `planOfflineAudioLanes`' own reading — a fact about the notes, computed with no audio at all.
   * `voices` is the sink's, present only when the sink performs handovers: how many of those requests became a
   * carried voice and which ones it refused, with the reason. The two are kept apart because they answer different
   * questions — "should this be legato?" and "could this recording be carried that far?" — and a single number
   * would hide the second.
   */
  legato?: { planned: LegatoJoinReading; voices?: LegatoVoiceReading };
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
 * ⭐ **The recordings this render needs, resolved and fetched *before* the render is allowed to start.**
 *
 * ## Why this exists, and where the shape comes from
 *
 * The owner's requirement is one sentence: *"音源需要下载和持久化，渲染前应该用到的音源都下载完毕"* — the samples must be stored, and
 * everything the render will use must be **already downloaded** when it begins. Without this step the mixing pass at
 * {@link scheduleOfflineAudioLanes} is where the bytes arrive: it walks the plan and `await`s a fetch and a decode per note,
 * **between** the scheduling of the synthesised lanes and `startRendering()`. That works, and it makes two things true that
 * should not be: the network is inside the render's critical path, and "what this render needs" has no answer until the render
 * has already started asking.
 *
 * The shape is **not invented here**. It is `prepareSamplerLanes` (`src/audio/samplerLanePrepare.ts`), which the Web session
 * uses for the same problem on the live side, and that module in turn takes it from the closest mainstream web sampler — `smplr`
 * states both halves verbatim: *"#### Wait for audio loading — You can wait for all of them, await either: `piano.ready`"* and
 * *"#### Load progress — Track how many samples have loaded via the `onLoadProgress` option … `total` is known before loading
 * starts, so you can display a determinate progress bar."*
 * (<https://raw.githubusercontent.com/danigb/smplr/main/README.md>). This reuse is deliberate: a second prewarm shape on the
 * render side would be the "two places, one thing" failure this repository spends gates avoiding.
 *
 * ## What is deliberately the same, and what is deliberately not
 *
 *   · **The set is the plan's own.** `planOfflineAudioLanes` is called here with the caller's own step window, bpm and tempo
 *     map, so "what was warmed" and "what will sound" cannot be two answers. Nothing is re-derived.
 *   · **A failure is a reported state, not an endless wait.** Every note that cannot be resolved is pushed into `problems` in
 *     the **same sentence shape** `scheduleOfflineAudioLanes` uses (and, through the MCP reply, the shape
 *     `reportSampledLaneProblems` reports), so a lane that will be silent says so before the render rather than after it.
 *   · **A failure does not stop the render.** `ready` is false and the render proceeds to the mixing pass, which will report
 *     the same failure in its own report: refusing the whole render because one kit's note 60 has no region would trade a
 *     partial render for no render, and `scheduleOfflineAudioLanes` already exists to sound every note that *can* sound.
 *   · **A plain sample and an instrument note are both warmed**, through `load` and `loadNote` respectively — the same two
 *     calls the mixing pass makes, so a prewarm hit really is a cache hit and not a third route.
 *
 * ⚠️ **What it costs, stated.** Warming resolves *every distinct note* of the render, and the loader's decode cache then holds
 * all of them for the render's lifetime. The mixing pass would hold them for the same reason (it is the same loader and the same
 * cache), so this moves the work rather than adding it — but it does mean a lane with a hundred distinct pitches decodes a
 * hundred recordings before any audio exists, where the old order would have sounded the first note before decoding the last.
 * That is the trade the owner asked for: "before rendering, everything needed is downloaded".
 */
export interface OfflineAudioLanePreparation {
  /** Distinct notes (and plain samples) that resolved and are now decoded in the loader's cache. */
  loaded: number;
  /** Distinct notes this render needs, known before the first request — which is what makes a progress display determinate. */
  total: number;
  /** True when every needed recording is ready to sound. */
  ready: boolean;
  /** True when there was nothing to load — the ordinary case for a render with no recorded lane. */
  empty: boolean;
  /** One sentence per recording that could not be resolved, in the mixing pass's own report shape. */
  problems: string[];
}

export interface PrepareOfflineAudioLanesInput {
  pattern: Pick<SequencerPattern, "tracks" | "bpm" | "totalSteps">;
  /** The loader the mixing pass will sound through — **the same one**, or this is a second download rather than a warm-up. */
  loader: SampleLoader;
  catalogue?: readonly SampleAsset[];
  /** The same options the mixing pass will be given, so the two plan the same events. */
  bpm?: number;
  tempoTrack?: readonly TempoPoint[];
  totalSteps?: number;
  stepSpan?: number;
  stepOffset?: number;
  timeOffsetSec?: number;
  stemTrackIdx?: number;
  silencedTrackIndexes?: readonly number[];
  /** Called after every recording resolves, on both the success and the failure path, so a display never freezes. */
  onProgress?: (progress: { loaded: number; total: number }) => void;
}

/** The identity of one recording a render needs: which asset, which pitch, which articulation. */
function recordingKey(event: Pick<OfflineAudioLaneEvent, "assetId" | "pitch" | "technique">): string {
  return `${event.assetId}\u0000${event.pitch ?? ""}\u0000${event.technique ?? ""}`;
}

/**
 * Resolve and fetch every recording the plan names, reporting progress, and answer whether the render is ready.
 *
 * **Resolves rather than rejects**, exactly as `prepareSamplerLanes` does: a caller about to start a render needs the answer,
 * and the sentences it needs to show a person are in `problems`.
 */
export async function prepareOfflineAudioLanes(input: PrepareOfflineAudioLanesInput): Promise<OfflineAudioLanePreparation> {
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

  /**
   * ⭐ **Deduplicated by recording, not by event.** A walking bass plays the same note on several steps and a chord repeats
   * across a bar; the loader's cache would collapse those into one fetch anyway, but they would still be N `loadNote` calls,
   * each re-running resolution over the whole expanded program. Asking once per distinct recording is what makes `total` a
   * number a person recognises, and it is the same reason `prepareSamplerLanes` deduplicates by note.
   */
  const wanted = new Map<string, OfflineAudioLaneEvent>();
  for (const event of plan.events) {
    const key = recordingKey(event);
    if (!wanted.has(key)) wanted.set(key, event);
  }

  const problems = [...plan.problems.map((problem) => (problem.assetId ? `${problem.assetId}: ${problem.reason}` : problem.reason))];
  let loaded = 0;
  const total = wanted.size;
  input.onProgress?.({ loaded, total });

  for (const event of wanted.values()) {
    try {
      if (event.pitch === undefined) {
        await input.loader.load(event.assetId);
      } else {
        await input.loader.loadNote(event.assetId, event.pitch, event.technique === undefined ? undefined : { technique: event.technique });
      }
      loaded += 1;
    } catch (error) {
      problems.push(`${event.assetId}${event.pitch === undefined ? "" : ` note ${event.pitch}`}: ${error instanceof Error ? error.message : String(error)}`);
    }
    input.onProgress?.({ loaded, total });
  }

  return { loaded, total, ready: problems.length === 0, empty: total === 0, problems };
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
        const note = await input.loader.loadNote(event.assetId, event.pitch, event.technique === undefined ? undefined : { technique: event.technique });
        input.sink.start(note.buffer, event, note.ratio, note);
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
  /**
   * ⭐ **The sink is asked what it did with the handovers, after every note has been placed** — the one moment at
   * which its reading is complete, and the one place where "the rule asked for 57 joins and the voice layer made 21
   * of them, refusing 36 because the recording would have run out" can be reported as the two facts it is.
   */
  const voices = input.sink.legatoReading?.();
  return {
    lanes: rendered,
    events,
    problems,
    ...(plan.legato ? { legato: { planned: plan.legato, ...(voices ? { voices } : {}) } } : {}),
    ...(input.catalogueProblem ? { catalogueProblem: input.catalogueProblem } : {}),
  };
}
