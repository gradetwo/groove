import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The groove gate's CI shape: one shard per runner, and one place that judges.
 *
 * The reason the shards exist is speed (four runners instead of twenty minutes on one), which means the gate is now
 * split across processes and *files* — and that is a new way for it to lie. The failure mode is specific and it is
 * this file's job to make it impossible: a shard artifact that never arrived turns "12 sampled genres" into 9, and
 * every budget in `BUDGET` would still look satisfied. The gate was already broken once by exactly that shape of
 * bug (the `counts`/`counts` accumulator, and before it a silent filter over three misspelled genre ids), so the
 * coverage of the union is asserted here, by running the CLI, rather than trusted.
 *
 * These run the real command — `node scripts/check_groove.mjs --merge-dir=…` — because what CI depends on is its
 * exit code, not an internal function's return value. No browser is spawned: the merge path never touches the
 * analyser, which is also why this file is fast.
 */
const ROOT = path.resolve(__dirname, "..", "..");
const SAMPLE_SIZE = 12;

/** A row that satisfies every claim, so a failure can only come from what the test changes. */
function cleanRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    correlation: 0.5,
    sideToMidDb: -20,
    tailRmsDb: -90,
    musical: {
      // `thinDynamics` (P1.1) reads the spread, not the distinct count: a lane can have many values inside a
      // 4-step window, which is exactly the state P0.2 left the library in.
      velocityByTrack: {
        kick: { distinct: 3, onsets: 8, min: 118, max: 120 },
        snare: { distinct: 4, onsets: 8, min: 92, max: 118 },
        hihat: { distinct: 6, onsets: 16, min: 72, max: 112 },
      },
      duck: { duckOnsets: 4, duckMedianDb: -4, duckMasterMedianDb: -4 },
      midBandShareDb: -2,
      pitchByTrack: { chords: { distinct: 4 } },
    },
    ...overrides,
  };
}

const SAMPLE_IDS = [
  "chicago-house",
  "detroit-techno",
  "minimal-techno",
  "liquid-dnb",
  "ambient",
  "reggaeton",
  "afrobeat",
  "chicago-blues",
  "boom-bap",
  "trap-rap",
  "disco",
  "synthwave",
];

/** Write shard files into a throwaway directory and return it. */
function shardDir(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "groove-shards-"));
  for (const [name, payload] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(payload, null, 2));
  }
  return dir;
}

