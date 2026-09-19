/**
 * `common_chords` must actually describe each genre's harmony.
 *
 * The defect this guards against: all 159 genres shipped the *same* two progressions
 * (`i–VI–III–VII`, `i–v–VI–VII`), so the dossier's harmony panel said the same wrong thing
 * about bebop, salsa, K-pop and black metal alike. Only one distinct value-set existed in
 * the whole database, and this test fails if that ever happens again.
 *
 * These are display strings — the audio engine derives its voicings from the genre's scale
 * (see `src/audio/chordVoicing.ts`), so nothing here is a claim about what is rendered.
 */
import { describe, it, expect } from "vitest";
import { ALL_GENRES } from "../data/genres";

/** `i`, `VI`, `♭VII` … joined by an en dash. */
const ROMAN_TOKEN = /^♭?(?:[ivIV]+|N)$/;
const PROGRESSION = /^♭?[ivIV]+(?:–♭?[ivIV]+)*$/;

/** How many genres may legitimately share one progression set before it is a templated default. */
const MAX_SHARED = 10;

describe("common_chords describe the genre (content-quality guard)", () => {
  it("gives every genre a non-empty progression list", () => {
    const empty = ALL_GENRES.filter((g) => !g.common_chords || g.common_chords.length === 0);
    expect(empty.map((g) => g.id)).toEqual([]);
  });

  it("gives every genre two or three progressions", () => {
    const wrong = ALL_GENRES.filter(
      (g) => g.common_chords.length < 2 || g.common_chords.length > 3
    ).map((g) => `${g.id}: ${g.common_chords.length}`);
    expect(wrong).toEqual([]);
  });

  it("writes every progression in roman numerals only", () => {
    const bad: string[] = [];
    for (const genre of ALL_GENRES) {
      for (const prog of genre.common_chords) {
        if (typeof prog !== "string") {
          bad.push(`${genre.id}: not a string`);
          continue;
        }
        if (!PROGRESSION.test(prog)) bad.push(`${genre.id}: ${prog}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("never repeats a progression inside one genre's list", () => {
    const dupes = ALL_GENRES.filter(
      (g) => new Set(g.common_chords).size !== g.common_chords.length
    ).map((g) => g.id);
    expect(dupes).toEqual([]);
  });

  it("does not fall back to one shared default for the whole library", () => {
    const counts = new Map<string, { count: number; ids: string[] }>();
    for (const genre of ALL_GENRES) {
      const key = genre.common_chords.join("|");
      const entry = counts.get(key) ?? { count: 0, ids: [] };
      entry.count += 1;
      entry.ids.push(genre.id);
      counts.set(key, entry);
    }
    // The old database had exactly one set shared by all 159 genres.
    expect(counts.size).toBeGreaterThan(40);
    const oversized = [...counts.values()].filter((e) => e.count > MAX_SHARED);
    expect(
      oversized.map((e) => `${e.count}x ${e.ids[0]}: ${e.ids.slice(0, 4).join(", ")}`)
    ).toEqual([]);
  });

  it("keeps the idiom-specific sets that the old default got wrong", () => {
    const byId = new Map(ALL_GENRES.map((g) => [g.id, g]));
    const of = (id: string) => byId.get(id)?.common_chords ?? [];

    // A ii–V–I idiom must not be described with a minor i–VI–III–VII vamp, and vice versa.
    expect(of("bebop")).toContain("ii–V–I");
    expect(of("smooth-jazz")).toContain("ii–V–I");
    expect(of("black-metal").join(" ")).toContain("♭II");
    expect(of("bebop").join(" ")).not.toContain("i–VI–III–VII");
    // Blues is a I–IV–V idiom.
    expect(of("chicago-blues")).toContain("I–IV–V–IV");
    // Flattened degrees appear where the idiom uses them and nowhere else in Jazz/Blues.
    const jazzWithFlats = ALL_GENRES.filter(
      (g) => g.category === "Jazz/Blues" && g.common_chords.some((p) => p.includes("♭"))
    ).map((g) => g.id);
    expect(jazzWithFlats).toEqual([]);
  });

  it("accepts the roman-token grammar it claims to check (mutation guard)", () => {
    // Proves the regexes can fail, so a future green result means something.
    expect(ROMAN_TOKEN.test("i")).toBe(true);
    expect(ROMAN_TOKEN.test("♭VII")).toBe(true);
    expect(ROMAN_TOKEN.test("H")).toBe(false);
    expect(PROGRESSION.test("i–♭VI–♭VII–i")).toBe(true);
    expect(PROGRESSION.test("1-4-5")).toBe(false);
    expect(PROGRESSION.test("i VI")).toBe(false);
    expect(PROGRESSION.test("i–")).toBe(false);
  });
});
