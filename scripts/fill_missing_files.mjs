#!/usr/bin/env node
/**
 * Make an entry's file list describe the mirror it is supposed to describe.
 *
 * The drum kit's list was written by hand and carries only its 1659 samples, while its prefix holds 2078 objects — the difference being its six programs and the keymaps they pull in. Nothing is broken: the application fetches the includes at
 * runtime and reachability checks one of them. What is wrong is that the manifest promised to record what the mirror holds and recorded less, so nothing would notice if one of those 419 went missing.
 *
 * **The bucket is the source of truth here, not the repository tree.** The first version of this script enumerated the pinned tree and found 3699 "missing" files, because `virtuosity_drums` holds several kits while this entry mirrors one —
 * it would have declared thousands of files that were never uploaded. What the manifest has to describe is what was stored.
 *
 * Files are hashed by fetching them from the mirror, and only below a size limit: a mapping is a few kilobytes, a sample is megabytes, and silently pulling hundreds of megabytes to complete a list would be the expensive way to find out
 * that the mirror is missing samples. Anything larger is reported and left to the uploader.
 *
 * Usage: node scripts/fill_missing_files.mjs <entry-id> [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const MAX_HASH_BYTES = 1024 * 1024;
const MANIFEST = path.join(process.cwd(), "public", "samples", "manifest.json");
const argv = process.argv.slice(2);
const entryId = argv.find((argument) => !argument.startsWith("--"));
const write = argv.includes("--write");

/** The credentials are an S3 endpoint, in the same place the uploader reads them from. */
function r2Config() {
  const values = new Map();
  const env = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(env)) {
    for (const line of fs.readFileSync(env, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) values.set(match[1], match[2].replace(/^"|"$/g, ""));
    }
  }
  const account = process.env.R2_ACCOUNT_ID ?? values.get("R2_ACCOUNT_ID");
  const keyId = process.env.R2_ACCESS_KEY_ID ?? values.get("R2_ACCESS_KEY_ID");
  const secret = process.env.R2_SECRET_ACCESS_KEY ?? values.get("R2_SECRET_ACCESS_KEY");
  const root = process.env.VITE_SAMPLE_ROOT ?? values.get("VITE_SAMPLE_ROOT");
  if (!account || !keyId || !secret || !root) {
    console.error("❌ R2 credentials or VITE_SAMPLE_ROOT are missing (checked the environment and .env.local)");
    process.exit(1);
  }
  return {
    args: ["--s3-provider", "Cloudflare", "--s3-access-key-id", keyId, "--s3-secret-access-key", secret, "--s3-endpoint", `https://${account}.r2.cloudflarestorage.com`],
    root: root.replace(/\/$/, ""),
  };
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const entry = (manifest.entries ?? []).find((candidate) => candidate.id === entryId);
if (!entry) {
  console.error(`❌ no entry "${entryId}" — the manifest holds: ${(manifest.entries ?? []).map((e) => e.id).join(", ")}`);
  process.exit(1);
}
if (!entry.prefix) {
  console.error(`❌ ${entryId} has no prefix, so there is no mirror path to enumerate`);
  process.exit(1);
}

const { args, root } = r2Config();
const prefix = `${entry.prefix.replace(/\/$/, "")}/`;
const listing = execFileSync("rclone", ["lsl", `:s3:groove/${prefix}`, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
/** `rclone lsl` prints size, date, time and then the path — which may contain spaces, so the path is everything after the fourth field. */
const stored = new Map();
for (const line of listing.split("\n")) {
  const match = /^\s*(\d+)\s+[\d-]+\s+[\d:.]+(?:\.\d+)?\s+(.+?)\s*$/.exec(line);
  if (match) stored.set(match[2], Number(match[1]));
}

const listed = new Map((entry.files ?? []).map((file) => [file.path, file.bytes]));
const missing = [...stored.keys()].filter((p) => !listed.has(p)).sort();
const absent = [...listed.keys()].filter((p) => !stored.has(p)).sort();

console.log(`${entryId}: mirror holds ${stored.size} · list records ${listed.size} · missing ${missing.length} · listed but not stored ${absent.length}`);
if (absent.length > 0) {
  // The dangerous direction: a list naming a file the mirror does not have would 404 in the application.
  for (const p of absent.slice(0, 5)) console.log(`  ❗ not in the mirror: ${p}`);
}
if (missing.length === 0) {
  console.log("  nothing to add");
  process.exit(0);
}

const tooBig = missing.filter((p) => stored.get(p) > MAX_HASH_BYTES);
const hashable = missing.filter((p) => stored.get(p) <= MAX_HASH_BYTES);
console.log(`  hashing ${hashable.length} file(s) under ${MAX_HASH_BYTES} bytes${tooBig.length ? `, reporting ${tooBig.length} larger one(s)` : ""}`);
for (const p of tooBig.slice(0, 5)) console.log(`    ${Math.round(stored.get(p) / 1024)} KB  ${p}`);

const added = [];
for (const filePath of hashable) {
  const raw = await fetch(`${root}/${prefix}${filePath.split("/").map(encodeURIComponent).join("/")}`);
  if (!raw.ok) {
    console.error(`  ❌ ${filePath} answered ${raw.status} from the mirror`);
    process.exit(1);
  }
  const bytes = Buffer.from(await raw.arrayBuffer());
  added.push({ path: filePath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}

if (!write) {
  console.log("(report only — pass --write to add them)");
  process.exit(0);
}

const kept = (entry.files ?? []).filter((file) => stored.has(file.path));
entry.files = [...kept, ...added].sort((a, b) => a.path.localeCompare(b.path));
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✅ ${entryId}: added ${added.length}, list now ${entry.files.length}`);
