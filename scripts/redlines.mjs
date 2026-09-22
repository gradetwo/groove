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

/* R1b \u2014 no second hand-written version number in src/ -------------------------- */
// R1 only proves the four generated files agree with package.json. It does not
// stop a *new* stale literal from appearing in application code, which is
// exactly what happened: `exportProjectToGrooveFile` defaulted its `appVersion`
// to a hardcoded "1.15.2", so every exported .groove file carried a version
// stamp two minors out of date. Any semver-shaped string literal under src/
// must therefore come from `src/version.ts`.
const SEMVER_LITERAL = /["'`]\d+\.\d+\.\d+["'`]/;
const walkSrc = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walkSrc(p) : [p];
  });
const semverOffenders = walkSrc(path.join(ROOT, "src"))
  .filter((f) => /\.tsx?$/.test(f))
  .filter((f) => !f.endsWith(path.join("src", "version.ts")))
  .filter((f) => !f.includes(`${path.sep}test${path.sep}`))
  .flatMap((f) => {
    const rel = path.relative(ROOT, f);
    return fs
      .readFileSync(f, "utf8")
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .filter(({ line }) => SEMVER_LITERAL.test(line))
      .map(({ n }) => `${rel}:${n}`);
  });
check(
  "R1b no hand-written version literal outside src/version.ts",
  semverOffenders.length === 0,
  semverOffenders.join(", ")
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

/* R8 \u2014 genre data must stay out of the first paint (A-01) ---------------------- */
const distAssets = path.join(ROOT, "dist/assets");
if (fs.existsSync(distAssets)) {
  const files = fs.readdirSync(distAssets);
  const entryHtml = read("dist/index.html");
  const entryChunk = entryHtml.match(/src="\/assets\/(index-[^"]+\.js)"/)?.[1];
  const studioChunk = files.find((f) => f.startsWith("StudioView-") && f.endsWith(".js"));

  const staticallyImportsGenres = (file) => {
    if (!file) return false;
    const source = fs.readFileSync(path.join(distAssets, file), "utf8");
    return /from"\.\/genre-/.test(source) || /from '\.\/genre-/.test(source);
  };

  check(
    "R8a default route does not statically import genre chunks",
    !staticallyImportsGenres(entryChunk) && !staticallyImportsGenres(studioChunk),
    "genre-* reachable from the entry/StudioView chunk"
  );
  check(
    "R8b genre chunks still exist for on-demand loading",
    files.some((f) => f.startsWith("genre-") && f.endsWith(".js"))
  );
} else {
  notes.push("\u23ed  R8 skipped (no dist/ \u2014 run npm run build)");
}

/* R7 \u2014 version check payload stays small (A-08) ------------------------------ */
const versionJsonSize = fs.statSync(path.join(ROOT, "public/version.json")).size;
check(
  "R7a update check payload stays under 8KB",
  versionJsonSize <= 8 * 1024,
  `${(versionJsonSize / 1024).toFixed(1)}KB`
);
const changelogPath = path.join(ROOT, "public/changelog.json");
check("R7b changelog archive exists separately", fs.existsSync(changelogPath));
if (fs.existsSync(changelogPath)) {
  // A sync must never shrink the release history (it once did: `version:sync`
  // regenerated the archive from a file that no longer carried it).
  const archive = JSON.parse(fs.readFileSync(changelogPath, "utf8"));
  const count = Array.isArray(archive.changelog) ? archive.changelog.length : 0;
  check(
    "R7c release history never shrinks",
    count >= baseline.changelogEntries,
    `${count} entries (baseline ${baseline.changelogEntries})`
  );
}

/* R6 \u2014 gates must stay wired ------------------------------------------------ */
const scripts = JSON.parse(read("package.json")).scripts;
check("R6a lint:data stays wired", typeof scripts["lint:data"] === "string");
check(
  "R6b verify keeps every hard gate",
  ["typecheck", "lint", "lint:data", "test", "build", "check:budget", "test:e2e"].every((s) => scripts.verify.includes(`npm run ${s}`))
);

/**
 * R6c — the E2E gate runs the PC profile while the phone/tablet surfaces are being redesigned, so
 * the *full* matrix must stay declared and one command away. Without this, "PC only for now" quietly
 * becomes "mobile coverage was deleted", and nobody notices until a redesign ships untested.
 */
const matrixSource = read("scripts/test_matrix.js");
const declaredMobileTargets = (matrixSource.match(/isMobile: true/g) || []).length;
const declaredTabletTargets = (matrixSource.match(/isTablet: true/g) || []).length;
check(
  "R6c the E2E matrix still declares every phone and tablet target",
  declaredMobileTargets === 2 && declaredTabletTargets === 2
);
check(
  "R6c the full matrix is still one command away",
  scripts["test:e2e:all"] === "E2E_PROFILE=all node scripts/test_matrix.js" &&
    scripts["test:e2e"] === "E2E_PROFILE=pc node scripts/test_matrix.js"
);
check(
  "R6c the profile selector validates its input",
  matrixSource.includes("is not a profile") && matrixSource.includes("PROFILE_MATCHERS")
);

