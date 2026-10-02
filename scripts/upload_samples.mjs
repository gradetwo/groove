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
 * **⭐ The scratch directory is chosen, not inherited from `os.tmpdir()`.** This script mirrors whole libraries — the
 * drum-kit tree is **2.6 GB** — and `os.tmpdir()` is `/tmp`, which on this machine is a **7.8 GB tmpfs**. Filling it
 * did not just fail the run: `ENOSPC` on the RAM disk stopped every process, and four workflows hung together
 * (2026-10-03). So the root is now resolved by `scripts/lib/scratch.mjs`: `--scratch <path>` beats `$TMPDIR` beats
 * the on-disk default `/var/tmp`, a RAM-backed root prints a loud warning, and the directory is removed in a
 * `finally` whether the run succeeded or failed. The industry basis — GNU `sort`'s `-T`/`TMPDIR` precedence, SQLite
 * searching `/var/tmp` before `/tmp`, the FHS on `/tmp` being cleared at boot, Docker's tmpfs-is-memory warning,
 * Python's `TemporaryDirectory(delete=…)` — is surveyed in `docs/research/large-temporary-files-in-mature-tools.md`.
 *
 * Usage:
 *   node scripts/upload_samples.mjs <entry-id>              # report only
 *   node scripts/upload_samples.mjs <entry-id> --dry-run    # also resolve/create/remove the scratch root
 *   node scripts/upload_samples.mjs <entry-id> --measure    # clone, measure, no credentials needed
 *   node scripts/upload_samples.mjs <entry-id> --upload     # clone, measure, write the manifest, copy
 *
 * Scratch options (all three commands above):
 *   --scratch <path>     write the mirror here (overrides $TMPDIR)
 *   TMPDIR=<path>        the environment override, as for `sort` and `mkstemp`
 *   --keep-scratch       do not delete the scratch directory; print where it is instead
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { programsFrom } from "./lib/programs.mjs";
import {
  describeScratch,
  flagValue,
  formatBytes,
  freeSpaceWarning,
  makeScratchDir,
  ramBackedWarning,
  removeScratchDir,
  scratchRootFrom,
} from "./lib/scratch.mjs";

const MANIFEST = path.join(process.cwd(), "public", "samples", "manifest.json");
const argv = process.argv.slice(2);
/**
 * ⭐ **The entry id is "the first argument that is not a flag" — minus the flag values.** `--scratch /var/tmp` would
 * otherwise make `/var/tmp` the entry id, because a path does not start with `--`.
 */
const scratchExplicit = flagValue(argv, "scratch");
const entryId = argv.find((a) => !a.startsWith("--") && a !== scratchExplicit);
const doUpload = argv.includes("--upload");
/**
 * ⭐ **`--measure` separates the half that needs no credentials from the half that does.**
 *
 * The two were welded together: the script reads the bucket's size for the budget check *before* it looks at `--upload`, so without `R2_ACCOUNT_ID` and friends it refused to do anything at all — and the measurement lives further down the same path. Downloading, hashing and `ffprobe` need no right to write to a bucket; they need a network and a disk.
 *
 * **A correction, because the first version of this comment claimed too much.** It said the manifest carried no duration for any library. Four of the five do: `salamander-grand`, `karoryfer-meatbass`, `karoryfer-emilyguitar` and `vcsl` were measured and marked `mirroredAt: 2026-09-29`, with per-file durations on most of their files. What is missing is `virtuosity-drums-basic`: an entry-level duration with **none** of its 2078 files measured and no `mirroredAt`, which is the state of an entry that was never taken through this script.
 *
 * So this mode is not the difference between "no numbers" and "numbers" — it is the difference between "numbers only for whoever holds bucket credentials" and "numbers for anyone with a network", which is what the drum entry needs and what the next library will need too. The upload stays a separate and credentialed act.
 */
const doMeasure = argv.includes("--measure");
/**
 * ⭐ **`--dry-run` is the "find out what it thinks" mode for the scratch root itself.** It resolves, creates and
 * reports the directory — the part this script got wrong for a whole day — and removes it again, without a network
 * fetch, a hash, a manifest write or a copy. It is what the cleanup criterion is measured with.
 */
const doDryRun = argv.includes("--dry-run");
const keepScratch = argv.includes("--keep-scratch") || process.env.GROOVE_KEEP_SCRATCH === "1";
const scratch = scratchRootFrom({ argv, env: process.env });

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const fmt = (b) => (b >= GB ? `${(b / GB).toFixed(2)} GB` : `${(b / MB).toFixed(1)} MB`);

/**
 * ⚠️ **A failure raised on purpose, whose message is already the whole sentence.** `process.exit(1)` inside the
 * `try` below would skip the `finally` that removes the scratch directory — and the whole point of the fix is that
 * a failed run leaves no GB-scale tree behind. So the mid-run refusals throw this instead, and the `catch` prints it
 * once.
 */
