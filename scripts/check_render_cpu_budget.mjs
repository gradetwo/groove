/**
 * 📐 **The render's CPU per scenario, and a ceiling on it.**
 *
 * 口径（改动口径必须同时改这里的注释与判据 ✓）：
 *   · 驱动 `scripts/profile_offline_render.mjs --bars=1 --runs=2 --mode=cpu` ✓（真实渲染 ✓，无头 Chromium ✓）
 *   · 每个场景它自报 `process CPU ÷ 该场景 wall ⇒ N% of one core` ✓
 *   · 断言 **N ≤ 125** ✓（留约 15% 余量 ✓；实测 106–109% ✓，见 `§329`／`§348` ✓）
 *   · ⚠️ **不断言精确墙钟** ✗ —— 墙钟依赖机器与负载 ✗ ⇒ 会 flaky ✗；这里只钉**比例** ✓
 *
 * ⚠️ 为什么只钉比例：应用内路径带 AudioWorklet，而无头 shell 没有 ✓（`§329` 已注明 ✓）⇒
 *    这个数**不能**当作"应用里就是这样" ✓，但它**能**当作"**有没有突然变成多核或 CPU 暴涨**"的哨兵 ✓
 */
import { spawnSync } from "node:child_process";

export const MAX_PERCENT = 125;

/** 从剖析器的输出里取每个场景的百分比 ✓。 */
export function parseRenderCpu(text) {
  const rows = [];
  for (const m of text.matchAll(/^\s*(\S[\w-]*)\s+wall\s+([\d.]+)\s*s,\s*process CPU\s+([\d.]+)\s*s\s*⇒\s*(\d+)%\s*of one core/gm)) {
    rows.push({ scenario: m[1], wallSec: Number(m[2]), cpuSec: Number(m[3]), percent: Number(m[4]) });
  }
  return rows;
}

export function judge(rows, maxPercent = MAX_PERCENT) {
  const over = rows.filter((r) => r.percent > maxPercent).map((r) => `${r.scenario} ${r.percent}%`);
  return { rows, worst: rows.reduce((m, r) => Math.max(m, r.percent), 0), over, ok: rows.length > 0 && over.length === 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = spawnSync("node", ["scripts/profile_offline_render.mjs", "--bars=1", "--runs=2", "--mode=cpu"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const text = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const verdict = judge(parseRenderCpu(text));
  console.log(JSON.stringify(verdict, null, 2));
  if (!verdict.ok) {
    console.error("❌ a scenario is over the CPU ceiling");
    process.exit(1);
  }
  console.log("✅ every scenario is inside the CPU ceiling");
}
