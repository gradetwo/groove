/**
 * The loop-repeat ghost layer's membership test: `notes.some(...)` vs the per-render index.
 *
 * `src/components/sequencer/PianoRollLane.tsx` draws one ghost per looped repeat, and for each
 * ghost it asks "is this (step, midi) already sounding?" — `notes.some((n) => n.stepIdx ===
 * ghostStep && n.midi === note.midi)`. That is a membership test, so the `noteIndex.byCell` Map
 * the same component already builds once per `notes` change answers it in O(1). This benchmark
 * runs the *whole* ghost pass (the per-repeat `filter`, the `.some`/`Map.has` membership test and
 * the row/geometry work that follows it) for both arms on identical data and checks that they
 * decide exactly the same ghosts.
 *
 * Run:  node bench/ghostLayerLookup.js
 *
 * Sizes are the roll's real densities (an 128-step roll, ~1.6 notes/step at 200, ~6 at 768,
 * ~12 at 1500). The repeat count is the one the component actually walks:
 * `Math.ceil((stepCount - loopLen) / loopLen)` — with stepCount 128 / loopLen 16 that is 7.
 *
 * These are medians, and the box's load average is printed with them: this is a probe, not a gate
 * (see scripts/probe_import_playback_jank.mjs for why wall-clock may not be a criterion). The gate
 * is src/test/pianoRollGhostLookup.test.tsx, which counts the membership scans.
 */
import os from "node:os";

const STEP_COUNT = 128;
const LOOP_LEN = 16;
const REPEATS = Math.ceil((STEP_COUNT - LOOP_LEN) / LOOP_LEN); // 7
const CELL_W = 26;
const ROW_H = 18;

function makeNotes(n, shape) {
  return Array.from({ length: n }, (_, i) => {
    const stepIdx = i % STEP_COUNT;
    // "colliding": the looped material recurs in the region (a dense roll with repeats) — the scan
    // usually short-circuits on the first match. "distinct": nothing outside the loop carries the
    // loop's pitches — the scan walks the whole array and returns false, the worst case.
    const midi =
      shape === "colliding"
        ? 36 + ((i * 7) % 60)
        : stepIdx < LOOP_LEN
        ? 30 + (i % 12) * 8 + (stepIdx % 8)
        : 126;
    return { stepIdx, midi, gate: 0.8, velocity: 100 };
  });
}

function buildIndex(notes) {
  const byCell = new Map();
  for (const n of notes) byCell.set(`${n.stepIdx}:${n.midi}`, n);
  return { byCell };
}

/** The pitch → row lookup the gutter builds: the contiguous visible range, top pitch first. */
function makeRowIdxMap(notes) {
  const pitches = notes.map((n) => n.midi);
  const hi = Math.max(...pitches);
  const lo = Math.min(...pitches);
  const rows = [];
  for (let p = hi; p >= lo; p--) rows.push(p);
  return new Map(rows.map((p, idx) => [p, idx]));
}

/**
 * The layer as it is written today: the membership test is a scan of the whole note array, once
 * per (repeat, loop note). Returns the rendered ghost descriptors so both arms can be compared.
 */
function oldGhostLayer(notes, rowIdxMap, rowCount) {
  const out = [];
  for (let repeatIdx = 0; repeatIdx < REPEATS; repeatIdx++) {
    const offset = (repeatIdx + 1) * LOOP_LEN;
    notes
      .filter((n) => n.stepIdx < LOOP_LEN)
      .map((note) => {
        const ghostStep = note.stepIdx + offset;
        if (ghostStep >= STEP_COUNT) return null;
        if (notes.some((n) => n.stepIdx === ghostStep && n.midi === note.midi)) return null;
        const rowIdx = rowIdxMap.get(note.midi);
        if (rowIdx === undefined) return null;
        const top = rowIdx * ROW_H;
        if (top < 0 || top > rowCount * ROW_H) return null;
        out.push({ step: ghostStep, midi: note.midi, width: Math.max(CELL_W * 0.9, note.gate * CELL_W) });
        return null;
      });
  }
  return out;
}

