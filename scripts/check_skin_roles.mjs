#!/usr/bin/env node
/**
 * Skin token gate: every `--d-*` token the source reaches for is defined by the skins.
 *
 * ⭐ **This is the check that would have caught "the arrangement is a sheet of white in the light skins"**, and
 * its absence is the whole reason that shipped. The arrangement was written against **`--d-border`** — a token no
 * skin defines — 45 times, each with a dark fallback (`rgba(255,255,255,0.15)`), so on a light skin every border
 * was a pale line on a pale background; `src/index.css` used **`--d-text`** the same way for the audio gate's
 * title, which made the one prompt that resumes a suspended audio context unreadable.
 *
 * A fallback is only a fallback if it is rare: a token that is *never* defined turns every use into a literal.
 * Templates are skipped: `var(--d-track-${kind})` is built at runtime from tokens the skins do define
 * (`--d-track-kick`, `--d-track-bass`, …).
 *
 * ## What this file used to be, and why that half is gone
 *
 * It also compared the *meaning* of a hardcoded hex across two surfaces. The desktop generator and the phone
 * shell's `legacySkin.css` / `panelSkin.css` each mapped the same literal onto their own token, and they were
 * written by hand and independently — so a hex could mean "a surface" on one and "an ink" on the other, and the
 * same element would flip from a paper plate to dark type depending on which shell drew it.
 * `src/data/skinLiteralRoles.json` plus this script was the fix; `src/test/skinRoleTable.test.ts` still holds the
 * table itself to its rules, and `scripts/redlines.mjs` R12a asserts its deviation list is empty.
 *
 * With the phone shell cut (`docs/OPEN_WORK.md` §十三) there is **one surface left**, so there is nothing to
 * compare and the drift half is retired rather than kept as a vacuous pass. That is why the `--report` and
 * `--json` flags are gone with it: they existed to describe divergences that can no longer happen.
 *
 * Usage: node scripts/check_skin_roles.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

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
