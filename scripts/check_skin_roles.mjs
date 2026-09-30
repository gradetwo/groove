#!/usr/bin/env node
/**
 * Skin role drift check: one literal, one meaning.
 *
 * Three places decide what a hardcoded hex *means*:
 *
 *   1. `src/data/skinLiteralRoles.json` — the shared table, the single source;
 *   2. `scripts/desktop_skins.mjs` → `src/styles/desktopSkins.css`, which maps each literal to a `--d-*` token;
 *   3. the phone's `legacySkin.css` / `panelSkin.css`, which hand-map the same literals to `--m-*` tokens for the
 *      desktop views rendered inside the phone shell.
 *
 * Nothing compared them, and they are written by hand, so a hex could mean "a surface" on one surface and "an
 * ink" on the other — the same element would then flip from a paper plate to dark type depending on which shell
 * drew it. This check reads all three and requires agreement, except where the table lists a **deviation with a
 * reason**: the phone's character sheets are opinionated on purpose (the comic skin prints dark plates as solid
 * ink, because on newsprint a dark plate *is* ink).
 *
 * Usage: node scripts/check_skin_roles.mjs [--report]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_ONLY = process.argv.includes("--report");
const JSON_OUT = process.argv.includes("--json");
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "skinLiteralRoles.json"), "utf8"));

/** `--d-surface-pale-2` → `surfacePale2`; the `-ink`/`-on` suffixes are the readable variants of a role. */
function roleFromToken(token) {
  const bare = token.replace(/^--[dm]-/, "");
  const stripped = bare.replace(/-(ink|on)$/, "");
  const parts = stripped.split("-");
  return parts
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("")
    .replace(/\bcat([A-Z])/, "cat$1");
}

/**
 * The phone's tokens and the roles they stand for.
 *
 * Hand-written here because the phone sheets speak in tokens (`--m-card`) that predate the role vocabulary; the
 * point of the check is that this small table is the *only* place the two vocabularies are bridged.
 */
const PHONE_TOKEN_ROLES = {
  bg: "bg",
  card: "panel",
  "card-2": "panel2",
  surface: "surface",
  line: "line",
  "line-2": "lineStrong",
  ink: "ink",
  "ink-2": "ink2",
  "ink-3": "ink3",
  "on-gold": "onAccent",
  gold: "accent",
  "gold-hi": "accent",
  teal: "catElectronic",
  violet: "catJazz",
  red: "danger",
  green: "success",
  warning: "warning",
};

/**
 * Every `[class~="prefix-[#hex]"]` in a sheet, with the token the **matching property** sets.
 *
 * Both sides are parsed the same way, and compared *against each other* rather than against the table: the table
 * holds one role per literal, while the desktop generator legitimately picks a different role per use (a `text-`
 * literal takes the readable ink step, a `border-` literal a hairline). What must not diverge is the *meaning the
 * two surfaces give the same literal in the same position* — that is what makes an element flip between a paper
 * plate and dark type depending on which shell drew it.
 */
const PROPERTY_FOR_PREFIX = { bg: "background-color", text: "color", border: "border-color" };

function literalMappings(css, tokenPrefix) {
  const out = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let rule;
  while ((rule = ruleRe.exec(css)) !== null) {
    const [, selector, body] = rule;
    const classes = [...selector.matchAll(/\[class~="(bg|text|border)-\[(#[0-9a-fA-F]{3,8})\](?:\/(\d{1,3}))?"\]/g)];
    if (!classes.length) continue;
    for (const match of classes) {
      const property = PROPERTY_FOR_PREFIX[match[1]];
      // The declaration that matches the prefix; a gradient stop is a fill, so `--tw-gradient-from` counts as one.
      const declarations = [...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)];
      const relevant = declarations.find(([, name]) => name === property || (match[1] === "bg" && name === "--tw-gradient-from"));
      if (!relevant) continue;
      const token = new RegExp(`var\\(\\s*(${tokenPrefix}[a-zA-Z0-9-]+)`).exec(relevant[2]);
      if (!token) continue;
      out.push({ prefix: match[1], hex: match[2].toLowerCase(), token: token[1] });
    }
  }
  return out;
}

const deviations = new Set(
  TABLE.deviations.map((entry) => `${entry.surface}:${entry.prefix ?? "*"}:${entry.literal}:${entry.role}`)
);
const hasDeviation = (surface, prefix, literal, role) =>
  deviations.has(`${surface}:${prefix}:${literal}:${role}`) || deviations.has(`${surface}:*:${literal}:${role}`);

const findings = [];

/** 1. What the desktop says each literal means, per prefix. */
const desktop = fs.readFileSync(path.join(ROOT, "src", "styles", "desktopSkins.css"), "utf8");
const desktopRoles = new Map();
for (const { prefix, hex, token } of literalMappings(desktop, "--d-")) {
  const key = `${prefix}:${hex}`;
  if (!desktopRoles.has(key)) desktopRoles.set(key, new Set());
  desktopRoles.get(key).add(roleFromToken(token));
}

