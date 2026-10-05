/**
 * 🧾 **Every registered entry is named somewhere in the tests.**
 *
 * The plan's interaction section says a new MCP tool must enter the tests. That is a rule about the surface, so it
 * is checkable directly: take every `name: "…"` the registry declares — the tools, the resources and the prompts,
 * since all three carry the field — and require each to appear in `src/test`. It found one entry nobody named
 * (`import_arrangement_musicxml_file`), whose reader was tested while its own tool wiring was not, and the fix was a
 * criterion that calls that handler rather than a mention.
 *
 * This is deliberately a **name** check: it cannot prove the tool is exercised well, only that adding one without a
 * test stops being invisible. The behaviour of each tool has its own criterion elsewhere.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TEST_FILES = ["mcpTools.test.ts", "mcpArrangement.test.ts", "mcpMxlImportTool.test.ts"];

function registryNames(): string[] {
  const text = readFileSync("mcp/registry.ts", "utf8");
  const names = new Set<string>();
  // The barrel re-exports the modules; read them all so a new tool in any module is covered.
  const modules = [...text.matchAll(/from "\.\/(registry[A-Za-z]*)"/g)].map((match) => `mcp/${match[1]}.ts`);
  for (const file of ["mcp/registry.ts", ...modules]) {
    for (const match of readFileSync(file, "utf8").matchAll(/\n\s*name: "([a-z0-9_]+)",\n\s*(?:title|description):/g)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

/** Every test file's text, which is where a tool must be named. */
function testCorpus(): string {
  return readdirSync("src/test")
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => readFileSync(`src/test/${file}`, "utf8"))
    .join("\n");
}

describe("MCP tool coverage", () => {
  it("⭐ every registered entry is named in a test", () => {
    const corpus = testCorpus();
    const missing = registryNames().filter((name) => !corpus.includes(name));
    expect(missing, `registered but never named in src/test`).toEqual([]);
  });

  it("⭐ still measures, so an empty registry cannot pass quietly", () => {
    const names = registryNames();
    expect({ many: names.length > 80, corpus: testCorpus().length > 100_000 })
      .toEqual({ many: true, corpus: true });
  });
});
