/**
 * **Which SFZ opcodes a mirrored library actually uses, and which of them this loader implements** — the compatibility measurement a new library needs before its bytes are declared.
 *
 * Why it exists: a library can be parsed, uploaded and playable while silently losing the parts of the file this loader does not model. FreePats' button accordion is the case that named it —
 * its amplitude envelope and its attack offsets are outside the supported subset, so it *sounds*, with the app's own envelope and without the file's attack. That is a quality cost, not a
 * blocker, and the honest place to record it is the manifest's `needs` array. This script is how `needs` is derived instead of remembered.
 *
 * It uses the project's own `expandIncludes` and `parseSfz` rather than a second regex reader — the same rule the rest of this workstream applies, because a second reader is a second answer.
 *
 * Usage (the files are read from a checkout, not from the network):
 *
 *   npx vite-node scripts/scan_sample_opcodes.mjs --root /var/tmp/groove-mirror-freepats-button-accordion-hn-XXXX
 *   npx vite-node scripts/scan_sample_opcodes.mjs --root <dir> freepats-button-accordion-hn discord-gm-sitar
 *
 * With no entry ids it scans every entry in the shipped manifest. `--programs` lists the programs it read.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseManifest } from "../src/data/sampleManifest";
import { expandIncludes } from "../src/audio/sfz/includes";
import { parseSfz } from "../src/audio/sfz/parse";

/**
 * What this loader **implements** — reads the opcode and gives it an effect. Everything else is kept in `region.opcodes` and has none, which is the honest meaning of "supported subset".
 *
 * Kept as a literal list with the reader named beside it, because that is the fact being checked: a name here with no reader is a claim, and the comment is what makes it reviewable.
 */
const MODELLED = new Map([
  ["sample", "parse.ts → SfzRegion.sample; sampleLoader resolves the address"],
  ["key", "parse.ts → lokey/hikey"],
  ["lokey", "parse.ts"],
  ["hikey", "parse.ts"],
  ["lovel", "parse.ts → regionsForNote filters on velocity"],
  ["hivel", "parse.ts → regionsForNote filters on velocity"],
  ["pitch_keycenter", "parse.ts → instrument.ts playback ratio"],
  ["tune", "parse.ts → tuneCents; instrument.ts ratio"],
  ["tune_ccN", "parse.ts → ccTuneCents"],
  ["tune_curveccN", "parse.ts → ccTuneCents"],
  ["default_path", "parse.ts → SfzRegion.defaultPath; defaultPath.ts joins it"],
  ["set_ccN", "parse.ts → readControlDefaults"],
  ["set_hdccN", "parse.ts → readControlDefaults (normalised)"],
  ["loccN", "ccGate.ts"],
  ["hiccN", "ccGate.ts"],
  ["group", "instrument.ts → choke group"],
  ["off_by", "instrument.ts → choke group"],
  ["loop_mode", "instrument.ts loopModeOf → samplerVoice"],
  ["loop_start", "instrument.ts → samplerVoice loopStart"],
  ["loop_end", "instrument.ts → samplerVoice loopEnd"],
  ["seq_length", "parse.ts → roundRobinPick"],
  ["seq_position", "parse.ts → roundRobinPick"],
  ["note_polyphony", "instrument.ts → polyphony cap"],
  ["amplitude_onccN", "instrument.ts → gain scale"],
  ["#define/$VAR", "defines.ts, applied before parsing"],
]);

const argv = process.argv.slice(2);
const rootIndex = argv.indexOf("--root");
const root = rootIndex === -1 ? process.cwd() : argv[rootIndex + 1];
const wanted = argv.filter((arg, index) => !arg.startsWith("--") && index !== rootIndex + 1);
const listPrograms = argv.includes("--programs");

if (!root || !existsSync(root)) {
  console.error(`❌ --root ${root ?? "(missing)"} does not exist — point it at the directory a mirror run checked out`);
  process.exit(1);
}

const MANIFEST = path.join(process.cwd(), "public", "samples", "manifest.json");
const parsed = parseManifest(readFileSync(MANIFEST, "utf8"));
if (!parsed.ok || !parsed.manifest) {
  console.error(`❌ the shipped manifest does not parse: ${parsed.errors.join("; ")}`);
  process.exit(1);
}

const entries = parsed.manifest.entries.filter((entry) => wanted.length === 0 || wanted.includes(entry.id));
if (entries.length === 0) {
  console.error(`❌ no entry matched ${JSON.stringify(wanted)} — the manifest holds ${parsed.manifest.entries.map((entry) => entry.id).join(", ")}`);
  process.exit(1);
}

/** Read one file from the checkout, by the path the include resolver reports (root-relative, `/` separators). */
const readLocal = (relative) => {
  const full = path.join(root, relative);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
};

for (const entry of entries) {
  const programs = entry.instruments?.length ? entry.instruments : entry.sfz ? [{ sfz: entry.sfz, name: entry.name }] : [];
  if (programs.length === 0) continue;
  /** One opcode → how many regions carry it, summed over every program of the entry. */
  const counts = new Map();
  let regions = 0;
  const problems = [];
  let read = 0;

  for (const program of programs) {
    const text = readLocal(program.sfz);
    if (text === undefined) continue;
    read += 1;
    const expanded = expandIncludes(text, readLocal, { path: program.sfz });
    problems.push(...expanded.problems.map((problem) => `${program.sfz}: ${problem}`));
    const parsedRegions = parseSfz(expanded.text);
    regions += parsedRegions.length;
    for (const region of parsedRegions) {
      for (const opcode of Object.keys(region.opcodes)) counts.set(opcode, (counts.get(opcode) ?? 0) + 1);
      for (const opcode of Object.keys(region.opcodes)) {
        // `amplitude_onccN`/`loccN`/`hiccN`/`tune_ccN` are numbered families: the modelled name is the family, the file writes an index.
        const family = opcode.replace(/(\d+)$/, "N");
        if (!MODELLED.has(opcode) && MODELLED.has(family)) counts.set(family, (counts.get(family) ?? 0) + 1);
      }
    }
  }

  if (read === 0) {
    console.log(`\n### ${entry.id} — no program file found under ${root}; nothing scanned`);
    continue;
  }
  const list = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const implemented = list.filter(([opcode]) => MODELLED.has(opcode) || MODELLED.has(opcode.replace(/(\d+)$/, "N")));
  const missing = list.filter(([opcode]) => !MODELLED.has(opcode) && !MODELLED.has(opcode.replace(/(\d+)$/, "N")));

  console.log(`\n### ${entry.id} — ${read}/${programs.length} program(s) read · ${regions} region(s)`);
  if (listPrograms) for (const program of programs) console.log(`    program: ${program.sfz}`);
  console.log(`  implemented (${implemented.length}): ${implemented.map(([opcode, count]) => `${opcode}×${count}`).join(", ") || "none"}`);
  console.log(`  NOT implemented (${missing.length}): ${missing.map(([opcode, count]) => `${opcode}×${count}`).join(", ") || "none"}`);
  // The manifest is the place the degradation is recorded, so the scan says whether the entry already agrees with itself.
  const declared = new Set(entry.needs ?? []);
  const undeclared = missing.map(([opcode]) => opcode).filter((opcode) => !declared.has(opcode) && ![...declared].some((need) => need.replace(/(\d+)$/, "N") === opcode));
  if (undeclared.length > 0) console.log(`  ⚠️ used but not in the entry's needs: ${undeclared.join(", ")}`);
  if (problems.length > 0) for (const problem of problems.slice(0, 8)) console.log(`  ⚠️ ${problem}`);
}
