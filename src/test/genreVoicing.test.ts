/**
 * Genre-appropriate chord voicing (E-01 follow-up).
 *
 * The complaint this answers: a generic diatonic 1-3-5 is wrong for most of the library.
 * Rock and metal want power chords (root + fifth, **no third**), jazz wants 7ths/9ths and
 * quartal stacks, blues wants dominant 7ths, ambient wants a thirdless wash.
 *
 * These tests are written as *musical* claims, not implementation mirrors — "a power
 * chord has no third, on every scale degree" is the kind of assertion that fails loudly
 * if someone later "simplifies" the style table back into one triad path.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  VOICING_STYLES,
  CHORD_ARTICULATIONS,
  CHORD_STRUM_SEC,
  DEFAULT_CHORD_ARTICULATION,
  chordNoteDuration,
  chordVoicingForStep,
  resolveVoicingStyle as resolveStyleFromOptions,
  type ChordArticulation,
  type VoicingStyle,
} from "../audio/chordVoicing";
import {
  CATEGORY_ARTICULATION,
  CATEGORY_VOICING,
  DEFAULT_VOICING_STYLE,
  GENRE_ARTICULATION,
  GENRE_VOICING,
  resolveChordArticulation,
  resolveChordTreatment,
  resolveVoicingStyle,
  voicedGenreIds,
} from "../data/genreVoicing";
import { GENRE_INDEX } from "../data/index/loader";
import { ALL_GENRES } from "../data/genres";
import { DEFAULT_SYNTH_PRESETS } from "../audio/PolySynth";
import { resolveInstrumentPreset } from "../audio/instrumentPresets";
import { renderPatternOffline } from "../audio/WavExporter";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";
import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";

/** Semitone offsets from the root: what "which chord is this" actually reduces to. */
const offsets = (notes: number[]) => notes.map((n) => n - notes[0]);
/** Pitch class of an offset, 0-11. */
const pc = (semi: number) => ((semi % 12) + 12) % 12;

const ALL_STYLES = Object.keys(VOICING_STYLES) as VoicingStyle[];

describe("style table is internally sound", () => {
  it("every style starts on the root", () => {
    for (const style of ALL_STYLES) {
      expect(VOICING_STYLES[style].steps[0]).toBe(0);
    }
  });

  it("every style has at least two notes and a documented reason", () => {
    for (const style of ALL_STYLES) {
      expect(VOICING_STYLES[style].steps.length).toBeGreaterThanOrEqual(2);
      expect(VOICING_STYLES[style].note.length).toBeGreaterThan(20);
    }
  });

  it("produces a root-anchored, ascending voicing for every style and scale degree", () => {
    for (const style of ALL_STYLES) {
      for (const root of [48, 55, 60, 63, 67]) {
        const notes = chordVoicingForStep(root, "C minor", { style });
        expect(notes[0], `${style} @ ${root}`).toBe(root);
        expect(notes).toEqual([...notes].sort((a, b) => a - b));
      }
    }
  });
});

describe("power — the rock/metal voice", () => {
  it("has no third: root, perfect fifth, octave", () => {
    expect(offsets(chordVoicingForStep(60, "C minor", { style: "power" }))).toEqual([0, 7, 12]);
  });

  it("contains no major or minor third, whichever scale degree it is built on", () => {
    // This is the whole point of an interval-based power chord: the fifth stays perfect
    // even on degrees where a diatonic stack would give a diminished fifth.
    for (const root of [60, 62, 63, 65, 67, 68, 70]) {
      const semis = offsets(chordVoicingForStep(root, "C minor", { style: "power" })).slice(1);
      for (const semi of semis) {
        expect([3, 4], `third found in power chord on root ${root}`).not.toContain(pc(semi));
      }
    }
  });

  it("is key-independent (a fifth is a fifth in a major scale too)", () => {
    expect(offsets(chordVoicingForStep(60, "C major", { style: "power" }))).toEqual([0, 7, 12]);
  });
});

