/**
 * ⭐ The latency budget gate, tested without a browser.
 *
 * `scripts/check_latency_budget.mjs --from FILE` judges a stored `probe:latency --json` payload, so
 * the criterion can hand it a good sample and a broken one and check the verdict both ways. The
 * second half is the point: without it, a gate that always returns zero would look green forever.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SAMPLE = "src/test/fixtures/latencySample.json";
const run = (file: string) =>
  spawnSync("node", ["scripts/check_latency_budget.mjs", "--from", file], { encoding: "utf8" });

describe("latency budget gate", () => {
  it("passes a real sample", () => {
    const r = run(SAMPLE);
    expect(r.stdout + r.stderr).toContain("inside its budget");
    expect(r.status).toBe(0);
  });

  it("fails a sample whose timbre switch got slower", () => {
    const payload = JSON.parse(readFileSync(SAMPLE, "utf8"));
    /**
     * ⭐ Found by prefix, not by an instrument's name. The labels are the **chosen instrument's**, so they change with
     * the catalogue (`timbre → saw_lead` was the v1 inspector's asset id; the v2 chip names what it loaded), and a
     * criterion that hardcoded one name would either throw on `row.latencyMs` or quietly stop testing anything.
     */
    const row = payload.results.find((x: { label: string }) => x.label.startsWith("timbre →"));
    expect(row).toBeDefined();
    row.latencyMs = 4000; // four times the measured settle, and well past the 1500 ms ceiling
    const dir = mkdtempSync(join(tmpdir(), "latency-"));
    const file = join(dir, "slow.json");
    writeFileSync(file, JSON.stringify(payload));
    const r = run(file);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("breach");
  });

  it("fails a sample with a long task where there should be none", () => {
    const payload = JSON.parse(readFileSync(SAMPLE, "utf8"));
    const row = payload.results.find((x: { label: string }) => x.label === "GS-1 on");
    row.longTasks = 1;
    row.worstTaskMs = 80;
    const dir = mkdtempSync(join(tmpdir(), "latency-"));
    const file = join(dir, "task.json");
    writeFileSync(file, JSON.stringify(payload));
    const r = run(file);
    expect(r.status).not.toBe(0);
  });
});
