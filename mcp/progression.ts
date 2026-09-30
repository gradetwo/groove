/**
 * **Putting a chord progression into the music, not just naming one.**
 *
 * `suggest_progression` and `get_chord_progression` answer *what* to play — they pick from the committed library and render the numerals in the caller's key — and until this module existed an agent had no way to *use* the answer. The gap is the one `z2.md` calls the composer's core productivity: the read side was built and the write side was not.
 *
 * **It is a pure transform**, like `apply_pattern_ops`: a pattern in, a pattern out, and no server state touched. That is also why the tool is named `apply_chord_progression` rather than the `set_chord_progression` the document proposes — this repository already has a rule that a tool whose name begins with a writing verb must be declared `readOnly: false`, and declaring this one that way would be a lie about what it does. `apply_` says what happens and matches its sibling.
 *
 * **Where the chords go**: the pattern's chord lane, found **by the same rule every other tool uses** (`findTrack`: `laneId` first, then kind), created if the pattern has none. Each chord writes its own notes at its own step with a `gate` that holds it for the whole chord, because a chord written as a one-step stab is not a chord.
 */
import type { SequencerPattern, SequencerTrack } from "../src/types/genre";
import { findTrack } from "./pattern";
import { romanToChords } from "./library";
import { POPULAR_PROGRESSIONS } from "../src/data/popularProgressions";

export interface ApplyChordProgressionArgs {
  /** A progression from the committed library, by id. */
  progressionId?: string;
  /** Or the numerals directly (`i-VI-III-VII`), which is what the library entries are made of. */
  roman?: string;
  tonic?: number;
  mode?: "major" | "minor";
  /** How many steps each chord is held. Four is a bar in the default sixteen-step pattern. */
  chordBeats?: number;
  /** Which lane to write to; the chord lane unless the caller names another. */
  track?: string;
  velocity?: number;
}

export interface ApplyChordProgressionResult {
  pattern: SequencerPattern;
  track: string;
  /** How many chords were written, which is not always how many were asked for. */
  written: number;
  /** Steps that held a note before this call and do not now: "apply" replaces the span it writes. */
  cleared: number;
  /** The chords that did not fit, with the reason, so a caller is never silently short of music. */
  skipped: string[];
  numerals: string[];
  chords: number[][];
  key: { tonic: number; mode: "major" | "minor" };
  problems: string[];
}

export function applyChordProgression(pattern: SequencerPattern, args: ApplyChordProgressionArgs): ApplyChordProgressionResult {
  const problems: string[] = [];
  const tonic = args.tonic ?? 60;
  const mode = args.mode ?? "major";

  /**
   * The numerals come from the library when an id is given and from the caller when a string is. An id that does not exist is **reported with the ids that do**, because "unknown progression" alone leaves a caller guessing at a library it cannot see.
   */
  let roman = args.roman?.trim() ?? "";
  if (!roman && args.progressionId) {
    const found = POPULAR_PROGRESSIONS.find((entry) => entry.id === args.progressionId);
    if (!found) {
      const known = POPULAR_PROGRESSIONS.slice(0, 8).map((entry) => entry.id).join(", ");
      return {
        pattern,
        track: args.track ?? "chords",
        written: 0,
        cleared: 0,
        skipped: [],
        numerals: [],
        chords: [],
        key: { tonic, mode },
        problems: [`no progression "${args.progressionId}" — the library has ${POPULAR_PROGRESSIONS.length}, among them: ${known}`],
      };
    }
    roman = Array.isArray(found.roman) ? found.roman.join("-") : String(found.roman);
  }
  if (!roman) {
    return {
      pattern,
      track: args.track ?? "chords",
      written: 0,
      cleared: 0,
      skipped: [],
      numerals: [],
      chords: [],
      key: { tonic, mode },
      problems: ["give either progressionId or roman — there is nothing to apply otherwise"],
    };
  }

  const { chords, numerals, warnings } = romanToChords(roman, { tonic, mode });
  problems.push(...warnings);

  const totalSteps = pattern.totalSteps ?? pattern.tracks[0]?.steps.length ?? 16;
  const chordBeats = Math.max(1, Math.round(args.chordBeats ?? 4));
  const velocity = Math.max(1, Math.min(127, Math.round(args.velocity ?? 100)));

  const wanted = (args.track ?? "chords").trim();
  const existing = findTrack(pattern, wanted);
  const tracks = [...pattern.tracks];
  /** A pattern with no chord lane gets one, because the alternative is refusing to write the thing the caller asked for. */
  const track: SequencerTrack = existing ?? {
    name: "Chords",
    instrument: "synth",
    track_id: "chords",
    steps: new Array<number>(totalSteps).fill(0),
    velocity: new Array<number>(totalSteps).fill(0),
    pitch: new Array<number | null>(totalSteps).fill(null),
    gate: new Array<number>(totalSteps).fill(1),
  };

  const steps = [...(track.steps ?? new Array<number>(totalSteps).fill(0))];
  const velocities = [...(track.velocity ?? new Array<number>(totalSteps).fill(0))];
  const pitches = [...(track.pitch ?? new Array<number | null>(totalSteps).fill(null))];
  const gates = [...(track.gate ?? new Array<number>(totalSteps).fill(1))];

  const skipped: string[] = [];
  let written = 0;
  /**
   * ⭐ **The span the progression occupies is cleared first, and that is a decision rather than a detail.**
   *
   * "Apply this progression" means the lane now holds *this* progression. A genre's pattern already has chords in its chord lane — the first version of the MCP gate assumed a blank one and caught the difference — so writing over them would leave the old voicings sounding underneath the new ones: two progressions at once, and no way for a caller to tell that from the reply.
   *
   * It is bounded to the span that gets written, so anything after it is untouched and nothing outside is lost.
   */
  let cleared = 0;
  const span = Math.min(totalSteps, chords.length * chordBeats);
  for (let step = 0; step < span; step += 1) {
    if (steps[step] === 1) cleared += 1;
    steps[step] = 0;
    velocities[step] = 0;
    pitches[step] = null;
    gates[step] = 1;
  }
  chords.forEach((chord, index) => {
    const start = index * chordBeats;
    if (start >= totalSteps) {
      skipped.push(`${numerals[index] ?? `chord ${index + 1}`} starts at step ${start}, past the pattern's ${totalSteps}`);
      return;
    }
    const length = Math.min(chordBeats, totalSteps - start);
    /**
     * A chord's notes are written **at its first step**, with the root of the chord kept in the lane's `pitch` — the field names are the model's, and a chord lane holds one pitch per step. The extra notes are reported in `chords` so a caller can see the voicing rather than infer it.
     */
    steps[start] = 1;
    velocities[start] = velocity;
    pitches[start] = chord[0] ?? null;
    gates[start] = length;
    written += 1;
  });

  const updated: SequencerTrack = { ...track, steps, velocity: velocities, pitch: pitches, gate: gates };
  const index = pattern.tracks.indexOf(existing as SequencerTrack);
  if (index >= 0) tracks[index] = updated;
  else tracks.push(updated);

  return {
    pattern: { ...pattern, tracks },
    track: existing?.laneId ?? existing?.track_id ?? "chords",
    written,
    /** Steps that held a note before this call and do not now — reported, because a caller replacing a lane should be able to see what it replaced. */
    cleared,
    skipped,
    numerals,
    chords,
    key: { tonic, mode },
    problems,
  };
}
