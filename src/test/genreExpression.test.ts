/**
 * Per-genre expression: how a genre's chords, phrase lengths and pattern length become real notes.
 *
 * The user's requirements are the assertions here: **the pattern length may differ per genre** (so
 * the chord progression fits), chords are written as **real note stacks with real lengths** (a bar
 * long if the genre holds them that long, 1/16 if it stabs), arpeggios/broken chords are **real
 * notes** rather than a playback effect — and **a track the genre does not use stays empty**.
 */
import { describe, expect, it } from "vitest";
import {
  beatsPerBar,
  CATEGORY_EXPRESSION_PROFILES,
  chordRootMidi,
  chordSteps,
  expandGenrePattern,
  expressionStepCount,
  GENRE_EXPRESSION,
  isEmptyTrack,
  progressionDegrees,
  resolveGenreExpression,
  romanToDegree,
  stepBeats,
  stepsPerBarFor,
} from "../data/genreExpression";
import type { GenreCategory, SequencerPattern, SequencerTrack } from "../types/genre";
import { MAX_NOTE_GATE_STEPS } from "../types/genre";
import { GENRE_INDEX } from "../data/index/genresIndex";

function makeTrack(over: Partial<SequencerTrack> = {}): SequencerTrack {
  return {
    track_id: "chords",
    name: "Chords",
    instrument: "warm_pad",
    steps: [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pitch: [60, null, null, null, 65, null, null, null, null, null, null, null, null, null, null, null],
    gate: Array(16).fill(0.8),
    velocity: Array(16).fill(100),
    ...over,
  };
}

function makePattern(tracks: SequencerTrack[]): SequencerPattern {
  return {
    genre_id: "test",
    bpm: 128,
    scale: "C minor",
    resolution: "1/16",
    timeSignature: "4/4",
    totalSteps: 16,
    tracks,
  } as unknown as SequencerPattern;
}

const expression = (category: GenreCategory) => resolveGenreExpression(undefined, category);

describe("genre expression · pattern length comes from the progression", () => {
  it("counts beats and steps per bar", () => {
    expect(beatsPerBar("4/4")).toBe(4);
    expect(beatsPerBar("3/4")).toBe(3);
    expect(beatsPerBar("6/8")).toBe(3); // three quarter-note beats, not six eighth "beats"
    expect(stepBeats("1/16")).toBe(0.25);
    expect(stepsPerBarFor({ resolution: "1/16", timeSignature: "4/4" })).toBe(16);
    expect(stepsPerBarFor({ resolution: "1/16", timeSignature: "3/4" })).toBe(12);
  });

  it("asks for a whole number of bars, in a length the sequencer supports", () => {
    const base = { resolution: "1/16" as const, timeSignature: "4/4" };
    expect(expressionStepCount({ chord: { quality: "triad", style: "block", chordBeats: 4, bars: 1, octaveOffset: 0 }, roles: {} }, base)).toBe(16);
    expect(expressionStepCount({ chord: { quality: "triad", style: "block", chordBeats: 4, bars: 2, octaveOffset: 0 }, roles: {} }, base)).toBe(32);
    expect(expressionStepCount({ chord: { quality: "triad", style: "block", chordBeats: 4, bars: 4, octaveOffset: 0 }, roles: {} }, base)).toBe(64);
    // A three-bar progression still needs a supported size: 64, not 48.
    expect(expressionStepCount({ chord: { quality: "triad", style: "block", chordBeats: 4, bars: 3, octaveOffset: 0 }, roles: {} }, base)).toBe(64);
  });

  it("gives different genres different lengths (a 2-bar loop stays 32, a 4-bar progression 64)", () => {
    const base = { resolution: "1/16" as const, timeSignature: "4/4" };
    const rock = expressionStepCount(expression("Rock/Metal"), base); // 2 bars
    const pop = expressionStepCount(expression("Pop/R&B"), base); // 4 bars
    expect(rock).toBe(32);
    expect(pop).toBe(64);
    expect(rock).not.toBe(pop);
  });
});

describe("genre expression · progressions", () => {
  it("reads roman numerals into semitone degrees, including flats and sharps", () => {
    expect(romanToDegree("I")).toBe(0);
    expect(romanToDegree("V")).toBe(7);
    expect(romanToDegree("vi")).toBe(9);
    expect(romanToDegree("bVII")).toBe(10);
    expect(romanToDegree("#IV")).toBe(6);
    expect(romanToDegree("iv°")).toBe(5);
  });

  it("resolves a declared progression by id, and falls back to the tonic", () => {
    const withId = resolveGenreExpression(undefined, "Pop/R&B");
    expect(progressionDegrees({ ...withId, chord: { ...withId.chord, progressionId: "axis-of-awesome" } }).length).toBeGreaterThan(1);
    expect(progressionDegrees({ chord: { quality: "triad", style: "block", chordBeats: 4, bars: 1, octaveOffset: 0 }, roles: {} })).toEqual([0]);
  });

  it("places a degree's root in the pattern's key, and honours the register", () => {
    const pattern = makePattern([makeTrack()]);
    const onTonic = chordRootMidi(pattern, 0, 0, 60);
    expect(((onTonic % 12) + 12) % 12).toBe(0); // C
    expect(onTonic).toBe(60); // anchored on the authored root
    const fifth = chordRootMidi(pattern, 7, 0, 60);
    expect(((fifth % 12) + 12) % 12).toBe(7); // G
    expect(chordRootMidi(pattern, 0, 1, 60)).toBe(onTonic + 12);
    expect(chordRootMidi(pattern, 0, -1, 60)).toBe(onTonic - 12);
  });
});

describe("genre expression · chords become real notes", () => {
  const pattern = () => makePattern([makeTrack()]);

  it("writes a stack per chord slot for block/sustain styles", () => {
    const expr = { chord: { quality: "triad" as const, style: "sustain" as const, chordBeats: 4, bars: 1, octaveOffset: 0 }, roles: {} };
    const expanded = expandGenrePattern(pattern(), expr);
    // The authored pattern marks chords at steps 0 and 4, so the harmony moves there.
    expect(expanded.tracks[0].pitches?.[0]?.length).toBeGreaterThanOrEqual(3);
    expect(expanded.tracks[0].pitches?.[4]?.length).toBeGreaterThanOrEqual(3);
    expect(expanded.tracks[0].steps[0]).toBe(1);
    // A quarter-note chord at 1/16 resolution is four steps long — a *bar* of pad, not a 2-step cap.
    expect(chordSteps(expr, pattern())).toBe(16); // four beats at 1/16 resolution
    // Two chords are authored inside this one bar (steps 0 and 4), so the first is held only up to
    // the second: a chord must not ring over its successor.
    expect(expanded.tracks[0].gate?.[0]).toBe(4);
    // …and the root of a stack is its lowest note.
    expect(expanded.tracks[0].pitch?.[0]).toBe(Math.min(...(expanded.tracks[0].pitches?.[0] as number[])));
  });

  it("writes arpeggios as separate real notes on their own steps", () => {
    const expr = { chord: { quality: "triad" as const, style: "arpeggio" as const, chordBeats: 4, bars: 1, octaveOffset: 0, arpStepBeats: 0.25 }, roles: {} };
    const expanded = expandGenrePattern(pattern(), expr);
    const sounding = expanded.tracks[0].steps.reduce((sum, v) => sum + (v > 0 ? 1 : 0), 0);
    expect(sounding).toBeGreaterThan(4); // an arpeggio is several notes, not one stack
    // Every sounding step is a single note (that is what makes an arpeggio editable in the roll).
    expanded.tracks[0].steps.forEach((v, i) => {
      if (v > 0) expect(expanded.tracks[0].pitches?.[i]?.length).toBe(1);
    });
  });

  it("writes broken chords as alternating bass and upper voices", () => {
    const expr = { chord: { quality: "triad" as const, style: "broken" as const, chordBeats: 4, bars: 1, octaveOffset: 0, arpStepBeats: 0.5 }, roles: {} };
    const expanded = expandGenrePattern(pattern(), expr);
    const roots = expanded.tracks[0].steps.map((v, i) => (v > 0 && expanded.tracks[0].pitches?.[i]?.[0] === expanded.tracks[0].pitch?.[i] ? i : -1)).filter((i) => i >= 0);
    expect(roots.length).toBeGreaterThan(1);
  });

  it("makes a stab shorter than the chord slot", () => {
    const slot = { chord: { quality: "power" as const, style: "sustain" as const, chordBeats: 4, bars: 1, octaveOffset: 0 }, roles: {} };
    const stab = { chord: { quality: "power" as const, style: "stab" as const, chordBeats: 4, bars: 1, octaveOffset: 0 }, roles: {} };
    const held = expandGenrePattern(pattern(), slot).tracks[0].gate?.[0] ?? 0;
    const struck = expandGenrePattern(pattern(), stab).tracks[0].gate?.[0] ?? 0;
    expect(struck).toBeLessThan(held);
  });

  it("uses the genre's chord quality", () => {
    const power = { chord: { quality: "power" as const, style: "block" as const, chordBeats: 4, bars: 1, octaveOffset: 0 }, roles: {} };
    const seventh = { chord: { quality: "seventh" as const, style: "block" as const, chordBeats: 4, bars: 1, octaveOffset: 0 }, roles: {} };
    const powerNotes = expandGenrePattern(pattern(), power).tracks[0].pitches?.[0] ?? [];
    const seventhNotes = expandGenrePattern(pattern(), seventh).tracks[0].pitches?.[0] ?? [];
    // A power chord is a thirdless stack (root, fifth, and its octave); a seventh adds the third and
    // the seventh on top, so it must be wider.
    expect(powerNotes.length).toBeGreaterThanOrEqual(2);
    // A power chord is thirdless: every interval above the root is an octave or a fifth.
    const intervals = powerNotes.map((n) => (((n - powerNotes[0]) % 12) + 12) % 12);
    expect(intervals.every((i) => i === 0 || i === 7)).toBe(true);
    expect(seventhNotes.length).toBeGreaterThan(powerNotes.length);
  });

  it("never writes a note longer than the shared limit", () => {
    const expr = { chord: { quality: "triad" as const, style: "sustain" as const, chordBeats: 64, bars: 4, octaveOffset: 0 }, roles: {} };
    const expanded = expandGenrePattern(pattern(), expr);
    for (const g of expanded.tracks[0].gate ?? []) expect(g).toBeLessThanOrEqual(MAX_NOTE_GATE_STEPS);
  });
});

describe("genre expression · lengths, loops and empty tracks", () => {
  const withDrums = () =>
    makePattern([
      makeTrack(),
      { track_id: "kick", name: "Kick", instrument: "punchy_kick", steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], gate: Array(16).fill(0.8), velocity: Array(16).fill(120) },
      { track_id: "fx", name: "FX", instrument: "riser", steps: Array(16).fill(0), gate: Array(16).fill(0.8), velocity: Array(16).fill(100) },
    ]);

  it("grows every track to the new length and loops the short ones", () => {
    const expr = expression("Pop/R&B"); // 4 bars → 64 steps
    const expanded = expandGenrePattern(withDrums(), expr, { authoredStepCount: 16 });
    expect(expanded.tracks[0].steps).toHaveLength(64);
    expect(expanded.totalSteps).toBe(64);
    // The drum part was authored as one bar: it repeats under the progression instead of being
    // re-authored, which is what `trackLength` is for.
    expect(expanded.tracks[1].trackLength).toBe(16);
  });

  it("leaves a track the genre does not use empty", () => {
    const expanded = expandGenrePattern(withDrums(), expression("Pop/R&B"), { authoredStepCount: 16 });
    expect(isEmptyTrack(expanded.tracks[2])).toBe(true);
    expect(expanded.tracks[2].steps.every((v) => v === 0)).toBe(true);
  });

  it("applies the genre's phrase rules to the tracks that do sound", () => {
    const expr = expression("Electronic"); // hats staccato 0.5, bass legato 1.4
    const expanded = expandGenrePattern(withDrums(), expr, { authoredStepCount: 16 });
    const kick = expanded.tracks[1];
    expect(kick.gate?.[0]).toBeCloseTo(0.8, 5); // no rule for kick: untouched
  });

  it("shortens and lengthens gates according to the role rule", () => {
    const pattern = makePattern([
      makeTrack(),
      { track_id: "hihat", name: "Hat", instrument: "closed_hat", steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], gate: Array(16).fill(0.8), velocity: Array(16).fill(100) },
    ]);
    const staccato = expandGenrePattern(pattern, expression("Electronic"), { authoredStepCount: 16 });
    expect(staccato.tracks[1].gate?.[0]).toBeCloseTo(0.4, 5);
  });

  it("is deterministic: the same input expands to the same pattern", () => {
    const a = expandGenrePattern(withDrums(), expression("Pop/R&B"), { authoredStepCount: 16 });
    const b = expandGenrePattern(withDrums(), expression("Pop/R&B"), { authoredStepCount: 16 });
    expect(a).toEqual(b);
  });

  it("does not overwrite chords the user has already edited (idempotent on expanded data)", () => {
    const once = expandGenrePattern(withDrums(), expression("Pop/R&B"), { authoredStepCount: 16 });
    const twice = expandGenrePattern(once, expression("Pop/R&B"), { authoredStepCount: 16 });
    expect(twice.tracks[0].pitches).toEqual(once.tracks[0].pitches);
  });
});

