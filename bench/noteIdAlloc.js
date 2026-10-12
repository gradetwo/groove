"use strict";
// ROI #6 benchmark: per-frame selection check over all notes.
// OLD: selectedSet.has(noteId(n)) — builds a template string per note per frame.
// NEW: selectedSet.has(ids[i])   — ids cached once when `notes` changes.

function makeNotes(count) {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const notes = [];
  for (let i = 0; i < count; i += 1) notes.push({ stepIdx: Math.floor(rnd() * 512), midi: 36 + Math.floor(rnd() * 48) });
  return notes;
}
const noteId = (n) => `${n.stepIdx}:${n.midi}`;

for (const count of [1500, 4000, 8000]) {
  const notes = makeNotes(count);
  const selection = notes.slice(0, Math.floor(count / 3)).map(noteId);
  const selectedSet = new Set(selection);
  const ids = notes.map(noteId); // cached at notes-change time (amortised to zero per steady-state frame)

  const FRAMES = 60;
  let t0 = process.hrtime.bigint();
  let hitsOld = 0;
  for (let f = 0; f < FRAMES; f += 1) for (const n of notes) if (selectedSet.has(noteId(n))) hitsOld += 1;
  const oldMs = Number(process.hrtime.bigint() - t0) / 1e6;

  t0 = process.hrtime.bigint();
  let hitsNew = 0;
  for (let f = 0; f < FRAMES; f += 1) for (let i = 0; i < notes.length; i += 1) if (selectedSet.has(ids[i])) hitsNew += 1;
  const newMs = Number(process.hrtime.bigint() - t0) / 1e6;

  console.log(`notes=${count} x ${FRAMES} frames | OLD ${oldMs.toFixed(1)}ms  NEW ${newMs.toFixed(1)}ms  speedup ${(oldMs / newMs).toFixed(1)}x  same hits: ${hitsOld === hitsNew}`);
}

// Allocation evidence: measure heap growth from the string churn alone.
if (global.gc) global.gc();
const before = process.memoryUsage().heapUsed;
const notes = makeNotes(8000);
const sel = new Set([noteId(notes[0])]);
for (let f = 0; f < 60; f += 1) for (const n of notes) sel.has(noteId(n));
const after = process.memoryUsage().heapUsed;
console.log(`OLD path, 60 frames x 8000 notes: ~${((after - before) / 1048576).toFixed(1)}MB of short-lived strings in young gen`);
