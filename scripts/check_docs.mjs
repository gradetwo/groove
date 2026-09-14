#!/usr/bin/env node
/**
 * Docs baseline self-check (E-09b).
 *
 * Guards the "文档声称 == 实测证据" contract that E-09 established: the three
 * planning documents must not drift away from the code again.
 *
 * Asserts:
 *   1. every planning doc states the version in `package.json` in its header;
 *   2. ROADMAP_V2.md and BACKLOG.md mention that version in their header/status block;
 *   3. the src file/line counts written into IMPROVEMENT_PLAN.md's baseline header
 *      are within ±10% of reality.
 *
 * Local, offline and fast (a src walk + a few reads); no network, no build.
 * Run with `npm run docs:check` or `node scripts/check_docs.mjs`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TOLERANCE = 0.1; // ±10%
const HEADER_LINES = 15; // "header / status section" for version mentions

const PLANNING_DOCS = ["IMPROVEMENT_PLAN.md", "ROADMAP_V2.md", "BACKLOG.md"];
// Per-doc "this is our baseline version" claim. Explicit patterns avoid matching
// version numbers that appear inside filenames (e.g. CODE_REVIEW_AND_PLAN_v1.16.0.md).
const VERSION_CLAIM = {
  "IMPROVEMENT_PLAN.md": /版本\s*\*\*v(\d+\.\d+\.\d+)\*\*/,
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

/* 3) IMPROVEMENT_PLAN baseline counts within ±10% of src reality --------- */
function countSources(dir) {
  let files = 0;
  let lines = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = countSources(full);
      files += nested.files;
      lines += nested.lines;
    } else if (/\.tsx?$/.test(entry.name)) {
      files += 1;
      // Match `wc -l`: count newline characters.
      lines += (fs.readFileSync(full, "utf8").match(/\n/g) || []).length;
    }
  }
  return { files, lines };
}

const m = read("IMPROVEMENT_PLAN.md").match(
  /全部\s*(\d+)\s*个\s*TS\/TSX\s*文件、\s*([\d,]+)\s*行/
);
if (!m) {
  problems.push(
    "IMPROVEMENT_PLAN.md baseline header has no '全部 N 个 TS/TSX 文件、M 行' claim to verify"
  );
} else {
  const statedFiles = Number(m[1]);
  const statedLines = Number(m[2].replace(/,/g, ""));
  const actual = countSources(path.join(ROOT, "src"));
  const drift = (stated, real) => Math.abs(stated - real) / real;
  for (const [label, stated, real] of [
    ["files", statedFiles, actual.files],
    ["lines", statedLines, actual.lines],
  ]) {
    if (drift(stated, real) <= TOLERANCE) {
      oks.push(
        `IMPROVEMENT_PLAN baseline ${label} ${stated.toLocaleString("en-US")} within ±10% of ${real.toLocaleString("en-US")}`
      );
    } else {
      problems.push(
        `IMPROVEMENT_PLAN baseline ${label} claims ${stated.toLocaleString("en-US")} but src has ${real.toLocaleString("en-US")} (${(drift(stated, real) * 100).toFixed(1)}% drift > 10%)`
      );
    }
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
    `\n❌ ${problems.length} doc/reality drift(s). Update the planning docs (and IMPROVEMENT_PLAN.md's baseline header) so the claims match the code.`
  );
  process.exit(1);
}
console.log(`\n✅ ${oks.length} doc baseline claim(s) hold.`);
