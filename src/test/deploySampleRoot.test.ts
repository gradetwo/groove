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
import { clipManifestVerdict } from "../../scripts/lib/clipManifest.mjs";
import { existsSync } from "node:fs";

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

/**
 * ⭐ **And the same guard for the phone shell's clips — the release that got past the check above.**
 *
 * `v2.37.6` (`68b6407`, 2026-10-12) re-stamped all 159 clip URLs with the base `https://r2mirror.wangda.today`; the
 * mirror is `https://r2mirror.groove.wangda.today`, and the wrong host does not resolve at all. Every step passed —
 * including the sample-root guard, because that one reads `public/samples/manifest.json`, whose paths come from
 * upstream source repositories and never name this mirror. The phone shell shipped 159 dead URLs and the only symptom
 * was silence.
 *
 * The manifest is *generated* with `--base`, so the failure mode is a wrong base in a release commit, and the way to
 * make that impossible is to compare it against the root the build inlines.
 */
const WRONG_MIRROR = "https://r2mirror.wangda.today";

const clipManifest = (host: string): string =>
  JSON.stringify({ bars: 8, clips: [{ genreId: "chicago-house", url: `${host}/clips/chicago-house.mp3` }] });

/** The root the build would inline, from the environment or the gitignored local env file. */
function configuredRoot(): string {
  const fromEnv = (process.env.VITE_SAMPLE_ROOT ?? "").trim();
  if (fromEnv) return fromEnv;
  if (!existsSync(path.join(ROOT, ".env.local"))) return "";
  const line = readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .find((candidate) => candidate.startsWith("VITE_SAMPLE_ROOT="));
  return line ? line.slice("VITE_SAMPLE_ROOT=".length).trim() : "";
}

describe("the clip-manifest guard", () => {
  it("⭐ refuses the manifest that shipped: a host other than the configured mirror", () => {
    const verdict = clipManifestVerdict({ manifestText: clipManifest(WRONG_MIRROR), root: ROOT_VALUE });
    expect(verdict.ok, "the broken manifest must be refused").toBe(false);
    expect(verdict.reason, "the message names the host it found").toContain(WRONG_MIRROR);
    expect(verdict.reason, "and the host it wanted").toContain(ROOT_VALUE);
    expect(verdict.reason, "and says how to repair it rather than leaving 159 lines by hand").toContain("--base");
  });

  it("accepts a manifest whose clips live at the configured mirror", () => {
    expect(clipManifestVerdict({ manifestText: clipManifest(ROOT_VALUE), root: ROOT_VALUE }).ok).toBe(true);
  });

  it("does not care about the path under the root, only the origin", () => {
    const moved = JSON.stringify({ clips: [{ url: `${ROOT_VALUE}/audio/2026/chicago-house.mp3` }] });
    expect(clipManifestVerdict({ manifestText: moved, root: ROOT_VALUE }).ok).toBe(true);
  });

  it("refuses a manifest it cannot read, and one with no clips", () => {
    expect(clipManifestVerdict({ manifestText: "{ not json", root: ROOT_VALUE }).ok).toBe(false);
    expect(clipManifestVerdict({ manifestText: JSON.stringify({ clips: [] }), root: ROOT_VALUE }).ok).toBe(false);
    expect(clipManifestVerdict({ manifestText: clipManifest(ROOT_VALUE), root: "" }).ok).toBe(false);
  });

  it("⭐ the manifest in this working tree really does point at the configured mirror", () => {
    const root = configuredRoot();
    const text = readFileSync(path.join(ROOT, "public", "genre-clips.json"), "utf8");
    const hosts = [...new Set((JSON.parse(text).clips ?? []).map((clip: { url: string }) => new URL(clip.url).host))];
    expect(hosts, "159 clips across more than one host is already a bug").toHaveLength(1);
    if (root) {
      expect(clipManifestVerdict({ manifestText: text, root }).ok, `the shipped clips must live at ${root}`).toBe(true);
    }
  });

  it("is wired into the deploy path before wrangler runs", () => {
    const deploy = readFileSync(path.join(ROOT, "scripts", "deploy.mjs"), "utf8");
    const guard = deploy.indexOf("clipManifestVerdict(");
    const spawn = deploy.indexOf('spawnSync("npx"');
    expect(guard, "the guard is called").toBeGreaterThan(-1);
    expect(guard, "and it runs before anything is uploaded").toBeLessThan(spawn);
  });
});
