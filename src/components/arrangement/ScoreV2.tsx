/**
 * The score: the same notes, written the way a musician reads them.
 *
 * The keyboard plays and the roll writes; **this is the third way of looking at one model**, and it exists because a part that looks right in a roll can be unreadable on a stave — a melody that spans a tenth reads as a leap, a phrase that crosses a barline reads as a phrase. Logic puts the three behind
 * tabs for the same reason.
 *
 * **Drawn directly from our own notes with VexFlow**, not by writing MusicXML and having something else read it: the round trip would add a second source of truth for note positions and a document parse on every keystroke. `toMusicXml` is for **leaving the building**; this is for looking at.
 *
 * VexFlow is **imported dynamically**, which is what keeps 89 KB of engraving code out of the initial route: the app has a 226 KB first-paint budget and a 150 KB per-chunk ceiling, so a score nobody opened must not be paid for by everyone. The font is served from **our own origin** —
 * VexFlow defaults to a CDN, which is a third party learning that a person is looking at a score, and a request that fails offline.
 *
 * What this version does not do, stated rather than implied: no key signature other than C, no tuplets, no slurs, no dynamics from velocity, one voice per staff, and the notes are split treble/bass at middle C. Those are the same limits the exporter states, because they are limits of the notation layer rather than of either surface.
 *
 * Two more limits, added when a bar that did not add up turned out to be a crash rather than a drawing: a note held across a barline is **not** split and tied (the MusicXML writer does that; this stave does not yet), and a **drum part is drawn on a percussion staff** — its vertical position is *which instrument*, from the explicit table in `percussionStaff.ts`, not a pitch. The score is told the track's kind (`kind: "drumkit"`); it never infers one, for the reason the MusicXML page states: reading "is this a drum part?" off the note numbers is exactly the inference that turns a repeated hi-hat pitch into a repeated F-sharp. A drum part whose instrument is not in that table still draws — at a stated fallback, with a sentence saying which row to add — rather than dropping the note.
 *
 * What is left of the older limit, stated rather than quietly kept: a note held across a barline is still not split and tied. And the drum staff is **five lines with two voices** — the cymbal family up, the drum family down — so a kit's roles are written the way a kit is written; a part that needs a third independent line at once is not spelled yet, and neither is a percussion staff with a different number of lines (MusicXML's `<staff-lines>`).
 */
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { NoteEvent, TrackKindV2 } from "../../types/arrangementV2";
import { STEP_BEATS } from "../../data/noteEvents";
import { loadSkinPalettes, useSkin } from "../../hooks/useSkin";
import { canvasRgba, resolveCanvasColor } from "../../utils/canvasPalette";
import { percussionPlanNotices, planPercussionMeasure } from "./percussionStaff";

export interface ScoreV2Props {
  notes: readonly NoteEvent[];
  /** How many bars to draw. The arrangement's own length, so the score and the transport end together. */
  bars?: number;
  /** The stave's width in pixels; a system is one line, and more bars than fit are laid out on further systems. */
  width?: number;
  /** The name a reader shows beside the first system. */
  title?: string;
  /**
   * ⭐ **What the track *is*, so a drum part is written as a drum part.**
   *
   * The one fact this component cannot read off the notes without guessing: a drum part's vertical axis is *which
   * instrument*, and MusicXML says spelling that with `<pitch>` "would be misleading" — "an analysis program
   * looking for a series of repeated F-sharps, based on the General MIDI pitch for a closed hi-hat" is the failure
   * it names (W3C, *MusicXML 4.0 — Percussion*). So the caller says `"drumkit"` and `percussionStaff.ts` says where
   * each instrument goes; nothing here infers it from the numbers.
   *
   * Optional so the component keeps working for every existing caller, and `undefined` means "a pitched stave",
   * which is what this component drew before the prop existed.
   */
  kind?: TrackKindV2;
  /**
   * ⭐ **The score leaving the building, from the one place a score is read.**
   *
   * `toMusicXml`/`fromMusicXml` are the interchange with every notation program, and they were complete and unreachable:
   * nothing in the application imported either module, so the shipped bundle did not contain them at all. The header is
   * where they belong — a person looking at a stave is the person who wants a `.musicxml`, and the person with one in
   * hand is looking at this tab — and both are `await import`ed by the caller's handlers so neither is paid for by a
   * route that only plays music.
   */
  onExportMusicXml?: () => void;
  /** Delivered as a zip whose name says both extensions: a logicx is a directory (docs/OPEN_WORK.md 266). */
  onExportLogic?: () => void;
  /** Read a MusicXML document (or a compressed `.mxl`) in as arrangement tracks. */
  onImportMusicXml?: (file: File) => void;
  /** True while a read or a write is in flight, so the header says it is working. */
  musicXmlBusy?: boolean;
}

