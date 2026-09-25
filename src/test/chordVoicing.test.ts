/**
 * E-01 — diatonic chord voicing.
 *
 * The defect: the `chords` track was monophonic, so none of the 159 genres had any
 * harmony (their `common_chords` progression never reached the engine). These tests pin
 * the harmony that the fix produces, because "it plays more notes now" is not the same
 * claim as "it plays the right notes".
 */
import { describe, it, expect, afterEach } from "vitest";
import { chordVoicingForStep, chordVoiceGain, chordNotesForStep, CHORD_STRUM_SEC } from "../audio/chordVoicing";
import { resolveChordTreatment } from "../data/genreVoicing";
import { NOTE_NAMES } from "../utils/scaleTheory";
import { renderPatternOffline } from "../audio/WavExporter";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";
import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";

/** Semitone offsets from the root, which is what "which chord is this" reduces to. */
const offsets = (notes: number[]) => notes.map((n) => n - notes[0]);

describe("chordVoicingForStep — diatonic triads", () => {
  it("builds a minor triad on the tonic of a minor scale", () => {
    // C minor: degrees 1-3-5 = C, Eb, G = 0, 3, 7.
    expect(offsets(chordVoicingForStep(60, "C minor"))).toEqual([0, 3, 7]);
  });

  it("builds a major triad on the tonic of a major scale", () => {
    // C major: C, E, G = 0, 4, 7.
    expect(offsets(chordVoicingForStep(60, "C major"))).toEqual([0, 4, 7]);
  });

  it("harmonises a non-tonic root within the scale, not as a fixed shape", () => {
    // The whole point of harmonising per step: in C minor the note Eb (63) is the b3
    // degree, whose diatonic triad is Eb-G-Bb = 0, 4, 7 (a MAJOR triad) — not another
    // minor triad. A naive "always minor" implementation would fail here.
    const notes = chordVoicingForStep(63, "C minor");
    expect(offsets(notes)).toEqual([0, 4, 7]);
    expect(notes.map((n) => NOTE_NAMES[n % 12])).toEqual(["D#", "G", "A#"]);
  });

  it("produces a diminished triad on the raised 7th degree of a harmonic minor", () => {
    // Not every degree is major or minor; the voicing must follow the scale.
    const notes = chordVoicingForStep(59, "C harmonic minor"); // B natural
    expect(offsets(notes)).toEqual([0, 3, 6]);
  });

  it("always keeps the authored root as the lowest note", () => {
    for (const scale of ["C minor", "E minor", "F major", "D Dorian", "A minor"]) {
      for (const root of [48, 55, 60, 64, 67]) {
        const notes = chordVoicingForStep(root, scale);
        expect(notes[0]).toBe(root);
        expect(Math.min(...notes)).toBe(root);
      }
    }
  });

  it("returns notes in ascending order", () => {
    for (const scale of ["C minor", "C major", "A minor", "F# dorian", "E minor"]) {
      const notes = chordVoicingForStep(60, scale);
      expect(notes).toEqual([...notes].sort((a, b) => a - b));
    }
  });
});

