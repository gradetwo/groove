/**
 * P1.1 — ghost notes: the *content* half of "the velocities are flat".
 *
 * P0.2 gave every lane more than one velocity, which fixed the measurement ("all 100s") without making the grooves
 * sound played: measured at the pattern level on 2026-09-23, the snare lane's `max − min` was **≥ 15 in 1 of 11
 * sampled genres** (the plan's own bar), while the hats already passed in 8 of 11. Humanisation is jitter around a
 * value; a ghost note is a *different, quieter hit*, and that is a content decision rather than a random one.
 *
 * So this module adds the content, under the same rules as the rest of the library data:
 *
 *   * **one table per category**, plus a handful of named exceptions — never 159 hand-edited patterns;
 *   * **deterministic by construction**: the ghosts are placed by a drumming rule (the sixteenth *before* an
 *     onset), not rolled from a seed, so two renders of a genre are the same pattern and a diff of this file
 *     explains every difference in the output;
 *   * **additive and quieter only**: no existing onset moves, disappears or gets louder. That is what keeps the
 *     rhythm pinned (a test asserts the original onsets are a subset) and it is why this cannot raise the
 *     library's peaks — the loudness trims are re-recorded once, for the mix changes, rather than once per content
 *     change.
 *
 * P1.4 ("percussion texture") was measured at the same time and **already holds**: every sampled genre with a
 * percussion lane has ≥ 4 onsets and more than one velocity. There is nothing to generate there, so this module
 * does not invent any.
 */
import { GenreCategory, SequencerPattern, SequencerTrack } from "../types/genre";
import { resolveMixTrackId } from "./genreMix";

/** How a category ornaments its drums. */
export interface GrooveTexture {
  /**
   * Velocity of a snare ghost, as a fraction of the onset it leads into.
   *
   * The plan's bar is a spread of 15 MIDI steps on the lane, so a ratio of 0.5 against a backbeat near 110 lands
   * around 55 — well past it, and still recognisably a ghost rather than a second backbeat.
   */
  snareGhostRatio: number;
  /** Most snare ghosts added per bar. A bar with four backbeats does not want four ghosts in most idioms. */
  maxSnareGhostsPerBar: number;
  /**
   * Hat velocity multiplier on the off-eighths.
   *
   * Below 1 on purpose: the accent is expressed by *lowering* the offbeat, which widens the lane's spread without
   * raising its peak — so a content change cannot move the loudness baseline's ceiling. The sixteenths between are
   * left to `humanisePatternVelocities`; this table is about the eighth-note grid a drummer actually accents.
   */
  hatOffbeat: number;
}

/**
 * The table.
 *
 * A category default carries all 159 genres; the exceptions below step away from it with their reason inline, which
 * is the same layering `HUMANISE_BY_CATEGORY` / `GENRE_MIX[id].humanise` already uses. `maxSnareGhostsPerBar: 0`
 * means "this idiom does not play ghosts", and the code path then leaves the pattern untouched.
 */
export const TEXTURE_BY_CATEGORY: Record<GenreCategory, GrooveTexture> = {
  // Drum machines are tight by design, and the movement in club music comes from the arrangement — so a couple of
  // ghosts per bar, not four.
  Electronic: { snareGhostRatio: 0.5, maxSnareGhostsPerBar: 2, hatOffbeat: 0.72 },
  // The idiom is a swung, hand-played backbeat: the ghost *is* the feel.
  "Hip Hop": { snareGhostRatio: 0.48, maxSnareGhostsPerBar: 4, hatOffbeat: 0.7 },
  // Brushes and comping live between the accents; the widest spread of any category.
  "Jazz/Blues": { snareGhostRatio: 0.45, maxSnareGhostsPerBar: 4, hatOffbeat: 0.68 },
  // Congas, shakers and rim clicks are the lead voice and are played by hand.
  "Latin/World": { snareGhostRatio: 0.5, maxSnareGhostsPerBar: 3, hatOffbeat: 0.7 },
  // Programmed but not sterile; the topline is mixed even and stays that way.
  "Pop/R&B": { snareGhostRatio: 0.52, maxSnareGhostsPerBar: 2, hatOffbeat: 0.74 },
  // A real drummer hits the backbeat harder — but the double-kick idiom keeps the ornament sparse.
  "Rock/Metal": { snareGhostRatio: 0.55, maxSnareGhostsPerBar: 2, hatOffbeat: 0.75 },
};

