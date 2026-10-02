import fs from "node:fs";
import path from "node:path";

/**
 * ⭐ **THE DISABLED-GATES LEDGER — the one place that says which gates are off, why, when they come
 * back, and who decided.**
 *
 * ## Why this file exists rather than four deleted steps
 *
 * Four measurement gates hold numbers that were recorded from a render that **cannot see the
 * sampling path**: they render (or check a baseline recorded) through `renderPatternOffline` /
 * `analyze_export_audio.mjs` **without** `RenderWavOptions.audioLaneCatalogue`, so every lane the
 * written table (`src/data/sampledInstruments.ts`) maps to a recording falls back to the built-in
 * synthesiser. They are not wrong about what they measure; they are blind to a whole class of sound,
 * and a green light from them is therefore a claim about a rendering the application no longer
 * produces for a user who has a library.
 *
 * That is harmless while nothing samples. It stopped being harmless with the owner's decision of
 * **2026-10-02**, in two parts:
 *
 *   1. **the release is wired** — `WavExporter`'s sampler sink now gives a note the recording
 *      outlasts an end through a ramp instead of a hard cut (`DEFAULT_SAMPLER_RELEASE_SECONDS`), so
 *      an exported sampled note's level and tail change by construction; and
 *   2. **these gates are disabled until the version is stable**, at which point the catalogue is
 *      passed into the render and the baselines are re-recorded.
 *
 * The owner's words are the ruling this file implements: *"暂时禁用这些门禁，等版本稳定后传
 * catalogue 并重录基线"* (rider 2, 2026-10-02). The fourth entry — the musical ratchet
 * (`check:groove`) — was ruled in by the owner's follow-up of the same day:
 * *"check:groove 一起禁"*.
 *
 * ## What "disabled" means here, exactly
 *
 * The gate **file and its logic are untouched**. What is switched off is the *entry point*: the npm
 * script (`npm run check:loudness` and friends) and the slow track route through
 * `scripts/disabled_gate_guard.mjs`, which reads this ledger and either prints the notice below or
 * runs the real command unchanged. So:
 *
 *   · `npm run check:disabled-gates` fails if the wiring and this ledger disagree **in either
 *     direction** — a listed gate that is still wired straight through, or a gate quietly wired
 *     around the guard without a ledger entry;
 *   · `DISABLED_GATES_IGNORE=1 npm run check:loudness` runs the real gate anyway, so the switch is
 *     reversible without an edit and a baseline re-record is never blocked;
 *   · `node scripts/measure_genre_loudness.mjs` / `npm run record:loudness` are **not** guarded:
 *     re-recording the baseline is the thing this ledger says has to happen next.
 *
 * `docs/DISABLED_GATES.md` is the long form: the survey of every gate, the reason each one is or is
 * not in this list, and the wiring measurements.
 */

/** The one executable that decides whether a guarded entry point runs or skips. */
export const DISABLED_GATE_GUARD = "scripts/disabled_gate_guard.mjs";

/**
 * ⭐ **The set. Nothing outside this array may be disabled, and everything inside it must be wired.**
 *
 * Each entry carries the three facts the owner asked for: **why** it cannot see reality, **when** it
 * comes back, and **who** decided.
 */
