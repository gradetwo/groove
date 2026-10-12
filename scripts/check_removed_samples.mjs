#!/usr/bin/env node
/**
 * Did the bytes actually leave the mirror? — the public-side reading that `remove_samples.mjs` cannot make for itself.
 *
 * **Why a second, independent check.** `remove_samples.mjs` reads the bucket back with the same credentials it
 * deleted with, so it can only prove that the API agrees with itself. A URL that the *application* would build is a
 * different question: it goes through the public custom domain, the CDN and its cache, and it is the only place the
 * answer "404" means what a user would experience. `check_mirror_reachability.mjs` was written for the mirroring
 * direction after exactly this distinction was learned — 1659 objects counted, and the files were still unreachable —
 * and this is the same check pointed at the other direction.
 *
 * **It takes the object paths as arguments rather than reading them from the manifest**, because the entries these
 * belong to are no longer in the manifest: a checker that looked them up there would have nothing to check on the
 * very run it exists for.
 *
 * **The expected status is an argument, so the same tool produces both readings of the change.** Run it with
 * `--expect=200` before the deletion for the control ("the key was there"), and with the default `404` after
 * ("the key is gone"). One tool, two readings, and the pair is the evidence — a lone 404 cannot distinguish
 * "deleted" from "never uploaded".
 *
 * Usage:
 *   node scripts/check_removed_samples.mjs <prefix>/<key> [...]                 # each must answer 404
 *   node scripts/check_removed_samples.mjs <prefix>/<key> [...] --expect=200    # the control, before deleting
 *   node scripts/check_removed_samples.mjs <prefix>/<key> [...] --root=https://…   # override VITE_SAMPLE_ROOT
 *
 * It is manual on purpose, like its sibling: a removal happens once, and re-running this on every change would be
 * testing the CDN rather than the removal.
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const expectArg = argv.find((argument) => argument.startsWith("--expect="));
const expect = expectArg ? Number(expectArg.slice("--expect=".length)) : 404;
const rootArg = argv.find((argument) => argument.startsWith("--root="));
const paths = argv.filter((argument) => !argument.startsWith("--"));

if (!Number.isInteger(expect) || expect < 100 || expect > 599) {
  console.error(`❌ --expect=${expectArg?.slice("--expect=".length)} is not an HTTP status`);
  process.exit(1);
}
if (paths.length === 0) {
  console.error("❌ no object paths given.\n   usage: node scripts/check_removed_samples.mjs <prefix>/<key> [...] [--expect=404]");
  process.exit(1);
}

const root =
  rootArg?.slice("--root=".length) ??
  (() => {
    try {
      const line = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith("VITE_SAMPLE_ROOT="));
      return line ? line.slice("VITE_SAMPLE_ROOT=".length).trim() : "";
    } catch {
      return "";
    }
  })();

if (!root) {
  console.error("no mirror root: pass --root=https://… or set VITE_SAMPLE_ROOT in .env.local");
  process.exit(2);
}
const base = root.replace(/\/$/, "");

/**
 * ⚠️ **A path that could climb out of the mirror root is refused.** `..`, a leading `/` and a scheme are the three
 * ways a relative object path stops being relative; this checker only ever reads, but a reader that escapes the root
 * would silently check someone else's host and report its answer as the mirror's.
 */
function assertSafePath(objectPath) {
  if (objectPath.startsWith("/")) return `"${objectPath}" starts with "/" — pass a path relative to the mirror root`;
  if (objectPath.includes("..")) return `"${objectPath}" contains ".." — refusing`;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(objectPath)) return `"${objectPath}" is a URL, not an object path`;
  if (objectPath.split("/").filter((segment) => segment !== "").length < 2) return `"${objectPath}" is not <prefix>/<key>`;
  return null;
}

let failures = 0;
for (const objectPath of paths) {
  const problem = assertSafePath(objectPath);
  if (problem) {
    console.error(`  ❌ ${problem}`);
    failures += 1;
    continue;
  }
  const url = `${base}/${objectPath}`;
  try {
    /**
     * **`HEAD`, and the status only.** The byte comparison `check_mirror_reachability.mjs` makes is about a file
     * being the *right* one; the question here is whether it is there at all, and a 404 has no length to compare.
     */
    const response = await fetch(url, { method: "HEAD" });
    const length = response.headers.get("content-length") ?? "—";
    const ok = response.status === expect;
    if (!ok) failures += 1;
    console.log(`  ${ok ? "✅" : "❌"} expected ${expect}, got ${response.status} · ${length} bytes · ${url}`);
  } catch (error) {
    failures += 1;
    console.log(`  ❌ expected ${expect}, the request failed · ${url} · ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  console.error(`❌ ${failures} of ${paths.length} path(s) did not answer ${expect}`);
  process.exit(1);
}
console.log(`✅ all ${paths.length} path(s) answered ${expect}`);
