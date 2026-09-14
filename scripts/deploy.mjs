#!/usr/bin/env node
/**
 * Wrangler deploy wrapper with credential injection.
 *
 * Credentials are read (in order) from:
 *   1. existing environment (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)
 *   2. ./.env.deploy  (git-ignored; see .env.deploy.example)
 *
 * Usage:
 *   node scripts/deploy.mjs            # build is NOT run; run `npm run build` first or use `npm run deploy`
 *   node scripts/deploy.mjs --dry-run  # wrangler deploy --dry-run (no upload)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_FILE = path.join(ROOT, ".env.deploy");

function parseEnvFile(file) {
  const out = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = fs.existsSync(ENV_FILE) ? parseEnvFile(ENV_FILE) : {};
const env = { ...process.env, ...fileEnv };
const dryRun = process.argv.includes("--dry-run");

if (!env.CLOUDFLARE_API_TOKEN) {
  console.error(
    [
      "\u274c CLOUDFLARE_API_TOKEN is not set.",
      "",
      "Create ./.env.deploy (git-ignored) with:",
      "  CLOUDFLARE_API_TOKEN=<your token>",
      "  CLOUDFLARE_ACCOUNT_ID=<your account id>   # optional but recommended",
      "",
      "Or export them in the shell before running. See .env.deploy.example.",
    ].join("\n")
  );
  process.exit(1);
}

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("\u274c dist/index.html not found \u2014 run `npm run build` first.");
  process.exit(1);
}

const args = ["wrangler", "deploy", ...(dryRun ? ["--dry-run"] : [])];
console.log(`\u25b6\ufe0f  npx ${args.join(" ")}${dryRun ? " (dry run)" : ""}`);

const res = spawnSync("npx", args, {
  cwd: ROOT,
  stdio: "inherit",
  env: {
    ...env,
    // Wrangler reads these; keep them out of any file we write.
    CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
    ...(env.CLOUDFLARE_ACCOUNT_ID ? { CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID } : {}),
  },
});

process.exit(res.status ?? 1);
