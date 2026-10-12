/**
 * **The drum staff's stems, after beaming — the half the earlier criterion could not see.**
 *
 * `percussionStaff.ts` decides the *written* voice split: cymbals (voice 1) up, drums (voice 2) down, and
 * `ScoreV2` sets `stemDirection` on every note from `PERCUSSION_VOICE_ORDER`. The criterion that already existed
 * ("accepts the two voices of a kit under the one formatter, with the stems the table asks for") reads
 * `getStemDirection()` **before any beaming** — and `ScoreV2` beams **after** formatting. That blind spot was not
 * theoretical: `Beam.generateBeams(notes)` with no options replaces every beamed note's direction with
 * `calculateStemDirection(group)` (the sum of `line - 3` over the group), which points the cymbal line down and the
 * drum line up — the exact inverse of the table — and it is why a reported picture had a down-stemmed x note at the
 * end of a bar.
 *
 * So this file does the one thing the old criterion could not: it drives the **real `ScoreV2` component** (real
 * `vexflow/core`, real beaming, the real branch that calls `Beam.generateBeams`) and reads the direction each note
 * is left with **after** the beam, through a spy on `StaveNote.prototype.setStemDirection` — the method both the
 * note's constructor and `Beam.applyStemDirection` go through, in that order.
 *
 * The second criterion is the reverse half, and it is a real discriminator rather than a repetition: on the
 * **pitched** stave the notes are built **without** a `stemDirection`, so VexFlow's constructor leaves them up and
 * its beaming is free to move a high group down. If `PERCUSSION_BEAM_OPTIONS` ever leaked into the pitched branch,
 * those notes would keep the constructor's up and this criterion would go red.
 *
 * jsdom has no `FontFace` and no `document.fonts`, so `ScoreV2`'s `Font.load` rejects and the component reports it
 * instead of drawing. The polyfill below is the whole of what the library's `Font.load` needs (a constructor and
 * `.load()`, plus a `fonts.add`); it is installed for the length of one criterion and taken back down.
 */
import { describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import { ScoreV2 } from "../components/arrangement/ScoreV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import { PERCUSSION_VOICE_ORDER } from "../components/arrangement/percussionStaff";
import type { NoteEvent } from "../types/arrangementV2";

const note = (pitch: number, startBeats: number, lengthBeats = 0.25): NoteEvent => ({
  pitch,
  startBeats,
  lengthBeats,
  velocity: 100,
});

/** The bar the glyph criteria use: hats on every eighth, a kick on the downbeat, a snare on the last sixteenth. */
const DRUM_BAR: NoteEvent[] = [
  ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((beats) => note(42, beats)),
  note(36, 0),
  note(38, 3.75),
];

/** A pitched bar whose beamed group sits above the middle line, so VexFlow's own rule moves it down. */
const PITCHED_BAR: NoteEvent[] = [note(84, 0), note(84, 0.25), note(88, 0.5), note(84, 0.75)];

/**
 * **Every direction each note was given, in order, while the component drew.** The recorder lives on the library's
 * prototype, so it sees exactly the calls the component's notes receive — the constructor's `stemDirection` first,
 * VexFlow's modifier-context adjustments next, and `Beam.applyStemDirection` last.
 */
interface Recorder {
  notes: Array<{ isRest: () => boolean; getKeys: () => string[] }>;
  directions: WeakMap<object, number[]>;
  restore: () => void;
}

async function recordStemDirections(): Promise<Recorder> {
  const { StaveNote } = await import("vexflow/core");
  type StemNote = { setStemDirection: (direction: number) => unknown };
  const prototype = StaveNote.prototype as unknown as StemNote;
  const original = prototype.setStemDirection;
  const directions = new WeakMap<object, number[]>();
  const notes: Recorder["notes"] = [];
  prototype.setStemDirection = function patched(this: object, direction: number) {
    const recorded = directions.get(this);
    if (recorded) recorded.push(direction);
    else {
      directions.set(this, [direction]);
      notes.push(this as Recorder["notes"][number]);
    }
    return original.call(this, direction);
  };
  return {
    notes,
    directions,
    restore: () => {
      prototype.setStemDirection = original;
    },
  };
}

/** jsdom has neither API the library's `Font.load` asks for; this is the smallest pair that satisfies it. */
async function withFontLoading<T>(body: () => Promise<T>): Promise<T> {
  const globalScope = globalThis as { FontFace?: unknown };
  // `document.fonts` is typed as a real `FontFaceSet` in lib.dom, so it is erased before the stand-in is put in.
  const documentScope = document as unknown as { fonts?: { add: (font: unknown) => void } };
  const originalFontFace = globalScope.FontFace;
  const originalFonts = documentScope.fonts;
  globalScope.FontFace = class {
    load() {
      return Promise.resolve(this);
    }
  };
  documentScope.fonts = { add: () => undefined };
  try {
    return await body();
  } finally {
    globalScope.FontFace = originalFontFace;
    documentScope.fonts = originalFonts;
  }
}

/** Render the component and hand back the recorder, once VexFlow has drawn. */
async function renderAndRecord(notes: NoteEvent[], kind?: "drumkit") {
  const recorder = await recordStemDirections();
  try {
    const { container } = render(
      <LanguageProvider>
        <ScoreV2 notes={notes} bars={1} width={900} kind={kind} />
      </LanguageProvider>
    );
    await waitFor(
      () => {
        expect(container.querySelector("[data-testid=score-canvas] svg")).toBeTruthy();
      },
      { timeout: 20000 }
    );
    expect(container.querySelector("[data-testid=score-problem]")).toBeNull();
  } catch (error) {
    recorder.restore();
    throw error;
  }
  return recorder;
}

const finalDirection = (recorder: Recorder, item: object) => recorder.directions.get(item)!.at(-1);
const firstDirection = (recorder: Recorder, item: object) => recorder.directions.get(item)![0];

describe("a drum staff's stems survive beaming", () => {
  it("keeps every voice's stems pointing the way PERCUSSION_VOICE_ORDER says, after Beam.generateBeams", async () => {
    await withFontLoading(async () => {
      const recorder = await renderAndRecord(DRUM_BAR, "drumkit");
      try {
        const written = recorder.notes.filter((item) => !item.isRest());
        const cymbals = written.filter((item) => item.getKeys().every((key) => key.endsWith("/x2")));
        const drums = written.filter((item) => item.getKeys().every((key) => !key.endsWith("/x2")));

        // The bar really does hold both voices, so the claim below is about two lines and not one.
        expect(cymbals).toHaveLength(8);
        expect(drums).toHaveLength(2);

        const up = PERCUSSION_VOICE_ORDER.find((order) => order.voice === 1)!.stems === "up" ? 1 : -1;
        const down = PERCUSSION_VOICE_ORDER.find((order) => order.voice === 2)!.stems === "up" ? 1 : -1;
        expect(up).toBe(1);
        expect(down).toBe(-1);

        /**
         * ⭐ **The assertion the old criterion could not make.** Every note is read *after* the beam, and the last
         * beat's hat — the x notehead at the end of the bar in the reported picture — is in `cymbals`, so it is
         * pinned too. Without `maintainStemDirections` this fails with the two arrays swapped.
         */
        for (const item of cymbals) expect(finalDirection(recorder, item), item.getKeys().join("+")).toBe(up);
        for (const item of drums) expect(finalDirection(recorder, item), item.getKeys().join("+")).toBe(down);
      } finally {
        recorder.restore();
      }
    });
  });

  it("leaves the pitched stave to VexFlow's own choice, which the drum options must never reach", async () => {
    await withFontLoading(async () => {
      const recorder = await renderAndRecord(PITCHED_BAR);
      try {
        const written = recorder.notes.filter((item) => !item.isRest());
        expect(written.length).toBeGreaterThan(1);
        /**
         * The reverse half. The pitched path passes no `stemDirection`, so the constructor leaves every note up
         * (VexFlow's default) and beaming is free to move the group; these notes sit above the middle line, so the
         * library's rule turns them down. With the drum option applied here they would stay up — which is the leak
         * this criterion exists to catch.
         */
        expect(written.some((item) => firstDirection(recorder, item) === 1)).toBe(true);
        for (const item of written) expect(finalDirection(recorder, item), item.getKeys().join("+")).toBe(-1);
      } finally {
        recorder.restore();
      }
    });
  });
});
