/**
 * **The guard that would have caught 2.34.38, and the trap it must not repeat.**
 *
 * `deploy.mjs` refuses to upload a build whose app cannot reach its samples, because the release that shipped an empty
 * catalogue root passed every other step: the version matched, the covers payload was right, the boot probe passed and
 * the remote matrix was green. Those checks are about a coherent build; this one is about a complete one.
 *
 * ⚠️ **The third case is the one that matters most.** The first attempt at checking the live site looked only at the
 * scripts `index.html` names, found no root, and declared a healthy release broken — because the root lives in a lazy
 * chunk, since only the store that builds sample URLs needs it. A guard that made the same mistake would block a
 * correct release, so the fixture puts the root **in a nested chunk** and requires the verdict to find it.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import { sampleRootVerdict, builtScripts } from "../../scripts/lib/sampleRoot.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dirs: string[] = [];

/** A throwaway build output: `entry.js` plus, optionally, a nested chunk carrying some text. */
function dist({ nestedChunk }: { nestedChunk?: string } = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), "dsh-sampleroot-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  writeFileSync(path.join(dir, "assets", "entry.js"), "console.log('entry, no root here');\n");
  if (nestedChunk !== undefined) {
    mkdirSync(path.join(dir, "assets", "chunks"), { recursive: true });
    writeFileSync(path.join(dir, "assets", "chunks", "arrangementStore-abc.js"), nestedChunk);
  }
  return dir;
}

const REMOTE_ONLY_MANIFEST = JSON.stringify({ version: 1, entries: [{ id: "x", files: [{ path: "a/b.wav" }] }] });
const SELF_CONTAINED_MANIFEST = JSON.stringify({ version: 1, entries: [{ id: "x", files: [{ path: "https://cdn.test/b.wav" }] }] });
const ROOT_VALUE = "https://r2mirror.example.test";

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("the sample-root guard", () => {
  it("refuses a build with no root when the manifest has no absolute addresses of its own", () => {
    const verdict = sampleRootVerdict({ distDir: dist(), envRoot: "", manifestText: REMOTE_ONLY_MANIFEST });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("no sample root is configured");
  });

  it("refuses a build that does not contain the root it was configured with", () => {
    const verdict = sampleRootVerdict({ distDir: dist(), envRoot: ROOT_VALUE, manifestText: REMOTE_ONLY_MANIFEST });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason, "the message must name what is missing").toContain(ROOT_VALUE);
  });

  it("finds the root in a lazy chunk, which is where it really lives", () => {
    const dir = dist({ nestedChunk: `const root = "${ROOT_VALUE}";` });
    expect(builtScripts(dir).length, "the walk must reach nested files").toBeGreaterThan(1);
    expect(sampleRootVerdict({ distDir: dir, envRoot: ROOT_VALUE, manifestText: REMOTE_ONLY_MANIFEST }).ok).toBe(true);
  });

  it("accepts a build with no root when the manifest carries absolute addresses", () => {
    expect(sampleRootVerdict({ distDir: dist(), envRoot: "", manifestText: SELF_CONTAINED_MANIFEST }).ok).toBe(true);
  });

  it("is wired into the deploy path before wrangler runs, which is the only place it can help", () => {
    const deploy = readFileSync(path.join(ROOT, "scripts", "deploy.mjs"), "utf8");
    const guard = deploy.indexOf("sampleRootVerdict(");
    const spawn = deploy.indexOf('spawnSync("npx"');
    expect(guard, "the guard is called").toBeGreaterThan(-1);
    expect(spawn, "the wrangler spawn is present").toBeGreaterThan(-1);
    expect(guard, "and it runs before anything is uploaded").toBeLessThan(spawn);
    expect(deploy, "and it says what it checked, including lazy chunks").toContain("including lazy chunks");
  });
});