/**
 * R6d — the deploy must refuse to ship a build that is not the version being released.
 *
 * There is no ordering enforced between "bump the version" and "build". v2.0.64 was deployed while
 * the repository said v2.0.65, and the only reason it was noticed is that the live `version.json`
 * disagreed with the repo: the deploy log was green and the upload succeeded. The guard is one file
 * read, so this red line only has to prove the guard is still there.
 */
const deploySource = read("scripts/deploy.mjs");
/**
 * R6e — the CSS-usage gate must stay wired.
 *
 * A dead CSS rule is invisible: nothing fails and nothing warns, so `.landscape-compact-bar` sat in
 * the stylesheet forcing 28 px buttons long after the class stopped being applied. The gate is the
 * only thing that notices, so it must not be quietly dropped from `verify`.
 */
/**
 * R6f — the layer gate's tolerated-violation table must be empty.
 *
 * It exists so a real dependency that cannot yet be inverted can be declared *with its fix* instead of
 * silently breaking the gate. But a parking space becomes a graveyard: the table must be a decision the
 * team notices, not a place violations accumulate. Both original entries have been paid, so an empty
 * table is now the contract.
 */
const layerSource = read("scripts/check_layers.mjs");
const allowBlock = layerSource.match(/const ALLOW = new Map\(\[([\s\S]*?)\]\);/);
check(
  "R6f the layer gate tolerates no violations",
  Boolean(allowBlock) && allowBlock[1].replace(/\/\*[\s\S]*?\*\//g, "").trim() === ""
);

/**
 * R6g — the documentation-reference gate must stay wired.
 *
 * These docs are the only record of why several designs are the way they are, and the plan states what
 * is *not* done. A stale file reference therefore misleads in a way nothing else catches: the reader
 * cannot tell whether the thing was never built, was deleted, or was renamed. Seven existed.
 */
check(
  "R6g verify keeps the doc-reference gate",
  scripts.verify.includes("npm run check:docs:refs") &&
    scripts["check:docs:refs"] === "vite-node scripts/check_doc_refs.mjs"
);

check(
  "R6e verify keeps the CSS-usage gate",
  // `vite-node`, not `node`: the sweep imports its parsing helpers from `src/utils/cssUsage.ts` so the
  // same code the tests cover is the code that runs. Anything that only asserts "it is wired" would
  // let the runner change silently, so the command is pinned as well as the presence.
  scripts.verify.includes("npm run check:css") &&
    scripts["check:css"] === "vite-node scripts/check_css_usage.mjs"
);
check(
  "R6d deploy refuses a dist whose version is not package.json's",
  deploySource.includes("Stale build") &&
    deploySource.includes('path.join(ROOT, "dist", "version.json")') &&
    deploySource.includes("process.exit(1)")
);

/* R9 \u2014 every genre entry point must seed the arranged mix --------------------- */
// User request: each genre's default mix must be arranged for that genre. That only
// holds if *every* path that hands a genre's own pattern to an engine goes through
// `patternFromGenre` / `applyGenreMixDefaults`. Patching the sites ad hoc is exactly
// how one audition path (detail preview, challenge, compare) gets forgotten, so the
// raw shape is banned outright.
const rawGenrePatternOffenders = walkSrc(path.join(ROOT, "src"))
  .filter((f) => /\.tsx?$/.test(f))
  .filter((f) => !f.includes(`${path.sep}test${path.sep}`))
  .flatMap((f) => {
    const rel = path.relative(ROOT, f);
    return fs
      .readFileSync(f, "utf8")
      .split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .filter(({ line }) => /(^|[^\w])setPattern\(/.test(line) && line.includes(".sequencer_pattern"))
      .map(({ n }) => `${rel}:${n}`);
  });
check(
  "R9a no raw genre pattern reaches setPattern (use patternFromGenre)",
  rawGenrePatternOffenders.length === 0,
  rawGenrePatternOffenders.join(", ")
);

// R9b: the mix table must cover exactly the genre ids in the database. Read as text
// so this stays a cheap static gate (the vitest suite asserts the same thing typed).
const mixIds = [...read("src/data/genreMix.ts").matchAll(/^\s{2}"([a-z0-9-]+)":\s*\{\s*category:/gm)].map(
  (m) => m[1]
);
const missingMixIds = dataIds.filter((id) => !mixIds.includes(id));
const orphanMixIds = mixIds.filter((id) => !dataIds.includes(id));
check(
  "R9b genre mix table covers every genre id, no orphans",
  mixIds.length === dataIds.length && missingMixIds.length === 0 && orphanMixIds.length === 0,
  `${mixIds.length} mix entries vs ${dataIds.length} genres` +
    (missingMixIds.length ? `; missing ${missingMixIds.join(",")}` : "") +
    (orphanMixIds.length ? `; orphan ${orphanMixIds.join(",")}` : "")
);

/* R10 — every genre resolves a per-genre FX profile (N-14) ---------------------
 * The registered gap this closes: `DEFAULT_FX_STATE` was one global rack with all four
 * effects off and the send buses hard-coded, so no genre had ever declared an effect.
 * The profile table resolves through a category lookup built from the genre index, so a
 * table entry naming a genre that no longer exists would silently do nothing. That is
 * caught here rather than by listening for it.
 *
 * Read as text to stay a cheap static gate; `src/test/genreFx.test.ts` asserts the same
 * thing against the typed modules.
 */
const fxOverrideIds = [
  ...read("src/data/genreFx.ts")
    .split("export const GENRE_FX")[1]
    .split("\n};")[0]
    .matchAll(/^\s{2}"?([a-zA-Z0-9_-]+)"?:\s*\{/gm),
].map((m) => m[1]);
const orphanFxIds = fxOverrideIds.filter((id) => !dataIds.includes(id));
check(
  "R10 genre FX table has no orphan genre ids",
  orphanFxIds.length === 0,
  `${fxOverrideIds.length} overrides` +
    (orphanFxIds.length ? `; orphan ${orphanFxIds.join(",")}` : "")
);

/**
 * R11a — the MCP surface must stay whole, and must stay outside the app.
 *
 * Two ways the MCP server could rot quietly: a tool could be dropped from the registry (an agent that relied on
 * it gets "method not found" with no test failing), or the web bundle could start importing it, at which point
 * the Node entry point and its 4 MB of library data are a build dependency of the app. The first is a count and
 * a name list; the second is a grep over `src/`.
 */
const registrySource = read("mcp/registry.ts");
const declaredTools = [...registrySource.matchAll(/^\s{4}name: "([a-z_]+)",$/gm)].map((match) => match[1]);
const REQUIRED_MCP_TOOLS = [
  "list_genres",
  "get_genre",
  "search_genres",
  "list_categories",
  "get_genre_relations",
  "list_chord_progressions",
  "get_chord_progression",
  "list_masterclasses",
  "get_pattern",
  "apply_pattern_ops",
  "validate_pattern",
  "pattern_statistics",
  "compare_genres",
  "export_midi",
  "export_ableton",
  "share_url",
  "get_loudness_report",
  "render_audio",
  "analyze_audio",
];
const missingTools = REQUIRED_MCP_TOOLS.filter((name) => !declaredTools.includes(name));
check(
  "R11a every declared MCP tool is still registered",
  missingTools.length === 0,
  missingTools.length ? `missing ${missingTools.join(", ")}` : `${declaredTools.length} tools`
);
const surfaceSource = read("mcp/server.ts");
check(
  "R11a the MCP server still exposes resources and prompts",
  surfaceSource.includes("registerResource") && surfaceSource.includes("registerPrompt")
);
/**
 * Nothing that *ships* may import the MCP server: it is a consumer of the app's layers, not part of the app.
 *
 * `src/test/**` is excluded on purpose — the handler tests live there because vitest only includes `src/**`, and a
 * test reaching the handlers is the point. What must never happen is a component, view, hook or engine importing
 * `mcp/`, which would drag the Node entry point and its 4 MB of library data into the web build.
 */
const srcFiles = walkSrc(path.join(ROOT, "src"))
  .filter((file) => /\.tsx?$/.test(file))
  .filter((file) => !file.includes(`${path.sep}test${path.sep}`));
const appImportsMcp = srcFiles
  .map((file) => ({ file: path.relative(ROOT, file), source: fs.readFileSync(file, "utf8") }))
  .filter(({ source }) => /from "(\.\.\/)+mcp\//.test(source) || /from "@\/mcp\//.test(source))
  .map(({ file }) => file);
check(
  "R11a no app source imports the MCP server",
  appImportsMcp.length === 0,
  appImportsMcp.slice(0, 3).join(", ")
);
// The gate builds the bundle itself, so `verify` is never gated on a stale artifact.
check(
  "R11a the MCP gate stays wired (and builds what it checks)",
  typeof scripts["check:mcp"] === "string" &&
    scripts["check:mcp"].includes("build_mcp.mjs") &&
    scripts["check:mcp"].includes("check_mcp.mjs")
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
