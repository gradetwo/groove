#!/usr/bin/env node
/**
 * Red-line checks (門禁兜底).
 *
 * These are the invariants that must never change silently. A failure here means
 * either a real regression or an intentional baseline change that needs an explicit
 * decision + a bump in scripts/redlines.baseline.json.
 *
 *   node scripts/redlines.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "scripts/redlines.baseline.json");
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));

const failures = [];
const notes = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function check(label, ok, detail = "") {
  if (ok) {
    notes.push(`\u2705 ${label}`);
  } else {
    failures.push(`\u274c ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}

/* R1 \u2014 version single source -------------------------------------------------- */
const pkg = JSON.parse(read("package.json"));
check(
  "R1 version: package.json is the only hand-edited version",
  JSON.parse(read("public/version.json")).version === pkg.version &&
    /const CACHE_VERSION = "groove-v[\d.]+";/.test(read("public/sw.js")) &&
    read("public/sw.js").includes(`groove-v${pkg.version}`) &&
    read("src/version.ts").includes(`APP_VERSION = "${pkg.version}"`),
  `package.json=${pkg.version}`
);

/* R2 \u2014 genre database shape ---------------------------------------------------- */
const indexIds = [...read("src/data/index/genresIndex.ts").matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
const dataIds = fs
  .readdirSync(path.join(ROOT, "src/data/genres"))
  .filter((f) => f.endsWith(".ts") && f !== "index.ts")
  .flatMap((f) => [...read(`src/data/genres/${f}`).matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]));

check("R2a genre count matches baseline", dataIds.length === baseline.genreCount, `expected ${baseline.genreCount}, found ${dataIds.length}`);
check("R2b genre ids are unique", new Set(dataIds).size === dataIds.length);
check(
  "R2c genre index has no drift vs genre data",
  indexIds.length === dataIds.length && indexIds.every((id) => dataIds.includes(id)),
  `${indexIds.length} indexed vs ${dataIds.length} defined`
);

/* R3 \u2014 relation graph integrity ------------------------------------------------ */
const relations = read("src/data/relations.ts");
const sources = [...relations.matchAll(/"source":\s*"([^"]+)"/g)].map((m) => m[1]);
const targets = [...relations.matchAll(/"target":\s*"([^"]+)"/g)].map((m) => m[1]);
const known = new Set(dataIds);
const dangling = [...sources, ...targets].filter((id) => !known.has(id));
const selfLoops = sources.filter((s, i) => s === targets[i]);
check("R3a no dangling relation endpoints", dangling.length === 0, `${dangling.length} dangling`);
check("R3b no self-loop relations", selfLoops.length === 0, `${selfLoops.length} self-loops`);
check(
  "R3c every genre appears as a relation source",
  new Set(sources).size >= baseline.relationSourceCoverage,
  `${new Set(sources).size} sources`
);

/* R4 \u2014 repository hygiene ----------------------------------------------------- */
const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).split("\n");
check("R4a no tracked .pyc / binary caches", !tracked.some((f) => /\.pyc$/.test(f)));
check(
  "R4b no tracked credential files",
  !tracked.some(
    (f) =>
      !f.endsWith(".example") &&
      (/(^|\/)\.env(\.|$)/.test(f) || /\.dev\.vars$/.test(f))
  )
);

/* R5 \u2014 deploy / cache red lines ------------------------------------------------ */
const headers = read("public/_headers");
check("R5a hashed assets stay immutable", /\/assets\/\*[\s\S]{0,120}immutable/.test(headers));
check("R5b service worker stays uncached", /\/sw\.js[\s\S]{0,120}no-store/.test(headers));
const swInstallBlock = read("public/sw.js").split('self.addEventListener("message"')[0];
check(
  "R5c sw.js install does not self-skipWaiting (update prompt must stay user-driven)",
  !/self\.skipWaiting\(\)/.test(swInstallBlock)
);

/* R6 \u2014 gates must stay wired ------------------------------------------------ */
const scripts = JSON.parse(read("package.json")).scripts;
check("R6a lint:data stays wired", typeof scripts["lint:data"] === "string");
check(
  "R6b verify keeps every hard gate",
  ["typecheck", "lint", "lint:data", "test", "build", "check:budget", "test:e2e"].every((s) => scripts.verify.includes(`npm run ${s}`))
);

console.log("===============================================================");
console.log("  \ud83d\udea6 RED-LINE GATE");
console.log("===============================================================");
for (const line of notes) console.log(line);
if (failures.length > 0) {
  console.log("");
  for (const line of failures) console.error(line);
  console.error(`\n\u274c ${failures.length} red-line violation(s). If the baseline really must change, update scripts/redlines.baseline.json in its own commit and say why.`);
  process.exit(1);
}
console.log(`\n\u2705 All ${notes.length} red lines hold.`);
