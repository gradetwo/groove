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

/**
 * The programs a library actually offers, from the SFZ files it holds.
 *
 * A sample library splits its files by articulation — VCSL's four families are 155 SFZ files across 88 instruments, a harmonica alone having six variants — so the file list is not the instrument list. The rule is to group by directory
 * and base name (dropping the ` - <articulation>` suffix) and keep one program per group, preferring `- Keyswitch`, because those files are designed to switch articulation by key range and so cover the others. Listing every variant would
 * turn an instrument list into an articulation list; listing none would leave the library unplayable.
 */
export function programsFrom(sfzPaths) {
  const groups = new Map();
  for (const path of sfzPaths) {
    const base = path.replace(/\.sfz$/i, "").replace(/\s+-\s+.*$/, "");
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(path);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([base, variants]) => ({
      sfz: variants.find((variant) => / - Keyswitch\.sfz$/i.test(variant)) ?? [...variants].sort()[0],
      name: base.split("/").pop(),
    }));
}

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

/**
 * ⭐ **Repository metadata is not part of the instrument.** The reachability check found `.gitattributes` sitting in `salamander-grand`'s file list as its "smallest sample" — harmless at 252 bytes, but the manifest was describing
 * files that are not the library, which is why its count was 668 rather than the 665 that are actually samples and mappings. Excluding paths that begin with `.` removes exactly those, and keeps `README` and `LICENSE`, which are
 * small, are documentation, and in the case of a licence are part of what the attribution requirement refers to.
 */
const isInstrumentFile = (path) => !path.split("/").some((segment) => segment.startsWith("."));

/**
 * ⭐ **A library may be a part of a repository.** VCSL is 5.74 GB, of which `Chordophones` is 3.38 GB — the block that duplicates the orchestral strings VSCO would have provided. The rule that chose the four remaining families is recorded
 * in the plan; what it needs here is a way to say "these prefixes and no others", so the manifest entry can describe part of a tree rather than all of it. Absent `paths`, every file is included, which is what the other entries want.
 */
const wanted = (entry.paths ?? []).filter((prefix) => typeof prefix === "string" && prefix !== "");
const included = (path) => wanted.length === 0 || wanted.some((prefix) => path === prefix || path.startsWith(`${prefix.replace(/\/$/, "")}/`));
const blobs = (tree.tree ?? []).filter((node) => node.type === "blob" && isInstrumentFile(node.path) && included(node.path));
const sfzFiles = blobs.filter((node) => node.path.endsWith(".sfz"));
const audio = blobs.filter((node) => /\.(wav|flac|aiff|aif|ogg|mp3)$/i.test(node.path));
const bytes = blobs.reduce((sum, node) => sum + (node.size ?? 0), 0);

console.log(`${entryId} @ ${entry.pin}`);
console.log(`  files ${blobs.length} · bytes ${bytes} (${(bytes / 1024 / 1024).toFixed(1)} MB) · .sfz ${sfzFiles.length} · audio ${audio.length}`);
console.log(`  declared sfz: ${entry.sfz ?? "✗ none"}`);

// ⭐ The file the application would open, named rather than assumed: an entry whose `sfz` is absent or not in the tree cannot be played.
const declaredPresent = entry.sfz ? blobs.some((node) => node.path === entry.sfz) : false;
if (wanted.length > 0) console.log(`  limited to: ${wanted.join(", ")}`);
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
/**
 * The declared programs, when the library holds more than one. A single-program library keeps `sfz`, which says the same thing without a list; a multi-program one also keeps `sfz` as its first program, so a reader that knows only
 * that field still points at something real.
 */
const programs = programsFrom(sfzFiles.map((node) => node.path));
if (programs.length > 1) {
  entry.instruments = programs;
  entry.sfz = programs[0].sfz;
  console.log(`  instruments ${programs.length} (from ${sfzFiles.length} sfz)`);
} else {
  entry.instruments = undefined;
  if (programs.length === 1) entry.sfz = programs[0].sfz;
}
entry.enumeratedAt = new Date().toISOString().slice(0, 10);
// durationSeconds and sha256 are left exactly as they were: they need bytes this step never fetches.
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✅ wrote ${entry.files.length} files into ${entryId} (duration and hashes still to be measured)`);
