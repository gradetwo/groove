#!/usr/bin/env node
/**
 * Remove a library from the R2 mirror — the missing other half of `upload_samples.mjs`.
 *
 * **Why this exists.** Uploading has been scripted since the first library; deleting never was. So the only way to
 * take a library back out of the mirror was to type an `rclone` command by hand, against credentials that live in
 * `.env.local` and an endpoint assembled from the account id — which is exactly the situation where a hand-run
 * command goes wrong, or worse, is never run at all and the bytes stay in the bucket while the manifest stops
 * declaring them. A manifest and a bucket that disagree are invisible: nothing lists the bucket in CI, so the
 * disagreement is only found by someone who happens to fetch a URL that no longer has an owner.
 *
 * **It computes first and deletes only when asked.** The default run lists the keys and the bytes it *would*
 * remove and touches nothing. `--apply` is what turns that into a deletion. This is the same rule
 * `upload_samples.mjs` states for its own destructive half, for the same reason: a tool that moves tens of
 * megabytes on the first invocation cannot be run to find out what it thinks.
 *
 * **⚠️ It cannot empty a bucket and it cannot take a wildcard.** These are deliberate refusals, not omissions:
 *
 *   - every argument must be a bare **library prefix** — one path segment, the library's own directory name, with
 *     no `/`, no `*`, `?`, `[`, `{` or `~`, and no `.`/`..` (see `assertSafePrefix`);
 *   - the remote path is always `:s3:groove/<prefix>/`, built from that validated segment, so `:s3:groove` on its
 *     own is not reachable from any argument;
 *   - a prefix the manifest **still ships** is refused, unless `--allow-shipped` says the two are being changed in
 *     the same breath. This is the guard that stops the four libraries the palette's own rows record
 *     (`freepats-drawbar-organ`, `freepats-percussive-organ`, `freepats-fsbs-dist2`,
 *     `freepats-button-accordion-hn`) from being deleted out from under the instruments that name them. Order
 *     matters and the script enforces it: the manifest edit lands first, the bytes go second.
 *
 * **Chunking, resume and verification are rclone's job**, exactly as in the uploader — including the credentials,
 * which are read the same way: `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` from the environment
 * or `.env.local`, handed to `rclone` as S3 flags rather than as a configured remote. Nothing here prints them.
 *
 * **The deletion is followed by its own reading.** After `--apply` the script re-reads each prefix and refuses to
 * report success unless the count and the bytes are both **0** — a deletion that silently did nothing (a typo in
 * the prefix, a permissions change) would otherwise look exactly like one that worked. The independent check is
 * still the one `check_mirror_reachability.mjs` makes from the public side: a `curl -sI` on a key that must now be
 * `404`.
 *
 * Usage:
 *   node scripts/remove_samples.mjs <library-prefix> [...]              # dry run: list what would be removed
 *   node scripts/remove_samples.mjs <library-prefix> [...] --apply      # remove it
 *   node scripts/remove_samples.mjs <library-prefix> [...] --allow-shipped   # even though the manifest lists it
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const MANIFEST = path.join(process.cwd(), "public", "samples", "manifest.json");
/**
 * The bucket and the one directory level a library lives in. **The remote is never assembled from anything but a
 * validated prefix**, which is what makes "empty the bucket" unrepresentable here rather than merely discouraged.
 */
const REMOTE_ROOT = ":s3:groove";
const MAX_PREFIX_LENGTH = 64;

const argv = process.argv.slice(2);
const doApply = argv.includes("--apply");
const allowShipped = argv.includes("--allow-shipped");
const prefixes = argv.filter((argument) => !argument.startsWith("--"));

/**
 * ⚠️ **A failure raised on purpose, whose message is already the whole sentence** — the same shape the uploader
 * uses, so the two scripts read alike at the point where a run refuses.
 */
class ScriptError extends Error {}
const fail = (rendered) => {
  throw new ScriptError(rendered);
};

