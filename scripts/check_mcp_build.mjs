/**
 * The MCP artifact must exist and must be the version the source is (fifth report, P3.7 — insurance, not a fix).
 *
 * The report claimed a composer was getting v2.34.3 features from a v2.34.16 tree. Reading the actual flow, that cannot happen: `check:mcp` **rebuilds** the
 * artifact before running it (`node scripts/build_mcp.mjs && node scripts/check_mcp.mjs`), and `dist-mcp/` is gitignored so no committed copy can go stale. The
 * one gap left is a build that fails silently and leaves yesterday's file in place — which this closes, cheaply, by comparing the version the artifact was built
 * with against the version the source is.
 */
import { readFileSync, existsSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const ARTIFACT = "dist-mcp/groove-mcp.mjs";

if (!existsSync(ARTIFACT)) {
  console.error(`❌ ${ARTIFACT} is missing — run \`npm run mcp:build\`.`);
  process.exit(1);
}
const text = readFileSync(ARTIFACT, "utf8");
/**
 * ⭐ **The prefix comes from `package.json`, not from a version that was current when this was written** (found 2026-10-09).
 *
 * It used to filter on a hardcoded `2.34.` — correct for the fifth report's tree and a guaranteed false negative from
 * `2.35.0` on: at 2.35.4 this check reported "found none" about an artifact that was in fact freshly built, which is exactly
 * the kind of red that teaches people to ignore a gate. The artifact is expected to mention the version's own
 * `major.minor`, whatever that currently is.
 */
const prefix = `${pkg.version.split(".").slice(0, 2).join(".")}.`;
const versions = [...new Set(text.match(/\b\d+\.\d+\.\d+\b/g) ?? [])].filter((v) => v.startsWith(prefix));
if (!versions.includes(pkg.version)) {
  console.error(`❌ ${ARTIFACT} was built from another version (found ${versions.join(", ") || "none"}; source is ${pkg.version}) — run \`npm run mcp:build\`.`);
  process.exit(1);
}
console.log(`✅ the MCP artifact carries the source version (${pkg.version}).`);
