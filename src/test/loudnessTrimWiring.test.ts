import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The two scripts that connect the loudness report to the trim table, and the bug that made them blind.
 *
 * `src/data/genreMix.ts` is what playback and export read; `scripts/loudness.baseline.json` is the evidence that the
 * trims make 159 genres land together. Three things read that pair: the unit test next door (through the parsed
 * table), `check_loudness_spread.mjs` (a `verify` gate) and `apply_loudness_trims.mjs` (the only writer). Both
 * scripts matched a genre's line with a pattern that required `category` to be its **first field** — and P0.2/P0.3
 * put `humanise:` and `duck:` in front of it for **23 genres**, so:
 *
 *   · `npm run check:loudness`, a gate in `npm run verify`, reported "23 missing from table" and went red — and
 *     nothing noticed, because that gate runs in `verify` and `manual-verify scope=audio`, not in the push-time CI
 *     job;
 *   · `apply_loudness_trims.mjs` refused to write (its own `seen.size !== trims.size` guard, which is the only
 *     reason a re-record would not have silently rewritten 136 of 159 trims and reported success).
 *
 * These run the real commands against synthetic files, because what has to keep working is the *scripts'* view of the
 * table, which no unit test that imports `GENRE_MIX` can see.
 */
const ROOT = path.resolve(__dirname, "..", "..");

const run = (script: string, args: string[]) => {
  try {
    const stdout = execFileSync("node", [script, ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
};

/** A table whose three genres put `loudnessTrimDb` in three different positions — the shape the real table grew. */
const TABLE = `export const GENRE_MIX = {
  "category-first": { category: "Electronic", loudnessTrimDb: 0 },
  "humanise-first": { humanise: 0.2, category: "Hip Hop", loudnessTrimDb: 0 },
  "duck-first": { duck: { duckDb: 4, releaseMs: 200 }, category: "Latin/World", loudnessTrimDb: 0 },
};
`;

const REPORT = JSON.stringify({
  subset: false,
  trimRangeDb: { min: -9, max: 9 },
  genres: {
    "category-first": { trimDb: 1.5 },
    "humanise-first": { trimDb: -2.5 },
    "duck-first": { trimDb: 3 },
  },
});

const fixture = (): { dir: string; mix: string; report: string } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "groove-trims-"));
  const mix = path.join(dir, "genreMix.ts");
  const report = path.join(dir, "report.json");
  fs.writeFileSync(mix, TABLE);
  fs.writeFileSync(report, REPORT);
  return { dir, mix, report };
};

describe("the trim scripts read every genre, whatever order its fields are in", () => {
  it("rewrites all three shapes, and leaves their other fields alone", () => {
    const { mix, report } = fixture();
    const result = run("scripts/apply_loudness_trims.mjs", [`--mix=${mix}`, `--report=${report}`]);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    const written = fs.readFileSync(mix, "utf8");
    expect(written).toContain('"category-first": { category: "Electronic", loudnessTrimDb: 1.5 }');
    // The field that used to hide the line is still there, in front of the trim it no longer hides.
    expect(written).toContain('"humanise-first": { humanise: 0.2, category: "Hip Hop", loudnessTrimDb: -2.5 }');
    expect(written).toContain('"duck-first": { duck: { duckDb: 4, releaseMs: 200 }, category: "Latin/World", loudnessTrimDb: 3 }');
  });

  it("is idempotent, and `--check` agrees afterwards", () => {
    const { mix, report } = fixture();
    run("scripts/apply_loudness_trims.mjs", [`--mix=${mix}`, `--report=${report}`]);
    const first = fs.readFileSync(mix, "utf8");
    const again = run("scripts/apply_loudness_trims.mjs", [`--mix=${mix}`, `--report=${report}`]);
    expect(again.code).toBe(0);
    expect(fs.readFileSync(mix, "utf8")).toBe(first);
    const checked = run("scripts/apply_loudness_trims.mjs", ["--check", `--mix=${mix}`, `--report=${report}`]);
    expect(checked.code).toBe(0);
    expect(checked.stdout).toContain("3 trims match");
  });

  it("refuses a report whose genre the table does not have, and says which", () => {
    const { mix, report } = fixture();
    fs.writeFileSync(
      report,
      JSON.stringify({ ...JSON.parse(REPORT), genres: { ...JSON.parse(REPORT).genres, ghost: { trimDb: 1 } } })
    );
    const checked = run("scripts/apply_loudness_trims.mjs", ["--check", `--mix=${mix}`, `--report=${report}`]);
    expect(checked.code).toBe(1);
    expect(checked.stderr).toContain("1 report genre(s) missing from the table");
  });

  it("the loudness gate sees all 159 committed trims", () => {
    // The real pair, through the real gate: this is the assertion that would have failed on 2026-09-23 (23 missing).
    const result = run("scripts/check_loudness_spread.mjs", []);
    expect(result.stdout + result.stderr).toContain("all 159 trims match the report");
  });

  it("the gate fails when a `humanise:`-first line drifts, so those lines are really read", () => {
    /**
     * The fail-ability half. A synthetic table identical to the committed one except that a genre whose line starts
     * with `humanise:` carries a wrong trim — the gate must name it. Without this, "159 trims match" could still be
     * true of a pattern that silently skipped a field order.
     */
    const real = fs.readFileSync(path.join(ROOT, "src/data/genreMix.ts"), "utf8");
    const drifted = real.replace(
      /(\n\s{2}"ambient": \{ humanise: [^}]*?loudnessTrimDb: )(-?[\d.]+)/,
      (_match, prefix) => `${prefix}4.5`
    );
    expect(drifted, "the fixture must actually have changed a trim").not.toBe(real);
    const { mix } = fixture();
    fs.writeFileSync(mix, drifted);
    const result = run("scripts/check_loudness_spread.mjs", [`--mix=${mix}`]);
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain("ambient");
  });
});
