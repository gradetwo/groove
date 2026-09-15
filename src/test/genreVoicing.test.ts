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
import { describe, it, expect } from "vitest";
import {
  VOICING_STYLES,
  chordVoicingForStep,
  resolveVoicingStyle as resolveStyleFromOptions,
  type VoicingStyle,
} from "../audio/chordVoicing";
import {
  CATEGORY_VOICING,
  DEFAULT_VOICING_STYLE,
  GENRE_VOICING,
  resolveVoicingStyle,
  voicedGenreIds,
} from "../data/genreVoicing";
import { GENRE_INDEX } from "../data/index/loader";

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
