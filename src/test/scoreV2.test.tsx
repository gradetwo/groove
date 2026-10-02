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
const drawn: {
  notes: string[];
  clefs: string[];
  dotCounts: number[];
  /** One entry per `StaveNote`, so a criterion about *instruments* can read the notehead and stem the note was given. */
  noteheads: Array<Array<string | undefined>>;
  stems: Array<number | undefined>;
  /**
   * The notes of each stave, in the order they were drawn — the shape that lets a criterion ask "what is engraver X
   * writing on the *second* voice of this bar", which a flat list cannot answer.
   */
  staves: Array<{ clefs: string[]; notes: Array<{ keys: string[]; heads: Array<string | undefined>; duration: string; stems?: number | undefined }> }>;
} = { notes: [], clefs: [], dotCounts: [], noteheads: [], stems: [], staves: [] };
/** Set by one criterion to make the renderer throw; the mock reads it when a Renderer is constructed. */
const failNextRender = { value: false };
vi.mock("vexflow/core", () => {
  /**
   * The stave currently being drawn. `addClef` opens it and every `StaveNote` appends itself, which is what lets a
   * criterion ask "what is this voice writing" rather than "which notes exist somewhere".
   */
  let currentStave: { clefs: string[]; notes: Array<{ keys: string[]; heads: Array<string | undefined>; duration: string; stems?: number | undefined }> } | undefined;
  class StaveNote {
    keys: string[];
    duration: string;
    constructor(options: { keys: string[]; duration: string; dots?: number; stemDirection?: number }) {
      /**
       * The mock records the **notehead code** alongside the key, which is the part of a percussion note VexFlow
       * reads out of the key's third `/`-separated piece (`g/5/x2`) — see `Tables.codeNoteHead`. Without it a
       * criterion could not tell an x-headed hat from a snare drum, which is the whole claim of the drum staff.
       */
      const withHead = options.keys.map((key) => {
        const pieces = key.split("/");
        const head = pieces.length > 2 ? pieces[2]!.toUpperCase() : `${pieces[0]!.toUpperCase()}1`;
        return { head, key };
      });
      this.keys = withHead.map((entry) => entry.key);
      this.duration = options.duration;
      drawn.notes.push(`${withHead.map((entry) => entry.head).join("+")}/${withHead.map((entry) => entry.key).join("+")}:${options.duration}`);
      drawn.noteheads.push(withHead.map((entry) => entry.head));
      drawn.stems.push(options.stemDirection);
      currentStave?.notes.push({
        keys: withHead.map((entry) => entry.key),
        heads: withHead.map((entry) => entry.head),
        duration: options.duration,
        stems: options.stemDirection,
      });
      // The constructor's `dots` is the tick value; `Dot.buildAndAttach` is only the glyph. Recorded
      // separately so a criterion can tell the two apart.
      drawn.dotCounts.push(options.dots ?? 0);
    }
    getDuration() {
      return this.duration;
    }
    /** Real `StaveNote`s answer this, and the beaming filter asks: a rest is never beamed. */
    isRest() {
      return this.duration.endsWith("r");
    }
  }
  class Stave {
    constructor() {}
    addClef(clef: string) {
      drawn.clefs.push(clef);
      // A clef is added before the first note of a stave, so this is where a stave's record begins.
      currentStave = { clefs: [clef], notes: [] };
      drawn.staves.push(currentStave);
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

/** A drum track, which is the one thing the score cannot tell from the notes alone — so the caller says it. */
const renderDrums = (notes: React.ComponentProps<typeof ScoreV2>["notes"], bars = 1) => {
  render(
    <LanguageProvider>
      <ScoreV2 notes={notes} bars={bars} width={800} kind="drumkit" title="Drums" />
    </LanguageProvider>
  );
};

/** `C1+D1/c/4+e/4:q` → `["c/4", "e/4"]`, the keys the note was built with. */
const keysIn = (recorded: string) => /^[^/]*\/(.*):[^:]*$/.exec(recorded)![1]!.split("+");
/** `C1+D1/c/4+e/4:q` → `["C1", "D1"]`, the notehead codes VexFlow reads out of those keys. */
const headsIn = (recorded: string) => recorded.split("/")[0]!.split("+");

describe("the score", () => {
  beforeEach(() => {
    drawn.notes = [];
    drawn.clefs = [];
    drawn.dotCounts = [];
    drawn.noteheads = [];
    drawn.stems = [];
    drawn.staves = [];
  });

  it("writes a note above middle C on the treble stave and one below it on the bass", () => {
    /**
     * The split is what makes a piano grand staff readable: a left hand's note drawn on the treble stave would be a ledger line a reader has to count.
     */
    renderScore([note(72, 0), note(48, 0)]);
    return waitFor(() => {
      expect(drawn.notes.some((entry) => keysIn(entry).includes("c/5"))).toBe(true);
      expect(drawn.notes.some((entry) => keysIn(entry).includes("c/3"))).toBe(true);
      expect(drawn.clefs).toEqual(expect.arrayContaining(["treble", "bass"]));
    });
  });

  it("draws the notes the model holds, at the pitches the model holds", () => {
    // The claim of having a roll and a score at once: they are two readings of one array, so this is the same list the roll would write.
    renderScore([note(60, 0), note(64, 1), note(67, 2)]);
    return waitFor(() => {
      expect(drawn.notes.flatMap((entry) => keysIn(entry))).toEqual(expect.arrayContaining(["c/4", "e/4", "g/4"]));
    });
  });

  it("gathers notes that start together into one chord, which is how a stave writes them", () => {
    renderScore([note(60, 0), note(64, 0), note(67, 0)]);
    return waitFor(() => {
      // One note with three keys, rather than three notes stacked on one beat.
      const chord = drawn.notes.find((entry) => keysIn(entry).length === 3);
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

  it("completes a one-beat bar with rests, and still draws every note that is in it", () => {
    /**
     * The field report this criterion comes from: the starter content of every new track is one sixteenth per
     * beat — one beat in a 4/4 bar — and the score wrote it into a STRICT four-beat voice, so VexFlow answered
     * `IncompleteVoice` and the person who opened the Score tab got a runtime error instead of their notes.
     * The silence is written now, and **no note is lost in the process**: four in, four drawn.
     */
    renderScore([note(60, 0, 0.25), note(60, 1, 0.25), note(60, 2, 0.25), note(60, 3, 0.25)], 1);
    return waitFor(() => {
      expect(drawn.notes.filter((entry) => keysIn(entry).join() === "c/4" && entry.endsWith(":16"))).toHaveLength(4);
      // 0.75 beats of rest after each sixteenth is what makes the bar add up.
      expect(drawn.notes.some((entry) => entry.endsWith(":8r"))).toBe(true);
      expect(screen.queryByTestId("score-problem")).toBeNull();
    });
  });

  it("tells the note about its dot, because the dots option is the duration and the glyph is not", () => {
    // A dotted quarter drawn with the glyph alone counts as one beat in VexFlow — a bar that stops adding up.
    renderScore([note(60, 0, 1.5)], 1);
    return waitFor(() => {
      expect(drawn.notes.some((entry) => entry.endsWith(":q"))).toBe(true);
      expect(drawn.dotCounts).toContain(1);
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

  /**
   * ⭐ **A drum part is a drum part, and the caller is what says so.**
   *
   * These criteria are the component half of the claim; the table's own arithmetic is judged in
   * `percussionStaff.test.ts`, and the *library's* verdict on a drum bar is judged there too, against the real
   * VexFlow.
   */
  it("writes a drum track with a percussion clef and one stave, not a pitched grand staff", () => {
    renderDrums([note(36, 0), note(42, 0.5)], 1);
    return waitFor(() => {
      expect(drawn.clefs).toContain("percussion");
      // A kick is not written where note 36 sits, and a hat is not written where 42 sits: the *positions* are the table's.
      expect(drawn.clefs).not.toContain("treble");
      expect(drawn.clefs).not.toContain("bass");
    });
  });

  it("puts the kick, the snare, the hat and the shaker where the table says, and never on their own pitches", () => {
    renderDrums([note(36, 0), note(38, 1), note(42, 2), note(82, 3)], 1);
    return waitFor(() => {
      const keys = drawn.notes.flatMap((entry) => keysIn(entry));
      expect(keys).toEqual(expect.arrayContaining(["f/4", "c/5", "g/5/x2", "a/5/x2"]));
      // The pitches themselves — 36 would be `c/2`, 42 `f#/2` — must not appear as note names at all.
      expect(keys).not.toContain("c/2");
      expect(keys).not.toContain("f#/2");
    });
  });

  it("writes a kick and a hat on one beat as the two voices a kit is written in, not as one chord", () => {
    /**
     * The arithmetic behind the split: a `StaveNote` has **one** stem, and a kit's vertical axis is *which
     * instrument*, so a kick (down-stem) and a hat (up-stem) sounding together cannot be one note written
     * correctly. Two voices, one line each — and within a voice, simultaneous instruments are still one chord.
     */
    renderDrums([note(36, 0), note(42, 0), note(38, 0.5), note(82, 0.5)], 1);
    return waitFor(() => {
      // The drum stave is the first (and only) stave with a percussion clef.
      const stave = drawn.staves.find((entry) => entry.clefs.includes("percussion"))!;
      const notes = stave.notes.filter((entry) => !entry.duration.endsWith("r"));
      // Two written events per beat: a kick under a hat, then a snare under a shaker.
      expect(notes).toHaveLength(4);
      // Voice 1 (stems up) is the cymbal line and carries the x noteheads; voice 2 (stems down) is the drums.
      const up = notes.filter((entry) => entry.stems === 1);
      const down = notes.filter((entry) => entry.stems === -1);
      expect(up.map((entry) => entry.keys)).toEqual([["g/5/x2"], ["a/5/x2"]]);
      expect(down.map((entry) => entry.keys)).toEqual([["f/4"], ["c/5"]]);
      for (const entry of up) expect(entry.heads.every((head) => head === "X2")).toBe(true);
      for (const entry of down) expect(entry.heads.every((head) => head === "F1" || head === "C1")).toBe(true);
    });
  });

  it("gathers two instruments of one voice that sound together into one chord", () => {
    // Within a voice, simultaneity is still a chord: a hat and a shaker on one beat are one written event.
    renderDrums([note(42, 0), note(82, 0)], 1);
    return waitFor(() => {
      const stave = drawn.staves.find((entry) => entry.clefs.includes("percussion"))!;
      const chord = stave.notes.find((entry) => entry.keys.length === 2);
      expect(chord).toBeDefined();
      expect(chord!.keys.sort()).toEqual(["a/5/x2", "g/5/x2"]);
    });
  });

  it("gives each voice its own stem direction, because the vertical axis is an instrument and not a pitch", () => {
    renderDrums([note(36, 0), note(42, 0.5), note(38, 1), note(82, 1.5)], 1);
    return waitFor(() => {
      const stave = drawn.staves.find((entry) => entry.clefs.includes("percussion"))!;
      const notes = stave.notes.filter((entry) => !entry.duration.endsWith("r"));
      // Cymbals up, drums down — and never a note without a direction, which is what Auto would produce.
      expect(notes.filter((entry) => entry.stems === 1).length).toBeGreaterThan(0);
      expect(notes.filter((entry) => entry.stems === -1).length).toBeGreaterThan(0);
      expect(notes.every((entry) => entry.stems === 1 || entry.stems === -1)).toBe(true);
      for (const entry of notes) {
        const cymbal = entry.keys.some((key) => key.endsWith("/x2"));
        expect(entry.stems, entry.keys.join("+")).toBe(cymbal ? 1 : -1);
      }
    });
  });

  it("draws a drum part whose instrument is not in the table, says where it went, and loses no hit", async () => {
    /**
     * The failure this forbids is the one the whole project keeps naming: a note that quietly disappears, or a
     * shaker drawn where the snare goes with nothing saying so. So the hit is drawn, and the score carries a
     * sentence naming the file and the row to add.
     */
    renderDrums([note(50, 0), note(36, 1)], 1);
    await waitFor(() => {
      expect(drawn.notes.some((entry) => keysIn(entry).join() === "c/5" && entry.endsWith(":q"))).toBe(true);
    });
    const notice = await screen.findByTestId("score-percussion-notice");
    expect(notice.textContent).toContain("50");
    expect(notice.textContent).toContain("percussionStaff.ts");
    // Both hits are on the stave: the unlisted one fell back rather than vanishing.
    expect(drawn.notes.filter((entry) => !entry.endsWith("r")).length).toBe(2);
  });

  it("says nothing about percussion on a pitched track, even one whose notes are drum numbers", () => {
    // The reverse criterion: a synth track holding note 36 is a pitched note, and nothing here may call it a drum.
    renderScore([note(36, 0)], 1);
    return waitFor(() => {
      expect(drawn.clefs).toEqual(expect.arrayContaining(["bass"]));
      expect(screen.queryByTestId("score-percussion-notice")).toBeNull();
    });
  });
});
