#!/usr/bin/env node
/**
 * Declare an entry's programs from the file list it already carries.
 *
 * The rule for choosing programs lives in `lib/programs.mjs`, and an entry that has been mirrored already lists every file. So re-declaring its instruments needs no download — which matters, because the alternative is fetching
 * hundreds of megabytes to rewrite one field. `meatbass` holds 39 SFZ files and its entry named one of them; its bytes are already in the bucket, so this is a manifest-only change.
 *
 * The entry's `sfz` stays the first program, so a reader that knows only that field still points at something real, and an entry whose file list holds no SFZ at all (the drum kit's lists only samples) is left alone rather than emptied.
 *
 * Usage: node scripts/declare_programs.mjs <entry-id> [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { programsFrom } from "./lib/programs.mjs";

const MANIFEST = path.join(process.cwd(), "public", "samples", "manifest.json");
const argv = process.argv.slice(2);
const entryId = argv.find((argument) => !argument.startsWith("--"));
const write = argv.includes("--write");

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const entry = (manifest.entries ?? []).find((candidate) => candidate.id === entryId);
if (!entry) {
  console.error(`❌ no entry "${entryId}" — the manifest holds: ${(manifest.entries ?? []).map((e) => e.id).join(", ")}`);
  process.exit(1);
}

const sfzPaths = (entry.files ?? []).map((file) => file.path).filter((p) => p.endsWith(".sfz"));
const programs = programsFrom(sfzPaths);
console.log(`${entryId}: ${(entry.files ?? []).length} file(s) · ${sfzPaths.length} sfz · ${programs.length} instrument(s)`);
for (const program of programs.slice(0, 4)) console.log(`  ${program.name} → ${program.sfz}`);
if (programs.length > 4) console.log(`  … and ${programs.length - 4} more`);

if (sfzPaths.length === 0) {
  console.log("  (its file list holds no .sfz, so nothing to declare)");
  process.exit(0);
}

if (!write) {
  console.log("(report only — pass --write to record the programs)");
  process.exit(0);
}

entry.instruments = programs.length > 1 ? programs : undefined;
entry.sfz = programs[0].sfz;
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`✅ declared ${programs.length} instrument(s) for ${entryId}`);
