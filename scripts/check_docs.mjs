#!/usr/bin/env node
/**
 * Docs baseline self-check (E-09b).
 *
 * Guards the "文档声称 == 实测证据" contract that E-09 established: the three
 * planning documents must not drift away from the code again.
 *
 * Asserts:
 *   1. every planning doc states the version in `package.json` in its header;
 *   2. ROADMAP_V2.md and BACKLOG.md mention that version in their header/status block.
 *
 * A third assertion — the src file/line counts in the old `IMPROVEMENT_PLAN.md` header — went with
 * that document when the repository was prepared for open source: the counts described a tree that
 * no longer resembles it, and a stale count is worse than no count.
 *
 * Local, offline and fast (a src walk + a few reads); no network, no build.
 * Run with `npm run docs:check` or `node scripts/check_docs.mjs`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const HEADER_LINES = 15; // "header / status section" for version mentions

const PLANNING_DOCS = ["ROADMAP_V2.md", "BACKLOG.md"];
// Per-doc "this is our baseline version" claim. Explicit patterns avoid matching
// version numbers that appear inside filenames (e.g. CODE_REVIEW_AND_PLAN_v1.16.0.md).
const VERSION_CLAIM = {
  "ROADMAP_V2.md": /当前基线\*\*：v(\d+\.\d+\.\d+)/,
  "BACKLOG.md": /当前基线：\*\*v(\d+\.\d+\.\d+)\*\*/,
};
const stripFilenames = (text) => text.replace(/[\w./-]*v\d+\.\d+\.\d+\.md/g, "");

const problems = [];
const oks = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const headerOf = (text) => text.split("\n").slice(0, HEADER_LINES).join("\n");

const version = JSON.parse(read("package.json")).version;

/* 1) Each doc's header must state the current version --------------------- */
for (const doc of PLANNING_DOCS) {
  const stated = headerOf(read(doc)).match(VERSION_CLAIM[doc])?.[1] ?? null;
  if (stated === version) {
    oks.push(`${doc} header states v${version}`);
  } else {
    problems.push(
      `${doc} header states ${stated ? `v${stated}` : "(no version)"} but package.json is v${version}`
    );
  }
}

/* 2) ROADMAP/BACKLOG status block must mention the current version -------- */
for (const doc of ["ROADMAP_V2.md", "BACKLOG.md"]) {
  if (stripFilenames(headerOf(read(doc))).includes(`v${version}`)) {
    oks.push(`${doc} status block mentions v${version}`);
  } else {
    problems.push(`${doc} header/status block does not mention the current version v${version}`);
  }
}

/* Report ----------------------------------------------------------------- */
console.log("===============================================================");
console.log("  📄 DOCS BASELINE CHECK (E-09)");
console.log(`  package.json version: v${version}`);
console.log("===============================================================");
for (const line of oks) console.log(`✅ ${line}`);
if (problems.length > 0) {
  console.log("");
  for (const line of problems) console.error(`❌ ${line}`);
  console.error(
    `\n❌ ${problems.length} doc/reality drift(s). Update the planning docs so the claims match the code.`
  );
  process.exit(1);
}
console.log(`\n✅ ${oks.length} doc baseline claim(s) hold.`);