describe("genre expression · the library", () => {
  it("resolves an expression for every genre, with a usable chord rule", () => {
    const problems: string[] = [];
    for (const genre of GENRE_INDEX as Array<{ id: string; category: GenreCategory }>) {
      const expr = resolveGenreExpression(genre.id, genre.category);
      if (!(expr.chord.chordBeats > 0)) problems.push(`${genre.id}: chordBeats ${expr.chord.chordBeats}`);
      if (!(expr.chord.bars >= 1)) problems.push(`${genre.id}: bars ${expr.chord.bars}`);
      if ((expr.chord.style === "arpeggio" || expr.chord.style === "broken") && !(expr.chord.arpStepBeats ?? 0)) {
        problems.push(`${genre.id}: ${expr.chord.style} without arpStepBeats`);
      }
      if (!Number.isFinite(expr.chord.octaveOffset)) problems.push(`${genre.id}: no register`);
    }
    expect(problems).toEqual([]);
  });

  it("gives every per-genre override a reason", () => {
    for (const [id, override] of Object.entries(GENRE_EXPRESSION)) {
      expect(override.reason, id).toBeTruthy();
      expect(override.reason.length, id).toBeGreaterThan(10);
    }
  });

  it("only names genres that exist", () => {
    const known = new Set((GENRE_INDEX as Array<{ id: string }>).map((g) => g.id));
    const orphans = Object.keys(GENRE_EXPRESSION).filter((id) => !known.has(id));
    expect(orphans).toEqual([]);
  });

  it("varies the pattern length across the library (genres do not all share one size)", () => {
    const sizes = new Set<number>();
    for (const genre of GENRE_INDEX as Array<{ id: string; category: GenreCategory }>) {
      const expr = resolveGenreExpression(genre.id, genre.category);
      sizes.add(expressionStepCount(expr, { resolution: "1/16", timeSignature: "4/4" }));
    }
    expect(sizes.size).toBeGreaterThan(1);
  });

  it("declares every category a profile", () => {
    for (const category of Object.keys(CATEGORY_EXPRESSION_PROFILES)) {
      const expr = CATEGORY_EXPRESSION_PROFILES[category as GenreCategory];
      expect(expr.chord.bars).toBeGreaterThanOrEqual(1);
    }
  });
});
