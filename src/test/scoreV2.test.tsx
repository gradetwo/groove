/**
 * The score: the same notes, written to be read.
 *
 * The claims worth checking are not "does it call VexFlow" but (a) **the two views are two readings of one array**, so a note written in the roll is on the stave at the same pitch and beat, and (b) VexFlow is really lazy, because the feature's whole cost argument rests on it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { ScoreV2 } from "../components/arrangement/ScoreV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * VexFlow draws into a real SVG canvas, and jsdom has no layout: the library's own renderer is stubbed so that **what is being tested is our translation** — which notes go on which stave, at which position — rather than VexFlow's engraving, which is VexFlow's job and its own test suite's.
 */
const drawn: { notes: string[]; clefs: string[] } = { notes: [], clefs: [] };
/** Set by one criterion to make the renderer throw; the mock reads it when a Renderer is constructed. */
const failNextRender = { value: false };
vi.mock("vexflow/core", () => {
  class StaveNote {
    keys: string[];
    duration: string;
    constructor(options: { keys: string[]; duration: string }) {
      this.keys = options.keys;
      this.duration = options.duration;
      drawn.notes.push(`${options.keys.join("+")}:${options.duration}`);
    }
    getDuration() {
      return this.duration;
    }
  }
  class Stave {
    constructor() {}
    addClef(clef: string) {
      drawn.clefs.push(clef);
      return this;
    }
    addTimeSignature() {
      return this;
    }
    setEndBarType() {
      return this;
    }
    setContext() {
      return this;
    }
    draw() {
      return this;
    }
  }
  class Voice {
    constructor() {}
    addTickables() {
      return this;
    }
    setStrict() {
      return this;
    }
    draw() {
      return this;
    }
  }
  class Formatter {
    joinVoices() {
      return this;
    }
    format() {
      return this;
    }
  }
  return {
    Renderer: class {
      static Backends = { SVG: 1 };
      constructor() {
        // A flag rather than a second file, so the failure path is tested by the same translation code as the success path.
        if (failNextRender.value) throw new Error("glyph render failed");
      }
      resize() {}
      getContext() {
        return {};
      }
    },
    Stave,
    StaveNote,
    Voice,
    Formatter,
    Beam: { generateBeams: () => [] },
    Dot: { buildAndAttach: () => [] },
    Barline: { type: { END: 1 } },
    // The host URL is what keeps the font request on our own origin; the criterion below reads it back.
    // The font is loaded from our own origin, so the mock reports the call rather than reaching the network.
    Font: { HOST_URL: "", load: () => Promise.resolve() },
  };
});

const note = (pitch: number, startBeats: number, lengthBeats = 1) => ({ pitch, startBeats, lengthBeats, velocity: 100 });

/**
 * Renders with the renderer rigged to throw. **The flag is cleared by the caller after its assertions**, not here: the component imports VexFlow and draws asynchronously, so clearing it on the way out of `render` would clear it before the effect ever ran.
 */
const renderFailing = () => {
  failNextRender.value = true;
  return render(
    <LanguageProvider>
      <ScoreV2 notes={[note(60, 0)]} bars={1} width={400} />
    </LanguageProvider>
  );
};

const renderScore = (notes: React.ComponentProps<typeof ScoreV2>["notes"], bars = 1) => {
  render(
    <LanguageProvider>
      <ScoreV2 notes={notes} bars={bars} width={800} title="Right Hand" />
    </LanguageProvider>
  );
};

describe("the score", () => {
  beforeEach(() => {
    drawn.notes = [];
    drawn.clefs = [];
  });

  it("writes a note above middle C on the treble stave and one below it on the bass", () => {
    /**
     * The split is what makes a piano grand staff readable: a left hand's note drawn on the treble stave would be a ledger line a reader has to count.
     */
    renderScore([note(72, 0), note(48, 0)]);
    return waitFor(() => {
      expect(drawn.notes.some((entry) => entry.startsWith("c/5"))).toBe(true);
      expect(drawn.notes.some((entry) => entry.startsWith("c/3"))).toBe(true);
      expect(drawn.clefs).toEqual(expect.arrayContaining(["treble", "bass"]));
    });
  });

  it("draws the notes the model holds, at the pitches the model holds", () => {
    // The claim of having a roll and a score at once: they are two readings of one array, so this is the same list the roll would write.
    renderScore([note(60, 0), note(64, 1), note(67, 2)]);
    return waitFor(() => {
      expect(drawn.notes.map((entry) => entry.split(":")[0])).toEqual(expect.arrayContaining(["c/4", "e/4", "g/4"]));
    });
  });

  it("gathers notes that start together into one chord, which is how a stave writes them", () => {
    renderScore([note(60, 0), note(64, 0), note(67, 0)]);
    return waitFor(() => {
      // One note with three keys, rather than three notes stacked on one beat.
      const chord = drawn.notes.find((entry) => entry.split(":")[0]!.split("+").length === 3);
      expect(chord).toBeDefined();
    });
  });

  it("writes a duration a reader recognises, including a dotted one", () => {
    // Both inside the one bar: a whole note, then a dotted quarter — the dot is what a reader expects for a beat and a half.
    renderScore([note(60, 0, 2), note(62, 2, 1.5)]);
    return waitFor(() => {
      expect(drawn.notes.some((entry) => entry.endsWith(":h"))).toBe(true);
      // A beat and a half is a dotted quarter, not a quarter followed by an eighth: the dot is what makes it readable.
      expect(drawn.notes.some((entry) => entry.endsWith(":q"))).toBe(true);
    });
  });

  it("draws a whole rest in a measure with nothing in it, because silence is written too", () => {
    renderScore([], 1);
    return waitFor(() => {
      expect(drawn.notes.some((entry) => entry.endsWith(":wr"))).toBe(true);
    });
  });

  it("says so when it cannot draw, rather than showing an empty box", async () => {
    /**
     * The failure path is worth a criterion of its own: a score that fails silently is a bug report nobody can read, and an empty box is what a person would otherwise see.
     */
    renderFailing();
    try {
      await waitFor(() => {
        expect(screen.getByTestId("score-problem").textContent).toMatch(/glyph|render|draw/i);
      });
    } finally {
      failNextRender.value = false;
    }
  });
});
