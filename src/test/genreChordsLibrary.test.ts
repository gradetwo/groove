/**
 * Library-wide: **every genre's chords are real chords** once loaded.
 *
 * This is the user-facing claim ("the chords track shows one note, not a chord") checked across all
 * 159 genres through the same entry point the app uses (`patternFromGenre`), rather than on one
 * hand-made fixture. It also pins the two rules the user set for the pattern itself: the length may
 * differ per genre but must be one the sequencer supports, and a track a genre does not use stays
 * empty instead of being padded out.
 */
import { describe, expect, it } from "vitest";
import { ALL_GENRES } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import { MAX_NOTE_GATE_STEPS } from "../types/genre";
import { isEmptyTrack, resolveGenreExpression } from "../data/genreExpression";

const SUPPORTED_LENGTHS = [16, 32, 48, 64, 128];

describe("genre chords across the library", () => {
  const patterns = ALL_GENRES.map((genre) => ({ genre, pattern: patternFromGenre(genre) }));

  it("gives every genre that has chords a real chord, played vertically or as an arpeggio", () => {
    const problems: string[] = [];
    for (const { genre, pattern } of patterns) {
      const authored = genre.sequencer_pattern.tracks.find((t) => t.track_id === "chords");
      if (isEmptyTrack(authored)) continue; // a genre without chords stays without chords
      const chords = pattern.tracks.find((t) => t.track_id === "chords");
      const stacks = (chords?.pitches ?? []).filter((s): s is number[] => Array.isArray(s) && s.length > 0);
      if (stacks.length === 0) {
        problems.push(`${genre.id}: no chord written`);
        continue;
      }
      const widest = Math.max(...stacks.map((s) => s.length));
      const distinct = new Set(stacks.flat()).size;
      // A block/stab/sustain genre must show the chord **vertically** (a stack of three or more);
      // an arpeggio or broken-chord genre states the same harmony **horizontally**, so what has to
      // be true there is that the track uses three or more distinct pitches. Asserting a stack for
      // every genre would have been wrong for 32 of them — the first version of this test did.
      const rule = resolveGenreExpression(genre.id, genre.category).chord;
      const horizontal = rule.style === "arpeggio" || rule.style === "broken";
      if (horizontal ? distinct < 3 : widest < 3) {
        problems.push(`${genre.id}: ${rule.style} with widest ${widest} / ${distinct} distinct`);
      }
      // Every sounding step must agree with the roll's model: root = lowest note of the stack.
      chords?.steps.forEach((value, i) => {
        if (!(value > 0)) return;
        const stack = chords.pitches?.[i];
        if (!Array.isArray(stack) || stack.length === 0) problems.push(`${genre.id}: step ${i} sounds without a stack`);
        else if (chords.pitch?.[i] !== Math.min(...stack)) problems.push(`${genre.id}: step ${i} root is not the lowest note`);
      });
    }
    expect(problems.slice(0, 12)).toEqual([]);
  });

  it("keeps every genre's length one the sequencer supports, and varies it", () => {
    const lengths = new Set<number>();
    const problems: string[] = [];
    for (const { genre, pattern } of patterns) {
      const steps = pattern.tracks[0]?.steps.length ?? 0;
      if (!SUPPORTED_LENGTHS.includes(steps)) problems.push(`${genre.id}: ${steps} steps`);
      // Every track must agree with the pattern length, or the store's derived step count would
      // disagree with what the grid draws.
      for (const track of pattern.tracks) {
        if (track.steps.length !== steps) problems.push(`${genre.id}/${track.track_id}: ${track.steps.length} vs ${steps}`);
      }
      lengths.add(steps);
    }
    expect(problems).toEqual([]);
    // The user asked for lengths to differ per genre so a progression can fit: the library must not
    // collapse to a single size.
    expect(lengths.size).toBeGreaterThan(1);
  });

  it("never exceeds the shared note-length limit anywhere in the library", () => {
    for (const { genre, pattern } of patterns) {
      for (const track of pattern.tracks) {
        for (const gate of track.gate ?? []) {
          if (gate > MAX_NOTE_GATE_STEPS + 1e-9) throw new Error(`${genre.id}/${track.track_id}: gate ${gate}`);
        }
      }
    }
  });

  it("leaves a genre's silent tracks silent (no invented content)", () => {
    // Whatever a genre authors as empty must still be empty after loading: filling every track
    // would be worse than a hole, and the user asked for exactly that.
    const problems: string[] = [];
    for (const { genre, pattern } of patterns) {
      const authored = genre.sequencer_pattern.tracks;
      pattern.tracks.forEach((track, i) => {
        if (isEmptyTrack(authored[i]) && !isEmptyTrack(track)) problems.push(`${genre.id}/${track.track_id}`);
      });
    }
    expect(problems).toEqual([]);
  });

  it("is deterministic: loading the same genre twice gives the same pattern", () => {
    const genre = ALL_GENRES.find((g) => g.id === "chicago-house")!;
    expect(patternFromGenre(genre)).toEqual(patternFromGenre(genre));
  });
});
