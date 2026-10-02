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
 * Two more limits, added when a bar that did not add up turned out to be a crash rather than a drawing: a note held across a barline is **not** split and tied (the MusicXML writer does that; this stave does not yet), and a drum part is drawn from its own MIDI pitches on the pitched stave — the correct percussion notation needs the track's *kind*, which this component is not given. Both are stated here because the alternative is a reader believing the stave says something it does not.
 *
 * TODO(defense): **percussion staves.** A drum part's vertical position is *which instrument*, not a pitch: MusicXML says using `<pitch>` for it "would be misleading", and the correct spelling is a `percussion` clef with `<unpitched>`/`display-step` plus a notehead shape per instrument (W3C, *MusicXML 4.0 — Percussion*). Taking that on needs `trackKind` threaded from `ArrangementViewV2.tsx` into this component, and this batch is forbidden to touch that file (another workstream owns it). Guessing "this is a drum track" from the MIDI numbers would be the exact inference that page warns against, so this component does not guess.
 */
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { NoteEvent } from "../../types/arrangementV2";
import { STEP_BEATS } from "../../data/noteEvents";

export interface ScoreV2Props {
  notes: readonly NoteEvent[];
  /** How many bars to draw. The arrangement's own length, so the score and the transport end together. */
  bars?: number;
  /** The stave's width in pixels; a system is one line, and more bars than fit are laid out on further systems. */
  width?: number;
  /** The name a reader shows beside the first system. */
  title?: string;
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
  /** Read a MusicXML document (or a compressed `.mxl`) in as arrangement tracks. */
  onImportMusicXml?: (file: File) => void;
  /** True while a read or a write is in flight, so the header says it is working. */
  musicXmlBusy?: boolean;
}

/** Middle C and above is the treble staff, below it the bass — the split a piano grand staff uses, and the one a reader expects. */
const SPLIT_PITCH = 60;

/** VexFlow's own duration names, from beats. A duration with no exact written value (a triplet, a dotted value) is drawn as the next shorter written note rather than being dropped. */
function durationName(lengthBeats: number): { name: string; dots: number } {
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
function writtenBeats(name: string, dots: number): number {
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

export function ScoreV2({ notes, bars = 8, width = 900, title, onExportMusicXml, onImportMusicXml, musicXmlBusy = false }: ScoreV2Props) {
  const { t } = useLanguage();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const musicXmlInputRef = useRef<HTMLInputElement | null>(null);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void (async () => {
      try {
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
        const context = renderer.getContext();

        /**
         * **One bar of one stave, as VexFlow tickables.** The rhythm — which chords, which rests, and whether
         * the bar adds up — is decided by `planMeasure`, which is pure and has its own criteria; this only
         * translates names to `StaveNote`s.
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

        const systemsPerRow = 2;
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
  }, [notes, bars, width]);

  return (
    <div data-testid="score-v2" className="flex flex-col gap-2 rounded border border-[rgb(var(--d-line))] p-3">
      {/*
        The header, which is now the score's own interchange: the stave's title on the left, and MusicXML out and in on
        the right. 44 px, like every other target on this surface, and the hidden input is cleared after every pick so a
        second read of the same file still fires.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text opacity-80">{title ?? t("score_hint")}</span>
        {(onExportMusicXml || onImportMusicXml) && (
          <span className="ml-auto flex items-center gap-1">
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
      {/* VexFlow draws into this element; React must not also manage its children, which is why it is empty and ref-driven. */}
      <div ref={hostRef} data-testid="score-canvas" className="overflow-x-auto" />
    </div>
  );
}
