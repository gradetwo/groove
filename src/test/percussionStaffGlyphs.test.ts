/**
 * **What the last glyph of a drum bar is, and which voice owns it.**
 *
 * A report on `f361711` left one thing unexplained: a real VexFlow dump of a drum measure showed a `U+E0A4`
 * glyph at the end, at an x where the reporter found no note — while the pitched stave had the same byte at that
 * position as a note's head. The three readings that had to be told apart were (1) a notehead with no note behind
 * it, (2) a real note of one of the two voices, (3) something VexFlow adds itself when one stave carries two
 * voices.
 *
 * These criteria settle it with the **real** `vexflow/core`, and they settle it the way the module is written:
 *
 *  * **`U+E0A4` is `Glyphs.noteheadBlack`** — the glyph a key with *no* third `/`-separated piece gets from
 *    `Tables.codeNoteHead`. In `PERCUSSION_VOICES` exactly the two **voice-2** rows (kick 36 `f/4`, snare 38
 *    `c/5`) and the fallback have no `notehead` code; the two voice-1 rows are `x2`, i.e. `U+E0A9`
 *    (`noteheadXBlack`). So a `U+E0A4` in a drum staff can only be a **drum-family** notehead — never a cymbal,
 *    never a rest (`StaveNote.isRest()` is `codeHead` ∈ `U+E4E0`–`U+E4FF`).
 *  * **the library adds no notehead of its own.** The only `new NoteHead(...)` in VexFlow 5.0.0 is inside
 *    `StaveNote.buildNoteHeads` (`stavenote.js`), and the alignment filler it does have, `GhostNote`, draws
 *    nothing (`ghostnote.js`: `draw()` returns without emitting anything). Criterion 3 below asserts that against
 *    the library rather than quoting it.
 *  * **the plan and the drawn page agree glyph for glyph.** Every notehead in the SVG is counted against the
 *    plan's non-rest keys, and every rest glyph against the plan's rests, so "an extra head" cannot hide in the
 *    difference between two drawings.
 *
 * The bar used is the shape the report described: **hi-hats on every eighth** (voice 1 — the last one at beat 3.5)
 * and a **snare on the bar's last sixteenth** (voice 2 — beat 3.75). Voice 1's last notehead is therefore ~26 px
 * before the end, and the trailing `U+E0A4` is voice 2's own last note. The pitched control draws the same model
 * note with the same byte, which is what made the two staves look like they disagreed about a byte that is in fact
 * one note read two ways.
 */
import { describe, expect, it } from "vitest";
import { durationName, planMeasure, restsFor, writtenBeats } from "../components/arrangement/ScoreV2";
import { PERCUSSION_VOICES, planPercussionMeasure } from "../components/arrangement/percussionStaff";
import type { NoteEvent } from "../types/arrangementV2";

const rhythm = { durationName, writtenBeats, restsFor };

const note = (pitch: number, startBeats: number, lengthBeats = 0.25): NoteEvent => ({
  pitch,
  startBeats,
  lengthBeats,
  velocity: 100,
});

/** The bar under test: hats every eighth, a kick on the downbeat, a snare on the last sixteenth. */
const BAR: NoteEvent[] = [
  ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beats) => note(42, beats)),
  note(36, 0),
  note(38, 3.75),
];

/** ScoreV2's own stave width and note margin (`ScoreV2.tsx`), so the dump is the component's geometry. */
const STAVE_WIDTH = 450;
const NOTE_WIDTH = STAVE_WIDTH - 40;

const U = {
  percussionClef: "\uE069",
  noteheadBlack: "\uE0A4",
  noteheadXBlack: "\uE0A9",
  restWhole: "\uE4E3",
  restQuarter: "\uE4E5",
  rest8th: "\uE4E6",
  rest16th: "\uE4E7",
} as const;

const codepointOf = (node: Element) => (node.textContent ?? "").codePointAt(0) ?? 0;

/** One SVG `<text>` in a rendered host: where it is and which byte it is. */
interface Glyph {
  x: number;
  codepoint: number;
}

