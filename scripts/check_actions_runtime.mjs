#!/usr/bin/env node
/**
 * GitHub Actions runtime gate.
 *
 * The runner executes each `uses:` action with the Node runtime the action *itself* declares, not
 * with the Node version the workflow installed. On 2025-09-19 GitHub deprecated Node 20 for that
 * runtime: v4 of the first-party actions still target Node 20, and runners now force them onto Node
 * 24 and print a deprecation warning on every run. The warning is the cheap half of the problem —
 * the expensive half is that a deprecated runtime eventually stops being forced and starts failing.
 *
 * This is a **different** Node version from the project's own floor (`.nvmrc` / `engines` /
 * `engine-strict`, see `scripts/check_node_version.mjs`): that one decides which Node runs `npm test`,
 * this one decides what runs `actions/checkout`.
 *
 * The gate is a file read with no network access, so it can run in `verify` and in CI. It checks only
 * the actions listed in `NODE24_FIRST_MAJOR` — a table, not a heuristic: an action whose Node 24
 * major we have not confirmed is reported as unchecked rather than guessed at, and one checked action
 * is required so the gate cannot pass by finding nothing.
 *
 *   node scripts/check_actions_runtime.mjs
 *   node scripts/check_actions_runtime.mjs --dir=.github/workflows
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

/**
 * First major version of each action that runs on the Node 24 action runtime.
 *
 * Only actions whose Node 24 major has actually been released are listed; keep this table honest by
 * adding an entry only when the major exists (the value is the *minimum* acceptable major).
 */
const NODE24_FIRST_MAJOR = new Map([
  ["actions/checkout", 5],
  ["actions/setup-node", 5],
  ["actions/upload-artifact", 5],
  ["actions/download-artifact", 5],
]);

const workflowsDir = path.resolve(ROOT, argValue("--dir", ".github/workflows"));
if (!fs.existsSync(workflowsDir)) {
  console.error(`❌ no workflows directory: ${path.relative(ROOT, workflowsDir)}`);
  process.exit(1);
}

const files = fs
  .readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort();

const problems = [];
const oks = [];
const unchecked = [];
let checked = 0;

for (const file of files) {
  const rel = path.relative(ROOT, path.join(workflowsDir, file));
  const lines = fs.readFileSync(path.join(workflowsDir, file), "utf8").split("\n");
  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)\s*$/);
    if (!match) return;
    const ref = match[1];
    if (ref.startsWith("./")) return;
    const at = ref.lastIndexOf("@");
    if (at === -1) {
      problems.push(`${rel}:${index + 1} uses "${ref}" without a version`);
      return;
    }
    const action = ref.slice(0, at);
    const version = ref.slice(at + 1);
    const minimum = NODE24_FIRST_MAJOR.get(action);
    if (minimum === undefined) {
      unchecked.push(`${rel}:${index + 1} ${action}@${version}`);
      return;
    }
    if (/^[0-9a-f]{40}$/.test(version)) {
      // A full SHA is accepted (it is the most reproducible form) but cannot be judged here; the
      // summary says so rather than pretending the check covered it.
      unchecked.push(`${rel}:${index + 1} ${action}@<sha>`);
      return;
    }
    const major = Number((version.match(/^v?(\d+)/) || [])[1]);
    if (!Number.isFinite(major)) {
      problems.push(`${rel}:${index + 1} cannot read a major version from "${ref}"`);
      return;
    }
    checked += 1;
    if (major < minimum) {
      problems.push(
        `${rel}:${index + 1} ${action}@${version} targets the deprecated Node 20 action runtime ` +
          `(needs @v${minimum} or newer)`
      );
    } else {
      oks.push(`${rel}:${index + 1} ${action}@${version}`);
    }
  });
}

console.log("===============================================================");
console.log("  ⚙️  GITHUB ACTIONS RUNTIME GATE");
console.log("===============================================================");
for (const line of oks) console.log(`✅ ${line}`);
for (const line of unchecked) console.log(`ℹ️  not in the Node 24 table, not judged: ${line}`);
if (checked === 0) {
  // A gate that finds nothing must not look green: the whole point is to catch a downgrade.
  problems.push("no workflow used an action from the Node 24 table — the gate checked nothing");
}

if (problems.length > 0) {
  console.error("");
  for (const problem of problems) console.error(`❌ ${problem}`);
  console.error(
    "\n   GitHub forces Node 20 actions onto Node 24 and warns; that runtime will eventually stop\n" +
      "   being forced. Bump the action to its Node 24 major instead."
  );
  process.exit(1);
}

console.log("");
console.log(`✅ ${checked} action use(s) on a Node 24 runtime (${files.length} workflow file(s)).`);