class ScriptError extends Error {}
const fail = (rendered) => {
  throw new ScriptError(rendered);
};

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
/**
 * The bucket is read **only when it is about to be used**. Measuring has no opinion about the bucket — it fetches, hashes, times and stops — and a ceiling that cannot be read is not a reason to refuse to measure. A dry run has
 * no opinion about it either: it never copies.
 */
const stored = (doMeasure && !doUpload) || doDryRun ? 0 : storedBytes();
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

if (!doUpload && !doMeasure && !doDryRun) {
  console.log(`  ${(entry.files ?? []).length} files, ${entry.sfz ?? "no sfz declared"}`);
  console.log("  (report only — pass --measure to clone and measure without credentials, --upload to also copy)");
  console.log(`  (scratch would be ${scratch.root} — ${scratch.detail}; pass --dry-run to create and remove it now)`);
  process.exit(0);
}

/**
 * ⭐ **Everything that writes goes through one `try`, and the scratch directory is removed in the `finally`.**
 *
 * The old shape created a `mkdtempSync` directory and then called `process.exit(…)` or let `execFileSync` throw at
 * half a dozen points; every one of those left the tree behind. The drum-kit mirror is 2.6 GB, so one interrupted
 * run is enough to fill the tmpfs it used to live on. Now the only exits past the guards are the ones this block
 * reaches on its way out of the `finally`.
 */