/** Middle C and above is the treble staff, below it the bass — the split a piano grand staff uses, and the one a reader expects. */
const SPLIT_PITCH = 60;

/**
 * ⭐ **The skin roles the stave is drawn with: one ink, and the plate it sits on.**
 *
 * Exported so the criteria drive the strings the component *actually paints with* rather than a copy of
 * them: `src/test/scoreInk.test.tsx` resolves these two roles out of every skin's palette and holds the
 * ink to a contrast floor, and it renders the component to check that the ink handed to the renderer is
 * the skin's. Renaming a role here without teaching the skins about it turns that criterion red, which is
 * the same contract `PERCUSSION_BEAM_OPTIONS` states below.
 *
 * `--d-ink` is the app's primary ink — the token `text-text` resolves through (`tailwind.config.js`), so
 * the stave is drawn in the same colour as the words beside it on every one of the six skins. `--d-surface`
 * is the plate role the arrangement's own panels name, and the canvas host carries it wrapped in `rgb()`
 * because a palette triple is not a colour (`src/test/arrangementColours.test.ts` is that guard).
 */
export const SCORE_INK_TOKEN = "--d-ink";
export const SCORE_PLATE_TOKEN = "--d-surface";

/**
 * The default skin's own `--d-ink` (`233 231 224`), as the last resort if a skin ever omits the role.
 *
 * A literal is the *wrong* answer for the ink — it is the whole defect this closes — so this is not one:
 * it is the value the eager `:root` palette in `src/styles/desktopTokens.css` always carries, and
 * `scoreInk.test.tsx` asserts that this literal and that sheet agree, so it cannot drift into a colour no
 * skin uses (black, most obviously).
 */
export const SCORE_INK_FALLBACK = "#e9e7e0";

/**
 * ⭐ **The ink the stave is drawn in, read from the skin at draw time.**
 *
 * `SVGContext` opens with `fill: 'black', stroke: 'black'` and this component used to leave it there, so
 * the stave lines, the clefs, the noteheads and the beams were black on all six skins. A stylesheet cannot
 * reach that: VexFlow writes **SVG presentation attributes**, and an attribute is invisible to the skin
 * system — which is why the skin-level criteria all passed while the score was unreadable.
 *
 * Measured on the built app before this, with the ink the browser actually painted: default 1.07:1,
 * soviet 1.25:1, pixel 1.13:1 (and the three light skins 17–20:1, which is the accident that hid the
 * defect — a hardcoded black is a skin waiting to break). The colour is therefore read from the role, for
 * the reason `src/utils/canvasPalette.ts` gives: a value the renderer cannot parse is silently ignored, so
 * the read has to produce a concrete colour. A palette **triple** (`233 231 224`) is not one, hence the
 * `rgb()` wrapper `tailwind.config.js` also writes; `resolveCanvasColor` then supplies
 * `SCORE_INK_FALLBACK` rather than a hole if the role is missing.
 */
function scoreInk(styles: CSSStyleDeclaration): string {
  const triple = styles.getPropertyValue(SCORE_INK_TOKEN).trim();
  return canvasRgba(resolveCanvasColor(`rgb(${triple})`, SCORE_INK_FALLBACK), 1);
}

