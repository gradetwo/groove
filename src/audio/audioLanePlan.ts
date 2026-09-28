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
import { SAMPLE_CATALOGUE, sampleReferenceProblem } from "../data/sampleCatalogue";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerTrack } from "../types/genre";

export interface AudioLaneEvent {
  /** The lane's own name when it has one, so two audio lanes can be told apart. */
  laneId?: string;
  name: string;
  assetId: string;
  /** The absolute bar the section starts at, and the same position in steps. */
  atBar: number;
  atStep: number;
}

export interface AudioLanePlan {
  events: AudioLaneEvent[];
  problems: string[];
}

interface PlanInput {
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
      if (track.track_id !== "audio") continue;
      const label = `${track.name}${track.laneId ? ` (${track.laneId})` : ""}`;
      const problem = sampleReferenceProblem(track, catalogue);
      if (problem) {
        // A lane that cannot play is reported where it is used, not where it is declared: a composer needs to know which section is silent.
        problems.push(`section ${section.id ?? index + 1} · ${label}: ${problem}`);
        continue;
      }
      events.push({
        ...(track.laneId ? { laneId: track.laneId } : {}),
        name: track.name,
        assetId: track.sample!.assetId!,
        atBar: startBar,
        atStep: startBar * 16,
      });
    }
    bar = startBar + Math.max(1, Math.floor(section.bars ?? 1));
  });

  return { events, problems };
}