/** Every glyph of a rendered host, in drawing order. */
function glyphsIn(host: HTMLElement): Glyph[] {
  return [...host.querySelectorAll("svg text")].map((node) => ({
    x: Math.round(Number(node.getAttribute("x"))),
    codepoint: codepointOf(node),
  }));
}

const noteheadsIn = (host: HTMLElement) =>
  glyphsIn(host).filter((glyph) => glyph.codepoint >= 0xe0a0 && glyph.codepoint <= 0xe0ff);
const restsIn = (host: HTMLElement) =>
  glyphsIn(host).filter((glyph) => glyph.codepoint >= 0xe4e0 && glyph.codepoint <= 0xe4ff);

/** A fresh SVG host with a percussion stave at the component's own geometry. */
async function percussionHost() {
  const { Renderer, Stave } = await import("vexflow/core");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(900, 260);
  const context = renderer.getContext();
  const stave = new Stave(0, 40, STAVE_WIDTH);
  stave.addClef("percussion");
  stave.setContext(context).draw();
  return { host, context, stave };
}

/**
 * **One bar as `ScoreV2` builds it — one voice at a time on the page, all of them formatted together.**
 *
 * The component formats both voices against each other (one `Formatter`, `joinVoices`) and only then draws them.
 * A criterion needs to know which glyph came from which voice, and VexFlow writes both voices' notes into the same
 * `<g class="vf-stavenote">`, so this helper does what the component does — **one shared format** — and then draws
 * each voice into its own SVG. The x positions are already fixed on the tickables, so the dump is the geometry the
 * component really draws, with the voice boundary made visible.
 */
async function drumVoices(notes: NoteEvent[] = BAR) {
  const { StaveNote, Voice, Formatter, Beam, Dot } = await import("vexflow/core");
  const plans = planPercussionMeasure(notes, 0, 4, rhythm);

  const voices = plans.map((plan) => {
    const tickables = plan.entries.map((entry) => {
      const built = new StaveNote({
        keys: entry.kind === "rest" ? ["b/4"] : entry.keys,
        duration: entry.duration,
        dots: entry.dots,
        stemDirection: plan.stems === "up" ? 1 : -1,
      });
      if (entry.dots > 0) Dot.buildAndAttach([built], { all: true });
      return built;
    });
    const voice = new Voice({ numBeats: 4, beatValue: 4 });
    if (!plan.complete) voice.setStrict(false);
    voice.addTickables(tickables);
    return { plan, voice, tickables };
  });

  const formatter = new Formatter();
  const built = voices.map(({ voice }) => voice);
  formatter.joinVoices(built).format(built, NOTE_WIDTH);
  // `ScoreV2` beams the same subset, with the same call, after formatting.
  for (const { tickables } of voices) {
    const beamable = tickables.filter((entry) => !entry.isRest() && (entry.getDuration() === "8" || entry.getDuration() === "16"));
    if (beamable.length > 1) Beam.generateBeams(beamable);
  }

  const drawn: Array<{
    voice: number;
    plan: (typeof voices)[number]["plan"];
    tickables: (typeof voices)[number]["tickables"];
    host: HTMLElement;
  }> = [];
  for (const entry of voices) {
    const { host, context, stave } = await percussionHost();
    entry.voice.draw(context, stave);
    drawn.push({ voice: entry.plan.voice, plan: entry.plan, tickables: entry.tickables, host });
  }
  return drawn;
}

const lastNoteX = (tickables: Array<{ isRest: () => boolean; getAbsoluteX: () => number }>) => {
  const notes = tickables.filter((tickable) => !tickable.isRest());
  return notes.length ? Math.round(notes[notes.length - 1]!.getAbsoluteX()) : undefined;
};

