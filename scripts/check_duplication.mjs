/**
 * 📐 Duplicated logic blocks, measured rather than guessed.
 *
 * 口径（可复算 ✓，改动口径必须同时改这里的注释与基线 ✓）：
 *   · 范围：`mcp/**` 与 `src/**`，排除 `node_modules`／`dist`／`fixtures`／**`data`**／`*.test.*`／`*.d.ts`
 *     （`src/data/**` 是**数据表**：在数据里"重复"是结构使然，算进来只会把真信号淹掉 ✗）
 *   · 归一：去掉空行与注释行，行首尾去空白
 *   · 块：**连续 ≥ MIN 行完全相同**的最大块；块内**纯 import／类型行占比 > 50%** 的不计
 *     （同一段 import 不是可维护性问题 ✗）
 *   · 分两类：**同文件内重复** vs **跨文件重复**（同文件重复最值得抽函数 ✓）
 *   · 基线只允许**下降** ✓：上升即红 ✓
 *
 * 算法 ✓：对每 12 行窗口取哈希 ⇒ 只在**同哈希**的位置之间延伸成最大块 ⇒ O(行数) 而非文件对²
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOTS = ["mcp", "src"];
const SKIP = /(^|\/)(node_modules|dist|fixtures|data)(\/|$)|\.test\.|\.d\.ts$/;
const MIN = 12;
const WIN = 8; // ⚠️ 必须 **< MIN** ✗：否则短于 MIN 的块永远不会被哈希 ⇒ MIN 成了死参数 ✓

function files(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { if (!SKIP.test(p + "/")) out.push(...files(p)); }
    else if (/\.(ts|tsx|mjs)$/.test(entry) && !SKIP.test(p)) out.push(p);
  }
  return out.sort();
}

const isDecl = (l) => /^(import|export)\b/.test(l) || /^}?\s*from\s+"/.test(l) || /^[A-Za-z_$][\w$]*,\s*$/.test(l);

export function measureDuplication() {
  const all = ROOTS.flatMap(files);
  // ⚠️ 真实行号：过滤掉空行与注释后**仍然记得它原本在第几行** ✓
  //    （早先这里报的是"过滤后数组的下标" ✗ ⇒ 行号系统性偏移 ✓ ⇒ 读者会被指到错误的位置 ✓）
  const lines = new Map();
  for (const f of all) {
    const kept = [];
    readFileSync(f, "utf8").split("\n").forEach((raw, i) => {
      const s = raw.trim();
      if (s.length === 0 || s.startsWith("//") || s.startsWith("*") || s.startsWith("/*")) return;
      kept.push({ lineNo: i + 1, text: s });
    });
    lines.set(f, kept);
  }
  const byHash = new Map();
  for (const f of all) {
    const ls = lines.get(f);
    for (let i = 0; i + WIN <= ls.length; i++) {
      const h = createHash("sha1").update(ls.slice(i, i + WIN).map((l) => l.text).join("\n")).digest("hex");
      if (!byHash.has(h)) byHash.set(h, []);
      byHash.get(h).push([f, i]);
    }
  }
  const blocks = [];
  const claimed = new Set();
  for (const positions of byHash.values()) {
    if (positions.length < 2) continue;
    for (const [f, i] of positions) {
      if (claimed.has(f + ":" + i)) continue;
      for (const [g, j] of positions) {
        if (f === g && j <= i) continue;
        const ls = lines.get(f), gs = lines.get(g);
        let k = 0;
        while (i + k < ls.length && j + k < gs.length && ls[i + k].text === gs[j + k].text) k++;
        if (k < MIN) continue;
        const body = ls.slice(i, i + k).map((l) => l.text);
        if (body.filter(isDecl).length / body.length > 0.5) continue;
        for (let t = 0; t < k; t++) { claimed.add(f + ":" + (i + t)); claimed.add(g + ":" + (j + t)); }
        blocks.push({ f, g, i: ls[i].lineNo, j: gs[j].lineNo, n: k, same: f === g });
      }
    }
  }
  const same = blocks.filter((b) => b.same);
  const cross = blocks.filter((b) => !b.same);
  return {
    blocks: blocks.length,
    sameFile: same.length,
    crossFile: cross.length,
    longest: blocks.reduce((m, b) => Math.max(m, b.n), 0),
    atLeast24: blocks.filter((b) => b.n >= 24).length,
    top: [...blocks].sort((a, b) => b.n - a.n).slice(0, 5)
      .map((b) => `${b.n} 行 ${b.f}#${b.i} ⇄ ${b.g}#${b.j}`),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = Date.now();
  const m = measureDuplication();
  console.log(JSON.stringify(m, null, 2));
  console.log(`用时 ${Date.now() - started} ms`);
}
