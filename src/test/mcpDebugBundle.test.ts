import { gunzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEBUG_BUNDLE_FILE_LIMIT, collectDebugBundle } from "../../mcp/debugBundle";
import { readTar } from "../features/debug/tar";
import { TOOLS } from "../../mcp/registry";

// ⭐ These are the criteria for `collect_debug_bundle`, named here so the coverage check finds it.
describe("MCP · the debug bundle", () => {
  const dirs: string[] = [];
  const freshDir = () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "groove-debug-criterion-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });
  const unpack = (file: string) => readTar(new Uint8Array(gunzipSync(readFileSync(file))));
  const textOf = (file: string, name: string) =>
    new TextDecoder().decode(unpack(file).find((entry) => entry.name === name)!.bytes);

  it("writes one compressed archive, and its byte count is the file's own size", () => {
    const result = collectDebugBundle({ outputDir: freshDir(), note: "a render stopped" });
    expect(path.isAbsolute(result.path)).toBe(true);
    expect(result.filename).toMatch(/^groove-debug-.+\.tar\.gz$/);
    expect(result.bytes).toBe(statSync(result.path).size);

    const names = unpack(result.path).map((entry) => entry.name);
    for (const expected of ["bundle.json", "environment.json", "README.md", "manifest.json"]) {
      expect(names, expected).toContain(expected);
    }
    expect(JSON.parse(textOf(result.path, "bundle.json")).note).toBe("a render stopped");
  });

  it("carries the work when given it, and says so in the readme", () => {
    const result = collectDebugBundle({ outputDir: freshDir(), arrangement: { id: "a1", tracks: [] } });
    expect(result.carriesWork).toBe(true);
    expect(result.entries).toContain("arrangement.groove.json");
    const readme = textOf(result.path, "README.md");
    expect(readme).toContain("carries the work itself");
    expect(textOf(result.path, "arrangement.groove.json")).toContain('"a1"');
  });

  it("names an oversize file rather than cutting it, and stays under the ceiling", () => {
    const big = new Uint8Array(DEBUG_BUNDLE_FILE_LIMIT + 1);
    const result = collectDebugBundle({ outputDir: freshDir(), files: [{ name: "huge.wav", bytes: big }] });
    expect(result.entries).not.toContain("files/huge.wav");
    expect(result.omitted.join(" ")).toContain("huge.wav");
    expect(result.omitted.join(" ")).toContain("above the");
  });

  it("carries no home path, no secret and no dump of the environment", () => {
    const result = collectDebugBundle({ outputDir: freshDir() });
    const all = unpack(result.path).map((entry) => new TextDecoder().decode(entry.bytes)).join("\n");
    expect(all).not.toContain(os.homedir());
    for (const word of ["token", "secret", "password", "apikey", "authorization"]) {
      expect(all.toLowerCase(), word).not.toContain(word);
    }
    expect(Object.keys(JSON.parse(textOf(result.path, "environment.json")))).toEqual(["GROOVE_MCP_OUT"]);
  });

  it("declares the arrangement input, so an archive can carry the work it came from", () => {
    const tool = TOOLS.find((candidate) => candidate.name === "collect_debug_bundle");
    expect(tool, "collect_debug_bundle is not declared").toBeTruthy();
    expect(Object.keys(tool!.inputSchema as Record<string, unknown>)).toContain("arrangementId");
  });
});