/** 2. The two phone sheets must agree with it. */
for (const sheet of ["legacySkin.css", "panelSkin.css"]) {
  const css = fs.readFileSync(path.join(ROOT, "src", "mobile", "skins", sheet), "utf8");
  for (const { prefix, hex, token } of literalMappings(css, "--m-")) {
    const bare = token.replace(/^--m-/, "");
    const phoneRole = PHONE_TOKEN_ROLES[bare] ?? roleFromToken(token);
    const expected = desktopRoles.get(`${prefix}:${hex}`);
    if (!expected) {
      findings.push({ surface: sheet, prefix, hex, role: phoneRole, problem: "the desktop does not map this literal for this property" });
      continue;
    }
    // A lane or category role may be answered with its readable `-ink` form; that is the same meaning.
    const comparable = phoneRole.endsWith("Ink") ? phoneRole.slice(0, -3) : phoneRole;
    if (!expected.has(comparable) && !hasDeviation(sheet, prefix, hex, phoneRole)) {
      findings.push({ surface: sheet, prefix, hex, role: phoneRole, problem: `desktop says ${[...expected].join("/")}` });
    }
  }
}

/**
 * Deduplicated, and split in two.
 *
 * `divergence` is the dangerous one: both surfaces map the literal and disagree. `phone-only` is not drift — the
 * desktop reaches those elements through a *named* Tailwind class (`bg-white`) or does not style them at all —
 * so it is reported as a count and never fails the gate.
 */
const unique = new Map();
for (const finding of findings) {
  unique.set(`${finding.surface}:${finding.prefix}:${finding.hex}:${finding.role}`, finding);
}
const divergences = [...unique.values()].filter((row) => row.problem.startsWith("desktop says"));
const phoneOnly = [...unique.values()].filter((row) => !row.problem.startsWith("desktop says"));
const bySurface = new Map();
for (const finding of divergences) {
  if (!bySurface.has(finding.surface)) bySurface.set(finding.surface, []);
  bySurface.get(finding.surface).push(finding);
}

if (JSON_OUT) {
  console.log(JSON.stringify({ divergences, phoneOnly }, null, 2));
  process.exit(0);
}

if (!REPORT_ONLY) {
  console.log("\n🎭 SKIN ROLE DRIFT\n");
  console.log(`   table: ${Object.keys(TABLE.literals).length} literals, ${TABLE.deviations.length} documented deviation(s)`);
  console.log(`   phone-only literals (no desktop rule for that property): ${phoneOnly.length}\n`);
  for (const [surface, rows] of [...bySurface.entries()].sort()) {
    console.log(`   ${surface}: ${rows.length} divergence(s)`);
    for (const row of rows.slice(0, 12)) {
      console.log(`     · ${row.prefix}-[${row.hex}] → ${row.role}  (${row.problem})`);
    }
    if (rows.length > 12) console.log(`     … and ${rows.length - 12} more`);
  }
}

if (divergences.length) {
  if (REPORT_ONLY) {
    console.log(`\n📋 report only: ${divergences.length} divergence(s) — not failing`);
    process.exit(0);
  }
  console.error(
    `\n❌ ${divergences.length} divergence(s). Either fix the mapping, or record it in\n` +
      "   src/data/skinLiteralRoles.json as a deviation with a reason — a hex must not change meaning silently.\n"
  );
  process.exit(1);
}
console.log("✅ every literal means the same thing on every surface (or is a documented deviation)");

/**
 * ⭐ **Every `--d-*` token the source uses must be defined by the skins.**
 *
 * This is the check that would have caught "the arrangement is a sheet of white in the light skins", and its absence is the whole reason that shipped. The arrangement was written against **`--d-border`** — a token no skin defines — 45 times, each with a dark fallback (`rgba(255,255,255,0.15)`), so on a light skin every border was a pale line on a pale background; `src/index.css` used **`--d-text`** the same way for the audio gate's title, which made the one prompt that resumes a suspended audio context unreadable.
 *
 * A fallback is only a fallback if it is rare: a token that is *never* defined turns every use into a literal, and this file already exists to stop literals from meaning different things on different surfaces. The two checks are the same rule from two sides — that one asks whether a literal means one thing everywhere, this one asks whether the token a literal was replaced by exists at all.
 *
 * Templates are skipped: `var(--d-track-${kind})` is built at runtime from tokens the skins do define (`--d-track-kick`, `--d-track-bass`, …).
 */
const DEFINED_TOKENS = new Set(
  [...fs.readFileSync(path.join(ROOT, "src", "styles", "desktopTokens.css"), "utf8").matchAll(/(--d-[a-z0-9-]+)\s*:/g)].map(
    (match) => match[1]
  )
);
const tokenFiles = [];
const collectTokenFiles = (dir) => {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/node_modules|test|__tests__/.test(entry.name)) collectTokenFiles(rel);
    } else if (/\.(tsx?|css)$/.test(entry.name)) tokenFiles.push(rel);
  }
};
for (const dir of ["src/components", "src/views", "src/features", "src/ui", "src/styles"]) collectTokenFiles(dir);
tokenFiles.push("src/index.css");

const unknownTokens = new Map();
for (const file of tokenFiles) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const match of text.matchAll(/var\((--d-[a-z0-9-]+)\s*[,)]/g)) {
    const token = match[1];
    if (DEFINED_TOKENS.has(token)) continue;
    const key = `${token}  (${file})`;
    unknownTokens.set(key, (unknownTokens.get(key) ?? 0) + 1);
  }
}

if (unknownTokens.size > 0) {
  console.error(
    `\n❌ ${unknownTokens.size} use(s) of a --d-* token no skin defines. Each one is a dark literal by another name,\n` +
      "   and on a light skin it paints over its own background. Use the token that already carries this meaning,\n" +
      "   or add it to src/styles/desktopTokens.css:"
  );
  for (const [key, count] of unknownTokens) console.error(`     · ${key} ×${count}`);
  process.exit(1);
}
console.log("✅ every --d-* token the source uses is defined by the skins");
