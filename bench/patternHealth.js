// OLD: chord scan as written (filter+some+find per note) vs NEW: onset-indexed map.
function makeLanes(lanes, notesPerLane) {
  const out = [];
  for (let l = 0; l < lanes; l++) {
    const notes = [];
    for (let i = 0; i < notesPerLane; i++) notes.push({ pitch: (i * 7 + l * 3) % 48, startBeats: (i % 64) + Math.floor(i / 64) * 0.25 });
    out.push({ trackId: `t${l}`, kind: "synth", notes });
  }
  return out;
}
function oldChords(melodic) {
  const chordSets = new Set();
  for (const lane of melodic) {
    for (const note of lane.notes) {
      const at = String(note.startBeats);
      const members = melodic
        .filter((o) => o.notes.some((c) => c.startBeats === note.startBeats))
        .map((o) => o.notes.find((c) => c.startBeats === note.startBeats)?.pitch ?? -1)
        .sort((a, b) => a - b);
      chordSets.add(`${at}:${members.join(",")}`);
    }
  }
  return chordSets;
}
function newChords(melodic) {
  const byOnset = new Map(); // startBeats -> (trackId -> pitch), last write wins like find()
  for (const lane of melodic) for (const note of lane.notes) {
    let m = byOnset.get(note.startBeats);
    if (!m) { m = new Map(); byOnset.set(note.startBeats, m); }
    m.set(lane.trackId, note.pitch ?? -1);
  }
  const chordSets = new Set();
  for (const [at, m] of byOnset) {
    const members = [...m.values()].sort((a, b) => a - b);
    chordSets.add(`${at}:${members.join(",")}`);
  }
  return chordSets;
}
const melodic = makeLanes(16, 256); // 4096 notes, 16 lanes
const a = oldChords(melodic);
global.gc && global.gc();
let t0 = process.hrtime.bigint();
const r1 = oldChords(melodic);
let t1 = process.hrtime.bigint();
const b = newChords(melodic);
global.gc && global.gc();
let t2 = process.hrtime.bigint();
const r2 = newChords(melodic);
let t3 = process.hrtime.bigint();
const same = a.size === b.size && [...a].every((s) => b.has(s));
console.log(`notes=${melodic.reduce((n,l)=>n+l.notes.length,0)} chords old=${r1.size} new=${r2.size} same=${same}`);
console.log(`OLD ${(Number(t1-t0)/1e6).toFixed(1)}ms   NEW ${(Number(t3-t2)/1e6).toFixed(1)}ms   speedup ${(Number(t1-t0)/Number(t3-t2)).toFixed(1)}x`);
