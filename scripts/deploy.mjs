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
import { sampleRootVerdict } from "./lib/sampleRoot.mjs";
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

/**
 * The payload gate, at the last moment before the bytes leave the machine.
 *
 * The cover-production batch used to live in `public/covers`, so the build copied it into `dist` and every deploy published it:
 * 794 MB under `dist/covers` where about 285 MB is artwork, including 410 MB of scratch. `npm run verify` catches that now, but
 * a deploy can be run on its own — and the whole point is that the junk never reaches the network — so the same check runs here
 * and **refuses to deploy**.
 */
const coversCheck = spawnSync(process.execPath, [path.join(ROOT, "scripts", "check_covers_payload.mjs"), "--dir=dist/covers"], {
  cwd: ROOT,
  stdio: "inherit",
});
if (coversCheck.status !== 0) {
  console.error(
    [
      "",
      "\u274c Refusing to deploy: the covers payload contains something that is not artwork.",
      "   Something in `public/covers/` is not a `<genre>.jpg`, a `<skin>/<genre>.jpg`, `_thumbs/**` or `CREDITS.md`,",
      "   and the build has copied it. Production tooling belongs in `tools/covers/`.",
      "",
    ].join("\n")
  );
  process.exit(1);
}

/**
 * The application starts, or nothing ships.
 *
 * This is the check that was missing when a "cosmetic" `index.html` edit deleted the entry script: the build produced a dead
 * shell, every probe that drives a surface would have failed for a confusing reason, and the deploy would have published it.
 * The probe serves `dist` and requires React to take over, so the failure is one sentence instead of a mystery.
 */
const bootCheck = spawnSync(process.execPath, [path.join(ROOT, "scripts", "probe_boot.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});
if (bootCheck.status !== 0) {
  console.error(
    [
      "",
      "\u274c Refusing to deploy: the built application does not start.",
      "   Run `npm run build` and then `npm run probe:boot`; the probe's message says what the page did instead.",
      "",
    ].join("\n")
  );
  process.exit(1);
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

/**
 * ⭐ **The worker configuration is machine-local on purpose, and this is the gate that says so.**
 *
 * `.gitignore` keeps `wrangler.toml` out of the repository, so only `wrangler.toml.example` is tracked, and the
 * example's own first line says the real file "names *your* worker". A checkout that has never deployed therefore
 * has no configuration at all — and wrangler's own error for that (`Missing entry-point to Worker script or to
 * assets directory`) arrives *after* everything this script checks, says nothing about which file to create, and
 * is indistinguishable from a repository that lost its build. That happened on 2.34.38, which is why this check
 * exists, why it runs before the build is touched, and why it names the exact command.
 * ⚠️ **It sits here on purpose: after the local checks and immediately before wrangler.** A fresh checkout
 * should still be told whether its own build is consistent — the version match, the covers payload, the boot
 * probe — *before* it is told which file it is missing. The first version of this check ran before those, so a
 * dry run on a machine with no configuration reported the missing file and nothing else.
 */
const WRANGLER_CONFIG_FILES = ["wrangler.toml", "wrangler.json", "wrangler.jsonc"];
const wranglerConfigPath = WRANGLER_CONFIG_FILES.map((file) => path.join(ROOT, file)).find((candidate) =>
  fs.existsSync(candidate)
);
if (!wranglerConfigPath) {
  console.error(
    [
      "\u274c no wrangler configuration in this checkout \u2014 nothing has been deployed.",
      `   Looked for: ${WRANGLER_CONFIG_FILES.join(", ")}`,
      "   The real file is git-ignored because it names *your* worker, so a fresh checkout must create it:",
      "     cp wrangler.toml.example wrangler.toml",
      "   and set `name` to the worker name in your own Cloudflare account.",
      "   Then check the credentials this script also needs:",
      "     npx wrangler whoami     # must not answer \"You are not authenticated\"",
      "   or put CLOUDFLARE_API_TOKEN in ./.env.deploy (see .env.deploy.example).",
      "",
    ].join("\n")
  );
  process.exit(1);
}

/**
 * ⭐ **The last check before anything is uploaded: can the built app reach its samples?**
 *
 * The 2.34.38 release passed every other step and shipped a bundle with no catalogue root, so the site could read its
 * manifest and fetch no recording at all. Every check above is about the build being *coherent*; this one is about it
 * being *complete*, and it is the only one that would have caught that release. The reasoning, and why it reads every
 * built file rather than the scripts the entry point names, is in `scripts/lib/sampleRoot.mjs`.
 */
const configuredSampleRoot = (() => {
  const fromEnv = (process.env.VITE_SAMPLE_ROOT ?? "").trim();
  if (fromEnv !== "") return fromEnv;
  // The build reads this file (gitignored, so a fresh worktree never has one) — read the same place the build did.
  const localEnv = path.join(ROOT, ".env.local");
  if (!fs.existsSync(localEnv)) return "";
  const line = fs
    .readFileSync(localEnv, "utf8")
    .split("\n")
    .find((candidate) => candidate.startsWith("VITE_SAMPLE_ROOT="));
  return line ? line.slice("VITE_SAMPLE_ROOT=".length).trim() : "";
})();
const shippedManifestPath = path.join(ROOT, "public", "samples", "manifest.json");
const sampleRootCheck = sampleRootVerdict({
  distDir: path.join(ROOT, "dist"),
  envRoot: configuredSampleRoot,
  manifestText: fs.existsSync(shippedManifestPath) ? fs.readFileSync(shippedManifestPath, "utf8") : ""
});
if (!sampleRootCheck.ok) {
  console.error(
    [
      "\u274c the built app cannot reach its samples \u2014 nothing has been deployed.",
      `   ${sampleRootCheck.reason}`,
      `   Read ${sampleRootCheck.scriptsRead ?? 0} built script(s) under dist/, including lazy chunks.`,
      "",
    ].join("\n")
  );
  process.exit(1);
}

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
