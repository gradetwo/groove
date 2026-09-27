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
const versions = [...new Set(text.match(/\b\d+\.\d+\.\d+\b/g) ?? [])].filter((v) => v.startsWith("2.34."));
if (!versions.includes(pkg.version)) {
  console.error(`❌ ${ARTIFACT} was built from another version (found ${versions.join(", ") || "none"}; source is ${pkg.version}) — run \`npm run mcp:build\`.`);
  process.exit(1);
}
console.log(`✅ the MCP artifact carries the source version (${pkg.version}).`);