/**
 * ⭐ **The options the drum staff beams with — `maintainStemDirections` is the drum staff's whole point, not a taste.**
 *
 * The drum stave sets `stemDirection` on every note from `PERCUSSION_VOICE_ORDER` (cymbals up, drums down), because
 * that separation is what makes a kit readable on one staff. `Beam.generateBeams(notes)` **without** this flag throws
 * that away: for each beam group it calls `calculateStemDirection(group)` — the sum of `line - 3` over the group — and
 * then `note.setStemDirection(...)`, so the library's "nearest to the middle" rule points the cymbal line **down** and
 * the drum line **up**, i.e. the two voices are drawn into each other. That is what put a down-stemmed x note at the
 * end of the bar a reader reported (see `docs/PERCUSSION_STAFF.md`).
 *
 * The pitched stave deliberately keeps the plain call: its notes are built **without** a `stemDirection`, so the
 * library's own default and its beaming are free to choose a direction there, and nothing about this decision may
 * reach it.
 *
 * Exported so the criterion that asserts the drawn directions drives **this object**: deleting the flag here turns
 * `percussionStems.test.tsx` red instead of quietly moving the defect back.
 */
export const PERCUSSION_BEAM_OPTIONS = { maintainStemDirections: true } as const;

/** VexFlow's own duration names, from beats. A duration with no exact written value (a triplet, a dotted value) is drawn as the next shorter written note rather than being dropped. */
export function durationName(lengthBeats: number): { name: string; dots: number } {
  const table: [number, string][] = [
    [4, "w"],
    [3, "h"],
    [2, "h"],
    [1.5, "q"],
    [1, "q"],
    [0.75, "8"],
    [0.5, "8"],
    [0.375, "16"],
    [0.25, "16"],
  ];
  const found = table.find(([beats]) => Math.abs(beats - lengthBeats) < 1e-6);
  if (found) {
    // A dotted note is a written name plus a dot, which is what a reader expects for 1.5, 3 and 0.75 beats.
    const dotted = [3, 1.5, 0.75, 0.375].some((beats) => Math.abs(beats - lengthBeats) < 1e-6);
    return { name: found[1], dots: dotted ? 1 : 0 };
  }
  return { name: "16", dots: 0 };
}

/** `c/4` for MIDI 60 — the key name VexFlow wants, which is the same spelling the exporter uses. */
function keyFor(pitch: number): string {
  const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  return `${names[pitch % 12]}/${Math.floor(pitch / 12) - 1}`;
}

/** The written value of every name `durationName` can return, in beats. */
const WRITTEN_BEATS: Record<string, number> = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25 };

/** What a written name is worth: the name's value, and a dot adds half of it. */
export function writtenBeats(name: string, dots: number): number {
  return (WRITTEN_BEATS[name] ?? STEP_BEATS) * (dots > 0 ? 1.5 : 1);
}

/**
 * ⭐ **The rests that fill a gap, written from the beat down so the bar stays countable.**
 *
 * The rule this replaces ("a voice with four beats, or an error") came from the library rather than from music:
 * VexFlow's `Formatter` refuses a STRICT voice whose tickables do not add up to the time signature, and the
 * starter content of every new track — four sixteenths, one per beat — adds up to one beat. So the third
 * reading of the model was the only one that showed the user a runtime error instead of their notes.
 *
 * **How notation software answers the same question, and why this is the answer taken.** *MuseScore Studio*
 * models such a bar as a **non-metered measure**: "a measure which is less or greater in duration than the
 * indicated time signature", normally reserved for a **pickup/anacrusis at the beginning of a score or
 * section**, and otherwise flagged with a small `+`/`−` above the bar
 * (<https://handbook.musescore.org/notation/rhythm-meter-and-measures/pickup-and-non-metered-measures.md>,
 * <https://handbook.musescore.org/notation/rhythm-meter-and-measures/measure-properties.md>). Our bars are not
 * pickups — the content can be short in any of the eight bars — and this project's **own** MusicXML writer
 * already decided the general rule for the same model: "空隙写成休止符——记谱里没有'洞'，小节缺的部分就是
 * 休止符" (`docs/SCORE_AND_MUSICXML.md`, decision 2). The score and the exported document are two readings of
 * one array, so they must not disagree about whether the silence exists.
 *
 * A dotted rest is used only for the 0.75-beat remainder, where no plain written rest exists.
 */
export function restsFor(beats: number): Array<{ duration: string; dots: number }> {
  const rests: Array<{ duration: string; dots: number }> = [];
  // Snapped to the sixteenth grid first: everything else in this file works on that grid, and a rest of
  // 0.249999 beats is a rest VexFlow would place by ticks and no reader would ask for.
  let left = Math.round(beats / STEP_BEATS) * STEP_BEATS;
  while (left >= 1 - 1e-9) {
    rests.push({ duration: "qr", dots: 0 });
    left -= 1;
  }
  if (left > 0.5 + 1e-9) rests.push({ duration: "8r", dots: 1 });
  else if (left > 0.25 + 1e-9) rests.push({ duration: "8r", dots: 0 });
  else if (left > 1e-9) rests.push({ duration: "16r", dots: 0 });
  return rests;
}

