#!/usr/bin/env node
/**
 * Writes the measured loudness trims from the baseline report into the genre mix table.
 *
 *   node scripts/apply_loudness_trims.mjs [--report=path] [--check]
 *
 * Why this exists: `src/data/genreMix.ts` is what playback and export actually read,
 * while `scripts/loudness.baseline.json` is the evidence for those numbers. Copying
 * 159 values by hand is how a transcription error gets in and is not reviewable, so
 * the table is generated from the report instead. The rewrite is idempotent: running
 * it twice changes nothing, and it only ever touches the `loudnessTrimDb` field of
 * lines it recognises (category + trim on one line, per the table's layout).
 *
 * `--check` verifies the two sides agree and exits non-zero on any drift without
 * writing. `scripts/check_loudness_spread.mjs` performs the same comparison as part
 * of the slow track.
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

const checkOnly = argv.includes("--check");
const reportPath = path.resolve(ROOT, argValue("--report", "scripts/loudness.baseline.json"));
const MIX_PATH = path.join(ROOT, "src/data/genreMix.ts");

if (!fs.existsSync(reportPath)) {
  console.error(`❌ loudness report not found: ${path.relative(ROOT, reportPath)}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (report.subset || report.limit) {
  console.error("❌ refusing to apply trims from a subset run; run the full 159-genre measurement");
  process.exit(1);
}

/** genreId -> trim from the table source. */
function readTableTrims(source) {
  const found = new Map();
  for (const line of source.split("\n")) {
    const match = line.match(/^\s{2}"([a-z0-9-]+)":\s*\{\s*category:\s*"([^"]+)",\s*loudnessTrimDb:\s*(-?[\d.]+)/);
    if (match) found.set(match[1], Number(match[3]));
  }
  return found;
}

function formatTrim(value) {
  return Number(value).toString();
}

function rewrite(source, trims) {
  const seen = new Set();
  const lines = source.split("\n").map((line) => {
    const match = line.match(/^(\s{2}"([a-z0-9-]+)":\s*\{\s*category:\s*"[^"]+",\s*loudnessTrimDb:\s*)(-?[\d.]+)(.*)$/);
    if (!match) return line;
    const [, prefix, genreId, , suffix] = match;
    if (!trims.has(genreId)) return line;
    seen.add(genreId);
    return `${prefix}${formatTrim(trims.get(genreId))}${suffix}`;
  });
  return { text: lines.join("\n"), seen };
}

const trims = new Map(
  Object.entries(report.genres).map(([genreId, entry]) => [genreId, entry.trimDb])
);
const source = fs.readFileSync(MIX_PATH, "utf8");
const tableTrims = readTableTrims(source);

const missing = [...trims.keys()].filter((id) => !tableTrims.has(id));
const orphans = [...tableTrims.keys()].filter((id) => !trims.has(id));
const drifted = [...trims.entries()].filter(
  ([id, trim]) => tableTrims.has(id) && Math.abs(tableTrims.get(id) - trim) > 0.01
);

if (checkOnly) {
  const problems = [];
  if (missing.length) problems.push(`${missing.length} report genre(s) missing from the table`);
  if (orphans.length) problems.push(`${orphans.length} table genre(s) missing from the report`);
  if (drifted.length) {
    problems.push(
      `${drifted.length} trim(s) differ: ` +
        drifted
          .slice(0, 5)
          .map(([id, trim]) => `${id} table=${tableTrims.get(id)} report=${trim}`)
          .join(", ")
    );
  }
  const allZero = [...tableTrims.values()].every((v) => v === 0);
  const reportHasNonZero = [...trims.values()].some((v) => v !== 0);
  if (allZero && reportHasNonZero) {
    problems.push("every table trim is 0 while the report has non-zero trims (feature is inert)");
  }
  if (problems.length) {
    console.error(`❌ genre mix table does not match ${path.relative(ROOT, reportPath)}:`);
    for (const problem of problems) console.error(`   - ${problem}`);
    console.error("   run: node scripts/apply_loudness_trims.mjs");
    process.exit(1);
  }
  console.log(
    `✅ ${trims.size} trims match the report (non-zero: ${[...trims.values()].filter((v) => v !== 0).length})`
  );
  process.exit(0);
}

const { text, seen } = rewrite(source, trims);
if (seen.size !== trims.size) {
  console.error(
    `❌ rewrote ${seen.size} of ${trims.size} entries — the table layout changed; update this script`
  );
  process.exit(1);
}
if (text === source) {
  console.log(`✅ already up to date (${trims.size} trims, no change written)`);
} else {
  fs.writeFileSync(MIX_PATH, text);
  const nonZero = [...trims.values()].filter((v) => v !== 0).length;
  console.log(
    `✅ wrote ${trims.size} trims into ${path.relative(ROOT, MIX_PATH)} ` +
      `(non-zero: ${nonZero}, range ${Math.min(...trims.values())} .. ${Math.max(...trims.values())})`
  );
}
