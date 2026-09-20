#!/usr/bin/env node
/**
 * Surface-isolation gate: the logic layers must compile without any surface.
 *
 *   node scripts/check_isolation.mjs [--keep]
 *
 * WHY THIS EXISTS
 * ---------------
 * The product carries three surfaces (PC, iPad, phone) over one engine, and the stated criterion in
 * `PRODUCT_PLAN_v2.1.0.md` §G.8 is mechanical: *delete a surface's whole directory and `src/features`
 * plus `src/audio` must still compile*. The layer gate checks imports one file at a time; this checks
 * the closure by actually removing the surfaces and running `tsc`.
 *
 * It copies `src/` (and `vendor/`, which the GS-1 host imports by relative path) into a scratch
 * directory, deletes `components/`, `views/`, `ui/`, `App.tsx` and the tests — i.e. everything that
 * exists *because* of a particular screen — and typechecks the rest. A feature that reaches into a
 * view fails here with a module-not-found error naming the file, which is exactly the failure the
 * criterion describes.
 *
 * The copy is a real copy rather than a path rewrite so that `tsc` resolves modules exactly as it does
 * in the normal tree: an isolated build that used different resolution rules would prove nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = path.join(ROOT, "node_modules", ".cache", "groove-isolation");
const KEEP = process.argv.includes("--keep");

/** Directories that only exist for a surface. Removing them is the experiment. */
/**
 * Everything that exists *because a screen exists*.
 *
 * The list has to match the surface directories in `check_layers.mjs`: adding a surface there without
 * adding it here would let a logic module import the phone shell without the isolation gate noticing,
 * which is exactly what `surfaceIsolation.test.ts` asserts against.
 */
const SURFACE_PATHS = ["src/components", "src/views", "src/ui", "src/mobile", "src/App.tsx", "src/test"];
/** The roots the criterion names; `tsc` pulls in everything they import. */
const ROOTS = ["src/features", "src/audio"];
/** Shared below the logic layer — copied but never a root. */
const SUPPORT = ["src/hooks", "src/platform", "src/utils", "src/data", "src/types", "src/i18n", "src/state", "src/store"];

fs.rmSync(SCRATCH, { recursive: true, force: true });
fs.mkdirSync(SCRATCH, { recursive: true });

const copyInto = (rel) => {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, path.join(SCRATCH, rel), { recursive: true });
};

fs.mkdirSync(path.join(SCRATCH, "src"), { recursive: true });
for (const entry of fs.readdirSync(path.join(ROOT, "src"))) {
  copyInto(path.join("src", entry));
}
copyInto("vendor");
for (const rel of SURFACE_PATHS) {
  fs.rmSync(path.join(SCRATCH, rel), { recursive: true, force: true });
}

const presentRoots = ROOTS.filter((rel) => fs.existsSync(path.join(SCRATCH, rel))).map((rel) => rel);
const presentSupport = SUPPORT.filter((rel) => fs.existsSync(path.join(SCRATCH, rel)));

const tsconfig = {
  compilerOptions: {
    target: "ES2020",
    lib: ["ES2020", "DOM", "DOM.Iterable"],
    module: "ESNext",
    moduleResolution: "bundler",
    jsx: "react-jsx",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    isolatedModules: true,
    types: ["vite/client"],
  },
  include: [...presentRoots, ...presentSupport],
};
fs.writeFileSync(path.join(SCRATCH, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));

const tsc = path.join(ROOT, "node_modules", ".bin", "tsc");
const result = spawnSync(tsc, ["-p", path.join(SCRATCH, "tsconfig.json"), "--noEmit"], {
  cwd: SCRATCH,
  encoding: "utf8",
});

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const errors = output
  .split("\n")
  .filter((line) => /error TS\d+/.test(line))
  .map((line) => line.replace(`${SCRATCH}${path.sep}`, "").replace(/\\/g, "/"));

if (!KEEP) fs.rmSync(SCRATCH, { recursive: true, force: true });

if (result.error) {
  console.error(`❌ Could not run tsc: ${result.error.message}`);
  process.exit(1);
}
if (errors.length === 0) {
  console.log(
    `✅ src/features and src/audio compile with no surface present (no components/, views/, ui/, App.tsx).`
  );
  process.exit(0);
}

console.error("❌ The logic layers depend on a surface — deleting a screen breaks the build:");
for (const line of errors.slice(0, 20)) console.error(`   ${line}`);
if (errors.length > 20) console.error(`   … and ${errors.length - 20} more`);
console.error("\n   Move the behaviour into src/features (or invert the dependency) so the surfaces");
console.error("   stay interchangeable. The gate copies src to " + path.relative(ROOT, SCRATCH) + " for this run.");
process.exit(1);