/** One thing written in a bar: a chord (`pitches` non-empty) or a rest. */
export interface ScoreMeasureEntry {
  kind: "note" | "rest";
  /** A VexFlow duration name: `w`, `h`, `q`, `8`, `16` — and a rest's name carries its own `r` (`wr`, `qr`, `8r`, `16r`). */
  duration: string;
  dots: number;
  /** The chord's pitches, in the model's order; empty for a rest. */
  pitches: number[];
}

export interface ScoreMeasurePlan {
  entries: ScoreMeasureEntry[];
  /**
   * True when the entries add up to exactly one bar and the voice may stay STRICT. False when the notes
   * overlap more than one voice per staff can write: the entries are then drawn SOFT so that **no note is
   * dropped** — see `planMeasure`.
   */
  complete: boolean;
}

/**
 * **What one bar of one stave reads as**, as pure data, so the arithmetic can be judged without an engraver.
 *
 * Three decisions are made here and nowhere else:
 *
 * 1. **Chords.** Notes that begin together are one entry with several pitches, which is how a stave writes them.
 * 2. **Notes are never dropped.** A note whose written value would run past the barline is not removed and not
 *    quietly shortened — the plan stops being "complete" instead, and the caller engraves it SOFT. That is the
 *    one case where this bar is a *non-metered* measure in MuseScore's sense; a strict voice would throw
 *    `IncompleteVoice`/`Too many ticks` and take the whole score, not just the bar, with it.
 * 3. **Silence is written.** Gaps and the rest of the bar are rests of exactly the missing length, so a bar
 *    that is short on content still adds up — see `restsFor` for the sources behind that choice.
 *
 * Positions are snapped to the sixteenth grid (`STEP_BEATS`) and never placed before the previous entry: the
 * model can hold a note between grid lines, and the stave has one voice per staff. The snapping is the same
 * rounding the roll's step view applies, and it is stated rather than hidden.
 */
export function planMeasure(
  notes: readonly NoteEvent[],
  measureIndex: number,
  treble: boolean,
  beatsPerBar = 4
): ScoreMeasurePlan {
  const measureStart = measureIndex * beatsPerBar;
  const measureEnd = measureStart + beatsPerBar;

  const groups = new Map<number, { pitches: number[]; lengthBeats: number }>();
  for (const note of notes) {
    if ((note.pitch >= SPLIT_PITCH) !== treble) continue;
    if (note.startBeats < measureStart || note.startBeats >= measureEnd) continue;
    const group = groups.get(note.startBeats);
    if (group) group.pitches.push(note.pitch);
    // The group's written length is its first note's, which is what this score has always used for a chord.
    else groups.set(note.startBeats, { pitches: [note.pitch], lengthBeats: note.lengthBeats });
  }

  /** A bar with nothing in it is a whole rest, which is what a musician reads as "nothing here". */
  if (groups.size === 0) {
    return { entries: [{ kind: "rest", duration: "wr", dots: 0, pitches: [] }], complete: true };
  }

  const scored = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, group]) => {
      const { name, dots } = durationName(group.lengthBeats);
      return { start, name, dots, pitches: group.pitches };
    });

  const written: Array<{ at: number; name: string; dots: number; pitches: number[] }> = [];
  let cursor = measureStart;
  for (const chord of scored) {
    const snapped = Math.round(chord.start / STEP_BEATS) * STEP_BEATS;
    const at = Math.max(cursor, Math.min(snapped, measureEnd - STEP_BEATS));
    written.push({ at, name: chord.name, dots: chord.dots, pitches: chord.pitches });
    cursor = at + writtenBeats(chord.name, chord.dots);
  }

  if (cursor > measureEnd + 1e-9) {
    /** Overlapping notes this one-voice stave cannot spell: keep every note and let the voice be SOFT. */
    return {
      entries: written.map(({ name, dots, pitches }) => ({ kind: "note" as const, duration: name, dots, pitches })),
      complete: false,
    };
  }

  const entries: ScoreMeasureEntry[] = [];
  let at = measureStart;
  for (const chord of written) {
    for (const rest of restsFor(chord.at - at)) entries.push({ kind: "rest", ...rest, pitches: [] });
    entries.push({ kind: "note", duration: chord.name, dots: chord.dots, pitches: chord.pitches });
    at = chord.at + writtenBeats(chord.name, chord.dots);
  }
  for (const rest of restsFor(measureEnd - at)) entries.push({ kind: "rest", ...rest, pitches: [] });
  return { entries, complete: true };
}