const MB = 1024 ** 2;
const fmt = (bytes) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / MB).toFixed(1)} MB`);

/**
 * **A prefix is one directory name and nothing else.** The checks are written out rather than expressed as one
 * regex with a lookahead, because the failure this guards against is a reader (or a later editor) believing the
 * regex covers a case it does not. `*`, `?`, `[`, `]`, `{`, `}`, `~` are named explicitly: they are rclone's own
 * glob and home-expansion syntax, and a prefix that reached rclone with one of them in it would not be a prefix.
 */
function assertSafePrefix(prefix) {
  if (prefix === "") fail("❌ an empty prefix is not a library — refusing");
  if (prefix.length > MAX_PREFIX_LENGTH) fail(`❌ "${prefix}" is longer than ${MAX_PREFIX_LENGTH} characters — refusing`);
  if (prefix.includes("/")) fail(`❌ "${prefix}" contains "/" — pass the library's own directory name, not a path`);
  if (prefix === "." || prefix === "..") fail(`❌ "${prefix}" is a directory reference, not a library — refusing`);
  const forbidden = ["*", "?", "[", "]", "{", "}", "~", "\\", '"', "'", "\n", "\r", "\t", " ", "$"];
  const found = forbidden.filter((character) => prefix.includes(character));
  if (found.length > 0) fail(`❌ "${prefix}" contains ${found.map((c) => JSON.stringify(c)).join(", ")} — a prefix is a name, not a pattern — refusing`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(prefix)) fail(`❌ "${prefix}" is not a plain library directory name (letters, digits, dot, underscore, hyphen) — refusing`);
}

/**
 * ⭐ **Every refusal goes through one `try`, so a refusal reads as a sentence and never as a stack trace.** The first
 * version validated before the `try` and a bad argument printed a `file:///…:67` line with the reason buried under
 * it — which is the same fault the uploader's `ScriptError` was introduced to fix, one script later.
 */
function checkArguments() {
  if (prefixes.length === 0) {
    fail("❌ no library prefix given.\n   usage: node scripts/remove_samples.mjs <library-prefix> [...] [--apply]");
  }
  for (const prefix of prefixes) assertSafePrefix(prefix);
  if (new Set(prefixes).size !== prefixes.length) fail("❌ the same prefix was given twice — refusing");

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const shipped = new Map((manifest.entries ?? []).map((entry) => [entry.prefix ?? entry.id, entry.id]));
  /**
   * A prefix that still belongs to a shipped entry is the one case where deleting bytes first is plainly wrong: the
   * catalogue keeps listing the recording and every play becomes a 404. It is a refusal with a way through
   * (`--allow-shipped`), not a silent permission.
   */
  const stillShipped = prefixes.filter((prefix) => shipped.has(prefix));
  if (stillShipped.length > 0 && !allowShipped) {
    fail(
      `❌ ${stillShipped.map((p) => `"${p}" (${shipped.get(p)})`).join(", ")} ${stillShipped.length === 1 ? "is" : "are"} still in public/samples/manifest.json.\n` +
        "   Remove the entry from the manifest first, or pass --allow-shipped if the two are changing together.",
    );
  }
}

