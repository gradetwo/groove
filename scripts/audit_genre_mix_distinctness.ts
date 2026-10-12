/**
 * Independent audit: is the per-genre mix really arranged per genre, or is it a handful of
 * category buckets with decorations?
 *
 * Imports the real resolved table (no text parsing) and measures distinctness, per-role
 * spread, and whether the professional conventions survived the variety (kick/bass mono,
 * snare centred, sends alive).
 *
 *   npx vite-node scripts/audit_genre_mix_distinctness.ts
 *
 * Requires `src/data/genreMix.ts`, i.e. it only runs once the per-genre mix feature is
 * merged; before that it fails to resolve the import (by design, there is nothing to audit).
 *
 * Recorded result on v1.16.19: 159/159 genres present; 157 distinct (volume, pan) tuples
 * (the pre-fix state was ONE tuple repeated 159 times); kick and bass pan exactly 0 in all
 * 159; snare |pan| <= 0.08; 0 genres with dead sends (pre-fix: 0 of 1272 tracks declared
 * any send); 144 distinct loudness trims spanning -4.43..+5.53 dB.
 */
import { GENRE_MIX_RESOLVED, MIX_TRACK_IDS, getGenreLoudnessTrimDb } from "../src/data/genreMix";
import { ALL_GENRES } from "../src/data/genres";

const ids = Object.keys(GENRE_MIX_RESOLVED);
console.log(`genres in resolved table: ${ids.length} / ${ALL_GENRES.length}`);
const M = GENRE_MIX_RESOLVED as any;
const tuples = new Set(ids.map((id) => MIX_TRACK_IDS.map((r) => `${M[id][r].volume.toFixed(3)}/${M[id][r].pan.toFixed(3)}`).join("|")));
console.log(`distinct (volume,pan) tuples: ${tuples.size} / ${ids.length}`);
const full = new Set(ids.map((id) => MIX_TRACK_IDS.map((r) => `${M[id][r].volume.toFixed(3)}/${M[id][r].pan.toFixed(3)}/${M[id][r].sendA.toFixed(3)}/${M[id][r].sendB.toFixed(3)}`).join("|")));
console.log(`distinct full mix tuples (incl. sends): ${full.size} / ${ids.length}`);

for (const role of MIX_TRACK_IDS) {
  const vols = ids.map((id) => M[id][role].volume);
  const pans = ids.map((id) => M[id][role].pan);
  const sends = ids.map((id) => M[id][role].sendA + M[id][role].sendB);
  const u = (a: number[]) => new Set(a.map((x) => x.toFixed(3))).size;
  const f = (a: number[]) => `${Math.min(...a).toFixed(2)}..${Math.max(...a).toFixed(2)}`;
  console.log(`  ${role.padEnd(11)} vol ${f(vols)} (${u(vols)})  pan ${f(pans)} (${u(pans)})  send ${f(sends)} (${u(sends)})`);
}

const bassPan = ids.filter((id) => M[id].bass.pan !== 0);
const kickPan = ids.filter((id) => M[id].kick.pan !== 0);
const snareOff = ids.filter((id) => Math.abs(M[id].snare.pan) > 0.1);
const deadSends = ids.filter((id) => MIX_TRACK_IDS.every((r) => M[id][r].sendA === 0 && M[id][r].sendB === 0));
console.log(`\nbass not mono: ${bassPan.length}   kick not centred: ${kickPan.length}   |snare pan|>0.1: ${snareOff.length}   all-dead sends: ${deadSends.length}`);

const trims = ids.map((id) => getGenreLoudnessTrimDb(id));
console.log(`trims: min ${Math.min(...trims).toFixed(2)}  max ${Math.max(...trims).toFixed(2)}  distinct ${new Set(trims.map((t) => t.toFixed(2))).size}`);
const missing = ALL_GENRES.filter((g) => !(g.id in GENRE_MIX_RESOLVED)).map((g) => g.id);
console.log(`genres missing from the mix table: ${missing.length}${missing.length ? " -> " + missing.slice(0, 5).join(", ") : ""}`);
