"use strict";
// ROI #7 benchmark: visiblePitchRange — map + Math.min(...spread) vs single-pass min/max.

function makeNotes(count) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const notes = [];
  for (let i = 0; i < count; i += 1) notes.push({ stepIdx: i, midi: Math.floor(rnd() * 128) });
  return notes;
}

// OLD: current rollModel.ts implementation
function visiblePitchRangeOld(notes, padSemitones = 2, minRows = 13) {
  const pitches = notes.map((n) => n.midi);
  const lo = pitches.length ? Math.min(...pitches) : 60;
  const hi = pitches.length ? Math.max(...pitches) : 72;
  let min = lo - padSemitones;
  let max = hi + padSemitones;
  while (max - min + 1 < minRows) {
    if (min > 0) min -= 1;
    if (max - min + 1 < minRows && max < 127) max += 1;
    if (min === 0 && max === 127) break;
  }
  return [Math.max(0, min), Math.min(127, max)];
}

// NEW: single pass, no intermediate array, no spread
function visiblePitchRangeNew(notes, padSemitones = 2, minRows = 13) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of notes) {
    if (n.midi < lo) lo = n.midi;
    if (n.midi > hi) hi = n.midi;
  }
  if (!Number.isFinite(lo)) { lo = 60; hi = 72; }
  let min = lo - padSemitones;
  let max = hi + padSemitones;
  while (max - min + 1 < minRows) {
    if (min > 0) min -= 1;
    if (max - min + 1 < minRows && max < 127) max += 1;
    if (min === 0 && max === 127) break;
  }
  return [Math.max(0, min), Math.min(127, max)];
}

for (const count of [1000, 5000, 20000]) {
  const notes = makeNotes(count);
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < 50; i += 1) visiblePitchRangeOld(notes);
  const oldMs = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < 50; i += 1) visiblePitchRangeNew(notes);
  const newMs = Number(process.hrtime.bigint() - t0) / 1e6 / 50;
  const same = JSON.stringify(visiblePitchRangeOld(notes)) === JSON.stringify(visiblePitchRangeNew(notes));
  console.log(`notes=${count} | OLD ${oldMs.toFixed(3)}ms  NEW ${newMs.toFixed(3)}ms  speedup ${(oldMs / newMs).toFixed(1)}x  same result: ${same}`);
}

// Spread-limit sanity: OLD throws on huge arrays in some engines; show allocation cost instead.
const big = makeNotes(60000);
try {
  visiblePitchRangeOld(big);
  console.log("OLD at 60k notes: ok (V8 arg limit ~65k — dangerously close)");
} catch (e) {
  console.log("OLD at 60k notes: THREW", e.constructor.name, e.message);
}
visiblePitchRangeNew(big);
console.log("NEW at 60k notes: ok");