/** The same layer with `noteIndex.byCell.has(...)` — one Map lookup per ghost. */
function newGhostLayer(notes, rowIdxMap, rowCount, index) {
  const out = [];
  for (let repeatIdx = 0; repeatIdx < REPEATS; repeatIdx++) {
    const offset = (repeatIdx + 1) * LOOP_LEN;
    notes
      .filter((n) => n.stepIdx < LOOP_LEN)
      .map((note) => {
        const ghostStep = note.stepIdx + offset;
        if (ghostStep >= STEP_COUNT) return null;
        if (index.byCell.has(`${ghostStep}:${note.midi}`)) return null;
        const rowIdx = rowIdxMap.get(note.midi);
        if (rowIdx === undefined) return null;
        const top = rowIdx * ROW_H;
        if (top < 0 || top > rowCount * ROW_H) return null;
        out.push({ step: ghostStep, midi: note.midi, width: Math.max(CELL_W * 0.9, note.gate * CELL_W) });
        return null;
      });
  }
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function timeMedian(fn, runs = 31, warm = 5) {
  let result;
  for (let i = 0; i < warm; i++) result = fn();
  const times = [];
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    result = fn();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return { ms: median(times), result, min: Math.min(...times) };
}

const load = () => os.loadavg().map((n) => n.toFixed(2)).join(" / ");
console.log(`node ${process.version} · ${os.cpus().length} cpus · load average ${load()}`);
console.log(`stepCount ${STEP_COUNT} · loop ${LOOP_LEN} · repeats ${REPEATS} · ghosts per loop note ${REPEATS}`);

for (const shape of ["colliding", "distinct"]) {
  console.log(`\n### ${shape === "colliding" ? "looped material recurs (scan short-circuits)" : "nothing collides (scan runs to the end)"}`);
  for (const n of [200, 768, 1500]) {
    const notes = makeNotes(n, shape);
    const rowIdxMap = makeRowIdxMap(notes);
    const rowCount = rowIdxMap.size;
    const index = buildIndex(notes);

    const oldOut = oldGhostLayer(notes, rowIdxMap, rowCount);
    const newOut = newGhostLayer(notes, rowIdxMap, rowCount, index);
    const same =
      oldOut.length === newOut.length &&
      oldOut.every((g, i) => g.step === newOut[i].step && g.midi === newOut[i].midi && g.width === newOut[i].width);

    const build = timeMedian(() => buildIndex(notes), 15, 3);
    const oldRun = timeMedian(() => oldGhostLayer(notes, rowIdxMap, rowCount), 15, 3);
    const newRun = timeMedian(() => newGhostLayer(notes, rowIdxMap, rowCount, index), 15, 3);

    console.log(
      `\n== ${n} notes == (loop notes ${notes.filter((x) => x.stepIdx < LOOP_LEN).length}, ghosts ${oldOut.length}, identical decisions: ${same})`
    );
    console.log(`  OLD  notes.some  per ghost : ${oldRun.ms.toFixed(3)} ms  (min ${oldRun.min.toFixed(3)})`);
    console.log(`  NEW  byCell.has  per ghost : ${newRun.ms.toFixed(3)} ms  (min ${newRun.min.toFixed(3)})`);
    console.log(`  NEW  + per-render rebuild  : ${(newRun.ms + build.ms).toFixed(3)} ms`);
    console.log(
      `  speedup (layer alone) ${(oldRun.ms / newRun.ms).toFixed(1)}x · (incl. rebuild) ${(oldRun.ms / (newRun.ms + build.ms)).toFixed(1)}x · index build ${build.ms.toFixed(3)} ms`
    );
  }
}
console.log(`\nload average after ${load()}`);
