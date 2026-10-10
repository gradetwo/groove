import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **The owner's requirement B, kept honest in the shipped list** (2026-10-10: *"把发现写进清单条目（warnings）并汇总，
 * 数据有问题要能看见，而不是照样切一个'听起来很平'的片段"*).
 *
 * Two things this pins:
 *
 *  1. **the vocabulary** — every warning a clip carries comes from a code this project knows. A new code appearing in the
 *     manifest without being named here is how a batch starts saying things nobody can look up;
 *  2. **the wiring** — the musical half (`genrePatternHealth`: chord monotony, melody poverty, rhythm sameness, empty lanes,
 *     out-of-range notes) is run over the clips by `scripts/audit_clip_health.mts`, which is a `vite-node` step because the
 *     check lives in TypeScript while the batch is plain `.mjs`.
 *
 * Measured when this landed: 139 rows, **32 carrying warnings** — `health:empty-lane` ×35, `health:melody-poverty` ×1,
 * `skipped-lanes` ×8, `length-out-of-range` ×1. The counts are printed rather than asserted, because a criterion that pinned
 * them would fail the moment a genre is repaired — which is the point of repairing one.
 */
const RENDER_CODES = [
  "skipped-lanes",
  "no-recordings",
  "length-out-of-range",
  "silent-clip",
  "duration-unmeasured",
  "ffmpeg-failed",
  "health-audit-failed",
];

describe("the clip manifest's warnings", () => {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, "../../public/genre-clips.json"), "utf8")) as {
    clips: Array<{ genreId: string; warnings?: Array<{ code: string; detail: string }> }>;
  };

  it("⭐ every code is one this project can look up, and every detail says something", () => {
    const known = (code: string): boolean => RENDER_CODES.includes(code) || code.startsWith("health:");
    const tally: Record<string, number> = {};
    for (const clip of manifest.clips) {
      for (const warning of clip.warnings ?? []) {
        tally[warning.code] = (tally[warning.code] ?? 0) + 1;
        expect(known(warning.code), `${clip.genreId} carries the unknown warning code "${warning.code}"`).toBe(true);
        expect(warning.detail.length, `${clip.genreId}/${warning.code} explains itself`).toBeGreaterThan(10);
      }
    }
    console.log("clip warning tally:", JSON.stringify(tally));
  });

  it("⭐ the musical audit is wired, and reads the same health module the test suite proves", () => {
    const step = resolve(__dirname, "../../scripts/audit_clip_health.mts");
    expect(existsSync(step), "the health step exists").toBe(true);
    const source = readFileSync(step, "utf8");
    expect(source, "it uses the proven checker").toContain("patternHealth");
    expect(source, "and asks for the genre's own content, as the clips were rendered").toContain("withGenreNotes: true");
  });
});
