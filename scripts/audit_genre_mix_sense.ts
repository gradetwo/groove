/**
 * Independent musicality spot-check of the per-genre mix (goal item 6).
 *
 * Distinctness is necessary but not sufficient: 159 wildly different mixes could still
 * all be nonsense. This prints the resolved volume/pan per role next to each genre's
 * declared lead/fx instrument so a human can ask "would a mixing engineer do this?".
 * Not an automated gate — a review aid, deliberately readable.
 *
 *   npx vite-node scripts/audit_genre_mix_sense.ts
 *
 * Review verdict on v1.16.19 (23 genres across all six categories): no absurdities.
 * Highlights: ambient kick 0.50 / chords 0.92 (pads carry it); breakcore kick 0.98 /
 * snare 0.95; chiptune lead 0.88 (melody is the point); trap-rap kick 0.98 / bass 0.99 /
 * hats 0.84 panned -0.42; bebop-free-jazz bass 0.96-0.98 with the kit back at 0.60-0.68;
 * salsa percussion 1.00 panned -0.42 (percussion leads, wide); reggae bass 1.00;
 * motown lead 0.92 (vocal-forward) with vinyl crackle; k-pop fx 0.74; heavy-metal
 * chords -0.50 / lead +0.50 (double-tracked guitars). kick and bass are exactly mono in
 * every row and the snare stays within +/-0.08.
 */
import { GENRE_MIX_RESOLVED } from "../src/data/genreMix";
import { ALL_GENRES } from "../src/data/genres";

const M = GENRE_MIX_RESOLVED as any;
const ROLES = ["kick","snare","hihat","percussion","bass","chords","lead","fx"] as const;
const SAMPLE = [
  "ambient","dub-techno","breakcore","chiptune","synthwave","vaporwave",
  "boom-bap","trap-rap","lofi-hip-hop",
  "bebop","delta-blues","smooth-jazz","free-jazz",
  "salsa","reggae","cumbia","amapiano",
  "motown","funk","k-pop",
  "heavy-metal","punk-rock","shoe-gaze",
];
console.log("genre".padEnd(18) + "cat".padEnd(12) + "kick  snare hat   perc  bass  chords lead  fx    | leadInstr / fxInstr");
for (const id of SAMPLE) {
  const g = ALL_GENRES.find((x) => x.id === id);
  const m = M[id];
  if (!g || !m) { console.log(`${id} MISSING`); continue; }
  const vol = (r: string) => m[r].volume.toFixed(2);
  const pan = (r: string) => (m[r].pan === 0 ? "  · " : (m[r].pan > 0 ? "+" : "") + m[r].pan.toFixed(2));
  const leadInstr = g.sequencer_pattern.tracks.find((t) => t.track_id === "lead")?.instrument;
  const fxInstr = g.sequencer_pattern.tracks.find((t) => t.track_id === "fx")?.instrument;
  console.log(
    id.padEnd(18) + g.category.padEnd(12) +
    [vol("kick"), vol("snare"), vol("hihat"), vol("percussion"), vol("bass"), vol("chords"), vol("lead"), vol("fx")]
      .map((v) => v.padEnd(6)).join("") +
    "| " + leadInstr + " / " + fxInstr
  );
  console.log(
    " ".repeat(30) +
    ROLES.map((r) => pan(r).padEnd(6)).join("") + "| pan"
  );
}
