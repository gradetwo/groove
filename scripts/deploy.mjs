#!/usr/bin/env node
/**
 * Wrangler deploy wrapper with credential injection.
 *
 * Credentials are read (in order) from:
 *   1. existing environment (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)
 *   2. ./.env.deploy  (git-ignored; see .env.deploy.example)
 *
 * Usage:
 *   node scripts/deploy.mjs             # build is NOT run; run `npm run build` first or use `npm run deploy`
 *   node scripts/deploy.mjs --dry-run   # wrangler deploy --dry-run (no upload)
 *   node scripts/deploy.mjs --preview   # upload a *version* and alias it, leaving production traffic alone
 *
 * `--preview` exists because iterating on the live URL is the wrong trade: it replaces the released
 * build for real users while a change is half-finished, and the only way back is another deploy of the
 * old one. `wrangler versions upload --preview-alias` puts the working tree on its own URL
 * (`https://<alias>-<worker>.<subdomain>.workers.dev`) while `groove.wangda.today` keeps serving the
 * release. The same credential injection and the same "is `dist` actually this version" guard apply,
 * because a preview that is not the build you are looking at is worse than no preview.
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
const preview = process.argv.includes("--preview");
/** Stable so it is the same URL every time; the version underneath it is what changes. */
const previewAliasIndex = process.argv.findIndex((a) => a.startsWith("--preview-alias"));
const previewAlias =
  previewAliasIndex !== -1 && process.argv[previewAliasIndex].includes("=")
    ? process.argv[previewAliasIndex].split("=")[1]
    : previewAliasIndex !== -1 && process.argv[previewAliasIndex + 1]
      ? process.argv[previewAliasIndex + 1]
      : "dev";

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

/**
 * The build in `dist` must be the version being released.
 *
 * There is no ordering enforced between "bump the version" and "build": run them the wrong way round
 * and this script happily uploads the *previous* release under the new version's name. That happened
 * — v2.0.64 went out while the tag said v2.0.65, and the only reason it was caught is that the live
 * `version.json` disagreed with the repository. Checking is one file read, and the failure it
 * prevents is a wrong build in production with a green deploy log.
 */
const distVersionFile = path.join(ROOT, "dist", "version.json");
if (fs.existsSync(distVersionFile)) {
  let distVersion = null;
  try {
    distVersion = JSON.parse(fs.readFileSync(distVersionFile, "utf8")).version ?? null;
  } catch {
    /* reported below as "unreadable" */
  }
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  if (distVersion !== pkgVersion) {
    console.error(
      [
        "\u274c Stale build: dist is " + (distVersion ?? "unreadable") + " but package.json is " + pkgVersion + ".",
        "   Run \`npm run build\` (or \`npm run deploy\`, which verifies first) so the uploaded assets match the release.",
        "   This guard exists because a version bump after the last build otherwise ships the previous",
        "   release under the new version's name.",
        "",
      ].join("\n")
    );
    process.exit(1);
  }
  console.log("\u2705 dist matches package.json at v" + distVersion);
} else {
  console.warn(
    "\u26a0\ufe0f  dist/version.json is missing, so this deploy cannot be checked against package.json."
  );
}

const args = preview
  ? ["wrangler", "versions", "upload", "--preview-alias", previewAlias]
  : ["wrangler", "deploy", ...(dryRun ? ["--dry-run"] : [])];
console.log(
  `\u25b6\ufe0f  npx ${args.join(" ")}` +
    (preview
      ? `  (preview only \u2014 production traffic is untouched; the URL is the alias URL wrangler prints)`
      : dryRun
        ? " (dry run)"
        : "")
);

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
