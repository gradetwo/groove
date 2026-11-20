#!/usr/bin/env node
/**
 * Run the SFZ content gate over a local tree — a mirror checkout, an unpacked release, a scratch tree the uploader kept.
 *
 * The uploader runs the same gate on its way in (`scripts/upload_samples.mjs`), so this checker is not a second opinion: it is the same scan (`scripts/lib/sfz_content_gate.mjs`)
 * pointed at bytes that are already on disk, for the cases the uploader is not part of — auditing what the mirror already holds, or checking a library before its first upload
 * is attempted. The 2026-11-20 mirror audit was a one-off script run by hand; this is that audit as a kept tool.
 *
 * Usage:
 *   node scripts/check_sfz_content.mjs <dir> [more dirs…]
 *
 * Exit 0: every text file scanned, no violation. Exit 1: at least one violation, each printed with its file and line. Exit 2: no directory given — a scan of nothing must
 * not look like a pass.
 */
import fs from "node:fs";
import { formatViolations, scanSfzTree } from "./lib/sfz_content_gate.mjs";

const dirs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (dirs.length === 0) {
  console.error("❌ no directory given — usage: node scripts/check_sfz_content.mjs <dir> [more dirs…]");
  process.exit(2);
}

let failed = false;
for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    console.error(`❌ ${dir} does not exist`);
    process.exit(2);
  }
  const { scanned, violations } = scanSfzTree(dir);
  if (violations.length > 0) {
    failed = true;
    console.error(`❌ ${dir} — ${violations.length} violation(s) in ${scanned} scanned text file(s)`);
    console.error(formatViolations(violations));
  } else {
    console.log(`✅ ${dir} — ${scanned} text file(s) scanned, no loop_mode/tune violations`);
  }
}
process.exit(failed ? 1 : 0);
