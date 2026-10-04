/**
 * 📐 How large the production sources are, measured rather than felt.
 *
 * 口径（改动口径必须同时改这里的注释与判据里的基线 ✓）：
 *   · 范围：`mcp/**` 与 `src/**`
 *   · 排除：`node_modules`／`dist`／`fixtures`／**`data`**（数据表天生大 ✓）／`*.test.*`／`*.d.ts`
 *   · 计数：**所有行**（含注释与空行 ✓ —— 一个 3000 行的文件无论内容如何都难导航 ✓）
 *   · 基线只允许**下降** ✓：分档桶减少 ✓ 或单文件变短 ✓；任何一个变大 ⇒ 红 ✓
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["mcp", "src"];
const SKIP = /(^|\/)(node_modules|dist|fixtures|data)(\/|$)|\/(?!.*\/).*\.test\.|\.test\.|\.d\.ts$/;

function files(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { if (!SKIP.test(p + "/")) out.push(...files(p)); }
    else if (/\.(ts|tsx|mjs)$/.test(entry) && !SKIP.test(p)) out.push(p);
  }
  return out.sort();
}

export function measureFileSizes() {
  const rows = files(".").length ? [] : [];
  const all = [...ROOTS.flatMap(files)];
  for (const f of all) rows.push({ path: f, lines: readFileSync(f, "utf8").split("\n").length });
  rows.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  const count = (n) => rows.filter((r) => r.lines >= n).length;
  return {
    files: rows.length,
    atLeast600: count(600),
    atLeast800: count(800),
    atLeast1000: count(1000),
    atLeast1500: count(1500),
    atLeast2000: count(2000),
    largest: rows.slice(0, 12),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(measureFileSizes(), null, 2));
}
