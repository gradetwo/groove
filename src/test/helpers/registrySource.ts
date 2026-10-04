/**
 * ⭐ The MCP registry surface, wherever the definitions now live.
 *
 * The registry used to be one file, so a criterion could read `mcp/registry.ts` and assert that a
 * tool, a sentence or a schema field was declared in it. It is twelve modules now — the arrangement,
 * song, GS-1, render, files, library, pattern, project, analysis and example families, plus the
 * toolkit and the barrel — and sixty-five criteria were still reading the one file, which is why a
 * refactor that changed no surface at all turned sixty-six test files red.
 *
 * These criteria mean "the surface declares this", not "this particular file says it", so they ask
 * the surface — the domain modules **and the shared head they all import**, `toolKit.ts`, because the
 * sentences and schemas a tool's description depends on live there. Whitespace and file order are stable: the modules are sorted and joined with a
 * newline, and anything asserting `includes(...)` or a regex over the whole text is unaffected.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function registrySource(): string {
  return readdirSync("mcp")
    .filter((name) => /^registry.*\.ts$/.test(name) || name === "toolKit.ts")
    .sort()
    .map((name) => readFileSync(join("mcp", name), "utf8"))
    .join("\n");
}
