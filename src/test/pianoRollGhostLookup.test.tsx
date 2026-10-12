/**
 * ⭐ **The looped ghost layer answers its membership test from the index, not a scan of every note.**
 *
 * `PianoRollLane` draws one ghost per looped repeat, and for each one asks "is this `(step, midi)`
 * already sounding?". Before this criterion the answer was
 * `notes.some((n) => n.stepIdx === ghostStep && n.midi === note.midi)` — an O(notes) scan once per
 * ghost, so a dense roll paid it once per loop note per repeat. The component already builds
 * `noteIndex.byCell` (a `stepIdx:midi` Map) once per change to `notes`, so the same test is one Map
 * lookup.
 *
 * The reading is a **counter, not a clock**: the test counts `Array.prototype.some` calls whose
 * receiver is an array of notes while a 128-step roll with a 16-step loop renders, and requires the
 * ghost pass to make **0** of them — while asserting the 112 ghost nodes were actually drawn, so a
 * layer that quietly stopped rendering cannot pass. With the pre-fix line the same render made
 * **112** sampled calls (measured by reverting the line), so the criterion can go red.
 *
 * Wall-clock is a probe, not the gate (`bench/ghostLayerLookup.js` measures 5-8× on this box at
 * 200/768/1500 notes; see `scripts/probe_import_playback_jank.mjs` for why a frame-rate reading may
 * never be a criterion).
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PianoRollLane } from "../components/sequencer/PianoRollLane";
import type { SequencerPattern } from "../types/genre";

const STEPS = 128;
const LOOP = 16;
const REPEATS = Math.ceil((STEPS - LOOP) / LOOP); // 7 — what the ghost layer walks

/** A 128-step track that sounds for its first 16 steps, so the ghost layer repeats 16 notes 7 times. */
function loopingPattern(): SequencerPattern {
  return {
    genre_id: "test",
    bpm: 120,
    scale: "C minor",
    resolution: "1/16",
    totalSteps: STEPS,
    tracks: [
      {
        track_id: "lead",
        name: "Lead",
        instrument: "saw_lead",
        steps: Array.from({ length: STEPS }, (_, i) => (i < LOOP ? 1 : 0)),
        pitch: Array.from({ length: STEPS }, (_, i) => (i < LOOP ? 60 + i : null)),
        gate: Array(STEPS).fill(0.8),
        velocity: Array(STEPS).fill(100),
        trackLength: LOOP,
      },
    ],
  } as unknown as SequencerPattern;
}

/**
 * Run `pass` with `Array.prototype.some` observed, and return how many of its calls scanned an array
 * of notes (`stepIdx` + `midi`). The original is restored even if `pass` throws.
 */
function noteArrayScansDuring(pass: () => void): number {
  const original = Array.prototype.some;
  let scans = 0;
  Array.prototype.some = function (this: unknown[], ...args: unknown[]) {
    const first = this[0] as { stepIdx?: unknown; midi?: unknown } | undefined;
    if (first && typeof first === "object" && "stepIdx" in first && "midi" in first) scans += 1;
    return Reflect.apply(original, this, args);
  } as unknown as typeof Array.prototype.some;
  try {
    pass();
  } finally {
    Array.prototype.some = original;
  }
  return scans;
}

describe("PianoRollLane · the looped ghost layer", () => {
  it("⭐ asks the index whether a cell is sounding instead of scanning every note", () => {
    let ghostNodes = 0;
    const scans = noteArrayScansDuring(() => {
      const { container } = render(
        <PianoRollLane
          pattern={loopingPattern()}
          activeTrackIdx={0}
          stepCount={STEPS}
          stepsPerBar={4}
          isZh
          onSelectTrack={() => {}}
          onClose={() => {}}
          commit={() => {}}
          onAudition={() => {}}
        />
      );
      // `opacity-40` is the ghost block's own class; the loop boundary only carries `border-dashed`.
      ghostNodes = container.querySelectorAll(".opacity-40").length;
    });

    // The layer really ran: 16 loop notes × 7 repeats, none colliding with a real note.
    expect(ghostNodes).toBe(LOOP * REPEATS);
    // And it never fell back to the whole-array membership scan.
    expect(scans).toBe(0);
  });
});