describe("the last glyph of a drum bar", () => {
  it("is a U+E0A4 notehead, and it is voice 2's own last note", async () => {
    const voices = await drumVoices();
    const cymbals = voices.find((entry) => entry.voice === 1)!;
    const drums = voices.find((entry) => entry.voice === 2)!;

    // Voice 1 is the cymbal family: every notehead is the x head, and the last one is the hat on beat 3.5.
    const cymbalHeads = noteheadsIn(cymbals.host);
    expect(cymbalHeads.map((glyph) => glyph.codepoint)).toEqual(Array(8).fill(U.noteheadXBlack.charCodeAt(0)));
    expect(cymbalHeads[cymbalHeads.length - 1]!.x).toBe(lastNoteX(cymbals.tickables));

    // Voice 2 is the drum family: every notehead is the plain black head, and the last one is the snare on 3.75.
    const drumHeads = noteheadsIn(drums.host);
    expect(drumHeads.map((glyph) => glyph.codepoint)).toEqual(Array(2).fill(U.noteheadBlack.charCodeAt(0)));
    expect(drumHeads[drumHeads.length - 1]!.x).toBe(lastNoteX(drums.tickables));
    expect(drums.tickables.filter((tickable) => !tickable.isRest()).at(-1)!.getKeys()).toEqual(["c/5"]);

    // The trailing notehead of the measure is that snare, and it is **after** the cymbal voice's last note — which
    // is why a reader watching the hat line reads it as "a head with no note".
    const trailing = [...cymbalHeads, ...drumHeads].sort((a, b) => a.x - b.x).at(-1)!;
    expect(trailing.codepoint).toBe(U.noteheadBlack.charCodeAt(0));
    expect(trailing.x).toBe(drumHeads[drumHeads.length - 1]!.x);
    expect(trailing.x).toBeGreaterThan(cymbalHeads[cymbalHeads.length - 1]!.x);
  });

  it("accounts for every glyph on the page: one notehead per non-rest key, one rest glyph per rest entry", async () => {
    const voices = await drumVoices();
    // The plan first: how many heads are owed, per voice.
    for (const { voice, plan, host } of voices.map((entry) => ({ voice: entry.voice, plan: entry.plan, host: entry.host }))) {
      const keys = plan.entries.filter((entry) => entry.kind === "note").flatMap((entry) => entry.keys);
      const rests = plan.entries.filter((entry) => entry.kind === "rest");
      expect(noteheadsIn(host).length, `voice ${voice} noteheads`).toBe(keys.length);
      expect(restsIn(host).length, `voice ${voice} rests`).toBe(rests.length);
      // The drum staff has no clef glyph other than the percussion clef — never a treble or a bass clef.
      expect(glyphsIn(host).filter((glyph) => glyph.codepoint === U.percussionClef.charCodeAt(0))).toHaveLength(1);
    }
    // And across the whole bar: ten keys in the plan, ten noteheads on the page. No extra head exists.
    const heads = voices.flatMap((entry) => noteheadsIn(entry.host));
    expect(heads).toHaveLength(10);
    expect(heads.filter((glyph) => glyph.codepoint === U.noteheadBlack.charCodeAt(0))).toHaveLength(2);
    expect(heads.filter((glyph) => glyph.codepoint === U.noteheadXBlack.charCodeAt(0))).toHaveLength(8);
  });

  it("traces the byte to the table and to the library, not to a library-invented filler", async () => {
    const { StaveNote, Voice, Formatter, GhostNote } = await import("vexflow/core");
    /**
     * The byte is the library's answer for a key whose third `/`-separated piece is absent: `Note.getGlyphProps`
     * hands the type `n` to `Tables.codeNoteHead`, which falls through to `noteheadBlack`; the `X2` code the cymbal
     * rows name reaches `noteheadXBlack`. `getGlyphProps` is VexFlow's own public entry to that table, so the claim
     * "U+E0A4 is the drum rows' head" is the library's arithmetic and not this file's.
     */
    expect(StaveNote.getGlyphProps("16", "n").codeHead).toBe(U.noteheadBlack);
    expect(StaveNote.getGlyphProps("16", "x2").codeHead).toBe(U.noteheadXBlack);
    // The table is read the same way round: a notehead code is present on exactly the cymbal rows.
    expect(PERCUSSION_VOICES.filter((row) => row.notehead === "x2").map((row) => row.note)).toEqual([42, 82]);
    expect(PERCUSSION_VOICES.filter((row) => row.notehead === undefined).map((row) => row.note)).toEqual([36, 38]);
    expect(PERCUSSION_VOICES.filter((row) => row.voice === 1).every((row) => row.notehead === "x2")).toBe(true);

    // And each row's key, drawn by the library on a percussion stave, is the head the row's own field claims.
    for (const row of PERCUSSION_VOICES) {
      const { host, context, stave } = await percussionHost();
      const built = new StaveNote({ keys: [row.key], duration: "16", stemDirection: row.voice === 1 ? 1 : -1 });
      const voice = new Voice({ numBeats: 4, beatValue: 4 });
      voice.setStrict(false);
      voice.addTickables([built]);
      new Formatter().joinVoices([voice]).format([voice], 200);
      voice.draw(context, stave);
      const heads = noteheadsIn(host);
      expect(heads, `${row.piece} (${row.key})`).toHaveLength(1);
      expect(heads[0]!.codepoint, `${row.piece} (${row.key})`).toBe(
        row.notehead ? U.noteheadXBlack.charCodeAt(0) : U.noteheadBlack.charCodeAt(0)
      );
    }

    /**
     * And the reading the report could not rule out — "VexFlow pads a two-voice stave with an invisible note": its
     * alignment filler is `GhostNote`, and drawing one emits no glyph at all. So a glyph on the page is always a
     * note this application asked for.
     */
    const { host, context, stave } = await percussionHost();
    const before = glyphsIn(host);
    const ghost = new GhostNote({ duration: "16" });
    ghost.setStave(stave);
    ghost.setContext(context);
    ghost.draw();
    expect(glyphsIn(host)).toEqual(before);
  });

  it("draws the same byte for the same model note on the pitched stave, which is the whole coincidence", async () => {
    /**
     * The reverse half. The pitched stave is not touched by the percussion path, and for the **same array** it must
     * still read note 38 as a pitch: all ten notes sit below `SPLIT_PITCH` (60, `ScoreV2.tsx`), so the bass stave
     * holds them and the treble stave is one whole rest — and note 38's head is the same `U+E0A4` byte, because a
     * plain filled notehead is a plain filled notehead in both readings.
     */
    const treble = planMeasure(BAR, 0, true);
    expect(treble.entries).toEqual([{ kind: "rest", duration: "wr", dots: 0, pitches: [] }]);
    const bass = planMeasure(BAR, 0, false);
    const bassNotes = bass.entries.filter((entry) => entry.kind === "note");
    expect(bassNotes.flatMap((entry) => entry.pitches)).toHaveLength(10);
    expect(bassNotes.at(-1)!.pitches).toEqual([38]);

    const { Renderer, Stave, StaveNote, Voice, Formatter, Dot } = await import("vexflow/core");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(900, 260);
    const context = renderer.getContext();
    const stave = new Stave(0, 40, STAVE_WIDTH);
    stave.addClef("bass");
    stave.setContext(context).draw();
    const keyFor = (pitch: number) =>
      `${["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"][pitch % 12]}/${Math.floor(pitch / 12) - 1}`;
    const tickables = bass.entries.map((entry) => {
      const built = new StaveNote({
        keys: entry.kind === "rest" ? ["d/3"] : entry.pitches.map((pitch) => keyFor(pitch)),
        duration: entry.duration,
        dots: entry.dots,
      });
      if (entry.dots > 0) Dot.buildAndAttach([built], { all: true });
      return built;
    });
    const voice = new Voice({ numBeats: 4, beatValue: 4 });
    voice.addTickables(tickables);
    new Formatter().joinVoices([voice]).format([voice], NOTE_WIDTH);
    voice.draw(context, stave);
    const pitchedHeads = noteheadsIn(host);
    expect(pitchedHeads).toHaveLength(10);
    expect(pitchedHeads.every((glyph) => glyph.codepoint === U.noteheadBlack.charCodeAt(0))).toBe(true);
    expect(tickables.filter((tickable) => !tickable.isRest()).at(-1)!.getKeys()).toEqual(["d/2"]);
  });
});
