/**
 * The toolchain's Node floor, and the pins that keep CI on it.
 *
 * ## The incident this pins down
 *
 * CI installed and ran on **Node 20** while `jsdom` 30 — the DOM environment every unit test uses —
 * declares `engines.node: ^22.22.2` and vendors `undici` 8, whose `cachestorage.js` calls
 * `webidl.util.markAsUncloneable`. That export does not exist in Node 20, so jsdom could not be
 * constructed: `vitest` reported **190 unhandled errors, no test files and no tests**, coverage came
 * out at 0 %, and the only visible failure was a coverage-threshold message that had nothing to do
 * with the cause.
 *
 * Nothing in the repository connected "the CI Node version" to "what jsdom needs", which is why the
 * job stayed red the moment the dependency was bumped. These assertions make that connection
 * explicit and impossible to lose: `.nvmrc` carries the floor, `package.json#engines` declares it,
 * both CI jobs read it from the file, and `engine-strict` makes an unsupported Node fail at install
 * time with one clear line instead of at test time with 190 confusing ones.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const nvmrc = read(".nvmrc").trim();
const pkg = JSON.parse(read("package.json")) as { engines?: { node?: string } };
const workflow = read(".github/workflows/ci.yml");
const npmrc = read(".npmrc");

describe("toolchain · the pinned Node version", () => {
  it("pins a concrete version, and declares the same floor in engines", () => {
    expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/);
    // The floor is named verbatim so the two cannot drift into "roughly the same".
    expect(pkg.engines?.node ?? "").toContain(nvmrc);
  });

  it("pins the floor jsdom itself requires, which is the reason the floor exists", () => {
    // Read from the installed tree: `npm ci` runs before the tests in CI, so it is always there.
    const jsdomPkg = path.join(ROOT, "node_modules/jsdom/package.json");
    if (!existsSync(jsdomPkg)) return; // a partial install; the workflow check below still holds
    const jsdomEngines = (JSON.parse(readFileSync(jsdomPkg, "utf8")) as { engines?: { node?: string } })
      .engines?.node;
    expect(jsdomEngines ?? "", "jsdom's own floor").toContain(nvmrc);
  });

  it("makes the install itself refuse an unsupported Node", () => {
    // Without this the install succeeds on Node 20 and the failure shows up as 190 unhandled jsdom
    // errors at test time. Verified by hand: with an impossible `engines` value, `npm install
    // --engine-strict` exits EBADENGINE.
    expect(npmrc).toMatch(/^\s*engine-strict\s*=\s*true\s*$/m);
  });
});

describe("toolchain · CI cannot hardcode a different Node", () => {
  it("takes the version from .nvmrc in every job", () => {
    const setups = workflow.match(/node-version-file:\s*"\.nvmrc"/g) ?? [];
    expect(setups.length, "one Setup Node.js step per job").toBeGreaterThanOrEqual(2);
  });

  it("does not also hardcode a node-version anywhere", () => {
    // `node-version:` next to `node-version-file:` is ambiguous, and a literal 20 is exactly the
    // incident this file exists for.
    expect(workflow).not.toMatch(/^\s*node-version:/m);
  });
});

/**
 * The *action* runtime is a second, separate Node version.
 *
 * GitHub runs each `uses:` action with the Node runtime that action declares, not the one
 * `Setup Node.js` installed. On 2025-09-19 GitHub deprecated Node 20 for that runtime: the v4 tags of
 * the first-party actions still target it, so runners force them onto Node 24 and warn on every run.
 * `.nvmrc` says nothing about this axis, which is why it needs its own assertion — the same shape of
 * gap that produced G.49, one layer lower.
 */
describe("toolchain · the action runtime is not the deprecated Node 20", () => {
  /** First major of each action that runs on the Node 24 runtime; mirrors the gate script's table. */
  const NODE24_FIRST_MAJOR: Record<string, number> = {
    "actions/checkout": 5,
    "actions/setup-node": 5,
    "actions/upload-artifact": 5,
    "actions/download-artifact": 5,
  };

  it("uses a Node 24 major for every first-party action", () => {
    const uses = [...workflow.matchAll(/uses:\s*([\w.-]+\/[\w.-]+)@(v?\d+)/g)].map((m) => ({
      action: m[1],
      major: Number(m[2].replace(/^v/, "")),
    }));
    const judged = uses.filter((u) => NODE24_FIRST_MAJOR[u.action] !== undefined);
    // Fail-ability first: if the regex or the workflow stops matching, the assertions below are empty.
    expect(judged.length, "at least the checkout/setup-node pair in each job").toBeGreaterThanOrEqual(2);
    for (const use of judged) {
      expect(
        use.major,
        `${use.action}@v${use.major} targets the deprecated Node 20 action runtime`
      ).toBeGreaterThanOrEqual(NODE24_FIRST_MAJOR[use.action]);
    }
  });

  it("keeps the repository gate for it, wired into verify", () => {
    const scripts = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(scripts.scripts?.["check:actions"], "the check:actions script").toContain(
      "check_actions_runtime.mjs"
    );
    expect(scripts.scripts?.verify ?? "").toContain("check:actions");
    // The script must know about every action the table above judges, or the two would drift and the
    // gate would quietly stop covering the action this test still checks.
    const gate = read("scripts/check_actions_runtime.mjs");
    for (const action of Object.keys(NODE24_FIRST_MAJOR)) {
      expect(gate, `the gate's table must list ${action}`).toContain(`"${action}"`);
    }
  });
});
