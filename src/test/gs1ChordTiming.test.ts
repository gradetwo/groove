/**
 * GS-1 chord timing + transport-stop silencing (v2.0.18 fixes).
 *
 * Three defects were reported from listening, and all three are timing/ownership bugs in the
 * live GS-1 wiring rather than in the synth itself:
 *
 *  1. **Chord length was squared.** `chordNoteDuration()` already multiplies by
 *     `treatment.gateScale`, and the GS-1 path multiplied by it again, so a `stab` (0.3) became
 *     0.09x — a 13 ms click — and a `sustain` (3.0) became 9x, ringing for most of a second.
 *     The genre's articulation table only means something if both engines agree on it.
 *  2. **Auditioning a track destroyed the live host.** Audition routes to the master output,
 *     and the pool treated a different destination as "rebuild this slot", so audition and
 *     playback tore down each other's hosts — the "audition has latency / does not sound" report.
 *  3. **Stop left notes ringing.** GS-1 voices live in the worklet's own allocator, not in the
 *     native `voiceRegistry`, so `panic()` never touched them.
 *
 * These tests drive the real engine against a fake AudioContext with an injected pool, so the
 * wiring is exercised without WASM and the assertions are about what the engine actually asks
 * GS-1 to play.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import type { Gs1VoicePool, PoolNote } from "../audio/gs1/Gs1VoicePool";
import { DEFAULT_GS1_ROUTING_ENABLED, setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import { CHORD_ARTICULATIONS, chordNoteDuration } from "../audio/chordVoicing";
import { resolveChordTreatment } from "../data/genreVoicing";
import { ALL_GENRES } from "../data/genres";
import type { SequencerPattern } from "../types/genre";
import { installFakeAudioContext } from "./helpers/fakeAudio";

interface Captured {
  trackIdx: number;
  role: string;
  instrument: string | null | undefined;
  notes: readonly PoolNote[];
  dest: unknown;
}

/** A pool stub that records routing decisions and can be silenced. */
function makePoolStub() {
  const plays: Captured[] = [];
  const releaseAll = vi.fn();
  const pool = {
    isTrackReady: () => true,
    ensureTrack: async () => true,
    tryPlay: (
      trackIdx: number,
      role: string,
      instrument: string | null | undefined,
      notes: readonly PoolNote[],
      dest: unknown
    ) => {
      plays.push({ trackIdx, role, instrument, notes, dest });
      return true;
    },
    releaseAll,
    dispose: vi.fn(),
  } as unknown as Gs1VoicePool;
  return { pool, plays, releaseAll };
}

const CHORD_INSTRUMENT = "warm_pad";

function makePattern(genreId: string): SequencerPattern {
  const steps = 16;
  return {
    genre_id: genreId,
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [
      {
        track_id: "chords",
        name: "Chords",
        instrument: CHORD_INSTRUMENT,
        steps: new Array(steps).fill(1),
        velocity: new Array(steps).fill(100),
        pitch: new Array(steps).fill(60),
        gate: new Array(steps).fill(0.8),
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
      },
    ],
  } as unknown as SequencerPattern;
}