export const DISABLED_GATES = [
  {
    id: "check:loudness:fresh",
    entry: "scripts/measure_genre_loudness.mjs",
    what: "Re-renders three sampled genres and compares them with scripts/loudness.baseline.json (±0.35 dB).",
    why:
      "It renders through `renderPatternOffline` with no `audioLaneCatalogue`, so every lane mapped to a recording is voiced by the built-in synthesiser. " +
      "It is blind to the sampling path: the sampler release wired into `WavExporter` on 2026-10-02 moves no number it can see.",
    todayRed:
      "RED before this change, on origin/dev d8ec77a: 3/3 genres differ from the report — chicago-house −0.67 dB, 2-step-garage −1.05 dB, alternative-rock −1.31 dB. " +
      "A pre-existing red, not caused by the wiring.",
    returnsWhen:
      "The version is stable: pass the catalogue into the render under test (the `--sample` path reads it the way the app's export path already does) and re-record scripts/loudness.baseline.json.",
    decidedBy: "the owner, 2026-10-02 (rider 2: 暂时禁用这些门禁，等版本稳定后传 catalogue 并重录基线)",
  },
  {
    id: "check:loudness",
    entry: "scripts/check_loudness_spread.mjs",
    what: "Reads the committed loudness baseline and holds it against src/data/genreMix.ts (spread, trims, clipping, true peak).",
    why:
      "It is the reading half of the render above, so it can only ever be as visible as the render it reads: the baseline it checks was recorded without a catalogue, " +
      "and it agrees with the table whether or not a single sampled lane was ever mixed.",
    todayRed: "No — green today. It is green for a reason that is not about the audio: the report and the table agree with each other while neither saw a catalogue.",
    returnsWhen: "The version is stable: re-record scripts/loudness.baseline.json (with the catalogue passed into the render) and this gate reads the new numbers.",
    decidedBy: "the owner, 2026-10-02 (rider 2: 暂时禁用这些门禁，等版本稳定后传 catalogue 并重录基线)",
  },
  {
    id: "check:timbre",
    entry: "scripts/check_timbre_spread.mjs",
    what: "Reads the committed timbre baseline (scripts/timbre.baseline.json) and checks the library's fingerprints against their sources.",
    why:
      "Recorded the same way as the loudness baseline — `measure_genre_timbre.mjs` also renders without `audioLaneCatalogue` — so its fingerprints describe synthesised lanes. " +
      "A release that changes an exported sample's tail is invisible to it, and the fingerprints would move the moment a catalogue reaches the render.",
    todayRed: "No — green today, and blind to the sampling path for the same reason as `check:loudness`.",
    returnsWhen: "The version is stable: pass the catalogue into the render and re-record scripts/timbre.baseline.json.",
    decidedBy: "the owner, 2026-10-02 (rider 2: 暂时禁用这些门禁，等版本稳定后传 catalogue 并重录基线)",
  },
  {
    id: "check:groove",
    entry: "scripts/check_groove.mjs",
    what:
      "The musical ratchet: renders twelve genres through scripts/analyze_export_audio.mjs and judges six claims per genre " +
      "(flat velocities, an inaudible sidechain, a near-mono file, hollow mids, static harmony, a cut tail) against budgets that are today's numbers.",
    why:
      "`analyze_export_audio.mjs` renders through `renderPatternOffline` with no `audioLaneCatalogue`, so every lane mapped to a recording is voiced by the built-in synthesiser — " +
      "the same blindness as the loudness and timbre gates. Of its twelve structural claims, the render-derived ones (the mid-band share behind `thinMids`, the stereo spread behind " +
      "`narrowStereo`, and the tail behind `cutTail`) are numbers about a mix, and those numbers move the moment a catalogue reaches the render.",
    todayRed:
      "Not measured on origin/dev: it runs only in the nightly sweep (`groove-shards` + `groove-gate`), not on a push. Reported as \"not judged here\", not as green.",
    returnsWhen:
      "The version is stable: pass the catalogue into the render and re-record the ratchet's budgets (docs/GROOVE_QUALITY_PLAN.md's numbers are today's measurements).",
    decidedBy: "the owner, 2026-10-02 (rider 2, then the follow-up that names this gate: check:groove 一起禁)",
  },
];

/**
 * ⭐ **Gates that must never appear in the list above.**
 *
 * Kept as data rather than as a comment so `npm run check:disabled-gates` can fail on a future change
 * that quietly wraps one of them: the ledger is the *only* thing that may disable a gate, and these
 * are the gates the owner's second rider explicitly does **not** cover (typecheck, lint, unit tests,
 * build, budget, red lines, schema, docs, the genre audit).
 */
