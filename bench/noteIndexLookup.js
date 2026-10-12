// ROI #2: O(n^2) find/filter per render vs Map index
const N = 1500; // notes in a dense roll
const notes = Array.from({length: N}, (_, i) => ({ stepIdx: i % 256, midi: 36 + (i * 7) % 60, gate: 0.8, velocity: 100 }));

function oldWay() {
  let hits = 0, len = 0;
  for (const n of notes) { // once per rendered note, as in JSX data-chord-size
    hits += notes.find((m) => m.stepIdx === n.stepIdx && m.midi === n.midi) ? 1 : 0;
    len += notes.filter((m) => m.stepIdx === n.stepIdx).length;
  }
  return hits + len;
}
function buildIndex() {
  const byCell = new Map(), byStep = new Map();
  for (const n of notes) {
    byCell.set(`${n.stepIdx}:${n.midi}`, n);
    let b = byStep.get(n.stepIdx); if (!b) { b = []; byStep.set(n.stepIdx, b); } b.push(n);
  }
  return { byCell, byStep };
}
function newWay(idx) {
  let hits = 0, len = 0;
  for (const n of notes) {
    hits += idx.byCell.get(`${n.stepIdx}:${n.midi}`) ? 1 : 0;
    len += (idx.byStep.get(n.stepIdx) ?? []).length;
  }
  return hits + len;
}
const r1 = oldWay(); const idx = buildIndex(); const r2 = newWay(idx);
console.log('same result:', r1 === r2);
function time(fn, runs) { const t0 = process.hrtime.bigint(); for (let i=0;i<runs;i++) fn(); return Number(process.hrtime.bigint()-t0)/1e6/runs; }
const oldMs = time(oldWay, 3);
const newMs = time(() => newWay(idx), 3) + time(() => buildIndex(), 3); // amortized incl. rebuild per render
console.log(`OLD per-render: ${oldMs.toFixed(1)} ms`);
console.log(`NEW per-render (incl. index rebuild): ${newMs.toFixed(3)} ms`);
console.log(`speedup: ${(oldMs/newMs).toFixed(1)}x`);
