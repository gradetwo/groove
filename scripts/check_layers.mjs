#!/usr/bin/env node
/**
 * Layering gate: does presentation leak into logic?
 *
 *   node scripts/check_layers.mjs            # report + exit non-zero on a violation
 *   node scripts/check_layers.mjs --report    # report only, always exit 0
 *
 * WHY THIS EXISTS
 * ---------------
 * The product is about to carry three surfaces — PC, iPad and phone — with *different* features and
 * interactions, and PC is the fullest. That only stays affordable if the layers below the UI are
 * reusable as they are: if a change to the phone's transport can force a change to the sequencer
 * store, the surfaces are one program with three skins and every feature costs three times.
 *
 * So the boundary is declared and enforced rather than described:
 *
 *   domain      src/audio, src/data, src/utils, src/types, src/i18n
 *               Pure behaviour and data. No React, no DOM, no knowledge that a screen exists.
 *
 *   logic       src/features, src/state, src/store
 *               Application behaviour and state. May use React (hooks) and the DOM only where the
 *               behaviour *is* DOM — the playhead writes node styles on purpose, which is the whole
 *               point of that design — but must never import a component or decide what a surface
 *               looks like.
 *
 *   platform    src/platform
 *               One place that answers "what kind of surface am I on". Everything above it is a
 *               prop, so a new surface is a new caller rather than a new branch.
 *
 *   ui          src/components, src/views, src/ui, src/App.tsx
 *               May import anything below. This is where surfaces differ, and the only layer
 *               allowed to contain layout, styling and per-surface composition.
 *
 * THE RULES
 * ---------
 *  R1 domain must not import React, logic or ui, and must not touch a *presentation* DOM global.
 *     `src/audio` and `src/i18n` are named exceptions: the Web Audio API, an AudioWorklet and the
 *     platform language preference mean those modules legitimately touch `window`, `document`,
 *     `navigator`, `localStorage` and `requestAnimationFrame`. Exempting them keeps the rule about
 *     the thing that actually matters — a domain module must not reach *up* into logic or UI — while
 *     still catching a `src/utils` helper that starts reaching for the DOM it has no business in.
 *  R2 logic must not import ui (components, views, ui primitives). Types are not exempt: a type
 *     that only exists because a component renders it is a component's type, and importing it
 *     makes the component's shape part of the logic layer's contract.
 *  R3 logic must not read platform capabilities directly; it takes them as arguments. This is the
 *     rule that keeps "phone behaves differently" from spreading into a hook.
 *  R4 ui may import anything below it.
 *
 * Deliberate exceptions are declared in ALLOW below, each with a reason and a shrinking count, so
 * the gate fails on a *new* violation and the existing debt is visible rather than silently
 * grandfathered.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const REPORT_ONLY = process.argv.includes("--report");

/**
 * Known violations, as `importer -> importee` with the reason it is tolerated.
 *
 * Every entry is debt: the point of listing them is that the list can only get shorter, and a new
 * one fails the gate. Keep the reason concrete enough that the next person can decide whether to
 * pay it off.
 */
const ALLOW = new Map([
  /*
   * Empty, and it should stay that way.
   *
   * It held two entries: `src/data/index/loader.ts` naming the custom-genre feature (since inverted —
   * the loader now takes a resolver that `src/app/installCustomGenreResolver.ts` supplies), and
   * `src/hooks/useAppShortcuts.ts` importing `NavTab` from a component (since moved to
   * `src/app/navigation.ts`).
   *
   * An entry here is debt with a stated fix. Adding one is legitimate when a dependency is real and
   * genuinely cannot be inverted yet — but a non-empty table should be a thing the team has decided,
   * not a place a violation goes to be forgotten, so `R6f` fails if this map is not empty. Pay the
   * debt or delete the violation; do not park it.
   */
]);

const LAYERS = [
  // `src/utils` is deliberately NOT domain: haptics, PWA and telemetry are thin wrappers over
  // browser APIs, i.e. the platform, not the product's behaviour. Putting them here would mean
  // either exempting the whole layer from the purity rule (making it vacuous) or pretending
  // `navigator.vibrate` is domain logic.
  { name: "domain", dirs: ["src/audio", "src/data", "src/types", "src/i18n"] },
  { name: "util", dirs: ["src/utils"] },
  { name: "platform", dirs: ["src/platform"] },
  { name: "logic", dirs: ["src/features", "src/state", "src/store", "src/hooks"] },
  { name: "ui", dirs: ["src/components", "src/views", "src/ui"] },
];

const UI_DIR_PREFIXES = ["src/components", "src/views", "src/ui"];

/** Every .ts/.tsx under src, excluding tests and test helpers. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test" || entry.name === "__mocks__") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function layerOf(relPath) {
  if (relPath === "src/App.tsx") return "ui";
  for (const layer of LAYERS) {
    if (layer.dirs.some((d) => relPath === d || relPath.startsWith(`${d}/`))) return layer.name;
  }
  return "unknown";
}

/** Import specifiers, both `from "x"` and bare `import "x"`. */
function importsOf(source) {
  const specs = [];
  const re = /(?:^|\n)\s*import\s+(?:[^"']*?\sfrom\s+)?["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(source)) !== null) specs.push(m[1]);
  // Re-exports count as imports for layering purposes.
  const reExport = /(?:^|\n)\s*export\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;
  while ((m = reExport.exec(source)) !== null) specs.push(m[1]);
  return specs;
}

