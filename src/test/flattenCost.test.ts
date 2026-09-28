import { describe, expect, it } from "vitest";
import { flattenSong } from "../data/songFlatten";
import { CLIP_SLOTS } from "../types/song";
import type { SequencerTrack } from "../types/genre";

/**
 * The flatten's **cost curve**, measured locally because it is pure data and needs no browser.
 *
 * **This is the corrected instrument.** The first version was withdrawn because its numbers contradicted themselves, and it taught two things worth keeping:
 *
 *   * **`totalSteps` is not lanes × steps.** One lane and four lanes both reported 1024 — 64 bars × 16 steps — so it counts a bar's steps and is independent of the lane
 *     count. Work is therefore counted here as `lanes × bars × stepsPerBar`, explicitly, rather than trusted from a field whose meaning is different.
 *   * **The first row is always warm-up.** One lane reported 132 ms and four lanes 3.6 ms — more work in less time — which is the JIT, not the code. A discarded warm-up
 *     pass now runs first.
 *
 * **It prints rather than gates.** Nothing here asserts a duration: a timing assertion in a unit suite is a flaky test waiting to happen, and this suite has already seen
 * what a check that fails for unrelated reasons does to people's habits. The assertions are about shape, so a crash or a silent zero still fails.
 */
const LANES_AND_BARS: ReadonlyArray<readonly [number, number]> = [
  [1, 64],
  [4, 64],
  [16, 64],
  [64, 64],
  [8, 512],
  [100, 256],
];

const track = (index: number): SequencerTrack =>
  ({
    track_id: "lead",
    name: `Lane ${index}`,
    laneId: `lane-${index}`,
    steps: Array.from({ length: 16 }, (_, step) => ({ step, pitch: 60 + (step % 8), velocity: 100, gate: 0.5 })),
  }) as unknown as SequencerTrack;

const songWith = (lanes: number, bars: number) => ({
  bpm: 120,
  clips: Object.fromEntries(CLIP_SLOTS.map((slot) => [slot, { slot, tracks: Array.from({ length: lanes }, (_, index) => track(index)) }])),
  sections: Array.from({ length: bars }, (_, index) => ({ id: `s${index}`, slot: CLIP_SLOTS[index % CLIP_SLOTS.length] as (typeof CLIP_SLOTS)[number], bars: 1 })),
  boundaries: [0],
});

describe("the flatten's cost curve", () => {
  it("measures with a warm-up, counts work explicitly, and reports what it measured", () => {
    // Warm-up on a mid-sized song, so no reading is the JIT's first impression of this code.
    for (let pass = 0; pass < 2; pass += 1) flattenSong(songWith(16, 64) as never);

    const rows = LANES_AND_BARS.map(([lanes, bars]) => {
      const song = songWith(lanes, bars);
      const started = performance.now();
      const flattened = flattenSong(song as never);
      const ms = performance.now() - started;
      // Work is counted here, not read from `totalSteps`, whose meaning is different.
      const steps = lanes * bars * 16;
      /**
       * A **size** column, because the hundred-lane question has two halves and only the time half was measured.
       *
       * `JSON.stringify(...).length` is a **proxy**, not an allocator measurement — it counts characters of the serialised form, which is honest about what it is and stable
       * to the byte, unlike a heap reading. It answers "how much data does the flatten hand to the renderer", which is the part this test can speak to; the audio buffer's own
       * footprint is the browser's and is measured elsewhere.
       */
      const megabytes = JSON.stringify(flattened).length / 1_000_000;
      return { lanes, bars, steps, ms, usPerStep: (ms * 1000) / steps, megabytes, flattenedBars: flattened.totalBars };
    });

    for (const row of rows) {
      console.log(
        `   flatten cost : ${String(row.lanes).padStart(3)} lanes × ${String(row.bars).padStart(3)} bars = ${String(row.steps).padStart(7)} steps → ${row.ms.toFixed(2).padStart(8)} ms (${row.usPerStep.toFixed(3)} µs/step), data ${row.megabytes.toFixed(2)} MB (JSON proxy)`
      );
      expect(row.flattenedBars).toBe(row.bars);
      expect(row.usPerStep).toBeGreaterThan(0);
    }

    // The projection both open questions rest on, printed with its arithmetic so it can be checked rather than believed.
    const largest = rows[rows.length - 1]!;
    const projected = (largest.usPerStep * 2048 * 100 * 16) / 1_000_000;
    console.log(`   projection   : ${largest.usPerStep.toFixed(3)} µs/step × 2048 bars × 100 lanes × 16 steps ≈ ${projected.toFixed(1)} s of flattening before any audio is rendered`);
    const perStepMb = largest.megabytes / largest.steps;
    console.log(`   projection   : data ${(perStepMb * 2048 * 100 * 16).toFixed(0)} MB of flattened steps at 2048 bars × 100 lanes (JSON proxy), against about 1.1 GB for the audio buffer of a six-minute eight-lane song`);
    console.log("   note         : the JSON figure is a proxy for the data handed to the renderer, not an allocator measurement; the audio buffer is measured in the browser.");
  });
});