describe("chordVoicingForStep — edges", () => {
  it("returns the root untouched for a non-positive pitch", () => {
    expect(chordVoicingForStep(0, "C minor")).toEqual([0]);
    expect(chordVoicingForStep(-1, "C minor")).toEqual([-1]);
    expect(chordVoicingForStep(NaN, "C minor")).toEqual([NaN]);
  });

  it("falls back to a minor scale when the scale string is missing or unknown", () => {
    expect(offsets(chordVoicingForStep(60, undefined))).toEqual([0, 3, 7]);
    expect(offsets(chordVoicingForStep(60, "C nonsense"))).toEqual([0, 3, 7]);
    expect(offsets(chordVoicingForStep(60, ""))).toEqual([0, 3, 7]);
  });

  it("does not build a semitone cluster for chromatic material", () => {
    // Atonal genres exist in the library; stacking scale degrees on a chromatic scale
    // would produce root, +1, +2. Assert the open fifth instead.
    expect(offsets(chordVoicingForStep(60, "Atonal"))).toEqual([0, 7, 12]);
  });

  it("handles pentatonic scales with an open stack rather than inventing a 3rd", () => {
    const notes = chordVoicingForStep(60, "C minor_pentatonic");
    expect(notes).toHaveLength(3);
    // A pentatonic has no third degree, so the stack must not contain a major/minor 3rd.
    for (const semi of offsets(notes).slice(1)) {
      expect([3, 4]).not.toContain(((semi % 12) + 12) % 12);
    }
  });

  it("honours seventh density by adding a fourth voice", () => {
    const triad = chordVoicingForStep(60, "C minor");
    const seventh = chordVoicingForStep(60, "C minor", { density: "seventh" });
    expect(triad).toHaveLength(3);
    expect(seventh).toHaveLength(4);
    expect(offsets(seventh)).toEqual([0, 3, 7, 10]); // Cm7
    expect(offsets(chordVoicingForStep(60, "C major", { density: "seventh" }))).toEqual([0, 4, 7, 11]); // Cmaj7
  });

  it("keeps the voicing inside the requested span", () => {
    for (const scale of ["C minor", "C major", "C minor_pentatonic", "C blues", "C hirajoshi"]) {
      for (const density of ["triad", "seventh"] as const) {
        const notes = chordVoicingForStep(60, scale, { density, span: 12 });
        for (const n of notes) {
          expect(n - notes[0]).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it("is deterministic and does not mutate its inputs", () => {
    const a = chordVoicingForStep(60, "C minor");
    const b = chordVoicingForStep(60, "C minor");
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // a fresh array, so a caller cannot corrupt a shared list
  });

  it("covers every scale id the genre data actually uses", () => {
    // The library's distinct `scale` strings (from src/data/genres/*.ts).
    const libraryScales = [
      "C minor", "E minor", "F minor", "D minor", "A minor", "G minor",
      "G major", "F major", "C major", "A major", "E major", "D major",
      "D Dorian", "B minor", "B major", "B-flat major", "Atonal",
    ];
    for (const scale of libraryScales) {
      const notes = chordVoicingForStep(60, scale);
      expect(notes.length).toBeGreaterThanOrEqual(3);
      for (const n of notes) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(127);
      }
    }
  });
});

describe("chordVoiceGain", () => {
  it("holds the summed power of a voicing near a single note", () => {
    // n uncorrelated voices at 1/sqrt(n) have the same total power as one voice at 1.
    for (const n of [1, 2, 3, 4, 5]) {
      const totalPower = n * Math.pow(chordVoiceGain(n), 2);
      expect(totalPower).toBeCloseTo(1, 6);
    }
  });

  it("is a no-op for a single voice and safe for degenerate input", () => {
    expect(chordVoiceGain(1)).toBe(1);
    expect(chordVoiceGain(0)).toBe(1);
    expect(chordVoiceGain(-1)).toBe(1);
    expect(chordVoiceGain(NaN)).toBe(1);
  });

  it("attenuates each voice of a real triad by about -4.8 dB of power", () => {
    expect(chordVoiceGain(3)).toBeCloseTo(0.5774, 4);
  });
});

/**
 * The onset stagger. Amplitude scaling alone left the three voices starting perfectly
 * coherent, so their peaks summed into the master limiter and measurably lowered the
 * whole library (mean -1.18 dB across 159 genres on a full re-measure — `wave` -4.0,
 * `bebop` -3.1). These pin the constant and that it is actually applied.
 */
describe("CHORD_STRUM_SEC", () => {
  it("is a few milliseconds: enough to decorrelate, too short to hear as an arpeggio", () => {
    expect(CHORD_STRUM_SEC).toBeGreaterThan(0);
    expect(CHORD_STRUM_SEC).toBeLessThanOrEqual(0.01);
  });

  it("spreads a triad over less than a 32nd note at 200 BPM", () => {
    const thirtySecondSec = 60 / 200 / 8;
    expect(2 * CHORD_STRUM_SEC).toBeLessThan(thirtySecondSec);
  });
});

describe("E-01 · chord voices are actually staggered in the render", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("schedules each chord tone at a distinct onset", async () => {
    restore = installFakeOfflineAudioContext();
    const steps = 4;
    const pattern = {
      genre_id: "voicing-integration",
      bpm: 120,
      swing: 0,
      scale: "C minor",
      totalSteps: steps,
      tracks: [
        {
          track_id: "chords",
          name: "Chords",
          instrument: "warm_pad",
          steps: [1, 0, 0, 0],
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

    await renderPatternOffline(pattern);
    const ctx = FakeOfflineAudioContext.lastInstance!;
    // Each voice is two oscillators, so the voices start at distinct times. The spacing
    // is the genre's articulation, not a fixed constant: an unknown genre with a pad on
    // the chords track resolves to `sustain`, which rolls slightly more than a block.
    const treatment = resolveChordTreatment("voicing-integration", "warm_pad");
    const expectedGap = treatment.strumSeconds;
    const onsets = [...new Set(ctx.createdOscillators.map((o) => o.startedAt[0]))].sort(
      (a, b) => a - b
    );
    expect(onsets).toHaveLength(3);
    expect(onsets[1] - onsets[0]).toBeCloseTo(expectedGap, 6);
    expect(onsets[2] - onsets[1]).toBeCloseTo(expectedGap, 6);
  });
});

/**
 * Stored chords (the "chords track shows one note in the roll" fix).
 *
 * A genre's chords are expanded **into the pattern** (`track.pitches`) so the piano roll shows and
 * edits real notes and the renderers play them verbatim. The rule that makes that safe is that a
 * stored stack *wins* over automatic voicing — otherwise the harmony is voiced twice and the roll
 * disagrees with what is heard. Both renderers consult this one function, which is what keeps
 * live/export parity from depending on remembering to change two places.
 */
describe("chordNotesForStep · a stored chord is played verbatim", () => {
  it("returns the stored stack, sorted low→high, when the step has one", () => {
    const track = { pitch: [60, null], pitches: [[67, 60, 64], null] };
    expect(chordNotesForStep(track, 0, 60, "C minor")).toEqual([60, 64, 67]);
  });

  it("falls back to voicing the root when the step has no stack", () => {
    const track = { pitch: [60, null] };
    const voiced = chordNotesForStep(track, 0, 60, "C minor");
    expect(voiced.length).toBeGreaterThan(1); // a triad, not the bare root
    expect(voiced[0]).toBe(60);
  });

  it("falls back for an empty stack, so a half-written pattern cannot go silent", () => {
    const track = { pitch: [60], pitches: [[]] as number[][] };
    expect(chordNotesForStep(track, 0, 60, "C minor").length).toBeGreaterThan(1);
  });

  it("does not hand out the pattern's own array (callers must not mutate the track)", () => {
    const stored = [60, 64, 67];
    const track = { pitch: [60], pitches: [stored] };
    const notes = chordNotesForStep(track, 0, 60, "C minor");
    notes.push(72);
    expect(stored).toEqual([60, 64, 67]);
  });

  it("ignores non-finite entries rather than playing NaN", () => {
    const track = { pitch: [60], pitches: [[60, Number.NaN, 67]] as number[][] };
    expect(chordNotesForStep(track, 0, 60, "C minor")).toEqual([60, 67]);
  });

  it("drops a stack that is entirely invalid, falling back to the root's voicing", () => {
    const track = { pitch: [60], pitches: [[Number.NaN, Number.POSITIVE_INFINITY]] as number[][] };
    // `chordNotesForStep` returns the stored array only when it holds something finite; a stack of
    // only garbage must not silence the step.
    expect(chordNotesForStep(track, 0, 60, "C minor").length).toBeGreaterThan(1);
  });
});


/**
 * The offline GS-1 capability probe renders a throwaway context of its own; these cases inspect the *app's* render
 * (hosts, strips, buffers) and would otherwise find the probe's instead. Declared satisfied at module scope here; the
 * probe has its own file, and `probe_engine_parity.mjs` is its acceptance test.
 */
setGs1OfflineCapability("usable");
