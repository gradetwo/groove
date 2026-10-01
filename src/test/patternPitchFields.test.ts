import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⭐ **The two pitch fields have to say what they are, on the schema a pattern writer reads.**
 *
 * A test report called `pitch` and `pitches` historical baggage: two fields, a caller forced to work out which
 * one wins, and a risk of setting the wrong one. The audit (`docs/DATA_MODEL_AUDIT.md` §3) found neither field is
 * dead — `pitch` is written by MIDI import, live recording, InspireMe and URL sharing; `pitches` is the chord
 * stack read by chordVoicing, offlineLanes and both exporters — so the baggage is the pair, not either field.
 *
 * Retiring `pitch` was then measured the only way that can be trusted: remove it from `SequencerTrack` and let
 * the compiler enumerate. Grep cannot do this, because `.pitch` matches `NoteEvent.pitch` too, which is the
 * arrangement's singular pitch and must stay. The answer was 734 errors, about 450 of them in the thirteen
 * hand-authored genre files. That is not a cheap repair, so the relief is bought where the confusion actually
 * happened instead: `patternSchema`, which eighteen tools reference, now describes both fields.
 *
 * **The criterion reads the source rather than the built schema**, deliberately. The first version navigated the
 * zod objects and broke on its own type casts and on an accessor path I had guessed wrong; prose is what has to
 * be right here, and the project already has this pattern (`arrangementColours.test.ts` reads component sources
 * for the same reason). A schema that lost the fields entirely is caught too, so the phrasing checks cannot be
 * satisfied against nothing.
 */
const SOURCE = readFileSync(path.join(__dirname, "..", "..", "mcp", "registry.ts"), "utf8");

describe("the pattern schema names the two pitch fields", () => {
  it("⭐ states the precedence from both sides, so a caller reading either field learns it", () => {
    // Each field points at the other, because either one may be read first.
    expect(SOURCE).toContain("see `pitches` for chords");
    expect(SOURCE).toMatch(/a `pitch` at that step is not what you hear/);
    // And the precedence itself is stated in words, not implied by ordering.
    expect(SOURCE).toMatch(/sounds that entry, not this one/);
    expect(SOURCE).toMatch(/is what sounds/);
  });

  it("says what each field is for, and that setting both is not required", () => {
    expect(SOURCE).toContain("root note of each step");
    expect(SOURCE).toContain("chord per step");
    // The fear the report described was a caller having to guess; this answers it directly.
    expect(SOURCE).toMatch(/do not have to set both/);
  });

  it("still has both fields, so the phrases above cannot be satisfied against nothing", () => {
    // The declarations themselves, in the shared `patternSchema` the eighteen tools reference.
    expect(SOURCE).toMatch(/pitch: z\s*\n\s*\.array\(z\.number\(\)\.nullable\(\)\)/);
    expect(SOURCE).toMatch(/pitches: z\s*\n\s*\.array\(z\.array\(z\.number\(\)\)\.nullable\(\)\)/);
  });
});
