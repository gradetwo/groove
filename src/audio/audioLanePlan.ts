/**
 * Planning an audio lane's playback, before any audio graph exists (owner decision 2026-09-28, the read-only slice).
 *
 * The ninth kind's **format** half is complete — the kind is declared, the share format carries it, the package schema allows it, the mix role, the group bus and
 * GS-1's routing all decide by kind, and a sample reference that names nothing is an error rather than silence. What does not exist is anything that **plays** one,
 * which is why "measure the audio path's latency into PDC's table" turned out to be a feature rather than a measurement.
 *
 * This is the first piece of it, and it is the piece that needs no audio graph: which samples start where. Same shape as `planGs1Notes` and for the same reason — the
 * arithmetic that decides *when* a sample begins is the part that goes wrong quietly, and it can be tested without a browser. The graph comes next; the *plan* is
 * where correctness lives.
 *
 * A section's audio lane starts **at the section's first bar**, because a sample is not a sequencer pattern: it has its own length and no steps to place. Where it
 * lands inside that bar, and how a long sample crosses into the next section, is the playback path's business — and it will be measured, not assumed.
 *
 * ⭐ **It is also where the overlap rule reaches the audio-lane playback path.** When the song states a tempo,
 * `planAudioLaneEvents` measures each instrument note in seconds and runs `planLegatoJoins` over the plan's own events
 * (`src/audio/legatoJoin.ts`), writing `voiceRank`／`legato`／`handedOn` so `browserSampleSink` can carry the voice that
 * is already sounding — the live half of what the offline renderer has done since `5bb7c7b`.
 */
import { SAMPLE_CATALOGUE, findSampleAsset, sampleReferenceProblem } from "../data/sampleCatalogue";
import { isAudioLane } from "./offlineAudioLanes";
import { stepDuration } from "../data/noteLayer";
import { STEPS_PER_BAR } from "../data/noteEvents";
import { stepTiming, totalSeconds } from "../data/tempoMap";
import type { SampleAsset } from "../data/sampleCatalogue";
import { sampledAssetForLane, sampledDrumVoicingForLane } from "../data/sampledInstruments";
import { planLegatoJoins, type LegatoJoinCandidate, type LegatoJoinMark } from "./legatoJoin";
import type { SequencerTrack } from "../types/genre";
import type { TempoPoint } from "../data/tempoMap";

export interface AudioLaneEvent {
  /**
   * ⭐ **Which lane this event belongs to**, as an ordinal over the lanes the song plans — one number per
   * `slot × track` pair, so the same lane in two sections is one lane and two lanes in one clip are two.
   *
   * It is the identity the overlap rule groups by and the voice ledger keys on (`src/audio/legatoJoin.ts`,
   * `src/audio/legatoVoices.ts`): a note is only ever handed a voice from its own lane. Present on an **instrument**
   * event, which is the only kind that has a voice to carry; a plain sample keeps the shape it has always had.
   */
  trackIndex?: number;
  /** The lane's own name when it has one, so two audio lanes can be told apart. */
  laneId?: string;
  name: string;
  assetId: string;
  /** The absolute bar the event lands on, and the same position in steps. */
  atBar: number;
  atStep: number;
  /**
   * ⭐ **The MIDI note to resolve, for a lane whose sound is a recorded instrument.**
   *
   * Absent means "the asset's own bytes at their own rate" — a plain sample, which is one event per section and the only
   * shape this planner produced before. Present means the lane is an **instrument**: one event per written note, resolved
   * through `loadNote` at this pitch, which is what makes a genre's `piano_lead` chords a piano rather than one C.
   */
  pitch?: number;
  /** How long the note sounds, in steps — the lane's own `gate`, converted to seconds by the scheduler. Instrument events only. */
  gateSteps?: number;
  /**
   * How long the voice sounds, in **seconds**.
   *
   * ⭐ **Written here, by the planner, since the overlap rule needs it** — the rule's whole question is "was the previous
   * voice still sounding when this note began?", which is a question about seconds. The scheduler places the note from
   * the same second rather than computing its own (see `scheduleAudioLaneSamples`), so "when does this note sound and
   * how long is it" has one answer per event. Absent on a plain sample, whose bytes are the whole event.
   */
  seconds?: number;
  /**
   * ⭐ **When this note starts, in seconds** — `stepTiming`'s own answer for this event's step, the same arithmetic the
   * scheduler places the note with. Present on an instrument event beside `seconds`, for the reason above.
   */
  atSeconds?: number;
  /** The lane's position, −1…1, when it states one. Carried per event because the scheduler never sees the lane again. */
  pan?: number;
  /**
   * ⭐ **Which voice of its onset this note is** — the notes of one onset ranked by ascending pitch, lowest first,
   * written by `planLegatoJoins` for every note of every lane the rule examined. The live sink keys its sounding
   * voices by it, exactly as the offline sink does.
   */
  voiceRank?: number;
  /**
   * ⭐ **A handover instead of a new attack**, when the overlap rule says the join is legato.
   *
   * Present means: do not start this note's own recording from its start, but carry the voice already sounding on
   * this lane and rank. `browserSampleSink` performs it through the same `createLegatoVoiceLedger` the offline
   * sampler sink uses, and refuses by name rather than going silent when the recording cannot reach the note's end.
   */
  legato?: LegatoJoinMark;
  /**
   * ⭐ **Whether a later note is planned to be handed this very voice** — written by `planLegatoJoins`, beside `legato`
   * on the notes the rule carries *to*.
   *
   * `browserSampleSink` uses it for one thing: a voice that will be carried must be started with a movable end, because
   * `takeOver()` refuses one whose end is bound inside its node. Nothing else about such a note changes, and a note that
   * is not handed on keeps exactly the shape it had before this field existed.
   */
  handedOn?: boolean;
}

