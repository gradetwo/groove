/**
 * What a new track contains — because **an empty track is silent, and a silent track looks like a broken engine.**
 *
 * Two things were missing when the new-project route first played, and both produced `planned 0`, which is the correct answer to "play this empty arrangement" and a terrible first impression. The first was that no
 * track had any notes. The second is subtler and is the reason a sampler track is different from the others: **a sampler lane plays an asset**, so a sampler track with no `sample` compiles into a lane the planner
 * cannot resolve to anything. The drum kit in the manifest does not need a user to have chosen it before it can make a sound.
 *
 * So a new track arrives with a pattern suited to its kind, and a sampler track arrives pointed at the library this repository already ships. Both are decisions a default may make, and both are visible to the
 * user rather than hidden: the notes are in the pattern they can edit, and the asset is in the track they can change.
 */
import type { SequencerTrack } from "../types/genre";
import type { TrackKindV2 } from "../types/arrangementV2";

/** The library this repository already mirrors and has measured, so a new sampler track can sound without the user importing anything. */
export const DEFAULT_SAMPLER_ASSET = "virtuosity-drums-basic";

/** Sixteen steps, with `every` spacing — the smallest thing that is audibly a pattern rather than a click. */
function steps(every: number, offset = 0): number[] {
  return Array.from({ length: 16 }, (_, index) => (index % every === offset ? 1 : 0));
}

export interface DefaultContent {
  steps: number[];
  /** Present only for kinds that play an asset — a synth with a `sample` would be the shape-permits-it state the model guards against. */
  sample?: SequencerTrack["sample"];
}

export function defaultContentFor(kind: TrackKindV2): DefaultContent {
  switch (kind) {
    // ⭐ A drum pattern on the beat, so a drum track is audible the moment it exists.
    case "drumkit":
      return { steps: steps(4) };
    // ⭐ Every beat rather than every bar: something that sounds deliberate, and that a person can hear is theirs to change.
    case "instrument":
      return { steps: steps(4) };
    case "sampler":
      // ⭐ The asset matters as much as the notes: without it the lane compiles and the planner resolves it to nothing.
      return { steps: steps(4), sample: { assetId: DEFAULT_SAMPLER_ASSET } };
    case "fx":
    case "folder":
      // ⭐ Nothing, and that is the definition rather than an omission: a folder makes no sound and an empty effect rack has nothing to do.
      return { steps: new Array(16).fill(0) };
  }
}
