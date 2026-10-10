/**
 * ⭐ **Does a genre's own data hold up?** (owner's instruction, 2026-10-10: *"生成音频时候也要检查这些曲风历史数据对不对，
 * 例如和弦是不是太单调之类"*.)
 *
 * A batch that cuts clips from stale-sounding data produces a phone full of dull audio and calls it done. These checks are
 * deliberately **mechanical and few**, and each one reports the numbers behind it, because "the chords are monotonous" is a
 * judgement and "one distinct chord over eight bars" is a fact somebody can fix.
 *
 * Two-way or it is worthless: every check here has a criterion that makes it speak **and** one that keeps it quiet, so a
 * checker cannot pass by always complaining or by never noticing.
 */

export type HealthWarningCode = "empty-lane" | "chord-monotony" | "melody-poverty" | "rhythm-sameness" | "range-violation";

export interface HealthWarning {
  code: HealthWarningCode;
  trackId: string;
  detail: string;
}

export interface HealthNote {
  pitch?: number;
  startBeats: number;
}

export interface HealthLane {
  trackId: string;
  kind: string;
  notes: readonly HealthNote[];
  /** The instrument's measured compass, when the catalogue knows it. */
  range?: readonly [number, number];
}

export interface HealthReport {
  warnings: HealthWarning[];
  stats: {
    lanes: number;
    emptyLanes: number;
    distinctChords: number;
    distinctPitches: number;
    distinctBarPatterns: number;
  };
}

const MIN_BARS_FOR_PATTERN_JUDGEMENT = 4;

export function patternHealth(lanes: readonly HealthLane[], bars: number): HealthReport {
  const warnings: HealthWarning[] = [];
  const melodic = lanes.filter((lane) => lane.kind !== "drumkit" && lane.kind !== "folder" && lane.kind !== "fx");
  /**
   * ⭐ **`fx` is exempt from "empty lane"**: a sweep or a riser is decoration and is routinely written as an empty lane that
   * a later pass fills, so reporting it would be noise rather than a finding (and a checker that always complains is one
   * nobody reads). A **folder** is exempt for the plainer reason that it makes no sound by definition.
   */
  const sounding = lanes.filter((lane) => lane.kind !== "folder" && lane.kind !== "fx");

  for (const lane of sounding) {
    if (lane.notes.length === 0) {
      warnings.push({
        code: "empty-lane",
        trackId: lane.trackId,
        detail: `${lane.trackId} (${lane.kind}) has no notes at all, so this lane is silent in the clip`,
      });
    }
  }

  /** ⭐ Chords are the pitches sounding together: a progression that never changes is one set and no movement. */
  const chordSets = new Set<string>();
  for (const lane of melodic) {
    for (const note of lane.notes) {
      const at = String(note.startBeats);
      const members = melodic
        .filter((other) => other.notes.some((candidate) => candidate.startBeats === note.startBeats))
        .map((other) => other.notes.find((candidate) => candidate.startBeats === note.startBeats)?.pitch ?? -1)
        .sort((a, b) => a - b);
      chordSets.add(`${at}:${members.join(",")}`);
    }
  }
  const chordCount = new Set([...chordSets].map((entry) => entry.split(":")[1])).size;
  if (bars >= MIN_BARS_FOR_PATTERN_JUDGEMENT && melodic.some((lane) => lane.notes.length > 0) && chordCount <= 1) {
    warnings.push({
      code: "chord-monotony",
      trackId: melodic[0]?.trackId ?? "?",
      detail: `one distinct chord over ${bars} bars — the progression never moves`,
    });
  }

  const pitches = new Set(melodic.flatMap((lane) => lane.notes.map((note) => note.pitch ?? -1)).filter((pitch) => pitch >= 0));
  const melodicNotes = melodic.reduce((total, lane) => total + lane.notes.length, 0);
  if (melodicNotes >= 8 && pitches.size <= 2) {
    warnings.push({
      code: "melody-poverty",
      trackId: melodic.find((lane) => lane.notes.length > 0)?.trackId ?? "?",
      detail: `${melodicNotes} melodic notes use only ${pitches.size} distinct pitch(es)`,
    });
  }

  /** ⭐ Rhythm: the same onsets in every bar is a loop, not a part. */
  const barPatterns = new Set<string>();
  for (const lane of sounding) {
    for (const note of lane.notes) {
      const bar = Math.floor(note.startBeats / 4);
      barPatterns.add(`${lane.trackId}@${bar}`);
    }
  }
  /**
   * ⭐ **The pattern of each bar, compared bar to bar** — the first version counted *how many* bars had any onset, which is a
   * different question: a six-bar drum part answered "6 distinct patterns" and stayed silent while every bar was identical.
   * What matters is whether the **sets** are the same.
   */
  const perBar = new Map<number, Set<string>>();
  for (const lane of sounding) {
    for (const note of lane.notes) {
      const bar = Math.floor(note.startBeats / 4);
      const set = perBar.get(bar) ?? new Set<string>();
      set.add(`${lane.trackId}@${(note.startBeats % 4).toFixed(3)}`);
      perBar.set(bar, set);
    }
  }
  const patternsPerBar = new Set([...perBar.values()].map((set) => [...set].sort().join("|")));
  const onsets = new Set([...perBar.values()].flatMap((set) => [...set]));
  if (bars >= MIN_BARS_FOR_PATTERN_JUDGEMENT && onsets.size > 0 && patternsPerBar.size <= 1) {
    warnings.push({
      code: "rhythm-sameness",
      trackId: "all",
      detail: `every bar carries the same onsets over ${bars} bars`,
    });
  }

  for (const lane of lanes) {
    if (!lane.range) continue;
    const [low, high] = lane.range;
    const outside = lane.notes.filter((note) => note.pitch !== undefined && (note.pitch < low || note.pitch > high));
    if (outside.length > 0) {
      warnings.push({
        code: "range-violation",
        trackId: lane.trackId,
        detail: `${outside.length} note(s) outside the instrument's measured compass ${low}–${high}`,
      });
    }
  }

  return {
    warnings,
    stats: {
      lanes: lanes.length,
      emptyLanes: sounding.filter((lane) => lane.notes.length === 0).length,
      distinctChords: chordCount,
      distinctPitches: pitches.size,
      distinctBarPatterns: patternsPerBar.size,
    },
  };
}