export interface AudioLanePlan {
  events: AudioLaneEvent[];
  problems: string[];
}

export interface PlanInput {
  /** The song's clips by slot, so a lane can be found through the section that plays it. */
  clips: Record<string, { tracks?: SequencerTrack[] } | undefined>;
  /** The sections in order, each with the slot it plays and how many bars it lasts. */
  sections: Array<{ id?: string; slot?: string; bars?: number }>;
  /** Where each section begins, in bars — the flatten's own `boundaries`, so the two cannot disagree. */
  boundaries?: number[];
  /**
   * ⭐ **The tempo, when the caller has it — and the overlap rule needs it.**
   *
   * Whether a note still sounds when the next begins is a question in seconds, and a step is only seconds once a tempo
   * says so. The scheduler already hands the song in with `bpm` (its own `ScheduleInput` requires it), so this costs no
   * caller anything; a caller that plans without a tempo gets no legato marks, which is the honest answer rather than a
   * guess at 120 for a song that states another tempo.
   */
  bpm?: number;
  /** The tempo map, when the song has one, so a note in a movement lands where the music does. */
  tempoTrack?: TempoPoint[];
  /** The flattened pattern's length, so an instrument event's step has a bounded second. Absent means "as far as the events reach". */
  totalSteps?: number;
}

/**
 * ⭐ **How long the plan's timeline is, in steps** — one rule, read by the planner and by the scheduler.
 *
 * The scheduler used to derive this itself from the events, and the planner needs the identical number to place a note
 * in seconds before the scheduler sees it; two derivations of it would be the oldest defect in this codebase. It is
 * exported rather than inlined twice for that reason.
 */
export function audioLaneTotalSteps(events: readonly Pick<AudioLaneEvent, "atStep">[], stated?: number): number {
  return stated ?? events.reduce((longest, event) => Math.max(longest, event.atStep + 1), 16);
}

/**
 * The catalogue is a parameter, as it is everywhere it is read: the shipped one is **empty**, so the default path refuses every reference — which the last test asserts
 * deliberately — while a caller (or a test, or a future asset pack) can supply a real one.
 */