export const NEVER_DISABLED = [
  "check:actions",
  "check:budget",
  "check:docs:refs",
  "check:gs1",
  "check:isolation",
  "check:layers",
  "check:layout",
  "check:mcp",
  "check:covers",
  "data:lint",
  "docs:check",
  "lint",
  "lint:data",
  "redlines",
  "test",
  "typecheck",
  "version:check",
];

/** The entry for a gate id, or `null` — the guard's only question. */
export function disabledGate(id) {
  return DISABLED_GATES.find((gate) => gate.id === id) ?? null;
}

/** The banner a guarded entry point prints instead of running its gate. */
export function disabledGateNotice(entry) {
  return [
    "",
    "════════════════════════════════════════════════════════════════════════════════",
    `⏸  DISABLED GATE — ${entry.id}`,
    "════════════════════════════════════════════════════════════════════════════════",
    `   what        : ${entry.what}`,
    `   why         : ${entry.why}`,
    `   today       : ${entry.todayRed}`,
    `   comes back  : ${entry.returnsWhen}`,
    `   decided by  : ${entry.decidedBy}`,
    `   ledger      : scripts/disabledGates.mjs   (the only place that may disable a gate)`,
    `   long form   : docs/DISABLED_GATES.md`,
    `   run it anyway: DISABLED_GATES_IGNORE=1 (the file and its logic are untouched: ${entry.entry})`,
    "════════════════════════════════════════════════════════════════════════════════",
    "",
  ].join("\n");
}

/**
 * ⭐ **"The disabled set is exactly the ledger" — the criterion, in one place.**
 *
 * Both readers use this function, so the executable check (`npm run check:disabled-gates`, a CI
 * step) and the unit criterion (`src/test/disabledGates.test.ts`) cannot drift into two different
 * opinions:
 *
 *   · every listed gate is wired through the guard in **some** entry point (otherwise the list lies);
 *   · every guard wiring anywhere names a listed gate (otherwise a gate was disabled silently, which
 *     is what the owner's rider must never become);
 *   · `NEVER_DISABLED` is disjoint from the list and still present in the `verify:code` chain;
 *   · every listed gate still exists as a file, is still referenced by CI, and carries the three
 *     facts (why / when / who) in words that name the actual reason.
 *
 * `root` is a parameter so a test can point it at the repository and a future caller at a packed
 * source tree; it defaults to the working directory the gate scripts run from.
 */