/**
 * Genres that step away from their category, each with its reason.
 *
 * One shape only: a genre whose aesthetic *is* the machine, where a ghost would read as a mistake. The list is
 * deliberately short — an entry here is a claim that this genre is different, not a place to park a preference.
 */
export const TEXTURE_EXCEPTIONS: Record<string, Partial<GrooveTexture>> = {
  // Trackers are grid-locked and the chips have no velocity to speak of (see the same note in GENRE_MIX).
  chiptune: { snareGhostRatio: 0, maxSnareGhostsPerBar: 0 },
  // At 160 BPM a ghost is a stumble, not a feel.
  footwork: { maxSnareGhostsPerBar: 0 },
  // Drill hats are hyper-programmed; the snare stays where the producer put it.
  "brooklyn-drill": { maxSnareGhostsPerBar: 0 },
  // Phonk is deliberately flat and loud — that is the aesthetic.
  "drift-phonk": { snareGhostRatio: 0, maxSnareGhostsPerBar: 0 },
  // Gabber's backbeat is a hard, even hit; ornament is not part of the vocabulary.
  "hardcore-gabber": { maxSnareGhostsPerBar: 0 },
  // Drill's other dialects are as programmed as brooklyn's.
  "uk-drill": { maxSnareGhostsPerBar: 0 },
  "chicago-drill": { maxSnareGhostsPerBar: 0 },
  "jersey-drill": { maxSnareGhostsPerBar: 0 },
};

/** The resolved setting for a genre: the category default, then that genre's exception. */
export function getGrooveTexture(category: GenreCategory | undefined, genreId?: string | null): GrooveTexture {
  const base = TEXTURE_BY_CATEGORY[category ?? "Electronic"] ?? TEXTURE_BY_CATEGORY.Electronic;
  const exception = genreId ? TEXTURE_EXCEPTIONS[genreId] : undefined;
  return exception ? { ...base, ...exception } : base;
}

/** Steps per bar for a pattern's resolution — where "the sixteenth before the onset" is defined. */
export function stepsPerBarFor(resolution: SequencerPattern["resolution"]): number {
  if (resolution === "1/8") return 8;
  if (resolution === "1/32") return 32;
  return 16;
}

/**
 * Add the ghosts and the offbeat hat accents to a pattern.
 *
 * Pure and deterministic: the same pattern, genre and category give the same result every time. Everything it
 * changes is either a *new*, quieter onset or a multiplier below 1 on an existing one.
 */
export function applyGrooveTexture(
  pattern: SequencerPattern,
  genreId: string | undefined | null,
  category: GenreCategory | undefined
): SequencerPattern {
  if (!genreId) return pattern;
  const setting = getGrooveTexture(category, genreId);
  if (setting.snareGhostRatio <= 0 && setting.maxSnareGhostsPerBar <= 0 && setting.hatOffbeat >= 1) return pattern;

  const perBar = stepsPerBarFor(pattern.resolution);
  let changed = false;
  const tracks = (pattern.tracks ?? []).map((track) => {
    const role = resolveMixTrackId(track);
    if (role === "hihat") {
      const accented = accentHats(track, setting, perBar);
      changed = changed || accented !== track;
      return accented;
    }
    if (role === "snare") {
      const ghosted = ghostSnare(track, setting, perBar);
      changed = changed || ghosted !== track;
      return ghosted;
    }
    return track;
  });

  return changed ? { ...pattern, tracks } : pattern;
}