/**
 * ⭐ **The credentials are an S3 endpoint, not a configured remote** — copied from `upload_samples.mjs` on purpose.
 * Two scripts that authenticated differently would be two places to get the endpoint wrong.
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
  // ⚠️ Refused rather than defaulted: a deleter that guesses an endpoint is one that can delete from the wrong bucket.
  if (!account || !keyId || !secret) {
    fail("❌ R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not all present (checked the environment and .env.local)");
  }
  return ["--s3-provider", "Cloudflare", "--s3-access-key-id", keyId, "--s3-secret-access-key", secret, "--s3-endpoint", `https://${account}.r2.cloudflarestorage.com`];
}

let CREDENTIALS = [];
/** What the bucket holds under one library's own directory. `--json` so the numbers are read, not parsed out of prose. */
function sizeOf(prefix) {
  const remote = `${REMOTE_ROOT}/${prefix}/`;
  try {
    const out = execFileSync("rclone", ["size", remote, "--json", ...CREDENTIALS], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const parsed = JSON.parse(out);
    return { count: parsed.count ?? 0, bytes: parsed.bytes ?? 0 };
  } catch (error) {
    // ⚠️ Refusing rather than assuming zero: a count that fails to read as 0 looks exactly like a prefix that is already gone.
    fail(`❌ could not read ${remote} (${error instanceof Error ? error.message : error})`);
  }
}
/** The keys themselves, so the report names objects rather than only a total. */
function keysOf(prefix) {
  const remote = `${REMOTE_ROOT}/${prefix}/`;
  const out = execFileSync("rclone", ["lsf", remote, "--recursive", "--files-only", ...CREDENTIALS], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return out.split("\n").filter((line) => line !== "");
}

let failed = false;
try {
  checkArguments();
  CREDENTIALS = r2Config();
  console.log(`${doApply ? "REMOVING" : "DRY RUN"} · ${prefixes.length} prefix(es) from ${REMOTE_ROOT}/`);
  let totalCount = 0;
  let totalBytes = 0;
  const measured = [];
  for (const prefix of prefixes) {
    const { count, bytes } = sizeOf(prefix);
    const sample = count > 0 ? keysOf(prefix).slice(0, 3) : [];
    measured.push({ prefix, count, bytes });
    totalCount += count;
    totalBytes += bytes;
    console.log(`  ${prefix}/  →  ${count} key(s), ${bytes} bytes (${fmt(bytes)})`);
    for (const key of sample) console.log(`      · ${key}`);
    if (count > 3) console.log(`      · … and ${count - 3} more`);
  }
  console.log(`  total: ${totalCount} key(s), ${totalBytes} bytes (${fmt(totalBytes)})`);
  /**
   * ⚠️ **A prefix that reads zero keys is refused in `--apply` mode, not celebrated.** `rclone size` on a misspelt or
   * already-empty prefix answers `0` rather than failing, so without this the run would print "removed 0 keys" and
   * read as a success — the precise way a typo passes for a deletion.
   */
  const empty = measured.filter((entry) => entry.count === 0).map((entry) => entry.prefix);
  if (empty.length > 0) {
    const rendered = empty.map((prefix) => `"${prefix}"`).join(", ");
    if (doApply) fail(`❌ ${rendered} read 0 key(s) in the bucket — nothing to delete, so check the prefix before reading this as success`);
    console.log(`  ⚠️ ${rendered} read 0 key(s) — already empty, or the prefix is not what the bucket stores`);
  }

  if (!doApply) {
    console.log("  (dry run — nothing was deleted; pass --apply to delete exactly the keys above)");
    process.exitCode = 0;
  } else {
    for (const { prefix, count } of measured) {
      const remote = `${REMOTE_ROOT}/${prefix}/`;
      /**
       * ⭐ **`rclone delete` on the library's own directory, never `purge` on a parent and never a pattern.** The
       * path is the validated segment plus one slash, so the blast radius is that directory and nothing else.
       */
      console.log(`  deleting ${remote} (${count} key(s)) …`);
      execFileSync("rclone", ["delete", remote, "--rmdirs", "--stats-one-line", ...CREDENTIALS], { stdio: "inherit" });
      /**
       * ⭐ **The deletion is read back.** A run that reported success over a prefix it never matched is the failure
       * this whole script exists to prevent, and only the second reading can tell the two apart.
       */
      const after = sizeOf(prefix);
      if (after.count !== 0 || after.bytes !== 0) {
        fail(`  ❌ ${remote} still holds ${after.count} key(s) / ${after.bytes} bytes after the delete — not reporting success`);
      }
      console.log(`  ✅ ${remote} now reads 0 key(s), 0 bytes`);
    }
    console.log(`✅ removed ${totalCount} key(s), ${totalBytes} bytes (${fmt(totalBytes)}) across ${prefixes.length} prefix(es)`);
    console.log("   Now verify from the public side: curl -sI <root>/<prefix>/<key> must answer 404.");
  }
} catch (error) {
  failed = true;
  process.exitCode = 1;
  if (error instanceof ScriptError) console.error(error.message);
  else console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
}
if (failed) console.error("   nothing else was touched — the script deletes one directory per prefix and stops at the first refusal");
