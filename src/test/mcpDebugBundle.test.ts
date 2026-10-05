import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectDebugBundle } from "../../mcp/debugBundle";

/**
 * ⭐ **The bundle is sent without being read first, so these are safety criteria as much as shape ones.**
 *
 * A bundle that carried a home directory path or a token would be unsafe to send, which is the whole point of collecting a
 * whitelist rather than dumping the environment.
 */
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

  it("writes one self-describing file, and its byte count is the file's own size", () => {
    const result = collectDebugBundle({ outputDir: freshDir(), note: "a render stopped" });
    expect(path.isAbsolute(result.path)).toBe(true);
    expect(path.basename(result.path)).toBe(result.filename);
    const text = readFileSync(result.path, "utf8");
    expect(result.bytes).toBe(Buffer.byteLength(text));
    expect(statSync(result.path).size).toBe(result.bytes);

    const bundle = JSON.parse(text);
    expect(bundle.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(bundle.surface.tools).toBeGreaterThan(50);
    expect(bundle.manifest.length).toBeGreaterThan(3);
    expect(bundle.omissions.length).toBeGreaterThan(0);
    expect(bundle.note).toBe("a render stopped");
  });

  it("carries no home path, no secret and no environment dump", () => {
    const text = readFileSync(collectDebugBundle({ outputDir: freshDir() }).path, "utf8");
    expect(text).not.toContain(os.homedir());
    for (const word of ["token", "secret", "password", "apikey", "authorization"]) {
      expect(text.toLowerCase(), word).not.toContain(word);
    }
    expect(Object.keys(JSON.parse(text).env)).toEqual(["GROOVE_MCP_OUT"]);
  });
});
