/**
 * 📐 **Exports nothing refers to** — a screening list, never a delete list.
 *
 * 口径（**范围枚举成目录清单** ✓ —— 要动就是"改口径" ✓，必须同时改这里的注释与判据里的基线 ✓）：
 *   生产范围（枚举 ✓）：`src/`（**排除 `src/test/`** —— 那是测试支撑，不是产品代码 ✓）、`mcp/`、`scripts/`
 *   测试范围（枚举 ✓）：`src/**\/*.test.ts(x)`
 *   文件类型 ✓：`*.ts` / `*.tsx` / `*.mjs`；排除 `*.d.ts` / `*.d.mts`
 *   判定 ✓：取了 `export (function|const|let|class|type|interface|enum) NAME` ✓ 之后，
 *     **生产代码里对它的引用为 0 次** ⇒ `dead` ✓；只在测试里出现 ⇒ `testOnly` ✓
 *     （口径是"**引用次数**"，实现为总出现次数减 1，即扣掉声明本身 ✓ —— ⚠️ 它**不是**"在其它生产文件里出现 0 次" ✓：
 *      一个导出在**自己那个文件内部**被用 27 次、而整个模块无人 import 时，按引用次数算它是"活的" ✓。
 *      把口径改成字面上的"其它文件"实测是 **dead 629 / testOnly 402** ✓ —— 同名类型被自己文件里的函数用一次就不算死，
 *      那个数没有人会当作预算 ✓。这条限制记在 `src/test/deadExportsBudget.test.ts` 与 `docs/OPEN_WORK.md` §四百一十六 ✓：**它看不见"整个模块没有 importer"这种形态** ✓。）
 * ⚠️ 性质 ✓：数的是**标识符出现次数** ⇒ 同名局部变量会**虚高**引用 ✓（所以 `dead` 是**下界** ✓）；
 *   且看不见**动态路径**（反射／字符串键／入口注册 ✓）⇒ 它**只是筛查表** ✗，
 *   任何删除都要**逐个核对** ✓，并先回答"**本该没人用，还是本该有人用却没有？**" ✓
 * ⚠️ 时点 ✓：2026-10-05 06:26 口径定稿后的读数是 **dead 29 / testOnly 76** ✓（生产文件 518 ✓、导出 2098 ✓）
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** 枚举的范围（改口径就从这里改 ✓）。 */
export const PRODUCTION_ROOTS = ["src", "mcp", "scripts"];
export const EXCLUDED_DIRS = ["src/test", "node_modules", "dist", "fixtures", "data"];
const SKIP_FILE = /\.test\.|\.d\.ts$|\.d\.mts$/;
const WORD = /\b[A-Za-z_$][\w$]*\b/g;
const EXPORT = /^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;

const excluded = (p) => EXCLUDED_DIRS.some((d) => p === d || p.startsWith(d + "/") || p.includes("/" + d + "/"));

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (excluded(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry) && !SKIP_FILE.test(p)) out.push(p);
  }
  return out;
}

function testFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (p === "node_modules" || p === "dist") continue;
    if (statSync(p).isDirectory()) testFiles(p, out);
    else if (/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

export function measureDeadExports() {
  const production = PRODUCTION_ROOTS.flatMap((r) => walk(r)).sort();
  const tests = testFiles("src").sort();
  const prodText = new Map(production.map((p) => [p, readFileSync(p, "utf8")]));
  const prodCount = new Map();
  for (const text of prodText.values()) for (const w of text.match(WORD) ?? []) prodCount.set(w, (prodCount.get(w) ?? 0) + 1);
  const testCount = new Map();
  for (const p of tests) for (const w of readFileSync(p, "utf8").match(WORD) ?? []) testCount.set(w, (testCount.get(w) ?? 0) + 1);
  const dead = [];
  const testOnly = [];
  let exports = 0;
  for (const [p, text] of prodText) {
    for (const m of text.matchAll(EXPORT)) {
      exports++;
      const name = m[1];
      const line = text.slice(0, m.index).split("\n").length;
      const inOtherProd = (prodCount.get(name) ?? 0) - 1;
      if (inOtherProd > 0) continue;
      if ((testCount.get(name) ?? 0) > 0) testOnly.push({ name, file: p, line });
      else dead.push({ name, file: p, line });
    }
  }
  return { productionFiles: production.length, exports, dead, testOnly };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = measureDeadExports();
  console.log(`production files ${m.productionFiles} | exports ${m.exports} | dead ${m.dead.length} | testOnly ${m.testOnly.length}`);
  for (const e of m.dead) console.log(`  dead      ${e.name}  ${e.file}:${e.line}`);
}