export function auditDisabledGates(root = process.cwd()) {
  const problems = [];
  const oks = [];
  /** Entry points that must route every disabled gate through the guard. */
  const entryPoints = ["package.json", "scripts/track.mjs"];
  const wrapped = new Map(); // gate id -> the entry point files that wrap it

  for (const relative of entryPoints) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) {
      problems.push(`${relative} is missing, so it cannot be checked for guard wiring`);
      continue;
    }
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/disabled_gate_guard\.mjs["']?\s*,?\s*["']?([A-Za-z0-9:_-]+)/g)) {
      const id = match[1];
      if (!wrapped.has(id)) wrapped.set(id, []);
      if (!wrapped.get(id).includes(relative)) wrapped.get(id).push(relative);
    }
  }

  const listed = new Set(DISABLED_GATES.map((gate) => gate.id));
  if (listed.size !== DISABLED_GATES.length) problems.push("scripts/disabledGates.mjs lists a gate id twice");

  for (const entry of DISABLED_GATES) {
    for (const field of ["id", "entry", "what", "why", "todayRed", "returnsWhen", "decidedBy"]) {
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        problems.push(`${entry.id ?? "(no id)"} has no ${field}`);
      }
    }
    if (!/catalogue/i.test(entry.why)) problems.push(`${entry.id}: the reason does not name the catalogue, which is the reason`);
    if (!/render/i.test(entry.why)) problems.push(`${entry.id}: the reason does not name the render path it cannot see`);
    if (!/catalogue/i.test(entry.returnsWhen) || !/baseline|re-record/i.test(entry.returnsWhen)) {
      problems.push(`${entry.id}: the return condition must name the catalogue and the baseline`);
    }
    if (!/owner/i.test(entry.decidedBy) || !/2026-10-02/.test(entry.decidedBy)) {
      problems.push(`${entry.id}: the decision is not attributed to the owner on 2026-10-02`);
    }
    if (entry.entry && !fs.existsSync(path.join(root, entry.entry))) {
      problems.push(`${entry.id}: ${entry.entry} does not exist — the gate was deleted rather than disabled`);
    }
    const where = wrapped.get(entry.id);
    if (!where) problems.push(`${entry.id} is listed as disabled but no entry point routes it through ${DISABLED_GATE_GUARD}`);
    else oks.push(`${entry.id} → disabled through the guard in ${where.join(", ")}`);
  }

  for (const [id, where] of wrapped) {
    if (!listed.has(id)) {
      problems.push(`${id} is routed through the guard (${where.join(", ")}) but has no ledger entry — a gate may only be disabled by a ledger entry`);
    }
  }

  for (const id of NEVER_DISABLED) {
    if (listed.has(id)) problems.push(`${id} is in NEVER_DISABLED and must not be in the ledger`);
    if (wrapped.has(id)) problems.push(`${id} is in NEVER_DISABLED but is routed through the guard`);
  }

  const pkgPath = path.join(root, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const scripts = pkg.scripts ?? {};
    const chain = `${scripts.verify ?? ""} ; ${scripts["verify:code"] ?? ""}`;
    const missing = NEVER_DISABLED.filter((id) => typeof scripts[id] !== "string");
    /**
     * "Still runs" is checked against the verify chain **and** the workflow steps: `data:lint` (the
     * genre database audit) is a CI step rather than part of `npm run verify`, and a gate that is
     * moved between the two is not the thing this ledger is about.
     */
    const workflowTextForChain = ["ci.yml", "manual-verify.yml"]
      .map((file) => path.join(root, ".github", "workflows", file))
      .filter((file) => fs.existsSync(file))
      .map((file) => fs.readFileSync(file, "utf8"))
      .join("\n");
    const notInChain = NEVER_DISABLED.filter((id) => !chain.includes(`npm run ${id}`) && !workflowTextForChain.includes(`npm run ${id}`));
    if (missing.length) problems.push(`NEVER_DISABLED scripts missing from package.json: ${missing.join(", ")}`);
    if (notInChain.length) problems.push(`NEVER_DISABLED gates no longer run in the verify chain or in CI: ${notInChain.join(", ")}`);
    if (!missing.length && !notInChain.length) {
      oks.push(`all ${NEVER_DISABLED.length} never-disable gates still exist and still run (verify chain or CI step)`);
    }
    for (const entry of DISABLED_GATES) {
      const run = scripts[entry.id];
      if (typeof run !== "string") problems.push(`npm script ${entry.id} is gone — the gate was deleted rather than disabled`);
      else if (!run.includes(DISABLED_GATE_GUARD)) problems.push(`npm script ${entry.id} does not go through ${DISABLED_GATE_GUARD}`);
    }
  }

  const workflowText = ["ci.yml", "manual-verify.yml"]
    .map((file) => path.join(root, ".github", "workflows", file))
    .filter((file) => fs.existsSync(file))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  for (const entry of DISABLED_GATES) {
    if (!workflowText.includes(`npm run ${entry.id}`)) {
      problems.push(`${entry.id} is no longer invoked by any workflow — CI must still show the step, disabled and explained`);
    }
  }
  const ledgerStep = /check:disabled-gates/.test(workflowText);
  if (!ledgerStep) problems.push("no workflow runs check:disabled-gates, so the ledger is not checked in CI");
  else oks.push("check:disabled-gates runs in CI, beside the steps it judges");

  return { problems, oks, wrapped: [...wrapped.keys()], listed: [...listed] };
}

