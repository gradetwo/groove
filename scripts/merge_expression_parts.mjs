#!/usr/bin/env node
/**
 * Merge the per-genre expression parts into the shipped table.
 *
 * The content was authored per category (in parallel) as JSON parts; this validates every entry
 * against the same constraints the unit suite enforces and then writes a **generated** block into
 * `src/data/genreExpression.ts`, keeping the hand-authored table separate so provenance stays
 * visible:
 *
 *     GENRE_EXPRESSION_AUTHORED   — the entries written by hand, with their reasons
 *     GENRE_EXPRESSION_GENERATED  — this file's output
 *     GENRE_EXPRESSION            — generated wins on conflict, so the reviewed content ships
 *
 * Validation is the point: an id that does not exist, a missing reason, a length the engine cannot
 * express or an arpeggio without a rate must fail here rather than reach the audio.
 *
 *   node scripts/merge_expression_parts.mjs --parts=/tmp/expr-parts [--check]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const PARTS = path.resolve(argValue("--parts", "/tmp/expr-parts"));
const CHECK_ONLY = argv.includes("--check");

const QUALITIES = new Set(["triad", "seventh", "power", "sus", "quartal", "extended"]);
const STYLES = new Set(["block", "strum", "arpeggio", "broken", "stab", "sustain", "ballad"]);
const ROLE_STYLES = new Set(["legato", "staccato", "sustain", "ghost", "ratchet", "authored"]);
const ROLES = new Set(["kick", "snare", "hihat", "percussion", "bass", "chords", "lead", "fx"]);
const BARS = new Set([1, 2, 3, 4, 8]);
const OCTAVES = new Set([-2, -1, 0, 1, 2]);

const indexSource = fs.readFileSync(path.join(ROOT, "src/data/index/genresIndex.ts"), "utf8");
const knownIds = new Set([...indexSource.matchAll(/"id": "([a-z0-9-]+)"/g)].map((m) => m[1]));
const progressionSource = fs.readFileSync(path.join(ROOT, "src/data/popularProgressions.ts"), "utf8");
const knownProgressions = new Set([...progressionSource.matchAll(/id: "([a-z0-9-]+)"/g)].map((m) => m[1]));

const problems = [];
const merged = {};
const partFiles = fs
  .readdirSync(PARTS)
  .filter((f) => f.endsWith(".json"))
  .sort();

for (const file of partFiles) {
  const full = path.join(PARTS, file);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (error) {
    problems.push(`${file}: not valid JSON (${error.message})`);
    continue;
  }
  for (const [id, entry] of Object.entries(parsed)) {
    const where = `${file}:${id}`;
    if (!knownIds.has(id)) problems.push(`${where}: unknown genre id`);
    if (!entry || typeof entry !== "object") {
      problems.push(`${where}: entry is not an object`);
      continue;
    }
    if (!entry.reason || String(entry.reason).trim().length < 10) problems.push(`${where}: missing/short reason`);
    const chord = entry.expression?.chord;
    if (!chord || typeof chord !== "object") problems.push(`${where}: no chord rule`);
    else {
      if (!(chord.chordBeats > 0)) problems.push(`${where}: chordBeats must be > 0`);
      if (chord.quality !== undefined && !QUALITIES.has(chord.quality)) problems.push(`${where}: bad quality`);
      if (chord.style !== undefined && !STYLES.has(chord.style)) problems.push(`${where}: bad style`);
      if (chord.bars !== undefined && !BARS.has(chord.bars)) problems.push(`${where}: bars must be 1|2|3|4|8`);
      if (chord.octaveOffset !== undefined && !OCTAVES.has(chord.octaveOffset)) problems.push(`${where}: octaveOffset must be -2..2`);
      if ((chord.style === "arpeggio" || chord.style === "broken") && !(chord.arpStepBeats > 0)) {
        problems.push(`${where}: ${chord.style} needs arpStepBeats`);
      }
      if (chord.progressionId && !knownProgressions.has(chord.progressionId)) {
        problems.push(`${where}: unknown progressionId ${chord.progressionId}`);
      }
    }
    for (const [role, rule] of Object.entries(entry.expression?.roles ?? {})) {
      if (!ROLES.has(role)) problems.push(`${where}/${role}: unknown role`);
      if (!rule || !ROLE_STYLES.has(rule.style)) problems.push(`${where}/${role}: bad style`);
      if (rule.ratchet !== undefined && rule.style !== "ratchet") problems.push(`${where}/${role}: ratchet needs style "ratchet"`);
      if (rule.everySteps !== undefined && !(rule.everySteps >= 1)) problems.push(`${where}/${role}: everySteps must be >= 1`);
    }
    if (merged[id]) problems.push(`${where}: duplicate id across parts (also in another file)`);
    merged[id] = { expression: { chord, roles: entry.expression?.roles ?? {} }, reason: entry.reason };
  }
}

console.log(`parts: ${partFiles.length} file(s) → ${Object.keys(merged).length} genre overrides`);
if (problems.length) {
  console.error(`❌ ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.error(`   ${p}`);
  process.exit(2);
}
console.log("✅ every entry validated (ids, reasons, ranges, arpeggio rates, roles)");
if (CHECK_ONLY) process.exit(0);

const target = path.join(ROOT, "src/data/genreExpression.ts");
const source = fs.readFileSync(target, "utf8");
const serialise = (value, indent) => JSON.stringify(value, null, 2).split("\n").join(`\n${indent}`);

const block = `/**
 * Generated per-genre overrides (authored per category, validated by
 * \`scripts/merge_expression_parts.mjs\`). Do not hand-edit: the merge rewrites this block.
 */
export const GENRE_EXPRESSION_GENERATED: Record<string, GenreExpressionOverride> = ${serialise(merged, "")};
`;

const START = "/* --- generated overrides: start --- */";
const END = "/* --- generated overrides: end --- */";
const wrapped = `${START}\n${block}${END}\n`;
// Spliced by index, not by regex: the markers contain `/*` and `*`, which are regex
// metacharacters — the first version silently matched nothing and wrote zero overrides.
const startIdx = source.indexOf(START);
const endIdx = source.indexOf(END);
if (startIdx !== -1 && endIdx > startIdx) {
  const after = source.indexOf("\n", endIdx);
  const next = source.slice(0, startIdx) + wrapped + (after === -1 ? "" : source.slice(after + 1));
  fs.writeFileSync(target, next);
} else {
  const marker = "export function expressionOverrideIds()";
  const next = source.replace(marker, `${wrapped}\n${marker}`);
  fs.writeFileSync(target, next);
}
console.log(`✅ wrote ${Object.keys(merged).length} overrides into src/data/genreExpression.ts`);
