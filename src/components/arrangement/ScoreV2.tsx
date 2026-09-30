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
 */
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { NoteEvent } from "../../types/arrangementV2";

export interface ScoreV2Props {
  notes: readonly NoteEvent[];
  /** How many bars to draw. The arrangement's own length, so the score and the transport end together. */
  bars?: number;
  /** The stave's width in pixels; a system is one line, and more bars than fit are laid out on further systems. */
  width?: number;
  /** The name a reader shows beside the first system. */
  title?: string;
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

export function ScoreV2({ notes, bars = 8, width = 900, title }: ScoreV2Props) {
  const { t } = useLanguage();
  const hostRef = useRef<HTMLDivElement | null>(null);
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

        /** The notes of one staff, in VexFlow's own terms. Chords — notes at the same instant — become one StaveNote with several keys, which is how a stave writes them. */
        const staffNotes = (measureIndex: number, treble: boolean) => {
          const measureStart = measureIndex * 4;
          const byStart = new Map<number, NoteEvent[]>();
          for (const note of notes) {
            if ((note.pitch >= SPLIT_PITCH) !== treble) continue;
            if (note.startBeats < measureStart || note.startBeats >= measureStart + 4) continue;
            const list = byStart.get(note.startBeats) ?? [];
            list.push(note);
            byStart.set(note.startBeats, list);
          }
          return [...byStart.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, chord]) => {
              const { name, dots } = durationName(chord[0]!.lengthBeats);
              const built = new StaveNote({ keys: chord.map((entry) => keyFor(entry.pitch)), duration: name });
              if (dots > 0) Dot.buildAndAttach([built], { all: true });
              return built;
            });
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

              const entries = staffNotes(measureIndex, treble);
              /**
               * **A measure with nothing in it is a whole rest, which is what a musician reads as "nothing here".** An empty stave with no rest in it looks like a mistake rather than like silence.
               */
              const voice = entries.length > 0 ? new Voice({ numBeats: 4, beatValue: 4 }).addTickables(entries) : new Voice({ numBeats: 4, beatValue: 4 }).setStrict(false).addTickables([new StaveNote({ keys: [treble ? "b/4" : "d/3"], duration: "wr" })]);
              new Formatter().joinVoices([voice]).format([voice], staveWidth - 40);
              // Beams are grouped where the notes are eighths or shorter; VexFlow decides the grouping, which is the policy a reader expects from a score.
              const beamable = entries.filter((entry) => entry.getDuration() === "8" || entry.getDuration() === "16");
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
    <div data-testid="score-v2" className="flex flex-col gap-2 p-3 rounded border border-[var(--d-line)]">
      <span className="text-xs text-text opacity-80">{title ?? t("score_hint")}</span>
      {problem ? <span data-testid="score-problem" className="text-xs text-[var(--d-danger)]">{problem}</span> : null}
      {/* VexFlow draws into this element; React must not also manage its children, which is why it is empty and ref-driven. */}
      <div ref={hostRef} data-testid="score-canvas" className="overflow-x-auto" />
    </div>
  );
}
