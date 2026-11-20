/**
 * The SFZ content gate — the check a mirrored library passes before its bytes are measured, written into the manifest or copied to the mirror.
 *
 * Why it exists: the mirror audit of 2026-11-20 read all 1,321 text files (`.sfz` and `.txt`) the manifest lists and found the defects were point-like but real — one illegal
 * `loop_mode=normal` in cithara-barbarica (`Programs/07-cithara_barbarica_strum_chromatic.sfz`) and six out-of-range `tune` values in mtg-solo-sax (−108/−109) — and both had
 * entered silently, because no step in the ingest pipeline ever looked at the text. The libraries are upstream's; the missing gate was ours. This module is that gate, kept in
 * one place so the uploader and the standalone checker (`scripts/check_sfz_content.mjs`) give the same answer.
 *
 * **What it checks, and only that.** `loop_mode` must be one of the four values the SFZ specification defines, and a static `tune=` must lie in −100..100 cents. Those are the
 * two defect classes the audit actually found; widening the net here (every opcode, every range) would invent findings nobody has measured. `off_mode` was audited too and
 * every value in the corpus was legal, so it is recorded by audits, not gated here.
 *
 * **The matching is the audit's matching.** `loop_mode=([A-Za-z_]+)` and a `tune=` that is not the tail of a longer opcode name — the same expressions the 2026-11-20 audit
 * used, so the gate reproduces the audit's numbers on the corpus it was built from (1 loop_mode, 6 tune). One deliberate widening: a decimal `tune` (`tune=-108.5`) is also
 * compared, where the audit's integer-only pattern skipped it; on integer corpora the two agree exactly.
 */
import fs from "node:fs";
import path from "node:path";

/** The four `loop_mode` values the SFZ specification defines. Anything else — `normal` is the case that shipped — is not a mode a player can honour. */
export const VALID_LOOP_MODES = new Set(["no_loop", "one_shot", "loop_continuous", "loop_sustain"]);

/** The static `tune` range, in cents. The same range the loader clamps to, so a value outside it is a value that cannot sound as written. */
export const TUNE_MIN_CENTS = -100;
export const TUNE_MAX_CENTS = 100;

const LOOP_MODE_PATTERN = /loop_mode=([A-Za-z_]+)/g;
const TUNE_PATTERN = /(?<![A-Za-z_])tune=(-?\d+(?:\.\d+)?)/g;

/** Text files carry the opcodes; audio files cannot. The audit scanned exactly these two suffixes, and so does the gate. */
export const isScannableTextFile = (filePath) => /\.(sfz|txt)$/i.test(filePath);

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/**
 * Scan one file's text. Returns one violation per offending opcode occurrence: `{ file, line, opcode, value, problem }`.
 * `file` is the label the caller wants in reports (a manifest-relative path, not a scratch path).
 */
export function scanSfzText(text, file) {
  const violations = [];
  for (const match of text.matchAll(LOOP_MODE_PATTERN)) {
    if (!VALID_LOOP_MODES.has(match[1])) {
      violations.push({
        file,
        line: lineOf(text, match.index),
        opcode: "loop_mode",
        value: match[1],
        problem: `loop_mode=${match[1]} is not one of ${[...VALID_LOOP_MODES].join(", ")}`,
      });
    }
  }
  for (const match of text.matchAll(TUNE_PATTERN)) {
    const cents = Number(match[1]);
    if (cents < TUNE_MIN_CENTS || cents > TUNE_MAX_CENTS) {
      violations.push({
        file,
        line: lineOf(text, match.index),
        opcode: "tune",
        value: match[1],
        problem: `tune=${match[1]} is outside ${TUNE_MIN_CENTS}..${TUNE_MAX_CENTS} cents`,
      });
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}

/**
 * Scan the listed files under `root` — the uploader's shape, where the manifest already names every file. A listed text file that is not on disk is reported in `missing`
 * rather than silently skipped: the checkout and the manifest disagreeing is a fact the operator should see, even though presence is another check's job.
 */
export function scanSfzFiles(root, relativePaths) {
  const violations = [];
  const missing = [];
  let scanned = 0;
  for (const relative of relativePaths.filter(isScannableTextFile)) {
    const full = path.join(root, relative);
    if (!fs.existsSync(full)) {
      missing.push(relative);
      continue;
    }
    scanned += 1;
    violations.push(...scanSfzText(fs.readFileSync(full, "utf8"), relative));
  }
  return { scanned, violations, missing };
}

/**
 * Scan every text file under a directory tree — the standalone checker's shape, where there is no manifest list to follow. Dot-directories (`.git` above all) are not part of
 * an instrument and are not entered, the same rule the manifest builder applies to dot-paths.
 */
export function scanSfzTree(root) {
  const found = [];
  const walk = (dir) => {
    for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dirent.name.startsWith(".")) continue;
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) walk(full);
      else if (isScannableTextFile(dirent.name)) found.push(path.relative(root, full));
    }
  };
  walk(root);
  found.sort();
  return scanSfzFiles(root, found);
}

/** One line per violation, in the shape a refusal message can embed verbatim. */
export function formatViolations(violations) {
  return violations.map((v) => `    ${v.file}:${v.line} — ${v.problem}`).join("\n");
}
