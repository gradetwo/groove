/**
 * 🧱 **Module boundaries, measured rather than asserted in prose.**
 *
 * `docs/OPEN_WORK.md` lists the maintainability numbers the owner asked for (file sizes, duplication, dead exports,
 * documentation drift), and module boundaries were the one item on that list with no number behind it. This is it.
 *
 * Two things are measured, both from `src/**` excluding `src/test`:
 *
 *   * **Value-import cycles.** A cycle through `import type` is erased before it runs (`trackInsert.ts` imports
 *     `MixTrackId` as a type, which is why the first count of fourteen was wrong by eleven), so a cycle only counts
 *     when every edge on it imports a **value**. Those are the ones that can bite at module-initialisation time.
 *   * **Direction.** `mcp/**` is allowed to import `src/**` — it reuses the application's compilers on purpose — but
 *     the reverse would mean the app depends on its own server. That count must stay zero.
 *
 * The baseline is a **ceiling, not a target**: it may only go down. `CAP` says what is measured today, and a new
 * cycle fails the gate rather than being absorbed into a moving number.
 *
 *   node scripts/check_module_boundaries.mjs           # report and judge
 *   node scripts/check_module_boundaries.mjs --json    # the readings, for a criterion to read
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** The measured ceiling. Lowering it is the only edit that should ever be made to these two numbers. */
const CAP = { cycles: 3, reverseValueDependencies: 0 };

function productionFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (["node_modules", "dist", "dist-mcp", ".git", "test"].includes(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(full);
    }
  };
  walk(root);
  return out;
}

const IMPORT = /import\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(\{[^}]*\}))?\s*from\s+"(\.[^"]+)"/g;

/** Resolve a relative specifier to a file in the tree, the way the bundler does. */
function resolveSpecifier(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")])
    if (existsSync(candidate)) return candidate;
  return null;
}

/** The files this module imports for its **values**; type-only imports are erased and are not edges. */
function valueEdges(file) {
  const text = readFileSync(file, "utf8");
  const edges = new Set();
  for (const match of text.matchAll(IMPORT)) {
    const onlyType = Boolean(match[1]);
    const names = `${match[2] ?? ""}${match[3] ?? ""}`.replace(/[{}]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    if (onlyType) continue;
    if (names.length > 0 && names.every((name) => name.startsWith("type "))) continue;
    const target = resolveSpecifier(file, match[4]);
    if (target) edges.add(target);
  }
  return edges;
}

function findCycles(graph) {
  const colour = new Map();
  const stack = [];
  const cycles = new Set();
  const visit = (node) => {
    colour.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (!graph.has(next)) continue;
      const state = colour.get(next) ?? 0;
      if (state === 1) {
        const cycle = stack.slice(stack.indexOf(next));
        cycles.add([...cycle].sort().join("|"));
      } else if (state === 0) visit(next);
    }
    stack.pop();
    colour.set(node, 2);
  };
  for (const node of graph.keys()) if ((colour.get(node) ?? 0) === 0) visit(node);
  return [...cycles];
}

const files = productionFiles("src");
const graph = new Map(files.map((file) => [resolve(file), valueEdges(file)]));
const cycles = findCycles(graph);
const mcpRoot = resolve("mcp") + "/";
const reverse = [];
for (const [file, edges] of graph)
  for (const edge of edges) if (edge.startsWith(mcpRoot)) reverse.push(`${file} -> ${edge}`);

const reading = { files: files.length, cycles: cycles.length, cycleMembers: cycles, reverseValueDependencies: reverse.length, reverse };

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(reading, null, 2));
  process.exit(0);
}

console.log(`   files                     : ${reading.files}`);
console.log(`   value-import cycles       : ${reading.cycles} (ceiling ${CAP.cycles})`);
for (const cycle of reading.cycleMembers) console.log(`     - ${cycle.split("|").map((p) => p.replace(process.cwd() + "/", "")).join(" ↔ ")}`);
console.log(`   src -> mcp value imports  : ${reading.reverseValueDependencies} (ceiling ${CAP.reverseValueDependencies})`);
for (const edge of reverse) console.log(`     - ${edge.replace(process.cwd() + "/", "")}`);

const ok = reading.cycles <= CAP.cycles && reading.reverseValueDependencies <= CAP.reverseValueDependencies;
if (!ok) {
  console.error("❌ a module boundary moved: fix it rather than raising the ceiling");
  process.exit(1);
}
console.log(`✅ module boundaries hold: ${reading.cycles} value cycles, no app-to-server dependency`);
