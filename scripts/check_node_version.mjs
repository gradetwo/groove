#!/usr/bin/env node
/**
 * Can this Node actually run the test environment?
 *
 *   node scripts/check_node_version.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * CI ran on Node 20 while `jsdom` 30 (and the `undici` 8 it vendors) requires ^22.22.2. `undici`'s
 * `cachestorage.js` calls `webidl.util.markAsUncloneable`, which does not exist on Node 20, so the
 * jsdom environment failed to construct in every worker: 190 unhandled errors, **no test executed**,
 * 0 % coverage, and a red coverage gate that said nothing about the real problem.
 *
 * Rather than re-implement a semver range check, this asks the question directly: construct a JSDOM.
 * If that throws, the toolchain cannot run, and the message says what `engines` wants. It also
 * covers the case `engine-strict` cannot: a `node_modules` installed on one Node and then run on
 * another.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engines = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).engines ?? {};

let jsdom;
try {
  jsdom = require("jsdom");
} catch (err) {
  console.error(`❌ jsdom is not installed (${err.message.split("\n")[0]}) — run \`npm ci\`.`);
  process.exit(1);
}

try {
  const dom = new jsdom.JSDOM("<!doctype html><p>ok</p>");
  dom.window.document.querySelector("p");
  dom.window.close();
} catch (err) {
  console.error(`❌ The DOM test environment cannot start on Node ${process.version}:`);
  console.error(`   ${err.message.split("\n")[0]}`);
  console.error(`   package.json requires node ${engines.node ?? "(unspecified)"} — see .nvmrc.`);
  console.error("   On Node 20 this is `webidl.util.markAsUncloneable is not a function` from");
  console.error("   jsdom's nested undici: the export it needs was added in Node 22.");
  process.exit(1);
}

console.log(`✅ Node ${process.version} can run the jsdom test environment.`);
