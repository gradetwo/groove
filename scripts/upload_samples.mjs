#!/usr/bin/env node
/**
 * Mirror one manifest entry to R2 — the scripted form of what was done by hand for the drum kit.
 *
 * **It computes first and uploads only when asked.** Every run reports the three numbers the owner set the ceiling for (what would be sent, what is stored, what the ceiling is), measures each sample's duration and lists the files
 * it would copy. `--upload` is what turns that into an upload. A tool that begins moving hundreds of megabytes on the first invocation cannot be run to find out what it thinks.
 *
 * **Chunking, resuming and verification are rclone's job.** It already does all three, so this script's work is to decide *what* should be sent, measure it, and hand it over — reimplementing the transfer would add a second thing that
 * can be wrong about bytes.
 *
 * Usage:
 *   node scripts/upload_samples.mjs <entry-id>            # report only
 *   node scripts/upload_samples.mjs <entry-id> --upload   # clone, measure, write the manifest, copy
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const MANIFEST = path.join(process.cwd(), "public", "samples", "manifest.json");
const argv = process.argv.slice(2);
const entryId = argv.find((a) => !a.startsWith("--"));
const doUpload = argv.includes("--upload");

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const fmt = (b) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : `${(b / MB).toFixed(1)} MB`);

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const entry = (manifest.entries ?? []).find((e) => e.id === entryId);
if (!entry) {
  console.error(`❌ no entry "${entryId}" — the manifest holds: ${(manifest.entries ?? []).map((e) => e.id).join(", ")}`);
  process.exit(1);
}

/** What is already in the bucket, read from rclone rather than from a number someone typed once. */
function storedBytes() {
  try {
    const out = execFileSync("rclone", ["size", "r2:groove", "--json"], { encoding: "utf8" });
    return JSON.parse(out).bytes ?? 0;
  } catch (error) {
    // ⚠️ Refusing rather than assuming zero: a budget check that silently reads 0 would approve anything.
    console.error(`❌ could not read the bucket size (${error instanceof Error ? error.message : error})`);
    console.error("   A budget check that assumes an empty bucket approves anything, so this stops here.");
    process.exit(1);
  }
}

const planned = (entry.files ?? []).reduce((sum, f) => sum + (f.bytes ?? 0), 0);
const stored = storedBytes();
// ⭐ The ceiling is the owner's: 12 GB, chosen so the four libraries and the three Karoryfer instruments all fit.
const ceiling = 12 * GB;
console.log(`${entryId} @ ${entry.pin ?? "?"}`);
console.log(`  planned ${fmt(planned)} · stored ${fmt(stored)} · ceiling ${fmt(ceiling)} → ${fmt(stored + planned)} of ${fmt(ceiling)}`);
if (stored + planned >= ceiling) {
  console.error("  ❌ over the ceiling — nothing will be uploaded");
  process.exit(1);
}
if ((entry.files ?? []).length === 0) {
  console.error("  ❌ the entry lists no files — run scripts/build_sample_manifest.mjs first");
  process.exit(1);
}

if (!doUpload) {
  console.log(`  ${(entry.files ?? []).length} files, ${entry.sfz ?? "no sfz declared"}`);
  console.log("  (report only — pass --upload to clone, measure and copy)");
  process.exit(0);
}

/**
 * ⭐ A shallow clone at the pin, because a manifest entry names a commit and the bytes have to be that commit's. Measured durations come from these bytes, which is the only way `durationSeconds` can mean "measured" rather than "declared".
 */
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `groove-mirror-${entryId}-`));
console.log(`  cloning ${entry.repo} @ ${entry.pin} → ${workdir}`);
execFileSync("git", ["clone", "--depth", "1", "--branch", entry.pin, `https://github.com/${entry.repo}.git`, workdir], { stdio: "inherit" });

// ⭐ Durations, measured rather than declared — the same instrument the manifest was built with.
let measured = 0;
let longest = 0;
for (const file of entry.files ?? []) {
  if (!/\.(wav|flac|aiff|aif|ogg|mp3)$/i.test(file.path)) continue;
  try {
    const seconds = Number(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(workdir, file.path)], { encoding: "utf8" }).trim()
    );
    if (Number.isFinite(seconds)) {
      file.durationSeconds = seconds;
      measured += 1;
      longest = Math.max(longest, seconds);
    }
  } catch {
    // A file ffprobe cannot read is reported by its absence from the count, not by a fabricated duration.
  }
}
entry.durationSeconds = longest;
entry.mirroredAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`  measured ${measured} file(s) · longest ${longest.toFixed(6)} s · manifest updated`);

// ⭐ The transfer itself is rclone's: it chunks, resumes and verifies, and this script does not reimplement any of that.
execFileSync("rclone", ["copy", workdir, `r2:groove/${entry.prefix}/`, "--transfers", "8", "--checkers", "16", "--stats-one-line"], { stdio: "inherit" });
console.log(`✅ copied to r2:groove/${entry.prefix}/ — now run scripts/check_mirror_reachability.mjs`);