describe("jazz voices", () => {
  it("shell keeps the guide tones and drops the fifth", () => {
    const notes = chordVoicingForStep(60, "C minor", { style: "shell" });
    // C, Eb, Bb — root, minor 3rd, minor 7th. The fifth (G) is deliberately absent so the
    // midrange stays clear for a soloist.
    expect(offsets(notes)).toEqual([0, 3, 10]);
    expect(offsets(notes).map(pc)).not.toContain(7);
    expect(notes).toHaveLength(3);
  });

  it("extended adds a 9th without crowding (no fifth)", () => {
    const offsetsForRoot = offsets(chordVoicingForStep(60, "C minor", { style: "extended" }));
    expect(offsetsForRoot).toEqual([0, 3, 10, 14]); // C, Eb, Bb, D(9th)
    expect(offsetsForRoot.map(pc)).not.toContain(7); // no perfect fifth
  });

  it("quartal stacks fourths rather than thirds", () => {
    const semis = offsets(chordVoicingForStep(60, "C minor", { style: "quartal" })).slice(1);
    // C minor: C, F, Bb -> 0, 5, 10: successive gaps of a fourth each.
    expect(semis).toEqual([5, 10]);
    for (const semi of semis) {
      expect([3, 4], "quartal stack must not contain a third").not.toContain(pc(semi));
    }
  });

  it("seventh is a plain diatonic 1-3-5-7", () => {
    expect(offsets(chordVoicingForStep(60, "C minor", { style: "seventh" }))).toEqual([0, 3, 7, 10]);
    expect(offsets(chordVoicingForStep(60, "C major", { style: "seventh" }))).toEqual([0, 4, 7, 11]);
  });
});

describe("ambient / pop voices", () => {
  it("sus has no third", () => {
    const semis = offsets(chordVoicingForStep(60, "C minor", { style: "sus" })).slice(1);
    for (const semi of semis) expect([3, 4]).not.toContain(pc(semi));
    expect(offsets(chordVoicingForStep(60, "C minor", { style: "sus" }))).toEqual([0, 5, 7]);
  });

  it("open is wide and thirdless", () => {
    const off = offsets(chordVoicingForStep(60, "C minor", { style: "open" }));
    expect(off).toEqual([0, 7, 12, 19]);
    for (const semi of off) expect([3, 4]).not.toContain(pc(semi));
  });

  it("add9 includes the 9th and still has the 3rd", () => {
    const off = offsets(chordVoicingForStep(60, "C minor", { style: "add9" }));
    expect(off.map(pc)).toContain(2); // the 9th (D)
    expect(off.map(pc)).toContain(3); // the minor 3rd (Eb)
  });
});

describe("legacy density option still works", () => {
  it("density 'triad' maps to the triad style", () => {
    expect(resolveStyleFromOptions({ density: "triad" })).toBe("triad");
    expect(chordVoicingForStep(60, "C minor", { density: "triad" })).toEqual(
      chordVoicingForStep(60, "C minor", { style: "triad" })
    );
  });

  it("density 'seventh' maps to the seventh style", () => {
    expect(resolveStyleFromOptions({ density: "seventh" })).toBe("seventh");
    expect(chordVoicingForStep(60, "C minor", { density: "seventh" })).toEqual(
      chordVoicingForStep(60, "C minor", { style: "seventh" })
    );
  });

  it("an explicit style wins over density", () => {
    expect(resolveStyleFromOptions({ density: "seventh", style: "power" })).toBe("power");
  });

  it("defaults to a triad when nothing is specified", () => {
    expect(resolveStyleFromOptions()).toBe("triad");
  });
});

