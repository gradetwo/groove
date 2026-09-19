#!/usr/bin/env node
/**
 * Unreferenced-CSS gate.
 *
 *   node scripts/check_css_usage.mjs            # report + exit non-zero on a new dead rule
 *   node scripts/check_css_usage.mjs --report    # report only, always exit 0
 *
 * WHY THIS EXISTS
 * ---------------
 * `.landscape-compact-bar` sat in `index.css` as five `!important` rules that nothing referenced,
 * and it forced buttons to 28 px — below the 44 px touch minimum the phone shell standardised on. It
 * survived because a dead CSS rule is invisible: nothing fails, nothing warns, and the next person
 * reads it as intent. It was found by accident while editing nearby, which is not a process.
 *
 * The sweep is deliberately conservative. It only reports a class when the name appears nowhere in
 * the source — not in a `className`, not in a template literal, not in a test, not in a string a
 * component builds at runtime. A false negative (a dead rule it misses) costs nothing; a false
 * positive (deleting a live rule) is a visual regression, so the check errs towards silence.
 *
 * WHAT IT CANNOT SEE
 * ------------------
 * A class assembled from fragments (`"track-row-" + idx`) is matched by prefix, so the *pattern* is
 * searched for rather than the full name. If a name is built by concatenation in a way this cannot
 * reconstruct, the rule is reported as unreferenced — which is why the output is a list to review,
 * not an instruction to delete.
 */
import fs from "node:fs";
import path from "node:path";
import { declaredClassesInSource, partitionByUsage } from "../src/utils/cssUsage.ts";

const ROOT = process.cwd();
const REPORT_ONLY = process.argv.includes("--report");
const CSS_PATH = path.join(ROOT, "src", "index.css");
const SEARCH_DIRS = ["src", "index.html", "scripts"];

/**
 * Rules that are intentionally not referenced by name.
 *
 * Each needs a reason. The list is short on purpose: "we might need it later" is not one, because a
 * rule nobody references is indistinguishable from a rule somebody forgot to delete.
 */
const INTENTIONAL = new Map([
  [
    "animate-pulse-glow",
    "Named in the reduced-motion guard's selector list beside \`.animate-pulse-play\` and \`.animate-pulse\`, which ARE used. The list is a safety net on purpose: a redundant arm costs nothing, whereas pruning it would change a reduced-motion guarantee for a class someone might apply later.",
  ],
  [
    "animate-orbit",
    "Same as \`.animate-pulse-glow\`: a redundant arm of the reduced-motion guard, not a live utility.",
  ],
  [
    "no-scrollbar",
    "Utility offered for consumers to apply; referenced by docs rather than by a current call site.",
  ],
]);

/** Every file the sweep searches for references. */
function walk(target, out = []) {
  const full = path.join(ROOT, target);
  if (!fs.existsSync(full)) return out;
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    if (/\.(tsx?|jsx?|html|css|md)$/.test(target)) out.push(target);
    return out;
  }
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    walk(path.join(target, entry.name), out);
  }
  return out;
}

const css = fs.readFileSync(CSS_PATH, "utf8");
const declared = declaredClassesInSource(css);
const files = SEARCH_DIRS.flatMap((d) => walk(d)).filter((f) => f !== "src/index.css");

/** Concatenate every searched file once; the corpus is ~200k lines, so this is cheap. */
const corpus = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");

const { referenced, unreferenced } = partitionByUsage(declared, corpus);
const tolerated = unreferenced.filter((u) => INTENTIONAL.has(u.cls));
const failing = unreferenced.filter((u) => !INTENTIONAL.has(u.cls));

console.log("===============================================================");
console.log("  🧹 CSS USAGE — declared classes must be referenced somewhere");
console.log("===============================================================");
console.log(`src/index.css: ${declared.size} class selector(s) declared, ${files.length} file(s) searched`);
console.log(
  `  referenced   ${referenced.length}\n  unreferenced ${unreferenced.length} (${tolerated.length} declared intentional)\n`
);

if (tolerated.length) {
  console.log("⚠️  intentional, declared in INTENTIONAL:");
  for (const u of tolerated) console.log(`   · .${u.cls} (line ${u.line}) — ${INTENTIONAL.get(u.cls)}`);
  console.log("");
}

if (failing.length === 0) {
  console.log("✅ No undeclared unreferenced class.");
} else {
  console.log(`❌ ${failing.length} class(es) declared in src/index.css and referenced nowhere:`);
  for (const u of failing) console.log(`   line ${String(u.line).padStart(4)}  .${u.cls}`);
  console.log(
    "\n   Either delete the rule, or — if a class is built at runtime in a way this cannot see —\n" +
      "   add it to INTENTIONAL in scripts/check_css_usage.mjs with a reason. Do not delete on the\n" +
      "   strength of this list alone: check for a dynamic construction first."
  );
}

process.exit(REPORT_ONLY ? 0 : failing.length === 0 ? 0 : 1);
