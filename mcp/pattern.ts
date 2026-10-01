/**
 * Pattern composition for the MCP server: read, transform, validate, describe.
 *
 * `apply_pattern_ops` is the primitive an agent composes with, and its contract is the whole point of this file:
 *
 *   · the input pattern is **never mutated** — the library's genres and the caller's object both stay as they
 *     were, and the return value is a new pattern;
 *   · every operation is one small, named transform, so a model can be told exactly what it may do instead of
 *     being handed "edit this object";
 *   · anything involving chance takes a **seed** and is deterministic for it, because a groove an agent cannot
 *     reproduce is a groove it cannot refine.
 */
import type { SequencerPattern, SequencerTrack } from "../src/types/genre";
import type { OfflineAudioLaneReport } from "../src/audio/offlineAudioLanes";
import { clonePattern } from "./library";

/** The names a caller may use for a track; the app's ids plus the aliases it accepts in its own UI. */
export const TRACK_IDS = ["kick", "snare", "hihat", "percussion", "bass", "chords", "lead", "fx", "audio"] as const;
export type TrackId = (typeof TRACK_IDS)[number];

const TRACK_ALIASES: Record<string, TrackId> = {
  kick: "kick",
  drum: "kick",
  "808": "kick",
  snare: "snare",
  clap: "snare",
  rim: "snare",
  hihat: "hihat",
  hat: "hihat",
  oh: "hihat",
  ch: "hihat",
  perc: "percussion",
  percussion: "percussion",
  shaker: "percussion",
  tom: "percussion",
  bass: "bass",
  "808_bass": "bass",
  chord: "chords",
  chords: "chords",
  harmony: "chords",
  pad: "chords",
  lead: "lead",
  melody: "lead",
  arp: "lead",
  fx: "fx",
  effect: "fx",
  audio: "audio",
  sample: "audio",
  sampler: "audio",
  loop: "audio",
};

/**
 * Track names as a model writes them: "Hi-Hat", "hi hat", "hihat", "808", "shaker".
 *
 * Punctuation and spacing are stripped before lookup, because a hyphen or a space is exactly the kind of
 * variation a model produces and rejecting it teaches the caller nothing about the groove.
 */
export function resolveTrackId(name: string): TrackId | null {
  const normalised = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return TRACK_ALIASES[normalised] ?? null;
}

/**
 * Find a lane **by `laneId` first, then by kind** (owner decision 1A).
 *
 * The order is the whole point: a lane named `lead-2` is reachable by that name, while everything that says `"lead"` keeps meaning "the lead lane" and finds
 * the first one — so a song can carry two leads without changing what any existing caller, export or `validatePattern` run means. The exact-name pass is
 * case-sensitive because a `laneId` is a machine name, not prose; the kind pass keeps the alias handling it has always had.
 */
export function findTrack(pattern: SequencerPattern, name: string): SequencerTrack | null {
  const wanted = name.trim();
  if (wanted.length > 0) {
    const byLaneId = pattern.tracks.find((track) => track.laneId === wanted);
    if (byLaneId) return byLaneId;
  }
  const id = resolveTrackId(name);
  if (!id) return null;
  return pattern.tracks.find((track) => track.track_id === id) ?? null;
}

/**
 * What a render's audio-lane report looks like in a tool reply.
 *
 * The old reply carried one list, `skippedLanes`, built by asking only "is this an audio lane?" — so a lane whose sample resolved and was about to be mixed was
 * still reported as **not in the render**, which was both false and the reason the gap went unnoticed: the report agreed with the bug. The renderer's own report is
 * the only thing that knows the difference, so the reply is shaped from it and says three things distinctly:
 *
 *   · `renderedAudioLanes` — lanes whose bytes reached the mix;
 *   · `skippedLanes` — lanes that could not be, **each with the reason** (a catalogue miss, an instrument with no note to resolve, a fetch or decode failure);
 *   · neither key when the pattern has no audio lane at all, which is the additive promise for every existing render.
 *
 * A lane is never in both lists, and it is never absent from both.
 */
