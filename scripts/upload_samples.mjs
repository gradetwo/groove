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
import { createHash } from "node:crypto";

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


/**
 * ⭐ **The credentials are an S3 endpoint, not a configured remote.** This machine has no `r2` remote — `rclone listremotes` shows only `blackhole:` — while `.env.local` holds `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and
 * `R2_SECRET_ACCESS_KEY`, and the account id is what forms `https://<account-id>.r2.cloudflarestorage.com`. So the remote is supplied as arguments: rclone still chunks, resumes and verifies, and nothing has to exist in a config
 * file for the bucket to be reachable.
 */
function r2Config() {
  const env = path.join(process.cwd(), ".env.local");
  const values = new Map();
  if (fs.existsSync(env)) {
    for (const line of fs.readFileSync(env, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) values.set(match[1], match[2].replace(/^"|"$/g, ""));
    }
  }
  const account = process.env.R2_ACCOUNT_ID ?? values.get("R2_ACCOUNT_ID");
  const keyId = process.env.R2_ACCESS_KEY_ID ?? values.get("R2_ACCESS_KEY_ID");
  const secret = process.env.R2_SECRET_ACCESS_KEY ?? values.get("R2_SECRET_ACCESS_KEY");
  // ⚠️ Refused rather than defaulted: an uploader that guesses an endpoint is one that can write to the wrong bucket.
  if (!account || !keyId || !secret) {
    console.error("❌ R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not all present (checked the environment and .env.local)");
    process.exit(1);
  }
  return ["--s3-provider", "Cloudflare", "--s3-access-key-id", keyId, "--s3-secret-access-key", secret, "--s3-endpoint", `https://${account}.r2.cloudflarestorage.com`];
}

/** What is already in the bucket, read from rclone rather than from a number someone typed once. */
function storedBytes() {
  try {
    const out = execFileSync("rclone", ["size", ":s3:groove", "--json", ...r2Config()], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(out).bytes ?? 0;
  } catch (error) {
    // ⚠️ Refusing rather than assuming zero: a budget check that silently reads 0 would approve anything.
    console.error(`❌ could not read the bucket size (${error instanceof Error ? error.message : error})`);
    console.error("   A budget check that assumes an empty bucket approves anything, so this stops here.");
    process.exit(1);
  }
}

/**
 * ⭐ **An archive entry knows what it will send before it is unpacked: the archive's own size.** Its `files` list is empty until then — filled by the step that sees the bytes — so summing `files` would report zero and make the
 * budget check meaningless, which is exactly what happened on the first run against a release-shaped entry.
 */
const planned = entry.archive ? entry.archive.bytes : (entry.files ?? []).reduce((sum, f) => sum + (f.bytes ?? 0), 0);
const stored = storedBytes();
// ⭐ The ceiling is the owner's: 12 GB, chosen so the four libraries and the three Karoryfer instruments all fit.
const ceiling = 12 * GB;
console.log(`${entryId} @ ${entry.pin ?? "?"}`);
console.log(`  planned ${fmt(planned)} · stored ${fmt(stored)} · ceiling ${fmt(ceiling)} → ${fmt(stored + planned)} of ${fmt(ceiling)}`);
if (stored + planned >= ceiling) {
  console.error("  ❌ over the ceiling — nothing will be uploaded");
  process.exit(1);
}
/**
 * ⭐ The guard asks the question that fits the entry's shape. A tree entry with no files has not been enumerated and must be built first; an archive entry has no files *yet* by design, and its size is carried by the archive.
 */
if (!entry.archive && (entry.files ?? []).length === 0) {
  console.error("  ❌ the entry lists no files — run scripts/build_sample_manifest.mjs first");
  process.exit(1);
}

if (!doUpload) {
  console.log(`  ${(entry.files ?? []).length} files, ${entry.sfz ?? "no sfz declared"}`);
  console.log("  (report only — pass --upload to clone, measure and copy)");
  process.exit(0);
}

/**
 * ⭐ **Two shapes of source.** A git entry names a commit; a release entry names an asset. Both end in a directory of bytes, so everything after this point is the same — which is the reason to normalise here rather than branch
 * again later.
 */
let workdir;
if (entry.archive) {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), `groove-mirror-${entryId}-`));
  const zipPath = path.join(workdir, entry.archive.asset);
  console.log(`  downloading ${entry.archive.asset} (${fmt(entry.archive.bytes)})`);
  execFileSync("curl", ["-fsSL", "-o", zipPath, entry.archive.url], { stdio: "inherit" });
  // ⭐ The declared size is checked before unpacking: a release asset has none of git's immutability, so the byte count is the one thing that can be verified cheaply, and a mismatch means the asset changed.
  const actual = fs.statSync(zipPath).size;
  if (actual !== entry.archive.bytes) {
    console.error(`  ❌ ${entry.archive.asset} is ${actual} bytes, the manifest says ${entry.archive.bytes} — refusing to unpack`);
    process.exit(1);
  }
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", workdir], { stdio: "inherit" });
  fs.rmSync(zipPath, { force: true });

  /**
   * ⭐ **`files` and `sfz` are filled here, because only a step that has seen the bytes can fill them.** The entry declares what it knows — tag, asset, size, url — and leaves these empty rather than guessing; the same rule
   * applies to `sha256` and `durationSeconds`, both computed below.
   */
  const found = [];
  const walk = (dir) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) walk(full);
      // ⭐ The same rule the manifest builder uses: repository metadata is not part of the instrument, so it is neither described nor uploaded.
      else if (!dirent.name.startsWith(".")) found.push({ path: path.relative(workdir, full), bytes: fs.statSync(full).size });
    }
  };
  walk(workdir);
  entry.files = found;
  const sfzFiles = found.filter((f) => f.path.endsWith(".sfz"));
  // ⭐ The entry point is chosen, not guessed: a file at the top level if there is one, otherwise the shortest path, because a library's root program is nearer the root than its includes.
  const pick = sfzFiles.find((f) => !f.path.includes("/")) ?? [...sfzFiles].sort((a, b) => a.path.length - b.path.length)[0];
  entry.sfz = pick ? pick.path : "";
  console.log(`  unpacked ${found.length} file(s) · ${sfzFiles.length} sfz · entry: ${entry.sfz || "✗ none found"}`);
  if (!entry.sfz) {
    // ⚠️ An archive with no SFZ cannot be played, whatever else it contains — the same judgement the manifest builder makes for a tree.
    console.error("  ❌ no .sfz anywhere in the archive — this library cannot be played without mappings");
    process.exit(1);
  }
  /**
   * ⚠️ `needs` is **not** written here. It is the list of opcodes the library actually uses, which means parsing its SFZ with the project's own parser — and that is TypeScript, while this is a script. Leaving it for a step that can
   * import the parser is better than deriving it with a regex here and calling that a declaration.
   */
} else {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), `groove-mirror-${entryId}-`));
  console.log(`  fetching ${entry.repo} @ ${entry.pin} → ${workdir}`);
  execFileSync("git", ["init", "--quiet", workdir], { stdio: "inherit" });
  execFileSync("git", ["-C", workdir, "remote", "add", "origin", `https://github.com/${entry.repo}.git`], { stdio: "inherit" });
  execFileSync("git", ["-C", workdir, "fetch", "--depth", "1", "--quiet", "origin", entry.pin], { stdio: "inherit" });
  execFileSync("git", ["-C", workdir, "checkout", "--quiet", "FETCH_HEAD"], { stdio: "inherit" });
}


