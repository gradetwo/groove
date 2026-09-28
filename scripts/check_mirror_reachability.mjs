/**
 * Does the address **the manifest builds** actually fetch? — the one check that would have caught a whole-prefix mistake.
 *
 * The upload was verified by counting: 1659 objects, 442411669 bytes, matching the manifest's own total to the byte. **And the files were still unreachable**, because the objects had been placed
 * at the bucket root while the manifest declares a `prefix` and the code joins `root/prefix/path`. The owner found it with one `curl` at the address the manifest implies; no amount of counting
 * could have.
 *
 * So this checks the property rather than the inventory, and it derives the path **the same way the application does** — `root` + `prefix` + the file's own path — because a check that built its
 * own URL would have agreed with the mistake instead of exposing it.
 *
 * **It looks at exactly two objects, one of them the smallest in the manifest** (the owner's rule: an access check costs one small file, not a library), and it compares the returned
 * `content-length` with the manifest's own `bytes`, which is what turns "something answered" into "the right thing answered".
 *
 * Manual on purpose: a mirror is uploaded once and verified once. Re-running this on every change would be testing the CDN, not the change.
 */
import { readFileSync } from "node:fs";

const root =
  process.argv.find((arg) => arg.startsWith("--root="))?.slice("--root=".length) ??
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

const manifest = JSON.parse(readFileSync("public/samples/manifest.json", "utf8"));
const entry = manifest.entries.find((candidate) => candidate.sfz && !candidate.excludedReason);
if (!entry) {
  console.error("no shippable entry with an sfz in the manifest");
  process.exit(2);
}

const base = root.replace(/\/$/, "");
const prefix = entry.prefix ? `${entry.prefix.replace(/\/$/, "")}/` : "";
const smallest = [...entry.files].sort((a, b) => (a.bytes ?? 0) - (b.bytes ?? 0))[0];

/** The two addresses worth one request each: the program the instrument is defined by, and the smallest sample it needs. */
const checks = [
  { label: "sfz", path: `${prefix}${entry.sfz}`, bytes: entry.files.find((file) => file.path === entry.sfz)?.bytes },
  { label: "smallest sample", path: `${prefix}${smallest.path}`, bytes: smallest.bytes },
];

let failures = 0;
for (const check of checks) {
  const url = `${base}/${check.path}`;
  try {
    const response = await fetch(url, { method: "HEAD" });
    const length = Number(response.headers.get("content-length") ?? NaN);
    const sizeOk = check.bytes === undefined || length === check.bytes;
    if (response.ok && sizeOk) {
      console.log(`  ✅ ${check.label.padEnd(16)} ${response.status} · ${length} bytes · ${check.path}`);
    } else {
      failures += 1;
      console.log(`  ❌ ${check.label.padEnd(16)} ${response.status} · got ${length} bytes, manifest says ${check.bytes} · ${check.path}`);
    }
  } catch (error) {
    failures += 1;
    console.log(`  ❌ ${check.label.padEnd(16)} ${error instanceof Error ? error.message : String(error)} · ${url}`);
  }
}

console.log(failures === 0 ? `\n✅ the mirror serves what the manifest describes (${base}/${prefix})` : `\n❌ ${failures} of ${checks.length} checks failed`);
process.exit(failures === 0 ? 0 : 1);
