"use strict";
// ROI #5 benchmark: chordsByBar — per-bar notes.filter (O(bars x notes)) vs one indexed pass.
// Deterministic note generator; compares OLD and NEW outputs field-by-field.

function makeNotes(count, stepCount) {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const notes = [];
  for (let i = 0; i < count; i += 1) {
    notes.push({ stepIdx: Math.floor(rnd() * stepCount), midi: 36 + Math.floor(rnd() * 48), gate: 2, velocity: 90 });
  }
  return notes;
}

const noteId = (n) => `${n.stepIdx}:${n.midi}`;
const detectChordName = (midis) => (midis.length ? `chord(${midis.length})` : ""); // stub: same input both paths

// ---- OLD: exactly what PianoRollLane.tsx does today ----
function chordsByBarOld(notes, barCount, stepsPerBar, stepCount, loopLen) {
  return Array.from({ length: barCount }, (_, barIdx) => {
    const startStep = barIdx * stepsPerBar;
    const endStep = Math.min(stepCount, startStep + stepsPerBar);
    const barNotes = notes.filter((n) => n.stepIdx >= startStep && n.stepIdx < endStep);
    const effectiveNotes =
      barNotes.length > 0
        ? barNotes
        : loopLen < stepCount
        ? notes.filter((n) => {
            const loopedStep = n.stepIdx % loopLen;
            const mapped = startStep + loopedStep;
            return mapped >= startStep && mapped < endStep;
          })
        : [];
    const midis = (effectiveNotes.length ? effectiveNotes : barNotes).map((n) => n.midi);
    const chordName = detectChordName(midis);
    return { barIdx, startStep, endStep, chordName, noteIds: barNotes.map(noteId) };
  });
}

// ---- NEW: counting-sort into one flat array (stable, original order preserved), then slice ----
function chordsByBarNew(notes, barCount, stepsPerBar, stepCount, loopLen) {
  // Pass 1: count notes per bar.
  const counts = new Int32Array(barCount);
  for (const n of notes) {
    const bar = Math.floor(n.stepIdx / stepsPerBar);
    if (bar < barCount) counts[bar] += 1;
  }
  // Prefix sums -> write offsets.
  const starts = new Int32Array(barCount);
  for (let b = 1; b < barCount; b += 1) starts[b] = starts[b - 1] + counts[b - 1];
  // Pass 2: stable scatter in original list order.
  const cursor = starts.slice();
  const flat = new Array(notes.length);
  for (const n of notes) {
    const bar = Math.floor(n.stepIdx / stepsPerBar);
    if (bar < barCount) flat[cursor[bar]++] = n;
  }
  const out = [];
  for (let barIdx = 0; barIdx < barCount; barIdx += 1) {
    const startStep = barIdx * stepsPerBar;
    const endStep = Math.min(stepCount, startStep + stepsPerBar);
    const barNotes = flat.slice(starts[barIdx], starts[barIdx] + counts[barIdx]);
    const effectiveNotes =
      barNotes.length > 0
        ? barNotes
        : loopLen < stepCount
        ? notes.filter((n) => {
            const loopedStep = n.stepIdx % loopLen;
            const mapped = startStep + loopedStep;
            return mapped >= startStep && mapped < endStep;
          })
        : [];
    const midis = (effectiveNotes.length ? effectiveNotes : barNotes).map((n) => n.midi);
    const chordName = detectChordName(midis);
    out.push({ barIdx, startStep, endStep, chordName, noteIds: barNotes.map(noteId) });
  }
  return out;
}

function run(label, fn, iters) {
  const t0 = process.hrtime.bigint();
  let res;
  for (let i = 0; i < iters; i += 1) res = fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / iters;
  return { ms, res };
}

for (const [count, stepCount, loopFrac] of [[1500, 512, 1], [4000, 1024, 0.75], [8000, 2048, 1]]) {
  const notes = makeNotes(count, stepCount);
  const stepsPerBar = 16;
  const barCount = Math.ceil(stepCount / stepsPerBar);
  const loopLen = Math.floor(stepCount * loopFrac);
  const oldR = run("old", () => chordsByBarOld(notes, barCount, stepsPerBar, stepCount, loopLen), 20);
  const newR = run("new", () => chordsByBarNew(notes, barCount, stepsPerBar, stepCount, loopLen), 20);
  const same = JSON.stringify(oldR.res) === JSON.stringify(newR.res);
  console.log(`notes=${count} steps=${stepCount} bars=${barCount} | OLD ${oldR.ms.toFixed(2)}ms  NEW ${newR.ms.toFixed(2)}ms  speedup ${(oldR.ms / newR.ms).toFixed(1)}x  same result: ${same}`);
}