describe("genre → style resolution", () => {
  it("picks the genre-appropriate voice for the cases the user named", () => {
    // The user's examples, asserted directly.
    expect(resolveVoicingStyle("death-metal")).toBe("power");
    expect(resolveVoicingStyle("heavy-metal")).toBe("power");
    expect(resolveVoicingStyle("bebop")).toBe("extended");
    expect(resolveVoicingStyle("hard-bop")).toBe("extended");
    expect(resolveVoicingStyle("modal-jazz")).toBe("quartal");
    expect(resolveVoicingStyle("delta-blues")).toBe("seventh");
  });

  it("varies jazz more than rock, rather than reusing one shape", () => {
    const jazz = ["traditional-jazz", "bebop", "cool-jazz", "modal-jazz", "smooth-jazz", "bossa-nova"]
      .map((id) => resolveVoicingStyle(id));
    expect(new Set(jazz).size).toBeGreaterThan(1);
  });

  it("falls back to the category default for a genre with no override", () => {
    // Every genre in the index must resolve to *something* sensible.
    for (const genre of GENRE_INDEX as Array<{ id: string; category: string }>) {
      const style = resolveVoicingStyle(genre.id);
      expect(ALL_STYLES, `${genre.id} resolved to unknown style ${style}`).toContain(style);
    }
  });

  it("uses the instrument for a custom genre with no table entry", () => {
    expect(resolveVoicingStyle("user-custom-xyz", "guitar_lead")).toBe("power");
    expect(resolveVoicingStyle("user-custom-xyz", "rhodes_ep")).toBe("seventh");
    expect(resolveVoicingStyle("user-custom-xyz", "warm_pad")).toBe("triad");
  });

  it("never lets the instrument heuristic override a curated genre", () => {
    // bebop is curated to `extended`; its chords track may well be a guitar.
    expect(resolveVoicingStyle("bebop", "guitar_lead")).toBe("extended");
  });

  it("returns the documented fallback for unknown input", () => {
    expect(resolveVoicingStyle(null)).toBe(DEFAULT_VOICING_STYLE);
    expect(resolveVoicingStyle(undefined, null)).toBe(DEFAULT_VOICING_STYLE);
    expect(resolveVoicingStyle("nope", "unknown_instrument")).toBe(DEFAULT_VOICING_STYLE);
  });
});

describe("table integrity (guards against typos and drift)", () => {
  const indexIds = new Set((GENRE_INDEX as Array<{ id: string }>).map((g) => g.id));

  it("every override names a genre that actually exists", () => {
    for (const id of voicedGenreIds()) {
      expect(indexIds, `GENRE_VOICING has '${id}' but the library has no such genre`).toContain(id);
    }
  });

  it("every override uses a known style and carries a non-trivial reason", () => {
    for (const [id, override] of Object.entries(GENRE_VOICING)) {
      expect(ALL_STYLES, `${id} uses unknown style`).toContain(override.style);
      expect(override.reason.length, `${id} needs a real reason`).toBeGreaterThan(15);
    }
  });

  it("every category has a default", () => {
    const categories = new Set((GENRE_INDEX as Array<{ category: string }>).map((g) => g.category));
    for (const category of categories) {
      expect(CATEGORY_VOICING[category as keyof typeof CATEGORY_VOICING], `no default for ${category}`).toBeTruthy();
    }
  });

  it("actually distinguishes genres — not one shape for the whole library", () => {
    // The regression this exists to prevent: collapsing back to "everything is a triad".
    const styles = new Set(
      (GENRE_INDEX as Array<{ id: string }>).map((g) => resolveVoicingStyle(g.id))
    );
    expect(styles.size).toBeGreaterThanOrEqual(5);
  });

  it("does not give the rock/metal category a third-based default", () => {
    // A power-chord category must not silently become triads again.
    expect(CATEGORY_VOICING["Rock/Metal"]).toBe("power");
    const rockStyles = new Set(
      (GENRE_INDEX as Array<{ id: string; category: string }>)
        .filter((g) => g.category === "Rock/Metal")
        .map((g) => resolveVoicingStyle(g.id))
    );
    expect(rockStyles.has("power")).toBe(true);
  });
});

/**
 * End-to-end parity: what the offline renderer actually plays for a genre.
 *
 * The unit tests above prove the style table is right; these prove the table is
 * *reached* — that a death-metal pattern really renders a power chord and a bebop
 * pattern really renders a 7th/9th, in the exported audio, not just in a pure function.
 *
 * This is also the exporter-parity guard: `AudioEngine.playChord` and `WavExporter`
 * resolve the style independently (they have to — one is realtime, one offline), so
 * nothing but a test stops the two from drifting apart.
 */