export function audioLaneReplyFields(report: OfflineAudioLaneReport | undefined): Record<string, unknown> {
  if (!report) return {};
  const fields: Record<string, unknown> = {};
  if (report.lanes.length) {
    fields.renderedAudioLanes = report.lanes.map((lane) => ({
      track_id: lane.track_id,
      ...(lane.laneId ? { laneId: lane.laneId } : {}),
      name: lane.name,
    }));
  }
  if (report.problems.length) {
    fields.skippedLanes = report.problems.map((problem) => ({
      track_id: problem.track_id,
      ...(problem.laneId ? { laneId: problem.laneId } : {}),
      name: problem.name,
      ...(problem.assetId ? { assetId: problem.assetId } : {}),
      reason: problem.reason,
    }));
    fields.skippedNote = "these lanes are not in the render; each entry names the lane and why it could not be mixed";
  }
  return fields;
}

/** Deterministic 0..1 from a string seed — no clock, no `Math.random`, so a run is reproducible. */
function seededRandom(seed: number): () => number {
  let state = (seed | 0) || 0x2f6e2b1;
  return () => {
    // xorshift32: small, deterministic, and good enough to scatter velocities and timing.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

export type PatternOp =
  | { op: "set_step"; track: string; step: number; velocity?: number; pitch?: number; gate?: number }
  | { op: "clear_step"; track: string; step: number }
  | { op: "set_velocity"; track: string; step: number; velocity: number }
  | { op: "set_pitch"; track: string; step: number; pitch: number }
  | { op: "set_gate"; track: string; step: number; gate: number }
  | { op: "transpose"; semitones: number; tracks?: string[] }
  | { op: "humanize"; amount?: number; velocityAmount?: number; seed?: number; tracks?: string[] }
  | { op: "swing"; amount: number }
  /**
   * Place a chord progression on a lane, **one chord per bar**.
   *
   * The chords are concrete (`number[][]`, MIDI notes) rather than a progression id, because this module is pure and cannot reach the
   * progression library — the tool layer resolves an id first. That keeps the operation replayable without the library and leaves the
   * library the single source of what a named progression is.
   */
  | { op: "set_chord_progression"; track?: string; chords: number[][]; velocity?: number }
  /**
   * Add a second lane of a kind (owner decision 1A, made usable).
   *
   * `laneId` defaults to `<kind>-<n>`, derived from how many lanes of that kind exist, so two calls never collide by accident. `from` copies an existing lane's
   * arrays — by `laneId` first, then by kind — so a counter-melody can start from the melody it answers. A name is required to be **distinct** inside the
   * pattern, because the exporter names tracks by `name` (`AbletonExporter.ts:128`) and two identical names would produce two identical tracks in a Live set.
   */
  | { op: "add_lane"; track: string; laneId?: string; from?: string; name?: string }
  | { op: "clear_track"; track: string }
  | { op: "copy_track"; from: string; to: string };

export interface OpReport {
  op: string;
  ok: boolean;
  detail: string;
}

export interface ApplyResult {
  pattern: SequencerPattern;
  applied: OpReport[];
}

/**
 * Apply a list of operations, reporting each one.
 *
 * An operation that cannot be applied (unknown track, step out of range) is reported as `ok: false` with a
 * reason and **skipped** rather than throwing: an agent composing sixteen steps should be told which two failed,
 * not lose the other fourteen.
 */
export function applyPatternOps(pattern: SequencerPattern, ops: PatternOp[]): ApplyResult {
  const next = clonePattern(pattern);
  const applied: OpReport[] = [];

  const inRange = (track: SequencerTrack, step: number) => step >= 0 && step < track.steps.length;

  for (const op of ops) {
    switch (op.op) {
      case "set_step": {
        const track = findTrack(next, op.track);
        if (!track) {
          applied.push({ op: op.op, ok: false, detail: `unknown track "${op.track}"` });
          break;
        }
        if (!inRange(track, op.step)) {
          applied.push({ op: op.op, ok: false, detail: `step ${op.step} is outside 0..${track.steps.length - 1}` });
          break;
        }
        track.steps[op.step] = 1;
        if (op.velocity !== undefined) {
          track.velocity = track.velocity ?? track.steps.map(() => 100);
          track.velocity[op.step] = clampVelocity(op.velocity);
        }
        if (op.pitch !== undefined) {
          track.pitch = track.pitch ?? track.steps.map(() => null);
          track.pitch[op.step] = op.pitch;
        }
        if (op.gate !== undefined) {
          track.gate = track.gate ?? track.steps.map(() => 1);
          track.gate[op.step] = op.gate;
        }
        applied.push({ op: op.op, ok: true, detail: `${track.track_id}[${op.step}] = 1` });
        break;
      }
      case "clear_step": {
        const track = findTrack(next, op.track);
        if (!track) {
          applied.push({ op: op.op, ok: false, detail: `unknown track "${op.track}"` });
          break;
        }
        if (!inRange(track, op.step)) {
          applied.push({ op: op.op, ok: false, detail: `step ${op.step} is outside the track` });
          break;
        }
        track.steps[op.step] = 0;
        applied.push({ op: op.op, ok: true, detail: `${track.track_id}[${op.step}] = 0` });
        break;
      }
      case "set_velocity": {
        const track = findTrack(next, op.track);
        if (!track) {
          applied.push({ op: op.op, ok: false, detail: `unknown track "${op.track}"` });
          break;
        }
        if (!inRange(track, op.step)) {
          applied.push({ op: op.op, ok: false, detail: `step ${op.step} is outside the track` });
          break;
        }
        track.velocity = track.velocity ?? track.steps.map(() => 100);
        track.velocity[op.step] = clampVelocity(op.velocity);
        applied.push({ op: op.op, ok: true, detail: `${track.track_id}[${op.step}] velocity = ${clampVelocity(op.velocity)}` });
        break;
      }
      case "set_pitch":
      case "set_gate": {
        const track = findTrack(next, op.track);
        if (!track) {
          applied.push({ op: op.op, ok: false, detail: `unknown track "${op.track}"` });
          break;
        }
        if (!inRange(track, op.step)) {
          applied.push({ op: op.op, ok: false, detail: `step ${op.step} is outside the track` });
          break;
        }
        if (op.op === "set_pitch") {
          track.pitch = track.pitch ?? track.steps.map(() => null);
          track.pitch[op.step] = op.pitch;
        } else {
          track.gate = track.gate ?? track.steps.map(() => 1);
          track.gate[op.step] = op.gate;
        }
        applied.push({ op: op.op, ok: true, detail: `${track.track_id}[${op.step}] updated` });
        break;
      }
      case "transpose": {
        const targets = op.tracks?.length
          ? op.tracks.map((name) => findTrack(next, name)).filter((track): track is SequencerTrack => !!track)
          : next.tracks;
        for (const track of targets) {
          if (!track.pitch) continue;
          track.pitch = track.pitch.map((pitch) => (pitch === null ? null : pitch + op.semitones));
          if (track.pitches) {
            track.pitches = track.pitches.map((stack) => stack?.map((pitch) => pitch + op.semitones) ?? null);
          }
        }
        applied.push({
          op: op.op,
          ok: targets.length > 0,
          detail: `${op.semitones >= 0 ? "+" : ""}${op.semitones} semitones on ${targets.length} track(s)`,
        });
        break;
      }
      case "humanize": {
        const random = seededRandom(op.seed ?? 1);
        const velocityAmount = op.velocityAmount ?? op.amount ?? 0.15;
        const targets = op.tracks?.length
          ? op.tracks.map((name) => findTrack(next, name)).filter((track): track is SequencerTrack => !!track)
          : next.tracks.filter((track) => track.track_id !== "kick");
        let touched = 0;
        for (const track of targets) {
          const velocities = track.velocity ?? track.steps.map(() => 100);
          track.velocity = track.steps.map((on, index) => {
            if (!on) return velocities[index] ?? 100;
            const offset = (random() * 2 - 1) * velocityAmount * 40;
            touched += 1;
            return clampVelocity((velocities[index] ?? 100) + offset);
          });
        }
        applied.push({ op: op.op, ok: true, detail: `jittered ${touched} step(s) by ±${Math.round(velocityAmount * 40)}` });
        break;
      }
      case "swing": {
        next.swing = Math.max(0, Math.min(100, op.amount));
        applied.push({ op: op.op, ok: true, detail: `swing = ${next.swing}` });
        break;
      }
      case "clear_track": {
        const track = findTrack(next, op.track);
        if (!track) {
          applied.push({ op: op.op, ok: false, detail: `unknown track "${op.track}"` });
          break;
        }
        track.steps = track.steps.map(() => 0);
        if (track.velocity) track.velocity = track.velocity.map(() => 0);
        applied.push({ op: op.op, ok: true, detail: `${track.track_id} cleared` });
        break;
      }
      case "copy_track": {
        const from = findTrack(next, op.from);
        const to = findTrack(next, op.to);
        if (!from || !to) {
          applied.push({ op: op.op, ok: false, detail: `need both "${op.from}" and "${op.to}" to exist` });
          break;
        }
        to.steps = [...from.steps];
        to.velocity = from.velocity ? [...from.velocity] : from.steps.map((on) => (on ? 100 : 0));
        if (from.pitch) to.pitch = [...from.pitch];
        if (from.gate) to.gate = [...from.gate];
        applied.push({ op: op.op, ok: true, detail: `${from.track_id} → ${to.track_id}` });
        break;
      }
      case "add_lane": {
        const kind = resolveTrackId(op.track);
        if (!kind) {
          /**
           * ⭐ **The list of kinds is derived from the alias table, not typed out beside it.**
           *
           * Muse reported that this message omitted `audio` — the ninth kind, added by the owner's decision — so a caller reading it would conclude the kind does not exist. A message that lists the valid values has to get them from where the values live, or it becomes a second, older list.
           */
          const kinds = Object.keys(TRACK_ALIASES).sort().join(", ");
          applied.push({ op: op.op, ok: false, detail: `"${op.track}" is not a lane kind — the kinds are: ${kinds}` });
          break;
        }
        const sameKind = next.tracks.filter((track) => track.track_id === kind).length;
        const laneId = (op.laneId ?? `${kind}-${sameKind + 1}`).trim();
        if (!laneId) {
          applied.push({ op: op.op, ok: false, detail: "a laneId cannot be empty" });
          break;
        }
        if (next.tracks.some((track) => (track.laneId ?? track.track_id) === laneId)) {
          applied.push({ op: op.op, ok: false, detail: `a lane called "${laneId}" already exists` });
          break;
        }
        // A copied source, addressed the way everything else addresses lanes: by its own name first, then by kind.
        const source = op.from ? findTrack(next, op.from) : null;
        if (op.from && !source) {
          applied.push({ op: op.op, ok: false, detail: `no lane "${op.from}" to copy from` });
          break;
        }
        const steps = source ? [...source.steps] : next.tracks[0]!.steps.map(() => 0);
        const firstOfKind = next.tracks.find((track) => track.track_id === kind);
        const name = (op.name ?? `${source?.name ?? firstOfKind?.name ?? kind} ${sameKind + 1}`).trim();
        if (next.tracks.some((track) => track.name === name)) {
          applied.push({ op: op.op, ok: false, detail: `a lane named "${name}" already exists — the exporter names tracks by it` });
          break;
        }
        next.tracks.push({
          track_id: kind,
          laneId,
          name,
          instrument: source?.instrument ?? next.tracks[0]!.instrument,
          steps,
          ...(source?.velocity ? { velocity: [...source.velocity] } : {}),
          ...(source?.pitch ? { pitch: [...source.pitch] } : {}),
          ...(source?.gate ? { gate: [...source.gate] } : {}),
          ...(source?.pitches ? { pitches: source.pitches.map((stack) => (stack ? [...stack] : stack)) } : {}),
          ...(source?.syllables ? { syllables: [...source.syllables] } : {}),
        } as (typeof next.tracks)[number]);
        applied.push({ op: op.op, ok: true, detail: `${kind} lane "${laneId}" named "${name}"${source ? ` copied from "${op.from}"` : ""}` });
        break;
      }
      case "set_chord_progression": {
        const lane = findTrack(next, op.track ?? "chords") ?? findTrack(next, "chords");
        if (!lane) {
          applied.push({ op: op.op, ok: false, detail: `no chords lane on this pattern (looked for "${op.track ?? "chords"}")` });
          break;
        }
        const stepsPerBar = 16;
        const bars = Math.max(1, Math.floor((lane.steps?.length ?? stepsPerBar) / stepsPerBar));
        const taken = Math.min(bars, op.chords.length);
        lane.pitches = lane.pitches ?? lane.steps.map(() => null);
        lane.steps = lane.steps.map(() => 0);
        for (let bar = 0; bar < taken; bar += 1) {
          const chord = (op.chords[bar] ?? []).filter((note) => Number.isFinite(note) && note > 0).slice(0, 8);
          if (!chord.length) continue;
          const at = bar * stepsPerBar;
          lane.steps[at] = 1;
          lane.pitches[at] = chord.map((note) => Math.round(note));
          if (lane.velocity) lane.velocity[at] = clampVelocity(op.velocity ?? 100);
        }
        applied.push({
          op: op.op,
          ok: true,
          detail: `${taken} chord(s) on ${lane.track_id}, one per bar${op.chords.length > taken ? ` (${op.chords.length - taken} beyond the pattern were dropped)` : ""}`,
        });
        break;
      }
      default: {
        const unknown = op as { op: string };
        applied.push({ op: unknown.op, ok: false, detail: "unknown operation" });
      }
    }
  }
  return { pattern: next, applied };
}

function clampVelocity(value: number): number {
  return Math.max(1, Math.min(127, Math.round(value)));
}

/** Diagnostics an agent can act on before it exports something broken. */
export function validatePattern(pattern: SequencerPattern): {
  ok: boolean;
  problems: string[];
  warnings: string[];
  trackIds: string[];
} {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!pattern || !Array.isArray(pattern.tracks) || pattern.tracks.length === 0) {
    return { ok: false, problems: ["pattern has no tracks"], warnings, trackIds: [] };
  }
  const steps = pattern.totalSteps ?? pattern.tracks[0].steps.length;
  const seen = new Set<string>();
  for (const track of pattern.tracks) {
    /**
     * A lane's **identity** is `laneId ?? track_id` (owner decision 1A): two lanes of one kind are two lanes when they carry different names, and a duplicate
     * is still a duplicate when they do not. Comparing `track_id` alone rejected every song with a second lead — which is exactly what this decision exists to
     * allow, and the criterion test found it as `duplicate track id "lead"`.
     */
    const laneKey = track.laneId ?? track.track_id;
    if (seen.has(laneKey)) problems.push(`duplicate track id "${laneKey}"`);
    seen.add(laneKey);
    if (!TRACK_IDS.includes(track.track_id as TrackId)) {
      warnings.push(`track id "${track.track_id}" is not one of the eight the app mixes (it will still render)`);
    }
    if (track.steps.length !== steps) {
      problems.push(`track "${track.track_id}" has ${track.steps.length} steps, expected ${steps}`);
    }
    if (track.velocity && track.velocity.length !== track.steps.length) {
      problems.push(`track "${track.track_id}" has ${track.velocity.length} velocities for ${track.steps.length} steps`);
    }
    if (track.pitch && track.pitch.length !== track.steps.length) {
      problems.push(`track "${track.track_id}" has ${track.pitch.length} pitches for ${track.steps.length} steps`);
    }
    if (track.gate && track.gate.length !== track.steps.length) {
      problems.push(`track "${track.track_id}" has ${track.gate.length} gates for ${track.steps.length} steps`);
    }
    const highest = track.velocity?.length ? Math.max(...track.velocity) : 0;
    if (highest > 127) problems.push(`track "${track.track_id}" has a velocity above 127 (${highest})`);
    if (track.steps.every((on) => !on)) warnings.push(`track "${track.track_id}" is empty`);
  }
  if (!pattern.bpm || pattern.bpm < 20 || pattern.bpm > 300) {
    problems.push(`bpm ${pattern.bpm} is outside the renderer's 20..300`);
  }
  return { ok: problems.length === 0, problems, warnings, trackIds: [...seen] };
}

/** What a pattern *is*, in numbers an agent can reason about. */
export function patternStatistics(pattern: SequencerPattern): Record<string, unknown> {
  const steps = pattern.totalSteps ?? pattern.tracks[0]?.steps.length ?? 0;
  const tracks = pattern.tracks.map((track) => {
    const onsets = track.steps.filter(Boolean).length;
    const velocities = (track.velocity ?? []).filter((_, index) => track.steps[index]);
    const pitches = track.pitch ?? [];
    const sounding = pitches.filter((pitch): pitch is number => typeof pitch === "number" && pitch > 0);
    // Off-beat ratio: onsets on the "and" of each 8th, the standard syncopation proxy.
    const offBeat = track.steps.filter((on, index) => on && index % 2 === 1).length;
    return {
      track: track.track_id,
      onsets,
      density: steps ? Math.round((onsets / steps) * 1000) / 1000 : 0,
      offBeatRatio: onsets ? Math.round((offBeat / onsets) * 100) / 100 : 0,
      velocity: velocities.length
        ? { min: Math.min(...velocities), max: Math.max(...velocities), distinct: new Set(velocities).size }
        : null,
      pitchRange: sounding.length ? { min: Math.min(...sounding), max: Math.max(...sounding) } : null,
    };
  });
  return {
    genreId: pattern.genre_id,
    bpm: pattern.bpm,
    scale: pattern.scale,
    timeSignature: pattern.timeSignature ?? "4/4",
    resolution: pattern.resolution ?? "1/16",
    steps,
    bars: Math.ceil(steps / 16),
    swing: pattern.swing ?? 0,
    tracks,
  };
}

/** Field-by-field comparison, for `compare_genres`. */
export function comparePatterns(a: SequencerPattern, b: SequencerPattern): Record<string, unknown> {
  const differences: Array<{ field: string; a: unknown; b: unknown }> = [];
  const scalar: Array<keyof SequencerPattern> = ["bpm", "scale", "swing", "timeSignature", "resolution", "totalSteps"];
  for (const field of scalar) {
    if ((a[field] ?? null) !== (b[field] ?? null)) differences.push({ field, a: a[field] ?? null, b: b[field] ?? null });
  }
  const tracksA = new Set(a.tracks.map((track) => track.track_id));
  const tracksB = new Set(b.tracks.map((track) => track.track_id));
  const rows = [...new Set([...tracksA, ...tracksB])].map((id) => {
    const left = a.tracks.find((track) => track.track_id === id);
    const right = b.tracks.find((track) => track.track_id === id);
    const onsets = (track?: SequencerTrack) => (track ? track.steps.filter(Boolean).length : null);
    return {
      track: id,
      aOnsets: onsets(left),
      bOnsets: onsets(right),
      sameSteps: left && right ? left.steps.join("") === right.steps.join("") : false,
    };
  });
  return { differences, tracks: rows };
}