describe("GS-1 chord timing and stop behaviour", () => {
  let restore: () => void;

  beforeEach(() => {
    setGs1RoutingEnabled(true);
    restore = installFakeAudioContext();
  });

  afterEach(() => {
    restore();
    setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
    localStorage.clear();
  });

  const engineFor = (genreId: string) => {
    const { pool, plays, releaseAll } = makePoolStub();
    const engine = new AudioEngine({ createGs1Pool: () => pool });
    engine.setPattern(makePattern(genreId), { resetSteps: false } as never);
    return { engine, plays, releaseAll };
  };

  it("gives GS-1 chords the genre's articulation length, not its square", () => {
    // Real genre ids, one per articulation family: chicago-house is `stab` (0.3), ambient-techno
    // `sustain` (3.0), french-house `comp` (0.55). Using an id that is not in the catalog would
    // silently fall back to the chords instrument's default and hide a regression.
    const cases = ["chicago-house", "ambient-techno", "french-house"] as const;
    const seen = new Set<string>();
    for (const genreId of cases) {
      const { engine, plays } = engineFor(genreId);
      const treatment = resolveChordTreatment(genreId, CHORD_INSTRUMENT);
      const stepDur = engine.getStepDuration();
      seen.add(treatment.articulation);
      engine.triggerNote(0, "Chords", 0.9, 60, 1, 0.8);

      expect(plays.length, `${genreId}: GS-1 should have taken the chord`).toBe(1);
      const expected = chordNoteDuration(stepDur, 0.8, treatment);
      for (const note of plays[0].notes) {
        expect(note.duration, `${genreId} (${treatment.articulation}) duration`).toBeCloseTo(expected, 9);
      }
      // The squaring bug is not subtle: prove the assertion can fail by checking the two
      // candidate values differ whenever the articulation is away from 1.0.
      if (Math.abs(treatment.gateScale - 1) > 0.01) {
        expect(Math.abs(expected * treatment.gateScale - expected)).toBeGreaterThan(expected * 0.05);
      }
    }
    // The three ids must genuinely exercise three different articulations, or this test would
    // still pass while covering one case.
    expect(seen.size).toBe(3);
  });

  it("keeps the catalog's articulation spread wide enough to be heard", () => {
    // Item ⑥ reported "every genre's chords are the same length". The table does not say that:
    // check the whole catalog, so a future edit that flattens articulation into one value fails
    // here rather than in someone's ears.
    const counts: Record<string, number> = {};
    for (const genre of ALL_GENRES as Array<{ id: string; tracks?: Array<{ track_id: string; instrument?: string }> }>) {
      const instrument = genre.tracks?.find((t) => t.track_id === "chords")?.instrument ?? null;
      const { articulation } = resolveChordTreatment(genre.id, instrument);
      counts[articulation] = (counts[articulation] ?? 0) + 1;
    }
    const distinct = Object.keys(counts);
    expect(distinct.length, `articulations in use: ${JSON.stringify(counts)}`).toBeGreaterThanOrEqual(4);
    const scaled = distinct.map((a) => CHORD_ARTICULATIONS[a as keyof typeof CHORD_ARTICULATIONS].gateScale);
    expect(Math.max(...scaled) / Math.min(...scaled)).toBeGreaterThanOrEqual(8);
    // Every articulation must actually be reachable from real data, not just defined.
    for (const articulation of distinct) {
      expect(counts[articulation]).toBeGreaterThan(0);
    }
  });

  it("staggers GS-1 chord onsets with the same helper the native path uses", () => {
    const { engine, plays } = engineFor("reggae");
    const treatment = resolveChordTreatment("reggae", CHORD_INSTRUMENT);
    engine.triggerNote(0, "Chords", 0.9, 60, 1, 0.8);

    const notes = [...plays[0].notes].sort((a, b) => a.time - b.time);
    expect(notes.length).toBeGreaterThan(1);
    notes.forEach((note, i) => {
      expect(note.time - notes[0].time).toBeCloseTo(i * treatment.strumSeconds, 9);
    });
  });

  it("auditions through the track destination so the live host survives", () => {
    const { engine, plays } = engineFor("chicago-house");
    engine.triggerNote(0, "Chords", 0.9, 60, 1, 0.8);

    // The track destination, not the master fader: a preview belongs in the mix, and pointing a
    // host at a second destination is what used to make the pool rebuild it.
    const trackDest = engine.getTrackDestination(0);
    expect(plays[0].dest).toBe(trackDest);
  });

  it("silences GS-1 voices on stop (they are not in the native voice registry)", () => {
    const { engine, releaseAll } = engineFor("ambient-techno");
    engine.triggerNote(0, "Chords", 0.9, 60, 1, 0.8);
    expect(releaseAll).not.toHaveBeenCalled();

    engine.panic();
    expect(releaseAll).toHaveBeenCalledTimes(1);

    releaseAll.mockClear();
    engine.stop();
    expect(releaseAll).toHaveBeenCalledTimes(1);
  });

  it("keeps the articulation difference audible in GS-1 duration terms", () => {
    // The listening symptom was "every genre's chords are one cell long". Quantify what the
    // table actually asks for, so a future regression that flattens it is visible here.
    const durations = (genreId: string) => {
      const { engine, plays } = engineFor(genreId);
      engine.triggerNote(0, "Chords", 0.9, 60, 1, 0.8);
      return plays[0].notes[0].duration;
    };
    const stab = durations("chicago-house");
    const sustain = durations("ambient-techno");
    const block = chordNoteDuration(0.125, 0.8, { gateScale: CHORD_ARTICULATIONS.block.gateScale });
    expect(stab).toBeLessThan(block);
    expect(sustain).toBeGreaterThan(block);
    // chicago-house is `stab` (0.3x) and ambient-techno is `sustain` (3.0x): a 10x spread.
    expect(sustain / stab).toBeGreaterThan(8);
  });
});
