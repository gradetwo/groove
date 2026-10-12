/**
 * Which chord styles each instrument may use (user report: "钢琴就不能有扫弦").
 *
 * The workbench used to offer block / ballad / arpeggio / strum for every timbre, so a piano
 * could be set to strum — a style a keyboard physically cannot produce, and which the synthesiser
 * renders as a badly quantised piano. These tests pin the rule per instrument, the repair path for
 * pairs that cannot exist, and — most importantly — that the *curated* progressions do not ship
 * impossible pairs of their own, since those bypass the buttons entirely.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { InstrumentTimbre, PlayingStyle } from "../audio/ChordAudioEngine";
import {
  TIMBRE_STYLES,
  coerceStyle,
  defaultStyleForTimbre,
  isStyleAllowed,
  styleNoteKeyForTimbre,
  stylesForTimbre,
} from "../audio/chordStyles";
import { POPULAR_PROGRESSIONS } from "../data/popularProgressions";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(TEST_DIR, "..");
const read = (relative: string) => readFileSync(path.join(SRC_DIR, relative), "utf8");

const TIMBRES: InstrumentTimbre[] = ["piano", "guitar", "power-guitar"];
const STYLES: PlayingStyle[] = ["block", "ballad", "arpeggio", "strum"];

describe("chord styles per instrument", () => {
  it("covers every instrument and nothing else", () => {
    expect(Object.keys(TIMBRE_STYLES).sort()).toEqual([...TIMBRES].sort());
  });

  it("gives every instrument a usable, duplicate-free style set", () => {
    for (const timbre of TIMBRES) {
      const allowed = stylesForTimbre(timbre);
      expect(allowed.length, timbre).toBeGreaterThan(0);
      expect(new Set(allowed).size, `${timbre} lists a style twice`).toBe(allowed.length);
      for (const style of allowed) expect(STYLES, `${timbre}/${style}`).toContain(style);
      // A style must be reachable: the default has to be one of the offered ones.
      expect(allowed, `${timbre}'s default must be offered`).toContain(defaultStyleForTimbre(timbre));
    }
  });

  it("never offers strum to a keyboard — the reported defect", () => {
    expect(stylesForTimbre("piano")).not.toContain("strum");
    expect(isStyleAllowed("piano", "strum")).toBe(false);
    // …while the instrument that exists to be swept still gets it.
    expect(isStyleAllowed("guitar", "strum")).toBe(true);
  });

  it("keeps power chords to what a down-picked chord can be", () => {
    expect(stylesForTimbre("power-guitar")).toEqual(["strum", "block"]);
    expect(isStyleAllowed("power-guitar", "arpeggio")).toBe(false);
    expect(isStyleAllowed("power-guitar", "ballad")).toBe(false);
  });

  it("explains the limit for every instrument", () => {
    for (const timbre of TIMBRES) {
      const key = styleNoteKeyForTimbre(timbre);
      expect(key, timbre).toMatch(/^chords_style_note_/);
    }
    // Distinct explanations: a single generic sentence would not tell the user anything.
    const keys = TIMBRES.map(styleNoteKeyForTimbre);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("coerceStyle repairs impossible pairs", () => {
  it("leaves every allowed pair alone", () => {
    for (const timbre of TIMBRES) {
      for (const style of stylesForTimbre(timbre)) {
        expect(coerceStyle(timbre, style), `${timbre}/${style}`).toBe(style);
      }
    }
  });

  it("repairs the pairs the workbench can no longer produce", () => {
    expect(coerceStyle("piano", "strum")).toBe(defaultStyleForTimbre("piano"));
    expect(coerceStyle("power-guitar", "ballad")).toBe(defaultStyleForTimbre("power-guitar"));
    expect(coerceStyle("power-guitar", "arpeggio")).toBe(defaultStyleForTimbre("power-guitar"));
  });

  it("is idempotent, so it is safe to apply on every render", () => {
    for (const timbre of TIMBRES) {
      for (const style of STYLES) {
        const once = coerceStyle(timbre, style);
        expect(coerceStyle(timbre, once), `${timbre}/${style}`).toBe(once);
      }
    }
  });
});

describe("the data and the UI respect the rule", () => {
  it("ships no curated progression whose suggested pair is impossible", () => {
    // These pairs bypass the buttons entirely: loading a progression sets the instrument and the
    // style together, so an impossible pair here would be a real bug and not a UI slip.
    const impossible = POPULAR_PROGRESSIONS.filter(
      (progression) =>
        progression.suggestedTimbre !== undefined &&
        progression.suggestedStyle !== undefined &&
        !isStyleAllowed(progression.suggestedTimbre, progression.suggestedStyle)
    ).map((progression) => `${progression.id}: ${progression.suggestedTimbre} + ${progression.suggestedStyle}`);
    expect(impossible, `impossible suggested pairs: ${impossible.join(", ")}`).toEqual([]);
  });

  it("derives the workbench's style row from the instrument, not from a fixed list", () => {
    const view = read("views/ChordProgressionsView.tsx");
    expect(view).toContain("stylesForTimbre(timbre)");
    expect(view).toContain("coerceStyle(timbre, style)");
    expect(view).toContain("styleNoteKeyForTimbre(timbre)");
    // The four hardcoded buttons are what made a piano able to strum; none may come back.
    expect(view).not.toMatch(/onClick=\{\(\) => setStyle\("strum"\)\}/);
    expect(view).not.toMatch(/onClick=\{\(\) => setStyle\("ballad"\)\}/);
  });

  it("repairs the style when the instrument changes, in the view itself", () => {
    const view = read("views/ChordProgressionsView.tsx");
    // The effect keyed on the instrument is the only thing that covers the curated-progression
    // path, where `suggestedTimbre` and `suggestedStyle` are set together.
    expect(view).toMatch(/useEffect\(\(\) => \{\s*setStyle\(\(current\) => \{[\s\S]{0,200}?coerceStyle\(timbre, current\)/);
  });
});
