/**
 * 📐 **The parse and the judgement behind the render CPU ceiling.**
 *
 * The gate itself drives a browser and takes about forty five seconds, so it runs on the nightly job rather
 * than here; what this file keeps honest is the part that can be wrong silently — reading the profiler's
 * lines and deciding whether one is over. Measured 2026-10-05 02:08: silent 109%, only-kick 106%,
 * baseline 107%, against a ceiling of 125 with about fifteen percent of headroom.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { judge, parseRenderCpu, MAX_PERCENT } from "../../scripts/check_render_cpu_budget.mjs";

const sample = readFileSync("src/test/fixtures/renderCpuSample.txt", "utf8");

describe("render CPU budget", () => {
  it("⭐ reads every scenario out of the profiler's own lines", () => {
    const rows = parseRenderCpu(sample);
    expect(rows.map((r) => r.scenario)).toEqual(["silent", "only-kick", "baseline"]);
    expect(rows.map((r) => r.percent)).toEqual([109, 106, 107]);
  });

  it("⭐ passes the recorded run, and would fail a run over the ceiling", () => {
    const ok = judge(parseRenderCpu(sample));
    expect({ ok: ok.ok, worst: ok.worst }).toEqual({ ok: true, worst: 109 });
    const worse = sample.replace("⇒ 109% of one core", "⇒ 140% of one core");
    const bad = judge(parseRenderCpu(worse));
    expect({ ok: bad.ok, over: bad.over }).toEqual({ ok: false, over: ["silent 140%"] });
  });

  it("⭐ refuses a run it could not read, so a silent failure cannot pass", () => {
    const empty = judge(parseRenderCpu("nothing here"));
    expect({ ok: empty.ok, rows: empty.rows.length }).toEqual({ ok: false, rows: 0 });
    expect(MAX_PERCENT).toBe(125);
  });
});