/** Resolve a relative specifier to a repo-relative module path, without extensions. */
function resolveSpecifier(fromRel, spec) {
  if (!spec.startsWith(".")) return null; // package or alias: not a layering question here
  const base = path.posix.dirname(fromRel);
  const joined = path.posix.normalize(path.posix.join(base, spec));
  return joined.replace(/\.(tsx?|jsx?)$/, "");
}

const files = walk(SRC).map(rel);
const violations = [];
const counts = { files: files.length, byLayer: {} };
const crossLayer = {};

for (const file of files) {
  const layer = layerOf(file);
  counts.byLayer[layer] = (counts.byLayer[layer] ?? 0) + 1;
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const spec of importsOf(source)) {
    const target = resolveSpecifier(file, spec);
    if (!target) continue;
    const targetLayer = layerOf(target);
    crossLayer[`${layer} -> ${targetLayer}`] = (crossLayer[`${layer} -> ${targetLayer}`] ?? 0) + 1;

    const key = `${file} -> ${target}`;
    const isUiImport = UI_DIR_PREFIXES.some((d) => target === d || target.startsWith(`${d}/`));
    /**
     * R3 is about *capability detection* — "is this a phone" — not about platform services.
     *
     * `announcer` is an event bus in the platform layer that logic is supposed to publish to, and
     * treating that as a layering breach would push announcement calls up into the views, which is
     * the opposite of decoupling. What must never happen is a hook deciding *behaviour* by asking
     * what kind of device it is; that is why only the capability module is listed.
     */
    const touchesPlatform =
      target === "src/platform/capabilities" || target.startsWith("src/hooks/useDeviceCapabilities");

    // R1: domain stays pure.
    if (layer === "domain" && (targetLayer === "logic" || targetLayer === "ui" || touchesPlatform)) {
      violations.push({ key, rule: "R1", detail: `domain imports ${targetLayer} (${target})` });
    }
    // R2: logic must not depend on a component's shape.
    if (layer === "logic" && isUiImport) {
      violations.push({ key, rule: "R2", detail: `logic imports ui (${target})` });
    }
    // R3: logic must not read platform capabilities directly.
    if (layer === "logic" && touchesPlatform) {
      violations.push({ key, rule: "R3", detail: `logic reads platform capabilities (${target})` });
    }
  }
}

// React/DOM in the domain layer is a separate question from the import graph.
const DOM_GLOBALS = /\b(document|window|navigator|localStorage|requestAnimationFrame)\b/;
for (const file of files) {
  if (layerOf(file) !== "domain") continue;
  /**
   * `src/audio` is the Web Audio layer and `src/i18n` reads the platform language; both touch DOM
   * globals by nature. The rule that matters for them is "must not import logic or ui", which the
   * import-graph pass above already enforces.
   */
  const DOM_GLOBALS_EXEMPT = ["src/audio/", "src/i18n/"];
  if (DOM_GLOBALS_EXEMPT.some((d) => file.startsWith(d))) continue;
  const source = fs
    .readFileSync(path.join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  if (/from\s+["']react["']/.test(source)) {
    violations.push({ key: file, rule: "R1", detail: "domain imports react" });
  }
  if (DOM_GLOBALS.test(source)) {
    violations.push({ key: file, rule: "R1", detail: "domain touches a DOM global" });
  }
}

const allowed = [];
const failing = [];
for (const v of violations) {
  if (ALLOW.has(v.key)) allowed.push(v);
  else failing.push(v);
}

console.log("===============================================================");
console.log("  🧱 LAYER GATE — presentation must not leak into logic");
console.log("===============================================================");
console.log(`files scanned: ${counts.files}`);
for (const layer of ["domain", "platform", "logic", "util", "ui", "unknown"]) {
  if (counts.byLayer[layer]) console.log(`  ${layer.padEnd(9)} ${String(counts.byLayer[layer]).padStart(4)} file(s)`);
}
console.log("\ncross-layer imports (importer layer -> imported layer):");
for (const [pair, n] of Object.entries(crossLayer).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pair.padEnd(24)} ${n}`);
}
console.log("");

if (allowed.length) {
  console.log(`⚠️  ${allowed.length} tolerated violation(s), declared in ALLOW:`);
  for (const v of allowed) console.log(`   · ${v.key} — ${ALLOW.get(v.key).split(".")[0]}`);
  console.log("");
}

if (failing.length === 0) {
  console.log("✅ No undeclared layer violation.");
} else {
  console.log(`❌ ${failing.length} undeclared layer violation(s):`);
  for (const v of failing) console.log(`   [${v.rule}] ${v.key} — ${v.detail}`);
  console.log(
    "\n   A new violation here means a surface is about to become inseparable from the logic.\n" +
      "   Prefer taking the value as an argument over reading it where the behaviour lives; if the\n" +
      "   dependency is legitimate, add it to ALLOW in scripts/check_layers.mjs with a reason."
  );
}

process.exit(REPORT_ONLY ? 0 : failing.length === 0 ? 0 : 1);
