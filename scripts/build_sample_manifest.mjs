/**
 * Filling in a manifest entry from a pinned repository — the step that was done by hand for the drum kit and therefore could not be repeated.
 *
 * `salamander-grand` has sat in the manifest with `files: 0` and no duration since it was declared, which is the honest state of a library nobody has enumerated. This enumerates one: it reads the pinned tree through
 * the GitHub API, records every file with its size, and writes the entry back.
 *
 * **What it deliberately does not do: hash files or measure durations.** Both need the bytes, and the bytes belong to the download step — a builder that fetched 700 MB to write a manifest would make the manifest
 * impossible to refresh cheaply. `sha256` and `durationSeconds` are therefore left as they were, and the manifest stays honest about them: an entry with files and no measured duration says "enumerated, not downloaded",
 * which is exactly true.
 *
 * Usage: node scripts/build_sample_manifest.mjs <entry-id> [--write]
 */
import fs from "node:fs";
import path from "node:path";

const MANIFEST = path.join(process.cwd(), "public", "samples", "manifest.json");
const argv = process.argv.slice(2);
const entryId = argv.find((a) => !a.startsWith("--"));
const write = argv.includes("--write");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const entry = (manifest.entries ?? []).find((candidate) => candidate.id === entryId);
if (!entry) {
  console.error(`❌ no entry "${entryId}" — the manifest holds: ${(manifest.entries ?? []).map((e) => e.id).join(", ")}`);
  process.exit(1);
}
if (!entry.repo || !entry.pin) {
  console.error(`❌ ${entryId} has no repo/pin, so there is nothing to enumerate`);
  process.exit(1);
}

/** One page of the GitHub tree API is capped; the drum kit's tree was small enough, and a library that is not is a problem to report rather than to loop around silently. */
const url = `https://api.github.com/repos/${entry.repo}/git/trees/${entry.pin}?recursive=1`;
const response = await fetch(url, { headers: { accept: "application/vnd.github+json", "user-agent": "groove-manifest-builder" } });
if (!response.ok) {
  console.error(`❌ ${url} → ${response.status} ${response.statusText}`);
  process.exit(1);
}
const tree = await response.json();
if (tree.truncated) {
  // Silence here would write a manifest that is missing files, which is worse than failing: the mirror would look complete and not be.
  console.error(`❌ the tree for ${entryId} is truncated by the API — this entry needs a paged enumeration before it can be trusted`);
  process.exit(1);
}

const blobs = (tree.tree ?? []).filter((node) => node.type === "blob");
const sfzFiles = blobs.filter((node) => node.path.endsWith(".sfz"));
const audio = blobs.filter((node) => /\.(wav|flac|aiff|aif|ogg|mp3)$/i.test(node.path));
const bytes = blobs.reduce((sum, node) => sum + (node.size ?? 0), 0);

console.log(`${entryId} @ ${entry.pin}`);
console.log(`  files ${blobs.length} · bytes ${bytes} (${(bytes / 1024 / 1024).toFixed(1)} MB) · .sfz ${sfzFiles.length} · audio ${audio.length}`);
console.log(`  declared sfz: ${entry.sfz ?? "✗ none"}`);

// ⭐ The file the application would open, named rather than assumed: an entry whose `sfz` is absent or not in the tree cannot be played.
const declaredPresent = entry.sfz ? blobs.some((node) => node.path === entry.sfz) : false;
if (entry.sfz && !declaredPresent) {
  const candidates = sfzFiles.slice(0, 5).map((node) => node.path);
  console.error(`  ⚠️ the declared sfz is not in the tree; candidates: ${candidates.join(", ") || "none"}`);
} else if (entry.sfz) {
  console.log(`  ✅ the declared sfz is present in the tree`);
} else if (sfzFiles.length === 0) {
  // ⭐ The finding that matters for VCSL and VSCO 2 CE: raw samples with no mappings cannot be played by an SFZ engine.
  console.error(`  ❌ no .sfz anywhere in the tree — this library cannot be played without mappings, whatever its size`);
}

if (!write) {
  console.log("\n(report only — pass --write to record the enumeration)");
  process.exit(0);
}

entry.files = blobs.map((node) => ({ path: node.path, bytes: node.size ?? 0 }));
entry.enumeratedAt = new Date().toISOString().slice(0, 10);
// durationSeconds and sha256 are left exactly as they were: they need bytes this step never fetches.
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✅ wrote ${entry.files.length} files into ${entryId} (duration and hashes still to be measured)`);
