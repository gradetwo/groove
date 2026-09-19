/**
 * Chord workbench data consistency: the roman numeral, the spelled chords, the sounding notes
 * and the keyboard display must all describe the same music.
 *
 * The workbench shows three representations of one progression and plays a fourth:
 *
 *   1. the **roman numeral** (`roman: ["vi","IV","I","V"]`) — what the user searches for;
 *   2. the **spelled chords** (`chords: [{root:"A",quality:"min"}, …]`) — what the card prints,
 *      written in the progression's own `defaultKey`/`isMinorKey`;
 *   3. the **sounding chords** — `romanToChord(roman, <user's key>)`, i.e. the same progression
 *      transposed into whatever key the workbench is set to;
 *   4. the **keyboard highlight** — the engine's actual `activeNotes` while playing.
 *
 * (1) and (2) are hand-written per progression, so they can disagree; (3) is derived from (1), so a
 * disagreement between (1) and (2) means the card is printing something the engine will never play.
 * This file pins (1)==(2) in the progression's own key, and that (3) is a faithful transposition —
 * i.e. same degrees, same qualities, only the key changes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { POPULAR_PROGRESSIONS } from "../data/popularProgressions";
import { romanToChord, normalizeNote, NOTE_NAMES } from "../utils/chordTheory";
import { coerceStyle, isStyleAllowed } from "../audio/chordStyles";

/** `C#` / `Db` are the same pitch; compare by pitch class so spelling never fails a check. */
const pitchClass = (root: string) => {
  // Through `normalizeNote`, which maps flats onto the sharp names `NOTE_NAMES` carries — a raw
  // `indexOf("Bb")` returns -1 and would read as a transposition error that is not there.
  const idx = NOTE_NAMES.indexOf(normalizeNote(root) as never);
  return idx >= 0 ? idx : -1;
};

describe("curated progressions: roman numerals agree with the spelled chords", () => {
  it("spells every chord exactly as its own numeral says, in its own key", () => {
    const mismatches: string[] = [];
    for (const progression of POPULAR_PROGRESSIONS) {
      const { roman, chords, defaultKey, isMinorKey } = progression;
      // The card prints these pairs; if the lengths differ, one of them is truncated.
      expect(chords.length, `${progression.id}: ${roman.length} numerals vs ${chords.length} chords`).toBe(
        roman.length
      );
      roman.forEach((numeral, i) => {
        const derived = romanToChord(numeral, defaultKey, isMinorKey);
        const written = chords[i];
        if (pitchClass(derived.root) !== pitchClass(written.root) || derived.quality !== written.quality) {
          mismatches.push(
            `${progression.id}[${i}] ${numeral} → ${derived.root}${derived.quality} but the card says ` +
              `${written.root}${written.quality} (key ${defaultKey}${isMinorKey ? " minor" : " major"})`
          );
        }
      });
    }
    expect(mismatches, `numeral/chord mismatches:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it("keeps the same degrees and qualities when transposed to another key", () => {
    // The workbench plays `romanToChord(roman, <user key>)`. Transposing must not change the
    // *shape* of the progression — only its pitch level — or the card would be lying about what
    // the user is hearing.
    const problems: string[] = [];
    for (const progression of POPULAR_PROGRESSIONS) {
      for (const key of ["C", "F#", "Bb", "A"]) {
        const atHome = progression.roman.map((numeral) =>
          romanToChord(numeral, progression.defaultKey, progression.isMinorKey)
        );
        const transposed = progression.roman.map((numeral) =>
          romanToChord(numeral, key, progression.isMinorKey)
        );
        transposed.forEach((chord, i) => {
          if (chord.quality !== atHome[i].quality) {
            problems.push(
              `${progression.id}[${i}] ${progression.roman[i]}: quality changed ${atHome[i].quality} → ${chord.quality} when moving to ${key}`
            );
          }
          const shift = (pitchClass(chord.root) - pitchClass(atHome[i].root) + 12) % 12;
          const expected = (pitchClass(key) - pitchClass(progression.defaultKey) + 12) % 12;
          if (shift !== expected) {
            problems.push(
              `${progression.id}[${i}] ${progression.roman[i]}: moved ${shift} semitones but the key moved ${expected} (${progression.defaultKey} → ${key})`
            );
          }
        });
      }
    }
    expect(problems, `transposition problems:\n${problems.join("\n")}`).toEqual([]);
  });

  it("gives every progression a key, a mode and a non-empty, unique numeral list", () => {
    const bad: string[] = [];
    for (const progression of POPULAR_PROGRESSIONS) {
      if (!progression.defaultKey) bad.push(`${progression.id}: no defaultKey`);
      if (typeof progression.isMinorKey !== "boolean") bad.push(`${progression.id}: isMinorKey not a boolean`);
      if (progression.roman.length < 2) bad.push(`${progression.id}: fewer than two chords`);
      // Repeated numerals are *correct* music (twelve-bar blues is I7 four times, the canon is
      // I–V–vi–iii–IV–I–IV–V), so nothing here forbids them.
    }
    expect(bad).toEqual([]);
  });
});

describe("curated progressions: the suggested instrument can actually play the suggested style", () => {
  it("never suggests a pair the instrument cannot produce", () => {
    const impossible = POPULAR_PROGRESSIONS.filter(
      (progression) => !isStyleAllowed(progression.suggestedTimbre, progression.suggestedStyle)
    ).map((progression) => `${progression.id}: ${progression.suggestedTimbre} + ${progression.suggestedStyle}`);
    expect(impossible).toEqual([]);
  });

  it("leaves the pair unchanged when it is already playable", () => {
    // `coerceStyle` is what the workbench applies to the *user's* selection; a suggestion that is
    // already valid must pass through untouched, or loading a progression would silently change it.
    for (const progression of POPULAR_PROGRESSIONS) {
      expect(
        coerceStyle(progression.suggestedTimbre, progression.suggestedStyle),
        `${progression.id}`
      ).toBe(progression.suggestedStyle);
    }
  });
});

describe("the workbench auditions with the selected instrument and style", () => {
  const view = () =>
    readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "views", "ChordProgressionsView.tsx"), "utf8");

  it("does not adopt a progression's suggested timbre/style when auditioning it", () => {
    const source = view();
    // The audition handler is the block that maps `prog.roman` to the current key and then starts
    // the engine; it must not write the selection from the progression's suggestions.
    const audition = source.slice(
      source.indexOf("const handlePreviewProgression"),
      source.indexOf("const handleLoadProgression")
    );
    expect(audition.length, "handlePreviewProgression not found").toBeGreaterThan(200);
    expect(audition).not.toContain("engine.setTimbre(prog.suggestedTimbre)");
    expect(audition).not.toContain("engine.setStyle(prog.suggestedStyle)");
    expect(audition).not.toContain("setTimbre(prog.suggestedTimbre)");
    expect(audition).not.toContain("setStyle(prog.suggestedStyle)");
    // …and it plays with the current selection, repaired for the instrument.
    expect(audition).toContain("engine.setTimbre(timbre)");
    expect(audition).toContain("engine.setStyle(coerceStyle(timbre, style))");
  });

  it("keeps one place that pushes the selection to the engine", () => {
    // Every button (chord, style, timbre) goes through the synchronising effect, so an audition
    // cannot be running with a stale instrument while the UI shows a new one.
    const source = view();
    const sync = source.slice(source.indexOf("// Synchronize engine parameters"), source.indexOf("// Safety clamp"));
    expect(sync).toContain("engineRef.current.setTimbre(timbre)");
    expect(sync).toContain("engineRef.current.setStyle(coerceStyle(timbre, style))");
  });
});