// ⭐ Durations, measured rather than declared — the same instrument the manifest was built with.
let measured = 0;
let hashed = 0;
let longest = 0;
for (const file of entry.files ?? []) {
  /**
   * ⭐ **Every file is hashed, before the audio-only filter below.** The existing drum-kit entry carries a `sha256` for all 1659 of its files, including the `.sfz` — a duration says how long a sample is, but only a hash says
   * which sample it is, and the program file itself should be verifiable too. Putting this after the `continue` would have hashed audio only.
   */
  try {
    file.sha256 = createHash("sha256").update(fs.readFileSync(path.join(workdir, file.path))).digest("hex");
    hashed += 1;
  } catch {
    // A file that cannot be read is reported by its absence from the count, not by an invented hash.
  }

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
console.log(`  measured ${measured} file(s) · hashed ${hashed} · longest ${longest.toFixed(6)} s · manifest updated`);

// ⭐ The transfer itself is rclone's: it chunks, resumes and verifies, and this script does not reimplement any of that.
/**
 * ⭐ **Only the paths the manifest lists are copied.** Copying the working directory sent everything in it, including the `.git` objects `git fetch` had left behind — about 700 MB that the manifest did not describe, which broke the one
 * contract the manifest exists to keep: that what is declared is what is stored. Copying by list makes the two the same thing by construction rather than by remembering to exclude the right directories.
 */
const listFile = path.join(workdir, "..", `${entryId}.files`);
fs.writeFileSync(listFile, (entry.files ?? []).map((f) => f.path).join("\n") + "\n");
execFileSync("rclone", ["copy", workdir, `:s3:groove/${entry.prefix}/`, "--files-from", listFile, "--transfers", "8", "--checkers", "16", "--stats-one-line", ...r2Config()], { stdio: "inherit" });
fs.rmSync(listFile, { force: true });
console.log(`✅ copied to :s3:groove/${entry.prefix}/ — now run scripts/check_mirror_reachability.mjs`);
