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
