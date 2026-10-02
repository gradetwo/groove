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
 */
import { SAMPLE_CATALOGUE, findSampleAsset, sampleReferenceProblem } from "../data/sampleCatalogue";
import { isAudioLane } from "./offlineAudioLanes";
import { stepDuration } from "../data/noteLayer";
import { STEPS_PER_BAR } from "../data/noteEvents";
import { stepTiming, totalSeconds } from "../data/tempoMap";
import type { SampleAsset } from "../data/sampleCatalogue";
import { sampledAssetForLane } from "../data/sampledInstruments";
import type { SequencerTrack } from "../types/genre";
import type { TempoPoint } from "../data/tempoMap";

export interface AudioLaneEvent {
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
   * How long the voice sounds, in **seconds** — written by the scheduler from `gateSteps` and that step's own length, and
   * read by the browser sink so a note has a scheduled end. Absent on a plain sample, whose bytes are the whole event.
   */
  seconds?: number;
  /** The lane's position, −1…1, when it states one. Carried per event because the scheduler never sees the lane again. */
  pan?: number;
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
}

/**
 * The catalogue is a parameter, as it is everywhere it is read: the shipped one is **empty**, so the default path refuses every reference — which the last test asserts
 * deliberately — while a caller (or a test, or a future asset pack) can supply a real one.
 */
export function planAudioLaneEvents(song: PlanInput, catalogue: readonly SampleAsset[] = SAMPLE_CATALOGUE): AudioLanePlan {
  const events: AudioLaneEvent[] = [];
  const problems: string[] = [];
  const sections = song.sections ?? [];

  // Walk the sections the way a render does, so "section i starts at bar X" has exactly one definition in this codebase.
  let bar = 0;
  sections.forEach((section, index) => {
    const startBar = song.boundaries?.[index] ?? bar;
    const clip = section.slot ? song.clips?.[section.slot] : undefined;
    for (const track of clip?.tracks ?? []) {
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
        const notes = pitchedLaneSteps(track);
        if (notes.length === 0) {
          problems.push(
            `section ${section.id ?? index + 1} · ${label}: "${assetId}" is an instrument, and the lane has no pitched steps, so there is no note to resolve from it`
          );
          continue;
        }
        const pan = typeof track.pan === "number" && Number.isFinite(track.pan) ? Math.max(-1, Math.min(1, track.pan)) : undefined;
        for (let offset = 0; offset < sectionBars; offset += 1) {
          for (const { step, pitch } of notes) {
            events.push({
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
function pitchedLaneSteps(track: SequencerTrack): Array<{ step: number; pitch: number }> {
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
  });
  return notes;
}