/**
 * Widen a hat lane's dynamics by softening whichever hits the lane treats as the weaker ones.
 *
 * The rule is relative on purpose, and two measurements shaped it:
 *
 *   1. the first version lowered the off-eighths unconditionally — right for a backbeat idiom, exactly wrong for the
 *      house pattern whose *open* hat is on the "and" (it took chicago-house's hat spread from 5 to 4, flattening the
 *      lane it was meant to open up). A machine-locked pattern still has an accent, so the ornament finds it;
 *   2. the second version looked only at the eighth-note grid, and the three lanes that still failed put every hat on
 *      the same *sixteenth* (steps 2, 6, 10, 14 — the "e" of each beat). There is no phase contrast to find there, so
 *      the fallback is the thing a drummer does instead: alternate, and let the hand be audible.
 *
 * Both modes only ever lower velocities: no onset is added, moved or made louder, which is what keeps the
 * loudness baselines' ceiling where the mix put it.
 */
function accentHats(track: SequencerTrack, setting: GrooveTexture, perBar: number): SequencerTrack {
  const steps = track.steps ?? [];
  if (!track.velocity) return track;
  const velocity = [...track.velocity];
  const onsets: number[] = [];
  for (let step = 0; step < steps.length; step += 1) if (steps[step] > 0) onsets.push(step);
  if (onsets.length < 2) return track;

  // Which of the four sixteenth positions inside a beat does this lane use?
  const cell = Math.max(1, Math.round(perBar / 4));
  const buckets = new Map<number, number[]>();
  for (const step of onsets) {
    const phase = step % cell;
    const list = buckets.get(phase) ?? [];
    list.push(velocity[step] ?? 100);
    buckets.set(phase, list);
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  let targets: number[];
  if (buckets.size >= 2) {
    // The lane accents one sixteenth position over the others: push the other one down.
    const ranked = [...buckets.entries()].sort((a, b) => mean(a[1]) - mean(b[1]));
    const weakest = ranked[0][0];
    targets = onsets.filter((step) => step % cell === weakest);
  } else {
    // Every hit sits on the same position, so there is nothing to contrast with: alternate instead.
    targets = onsets.filter((_, index) => index % 2 === 1);
  }

  let touched = false;
  for (const step of targets) {
    const current = velocity[step] ?? 100;
    const next = clampVelocity(current * setting.hatOffbeat);
    if (next !== current) {
      velocity[step] = next;
      touched = true;
    }
  }
  return touched ? { ...track, velocity } : track;
}

/**
 * Place ghosts on the sixteenth **before** an existing snare onset — the classic grace note into a backbeat.
 *
 * The candidates are ranked by the loudness of the onset they lead into, so a bar with more onsets than the
 * category allows keeps the ghosts that matter. A bar whose onsets all sit on its first step gets none: there is
 * no room before them, and a ghost *after* the beat is a different ornament than the one this table describes.
 */
function ghostSnare(track: SequencerTrack, setting: GrooveTexture, perBar: number): SequencerTrack {
  if (setting.maxSnareGhostsPerBar <= 0 || setting.snareGhostRatio <= 0) return track;
  const steps = [...(track.steps ?? [])];
  const velocity = track.velocity ? [...track.velocity] : new Array(steps.length).fill(100);
  const bars = Math.max(1, Math.ceil(steps.length / perBar));
  let added = 0;

  for (let bar = 0; bar < bars; bar += 1) {
    const from = bar * perBar;
    const to = Math.min(steps.length, from + perBar);
    const candidates: Array<{ at: number; velocity: number }> = [];
    for (let step = from + 1; step < to; step += 1) {
      // The gap immediately before a hit, and only a gap: a rest is the silence this ornament decorates.
      if (steps[step] <= 0 || steps[step - 1] !== 0) continue;
      candidates.push({ at: step - 1, velocity: velocity[step] ?? 100 });
    }
    candidates.sort((a, b) => b.velocity - a.velocity || a.at - b.at);
    for (const candidate of candidates.slice(0, setting.maxSnareGhostsPerBar)) {
      steps[candidate.at] = 1;
      velocity[candidate.at] = clampVelocity(candidate.velocity * setting.snareGhostRatio);
      added += 1;
    }
  }

  return added ? { ...track, steps, velocity } : track;
}

/** The renderer's own bounds: a velocity outside 1–127 is not a velocity. */
function clampVelocity(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(127, Math.round(value)));
}
