/**
 * ⭐ **The owner's requirement B, applied to the clips that were actually cut** (2026-10-10: *"生成音频时候也要检查这些曲风历史
 * 数据对不对，例如和弦是不是太单调之类"* — and the findings go **into the manifest**, so a flat clip is visible rather than
 * simply shipped).
 *
 * This runs as a `vite-node` step because the check lives in TypeScript (`src/data/genrePatternHealth.ts`) and the batch itself is
 * plain `.mjs` — the repository already uses `vite-node` for exactly this kind of gate (`check:css`).
 *
 * Two details are taken from `src/test/genreDataAudit.test.ts`, including the lesson recorded there: **a lane sounds through
 * notes *or* steps**, so reading only `notes` declared 12 of 12 genres broken. And unlike that audit, this one asks for
 * `withGenreNotes: true` — the clips were rendered **with** the genre's own content, so auditing without it would report empty
 * melodic lanes the clip never had.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createMcpArrangement, getMcpArrangement } from "../mcp/arrangement";
import { patternHealth, type HealthLane } from "../src/data/genrePatternHealth";

const at = process.argv.indexOf("--parts");
const dir = at >= 0 ? process.argv[at + 1]! : "dist-repair";
let audited = 0;
let withFindings = 0;
const tally: Record<string, number> = {};

for (const name of readdirSync(dir).filter((entry) => /^manifest-.*\.json$/.test(entry))) {
  const path = `${dir}/${name}`;
  const part = JSON.parse(readFileSync(path, "utf8")) as { clips: Array<Record<string, unknown>> };
  for (const clip of part.clips) {
    const genreId = String(clip.genreId);
    let lanes: HealthLane[] = [];
    let bars = 1;
    try {
      const created = createMcpArrangement({ genreId, withGenreNotes: true }) as { arrangementId: string };
      const model = getMcpArrangement(created.arrangementId);
      if (!model) continue;
      bars = model.bars ?? 1;
      lanes = model.tracks.map((track) => {
        const raw = track as unknown as { stepsOn?: number; notes?: Array<{ pitch: number; startBeats: number }> };
        const fromNotes = model.notesByTrack?.[track.id] ?? raw.notes ?? [];
        const notes = fromNotes.length > 0
          ? fromNotes.map((note) => ({ pitch: note.pitch, startBeats: note.startBeats }))
          : (raw.stepsOn ?? 0) > 0
            ? Array.from({ length: raw.stepsOn ?? 0 }, (_, index) => ({ startBeats: index }))
            : [];
        return { trackId: track.id, kind: track.kind, notes };
      });
    } catch (error) {
      clip.warnings = [...((clip.warnings as Array<{ code: string; detail: string }>) ?? []), { code: "health-audit-failed", detail: `the musical audit could not read this genre: ${String(error).slice(0, 120)}` }];
      continue;
    }
    const report = patternHealth(lanes, bars);
    audited += 1;
    if (report.warnings.length > 0) withFindings += 1;
    for (const warning of report.warnings) tally[warning.code] = (tally[warning.code] ?? 0) + 1;
    const kept = ((clip.warnings as Array<{ code: string; detail: string }>) ?? []).filter((existing) => !existing.code.startsWith("health:"));
    clip.warnings = [...kept, ...report.warnings.map((warning) => ({ code: `health:${warning.code}`, detail: warning.detail }))];
  }
  /**
   * ⭐ **And it is summarised, not only attached** (owner: *"把发现写进清单条目（warnings）并汇总"*). A reader should be able to
   * see at a glance how much of the library is flat without walking 139 clips.
   */
  (part as { health?: unknown }).health = { audited, withFindings, tally: { ...tally } };
  writeFileSync(path, JSON.stringify(part, null, 2) + "\n");
}
console.log(JSON.stringify({ dir, audited, withFindings, tally }, null, 1));