let workdir = null;
let failed = false;
try {
  workdir = makeScratchDir(scratch.root, `groove-mirror-${entryId}-`);
  const facts = describeScratch(scratch.root);
  console.log(`  scratch  : ${workdir}`);
  console.log(`             ${scratch.detail} → ${facts.mountPoint} (${facts.fsType ?? "unknown fs"}) · ${formatBytes(facts.freeBytes)} free`);
  // ⚠️ The sentinel and the space check are warnings, not refusals: the caller may know something the estimate does not.
  const onRam = ramBackedWarning(facts);
  if (onRam) console.error(onRam);
  const noRoom = freeSpaceWarning(facts, planned);
  if (noRoom) console.error(noRoom);

  if (doDryRun) {
    console.log("  --dry-run: the scratch root was resolved and created; nothing was fetched, measured, written or copied");
  } else {
    /**
     * ⭐ **Two shapes of source.** A git entry names a commit; a release entry names an asset. Both end in a directory of bytes, so everything after this point is the same — which is the reason to normalise here rather than branch
     * again later.
     */
    if (entry.archive) {
      const zipPath = path.join(workdir, entry.archive.asset);
      console.log(`  downloading ${entry.archive.asset} (${fmt(entry.archive.bytes)})`);
      execFileSync("curl", ["-fsSL", "-o", zipPath, entry.archive.url], { stdio: "inherit" });
      // ⭐ The declared size is checked before unpacking: a release asset has none of git's immutability, so the byte count is the one thing that can be verified cheaply, and a mismatch means the asset changed.
      const actual = fs.statSync(zipPath).size;
      if (actual !== entry.archive.bytes) {
        fail(`  ❌ ${entry.archive.asset} is ${actual} bytes, the manifest says ${entry.archive.bytes} — refusing to unpack`);
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
      /**
       * The programs the archive holds, by the same rule the manifest builder uses. A library with several programs used to be reduced to one — whichever file sat nearest the root — so an archive with 39 programs offered a single instrument.
       */
      const programs = programsFrom(sfzFiles.map((file) => file.path));
      entry.instruments = programs.length > 1 ? programs : undefined;
      // ⭐ The entry point is chosen, not guessed: a file at the top level if there is one, otherwise the shortest path, because a library's root program is nearer the root than its includes.
      const pick = sfzFiles.find((f) => !f.path.includes("/")) ?? [...sfzFiles].sort((a, b) => a.path.length - b.path.length)[0];
      entry.sfz = programs[0]?.sfz ?? (pick ? pick.path : "");
      console.log(`  unpacked ${found.length} file(s) · ${sfzFiles.length} sfz · ${programs.length} instrument(s) · entry: ${entry.sfz || "✗ none found"}`);
      if (!entry.sfz) {
        // ⚠️ An archive with no SFZ cannot be played, whatever else it contains — the same judgement the manifest builder makes for a tree.
        fail("  ❌ no .sfz anywhere in the archive — this library cannot be played without mappings");
      }
      /**
       * ⚠️ `needs` is **not** written here. It is the list of opcodes the library actually uses, which means parsing its SFZ with the project's own parser — and that is TypeScript, while this is a script. Leaving it for a step that can
       * import the parser is better than deriving it with a regex here and calling that a declaration.
       */
    } else {
      console.log(`  fetching ${entry.repo} @ ${entry.pin} → ${workdir}`);
      execFileSync("git", ["init", "--quiet", workdir], { stdio: "inherit" });
      execFileSync("git", ["-C", workdir, "remote", "add", "origin", `https://github.com/${entry.repo}.git`], { stdio: "inherit" });
      /**
       * **Fetch only the files this entry will use, when the entry says which.** VCSL is 5.74 GB of tree and the four families this project mirrors are 2.41 GB of it, so a plain shallow fetch downloads more than twice what gets uploaded. A partial
       * clone with a sparse checkout asks for the listed paths and nothing else.
       *
       * It is a fallback rather than the only path because it depends on the server supporting filters: if the filtered fetch or the checkout fails, the plain shallow fetch runs and the result is the same tree, only fetched in full. The cost
       * of being wrong is bandwidth, and the cost of not trying is bandwidth every time.
       */
      const sparse = (entry.paths ?? []).filter((prefix) => typeof prefix === "string" && prefix !== "");
      let narrowed = false;
      if (sparse.length > 0) {
        try {
          execFileSync("git", ["-C", workdir, "sparse-checkout", "set", "--no-cone", ...sparse], { stdio: "inherit" });
          /**
           * ⭐ **Fetch by a ref and check out the pin, which is not the same thing as fetching the pin.**
           *
           * `git fetch origin <sha>` used to work and does not any more: GitHub answers `couldn't find remote ref 9f04cf9a7345`, so the narrowed path threw, the fallback ran, and the "fetch only what is listed" promise quietly became a **2.6 GB** tree for the drum kit — the exact cost this branch exists to avoid. And `--depth 1` cannot be combined with checking out an older commit either: a shallow tip does not contain it.
           *
           * So: a **blobless** fetch of the remote's default branch (history without file contents, which is small), then a checkout of the pinned commit, whose blobs are fetched lazily and only for the sparse paths. The `--depth 1` is gone because it is what made the checkout impossible; what keeps this cheap is the filter, not the depth.
           */
          execFileSync("git", ["-C", workdir, "fetch", "--filter=blob:none", "--quiet", "origin"], { stdio: "inherit" });
          execFileSync("git", ["-C", workdir, "checkout", "--quiet", entry.pin], { stdio: "inherit" });
          narrowed = true;
          console.log(`  fetched only: ${sparse.join(", ")}`);
        } catch {
          console.log("  (the narrowed fetch did not work here; falling back to the whole tree)");
          execFileSync("git", ["-C", workdir, "sparse-checkout", "disable"], { stdio: "inherit" });
        }
      }
      if (!narrowed) {
        execFileSync("git", ["-C", workdir, "fetch", "--filter=blob:none", "--quiet", "origin"], { stdio: "inherit" });
        execFileSync("git", ["-C", workdir, "checkout", "--quiet", entry.pin], { stdio: "inherit" });
      }
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
    if (!doUpload) {
      console.log("  (measured only — nothing was copied; pass --upload, with credentials, to copy the bytes)");
    } else {
      // ⭐ The transfer itself is rclone's: it chunks, resumes and verifies, and this script does not reimplement any of that.
      /**
       * ⭐ **Only the paths the manifest lists are copied.** Copying the working directory sent everything in it, including the `.git` objects `git fetch` had left behind — about 700 MB that the manifest did not describe, which broke the one
       * contract the manifest exists to keep: that what is declared is what is stored. Copying by list makes the two the same thing by construction rather than by remembering to exclude the right directories.
       *
       * ⭐ **The list file lives inside the scratch directory now**, not beside it in `os.tmpdir()`. Beside it, it was the
       * one artefact the old cleanup never removed — a small leak, but a leak in the directory the fix is about.
       */
      const listFile = path.join(workdir, ".upload-files.txt");
      fs.writeFileSync(listFile, (entry.files ?? []).map((f) => f.path).join("\n") + "\n");
      execFileSync("rclone", ["copy", workdir, `:s3:groove/${entry.prefix}/`, "--files-from", listFile, "--transfers", "8", "--checkers", "16", "--stats-one-line", ...r2Config()], { stdio: "inherit" });
      fs.rmSync(listFile, { force: true });
      console.log(`✅ copied to :s3:groove/${entry.prefix}/ — now run scripts/check_mirror_reachability.mjs`);
    }
  }
} catch (error) {
  failed = true;
  process.exitCode = 1;
  if (error instanceof ScriptError) console.error(error.message);
  else console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  if (workdir !== null) {
    // ⚠️ Say where the scene was, even though it is about to be cleaned: a killed process or a `--keep-scratch` run
    // leaves it, and "there is a 2.6 GB tree somewhere" is the sentence that has to be printed at failure time.
    console.error(`   the scratch directory at the moment of failure was ${workdir}`);
    console.error("   that tree can be GB-scale — remember to delete it if it is kept");
  }
} finally {
  if (workdir !== null) {
    if (keepScratch) {
      console.error(`⚠️  --keep-scratch: left ${workdir} in place — it can be GB-scale, delete it by hand when done`);
    } else {
      const removal = removeScratchDir(workdir);
      if (!removal.ok) {
        console.error(`⚠️  could not remove the scratch directory: ${removal.error}`);
        console.error(`   it is still at ${workdir} — this can be GB-scale, delete it by hand: rm -rf ${workdir}`);
      } else if (!failed) {
        console.log(`  scratch removed: ${workdir}`);
      }
    }
  }
}