export function planAudioLaneEvents(song: PlanInput, catalogue: readonly SampleAsset[] = SAMPLE_CATALOGUE): AudioLanePlan {
  const events: AudioLaneEvent[] = [];
  const problems: string[] = [];
  const sections = song.sections ?? [];
  /**
   * ⭐ **One lane ordinal per `slot × track`**, handed out the first time a lane is met.
   *
   * The offline planner's events carry their position in the pattern; this planner's events come from a **clip per
   * section**, so a position inside a clip is not an identity — the same clip played by three sections is one lane,
   * and two clips' first tracks are two. The ordinal is what makes "one lane" mean one lane here, and it is the number
   * the sink keys its sounding voices by.
   */
  const lanes = new Map<string, number>();

  // Walk the sections the way a render does, so "section i starts at bar X" has exactly one definition in this codebase.
  let bar = 0;
  sections.forEach((section, index) => {
    const startBar = song.boundaries?.[index] ?? bar;
    const clip = section.slot ? song.clips?.[section.slot] : undefined;
    const tracks = clip?.tracks ?? [];
    for (let trackInClip = 0; trackInClip < tracks.length; trackInClip += 1) {
      const track = tracks[trackInClip]!;
      /**
       * ⭐ **A lane is an audio lane when it sounds a catalogue recording — not only when its `track_id` is `"audio"`.**
       *
       * The ninth kind is one shape a recorded lane takes; the other is a **genre lane** whose `instrument` the written
       * table (`src/data/sampledInstruments.ts`) maps to a catalogue asset. `piano_lead`, `walking_upright`,
       * `strings_lead` and the rest sound through this path, which is why a genre declaring a piano now reaches a real
       * piano in the studio and not only in an export.
       */
      const isAudio = isAudioLane(track);
      const assetId = sampledAssetForLane(track);
      /**
       * ⭐ **An `audio` lane is selected even when it names nothing**, so the "must name a sample" case is still reported
       * rather than dropped: a lane that is silent for a stated reason and a lane that is silently absent look identical
       * from the outside, and only one of them is a defect. The `isAudio` half is what keeps that report.
       */
      if (!isAudio && assetId === undefined) continue;
      const label = `${track.name}${track.laneId ? ` (${track.laneId})` : ""}`;
      const problem = sampleReferenceProblem(track, catalogue);
      if (problem) {
        // A lane that cannot play is reported where it is used, not where it is declared: a composer needs to know which section is silent.
        problems.push(`section ${section.id ?? index + 1} · ${label}: ${problem}`);
        continue;
      }
      const sectionBars = Math.max(1, Math.floor(section.bars ?? 1));
      /**
       * Unreachable in practice — a lane that reached the line above resolved an asset by the catalogue's own rule — and
       * written rather than asserted because `assetId` is still `string | undefined` to the type checker, and a `!` here
       * would be a claim this function cannot make. A `continue` is the same behaviour as the guard above.
       */
      if (assetId === undefined) continue;
      const asset = findSampleAsset(assetId, catalogue);
      /**
       * ⭐ **An instrument lane is planned note by note, and it repeats with its section.**
       *
       * A plain sample is one event per section — it is not a sequencer pattern and has no steps to place, which is the
       * original shape and is kept exactly. An **SFZ instrument** is the opposite: it is the notes the lane carries, and a
       * section of four bars plays that lane four times, so a piano chord written on bar one's downbeat sounds on every
       * bar of the section rather than once at its start. The step pitch is read from the `pitches` stack where it exists
       * and from the flattened `pitch` otherwise — the same rule `offlineAudioLanes.pitchedSteps` uses, so live and offline
       * cannot disagree about which note a column is.
       */
      if (asset?.sfz) {
        /**
         * ⭐ **The same fallback `offlineAudioLanes` applies, for the same reason.** A drum lane carries no `pitch`
         * column, so its note comes from its role through `src/audio/drumRoles.ts`; a melodic lane gets `undefined` and
         * is unchanged. Live and offline have to answer this identically or a bebop chart would play its kick in the
         * studio and render silence — the parity this repository gates on.
         */
        const drumNote = sampledDrumVoicingForLane(track)?.note;
        const notes = pitchedLaneSteps(track, drumNote);
        if (notes.length === 0) {
          problems.push(
            `section ${section.id ?? index + 1} · ${label}: "${assetId}" is an instrument, and the lane has no pitched steps, so there is no note to resolve from it`
          );
          continue;
        }
        const pan = typeof track.pan === "number" && Number.isFinite(track.pan) ? Math.max(-1, Math.min(1, track.pan)) : undefined;
        /** The lane's identity, allocated once however many sections play this clip. */
        const laneKey = `${section.slot ?? ""}#${trackInClip}`;
        let trackIndex = lanes.get(laneKey);
        if (trackIndex === undefined) {
          trackIndex = lanes.size;
          lanes.set(laneKey, trackIndex);
        }
        for (let offset = 0; offset < sectionBars; offset += 1) {
          for (const { step, pitch } of notes) {
            events.push({
              trackIndex,
              ...(track.laneId ? { laneId: track.laneId } : {}),
              name: track.name,
              assetId,
              atBar: startBar + offset,
              atStep: (startBar + offset) * STEPS_PER_BAR + step,
              pitch,
              gateSteps: stepDuration(track, step),
              ...(pan === undefined ? {} : { pan }),
            });
          }
        }
        continue;
      }
      events.push({
        ...(track.laneId ? { laneId: track.laneId } : {}),
        name: track.name,
        assetId,
        atBar: startBar,
        atStep: startBar * STEPS_PER_BAR,
      });
    }
    bar = startBar + Math.max(1, Math.floor(section.bars ?? 1));
  });

  /**
   * ⭐ **The overlap rule, over this planner's own events — the same `planLegatoJoins` the offline renderer calls.**
   *
   * It runs only when the song states a tempo, because every question the rule asks is in seconds and a step is only
   * seconds once a tempo says so. The note's own second and length are written onto the event here (through
   * `audioLaneInstrumentSeconds`, the one reading of the grid the scheduler consumes too) so the rule and the
   * scheduler cannot disagree about where a note is or how long it lasts.
   */
  if (song.bpm !== undefined) {
    const totalSteps = audioLaneTotalSteps(events, song.totalSteps);
    const tempo = { bpm: song.bpm, ...(song.tempoTrack === undefined ? {} : { tempoTrack: [...song.tempoTrack] }) };
    /** The indexed notes, in the plan's own order, so the rule's answer can be written back onto the events it came from. */
    const notes: Array<{ event: AudioLaneEvent; seconds: number | undefined; atSeconds: number }> = [];
    for (const event of events) {
      if (event.pitch === undefined) continue;
      const timing = audioLaneInstrumentSeconds(event.atStep, tempo, totalSteps);
      const seconds = event.gateSteps === undefined ? undefined : event.gateSteps * timing.stepSeconds;
      event.atSeconds = timing.atSeconds;
      event.seconds = seconds;
      notes.push({ event, seconds, atSeconds: timing.atSeconds });
    }
    const joined = planLegatoJoins<LegatoJoinCandidate>(
      notes.map(({ event, seconds, atSeconds }) => ({
        trackIndex: event.trackIndex ?? 0,
        name: event.name,
        assetId: event.assetId,
        pitch: event.pitch!,
        atSeconds,
        ...(seconds === undefined ? {} : { seconds }),
      }))
    );
    joined.events.forEach((marked, position) => {
      const event = notes[position]!.event;
      event.voiceRank = marked.voiceRank;
      event.legato = marked.legato;
      event.handedOn = marked.handedOn;
    });
  }

  return { events, problems };
}