describe("rendered output matches the genre's voicing", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  /** Reads the notes a chord track actually rendered, from oscillator frequencies. */
  async function renderedChordNotes(genreId: string, instrument: string, scale = "C minor") {
    restore?.();
    restore = installFakeOfflineAudioContext();
    const steps = 4;
    const pattern = {
      genre_id: genreId,
      bpm: 120,
      swing: 0,
      scale,
      totalSteps: steps,
      tracks: [
        {
          track_id: "chords",
          name: "Chords",
          instrument,
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
    const midis = ctx.createdOscillators
      .map((o) => o.frequency.events[0]?.value)
      .filter((hz): hz is number => typeof hz === "number" && hz > 0)
      .map((hz) => Math.round(69 + 12 * Math.log2(hz / 440)));
    // Each voice is two oscillators at the same base frequency, so dedupe.
    return [...new Set(midis)].sort((a, b) => a - b).map((m) => m - Math.min(...midis));
  }

  it("renders a thirdless power chord for a metal genre", async () => {
    const offsetsForMetal = await renderedChordNotes("death-metal", "guitar_lead");
    expect(offsetsForMetal).toEqual([0, 7, 12]);
    for (const semi of offsetsForMetal) {
      expect([3, 4], "a third reached the metal chord").not.toContain(pc(semi));
    }
  });

  it("renders jazz extensions rather than a bare triad for bebop", async () => {
    const offsetsForBebop = await renderedChordNotes("bebop", "piano_lead");
    expect(offsetsForBebop).toHaveLength(4);
    // C minor extended = C, Eb, Bb, D(9th) -> 0, 3, 10, 14.
    expect(offsetsForBebop).toEqual([0, 3, 10, 14]);
  });

  it("renders a thirdless suspended voicing for ambient", async () => {
    const off = await renderedChordNotes("ambient", "warm_pad");
    for (const semi of off) expect([3, 4]).not.toContain(pc(semi));
  });

  it("differs between a rock and a jazz genre on the same root and scale", async () => {
    const rock = await renderedChordNotes("death-metal", "guitar_lead");
    const jazz = await renderedChordNotes("bebop", "piano_lead");
    expect(rock).not.toEqual(jazz);
  });

  it("matches what the shared resolver says the genre should play", async () => {
    // The single source of truth for both engines.
    for (const [genreId, instrument] of [
      ["heavy-metal", "guitar_lead"],
      ["bebop", "piano_lead"],
      ["modal-jazz", "piano_lead"],
      ["deep-house", "rhodes_ep"],
      ["city-pop", "rhodes_ep"],
    ] as const) {
      const expected = offsets(chordVoicingForStep(60, "C minor", { style: resolveVoicingStyle(genreId, instrument) }));
      expect(await renderedChordNotes(genreId, instrument), genreId).toEqual(expected);
    }
  });
});

/**
 * Articulation — how the chord is played, not which notes it contains.
 *
 * The user's follow-up: chords need genre-typical *fingering* (连音/柱式) and *note
 * length* (音长), not just genre-typical notes. Before this, every genre got the same
 * answer: all notes `stepDur · gate · 1.5` long with a flat 3 ms stagger — so a reggae
 * skank rang like a pad and a funk stab smeared.
 *
 * The claims below are musical, so they are stated as such: a stab must be *shorter*
 * than a sustain, a strum must be *rolled*, and a guitar must not comp like a pad.
 */
describe("articulation table", () => {
  const ALL_ARTICULATIONS = Object.keys(CHORD_ARTICULATIONS) as ChordArticulation[];

  it("orders the articulations by length the way the music does", () => {
    const g = (a: ChordArticulation) => CHORD_ARTICULATIONS[a].gateScale;
    // A stab is the shortest thing here; a sustain is the longest.
    expect(g("stab")).toBeLessThan(g("comp"));
    expect(g("comp")).toBeLessThan(g("strum"));
    expect(g("strum")).toBeLessThan(g("block"));
    expect(g("block")).toBeLessThan(g("sustain"));
  });

  it("makes block the historical behaviour, so the default is not a surprise", () => {
    expect(CHORD_ARTICULATIONS.block.gateScale).toBe(1);
    expect(CHORD_ARTICULATIONS.block.strumSeconds).toBe(CHORD_STRUM_SEC);
  });

  it("rolls a strum and a roll, and keeps a stab tight", () => {
    expect(CHORD_ARTICULATIONS.strum.strumSeconds).toBeGreaterThan(CHORD_ARTICULATIONS.block.strumSeconds);
    expect(CHORD_ARTICULATIONS.roll.strumSeconds).toBeGreaterThan(CHORD_ARTICULATIONS.strum.strumSeconds);
    expect(CHORD_ARTICULATIONS.stab.strumSeconds).toBeLessThan(CHORD_ARTICULATIONS.block.strumSeconds);
  });

  it("documents every articulation", () => {
    for (const a of ALL_ARTICULATIONS) {
      expect(CHORD_ARTICULATIONS[a].note.length, a).toBeGreaterThan(30);
      expect(CHORD_ARTICULATIONS[a].gateScale).toBeGreaterThan(0);
      expect(CHORD_ARTICULATIONS[a].strumSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps a whole step's stab from overrunning the next step at sane tempos", () => {
    // A gateScale of 0.3 on a 16th at 200 BPM is ~45 ms — it must not bleed past the
    // step, or the articulation stops reading as "short" at all.
    const stepDur = 60 / 200 / 4;
    const dur = chordNoteDuration(stepDur, 0.8, CHORD_ARTICULATIONS.stab);
    expect(dur).toBeLessThan(stepDur);
  });

  it("lets a pad outlast its own step, which is what makes it a pad", () => {
    const stepDur = 60 / 120 / 4;
    const dur = chordNoteDuration(stepDur, 0.8, CHORD_ARTICULATIONS.sustain);
    expect(dur).toBeGreaterThan(stepDur * 2);
  });
});

describe("genre → articulation resolution", () => {
  it("gives rhythmic genres short chords and textural genres long ones", () => {
    // The centre of the user's point, asserted directly.
    for (const id of ["funk", "reggae", "salsa", "detroit-techno", "heavy-metal", "thrash-metal"]) {
      const articulation = resolveChordArticulation(id);
      expect(CHORD_ARTICULATIONS[articulation].gateScale, id).toBeLessThanOrEqual(0.6);
    }
    for (const id of ["ambient", "uplifting-trance", "shoe-gaze", "doom-metal", "black-metal"]) {
      const articulation = resolveChordArticulation(id);
      expect(CHORD_ARTICULATIONS[articulation].gateScale, id).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("strums the guitar genres and comps the jazz genres", () => {
    expect(resolveChordArticulation("rock-and-roll")).toBe("strum");
    expect(resolveChordArticulation("bebop")).toBe("comp");
    expect(resolveChordArticulation("gypsy-jazz")).toBe("comp");
  });

  it("does not give the whole library one articulation", () => {
    const used = new Set(
      (GENRE_INDEX as Array<{ id: string }>).map((g) => resolveChordArticulation(g.id))
    );
    expect(used.size).toBeGreaterThanOrEqual(4);
  });

  it("uses the instrument for a custom genre, never overriding curation", () => {
    expect(resolveChordArticulation("custom-xyz", "guitar_lead")).toBe("strum");
    expect(resolveChordArticulation("custom-xyz", "warm_pad")).toBe("sustain");
    expect(resolveChordArticulation("custom-xyz", "rhodes_ep")).toBe("block");
    // bebop is curated to comp; a guitar on its chords track must not turn it into a strum.
    expect(resolveChordArticulation("bebop", "guitar_lead")).toBe("comp");
  });

  it("returns the documented default for unknown input", () => {
    expect(resolveChordArticulation(null)).toBe(DEFAULT_CHORD_ARTICULATION);
    expect(resolveChordArticulation("nope", "unknown")).toBe(DEFAULT_CHORD_ARTICULATION);
  });

  it("resolves a complete treatment from one call", () => {
    const treatment = resolveChordTreatment("death-metal", "guitar_lead");
    expect(treatment.style).toBe("power");
    expect(treatment.articulation).toBe("stab");
    expect(treatment.gateScale).toBe(CHORD_ARTICULATIONS.stab.gateScale);
    expect(treatment.strumSeconds).toBe(CHORD_ARTICULATIONS.stab.strumSeconds);
  });

  it("covers every genre in the index with a known articulation", () => {
    const known = new Set(Object.keys(CHORD_ARTICULATIONS));
    for (const g of GENRE_INDEX as Array<{ id: string }>) {
      expect(known, g.id).toContain(resolveChordArticulation(g.id));
    }
  });
});

describe("articulation table integrity", () => {
  const indexIds = new Set((GENRE_INDEX as Array<{ id: string }>).map((g) => g.id));
  const known = new Set(Object.keys(CHORD_ARTICULATIONS));

  it("every articulation override names a genre that exists", () => {
    for (const id of Object.keys(GENRE_ARTICULATION)) {
      expect(indexIds, `GENRE_ARTICULATION has '${id}' but the library has no such genre`).toContain(id);
    }
  });

  it("every override uses a known articulation and a real reason", () => {
    for (const [id, override] of Object.entries(GENRE_ARTICULATION)) {
      expect(known, `${id} uses unknown articulation`).toContain(override.articulation);
      expect(override.reason.length, `${id} needs a real reason`).toBeGreaterThan(15);
    }
  });

  it("every category has an articulation default", () => {
    const categories = new Set((GENRE_INDEX as Array<{ category: string }>).map((g) => g.category));
    for (const category of categories) {
      expect(
        CATEGORY_ARTICULATION[category as keyof typeof CATEGORY_ARTICULATION],
        `no articulation default for ${category}`
      ).toBeTruthy();
    }
  });
});

describe("rendered note length and onsets follow the genre", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  /** Renders one chord step and reports the note length and onset spread actually used. */
  async function renderedChordTiming(genreId: string, instrument: string) {
    restore?.();
    restore = installFakeOfflineAudioContext();
    const steps = 4;
    const pattern = {
      genre_id: genreId,
      bpm: 120,
      swing: 0,
      scale: "C minor",
      totalSteps: steps,
      tracks: [
        {
          track_id: "chords",
          name: "Chords",
          instrument,
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
    const onsets = ctx.createdOscillators.map((o) => o.startedAt[0]).filter((t): t is number => typeof t === "number");
    const stops = ctx.createdOscillators.map((o) => o.stoppedAt[0]).filter((t): t is number => typeof t === "number");
    expect(onsets.length).toBeGreaterThan(0);
    expect(stops.length).toBeGreaterThan(0);
    const firstOnset = Math.min(...onsets);
    const lastOnset = Math.max(...onsets);
    const lastStop = Math.max(...stops);
    return { onsetSpread: lastOnset - firstOnset, audibleLength: lastStop - firstOnset };
  }

  it("isolates articulation by holding the instrument constant", async () => {
    // Comparing a metal guitar against an ambient pad mixes two variables: the
    // articulation *and* the preset's own amp release, which is what makes the raw
    // ratio smaller than the gateScale ratio alone would suggest. Holding the
    // instrument fixed leaves the articulation as the only difference.
    const block = await renderedChordTiming("deep-house", "rhodes_ep"); // block
    const sustain = await renderedChordTiming("trip-hop", "rhodes_ep"); // sustain
    const blockOrgan = await renderedChordTiming("progressive-rock", "m1_organ"); // block
    const stabbed = await renderedChordTiming("chicago-house", "m1_organ"); // stab

    expect(sustain.audibleLength).toBeGreaterThan(block.audibleLength);
    expect(blockOrgan.audibleLength).toBeGreaterThan(stabbed.audibleLength);
  });

  it("makes a metal stab far shorter than an ambient pad", async () => {
    const metal = await renderedChordTiming("death-metal", "guitar_lead");
    const ambient = await renderedChordTiming("ambient", "warm_pad");
    // Different instruments, so the presets' amp releases blur the ratio (hence the
    // modest threshold); the instrument-matched comparison above is the sharp assertion.
    expect(ambient.audibleLength / metal.audibleLength).toBeGreaterThan(2.5);
  });

  it("rolls a strummed guitar chord but not a block-chord pad", async () => {
    const strummed = await renderedChordTiming("rock-and-roll", "guitar_lead");
    const block = await renderedChordTiming("city-pop", "rhodes_ep");
    expect(strummed.onsetSpread).toBeGreaterThan(block.onsetSpread);
    expect(strummed.onsetSpread).toBeGreaterThan(0.01);
  });

  it("matches the resolver for every articulation-bearing genre it renders", async () => {
    for (const [genreId, instrument] of [
      ["funk", "rhodes_ep"],
      ["reggae", "m1_organ"],
      ["bebop", "piano_lead"],
      ["shoe-gaze", "guitar_lead"],
    ] as const) {
      const treatment = resolveChordTreatment(genreId, instrument);
      const timing = await renderedChordTiming(genreId, instrument);
      // Voices are onset-staggered by exactly the articulation's strum, so the spread
      // across a 3-4 note voicing is (n-1) × strumSeconds.
      const notes = chordVoicingForStep(60, "C minor", { style: treatment.style });
      expect(timing.onsetSpread, genreId).toBeCloseTo(
        (notes.length - 1) * treatment.strumSeconds,
        6
      );
    }
  });
});

/**
 * The chord *instrument* per genre, and that the new rhythm-guitar voice really is a
 * different instrument rather than a renamed lead.
 *
 * The N-12 curation already documented a specific amplifier per metal genre — "HM-2
 * Buzzsaw Guitar", "High-Gain 5150 Guitar", "Scooped-Mid High-Gain Guitar" — while every
 * one of those tracks played the same generic `guitar_lead`. These tests close that gap
 * and pin the audible difference, so "distorted" cannot degrade into a label.
 */
describe("chord instrument per genre", () => {
  const chordInstrumentOf = (genreId: string): string => {
    const genre = (ALL_GENRES as Array<{ id: string; sequencer_pattern: { tracks: Array<{ track_id: string; instrument: string }> } }>)
      .find((g) => g.id === genreId);
    if (!genre) throw new Error(`unknown genre ${genreId}`);
    const chords = genre.sequencer_pattern.tracks.find((t) => t.track_id === "chords");
    if (!chords) throw new Error(`${genreId} has no chords track`);
    return chords.instrument;
  };

  it("gives the high-gain genres a distorted rhythm guitar", () => {
    for (const id of ["hard-rock", "punk-rock", "heavy-metal", "thrash-metal", "death-metal", "black-metal", "doom-metal", "metalcore", "grunge"]) {
      expect(chordInstrumentOf(id), id).toBe("distorted_guitar");
    }
  });

  it("leaves the non-high-gain guitar genres on the lead guitar", () => {
    // The change must be targeted: these are guitar genres whose chords are not chugged.
    for (const id of ["rock-and-roll", "blues-rock", "post-punk", "alternative-rock", "math-rock", "shoe-gaze"]) {
      expect(chordInstrumentOf(id), id).toBe("guitar_lead");
    }
  });

  it("did not sweep up the rock genres that were never on a guitar", () => {
    // `new-wave` comps on a pad and `progressive-rock` on an organ — both predate this
    // change and neither is a high-gain chord genre, so the targeted edit must not have
    // touched them. (My first version of this test assumed they were guitars; the data
    // said otherwise.)
    expect(chordInstrumentOf("new-wave")).not.toBe("distorted_guitar");
    expect(chordInstrumentOf("progressive-rock")).not.toBe("distorted_guitar");
  });

  it("maps the new instrument to a preset rather than the global default", () => {
    const preset = resolveInstrumentPreset("distorted_guitar", "chords");
    expect(preset).toBe(DEFAULT_SYNTH_PRESETS.distortedGuitar);
    expect(preset).not.toBe(DEFAULT_SYNTH_PRESETS.guitarLead);
  });

  it("makes the distorted voice measurably heavier, not just relabelled", () => {
    const lead = DEFAULT_SYNTH_PRESETS.guitarLead;
    const distorted = DEFAULT_SYNTH_PRESETS.distortedGuitar;
    // Darker: a power chord lives in the low-mids, so the cutoff must sit well below the
    // lead's — this is what stops a distorted chord fizzing.
    expect(distorted.filterCutoff).toBeLessThan(lead.filterCutoff);
    // More aggressive: the resonant midrange honk that makes it cut.
    expect(distorted.filterQ).toBeGreaterThan(lead.filterQ);
    // Thicker: two saws rather than saw+triangle, at a much higher second-oscillator mix.
    expect(distorted.osc2Mix).toBeGreaterThan(lead.osc2Mix);
    // Tighter: palm mutes need a fast decay and a short release.
    expect(distorted.adsr.attack).toBeLessThanOrEqual(lead.adsr.attack);
    expect(distorted.adsr.release).toBeLessThan(lead.adsr.release);
  });

  it("resolves a complete treatment for a metal genre end to end", () => {
    const treatment = resolveChordTreatment("death-metal", chordInstrumentOf("death-metal"));
    // Thirdless power chord, struck short, with the high-gain rhythm voice.
    expect(treatment.style).toBe("power");
    expect(treatment.articulation).toBe("stab");
    expect(resolveInstrumentPreset(chordInstrumentOf("death-metal"), "chords")).toBe(
      DEFAULT_SYNTH_PRESETS.distortedGuitar
    );
  });
});


/**
 * The offline GS-1 capability probe renders a throwaway context of its own; these cases inspect the *app's* render
 * (hosts, strips, buffers) and would otherwise find the probe's instead. Declared satisfied at module scope here; the
 * probe has its own file, and `probe_engine_parity.mjs` is its acceptance test.
 */
setGs1OfflineCapability("usable");