function runGate(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", ["scripts/check_groove.mjs", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

/**
 * The gate's own budget for a claim, read from its source.
 *
 * The fail-ability fixture needs "one more offender than the budget", and hard-coding that number broke the case
 * twice in one day — once when `cutTail` went 0 → 1 and once when it went 1 → 2 — each time leaving a test that
 * demonstrated the opposite of its own name. Reading the number makes it self-maintaining.
 */
function budgetValueOf(name: string): number {
  const source = fs.readFileSync(path.resolve(process.cwd(), "scripts/check_groove.mjs"), "utf8");
  const match = source.match(new RegExp(`^  ${name}: (\\d+),`, "m"));
  expect(match, `${name} has a numeric budget`).not.toBeNull();
  return Number(match![1]);
}

describe("check:groove · the shard aggregate cannot lose a genre", () => {
  it("judges the union of the shard files", () => {
    const dir = shardDir({
      "rows-1.json": { shard: 1, of: 2, ids: SAMPLE_IDS.slice(0, 6), rows: SAMPLE_IDS.slice(0, 6).map((id) => cleanRow(id)) },
      "rows-2.json": { shard: 2, of: 2, ids: SAMPLE_IDS.slice(6), rows: SAMPLE_IDS.slice(6).map((id) => cleanRow(id)) },
    });
    const result = runGate([`--merge-dir=${dir}`]);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("12/12 sampled genres rendered");
    expect(result.stdout).toContain("groove quality holds");
  });

  it("judges the claim P0.2 could not see: a lane with values but no dynamics", () => {
    /**
     * P1.1's whole reason for existing: `flatTracks` counts lanes with a *single* value and P0.2 took that to 0/12,
     * while the snare lane still reached the plan's 15-step spread in 1 of 11 sampled genres. A row whose snare lane
     * has four distinct velocities inside a 4-step window must fail here, or the ratchet cannot hold the content.
     */
    const rows = SAMPLE_IDS.map((id) => cleanRow(id));
    rows[2] = cleanRow(SAMPLE_IDS[2], {
      musical: {
        ...cleanRow(SAMPLE_IDS[2]).musical,
        velocityByTrack: {
          kick: { distinct: 3, onsets: 8, min: 118, max: 120 },
          snare: { distinct: 4, onsets: 8, min: 104, max: 108 },
          hihat: { distinct: 6, onsets: 16, min: 72, max: 112 },
        },
      },
    });
    const dir = shardDir({ "rows-1.json": { shard: 1, of: 1, ids: SAMPLE_IDS, rows } });
    const result = runGate([`--merge-dir=${dir}`]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("flat dynamics");
    expect(result.stderr).toContain("snare 4");
  });

  it("still judges — a merge that cannot fail would be decoration", () => {
    /**
     * The fail-ability half. If the aggregator only checked coverage and printed a table, every CI run would be
     * green; so genres are given cut tails and the run must go red *through the merge path*.
     *
     * **`BUDGET.cutTail + 1` of them, read from the gate rather than written here.** The count used to be hard-coded
     * and the case broke twice in one day — once when the budget went 0 → 1, once when it went 1 → 2 — each time
     * becoming a fixture that demonstrated the *opposite* of what it is for. A fail-ability test that has to be
     * edited whenever a budget moves is a test that will eventually be edited wrongly; reading the budget makes it
     * self-maintaining, and it still fails loudly if the merge path stops judging.
     */
    const offenders = budgetValueOf("cutTail") + 1;
    const rows = SAMPLE_IDS.map((id) => cleanRow(id));
    for (let i = 0; i < offenders; i += 1) {
      rows[3 + i] = cleanRow(SAMPLE_IDS[3 + i], { tailRmsDb: -20 - i });
    }
    const dir = shardDir({ "rows-1.json": { shard: 1, of: 1, ids: SAMPLE_IDS, rows } });
    const result = runGate([`--merge-dir=${dir}`]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("cut tail");
    expect(result.stderr).toContain(SAMPLE_IDS[3]);
    expect(result.stderr).toContain(SAMPLE_IDS[3 + offenders - 1]);
  });

  it("refuses an aggregate that is missing a shard's worth of genres", () => {
    // The whole point: a lost artifact must be a failure, not a smaller sample that passes.
    const ids = SAMPLE_IDS.slice(0, SAMPLE_SIZE - 3);
    const dir = shardDir({ "rows-1.json": { shard: 1, of: 2, ids, rows: ids.map((id) => cleanRow(id)) } });
    const result = runGate([`--merge-dir=${dir}`]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("do not add up to the sample");
    expect(result.stderr).toContain("no shard measured");
    // …and it names what is missing, so the failed runner is findable from the log alone.
    for (const id of SAMPLE_IDS.slice(SAMPLE_SIZE - 3)) expect(result.stderr).toContain(id);
  });

  it("refuses the same genre measured twice, and a genre outside the sample", () => {
    const dir = shardDir({
      "rows-1.json": { shard: 1, of: 1, ids: SAMPLE_IDS, rows: SAMPLE_IDS.map((id) => cleanRow(id)) },
      "rows-1-copy.json": {
        shard: 1,
        of: 1,
        ids: [SAMPLE_IDS[0]],
        rows: [cleanRow(SAMPLE_IDS[0]), cleanRow("not-in-the-sample")],
      },
    });
    const result = runGate([`--merge-dir=${dir}`]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("appears in more than one shard");
    expect(result.stderr).toContain("not-in-the-sample");
  });

  it("refuses an empty or unreadable directory instead of judging nothing", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "groove-shards-empty-"));
    expect(runGate([`--merge-dir=${empty}`]).code).toBe(1);
    expect(runGate([`--merge-dir=${empty}`]).stderr).toContain("no .json row files");
    expect(runGate(["--merge-dir=/nonexistent-shard-dir"]).code).toBe(1);
  });

  it("rejects a shard spec that is not i/n, and an index outside the split", () => {
    // These exit before the analyser is spawned, so the CLI contract is testable without a browser.
    const bad = runGate(["--shard=two"]);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("--shard must be i/n");
    const outOfRange = runGate(["--shard=5/4"]);
    expect(outOfRange.code).toBe(1);
    expect(outOfRange.stderr).toContain("there is no shard 5 of 4");
  });
});

describe("the budget table and the claim table cannot drift apart", () => {
  /**
   * `flatStabs` was counted, detailed and budgeted before it was added to `CLAIMS`, which is the one mistake this
   * file can make that looks like success: the aggregate printed a table, the budget was never judged, and the gate
   * could not fail. A claim is three things — a budget, a spec and a row to count into — so all three are asserted.
   */
  const keysOf = (source: string, name: string): string[] => {
    const start = source.indexOf(`const ${name} = {`);
    expect(start, `${name} exists`).toBeGreaterThan(-1);
    // The object literal ends at the first line that closes it at column 2.
    const end = source.indexOf("\n  };", start);
    const body = source.slice(start, end === -1 ? source.length : end);
    return [...body.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*):/gm)].map((match) => match[1]);
  };

  it("has a claim, a tally and a detail array for every budget", () => {
    const script = fs.readFileSync(path.resolve(process.cwd(), "scripts/check_groove.mjs"), "utf8");
    const budgets = keysOf(script, "BUDGET");
    const claims = keysOf(script, "CLAIMS");
    expect(budgets.length).toBeGreaterThan(5);
    for (const key of budgets) {
      expect(claims, `${key} has a claim spec`).toContain(key);
    }
    // …and the tally/detail objects the counting loop writes into.
    const tallyStart = script.indexOf("const tally = {");
    const detailStart = script.indexOf("const detail = {");
    for (const key of budgets) {
      expect(script.slice(tallyStart, script.indexOf("};", tallyStart)), `${key} is counted`).toContain(`${key}: 0`);
      expect(script.slice(detailStart, script.indexOf("};", detailStart)), `${key} has detail`).toContain(`${key}: []`);
    }
  });
});