/**
 * When an event happens, in seconds — from the **tempo map**, not from a second copy of the arithmetic.
 *
 * The renderer already knows what a bar costs (`tempoMap.ts`'s `barSeconds`, which the exporter's `stepTiming` uses), and an audio lane's sample has to start at the
 * same instant every other voice does. Computing that here from `60 / bpm` would be the oldest defect in this codebase: two places that compute one thing, and agree
 * until one of them is fixed.
 *
 * So this sums the bars before the event — which is also the only correct answer once a song has a tempo map, because a bar's length then depends on where it is.
 */
export function audioLaneEventSeconds(
  event: Pick<AudioLaneEvent, "atBar">,
  song: { bpm: number; tempoTrack?: Array<{ atBar: number; bpm: number; curve?: "jump" | "linear" }> }
): number {
  return totalSeconds(song, event.atBar);
}

/**
 * ⭐ **An instrument event's own second, from its absolute step** — the same `stepTiming` the offline renderer places
 * every other note with, so a live sampled note and a rendered one land at the same instant, tempo map included.
 *
 * It exists beside {@link audioLaneEventSeconds} rather than replacing it because the two answer different questions:
 * a plain sample starts at its **section's bar** (there is nothing finer to say), while an instrument note starts at its
 * **step**. Routing the first through `stepTiming` would move every existing plain-sample lane by the float difference
 * between a prefix sum and a multiplication, which is exactly what `stepTiming`'s own comment says it avoids.
 */
export function audioLaneInstrumentSeconds(
  step: number,
  song: { bpm: number; tempoTrack?: TempoPoint[] },
  totalSteps: number
): { atSeconds: number; stepSeconds: number } {
  const timing = stepTiming(song, Math.max(totalSteps, step + 1), STEPS_PER_BAR);
  const bounded = Math.max(0, Math.min(step, timing.starts.length - 1));
  return { atSeconds: timing.starts[bounded] ?? 0, stepSeconds: timing.lengthAt(bounded) };
}

/**
 * The steps a note actually starts on, with the pitches they carry — **every note of a chord**, not the lowest.
 *
 * The same rule `offlineAudioLanes.pitchedSteps` applies, and deliberately the same shape: the pattern model keeps
 * `pitches` as a stack per step and `pitch` as its flattened root, so a step is a chord where the stack exists and a
 * single note otherwise. A step with no pitch is not a note.
 */
function pitchedLaneSteps(track: SequencerTrack, fallbackPitch?: number): Array<{ step: number; pitch: number }> {
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
    // A drum lane's step is an attack with no pitch of its own; the role supplies the pad. See `offlineAudioLanes.pitchedSteps`.
    else if (fallbackPitch !== undefined) notes.push({ step, pitch: fallbackPitch });
  });
  return notes;
}
