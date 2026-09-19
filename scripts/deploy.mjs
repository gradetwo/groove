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
/**
 * Credential files, in precedence order (later wins).
 *
 * `.env` is where this project's token actually lives — it is the file the repo ships an example
 * for (`.env.deploy.example`) and the one the local setup already had. Reading only `.env.deploy`
 * meant `npm run deploy` silently fell back to wrangler's own stored session even though a valid
 * token was sitting in the working tree, which is why deployments were being run by hand.
 *
 * `.env.deploy` still wins when present, so an operator can override without touching `.env`.
 */
const ENV_FILES = [path.join(ROOT, ".env"), path.join(ROOT, ".env.deploy")];

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

const fileEnv = ENV_FILES.reduce(
  (acc, file) => (fs.existsSync(file) ? { ...acc, ...parseEnvFile(file) } : acc),
  {}
);
const env = { ...process.env, ...fileEnv };
const dryRun = process.argv.includes("--dry-run");

// Credentials are optional here: if neither the environment nor .env.deploy provides
// a token we still try, because wrangler may already hold its own authenticated
// session (OAuth / previously stored credentials). Only a wrangler auth failure is
// reported as a credential problem.
if (!env.CLOUDFLARE_API_TOKEN) {
  console.log(
    [
      "\u2139\ufe0f  CLOUDFLARE_API_TOKEN not found in the environment, .env or .env.deploy.",
      "   Falling back to wrangler's own stored authentication.",
      "   If this fails, add it to ./.env (git-ignored) or ./.env.deploy:",
      "     CLOUDFLARE_API_TOKEN=<your token>",
      "     CLOUDFLARE_ACCOUNT_ID=<your account id>   # optional but recommended",
      "   See .env.deploy.example.",
      "",
    ].join("\n")
  );
}

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("\u274c dist/index.html not found \u2014 run `npm run build` first.");
  process.exit(1);
}

const args = ["wrangler", "deploy", ...(dryRun ? ["--dry-run"] : [])];
console.log(`\u25b6\ufe0f  npx ${args.join(" ")}${dryRun ? " (dry run)" : ""}`);

const childEnv = { ...env };
if (!childEnv.CLOUDFLARE_API_TOKEN) delete childEnv.CLOUDFLARE_API_TOKEN;
if (!childEnv.CLOUDFLARE_ACCOUNT_ID) delete childEnv.CLOUDFLARE_ACCOUNT_ID;

const res = spawnSync("npx", args, {
  cwd: ROOT,
  stdio: "inherit",
  env: childEnv,
});

if ((res.status ?? 1) !== 0) {
  const combined = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  if (/not authenticated|authentication error|10000|Invalid API Token/i.test(String(combined))) {
    console.error(
      [
        "",
        "\u274c Wrangler is not authenticated.",
        "   Either run `npx wrangler login`, or create ./.env.deploy with",
        "   CLOUDFLARE_API_TOKEN=<token> (see .env.deploy.example).",
      ].join("\n")
    );
  }
}

process.exit(res.status ?? 1);
