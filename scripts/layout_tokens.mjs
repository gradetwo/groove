#!/usr/bin/env node
/**
 * Layout-token sync gate.
 *
 *   npm run layout:sync      # write the tokens from TS into src/index.css
 *   npm run check:layout     # report drift and exit non-zero (this is the one in `verify`)
 *
 * WHY THIS EXISTS
 * ---------------
 * Three numbers have to be the same on both sides of the CSS/TS line — the phone width and height
 * boundaries (media queries cannot read a custom property) and the shared bottom row's transport
 * width. Each had been written by hand twice, and one pair (480 vs 500) had already drifted: a
 * 490 px-tall landscape viewport was styled as a short phone while JS classified it as tall.
 *
 * A test pinned each pair, which works until somebody adds a pair nobody thought to pin. So the
 * value lives in `src/platform/layoutTokens.ts` and this script writes it into the stylesheet; the
 * gate fails on drift, whether the number was typed by hand or the rule was deleted outright.
 *
 * The rewriting itself is `src/platform/layoutCss.ts` (pure, and unit-tested); this file is only
 * the I/O and the report.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findLayoutCssDrift, syncLayoutCss } from "../src/platform/layoutCss.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PATH = path.join(ROOT, "src/index.css");
const CHECK = process.argv.includes("--check");

const css = fs.readFileSync(CSS_PATH, "utf8");

if (CHECK) {
  const drift = findLayoutCssDrift(css);
  if (drift.length === 0) {
    console.log("✅ src/index.css agrees with src/platform/layoutTokens.ts.");
    process.exit(0);
  }
  console.error("❌ Layout drift between src/index.css and src/platform/layoutTokens.ts:");
  for (const item of drift) {
    const found = item.found === null ? "missing" : item.found;
    console.error(`   - ${item.label}: stylesheet says ${found}, ${item.source} says ${item.expected}`);
  }
  console.error("\n   Fix with `npm run layout:sync` (or change the token if the token is wrong).");
  process.exit(1);
}

const { css: next, changed } = syncLayoutCss(css);
if (changed.length === 0) {
  console.log("✅ src/index.css already matches src/platform/layoutTokens.ts.");
} else {
  fs.writeFileSync(CSS_PATH, next);
  for (const line of changed) console.log(`✏️  src/index.css → ${line}`);
  console.log(`✅ Wrote ${changed.length} value(s) from src/platform/layoutTokens.ts.`);
}