export function ScoreV2({ notes, bars = 8, width = 900, title, kind, onExportMusicXml,
  onExportLogic, onImportMusicXml, musicXmlBusy = false }: ScoreV2Props) {
  const { t } = useLanguage();
  /**
   * ⭐ **Which skin is on, as a value the drawing effect depends on.**
   *
   * The ink is baked into the SVG when the stave is drawn, so a skin switch has to redraw: the alternative
   * is a score wearing the previous skin's ink, which on `default` → `minimal` is light-on-white. `useSkin`
   * is the app's own signal for that — it re-reads the stored preference when the picker publishes the
   * change, exactly as the Settings panel does.
   */
  const { skin } = useSkin();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const musicXmlInputRef = useRef<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  /**
   * What a drum part could not place — computed here rather than inside the drawing, because it is a fact about the
   * notes and the table and not about the renderer: an empty array means every instrument is a row of the table.
   */
  const percussionNotices = kind === "drumkit" ? percussionPlanNotices(notes) : [];

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void (async () => {
      try {
        /**
         * ⭐ **The palette before the ink, because a role read is not a stylesheet.**
         *
         * A non-default skin's `--d-*` values live in the lazily-imported `desktopSkins.css`, and `useSkin`
         * pulls that sheet in when it applies the attribute. `getComputedStyle` asked on the same tick still
         * answers with the *default* skin's palette, so a redraw that read the ink immediately would bake in
         * the previous skin's colour and never repaint — light ink on white paper on `default` → `minimal`.
         * Awaiting the same module is free: the browser has it cached after the first switch.
         */
        if (skin !== "default") await loadSkinPalettes();
        if (cancelled) return;

        /**
         * ⭐ **`vexflow/core` and a self-hosted font — not `vexflow/bravura`.**
         *
         * The two entries differ in exactly one way and it is the one that matters here: `vexflow/bravura` **embeds the font as base64 in the bundle**, which took this chunk to **381 KB gzip** against a 150 KB ceiling. `vexflow/core` fetches the same glyphs over HTTP from `Font.HOST_URL`, and the font is
         * a 247 KB asset on **our own origin** rather than a request to a CDN that tells a third party a score is being read.
         */
        const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Dot, Barline, Font } = await import("vexflow/core");
        Font.HOST_URL = "/fonts/";
        await Font.load("Bravura", Font.HOST_URL + "bravura/bravura.woff2");
        if (cancelled) return;

        host.innerHTML = "";
        const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
        const systems = Math.max(1, Math.ceil(bars / 4));
        const height = systems * 220 + 40;
        renderer.resize(width, height);
        /**
         * ⭐ **The skin's ink, on the element every shape inherits it from.**
         *
         * `SVGContext`'s constructor writes `fill`/`stroke` onto the renderer's own `<svg>` and lets its
         * groups and shapes inherit them (a group only re-declares an attribute that *differs* from its
         * parent's — `SVGContext.applyAttributes`), which is why the whole stave is one colour and nothing
         * in the drawing has to be taught about it. Overriding those two attributes here, before a single
         * tickable is drawn, therefore recolours the entire stave; the criterion in
         * `src/test/scoreInk.test.tsx` reads them back off this element, and
         * `scripts/measure_score_ink.mjs` reads what the browser then paints on the built app.
         */
        const ink = scoreInk(getComputedStyle(host));
        const svgRoot = host.querySelector("svg");
        svgRoot?.setAttribute("fill", ink);
        svgRoot?.setAttribute("stroke", ink);
        /**
         * ⭐ **The ledger lines are the one part of the stave VexFlow colours itself.**
         *
         * `Stave` ships `defaultLedgerLineStyle = { strokeStyle: '#444', lineWidth: 2 }`
         * (`vexflow/build/esm/src/stave.js`), so the short lines that carry a middle C below the treble staff
         * were a fixed grey — **1.75:1** on the default skin's plate, unreadable for the same reason the rest
         * of the stave was, and measured as a *second* ink on one stave by `scripts/measure_score_ink.mjs`
         * until this line existed. It is a per-stave setting, which is why it is applied to each one.
         *
         * The call is guarded: this sits inside the try/catch whose failure mode is "the score did not draw",
         * and a renderer that does not offer the setter should keep VexFlow's own default rather than lose the
         * whole stave over a ledger-line style.
         */
        const inkLedgerLines = (stave: InstanceType<typeof Stave>, ink: string) => {
          stave.setDefaultLedgerLineStyle?.({ strokeStyle: ink, lineWidth: 2 });
        };
        const context = renderer.getContext();

        /**
         * **One bar of one stave, as VexFlow tickables.** The rhythm — which chords, which rests, and whether
         * the bar adds up — is decided by `planMeasure` (pitched) or `planPercussionMeasure` (a drum part), both of
         * which are pure and have their own criteria; this only translates names to `StaveNote`s.
         */
        const staffEntries = (measureIndex: number, treble: boolean) => {
          const plan = planMeasure(notes, measureIndex, treble);
          const tickables = plan.entries.map((entry) => {
            /**
             * ⭐ **`dots` is passed to the constructor as well as drawn.** In VexFlow the option on the note is
             * what changes its **tick value** (`Note.parseNoteStruct` adds half again per dot), while
             * `Dot.buildAndAttach` only attaches the glyph. The old code drew the dot without telling the note
             * about it, so a dotted quarter counted as one beat — a second way for a bar to stop adding up.
             */
            const built = new StaveNote({
              keys: entry.kind === "rest" ? [treble ? "b/4" : "d/3"] : entry.pitches.map((pitch) => keyFor(pitch)),
              duration: entry.duration,
              dots: entry.dots,
            });
            if (entry.dots > 0) Dot.buildAndAttach([built], { all: true });
            return built;
          });
          return { plan, tickables };
        };

        /**
         * ⭐ **The drum staff: a percussion clef, two voices, and `planPercussionMeasure`'s keys.**
         *
         * Three things differ from `staffEntries` and nothing else. The **key is the table's position**, not a pitch
         * name — so a kick is written where the bass drum goes instead of where note 36 sits; **each note carries its
         * own voice's stem direction**, because a kit's vertical axis is an instrument and Auto would flip a
         * kick-and-hat bar's stems on every hit; and the bar is **two voices**, which is the arithmetic rather than a
         * flourish: a `StaveNote` has one stem, so a kick and a hat on one beat cannot be one note written
         * correctly (see `percussionStaff.ts`). The rest of the translation — dots on the constructor, the rest's own
         * position — is the same code path as the pitched stave, so the two cannot disagree about a bar's arithmetic.
         */
        const percussionVoices = (measureIndex: number, staveWidth: number) => {
          const plans = planPercussionMeasure(notes, measureIndex, 4, { durationName, writtenBeats, restsFor });
          return plans.map((plan) => {
            const tickables = plan.entries.map((entry) => {
              const built = new StaveNote({
                // A rest needs a position on the stave like any other note; `b/4` is the middle line, which is where
                // a rest is written on a percussion staff as much as on a treble one.
                keys: entry.kind === "rest" ? ["b/4"] : entry.keys,
                duration: entry.duration,
                dots: entry.dots,
                // `Stem.UP` is 1 and `Stem.DOWN` is -1; the literals are used because `Stem` is not destructured here.
                stemDirection: plan.stems === "up" ? 1 : -1,
              });
              if (entry.dots > 0) Dot.buildAndAttach([built], { all: true });
              return built;
            });
            /**
             * **Each voice keeps its own strictness.** A voice whose entries add up stays STRICT (so VexFlow's own
             * tick check remains a live assertion about this stave), and the one that cannot — overlapping hits one
             * line cannot spell — goes SOFT so its notes stay on the page instead of becoming an error message.
             */
            const voice = new Voice({ numBeats: 4, beatValue: 4 });
            if (!plan.complete) voice.setStrict(false);
            voice.addTickables(tickables);
            return { plan, tickables, voice };
          });
        };

        const systemsPerRow = 2;
        /**
         * **Two staves for a pitched part, one for a drum part.** This is the whole of the difference in layout: a
         * grand staff exists because a keyboard's two hands are written apart, and a drum kit is one player on one
         * instrument, so a drum part on two staves would be a vertical axis that means nothing. The drum stave sits
         * where the treble one does inside its system's band, so the systems land on the same rows either way.
         */
        if (kind === "drumkit") {
          for (let system = 0; system < systems; system += 1) {
            const x = (system % systemsPerRow) * (width / systemsPerRow);
            const y = Math.floor(system / systemsPerRow) * 220 + 20;
            const measuresInSystem = Math.min(4, bars - system * 4);

            for (let measure = 0; measure < measuresInSystem; measure += 1) {
              const measureIndex = system * 4 + measure;
              const staveWidth = width / systemsPerRow / measuresInSystem;
              const stave = new Stave(x + measure * staveWidth, y, staveWidth);
              inkLedgerLines(stave, ink);
              if (measure === 0) {
                stave.addClef("percussion");
                if (system === 0) stave.addTimeSignature("4/4");
              }
              if (measure === measuresInSystem - 1) stave.setEndBarType(Barline.type.END);
              stave.setContext(context).draw();

              const voices = percussionVoices(measureIndex, staveWidth);
              /**
               * **Both voices are formatted together**, which is what makes them one staff: `joinVoices` is where
               * VexFlow resolves the two lines against each other, and formatting them separately would let them
               * overlap. The width left for the notes is the stave minus the same margin the pitched staves use.
               */
              const formatter = new Formatter();
              const built = voices.map(({ voice }) => voice);
              formatter.joinVoices(built).format(built, staveWidth - 40);
              for (const { tickables, voice } of voices) {
                const beamable = tickables.filter((entry) => !entry.isRest() && (entry.getDuration() === "8" || entry.getDuration() === "16"));
                // ⭐ The one call that differs from the pitched stave: the drum voices keep the stems the table set.
                if (beamable.length > 1) Beam.generateBeams(beamable, PERCUSSION_BEAM_OPTIONS);
                voice.draw(context, stave);
              }
            }
          }
          setProblem(undefined);
          return;
        }

        for (let system = 0; system < systems; system += 1) {
          const x = (system % systemsPerRow) * (width / systemsPerRow);
          const y = Math.floor(system / systemsPerRow) * 220 + 20;
          const measuresInSystem = Math.min(4, bars - system * 4);

          for (const treble of [true, false]) {
            const staveY = y + (treble ? 0 : 110);
            for (let measure = 0; measure < measuresInSystem; measure += 1) {
              const measureIndex = system * 4 + measure;
              const staveWidth = width / systemsPerRow / measuresInSystem;
              const stave = new Stave(x + measure * staveWidth, staveY, staveWidth);
              inkLedgerLines(stave, ink);
              // The clef and the time signature belong on the first measure of the system, and the bar number on the first of the piece.
              if (measure === 0) {
                stave.addClef(treble ? "treble" : "bass");
                if (system === 0 && treble) stave.addTimeSignature("4/4");
              }
              if (measure === measuresInSystem - 1) stave.setEndBarType(Barline.type.END);
              stave.setContext(context).draw();

              const { plan, tickables } = staffEntries(measureIndex, treble);
              /**
               * **The bar is complete by construction, so the voice stays STRICT** — and a bar that genuinely
               * cannot add up (overlapping notes, which one voice per staff cannot spell) is the only one drawn
               * SOFT, so that its notes stay on the page instead of becoming an error message.
               */
              const voice = new Voice({ numBeats: 4, beatValue: 4 });
              if (!plan.complete) voice.setStrict(false);
              voice.addTickables(tickables);
              new Formatter().joinVoices([voice]).format([voice], staveWidth - 40);
              // Beams are grouped where the notes are eighths or shorter; VexFlow decides the grouping, which is the policy a reader expects from a score. Rests are never beamed.
              const beamable = tickables.filter((entry) => !entry.isRest() && (entry.getDuration() === "8" || entry.getDuration() === "16"));
              if (beamable.length > 1) Beam.generateBeams(beamable);
              voice.draw(context, stave);
            }
          }
        }
        setProblem(undefined);
      } catch (error) {
        // Reported rather than swallowed: a score that fails to draw is a bug, and an empty box is not a bug report.
        if (!cancelled) setProblem((error as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [notes, bars, width, kind, skin]);

  return (
    <div data-testid="score-v2" className="flex flex-col gap-2 rounded border border-[rgb(var(--d-line))] p-3">
      {/*
        The header, which is now the score's own interchange: the stave's title on the left, and MusicXML out and in on
        the right. 44 px, like every other target on this surface, and the hidden input is cleared after every pick so a
        second read of the same file still fires.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text opacity-80">{title ?? t("score_hint")}</span>
        {(onExportMusicXml || onImportMusicXml || onExportLogic) && (
          <span className="ml-auto flex items-center gap-1">
            {onExportLogic && (
              <button
                type="button"
                data-testid="score-export-logic"
                onClick={onExportLogic}
                disabled={musicXmlBusy}
                className="h-11 shrink-0 rounded border border-[rgb(var(--d-line))] px-2 text-xs text-text disabled:opacity-50"
                title={t("arrangement_logic_export")}
              >
                {t("arrangement_logic_export")}
              </button>
            )}
            {onExportMusicXml && (
              <button
                type="button"
                data-testid="score-export-musicxml"
                onClick={onExportMusicXml}
                disabled={musicXmlBusy}
                className="h-11 shrink-0 rounded border border-[rgb(var(--d-line))] px-2 text-xs text-text disabled:opacity-50"
                title={t("arrangement_musicxml_export")}
              >
                {t("arrangement_musicxml_export")}
              </button>
            )}
            {onImportMusicXml && (
              <>
                <input
                  ref={musicXmlInputRef}
                  data-testid="score-import-musicxml-input"
                  type="file"
                  accept=".musicxml,.xml,.mxl"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onImportMusicXml(file);
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  data-testid="score-import-musicxml"
                  onClick={() => musicXmlInputRef.current?.click()}
                  disabled={musicXmlBusy}
                  className="h-11 shrink-0 rounded border border-[rgb(var(--d-line))] px-2 text-xs text-text disabled:opacity-50"
                  title={t("arrangement_musicxml_import")}
                >
                  {t("arrangement_musicxml_import")}
                </button>
              </>
            )}
          </span>
        )}
      </div>
      {problem ? <span data-testid="score-problem" className="text-xs text-[rgb(var(--d-danger))]">{problem}</span> : null}
      {/**
       * ⭐ **An instrument the table does not place is said out loud, on the score.**
       *
       * The note is still drawn — at `percussionStaff.ts`'s stated fallback, never dropped — but a drum part that
       * quietly wrote its shaker where the snare goes would be the exact defect this project keeps naming: a reading
       * that looks like an answer. So the fallback is stated, with the file and the row to add, which is what makes
       * it a next step rather than an apology.
       */}
      {percussionNotices.length > 0 ? (
        <ul data-testid="score-percussion-notices" className="flex flex-col gap-1 text-xs text-text opacity-80">
          {percussionNotices.map((notice) => (
            <li key={notice} data-testid="score-percussion-notice">
              {notice}
            </li>
          ))}
        </ul>
      ) : null}
      {/*
        VexFlow draws into this element; React must not also manage its children, which is why it is empty and ref-driven.

        ⭐ **The plate is the skin's, and it is a plate because the ink needs a known ground.** This host had no
        ground of its own, so the stave fell through to whatever ancestor painted last — which, with the
        arrangement dock's own `rgb()`-less plate being a declaration the browser drops, was the page. Naming
        the surface role here is what makes "the ink's contrast" a fact about two tokens instead of a fact
        about a cascade; `scoreInk.test.tsx` holds the pair to the WCAG floor on every skin.

        The class is written out rather than built from `SCORE_PLATE_TOKEN`, because Tailwind generates a
        utility by *reading the source text*: a template literal compiles to nothing. The criterion is what
        keeps the two in step.
      */}
      <div ref={hostRef} data-testid="score-canvas" className="overflow-x-auto bg-[rgb(var(--d-surface))]" />
    </div>
  );
}
